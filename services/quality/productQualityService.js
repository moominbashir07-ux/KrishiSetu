/**
 * KrishiSetu 2.0 — Product Quality & Grading Service
 * Enforces strict distinction between Seller-Declared Grade, AI Estimates, and Official Certification
 */

const ALLOWED_GRADES = new Set(['Grade A', 'Grade B', 'Grade C', 'Ungraded']);
const ALLOWED_VERIFICATION_TYPES = new Set(['SELLER_DECLARED', 'AI_ASSISTED_ESTIMATE', 'CERTIFIED', 'CERTIFIED_AGMARK']);

class ProductQualityService {
  /**
   * Validates quality declaration payload.
   * @param {Object} qualityPayload
   */
  validateQualityDeclaration(qualityPayload = {}) {
    const {
      sellerDeclaredGrade = 'Ungraded',
      gradeCriteria = '',
      qualityEvidence = [],
      verificationType = 'SELLER_DECLARED',
      certificationDocKey = null
    } = qualityPayload;

    // 1. Grade validation
    const normalizedGrade = String(sellerDeclaredGrade).trim();
    if (!ALLOWED_GRADES.has(normalizedGrade)) {
      const err = new Error(`Invalid declared grade "${normalizedGrade}". Allowed grades: ${Array.from(ALLOWED_GRADES).join(', ')}.`);
      err.code = 'INVALID_PRODUCT_GRADE';
      err.statusCode = 400;
      throw err;
    }

    // 2. Verification type validation
    const normalizedVerifType = String(verificationType).trim().toUpperCase();
    if (!ALLOWED_VERIFICATION_TYPES.has(normalizedVerifType)) {
      const err = new Error(`Invalid verification type "${normalizedVerifType}". Allowed: ${Array.from(ALLOWED_VERIFICATION_TYPES).join(', ')}.`);
      err.code = 'INVALID_VERIFICATION_TYPE';
      err.statusCode = 400;
      throw err;
    }

    // 3. Grade A Policy: Grade A claims MANDATE at least 1 verified photographic proof
    const evidenceArray = Array.isArray(qualityEvidence) ? qualityEvidence : (qualityEvidence ? [qualityEvidence] : []);
    if (normalizedGrade === 'Grade A' && evidenceArray.length === 0) {
      const err = new Error('Policy requirement: "Grade A" listings mandate at least 1 photographic batch evidence reference prior to publication.');
      err.code = 'GRADE_A_EVIDENCE_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    // 4. Evidence reference format validation (must be safe S3 keys or URLs)
    for (const key of evidenceArray) {
      if (typeof key !== 'string' || key.trim() === '') {
        const err = new Error('Quality evidence item must be a non-empty string reference.');
        err.code = 'INVALID_EVIDENCE_FORMAT';
        err.statusCode = 400;
        throw err;
      }
      const cleanKey = key.trim();
      if (cleanKey.includes('<script') || cleanKey.includes('..') || cleanKey.length > 512) {
        const err = new Error('Quality evidence reference contains invalid characters or excessive length.');
        err.code = 'SUSPICIOUS_EVIDENCE_REFERENCE';
        err.statusCode = 400;
        throw err;
      }
    }

    // 5. Certification honesty check: Never allow CERTIFIED without official certification document
    const isCertified = (normalizedVerifType === 'CERTIFIED' || normalizedVerifType === 'CERTIFIED_AGMARK') && Boolean(certificationDocKey);
    if ((normalizedVerifType === 'CERTIFIED' || normalizedVerifType === 'CERTIFIED_AGMARK') && !certificationDocKey) {
      const err = new Error('Official agricultural certification status requires an authenticated certification document key.');
      err.code = 'CERTIFICATION_DOCUMENT_REQUIRED';
      err.statusCode = 400;
      throw err;
    }

    const verificationStatus = isCertified ? 'OFFICIALLY_CERTIFIED' : 'UNVERIFIED_DECLARATION';
    const displayBadge = ProductQualityService.formatDisplayBadge({
      verificationType: normalizedVerifType,
      declaredGrade: normalizedGrade,
      isCertified
    });

    return {
      declaredGrade: normalizedGrade,
      gradeCriteria: String(gradeCriteria || '').trim(),
      qualityEvidence: evidenceArray,
      verificationType: normalizedVerifType,
      verificationStatus,
      displayBadge,
      isCertified,
      certificationDocKey: certificationDocKey || null
    };
  }

  static formatDisplayBadge(input = {}) {
    const opts = typeof input === 'string' ? { verificationType: input } : (input || {});
    const grade = opts.declaredGrade || 'Standard';
    const type = String(opts.verificationType || 'SELLER_DECLARED').toUpperCase();
    const isCertified = Boolean(opts.isCertified || type === 'CERTIFIED' || type === 'CERTIFIED_AGMARK');
    if (isCertified) {
      return `Officially Certified: ${grade}`;
    }
    if (type === 'AI_ASSISTED_ESTIMATE' || type === 'AI_ASSISTED') {
      return `AI-Assisted Visual Estimate: ${grade}`;
    }
    return `Seller-Declared: ${grade}`;
  }

  /**
   * Enriches a raw database product entity with full Quality Trust metadata.
   */
  formatProductWithQuality(product) {
    if (!product) return null;

    let evidence = [];
    if (Array.isArray(product.quality_evidence)) {
      evidence = product.quality_evidence;
    } else if (typeof product.quality_evidence === 'string') {
      try {
        evidence = JSON.parse(product.quality_evidence);
      } catch (e) {
        evidence = product.quality_evidence ? [product.quality_evidence] : [];
      }
    }

    const declaredGrade = product.seller_declared_grade || product.grade || 'Standard';
    const isCertified = Boolean(product.is_certified);
    const verificationType = product.verification_type || 'SELLER_DECLARED';
    const verificationStatus = isCertified ? 'OFFICIALLY_CERTIFIED' : (product.verification_status || 'UNVERIFIED_DECLARATION');

    const displayBadge = ProductQualityService.formatDisplayBadge({
      verificationType,
      declaredGrade,
      isCertified
    });

    return {
      ...product,
      quality: {
        declaredGrade,
        gradeCriteria: product.grade_criteria || '',
        qualityEvidence: evidence,
        verificationType,
        verificationStatus,
        displayBadge,
        isCertified,
        disclaimer: isCertified
          ? 'Grade certified by registered agricultural testing body.'
          : 'Grade is self-reported by the seller. Inspect uploaded photographic evidence before purchase.'
      }
    };
  }
}

module.exports = {
  ProductQualityService,
  ALLOWED_GRADES,
  ALLOWED_VERIFICATION_TYPES
};
