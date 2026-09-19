/**
 * KrishiSetu 2.0 — Amazon Bedrock Integration & Non-Hallucination Guardrails Test Suite
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { BedrockAdvisorService, MockBedrockProvider } = require('../services/ai/bedrockAdvisorService');

describe('Amazon Bedrock — Advisory, Listing Drafting & Dispute Summaries', () => {
  const mockProvider = new MockBedrockProvider();
  const service = new BedrockAdvisorService(mockProvider);

  test('1. Farmer Advisory generates advice strictly grounded in verified mandi context', async () => {
    const res = await service.getFarmerAdvice({
      commodity: 'Tomato',
      quantity: '500 kg',
      location: 'Nashik',
      availableMarkets: ['Pimpalgaon APMC', 'Lasalgaon APMC'],
      currentPrices: {
        'Pimpalgaon APMC': 2600,
        'Lasalgaon APMC': 2450
      },
      freshness: 'LIVE'
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.data.adviceText.includes('[FACTS FROM VERIFIED SYSTEM DATA]'));
    assert.ok(res.data.adviceText.includes('[AI-GENERATED GUIDANCE]'));
    assert.ok(res.data.adviceText.includes('Pimpalgaon APMC: ₹2600/quintal'));
    assert.ok(res.data.adviceText.includes('Lasalgaon APMC: ₹2450/quintal'));
    assert.ok(res.data.adviceText.includes('does not assume or estimate them'));
  });

  test('2. Farmer Advisory rejects missing commodity input with 400', async () => {
    await assert.rejects(
      async () => {
        await service.getFarmerAdvice({
          commodity: '',
          quantity: '500 kg'
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 400);
        assert.strictEqual(err.code, 'INVALID_ADVISORY_INPUT');
        return true;
      }
    );
  });

  test('3. Listing Assistant generates draft requiring explicit seller confirmation', async () => {
    const res = await service.draftListing('Harvested 500 kg tomato today morning.');

    assert.strictEqual(res.success, true);
    assert.ok(res.data.draft);
    assert.strictEqual(res.data.draft.commodity, 'Tomato');
    assert.strictEqual(res.data.draft.quantity, 500);
    assert.strictEqual(res.data.draft.unit, 'kg');
    assert.strictEqual(res.data.draft.status, 'DRAFT_REQUIRES_SELLER_CONFIRMATION');
    assert.strictEqual(res.data.draft.requiresSellerConfirmation, true);
    assert.ok(res.data.draft.disclaimer.includes('seller must review, modify, and confirm'));
  });

  test('4. Dispute Summarizer generates neutral, non-binding side-by-side evidence audit', async () => {
    const res = await service.summarizeDispute({
      disputeId: 'DSP_1001',
      orderInfo: {
        orderNumber: 'KS-2026-9901',
        commodity: 'Onion',
        totalAmount: 3200
      },
      sellerClaim: {
        declaredGrade: 'Grade A',
        gradeCriteria: 'Size > 55mm, uniform red, zero rot',
        evidenceCount: 2
      },
      buyerComplaint: {
        reason: 'QUALITY_MISMATCH',
        description: 'Over 40% of produce arrived with rot and skin damage',
        evidenceCount: 3
      }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.label, 'AI-GENERATED SUMMARY (NON-BINDING)');
    assert.ok(res.data.summaryText.includes('AI-GENERATED SUMMARY (NON-BINDING)'));
    assert.ok(res.data.summaryText.includes('SELLER COMMITMENT & EVIDENCE'));
    assert.ok(res.data.summaryText.includes('BUYER CLAIM & OBSERVED CONDITION'));
    assert.ok(res.data.summaryText.includes('Neither claim has been officially certified'));
    assert.ok(!res.data.summaryText.includes('seller is guilty'));
  });

  test('5. Failure handling: Unreachable Bedrock returns controlled AI_SERVICE_UNAVAILABLE without crashing or faking responses', async () => {
    mockProvider.setSimulateFailure(true);

    await assert.rejects(
      async () => {
        await service.getFarmerAdvice({ commodity: 'Onion', quantity: '100 kg' });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 503);
        assert.strictEqual(err.code, 'AI_SERVICE_UNAVAILABLE');
        assert.ok(err.message.includes('Bedrock Runtime service is temporarily unreachable'));
        return true;
      }
    );

    // Reset mock failure state
    mockProvider.setSimulateFailure(false);
  });
});
