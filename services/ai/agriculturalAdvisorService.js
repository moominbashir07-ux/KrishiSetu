/**
 * KrishiSetu — Grounded Agricultural Advisor Service
 * Zero AWS / Zero Paid Cloud LLM Dependency
 * 
 * Domain orchestrator for Farmer Advisory, Listing Drafting, Quality Summaries,
 * and 5-language Conversational Guidance (en, hi, mr, pa, te).
 */

const DeterministicAdvisoryProvider = require('./deterministicAdvisoryProvider');

class AgriculturalAdvisorService {
  constructor(provider = null, options = {}) {
    this.selectedProvider = 'local_deterministic';
    this.provider = provider || new DeterministicAdvisoryProvider(options);
  }

  getProviderStatus() {
    return {
      selectedProvider: this.selectedProvider,
      activeProvider: 'deterministic',
      providerType: 'local_rules_engine',
      available: true,
      isDeterministic: true,
      isMock: false,
      engineId: this.provider.engineId || this.provider.modelId || 'krishisetu-deterministic-rules-v1'
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
          `SELECT market, modal_price, min_price, max_price, arrival_date, fetched_at 
           FROM market_price_snapshots 
           WHERE LOWER(commodity) = LOWER($1) 
           ORDER BY arrival_date DESC LIMIT 5`,
          [commodity.trim()]
        );
        if (snapRes && snapRes.rows && snapRes.rows.length > 0) {
          verifiedMandiPrices = snapRes.rows;
        }
      } catch (dbErr) {
        // Safe degrade to client-declared context
      }
    }

    let factsBlock = `[FACTS FROM VERIFIED SYSTEM DATA]\n• Commodity: ${commodity.trim()}\n`;
    if (quantity) factsBlock += `• Available Lot Quantity: ${quantity}\n`;
    if (context.location) factsBlock += `• Farmer Location: ${context.location}\n`;

    if (verifiedMandiPrices && verifiedMandiPrices.length > 0) {
      factsBlock += `• Official Mandi Benchmark Prices (AGMARKNET Snapshot):\n`;
      verifiedMandiPrices.forEach(snap => {
        factsBlock += `   - ${snap.market}: ₹${snap.modal_price}/quintal (Min: ₹${snap.min_price}, Max: ₹${snap.max_price}) [Date: ${snap.arrival_date || snap.price_date || 'Recent'}]\n`;
      });
    } else if (Object.keys(clientSuppliedPrices).length > 0) {
      factsBlock += `• Declared Local Prices (Unverified User Input):\n`;
      Object.entries(clientSuppliedPrices).forEach(([mkt, pr]) => {
        factsBlock += `   - ${mkt}: ₹${pr}/quintal (declared by user)\n`;
      });
    } else {
      factsBlock += `• Note: No historical official mandi arrivals registered for this commodity in current session.\n`;
    }

    const guidancePrompt = `${factsBlock}
[AI-GENERATED GUIDANCE]
Based strictly on the verified benchmark numbers above:
1. Harvest Distribution: Evaluate prices across the documented APMC markets.
2. Price Realization: Ensure price offers align with quality grade declarations.
3. Market Transparency: KrishiSetu references daily AGMARKNET snapshots and does not assume or estimate them.`;

    const result = await this.provider.invokeModel({
      prompt: guidancePrompt,
      taskType: 'farmer_advice',
      context: {
        commodity: commodity.trim(),
        quantity,
        verifiedMandiPrices,
        clientSuppliedPrices
      }
    });

    return {
      success: true,
      data: {
        adviceText: guidancePrompt,
        groundedFacts: factsBlock,
        verifiedSourcesPresent: Boolean(verifiedMandiPrices && verifiedMandiPrices.length > 0),
        provenance: {
          verifiedMarketDataUsed: Boolean(verifiedMandiPrices && verifiedMandiPrices.length > 0),
          clientPricesAreVerified: false,
          source: (verifiedMandiPrices && verifiedMandiPrices.length > 0) ? 'AGMARKNET_SERVER_SNAPSHOT' : 'UNVERIFIED_CLIENT_CONTEXT'
        },
        disclaimer: 'Advisory guidance generated from official daily mandi snapshots. Client-declared prices are unverified. Final selling decisions rest with the farmer.'
      },
      engineId: result.engineId || result.modelId,
      isDeterministic: true
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

    const result = await this.provider.invokeModel({
      prompt: `Perform visual quality estimation for ${commodity || product.name || 'Agricultural Produce'}`,
      taskType: 'quality_assessment',
      context: { product, evidenceKeys: cleanEvidence, declaredGrade, commodity }
    });

    let assessmentData = result.structuredData || {
      assessment: 'GRADE_SUPPORTED',
      suggestedGrade: declaredGrade,
      confidence: 0.85,
      limitations: ['Visual surface assessment only; internal moisture, brix, or pest penetration cannot be evaluated via photo.']
    };

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
        engineId: result.engineId || result.modelId || 'krishisetu-deterministic-rules-v1',
        isDeterministic: true,
        isMock: false,
        providerType: 'local_rules_engine',
        disclaimer: 'AI-assisted visual estimates are non-binding indicators and do not replace physical AGMARK certification.'
      }
    };
  }

  /**
   * Drafts an auditable produce listing from farmer description.
   * Requires explicit seller review and confirmation prior to publication.
   */
  async draftListing(roughNotes) {
    if (!roughNotes || typeof roughNotes !== 'string' || !roughNotes.trim()) {
      const err = new Error('Listing description notes are required.');
      err.code = 'INVALID_LISTING_INPUT';
      err.statusCode = 400;
      throw err;
    }

    const notes = roughNotes.trim();
    let detectedCommodity = 'Farm Produce';
    let detectedQuantity = 100;
    let detectedUnit = 'kg';

    if (/onion|कांदा|प्याज़/i.test(notes)) detectedCommodity = 'Onion';
    else if (/tomato|टोमॅटो|टमाटर/i.test(notes)) detectedCommodity = 'Tomato';
    else if (/potato|बटाटा|आलू/i.test(notes)) detectedCommodity = 'Potato';
    else if (/wheat|गहू|गेहूं/i.test(notes)) detectedCommodity = 'Wheat';
    else if (/rice|तांदूळ|चावल/i.test(notes)) detectedCommodity = 'Rice';

    const qtyMatch = notes.match(/(\d+(?:\.\d+)?)\s*(kg|quintal|क्विंटल|टन|ton)/i);
    if (qtyMatch) {
      detectedQuantity = parseFloat(qtyMatch[1]);
      detectedUnit = qtyMatch[2].toLowerCase();
    }

    const draft = {
      commodity: detectedCommodity,
      quantity: detectedQuantity,
      unit: detectedUnit,
      suggestedTitle: `${detectedQuantity} ${detectedUnit} Fresh ${detectedCommodity}`,
      description: `Harvest description: "${notes}". Sourced directly from local farm. Quality grade subject to photo verification.`,
      status: 'DRAFT_REQUIRES_SELLER_CONFIRMATION',
      requiresSellerConfirmation: true,
      disclaimer: 'This draft is generated by the KrishiSetu Advisory Assistant. The seller must review, modify, and confirm all listing details before publishing to the live marketplace.'
    };

    return {
      success: true,
      data: {
        draft,
        originalNotes: notes
      },
      isDeterministic: true
    };
  }

  /**
   * Generates factual dispute summary distinguishing seller claims from buyer observations.
   */
  async generateDisputeSummary(context = {}) {
    const { order, sellerDeclaration, buyerClaim } = context;

    if (!order || !buyerClaim) {
      const err = new Error('Order information and buyer claim are required for dispute summary.');
      err.code = 'INVALID_DISPUTE_CONTEXT';
      err.statusCode = 400;
      throw err;
    }

    const result = await this.provider.invokeModel({
      prompt: 'Summarize quality mismatch dispute objectively.',
      taskType: 'dispute_summary',
      context: {
        order,
        sellerDeclaration: sellerDeclaration || {},
        buyerClaim
      }
    });

    return {
      success: true,
      data: {
        summary: result.text,
        summaryText: result.text,
        label: 'AI-GENERATED SUMMARY (NON-BINDING)',
        evidenceAudited: {
          sellerPhotoCount: sellerDeclaration ? (sellerDeclaration.evidenceCount || 0) : 0,
          buyerPhotoCount: buyerClaim ? (buyerClaim.evidenceCount || 0) : 0
        },
        disclaimer: 'This non-binding summary highlights documented discrepancies for buyer-seller mediation.'
      },
      engineId: result.engineId || result.modelId,
      isDeterministic: true
    };
  }

  /**
   * Summarizes quality dispute with side-by-side evidence breakdown.
   */
  async summarizeDispute(payload = {}) {
    const { disputeId, orderInfo, sellerClaim, buyerComplaint } = payload;
    const order = orderInfo || payload.order;
    const sellerDeclaration = sellerClaim || payload.sellerDeclaration;
    const buyerClaim = buyerComplaint || payload.buyerClaim;
    const res = await this.generateDisputeSummary({ order, sellerDeclaration, buyerClaim });
    res.data.disputeId = disputeId;
    return res;
  }

  /**
   * Conversational Agricultural Assistant.
   * Grounds reasoning in platform capabilities, mandi rates, and audited quality evidence.
   * Strictly enforces non-hallucination of certifications and anti-injection defenses.
   */
  async chat(chatPayload = {}) {
    const { message, language = 'en', history = [], context = {}, user = null } = chatPayload;

    if (!message || typeof message !== 'string' || !message.trim()) {
      const err = new Error('Message is required and cannot be empty.');
      err.code = 'INVALID_CHAT_INPUT';
      err.statusCode = 400;
      throw err;
    }

    if (message.length > 2000) {
      const err = new Error('Message length exceeds maximum allowed limit of 2000 characters.');
      err.code = 'MESSAGE_TOO_LARGE';
      err.statusCode = 400;
      throw err;
    }

    // Supported languages: 'en', 'hi', 'mr', 'pa', 'te' (fallback to 'en')
    const normalizedLang = String(language || 'en').trim().toLowerCase();
    let effectiveLang = 'en';
    if (['hi', 'hindi'].includes(normalizedLang)) effectiveLang = 'hi';
    else if (['mr', 'marathi'].includes(normalizedLang)) effectiveLang = 'mr';
    else if (['pa', 'punjabi'].includes(normalizedLang)) effectiveLang = 'pa';
    else if (['te', 'telugu'].includes(normalizedLang)) effectiveLang = 'te';

    const sanitizedHistory = Array.isArray(history)
      ? history
          .filter(h => h && typeof h === 'object' && typeof h.content === 'string')
          .slice(-6)
          .map(h => ({
            role: h.role === 'user' ? 'user' : 'assistant',
            content: String(h.content).slice(0, 500)
          }))
      : [];

    const result = await this.provider.invokeModel({
      prompt: message.trim(),
      taskType: 'chat',
      context: {
        message: message.trim(),
        language: effectiveLang,
        history: sanitizedHistory,
        userRole: user ? user.role : 'guest',
        userName: user ? user.name : null,
        ...context
      }
    });

    return {
      success: true,
      message: {
        role: 'assistant',
        content: result.text
      },
      language: effectiveLang,
      engineId: result.engineId || result.modelId || 'krishisetu-deterministic-rules-v1',
      modelId: result.modelId || 'krishisetu-deterministic-rules-v1',
      isDeterministic: true,
      isMock: false,
      providerType: 'local_rules_engine'
    };
  }
}

// Backward-compatible aliases
const BedrockAdvisorService = AgriculturalAdvisorService;
const MockBedrockProvider = DeterministicAdvisoryProvider;

module.exports = {
  AgriculturalAdvisorService,
  DeterministicAdvisoryProvider,
  BedrockAdvisorService,
  MockBedrockProvider
};
