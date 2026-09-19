/**
 * KrishiSetu 2.0 — Amazon Bedrock Provider Interface
 */

class BedrockProvider {
  /**
   * Invokes foundation model with prompt and system instructions.
   * @param {Object} params
   * @param {string} params.prompt
   * @param {string} [params.systemPrompt]
   * @param {number} [params.maxTokens]
   * @param {number} [params.temperature]
   * @returns {Promise<{ text: string, modelId: string, tokensUsed: Object }>}
   */
  async invokeModel(params) {
    throw new Error('invokeModel() must be implemented by concrete BedrockProvider');
  }

  /**
   * Returns whether the provider is configured and available.
   * @returns {boolean}
   */
  isAvailable() {
    throw new Error('isAvailable() must be implemented by concrete BedrockProvider');
  }
}

module.exports = BedrockProvider;
