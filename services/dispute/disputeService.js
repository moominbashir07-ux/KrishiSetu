/**
 * KrishiSetu 2.0 — Dispute Service
 * Core business orchestrator enforcing 48h delivery window, evidence ledger & state transitions
 */

const { DisputeStateMachine } = require('./disputeStateMachine');
const DisputeRepository = require('./disputeRepository');

const INSPECTION_WINDOW_HOURS = 48;

class DisputeService {
  constructor(repository = null, dbClient = null) {
    this.repo = repository || new DisputeRepository(dbClient);
    this.db = dbClient;
  }

  /**
   * Authoritatively checks the 48-hour post-delivery inspection window.
   * @param {Object} order
   * @param {Date} [serverNow=new Date()]
   */
  checkInspectionWindow(order, serverNow = new Date()) {
    if (!order) {
      const err = new Error('Associated order not found.');
      err.code = 'ORDER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const eligibleStatuses = new Set(['Completed', 'Ready', 'Delivered', 'delivered', 'completed']);
    if (!eligibleStatuses.has(order.status)) {
      const err = new Error(`Order #${order.order_number || order.id} is currently "${order.status}". Quality disputes can only be filed after delivery is confirmed.`);
      err.code = 'ORDER_NOT_DELIVERED';
      err.statusCode = 400;
      throw err;
    }

    // Determine delivery timestamp authoritatively from order records
    const deliveredTimeStr = order.delivered_at || order.updated_at || order.created_at;
    const deliveredAt = new Date(deliveredTimeStr);

    if (isNaN(deliveredAt.getTime())) {
      const err = new Error('Invalid delivery timestamp on order record.');
      err.code = 'INVALID_DELIVERY_TIMESTAMP';
      err.statusCode = 500;
      throw err;
    }

    const diffHours = (serverNow.getTime() - deliveredAt.getTime()) / (1000 * 60 * 60);
    if (diffHours > INSPECTION_WINDOW_HOURS) {
      const err = new Error(`The 48-hour inspection window has expired (${diffHours.toFixed(1)} hours elapsed since delivery). Dispute filing is closed.`);
      err.code = 'DISPUTE_WINDOW_EXPIRED';
      err.statusCode = 400;
      throw err;
    }

    return {
      deliveredAt: deliveredAt.toISOString(),
      hoursElapsed: Number(diffHours.toFixed(1)),
      hoursRemaining: Number(Math.max(0, INSPECTION_WINDOW_HOURS - diffHours).toFixed(1))
    };
  }

  /**
   * Files a formal dispute against a delivered order.
   */
  async createDispute({ orderId, buyerId, buyerRole = 'customer', reason, description, claimedCondition = '', evidenceKeys = [] }, orderLookupFn = null) {
    // 1. Validate reason
    const cleanReason = String(reason || '').trim().toUpperCase();
    if (!DisputeStateMachine.isValidReason(cleanReason)) {
      const err = new Error(`Invalid dispute reason "${reason}". Allowed reasons: QUALITY_MISMATCH, WRONG_GRADE, DAMAGED_PRODUCE, QUANTITY_SHORTAGE, NON_DELIVERY.`);
      err.code = 'INVALID_DISPUTE_REASON';
      err.statusCode = 400;
      throw err;
    }

    // 2. Validate description
    if (!description || typeof description !== 'string' || description.trim().length < 10) {
      const err = new Error('Dispute description is required and must contain at least 10 characters explaining the defect.');
      err.code = 'INVALID_DISPUTE_DESCRIPTION';
      err.statusCode = 400;
      throw err;
    }

    // 3. Fetch order
    let order = null;
    if (orderLookupFn) {
      order = await orderLookupFn(orderId);
    } else if (this.db) {
      const res = await this.db.query('SELECT * FROM orders WHERE id = $1', [orderId]);
      order = res.rows && res.rows[0];
    }

    if (!order) {
      const err = new Error(`Order #${orderId} was not found.`);
      err.code = 'ORDER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    // 4. Verify buyer owns this order (IDOR shield)
    if (order.customer_id && order.customer_id !== buyerId && buyerRole !== 'admin') {
      const err = new Error('Unauthorized: You can only raise a dispute for orders you personally placed.');
      err.code = 'UNAUTHORIZED_DISPUTE_FILING';
      err.statusCode = 403;
      throw err;
    }

    // 5. Duplicate check
    const existingDispute = await this.repo.findByOrderId(orderId);
    if (existingDispute && existingDispute.status !== 'CANCELLED') {
      const err = new Error(`A dispute (ID: ${existingDispute.id}) is already active for Order #${orderId}.`);
      err.code = 'DISPUTE_ALREADY_EXISTS';
      err.statusCode = 409;
      throw err;
    }

    // Backend-enforced 48-hour inspection window
    const windowMeta = this.checkInspectionWindow(order);

    const disputeId = `DSP_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    const dispute = {
      id: disputeId,
      orderId: order.id,
      orderNumber: order.order_number || order.id,
      claimantId: buyerId,
      respondentId: order.seller_id,
      reason: cleanReason,
      description: description.trim(),
      claimedCondition: String(claimedCondition || '').trim(),
      declaredGradeSnapshot: order.declared_grade || 'Grade A',
      status: 'OPEN',
      windowMeta,
      createdAt: now,
      updatedAt: now
    };

    await this.repo.createDispute(dispute);

    // Record initial immutable timeline event
    await this.repo.addTimelineEvent({
      disputeId,
      actorId: buyerId,
      actorRole: buyerRole,
      previousState: null,
      newState: 'OPEN',
      action: 'DISPUTE_FILED',
      metadata: {
        reason: cleanReason,
        windowMeta
      }
    });

    // Attach initial photo/document evidence
    if (Array.isArray(evidenceKeys) && evidenceKeys.length > 0) {
      for (const s3Key of evidenceKeys) {
        await this.repo.addEvidence({
          disputeId,
          uploaderId: buyerId,
          uploaderRole: buyerRole,
          evidenceType: String(s3Key).endsWith('.pdf') ? 'INVOICE' : 'PHOTO',
          storageKey: s3Key,
          caption: 'Initial buyer complaint evidence'
        });
      }
    }

    return this.repo.getDisputeById(disputeId);
  }

  /**
   * Retrieves dispute with chronological evidence timeline.
   */
  async getDispute(disputeId, user) {
    const dispute = await this.repo.getDisputeById(disputeId);
    if (!dispute) {
      const err = new Error(`Dispute #${disputeId} not found.`);
      err.code = 'DISPUTE_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    // IDOR Check: user must be claimant, respondent, or admin
    if (user && user.role !== 'admin' && dispute.claimantId !== user.id && dispute.respondentId !== user.id) {
      const err = new Error('Access forbidden: You do not have permission to inspect this dispute.');
      err.code = 'FORBIDDEN_DISPUTE_ACCESS';
      err.statusCode = 403;
      throw err;
    }

    return dispute;
  }

  /**
   * Seller response to an open dispute.
   */
  async respondToDispute(disputeId, sellerId, sellerRole = 'seller', { responseNotes, offerType = 'PARTIAL_REFUND', offerAmount = null, counterEvidenceKeys = [] }) {
    const dispute = await this.repo.getDisputeById(disputeId);
    if (!dispute) {
      const err = new Error(`Dispute #${disputeId} not found.`);
      err.code = 'DISPUTE_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (dispute.respondentId !== sellerId && sellerRole !== 'admin') {
      const err = new Error('Access forbidden: Only the assigned seller can respond to this dispute.');
      err.code = 'FORBIDDEN_SELLER_RESPONSE';
      err.statusCode = 403;
      throw err;
    }

    // Validate state machine progression
    DisputeStateMachine.validateTransition(dispute.status, 'SELLER_RESPONDED');

    const resolutionOffer = {
      offerType,
      offerAmount: offerAmount ? Number(offerAmount) : null,
      responseNotes: String(responseNotes || '').trim(),
      offeredAt: new Date().toISOString()
    };

    const updated = await this.repo.updateDispute(disputeId, {
      status: 'SELLER_RESPONDED',
      resolutionOffer
    });

    await this.repo.addTimelineEvent({
      disputeId,
      actorId: sellerId,
      actorRole: sellerRole,
      previousState: dispute.status,
      newState: 'SELLER_RESPONDED',
      action: 'SELLER_PROPOSED_RESOLUTION',
      metadata: resolutionOffer
    });

    if (Array.isArray(counterEvidenceKeys) && counterEvidenceKeys.length > 0) {
      for (const s3Key of counterEvidenceKeys) {
        await this.repo.addEvidence({
          disputeId,
          uploaderId: sellerId,
          uploaderRole: sellerRole,
          evidenceType: 'PHOTO',
          storageKey: s3Key,
          caption: 'Seller counter-evidence / dispatch proof'
        });
      }
    }

    return this.repo.getDisputeById(disputeId);
  }

  /**
   * Attaches evidence item to a dispute.
   */
  async attachEvidence(disputeId, user, { storageKey, evidenceType = 'PHOTO', caption = '', fileSizeBytes = null }) {
    const dispute = await this.repo.getDisputeById(disputeId);
    if (!dispute) {
      const err = new Error(`Dispute #${disputeId} not found.`);
      err.code = 'DISPUTE_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    if (user.role !== 'admin' && dispute.claimantId !== user.id && dispute.respondentId !== user.id) {
      const err = new Error('Unauthorized: Cannot attach evidence to an unrelated dispute.');
      err.code = 'FORBIDDEN_EVIDENCE_ATTACHMENT';
      err.statusCode = 403;
      throw err;
    }

    if (!storageKey || typeof storageKey !== 'string') {
      const err = new Error('Valid storageKey reference is required.');
      err.code = 'INVALID_STORAGE_KEY';
      err.statusCode = 400;
      throw err;
    }

    const evidenceEntry = await this.repo.addEvidence({
      disputeId,
      uploaderId: user.id,
      uploaderRole: user.role,
      evidenceType,
      storageKey,
      fileSizeBytes,
      caption: String(caption || '').trim()
    });

    await this.repo.addTimelineEvent({
      disputeId,
      actorId: user.id,
      actorRole: user.role,
      previousState: dispute.status,
      newState: dispute.status,
      action: 'EVIDENCE_ATTACHED',
      metadata: { evidenceId: evidenceEntry.id, storageKey }
    });

    return evidenceEntry;
  }

  /**
   * Formal resolution or rejection of a dispute.
   */
  async resolveDispute(disputeId, user, { resolutionStatus = 'RESOLVED', resolutionNotes = '' }) {
    if (!user || !user.id) {
      const err = new Error('Authentication required to resolve dispute.');
      err.code = 'UNAUTHORIZED';
      err.statusCode = 401;
      throw err;
    }

    if (user.role !== 'admin') {
      const err = new Error('Unauthorized: Only platform administrators can formally resolve or reject disputes.');
      err.code = 'UNAUTHORIZED_DISPUTE_RESOLUTION';
      err.statusCode = 403;
      throw err;
    }

    if (!disputeId || typeof disputeId !== 'string') {
      const err = new Error('Valid dispute ID is required.');
      err.code = 'INVALID_DISPUTE_ID';
      err.statusCode = 400;
      throw err;
    }

    const dispute = await this.repo.getDisputeById(disputeId);
    if (!dispute) {
      const err = new Error(`Dispute #${disputeId} not found.`);
      err.code = 'DISPUTE_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const terminalStatuses = new Set(['RESOLVED', 'REJECTED', 'CANCELLED']);
    if (terminalStatuses.has(dispute.status)) {
      const err = new Error(`Dispute #${disputeId} is already in terminal state "${dispute.status}" and cannot be resolved again.`);
      err.code = 'DISPUTE_ALREADY_TERMINAL';
      err.statusCode = 400;
      throw err;
    }

    const targetStatus = String(resolutionStatus).trim().toUpperCase();
    if (targetStatus !== 'RESOLVED' && targetStatus !== 'REJECTED') {
      const err = new Error('Final resolution status must be either RESOLVED or REJECTED.');
      err.code = 'INVALID_RESOLUTION_STATUS';
      err.statusCode = 400;
      throw err;
    }

    // Validate state machine transition
    DisputeStateMachine.validateTransition(dispute.status, targetStatus);

    await this.repo.updateDispute(disputeId, {
      status: targetStatus,
      resolutionNotes: String(resolutionNotes || '').trim(),
      resolvedAt: new Date().toISOString(),
      resolvedBy: user.id
    });

    await this.repo.addTimelineEvent({
      disputeId,
      actorId: user.id,
      actorRole: user.role,
      previousState: dispute.status,
      newState: targetStatus,
      action: targetStatus === 'RESOLVED' ? 'DISPUTE_RESOLVED' : 'DISPUTE_REJECTED',
      metadata: { resolutionNotes }
    });

    return this.repo.getDisputeById(disputeId);
  }

  /**
   * Generates a neutral, non-binding AI summary for a dispute without mutating state.
   * Authorized for claimant, respondent, or admin.
   */
  async generateAiSummary(disputeId, user, bedrockService = null) {
    const dispute = await this.getDispute(disputeId, user);

    let order = null;
    if (this.db && dispute.orderId) {
      try {
        const oRes = await this.db.query('SELECT * FROM orders WHERE id = $1', [dispute.orderId]);
        order = oRes.rows && oRes.rows[0];
      } catch (e) {
        // safe fallback
      }
    }

    const { BedrockAdvisorService } = require('../ai/bedrockAdvisorService');
    const aiService = bedrockService || new BedrockAdvisorService();

    const orderInfo = {
      id: dispute.orderId,
      orderNumber: dispute.orderNumber || (order ? order.order_number : dispute.orderId),
      commodity: order ? (order.commodity || order.product_name) : 'Agricultural Produce',
      totalAmount: order ? order.total_amount : 0
    };

    const sellerClaim = {
      declaredGrade: dispute.sellerClaimedGrade || 'Standard Grade',
      gradeCriteria: dispute.sellerCriteria || 'Standard specification',
      evidenceCount: (dispute.evidence || []).filter(e => e.uploaderRole === 'seller').length
    };

    const buyerComplaint = {
      reason: dispute.reason,
      description: dispute.description,
      claimedCondition: dispute.claimedCondition,
      evidenceCount: (dispute.evidence || []).filter(e => e.uploaderRole === 'buyer' || e.uploaderRole === 'customer').length
    };

    const aiRes = await aiService.summarizeDispute({
      disputeId,
      orderInfo,
      sellerClaim,
      buyerComplaint,
      timeline: dispute.timeline
    });

    return {
      disputeId,
      status: dispute.status,
      nonBinding: true,
      aiSummary: aiRes.data.summaryText,
      modelId: aiRes.data.modelId,
      isMock: aiRes.data.isMock,
      generatedAt: new Date().toISOString(),
      label: 'AI-GENERATED SUMMARY (NON-BINDING)',
      disclaimer: aiRes.data.disclaimer
    };
  }
}

module.exports = {
  DisputeService,
  INSPECTION_WINDOW_HOURS
};
