/**
 * KrishiSetu 2.0 — Amazon Bedrock AI Express Router
 * Mounts /api/ai
 */

const express = require('express');
const { authenticateUser } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/security');
const { BedrockAdvisorService } = require('../services/ai/bedrockAdvisorService');

const router = express.Router();
router.use(aiLimiter);
const defaultBedrockService = new BedrockAdvisorService();

function handleAiError(err, res, next) {
  if (err.statusCode || err.code === 'AI_SERVICE_UNAVAILABLE') {
    return res.status(err.statusCode || 503).json({
      error: {
        code: err.code || 'AI_SERVICE_UNAVAILABLE',
        message: err.message
      }
    });
  }
  next(err);
}

// POST /api/ai/farmer-advisor & /api/ai/advisor (Farmer Decision Support grounded in verified data)
const handleFarmerAdvisor = async (req, res, next) => {
  try {
    const response = await defaultBedrockService.getFarmerAdvice(req.body);
    res.json(response);
  } catch (err) {
    handleAiError(err, res, next);
  }
};
router.post('/farmer-advisor', authenticateUser, handleFarmerAdvisor);
router.post('/advisor', authenticateUser, handleFarmerAdvisor);

// POST /api/ai/quality-assessment (Visual produce evidence assessment)
router.post('/quality-assessment', authenticateUser, async (req, res, next) => {
  try {
    const response = await defaultBedrockService.assessQualityEvidence(req.body);
    res.json(response);
  } catch (err) {
    handleAiError(err, res, next);
  }
});

// POST /api/ai/draft-listing (Draft listing proposal from notes)
router.post('/draft-listing', authenticateUser, async (req, res, next) => {
  try {
    const { notes } = req.body;
    const response = await defaultBedrockService.draftListing(notes);
    res.json(response);
  } catch (err) {
    handleAiError(err, res, next);
  }
});

// POST /api/ai/summarize-dispute (Neutral side-by-side evidence audit)
router.post('/summarize-dispute', authenticateUser, async (req, res, next) => {
  try {
    const response = await defaultBedrockService.summarizeDispute(req.body);
    res.json(response);
  } catch (err) {
    handleAiError(err, res, next);
  }
});

module.exports = {
  aiRouter: router,
  defaultBedrockService
};
