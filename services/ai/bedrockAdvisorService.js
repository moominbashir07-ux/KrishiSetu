/**
 * KrishiSetu — Legacy Compatibility Adapter
 * Redirects to AgriculturalAdvisorService (Zero AWS / Zero Paid Cloud LLM)
 */

const {
  AgriculturalAdvisorService,
  DeterministicAdvisoryProvider
} = require('./agriculturalAdvisorService');

module.exports = {
  BedrockAdvisorService: AgriculturalAdvisorService,
  AgriculturalAdvisorService,
  MockBedrockProvider: DeterministicAdvisoryProvider,
  DeterministicAdvisoryProvider
};
