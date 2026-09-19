/**
 * KrishiSetu 2.0 — Dispute State Machine
 * Formally enforces allowed dispute transitions and terminal states
 */

const DISPUTE_TRANSITIONS = {
  'OPEN': new Set(['SELLER_RESPONDED', 'UNDER_REVIEW', 'CANCELLED']),
  'SELLER_RESPONDED': new Set(['UNDER_REVIEW', 'RESOLVED', 'REJECTED']),
  'UNDER_REVIEW': new Set(['RESOLVED', 'REJECTED']),
  'RESOLVED': new Set(),
  'REJECTED': new Set(),
  'CANCELLED': new Set()
};

const ALLOWED_DISPUTE_REASONS = new Set([
  'QUALITY_MISMATCH',
  'WRONG_GRADE',
  'DAMAGED_PRODUCE',
  'QUANTITY_SHORTAGE',
  'NON_DELIVERY'
]);

class DisputeStateMachine {
  static isValidReason(reason) {
    return ALLOWED_DISPUTE_REASONS.has(String(reason).trim().toUpperCase());
  }

  static canTransition(currentStatus, nextStatus) {
    const from = String(currentStatus).trim().toUpperCase();
    const to = String(nextStatus).trim().toUpperCase();

    const allowed = DISPUTE_TRANSITIONS[from];
    if (!allowed) return false;
    return allowed.has(to);
  }

  static validateTransition(currentStatus, nextStatus) {
    const from = String(currentStatus).trim().toUpperCase();
    const to = String(nextStatus).trim().toUpperCase();

    if (!DISPUTE_TRANSITIONS[from]) {
      const err = new Error(`Unknown current dispute state: "${from}".`);
      err.code = 'INVALID_CURRENT_STATE';
      err.statusCode = 400;
      throw err;
    }

    if (!DISPUTE_TRANSITIONS[from].has(to)) {
      const err = new Error(`Illegal dispute state transition from "${from}" to "${to}". Allowed: [${Array.from(DISPUTE_TRANSITIONS[from]).join(', ')}].`);
      err.code = 'ILLEGAL_STATE_TRANSITION';
      err.statusCode = 400;
      throw err;
    }

    return true;
  }
}

module.exports = {
  DisputeStateMachine,
  DISPUTE_TRANSITIONS,
  ALLOWED_DISPUTE_REASONS
};
