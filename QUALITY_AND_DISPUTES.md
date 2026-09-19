# KrishiSetu 2.0 — Quality Verification & Dispute Resolution System

## 1. Context & Judge Feedback Addressed

At previous hackathon presentations, judges raised the fundamental barrier to online farm-to-table commerce:
1. *How can a buyer trust that "Grade A" onions aren't undersized or rotten?*
2. *What happens if a seller declares Grade A but delivers Grade B or C?*
3. *Is there an actual return or dispute mechanism, or does the buyer have to accept whatever is dumped at their door?*
4. *Can an AI model officially certify agricultural quality?*

KrishiSetu 2.0 solves these challenges with an auditable **Grade Transparency Framework** coupled with an **Evidence-Backed Dispute Lifecycle**.

---

## 2. Grade Taxonomy & Trust Hierarchy

To prevent legal liability and deceptive marketing, KrishiSetu 2.0 strictly enforces a three-tier grade taxonomy:

```
+-----------------------------------------------------------------------------------------+
|                                  GRADE TAXONOMY TIERS                                   |
|                                                                                         |
|  [TIER 1: SELLER-DECLARED GRADE]                                                        |
|  - Self-reported by the farmer/FPO based on lot observation.                            |
|  - Requires mandatory photographic evidence (produce overview, size gauge, skin check). |
|  - Displayed with transparent advisory badge: "Seller-Declared".                        |
|                                                                                         |
|  [TIER 2: AI-ASSISTED VISUAL ESTIMATE]                                                  |
|  - Computer-vision analysis of uploaded batch images.                                   |
|  - Evaluates color uniformity, estimated diameter, and surface blemish ratio.           |
|  - EXPLICIT DISCLAIMER: Strictly non-certified; serves as an auxiliary check.          |
|                                                                                         |
|  [TIER 3: CERTIFIED / AGMARK GRADE]                                                     |
|  - Available ONLY when backed by a government-approved AGMARK laboratory test report    |
|    or authorized physical agricultural inspection certificate.                          |
|  - Requires verified PDF document key in storage.                                       |
+-----------------------------------------------------------------------------------------+
```

### Grade Criteria Reference (Example: Tomatoes)
- **Grade A**: Uniform deep red color, firm calyx, diameter $\ge 55\text{ mm}$, $<2\%$ surface defect, zero rot or mechanical splitting.
- **Grade B**: Mixed color/ripeness, diameter $40\text{--}54\text{ mm}$, minor cosmetic skin scarring allowed ($<10\%$), fully edible, zero rot.
- **Grade C / Processing**: Variable sizes ($<40\text{ mm}$), soft texture, blemishes, intended strictly for puree, sauce, or immediate processing.

---

## 3. Quality Evidence Ingestion Protocol

Before a seller can list a produce lot as `Grade A`, the platform requires verifiable proof:

```
[Farmer Listing Screen]
          │
          ▼
Requests S3 Upload URL ──► `/api/storage/presigned-url`
          │
          ▼
Uploads High-Res Photos directly to S3 Bucket
  - Photo 1: Whole lot overview (crates / sorting table)
  - Photo 2: Close-up with scale reference (tape measure or hand)
  - Photo 3: Cross-section / firmness demonstration
          │
          ▼
Farmer specifies declared grade parameters:
  "Declared Grade: Grade A | Criteria: >60mm, uniform redness, firm"
          │
          ▼
Produce Lot published with status: `UNVERIFIED_SELLER_DECLARATION`
```

---

## 4. Return & Dispute Lifecycle State Machine

When delivered goods deviate from what was agreed upon, KrishiSetu provides an escrow-backed dispute workflow:

```
+----------------+      48h Delivery Window      +-------------------+
|   Delivered    | ────────────────────────────► |  Customer Accepts | ──► [COMPLETED]
+----------------+                               +-------------------+
        │
        │ Customer flags mismatch within 48h
        ▼
+--------------------------------------------------------------------+
|                         DISPUTE INITIATED                          |
|  - Reason selected: QUALITY_MISMATCH / WRONG_GRADE / DAMAGED       |
|  - Mandatory customer photo evidence uploaded to S3                |
|  - Claimed condition documented                                    |
+--------------------------------------------------------------------+
        │
        ▼
+--------------------------------------------------------------------+
|                           SELLER REVIEW                            |
|  - Seller receives alert with customer photos & complaint          |
|  - Options:                                                        |
|     1. Accept Claim ──► Issue Partial / Full Refund               |
|     2. Propose Resolution ──► Replacement / Return Pickup          |
|     3. Contest Dispute ──► Submit counter-evidence                 |
+--------------------------------------------------------------------+
        │
        │ If contested or unresolved within 24h
        ▼
+--------------------------------------------------------------------+
|                    AI & ARBITER MEDIATION PHASE                    |
|  - Amazon Bedrock synthesizes an objective Evidence Audit:          |
|    "Seller declared Grade A (>55mm, firm). Customer photos show     |
|     leaking produce with average size ~35mm."                      |
|  - Platform Arbiter reviews side-by-side evidence ledger           |
+--------------------------------------------------------------------+
        │
        ▼
+--------------------------------------------------------------------+
|                         FINAL RESOLUTION                           |
|  - Resolution types: REFUND_PROCESSED | RETURN_INITIATED | REJECTED|
|  - Both buyer and seller profiles updated with dispute outcome     |
|  - Trust score adjustments applied                                 |
+--------------------------------------------------------------------+
```

---

## 5. The Immutable Evidence Timeline Ledger

For any disputed order, the system compiles a chronological ledger accessible to the buyer, seller, and platform admin:

| Timestamp | Event | Actor | Artifacts & Details |
| :--- | :--- | :--- | :--- |
| `2026-09-14 09:30` | **Order Placed** | Buyer | Snapshot: Tomato Grade A, 100 kg @ ₹24/kg. Total: ₹2,400. |
| `2026-09-14 10:15` | **Lot Evidence Registered** | Seller | S3 Key: `quality/lot_overview_1409.jpg` (Seller photo). |
| `2026-09-15 14:00` | **Dispatched / In Transit** | Seller | Transporter tracking number logged. |
| `2026-09-16 11:00` | **Delivered** | Transporter | Delivery confirmed at buyer address. |
| `2026-09-16 14:20` | **Dispute Filed** | Buyer | Reason: `QUALITY_MISMATCH`. S3 Keys: `disputes/bruised_box_1.jpg`, `disputes/size_gauge.jpg`. Claim: "Average size <35mm, 40% bruised." |
| `2026-09-16 16:00` | **AI Evidence Summary** | Bedrock | Objective side-by-side comparison generated. |
| `2026-09-16 17:30` | **Seller Proposed Resolution** | Seller | Offered 40% Partial Refund (₹960) without requiring return of perishable goods. |
| `2026-09-16 18:00` | **Dispute Resolved** | Buyer | Buyer accepted partial refund. Payout ledger updated. |

---

## 6. AI Dispute Assistant (Amazon Bedrock Integration)

To prevent emotional friction and accelerate resolution, **Amazon Bedrock (Claude 3.5 Sonnet)** acts as an objective evidence summarizer:

### Prompt Grounding Contract:
- Injects seller declaration snapshot.
- Injects buyer dispute statement.
- Injects metadata from uploaded photos (timestamps, captions).
- System instruction: *"You are an impartial dispute summarizer for KrishiSetu. Present facts side-by-side. Do not take sides. Do not issue binding legal determinations. Suggest practical remedies based on the evidence."*

### Resulting Output Example:
> **KrishiSetu Dispute Synthesis (Non-Binding Summary)**:
> - **Listing Commitment**: 100 kg Tomatoes, Grade A (>55mm, firm skin, uniform red).
> - **Buyer Complaint**: Produce arrived severely bruised with size under 35mm.
> - **Visual Evidence Evaluation**: Buyer provided 3 timestamped photos showing significant soft damage and a ruler indicating fruit diameters between 30mm and 38mm.
> - **Recommended Next Step**: The evidence strongly indicates Grade B/C produce rather than declared Grade A. A partial refund of 35-50% or full return authorization is consistent with platform policies for perishable goods.
