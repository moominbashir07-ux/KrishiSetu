/**
 * KrishiSetu 2.0 — Mock Bedrock Provider
 * Safe local development and automated test mock implementing strict non-hallucination rules
 */

const BedrockProvider = require('./bedrockProvider');

class MockBedrockProvider extends BedrockProvider {
  constructor(options = {}) {
    super();
    this.modelId = options.modelId || 'anthropic.claude-3-5-sonnet-20240620-v1:0 (mock)';
    this.simulateFailure = Boolean(options.simulateFailure);
  }

  isAvailable() {
    return !this.simulateFailure;
  }

  setSimulateFailure(fail) {
    this.simulateFailure = Boolean(fail);
  }

  async invokeModel({ prompt, systemPrompt, taskType = 'generic', context = {} }) {
    if (this.simulateFailure) {
      const err = new Error('AWS Bedrock Runtime service is temporarily unreachable.');
      err.code = 'AI_SERVICE_UNAVAILABLE';
      err.statusCode = 503;
      throw err;
    }

    if (taskType === 'farmer_advice') {
      const { commodity = 'Produce', quantity = '0 kg', availableMarkets = [], currentPrices = {}, verifiedMandiPrices = null } = context;
      
      let verifiedMandiLines = '• Official AGMARKNET Benchmark: No verified government market data for this selection.';
      if (verifiedMandiPrices && Object.keys(verifiedMandiPrices).length > 0) {
        verifiedMandiLines = availableMarkets.length > 0
          ? availableMarkets.map(m => `• ${m.name || m}: ₹${verifiedMandiPrices[m.name || m] || 'Price Unavailable'}/quintal (Official AGMARKNET Modal Benchmark)`).join('\n')
          : '• Official AGMARKNET Benchmark available.';
      }

      const clientDeclaredLines = availableMarkets.length > 0 && Object.keys(currentPrices).length > 0
        ? availableMarkets.map(m => `• ${m.name || m}: ₹${currentPrices[m.name || m] || 'Not specified'}/quintal (Client-Declared Context — UNVERIFIED)`).join('\n')
        : '• No client-declared prices provided.';

      const responseText = `[FACTS FROM VERIFIED SYSTEM DATA]
Commodity: ${commodity}
Declared Volume: ${quantity}
Official Government Mandi Benchmarks:
${verifiedMandiLines}

[CLIENT-DECLARED CONTEXT (UNVERIFIED)]
${clientDeclaredLines}

[AI-GENERATED GUIDANCE]
Based strictly on the verified official benchmarks above (client-declared prices are unverified contextual references):
1. Compare your production costs against the official government benchmark rather than unverified quotes.
2. Consider selling at markets with verified arrival records after accounting for transport.
3. Ensure lot grading matches declared criteria to prevent post-delivery buyer disputes.
4. Note: KrishiSetu does not treat client-supplied prices as verified market facts; the advisor reasons solely over supplied market arrivals and does not assume or estimate them.`;

      return {
        text: responseText,
        modelId: this.modelId,
        tokensUsed: { prompt: 150, completion: 180 },
        isMock: true
      };
    }

    if (taskType === 'listing_draft') {
      const rawNotes = String(context.notes || prompt || '').trim();
      const matchQty = rawNotes.match(/(\d+)\s*(kg|quintal|crates?|tons?)/i);
      const matchCommodity = rawNotes.match(/(tomato|onion|potato|wheat|rice|apple|chilli)/i);

      const commodity = matchCommodity ? matchCommodity[1][0].toUpperCase() + matchCommodity[1].slice(1).toLowerCase() : 'Vegetables';
      const quantity = matchQty ? Number(matchQty[1]) : 100;
      const unit = matchQty ? matchQty[2].toLowerCase() : 'kg';

      const draftListing = {
        commodity,
        quantity,
        unit,
        harvestDate: new Date().toISOString().split('T')[0],
        suggestedDeclaredGrade: 'Grade A',
        suggestedDescription: `Farm-fresh ${commodity} harvested on ${new Date().toISOString().split('T')[0]}. Clean, sorted batch ready for direct procurement.`,
        status: 'DRAFT_REQUIRES_SELLER_CONFIRMATION',
        disclaimer: 'This is an AI-generated draft listing. The seller must review, modify, and confirm all fields before publication.'
      };

      return {
        text: JSON.stringify(draftListing, null, 2),
        modelId: this.modelId,
        tokensUsed: { prompt: 110, completion: 140 },
        isMock: true,
        structuredData: draftListing
      };
    }

    if (taskType === 'dispute_summary') {
      const { sellerClaim = {}, buyerComplaint = {}, orderInfo = {} } = context;

      const summaryText = `=== AI-GENERATED SUMMARY (NON-BINDING) ===
1. TRANSACTION SUMMARY:
   • Order Number: ${orderInfo.orderNumber || orderInfo.id || 'N/A'}
   • Commodity: ${orderInfo.commodity || 'Perishable Produce'}
   • Total Amount: ₹${orderInfo.totalAmount || 0}

2. SELLER COMMITMENT & EVIDENCE:
   • Declared Grade: ${sellerClaim.declaredGrade || 'Grade A'}
   • Seller Criteria Stated: ${sellerClaim.gradeCriteria || 'None documented'}
   • Dispatch Proofs: ${sellerClaim.evidenceCount || 0} image(s) registered

3. BUYER CLAIM & OBSERVED CONDITION:
   • Reason Filed: ${buyerComplaint.reason || 'QUALITY_MISMATCH'}
   • Stated Defect: ${buyerComplaint.description || 'Quality differs from declaration'}
   • Buyer Photos Attached: ${buyerComplaint.evidenceCount || 0} photo(s) submitted

4. OBJECTIVE FACTUAL OBSERVATION:
   • Evidence reflects a discrepancy between seller-declared grade specifications and buyer-documented delivered condition.
   • Neither claim has been officially certified by a physical laboratory inspector.
   • Recommended next step: Parties should review the proposed partial refund or return options, or request platform arbiter mediation.`;

      return {
        text: summaryText,
        modelId: this.modelId,
        tokensUsed: { prompt: 210, completion: 260 },
        isMock: true
      };
    }

    if (taskType === 'quality_assessment') {
      const { declaredGrade = 'Grade A', commodity = 'Produce', evidenceKeys = [] } = context;
      const count = Array.isArray(evidenceKeys) ? evidenceKeys.length : 0;

      const structuredData = {
        assessment: count > 0 ? 'GRADE_SUPPORTED' : 'INSUFFICIENT_EVIDENCE',
        suggestedGrade: declaredGrade || 'Grade A',
        confidence: count > 0 ? 0.85 : 0.0,
        limitations: [
          'Visual surface assessment only; internal moisture or core defects cannot be evaluated',
          'Resolution and ambient lighting conditions may affect colour analysis'
        ],
        evidenceCount: count,
        provenance: 'AI_ASSISTED_ESTIMATE'
      };

      return {
        text: `AI Quality Assessment for ${commodity}: Evidence supports ${declaredGrade} with 85% visual confidence based on ${count} photos. Non-binding visual estimate.`,
        modelId: this.modelId,
        tokensUsed: { prompt: 120, completion: 150 },
        isMock: true,
        structuredData
      };
    }

    return {
      text: 'AI response completed based on verified application parameters.',
      modelId: this.modelId,
      tokensUsed: { prompt: 50, completion: 50 },
      isMock: true
    };
  }
}

module.exports = MockBedrockProvider;
