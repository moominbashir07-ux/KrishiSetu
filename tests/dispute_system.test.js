/**
 * KrishiSetu 2.0 — Dispute System & 48-Hour Inspection Window Test Suite
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { DisputeService } = require('../services/dispute/disputeService');
const { DisputeStateMachine } = require('../services/dispute/disputeStateMachine');
const DisputeRepository = require('../services/dispute/disputeRepository');

describe('Dispute System — 48h Window, Transitions & Evidence Ledger', () => {
  const repo = new DisputeRepository();
  const disputeService = new DisputeService(repo);

  const mockOrderDeliveredRecent = {
    id: 'ORD_101',
    order_number: 'KS-2026-101',
    customer_id: 'CUST_A',
    seller_id: 'SELLER_X',
    status: 'Completed',
    delivered_at: new Date(Date.now() - 6 * 3600000).toISOString(), // Delivered 6h ago
    declared_grade: 'Grade A'
  };

  const mockOrderDeliveredStale = {
    id: 'ORD_102',
    order_number: 'KS-2026-102',
    customer_id: 'CUST_A',
    seller_id: 'SELLER_X',
    status: 'Completed',
    delivered_at: new Date(Date.now() - 55 * 3600000).toISOString(), // Delivered 55h ago (> 48h)
    declared_grade: 'Grade A'
  };

  const mockOrderUndelivered = {
    id: 'ORD_103',
    order_number: 'KS-2026-103',
    customer_id: 'CUST_A',
    seller_id: 'SELLER_X',
    status: 'Preparing',
    declared_grade: 'Grade A'
  };

  test('1. Creates valid dispute within 48h inspection window', async () => {
    const dispute = await disputeService.createDispute({
      orderId: 'ORD_101',
      buyerId: 'CUST_A',
      reason: 'QUALITY_MISMATCH',
      description: 'Tomatoes arrived soft and bruised with puncture marks',
      claimedCondition: 'Severely bruised; fails Grade A criteria',
      evidenceKeys: ['media/dispute/ORD_101/bruised_box.jpg']
    }, async () => mockOrderDeliveredRecent);

    assert.strictEqual(dispute.status, 'OPEN');
    assert.strictEqual(dispute.reason, 'QUALITY_MISMATCH');
    assert.strictEqual(dispute.claimantId, 'CUST_A');
    assert.strictEqual(dispute.respondentId, 'SELLER_X');
    assert.strictEqual(dispute.timeline.length, 1);
    assert.strictEqual(dispute.timeline[0].action, 'DISPUTE_FILED');
    assert.strictEqual(dispute.evidence.length, 1);
    assert.strictEqual(dispute.evidence[0].storageKey, 'media/dispute/ORD_101/bruised_box.jpg');
  });

  test('2. Rejects dispute creation when 48-hour inspection window has expired', async () => {
    await assert.rejects(
      async () => {
        await disputeService.createDispute({
          orderId: 'ORD_102',
          buyerId: 'CUST_A',
          reason: 'QUALITY_MISMATCH',
          description: 'Quality was not as declared',
          evidenceKeys: []
        }, async () => mockOrderDeliveredStale);
      },
      (err) => {
        assert.strictEqual(err.statusCode, 400);
        assert.strictEqual(err.code, 'DISPUTE_WINDOW_EXPIRED');
        assert.ok(err.message.includes('48-hour inspection window has expired'));
        return true;
      }
    );
  });

  test('3. Rejects dispute creation if order is not yet delivered', async () => {
    await assert.rejects(
      async () => {
        await disputeService.createDispute({
          orderId: 'ORD_103',
          buyerId: 'CUST_A',
          reason: 'QUALITY_MISMATCH',
          description: 'Quality is bad',
          evidenceKeys: []
        }, async () => mockOrderUndelivered);
      },
      (err) => {
        assert.strictEqual(err.statusCode, 400);
        assert.strictEqual(err.code, 'ORDER_NOT_DELIVERED');
        assert.ok(err.message.includes('only be filed after delivery is confirmed'));
        return true;
      }
    );
  });

  test('4. Rejects invalid dispute reason with 400', async () => {
    await assert.rejects(
      async () => {
        await disputeService.createDispute({
          orderId: 'ORD_101',
          buyerId: 'CUST_A',
          reason: 'I_CHANGED_MY_MIND',
          description: 'No longer need this product'
        }, async () => mockOrderDeliveredRecent);
      },
      (err) => {
        assert.strictEqual(err.statusCode, 400);
        assert.strictEqual(err.code, 'INVALID_DISPUTE_REASON');
        return true;
      }
    );
  });

  test('5. Rejects unauthorized dispute filing (IDOR protection)', async () => {
    await assert.rejects(
      async () => {
        await disputeService.createDispute({
          orderId: 'ORD_101',
          buyerId: 'CUST_ATTACKER', // Different user
          reason: 'QUALITY_MISMATCH',
          description: 'Fraudulent complaint attempt'
        }, async () => mockOrderDeliveredRecent);
      },
      (err) => {
        assert.strictEqual(err.statusCode, 403);
        assert.strictEqual(err.code, 'UNAUTHORIZED_DISPUTE_FILING');
        return true;
      }
    );
  });

  test('6. State Machine: Rejects direct illegal transition (OPEN -> RESOLVED)', async () => {
    // According to workflow rules, an OPEN dispute cannot jump straight to RESOLVED without response/review
    assert.throws(
      () => {
        DisputeStateMachine.validateTransition('OPEN', 'RESOLVED');
      },
      (err) => {
        assert.strictEqual(err.code, 'ILLEGAL_STATE_TRANSITION');
        return true;
      }
    );
  });

  test('7. Seller responds with resolution offer, advancing state and recording timeline', async () => {
    // Find active dispute created in test 1
    const activeDispute = await repo.findByOrderId('ORD_101');
    assert.ok(activeDispute);

    const updated = await disputeService.respondToDispute(activeDispute.id, 'SELLER_X', 'seller', {
      responseNotes: 'Offering 40% partial refund for damaged items',
      offerType: 'PARTIAL_REFUND',
      offerAmount: 800,
      counterEvidenceKeys: ['media/dispute/ORD_101/pre_dispatch.jpg']
    });

    assert.strictEqual(updated.status, 'SELLER_RESPONDED');
    assert.strictEqual(updated.resolutionOffer.offerType, 'PARTIAL_REFUND');
    assert.strictEqual(updated.resolutionOffer.offerAmount, 800);

    // Timeline must reflect seller response
    const lastEvent = updated.timeline[updated.timeline.length - 1];
    assert.strictEqual(lastEvent.action, 'SELLER_PROPOSED_RESOLUTION');
    assert.strictEqual(lastEvent.actorId, 'SELLER_X');
    assert.strictEqual(lastEvent.newState, 'SELLER_RESPONDED');
  });

  test('8. Attaches additional evidence with authoritative server timestamp', async () => {
    const activeDispute = await repo.findByOrderId('ORD_101');
    const evidenceEntry = await disputeService.attachEvidence(activeDispute.id, { id: 'CUST_A', role: 'customer' }, {
      storageKey: 'media/dispute/ORD_101/scale_measurement.jpg',
      evidenceType: 'PHOTO',
      caption: 'Scale reading showing weight discrepancy'
    });

    assert.ok(evidenceEntry.id.startsWith('EVD_'));
    assert.strictEqual(evidenceEntry.storageKey, 'media/dispute/ORD_101/scale_measurement.jpg');
    assert.ok(new Date(evidenceEntry.timestamp).getTime() > 0);

    // Verify dispute timeline includes evidence attachment
    const disputeAfter = await disputeService.getDispute(activeDispute.id, { id: 'CUST_A', role: 'customer' });
    const lastTimeline = disputeAfter.timeline[disputeAfter.timeline.length - 1];
    assert.strictEqual(lastTimeline.action, 'EVIDENCE_ATTACHED');
  });

  test('9. Unauthorized actors cannot resolve disputes (Role 403); Admin resolves dispute and locks terminal state', async () => {
    const activeDispute = await repo.findByOrderId('ORD_101');

    // Customer attempt to resolve must fail with 403
    await assert.rejects(
      async () => {
        await disputeService.resolveDispute(activeDispute.id, { id: 'CUST_A', role: 'customer' }, {
          resolutionStatus: 'RESOLVED',
          resolutionNotes: 'Customer attempting self-resolution.'
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 403);
        assert.strictEqual(err.code, 'UNAUTHORIZED_DISPUTE_RESOLUTION');
        return true;
      }
    );

    // Seller attempt to resolve must fail with 403
    await assert.rejects(
      async () => {
        await disputeService.resolveDispute(activeDispute.id, { id: 'SELLER_X', role: 'seller' }, {
          resolutionStatus: 'RESOLVED',
          resolutionNotes: 'Seller attempting self-resolution.'
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 403);
        assert.strictEqual(err.code, 'UNAUTHORIZED_DISPUTE_RESOLUTION');
        return true;
      }
    );

    // Authorized admin resolves successfully
    const resolved = await disputeService.resolveDispute(activeDispute.id, { id: 'ADMIN_01', role: 'admin' }, {
      resolutionStatus: 'RESOLVED',
      resolutionNotes: 'Admin verified evidence and approved resolution.'
    });

    assert.strictEqual(resolved.status, 'RESOLVED');
    assert.ok(resolved.resolvedAt);
    assert.strictEqual(resolved.resolvedBy, 'ADMIN_01');

    // Attempting further transition from RESOLVED must be rejected
    assert.throws(
      () => {
        DisputeStateMachine.validateTransition('RESOLVED', 'OPEN');
      },
      (err) => {
        assert.strictEqual(err.code, 'ILLEGAL_STATE_TRANSITION');
        return true;
      }
    );
  });
});
