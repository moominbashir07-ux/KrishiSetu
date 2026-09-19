# KrishiSetu 2.0 — Product Requirements Document (PRD)

## 1. Product Mission & Goals

KrishiSetu 2.0 is built to eliminate the trust deficit in agricultural trade. During a previous Smart India Hackathon (SIH) presentation, judges critically interrogated the platform on:
- Accuracy and time windows of mandi rates
- Source provenance of market data
- Differentiation between claimed produce grades and delivered quality
- Absence of dispute, return, and evidence mechanisms

KrishiSetu 2.0 addresses each of these points directly as core, first-class requirements.

---

## 2. Feature Prioritization Matrix

### 2.1 P0 — Core Hackathon Features (Mandatory for "Ship It" MVP)

| ID | Feature Name | Description & Acceptance Criteria |
| :--- | :--- | :--- |
| **P0-01** | **Farmer Authentication** | Farmer registration and login via mobile/email OTP with role `farmer`. Profile includes farm location, district, state, and primary commodities grown. |
| **P0-02** | **Buyer Authentication** | Buyer registration and login via mobile/email OTP with role `buyer`. Profile includes delivery address, contact details, and buyer category (retail consumer, restaurant, retailer). |
| **P0-03** | **Seller/Farmer Dashboard** | Operational control center for farmers showing active produce listings, current incoming orders, order fulfillment status, and market price benchmarks. |
| **P0-04** | **Buyer Dashboard** | Consumer portal displaying available fresh produce, active orders, tracking status, order history, and dispute management center. |
| **P0-05** | **Product Listings** | Sellers can create listings with commodity name, category, quantity available, unit (`kg`, `quintal`), base price, minimum order quantity, harvest date, and farm origin. |
| **P0-06** | **Product Details View** | Comprehensive item view displaying price, farmer profile, farm distance, harvested date, declared grade, and attached photographic evidence. |
| **P0-07** | **Order Placement & Checkout** | Direct order creation or cart checkout with itemized breakdown, transparent platform fee, delivery address specification, and payment method selection (`COD`, `UPI_QR`). |
| **P0-08** | **Order Lifecycle Tracking** | Linear and auditable order progression: `Order Placed` ➔ `Farmer Confirmed` ➔ `Harvesting/Preparing` ➔ `Dispatched/In Transit` ➔ `Delivered` ➔ `Completed` (or `Disputed`). |
| **P0-09** | **Market-Price Dashboard** | Searchable commodity terminal with filters for State, District, and Mandi. Displays Modal, Minimum, and Maximum arrival rates per quintal. |
| **P0-10** | **Market-Data Source Attribution** | Mandatory UI badge showing the exact provenance of every displayed rate (e.g., `Source: AGMARKNET / data.gov.in (Resource ID: 9ef84268...)` or `MOCK DATA — DEVELOPMENT ONLY`). |
| **P0-11** | **Data Freshness Indicator** | Real-time freshness status tag: `LIVE` (<24 hours old), `RECENT` (<48 hours old), or `STALE` (>48 hours old) calculated against the arrival date. |
| **P0-12** | **Historical Time-Range Selector** | Historical modal price trends viewable over explicit time windows: 7 Days, 15 Days, 30 Days. Must display actual observation date stamps on the X-axis. |
| **P0-13** | **Product Grade Declaration** | Sellers explicitly select a grade (`Grade A`, `Grade B`, `Grade C`) alongside declared grading criteria (e.g., size, color uniformity, moisture content). |
| **P0-14** | **Quality Evidence Upload** | Seller must upload at least 1 high-resolution photograph or inspection document showing the harvested batch before publishing a Grade A listing. |
| **P0-15** | **Quality Mismatch Reporting** | Within 48 hours of delivery, a buyer can flag an order for "Quality Mismatch" (e.g., Seller declared Grade A, but delivered bruised/unripe produce). |
| **P0-16** | **Return / Dispute Workflow** | Formal dispute lifecycle: `DISPUTE_FILED` ➔ `SELLER_REVIEW` ➔ `EVIDENCE_SUBMISSION` ➔ `RESOLUTION_PROPOSED` (Partial Refund / Return / Replacement) ➔ `RESOLVED`. |
| **P0-17** | **Evidence Timeline Ledger** | Immutable audit trail displaying chronological events, photo attachments, seller declarations, and delivery timestamps for disputed orders. |
| **P0-18** | **AI Farmer Advisory (Bedrock)** | AI assistant powered by Amazon Bedrock providing selling insights grounded solely in verified mandi rates and active platform listings without inventing numbers. |
| **P0-19** | **AI-Assisted Listing Creation** | Farmer inputs rough voice/text notes (e.g., "Harvested 20 crates of Nashik onions today morning"), and Bedrock drafts a structured listing for farmer confirmation. |
| **P0-20** | **AWS-Native Serverless Architecture** | Production infrastructure built on Amazon API Gateway, AWS Lambda, Amazon DynamoDB, Amazon S3, Amazon Cognito, and Amazon Bedrock. |

---

### 2.2 P1 — Potential Hackathon Enhancements (Scoped for Phase 2 / Final Polish)

| ID | Feature Name | Description | Priority |
| :--- | :--- | :--- | :--- |
| **P1-01** | **Buyer/Seller Trust Score** | Mathematical reputation score derived from completed order ratio, dispute rate, and average review score. | High P1 |
| **P1-02** | **Smart Mandi Price Alerts** | Automated notification when a local mandi price exceeds a farmer's target selling threshold. | Medium P1 |
| **P1-03** | **Net Realization Calculator** | Dynamic calculation of net payout = `(Mandi Price * Quantity) - Estimated Transport - Platform Fee`. | Medium P1 |
| **P1-04** | **Multilingual AI (Hindi + English)** | Farmers can interact with the Bedrock assistant in Hindi or English (transliteration and native Devanagari). | High P1 |
| **P1-05** | **Anomaly & Fraud Detection** | Rules engine flagging listings with prices >300% or <25% of prevailing modal mandi rates in the same district. | Low P1 |
| **P1-06** | **AI-Assisted Dispute Summarizer** | Amazon Bedrock generates an objective, side-by-side comparison of seller claim vs buyer evidence to accelerate dispute mediation. | High P1 |

---

### 2.3 Explicitly Out-of-Scope Features (Guarding Product Honesty)

To prevent misrepresentation during technical evaluation and judging:

1. **No Unilateral AI Grading Certification**:
   The system will NEVER claim that an AI computer-vision model has certified agricultural grade according to AGMARK/FSSAI government standards. AI quality inspection (if present) is strictly labeled *"AI-Assisted Visual Estimate"* and requires human confirmation.
2. **No Arbitrary Market Price Extrapolation**:
   The system will NEVER synthesize or hallucinate future price forecasts using fictional equations and claim they are predictive AI models.
3. **No Hidden Mock Data**:
   Mock data will NEVER be quietly served under the guise of live government APIs. All non-production data must be prominently stamped `MOCK DATA — DEVELOPMENT ONLY`.
4. **No Automated Financial Seizure**:
   The dispute system will not automatically confiscate funds or issue banking penalties without human mediator or mutual party agreement.
5. **No Speculative Futures Trading**:
   The platform is for spot physical agricultural produce delivery, not commodity derivative trading.
