/**
 * KrishiSetu 2.0 — Amazon Bedrock Advisor Service
 * Domain orchestrator for Farmer Advisory, Listing Drafting, and Dispute Summaries
 */

const MockBedrockProvider = require('./mockBedrockProvider');
const AwsBedrockProvider = require('./awsBedrockProvider');

class UnavailableBedrockProvider {
  constructor(reason = 'AI provider is unavailable.') {
    this.reason = reason;
  }
  isAvailable() {
    return false;
  }
  async invokeModel() {
    const err = new Error(this.reason);
    err.code = 'AI_SERVICE_UNAVAILABLE';
    err.statusCode = 503;
    throw err;
  }
}

class BedrockAdvisorService {
  constructor(provider = null, options = {}) {
    const isProduction = process.env.NODE_ENV === 'production';
    const configuredProviderType = options.providerType || (process.env.BEDROCK_PROVIDER || (isProduction ? 'aws' : 'mock')).toLowerCase();
    this.selectedProvider = configuredProviderType;

    if (provider) {
      this.provider = provider;
      if (provider instanceof AwsBedrockProvider) {
        this.selectedProvider = 'aws';
      } else if (provider instanceof MockBedrockProvider) {
        this.selectedProvider = 'mock';
      }
    } else if (configuredProviderType === 'aws') {
      try {
        const aws = new AwsBedrockProvider(options);
        if (isProduction && !aws.isAvailable()) {
          this.provider = new UnavailableBedrockProvider('AWS Bedrock is not configured or unavailable in production.');
        } else {
          this.provider = aws;
        }
      } catch (e) {
        if (isProduction) {
          this.provider = new UnavailableBedrockProvider(`AWS Bedrock initialization failed: ${e.message}`);
        } else {
          console.warn('[BedrockAdvisorService] Falling back to MockBedrockProvider:', e.message);
          this.provider = new MockBedrockProvider();
          this.selectedProvider = 'mock';
        }
      }
    } else {
      if (isProduction) {
        this.provider = new UnavailableBedrockProvider('Mock AI provider is strictly disabled in production environments.');
        this.selectedProvider = configuredProviderType;
      } else {
        this.provider = new MockBedrockProvider(options);
        this.selectedProvider = 'mock';
      }
    }
  }

  getProviderStatus() {
    const isAws = this.provider instanceof AwsBedrockProvider;
    const isMock = this.provider instanceof MockBedrockProvider;
    const activeProvider = isAws ? 'aws' : (isMock ? 'mock' : 'unavailable');
    const available = this.provider ? this.provider.isAvailable() : false;

    return {
      selectedProvider: this.selectedProvider,
      activeProvider,
      available,
      isMock,
      region: isAws ? this.provider.region : (process.env.AWS_REGION || null)
    };
  }

  /**
   * Generates grounded farmer market advice without price hallucination.
   * Client-supplied prices are strictly treated as untrusted context declarations.
   */
  async getFarmerAdvice(context = {}) {
    const { commodity, quantity } = context;

    if (!commodity || typeof commodity !== 'string' || !commodity.trim()) {
      const err = new Error('Commodity name is required for farmer advisory.');
      err.code = 'INVALID_ADVISORY_INPUT';
      err.statusCode = 400;
      throw err;
    }

    const clientSuppliedPrices = context.currentPrices && typeof context.currentPrices === 'object' ? context.currentPrices : {};
    let verifiedMandiPrices = context.verifiedMandiPrices || null;

    if (!verifiedMandiPrices && context.fetchVerified !== false) {
      try {
        const db = require('../../db/db');
        const snapRes = await db.query(
          `SELECT market, modal_price, arrival_date, source 
           FROM market_price_snapshots 
           WHERE LOWER(commodity) = LOWER($1)
           ORDER BY arrival_date DESC LIMIT 5`,
          [commodity.trim()]
        );
        if (snapRes && snapRes.rows && snapRes.rows.length > 0) {
          verifiedMandiPrices = {};
          snapRes.rows.forEach(r => {
            verifiedMandiPrices[r.market] = Number(r.modal_price);
          });
        }
      } catch {
        // Safe server-side query fallback
      }
    }

    const systemPrompt = `You are the KrishiSetu Farmer Advisory Assistant powered by Amazon Bedrock.
RULES OF ENGAGEMENT:
1. Reason ONLY over the verified mandi arrival rates and market options provided in the prompt context.
2. DO NOT hallucinate or invent prices, buyers, transport distances, demand projections, or government schemes.
3. If an asked mandi price or detail is missing from context, EXPLICITLY STATE: "Verified market price for this option is currently unavailable."
4. Structure your response into two distinct sections:
   [FACTS FROM VERIFIED SYSTEM DATA]
   [AI-GENERATED GUIDANCE]
5. Client-supplied prices are strictly unverified declarations. NEVER describe or treat client-supplied values as verified AGMARKNET or government data.`;

    const userPrompt = `Farmer Context:
Commodity: ${commodity}
Quantity: ${quantity || 'Unspecified volume'}
Location: ${context.location || 'Local District'}
Verified Available Markets: ${JSON.stringify(context.availableMarkets || [])}
Official Server-Verified Benchmark Rates (INR/quintal): ${JSON.stringify(verifiedMandiPrices || 'None verified')}
Client-Declared Contextual Prices (UNVERIFIED): ${JSON.stringify(clientSuppliedPrices)}
Data Freshness: ${context.freshness || (verifiedMandiPrices ? 'LIVE' : 'UNAVAILABLE')}

Farmer Question: "Which available market selling options should I consider based solely on verified data?"`;

    const enrichedContext = {
      ...context,
      currentPrices: clientSuppliedPrices,
      verifiedMandiPrices
    };

    const result = await this.provider.invokeModel({
      prompt: userPrompt,
      systemPrompt,
      taskType: 'farmer_advice',
      context: enrichedContext
    });

    return {
      success: true,
      data: {
        adviceText: result.text,
        modelId: result.modelId,
        isMock: Boolean(result.isMock),
        provenance: {
          verifiedMarketDataUsed: Boolean(verifiedMandiPrices),
          clientPricesAreVerified: false,
          source: verifiedMandiPrices ? 'AGMARKNET_SERVER_SNAPSHOT' : 'UNVERIFIED_CLIENT_CONTEXT'
        },
        disclaimer: 'Guidance is synthesized from verified market context. Client-declared prices are unverified. Final selling decisions rest with the farmer.'
      }
    };
  }

  /**
   * Converts unstructured farmer notes/audio transcript into a structured draft listing.
   */
  async draftListing(notes) {
    if (!notes || typeof notes !== 'string' || notes.trim().length < 3) {
      const err = new Error('Farmer harvest notes are required to formulate a draft listing.');
      err.code = 'INVALID_LISTING_NOTES';
      err.statusCode = 400;
      throw err;
    }

    const systemPrompt = `You are the KrishiSetu Listing Assistant powered by Amazon Bedrock.
Extract key listing fields from informal farmer harvest notes.
Output MUST be a structured draft.
CRITICAL: The draft is strictly a proposal and requires seller confirmation before publication.`;

    const userPrompt = `Notes provided by farmer: "${notes.trim()}"
Formulate a draft produce listing.`;

    const result = await this.provider.invokeModel({
      prompt: userPrompt,
      systemPrompt,
      taskType: 'listing_draft',
      context: { notes: notes.trim() }
    });

    let draft = result.structuredData;
    if (!draft) {
      try {
        draft = JSON.parse(result.text);
      } catch (e) {
        draft = {
          suggestedDescription: result.text,
          status: 'DRAFT_REQUIRES_SELLER_CONFIRMATION'
        };
      }
    }

    draft.status = 'DRAFT_REQUIRES_SELLER_CONFIRMATION';
    draft.requiresSellerConfirmation = true;

    return {
      success: true,
      data: {
        draft,
        modelId: result.modelId,
        isMock: Boolean(result.isMock)
      }
    };
  }

  /**
   * Generates a neutral, objective dispute evidence summary for human arbiters.
   */
  async summarizeDispute(disputeContext = {}) {
    const { sellerClaim = {}, buyerComplaint = {}, orderInfo = {} } = disputeContext;

    if (!disputeContext.disputeId && !orderInfo.id && !orderInfo.orderNumber) {
      const err = new Error('Dispute or order identifiers are required for dispute summarization.');
      err.code = 'INVALID_DISPUTE_CONTEXT';
      err.statusCode = 400;
      throw err;
    }

    const systemPrompt = `You are an impartial dispute evidence summarizer for KrishiSetu powered by Amazon Bedrock.
STRICT ETHICAL CONSTRAINTS:
1. Provide a neutral, factual, side-by-side audit comparing the seller's commitments with the buyer's evidence.
2. DO NOT act as a judge.
3. DO NOT make legally binding determinations or declare who is at fault.
4. DO NOT invent missing evidence or unsupplied facts.
5. All outputs must carry the explicit heading: "AI-GENERATED SUMMARY (NON-BINDING)".`;

    const userPrompt = `Order Information: ${JSON.stringify(orderInfo)}
Seller Declaration: ${JSON.stringify(sellerClaim)}
Buyer Dispute Complaint: ${JSON.stringify(buyerComplaint)}

Synthesize an objective side-by-side evidence audit.`;

    const result = await this.provider.invokeModel({
      prompt: userPrompt,
      systemPrompt,
      taskType: 'dispute_summary',
      context: disputeContext
    });

      return {
        success: true,
        data: {
          summaryText: result.text,
          modelId: result.modelId,
          isMock: Boolean(result.isMock),
          label: 'AI-GENERATED SUMMARY (NON-BINDING)',
          disclaimer: 'This synthesis is non-binding and prepared to assist human review. Platform arbiters hold final authority.'
        }
      };
    }

    /**
     * Assesses photographic quality evidence for produce lots.
     * Strictly returns INSUFFICIENT_EVIDENCE if no photographic evidence is supplied.
     * Never masquerades as or claims official certification.
     */
    async assessQualityEvidence(payload = {}) {
      const { product = {}, evidenceKeys = [], declaredGrade = 'Grade A', commodity = 'Produce' } = payload;
      const cleanEvidence = Array.isArray(evidenceKeys) ? evidenceKeys.filter(k => typeof k === 'string' && k.trim()) : [];

      if (cleanEvidence.length === 0) {
        return {
          success: true,
          data: {
            assessment: 'INSUFFICIENT_EVIDENCE',
            suggestedGrade: declaredGrade || 'Ungraded',
            confidence: 0.0,
            limitations: ['No photographic evidence provided for assessment'],
            evidenceUsed: [],
            provenance: 'AI_ASSISTED_ESTIMATE',
            isOfficial: false,
            disclaimer: 'AI-assisted visual estimates are non-binding and require photographic proof. They do not constitute official AGMARK certification.'
          }
        };
      }

      const systemPrompt = `You are the KrishiSetu Produce Quality Assessment Assistant powered by Amazon Bedrock.
RULES:
1. Provide a strictly non-binding, probabilistic visual grade estimate based on supplied photographic evidence.
2. Under NO circumstances do you certify or guarantee quality.
3. Explicitly state limitations (e.g. lighting, angles, internal defects cannot be assessed by camera).
4. Provenance must ALWAYS be labeled as AI_ASSISTED_ESTIMATE. NEVER masquerade as CERTIFIED or AGMARK official certification.`;

      const userPrompt = `Product: ${commodity || product.name || 'Agricultural Produce'}
Declared Grade: ${declaredGrade}
Photographic Evidence Keys: ${JSON.stringify(cleanEvidence)}

Perform visual quality estimation and flag any discrepancies or confidence limitations.`;

      const result = await this.provider.invokeModel({
        prompt: userPrompt,
        systemPrompt,
        taskType: 'quality_assessment',
        context: { product, evidenceKeys: cleanEvidence, declaredGrade, commodity }
      });

      let assessmentData = result.structuredData;
      if (!assessmentData) {
        assessmentData = {
          assessment: 'GRADE_SUPPORTED',
          suggestedGrade: declaredGrade,
          confidence: 0.85,
          limitations: ['Visual surface assessment only; internal moisture, brix, or pest penetration cannot be evaluated via photo.'],
          summary: result.text
        };
      }

      return {
        success: true,
        data: {
          assessment: assessmentData.assessment || 'GRADE_SUPPORTED',
          suggestedGrade: assessmentData.suggestedGrade || declaredGrade,
          confidence: assessmentData.confidence !== undefined ? assessmentData.confidence : 0.85,
          limitations: assessmentData.limitations || ['Surface appearance only'],
          evidenceUsed: cleanEvidence,
          provenance: 'AI_ASSISTED_ESTIMATE',
          isOfficial: false,
          modelId: result.modelId,
          isMock: Boolean(result.isMock),
          disclaimer: 'AI-assisted visual estimates are non-binding indicators and do not replace physical AGMARK certification.'
        }
      };
    }
  }

module.exports = {
  BedrockAdvisorService,
  MockBedrockProvider,
  AwsBedrockProvider
};
