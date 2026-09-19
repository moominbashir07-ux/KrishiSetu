/**
 * KrishiSetu 2.0 — Product Quality Evidence & Grading Tests
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { ProductQualityService } = require('../services/quality/productQualityService');

describe('Product Quality Evidence & Grading System', () => {
  const service = new ProductQualityService();

  test('1. Valid Grade A declaration with evidence succeeds as SELLER_DECLARED', () => {
    const res = service.validateQualityDeclaration({
      sellerDeclaredGrade: 'Grade A',
      gradeCriteria: 'Diameter > 60mm, uniform red, zero rot',
      qualityEvidence: ['media/quality/PROD_101/batch_overview.jpg', 'media/quality/PROD_101/gauge.jpg'],
      verificationType: 'SELLER_DECLARED'
    });

    assert.strictEqual(res.declaredGrade, 'Grade A');
    assert.strictEqual(res.verificationType, 'SELLER_DECLARED');
    assert.strictEqual(res.verificationStatus, 'UNVERIFIED_DECLARATION');
    assert.strictEqual(res.isCertified, false);
    assert.strictEqual(res.displayBadge, 'Seller-Declared: Grade A');
    assert.strictEqual(res.qualityEvidence.length, 2);
  });

  test('2. Grade A declaration WITHOUT photographic evidence is rejected with 400', () => {
    assert.throws(
      () => {
        service.validateQualityDeclaration({
          sellerDeclaredGrade: 'Grade A',
          gradeCriteria: 'Looks good',
          qualityEvidence: [] // Missing required evidence
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 400);
        assert.strictEqual(err.code, 'GRADE_A_EVIDENCE_REQUIRED');
        assert.ok(err.message.includes('mandate at least 1 photographic batch evidence'));
        return true;
      }
    );
  });

  test('3. Rejects arbitrary or invalid agricultural grade names', () => {
    const invalidGrades = ['Grade AAA+++', 'Supreme Deluxe', 'Export Quality', '100% Organic Certified'];
    for (const badGrade of invalidGrades) {
      assert.throws(
        () => {
          service.validateQualityDeclaration({
            sellerDeclaredGrade: badGrade
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.strictEqual(err.code, 'INVALID_PRODUCT_GRADE');
          return true;
        }
      );
    }
  });

  test('4. Rejects suspicious or script-injection evidence references', () => {
    assert.throws(
      () => {
        service.validateQualityDeclaration({
          sellerDeclaredGrade: 'Grade A',
          qualityEvidence: ['<script>alert("xss")</script>']
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 400);
        assert.strictEqual(err.code, 'SUSPICIOUS_EVIDENCE_REFERENCE');
        return true;
      }
    );
  });

  test('5. Rejects claiming CERTIFIED status without official certification document', () => {
    assert.throws(
      () => {
        service.validateQualityDeclaration({
          sellerDeclaredGrade: 'Grade A',
          verificationType: 'CERTIFIED',
          qualityEvidence: ['media/quality/P1/photo.jpg'],
          certificationDocKey: null // No official certificate
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 400);
        assert.strictEqual(err.code, 'CERTIFICATION_DOCUMENT_REQUIRED');
        return true;
      }
    );
  });

  test('6. Distinguishes SELLER_DECLARED from CERTIFIED in formatting', () => {
    // Case A: Seller uploaded photos -> MUST show Seller-Declared
    const declaredProduct = service.formatProductWithQuality({
      id: 'P101',
      name: 'Tomato',
      grade: 'Grade A',
      seller_declared_grade: 'Grade A',
      verification_type: 'SELLER_DECLARED',
      is_certified: false,
      quality_evidence: ['media/quality/P1/photo.jpg']
    });

    assert.strictEqual(declaredProduct.quality.isCertified, false);
    assert.strictEqual(declaredProduct.quality.displayBadge, 'Seller-Declared: Grade A');
    assert.ok(declaredProduct.quality.disclaimer.includes('self-reported by the seller'));
    assert.ok(!declaredProduct.quality.displayBadge.includes('Officially'));

    // Case B: Official lab certified product
    const certifiedProduct = service.formatProductWithQuality({
      id: 'P102',
      name: 'Wheat',
      grade: 'Grade A',
      seller_declared_grade: 'Grade A',
      verification_type: 'CERTIFIED',
      is_certified: true,
      certification_doc_key: 'media/verification/V1/lab_agmark.pdf'
    });

    assert.strictEqual(certifiedProduct.quality.isCertified, true);
    assert.strictEqual(certifiedProduct.quality.displayBadge, 'Officially Certified: Grade A');
    assert.ok(certifiedProduct.quality.disclaimer.includes('certified by registered agricultural testing body'));
  });

  test('7. formatDisplayBadge maintains canonical quality hierarchy without implying certification', () => {
    // 1. Seller declared
    const declaredBadge = ProductQualityService.formatDisplayBadge({
      verificationType: 'SELLER_DECLARED',
      declaredGrade: 'Grade B',
      isCertified: false
    });
    assert.strictEqual(declaredBadge, 'Seller-Declared: Grade B');
    assert.ok(!declaredBadge.includes('Officially'));

    // 2. AI-assisted visual estimate
    const aiBadge = ProductQualityService.formatDisplayBadge({
      verificationType: 'AI_ASSISTED_ESTIMATE',
      declaredGrade: 'Grade A',
      isCertified: false
    });
    assert.strictEqual(aiBadge, 'AI-Assisted Visual Estimate: Grade A');
    assert.ok(!aiBadge.includes('Officially Certified'));

    // 3. Certified AGMARK
    const agmarkBadge = ProductQualityService.formatDisplayBadge({
      verificationType: 'CERTIFIED_AGMARK',
      declaredGrade: 'Grade A',
      isCertified: true
    });
    assert.strictEqual(agmarkBadge, 'Officially Certified: Grade A');
  });
});
