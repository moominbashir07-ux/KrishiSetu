# KrishiSetu 2.0 — Phase 6: Production Hardening, Observability & Final Trust Layer Report

**Audit Date**: September 2026  
**System Version**: KrishiSetu 2.0 (Post Phase 6 Implementation)  
**Baseline Test Count**: 363 passed, 0 failed, 0 skipped  
**Final Test Count**: **375 passed, 0 failed, 0 skipped across 27 suites**  
**Repository Branch**: `main`  
**Git Remote**: `https://github.com/moominbashir07-ux/KrishiSetu.git`  

---

## 1. Executive Summary

Phase 6 marks the production hardening, end-to-end observability, and final trust layer audit for KrishiSetu 2.0. Every layer—from edge security headers and distributed request tracing down to PostgreSQL transaction locks, market intelligence provenance, and dispute state machines—was forensically audited and verified.

All existing Phase 1 through Phase 5 functionality has been preserved without regression. No mock data was promoted to official streams, no simulated AI claims were made, and no sensitive credentials or hashes are exposed.

---

## 2. Forensic Audit Findings & Severity Classification

| Finding ID | Component | Severity | Description | Remediated Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | `middleware/auth.js` | **HIGH** | Default JWT placeholders could theoretically be deployed in production if `.env` configuration is omitted or defaulted. | **RESOLVED**: Added strict `KNOWN_JWT_PLACEHOLDERS` guard; throws `INSECURE_JWT_SECRET` in production. |
| **SEC-02** | `routes/auth.js` | **MEDIUM** | Missing rate-limiting on registration (`/signup`, `/register`) and password reset endpoints. | **RESOLVED**: Attached `authLimiter` to register/signup and password reset; attached `otpLimiter` to `/verify-otp`. |
| **SEC-03** | `routes/ai.js` | **MEDIUM** | Bedrock AI endpoints lacked dedicated abusive volume throttling. | **RESOLVED**: Attached `aiLimiter` (45 req / 15 min per IP) to all advisory endpoints. |
| **OBS-01** | `middleware/security.js` | **MEDIUM** | Requests lacked end-to-end correlation IDs, impeding distributed log tracing and failure diagnostics. | **RESOLVED**: Added `requestIdMiddleware` emitting `x-request-id` header (`req.id`) across all requests. |
| **OBS-02** | `middleware/security.js` | **LOW** | Centralized `errorHandler` did not surface correlation `requestId` in error responses. | **RESOLVED**: `errorHandler` now includes `{ error, code, requestId }` and sets `x-request-id` header. |
| **OBS-03** | `middleware/security.js` | **LOW** | HTTP request logs lacked correlation ID and sanitized duration telemetry. | **RESOLVED**: Added `requestLogger` with sanitized query string filtering (`token=****`, `password=****`). |
| **API-01** | `routes/orders.js` | **LOW** | Order not found directly sent 404 JSON instead of delegating to centralized error handler with correlation ID. | **RESOLVED**: Order 404s now route via `next(err)` with standard `ORDER_NOT_FOUND` code. |
| **DSP-01** | `services/dispute/disputeStateMachine.js` | **INFORMATIONAL** | State machine lacked explicit `isTerminal` predicate helper. | **RESOLVED**: Added `isTerminal` static method reflecting immutable terminal states (`RESOLVED`, `REJECTED`, `CANCELLED`). |

---

## 3. Security Hardening Verification

### 3.1 Authentication & Credential Shielding
- **Password Protection**: Passwords are never logged in plaintext. `requestLogger` and `errorHandler` automatically scrub `password=****`, `otp=****`, and `Bearer ****`.
- **JWT Integrity**: Rejects expired tokens, invalid signatures, and known default secrets (`change-this-in-production`, `secret`, `jwt_secret`) in production.
- **Account Status Guard**: Frozen or suspended accounts are immediately rejected with `403 Forbidden` (`Account is frozen/suspended.`).

### 3.2 Authorization & IDOR Shields
- **Orders**: Non-owner sellers are strictly rejected with `403 Forbidden` when attempting to modify order status.
- **Reviews**: Sellers can only inspect reviews submitted for their own listings.
- **Storage**: Sellers cannot generate presigned upload URLs for products they do not own.
- **Disputes**: Only administrators (`role === 'admin'`) can resolve or reject disputes. Non-admins receive `403 Forbidden`.

### 3.3 Database Integrity & Concurrency
- **Inventory Concurrency**: Atomically verified via PostgreSQL transaction locks (`FOR UPDATE`) preventing negative stock and overselling.
- **Terminal Order Immutability**: Orders in `Completed`, `Cancelled`, or `Rejected` states have empty transition sets; any status modification attempt yields `400 Bad Request`.
- **Safe Migrations**: Idempotent startup checks execute with error trapping; database errors are sanitized to prevent internal SQL disclosure.

---

## 4. Market Data & Product Quality Trust Layers

### 4.1 Market Intelligence Separation
- **Data Freshness Engine**: Computed strictly based on observation timestamps:
  - `LIVE`: $\le 24$ hours
  - `RECENT`: $> 24$ hours and $\le 48$ hours
  - `STALE`: $> 48$ hours
  - `UNAVAILABLE`: Missing or invalid observation timestamp
- **Provenance Isolation**: DataGov service enforces strict isolation between external APMC APIs and mock fallbacks. Mock data is blocked from being written to historical official storage.

### 4.2 Product Quality Badging Hierarchy
- **`SELLER_DECLARED`**: Clearly formatted as `"Seller-Declared: Grade [X]"` with required photographic evidence.
- **`AI_ASSISTED_ESTIMATE`**: Clearly formatted as `"AI-Assisted Visual Estimate: Grade [X]"`.
- **`CERTIFIED_AGMARK`**: Formatted as `"Officially Certified: Grade [X]"` only when accompanied by verified official certification documents.

---

## 5. Dispute System Integrity

- **Filing Validation**: Only the buyer associated with a delivered/completed order can initiate a dispute.
- **Reason Whitelist**: Strictly restricted to validated categories: `QUALITY_MISMATCH`, `WRONG_GRADE`, `DAMAGED_PRODUCE`, `QUANTITY_SHORTAGE`, `NON_DELIVERY`.
- **State Machine Transitions**:
  - `OPEN` $\rightarrow$ `SELLER_RESPONDED` \| `UNDER_REVIEW` \| `CANCELLED`
  - `SELLER_RESPONDED` $\rightarrow$ `UNDER_REVIEW` \| `RESOLVED` \| `REJECTED`
  - `UNDER_REVIEW` $\rightarrow$ `RESOLVED` \| `REJECTED`
  - `RESOLVED`, `REJECTED`, `CANCELLED` are immutable terminal states.

---

## 6. AI Safety & Grounding

- **Advisory Framing**: All Bedrock advisory responses are framed as non-binding estimates.
- **Production Guard**: In production, if AWS Bedrock credentials/endpoints are unreachable, the system throws `503 UnavailableBedrockProvider` rather than silently fabricating mock AI advice.
- **Rate Limiting**: AI endpoints are protected by `aiLimiter` (45 requests / 15 minutes) to protect against API exhaustion and denial of service.

---

## 7. Automated Test Suite Results

```text
Test command: npm test
Environment: Node.js 22.14.0 (built-in test runner)

ℹ tests 375
ℹ suites 27
ℹ pass 375
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

### Phase 6 Test Breakdown (`tests/phase6_production_hardening.test.js`)
1. `Automatically assigns x-request-id to incoming requests if not provided` (PASS)
2. `Preserves client-supplied x-request-id header for distributed tracing` (PASS)
3. `Error responses include correlation requestId and machine-readable code` (PASS)
4. `Throws INSECURE_JWT_SECRET if production runs with known default placeholder` (PASS)
5. `Rejects authentication when account_status is frozen with 403` (PASS)
6. `Completed order cannot transition to any other status` (PASS)
7. `Non-owner seller cannot modify an order (IDOR shield)` (PASS)
8. `Correctly computes data freshness categories without hallucination` (PASS)
9. `DataGov provider isolates mock data from official streams` (PASS)
10. `formatDisplayBadge strictly labels official certification vs seller declaration` (PASS)
11. `Non-admin users are rejected from resolving disputes with 403` (PASS)
12. `DisputeStateMachine defines valid transitions and immutable terminal states` (PASS)

---

## 8. Git & Secret Audit

- **Secret Scan**: Clean. Staged and unstaged files contain no unencrypted private keys, passwords, database passwords, or JWT secrets.
- **Environment Files**: `.env` and `.env.*` remain strictly excluded via `.gitignore`.
- **Repository Cleanliness**: No temporary artifacts or debug dumps committed.

---

## 9. Known Limitations & Remaining Risks

1. **Embedded SQLite / Memory Fallback in Local Dev**: In local development environments without an active PostgreSQL instance, the embedded fallback engine is utilized. In production, Supabase / PostgreSQL with SSL and RLS is mandatory.
2. **Third-Party Mandi API Outages**: If the Indian government APMC API gateway (`data.gov.in`) experiences intermittent latency or rate limits, the UI correctly flags market data as `STALE` or `UNAVAILABLE` rather than hallucinating artificial live prices.
