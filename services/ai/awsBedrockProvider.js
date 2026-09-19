/**
 * KrishiSetu 2.0 — AWS Bedrock Runtime Provider
 * Production Bedrock client invoking Anthropic Claude 3.5 Sonnet / Haiku
 */

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const BedrockProvider = require('./bedrockProvider');

const SUPPORTED_BEDROCK_REGIONS = new Set([
  'us-east-1',
  'us-west-2',
  'ap-south-1',
  'ap-southeast-1',
  'ap-northeast-1',
  'eu-central-1',
  'eu-west-1',
  'eu-west-3'
]);

class AwsBedrockProvider extends BedrockProvider {
  constructor(options = {}) {
    super();
    this.region = options.region || process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-east-1';
    this.modelId = options.modelId || process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20240620-v1:0';

    const clientConfig = { region: this.region };
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      clientConfig.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN || undefined
      };
    }

    try {
      this.client = new BedrockRuntimeClient(clientConfig);
      this.configured = true;
    } catch (e) {
      this.configured = false;
      this.initError = e.message;
    }
  }

  isAvailable() {
    const hasValidRegion = Boolean(this.region && SUPPORTED_BEDROCK_REGIONS.has(String(this.region).trim().toLowerCase()));
    return Boolean(this.configured && hasValidRegion && !this.initError);
  }

  async invokeModel({ prompt, systemPrompt, maxTokens = 1024, temperature = 0.2 }) {
    if (!this.isAvailable()) {
      const err = new Error('AWS Bedrock is not configured or AWS credentials are unavailable in the current environment.');
      err.code = 'AI_SERVICE_UNAVAILABLE';
      err.statusCode = 503;
      throw err;
    }

    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      temperature: Math.min(Math.max(temperature, 0.0), 1.0),
      system: systemPrompt || 'You are an agricultural intelligence assistant for KrishiSetu. Reason strictly over supplied verified data. Do not hallucinate prices, distances, or official certifications.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ]
    };

    try {
      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(payload)
      });

      const response = await this.client.send(command);
      const decoded = new TextDecoder().decode(response.body);
      const json = JSON.parse(decoded);

      const responseText = json.content && json.content[0] ? json.content[0].text : '';
      return {
        text: responseText,
        modelId: this.modelId,
        tokensUsed: json.usage || {},
        isMock: false
      };
    } catch (err) {
      const serviceErr = new Error(`Amazon Bedrock invocation failed: ${err.message}`);
      serviceErr.code = 'AI_SERVICE_UNAVAILABLE';
      serviceErr.statusCode = 503;
      serviceErr.originalError = err.name;
      throw serviceErr;
    }
  }
}

module.exports = AwsBedrockProvider;
