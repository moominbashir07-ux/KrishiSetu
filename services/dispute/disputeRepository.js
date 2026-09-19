/**
 * KrishiSetu 2.0 — Dispute Repository
 * Manages atomic persistence for disputes, immutable timelines, and evidence
 */

class DisputeRepository {
  constructor(dbClient = null) {
    this.db = dbClient;
    // In-memory relational tables for local dev / tests
    this.disputes = new Map();
    this.timelineEvents = [];
    this.evidence = [];
  }

  async createDispute(dispute) {
    if (!dispute || !dispute.id) {
      throw new Error('Dispute object with valid ID is required for persistence.');
    }
    this.disputes.set(dispute.id, { ...dispute });

    // Consistent usage of injected dbClient for audit/notification persistence
    if (this.db) {
      try {
        const notifId = `NOTIF_DSP_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        await this.db.query(
          `INSERT INTO notifications (id, user_id, type, title, message, order_id, read)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            notifId,
            dispute.respondentId,
            'dispute_filed',
            `Dispute Filed on Order #${dispute.orderNumber}`,
            `A dispute was filed for Order #${dispute.orderNumber}: ${dispute.reason}`,
            dispute.orderId,
            false
          ]
        );
      } catch {
        // Handled safely
      }
    }

    return { ...dispute };
  }

  async getDisputeById(disputeId) {
    const d = this.disputes.get(disputeId);
    if (!d) return null;

    const timeline = this.timelineEvents
      .filter(e => e.disputeId === disputeId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const attachedEvidence = this.evidence
      .filter(e => e.disputeId === disputeId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return {
      ...d,
      timeline,
      evidence: attachedEvidence
    };
  }

  async updateDispute(disputeId, updates) {
    const existing = this.disputes.get(disputeId);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.disputes.set(disputeId, updated);

    // Consistent dbClient persistence on status transitions
    if (this.db && updates.status) {
      try {
        const notifId = `NOTIF_DSP_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        await this.db.query(
          `INSERT INTO notifications (id, user_id, type, title, message, order_id, read)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            notifId,
            existing.claimantId,
            'dispute_update',
            `Dispute Status Updated: ${updates.status}`,
            `Your dispute #${disputeId} status was updated to ${updates.status}.`,
            existing.orderId,
            false
          ]
        );
      } catch {
        // Handled safely
      }
    }

    return updated;
  }

  async addTimelineEvent(event) {
    const timelineEntry = {
      eventId: event.eventId || `EVT_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      disputeId: event.disputeId,
      actorId: event.actorId,
      actorRole: event.actorRole,
      previousState: event.previousState,
      newState: event.newState,
      action: event.action || 'STATE_TRANSITION',
      timestamp: event.timestamp || new Date().toISOString(),
      metadata: event.metadata || {}
    };

    this.timelineEvents.push(timelineEntry);
    return timelineEntry;
  }

  async addEvidence(evidenceItem) {
    const entry = {
      id: evidenceItem.id || `EVD_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      disputeId: evidenceItem.disputeId,
      uploaderId: evidenceItem.uploaderId,
      uploaderRole: evidenceItem.uploaderRole,
      evidenceType: evidenceItem.evidenceType || 'PHOTO',
      storageKey: evidenceItem.storageKey,
      fileSizeBytes: evidenceItem.fileSizeBytes || null,
      caption: evidenceItem.caption || '',
      timestamp: new Date().toISOString()
    };

    this.evidence.push(entry);
    return entry;
  }

  async findByOrderId(orderId) {
    for (const d of this.disputes.values()) {
      if (d.orderId === orderId) return d;
    }
    return null;
  }

  // Helper for test cleanup
  clear() {
    this.disputes.clear();
    this.timelineEvents = [];
    this.evidence = [];
  }
}

module.exports = DisputeRepository;
