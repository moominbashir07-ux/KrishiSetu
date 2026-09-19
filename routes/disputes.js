/**
 * KrishiSetu 2.0 — Disputes Express Router
 * Mounts /api/disputes
 */

const express = require('express');
const db = require('../db/db');
const { authenticateUser } = require('../middleware/auth');
const { DisputeService } = require('../services/dispute/disputeService');

const router = express.Router();
const disputeService = new DisputeService(null, db);

// Helper error handler
function handleDisputeError(err, res, next) {
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code || 'DISPUTE_ERROR',
        message: err.message
      }
    });
  }
  next(err);
}

// POST /api/disputes (Create dispute)
router.post('/', authenticateUser, async (req, res, next) => {
  try {
    const { orderId, reason, description, claimedCondition, evidenceKeys } = req.body;
    const buyerId = req.user.id;
    const buyerRole = req.user.role;

    const dispute = await disputeService.createDispute({
      orderId,
      buyerId,
      buyerRole,
      reason,
      description,
      claimedCondition,
      evidenceKeys
    });

    res.status(201).json({
      success: true,
      message: 'Dispute registered successfully. 48-hour inspection window validated.',
      dispute
    });
  } catch (err) {
    handleDisputeError(err, res, next);
  }
});

// GET /api/disputes/:id (Fetch dispute with timeline & evidence)
router.get('/:id', authenticateUser, async (req, res, next) => {
  try {
    const dispute = await disputeService.getDispute(req.params.id, req.user);
    res.json({
      success: true,
      dispute
    });
  } catch (err) {
    handleDisputeError(err, res, next);
  }
});

// POST /api/disputes/:id/evidence (Attach evidence)
router.post('/:id/evidence', authenticateUser, async (req, res, next) => {
  try {
    const { storageKey, evidenceType, caption, fileSizeBytes } = req.body;
    const evidence = await disputeService.attachEvidence(req.params.id, req.user, {
      storageKey,
      evidenceType,
      caption,
      fileSizeBytes
    });

    res.status(201).json({
      success: true,
      message: 'Evidence attached to dispute timeline.',
      evidence
    });
  } catch (err) {
    handleDisputeError(err, res, next);
  }
});

// POST /api/disputes/:id/respond (Seller response & resolution offer)
router.post('/:id/respond', authenticateUser, async (req, res, next) => {
  try {
    const { responseNotes, offerType, offerAmount, counterEvidenceKeys } = req.body;
    const dispute = await disputeService.respondToDispute(req.params.id, req.user.id, req.user.role, {
      responseNotes,
      offerType,
      offerAmount,
      counterEvidenceKeys
    });

    res.json({
      success: true,
      message: 'Seller response and proposed resolution recorded.',
      dispute
    });
  } catch (err) {
    handleDisputeError(err, res, next);
  }
});

// POST /api/disputes/:id/resolve (Resolve or Reject dispute — Admin Only)
router.post('/:id/resolve', authenticateUser, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: {
          code: 'UNAUTHORIZED_DISPUTE_RESOLUTION',
          message: 'Unauthorized: Only platform administrators can resolve or reject disputes.'
        }
      });
    }
    const { resolutionStatus = 'RESOLVED', resolutionNotes } = req.body;
    const dispute = await disputeService.resolveDispute(req.params.id, req.user, {
      resolutionStatus,
      resolutionNotes
    });

    res.json({
      success: true,
      message: `Dispute status updated to ${dispute.status}.`,
      dispute
    });
  } catch (err) {
    handleDisputeError(err, res, next);
  }
});

// POST /api/disputes/:id/ai-summary (Objective non-binding evidence audit)
router.post('/:id/ai-summary', authenticateUser, async (req, res, next) => {
  try {
    const summary = await disputeService.generateAiSummary(req.params.id, req.user);
    res.json({
      success: true,
      summary
    });
  } catch (err) {
    handleDisputeError(err, res, next);
  }
});

module.exports = {
  disputesRouter: router,
  disputeService
};
