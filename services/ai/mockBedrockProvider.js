/**
 * KrishiSetu — Legacy Compatibility Adapter
 * Redirects to DeterministicAdvisoryProvider (Zero AWS / Zero Paid Cloud LLM)
 */

const DeterministicAdvisoryProvider = require('./deterministicAdvisoryProvider');

module.exports = DeterministicAdvisoryProvider;
