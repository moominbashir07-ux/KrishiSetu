/**
 * KrishiSetu — Agricultural Intelligence Express Router
 * Zero AWS / Zero Paid Cloud LLM Dependency
 * Mounts /api/ai
 */

const express = require('express');
const { authenticateUser } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/security');
const { AgriculturalAdvisorService } = require('../services/ai/agriculturalAdvisorService');

const router = express.Router();
router.use(aiLimiter);
const defaultAdvisorService = new AgriculturalAdvisorService();

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
    const response = await defaultAdvisorService.getFarmerAdvice(req.body);
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
    const response = await defaultAdvisorService.assessQualityEvidence(req.body);
    res.json(response);
  } catch (err) {
    handleAiError(err, res, next);
  }
});

// POST /api/ai/listing-assistant (Draft listing from farmer notes)
router.post('/listing-assistant', authenticateUser, async (req, res, next) => {
  try {
    const { roughNotes } = req.body;
    const response = await defaultAdvisorService.draftListing(roughNotes);
    res.json(response);
  } catch (err) {
    handleAiError(err, res, next);
  }
});

// POST /api/ai/dispute-summary (Objective dispute discrepancy breakdown)
router.post('/dispute-summary', authenticateUser, async (req, res, next) => {
  try {
    const response = await defaultAdvisorService.generateDisputeSummary(req.body);
    res.json(response);
  } catch (err) {
    handleAiError(err, res, next);
  }
});

// POST /api/ai/chat (Multilingual Conversational Assistant grounded in verified data)
router.post('/chat', authenticateUser, async (req, res, next) => {
  try {
    const { message, language, history, context } = req.body;
    const response = await defaultAdvisorService.chat({
      message,
      language,
      history,
      context,
      user: req.user
    });
    res.json(response);
  } catch (err) {
    handleAiError(err, res, next);
  }
});

router.aiRouter = router;
router.defaultAdvisorService = defaultAdvisorService;
router.defaultBedrockService = defaultAdvisorService;

module.exports = router;
module.exports.aiRouter = router;
module.exports.defaultAdvisorService = defaultAdvisorService;
module.exports.defaultBedrockService = defaultAdvisorService;
