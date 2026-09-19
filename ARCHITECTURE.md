# KrishiSetu 2.0 — System Architecture

## 1. Executive Summary & Core Positioning

**KrishiSetu 2.0** is an enterprise-grade agricultural marketplace and decision-support platform connecting farmers and Farmer Producer Organizations (FPOs) directly with retail and institutional buyers. 

Unlike conventional generic e-commerce clones or superficial AI wrappers, KrishiSetu 2.0 is engineered around four non-negotiable architectural pillars:
1. **Data Trust**: Verifiable market price intelligence with transparent provenance, observation timestamps, and freshness guarantees.
2. **Quality Trust**: Explicit separation between Seller-Declared Grade, AI-Assisted Quality Estimates, and Official/Certified Grades, supported by immutable photo/document evidence.
3. **Transaction Trust**: End-to-end traceable order lifecycle with a formal dispute and return protocol backed by an auditable evidence timeline.
4. **AI Decision Support**: Guardrailed Amazon Bedrock integrations that provide actionable market advisory, listing generation, and dispute summarization grounded strictly in verified system data without fabrication.

---

## 2. High-Level System Architecture

KrishiSetu 2.0 transitions from a legacy monolithic Node.js/PostgreSQL architecture to an **AWS-Native Serverless Event-Driven Architecture**, optimized for the **First Commit "Ship It"** track.

```
+--------------------------------------------------------------------------------------------------+
|                                      CLIENT APPLICATION LAYER                                    |
|                                                                                                  |
|   +---------------------------------------+       +------------------------------------------+   |
|   |         Farmer / FPO Portal           |       |          Buyer / Consumer Portal         |   |
|   |  - Listing Management & Quality Proof |       |  - Verified Catalog & Mandi Comparison   |   |
|   |  - Order Fulfillment & Dispatch       |       |  - Order Tracking & Delivery Inspection  |   |
|   |  - Bedrock Advisory & Price Trends    |       |  - Dispute Filing & Evidence Submission  |   |
|   +---------------------------------------+       +------------------------------------------+   |
|                                                                                                  |
|   Technology: Modern Responsive Single Page / Progressive Web App (HTML5, TypeScript, Tailwind)  |
|   Hosting: Amazon S3 (Static Website Hosting) + Amazon CloudFront (Edge CDN + TLS Termination)   |
+--------------------------------------------------------------------------------------------------+
                                                 │
                                                 │ HTTPS / REST API
                                                 ▼
+--------------------------------------------------------------------------------------------------+
|                                     EDGE & SECURITY PERIMETER                                    |
|                                                                                                  |
|   [ Amazon CloudFront CDN ] ──► [ AWS WAF ] (Rate Limiting, IP Throttling, SQLi/XSS Shield)     |
|                                         │                                                        |
|                                         ▼                                                        |
|   [ Amazon Cognito User Pool ] ◄── JWT Authentication / RBAC (Farmer, Buyer, Admin, Inspector)    |
+--------------------------------------------------------------------------------------------------+
                                                 │
                                                 │ Authenticated API Requests
                                                 ▼
+--------------------------------------------------------------------------------------------------+
|                                       INGRESS & API GATEWAY                                      |
|                                                                                                  |
|   [ Amazon API Gateway (HTTP / REST APIs) ]                                                      |
|   - Request Validation (OpenAPI / JSON Schema)                                                   |
|   - Cognito Authorizer Integration                                                               |
|   - CORS & Throttling Limits                                                                     |
+--------------------------------------------------------------------------------------------------+
                                                 │
                                                 │ Direct Lambda Routing
                                                 ▼
+--------------------------------------------------------------------------------------------------+
|                               COMPUTE LAYER: AWS LAMBDA MICROSERVICES                            |
|                                                                                                  |
|  +--------------------+  +--------------------+  +--------------------+  +--------------------+  |
|  | Auth & Profile     |  | Catalog & Quality  |  | Orders & Escrow    |  | Disputes & Returns |  |
|  | Lambda Service     |  | Lambda Service     |  | Lambda Service     |  | Lambda Service     |  |
|  +--------------------+  +--------------------+  +--------------------+  +--------------------+  |
|            │                       │                       │                       │             |
|  +--------------------+  +--------------------+  +--------------------+            │             |
|  | Market Intelligence|  | Bedrock AI Advisor |  | Storage Pre-signer |            │             |
|  | & Ingestion Lambda |  | & Assistant Lambda |  | (S3 Uploads Lambda)|            │             |
|  +--------------------+  +--------------------+  +--------------------+            │             |
+--------------------------------------------------------------------------------------------------+
             │                       │                       │                       │
             ▼                       ▼                       ▼                       ▼
+--------------------------------------------------------------------------------------------------+
|                                      PERSISTENCE & STORAGE LAYER                                 |
|                                                                                                  |
|   +---------------------------------------------------+   +----------------------------------+   |
|   |             Amazon DynamoDB (Single-Table)        |   |         Amazon S3 Buckets        |   |
|   |  - Partition Key (PK) & Sort Key (SK)             |   |  - /product-images/              |   |
|   |  - GSI1 (Entity Lookup & Status Queries)          |   |  - /quality-evidence-seller/     |   |
|   |  - GSI2 (Chronological Timelines & Ingestion)     |   |  - /dispute-evidence-buyer/      |   |
|   |  - Point-in-Time Recovery & Encryption at Rest    |   |  - Server-Side Encryption (KMS)  |   |
|   +---------------------------------------------------+   +----------------------------------+   |
+--------------------------------------------------------------------------------------------------+
                                             │                                       ▲
                                             │ Asynchronous Events                   │
                                             ▼                                       │
+------------------------------------------------------------------------------------+             |
|                                 INTELLIGENCE & ASYNC INTEGRATIONS                                |
|                                                                                                  |
|   [ Amazon Bedrock ] (Claude 3.5 Sonnet / Claude 3 Haiku)                                        |
|   - Farmer Market Advisory Engine (Grounded with Mandi Snapshot Context)                         |
|   - Draft Listing Formulator (Transforms raw notes to structured listing)                        |
|   - Dispute Evidence Summarizer (Fact extraction without legal bias)                             |
|                                                                                                  |
|   [ Amazon EventBridge / CloudWatch Scheduled Rules ]                                            |
|   - Mandi Rate Ingestion Cron (Polls data.gov.in / AGMARKNET hourly)                             |
|   - Stale Data Expiration & Health Checker                                                       |
+--------------------------------------------------------------------------------------------------+
```

---

## 3. Detailed Data Flows

### 3.1 Market Intelligence & Data Provenance Flow
To eliminate the ambiguity cited during previous SIH judging:
1. **Scheduled Ingestion**: An EventBridge rule triggers the `MarketIngestionLambda` on an hourly/daily schedule.
2. **Upstream Polling**: The Lambda calls the verified `data.gov.in` AGMARKNET API resource (`9ef84268-d588-465a-a308-a864a43d0070`).
3. **Data Integrity Inspection**:
   - If the upstream response is valid: Parsed fields are stamped with `source: "data.gov.in / AGMARKNET"`, `observedDate: "<DATE>"`, `fetchedAt: "<TIMESTAMP>"`, and `freshness: "LIVE"` (if observed within 24h) or `"RECENT"` (if within 48h).
   - If the upstream response is unavailable or rates are stale (>48h): The system marks the state as `"STALE"`.
   - **Local/Development Environment**: If no API key is provided, the dedicated `MockMarketAdapter` emits records clearly flagged with `source: "MOCK DATA — DEVELOPMENT ONLY"` and `isMock: true`. Under no circumstances are mock records written to persistent production snapshot tables.
4. **Storage**: Ingested records are stored in DynamoDB under `PK=COMMODITY#<name>` and `SK=OBS#<state>#<market>#<date>`.
5. **Consumption**: Client applications query `/api/market-prices` and receive the full data contract, including observation interval and explicit source attribution.

### 3.2 Product Quality Declaration & Evidence Flow
1. **Listing Submission**: A farmer lists a crop (e.g., *Tomato, 500 kg*) and declares a grade (`Grade A`).
2. **Quality Evidence Pre-Signing**: The client requests a signed S3 upload URL via `/api/storage/presigned-url`. The backend generates a short-lived S3 `PutObject` pre-signed URL with strict content-type (`image/jpeg`, `image/png`, `application/pdf`) and size caps (5MB).
3. **Direct-to-S3 Upload**: The seller uploads photos of the harvested produce, sorting table, or weighment slip directly to S3.
4. **Metadata Recording**: The seller creates the product record specifying:
   - `declaredGrade`: "Grade A"
   - `declaredGradeCriteria`: Farmer's stated basis (e.g., "Size > 60mm, uniform redness, firm skin, zero pest puncture")
   - `evidenceKeys`: S3 object references.
   - `gradeVerificationStatus`: `UNVERIFIED_DECLARATION`.
5. **Transparency Display**: Buyers viewing the product see the explicit tag:
   > ⚠️ **Seller-Declared Grade: Grade A** (This grade is self-reported by the seller. Inspect the attached photographic evidence prior to purchase.)

### 3.3 Dispute & Evidence Resolution Flow
1. **Order Delivery**: Once an order is delivered, the customer has a 48-hour inspection window.
2. **Dispute Inception**: If the produce received deviates from the declared grade (e.g., seller declared Grade A, but delivered bruised Grade C produce), the buyer initiates a dispute via `/api/disputes`.
3. **Buyer Evidence Attachment**: The buyer uploads photographic evidence showing the defect alongside the package packaging/label.
4. **State Machine Transition**: The order moves from `Delivered` to `Disputed`.
5. **Evidence Timeline Ledger**: A structured audit trail (`DisputeTimeline`) records:
   - Timestamp 0: Order placed (with seller declaration snapshot).
   - Timestamp 1: Seller dispatch evidence.
   - Timestamp 2: Delivery confirmation.
   - Timestamp 3: Buyer dispute filing + photo evidence + reason: `QUALITY_MISMATCH`.
6. **Seller Response**: The seller is notified and given 24 hours to accept a partial refund, propose return/replacement, or contest.
7. **AI-Assisted Summarization (Amazon Bedrock)**: For platform arbiters or parties, Bedrock generates an objective, side-by-side comparison:
   - *Declared*: "Red, firm, size > 60mm"
   - *Customer Claim*: "Damaged, soft, size < 40mm"
   - *Objective Observation*: "Buyer attached 3 photos displaying skin blemishes and soft texture."
   - *Recommendation/Status*: "Non-binding evidence summary prepared for human arbiter."

---

## 4. AI Flow & Bedrock Guardrails

KrishiSetu 2.0 integrates **Amazon Bedrock** (using Anthropic Claude 3.5 Sonnet / Claude 3 Haiku models) strictly with Retrieval-Augmented Generation (RAG) and domain constraints.

```
+------------------+       +-------------------------+       +-------------------------+
|  User Request    |       |   Lambda Controller     |       | Verified System Context |
|  (Farmer/Buyer)  | ───►  | - Sanitize input        | ◄───  | - Mandi Price DB        |
|                  |       | - Fetch verified context|       | - Active Product DB     |
+------------------+       +-------------------------+       | - Order & Dispute Data  |
                                       │                     +-------------------------+
                                       ▼
                       +-------------------------------+
                       |   Prompt Assembly Engine      |
                       | - System Instructions         |
                       | - Verified Data Grounding     |
                       | - Hallucination Guardrails    |
                       +-------------------------------+
                                       │
                                       ▼
                       +-------------------------------+
                       |        Amazon Bedrock         |
                       | (Claude 3.5 Sonnet / Haiku)   |
                       +-------------------------------+
                                       │
                                       ▼
                       +-------------------------------+
                       | Output Validator & Formatter  |
                       | - Strip ungrounded claims     |
                       | - Verify disclaimers included |
                       +-------------------------------+
                                       │
                                       ▼
                       +-------------------------------+
                       |  Structured Response to Client|
                       +-------------------------------+
```

### 4.1 Strict Guardrail Policies
- **Zero Price Hallucination**: If a farmer asks for market rates in a mandi where data is missing, the AI is instructed: *"No official mandi price data is available for [Commodity] in [Mandi] for this period. Do not estimate or assume prices."*
- **No Legally Binding Certification**: The AI model is strictly prohibited from claiming: *"This crop is certified Grade A by the Ministry of Agriculture."* It must always output: *"AI-assisted observation based on visual parameters. Official certification must be issued by a registered AGMARK testing laboratory."*
- **No Unilateral Dispute Verdicts**: The Dispute Assistant can only synthesize evidence summaries; final financial release or escalation remains strictly in the hands of authorized human arbiters or bilateral agreement.

---

## 5. Security & Trust Boundaries

| Perimeter | Security Mechanism | Responsibility |
| :--- | :--- | :--- |
| **Identity & Authentication** | Amazon Cognito User Pools | Multi-factor authentication, phone/email verification, salted password hashes (SRP protocol), JWT issuance. |
| **Authorization & RBAC** | Cognito Groups & Custom Claims | Granular separation of `Farmer`, `Buyer`, `Inspector`, and `Admin` roles. Strict API Gateway Authorizers. |
| **Data in Transit** | TLS 1.3 Mandatory | CloudFront and API Gateway enforce modern cipher suites; all unencrypted HTTP traffic is rejected. |
| **Data at Rest** | AWS KMS & SSE | S3 buckets encrypted with AWS KMS keys. DynamoDB encrypted at rest via AWS-managed keys. |
| **File Upload Security** | S3 Pre-Signed URLs | Client never touches raw storage credentials. Uploads are constrained by mime-type whitelist, content-length limits (≤ 5 MB), and isolated bucket paths. |
| **API Perimeter Defense** | AWS WAF & Rate Limiting | IP-based rate limiting (100 req/min per IP), AWS Managed Rules for Common Threats, SQLi, and Cross-Site Scripting protection. |
| **Secrets Management** | AWS Secrets Manager / Parameter Store | Zero plaintext secrets in code or repository. Upstream API keys and service tokens injected as Lambda environment variables at deploy-time. |

---

## 6. Migration Strategy: Legacy Monolith to KrishiSetu 2.0

| Architectural Area | Legacy KrishiSetu (v1.0) | KrishiSetu 2.0 (Target AWS Architecture) | Transition / Migration Strategy |
| :--- | :--- | :--- | :--- |
| **Compute** | Monolithic Express.js on single Node.js process | AWS Lambda microservices behind Amazon API Gateway | Extract route handlers into standalone Lambda handlers (`auth`, `catalog`, `orders`, `disputes`, `market`). Keep Express router adapter available for local offline emulation. |
| **Database** | Supabase Postgres + In-memory mock engine in `db/db.js` | Amazon DynamoDB Single-Table Design | Shift relational schema into partitioned NoSQL single-table schema (`PK`, `SK`, `GSI1`, `GSI2`). Local DynamoDB Local / offline emulator for testing. |
| **Authentication** | Custom JWT + EmailJS OTP | Amazon Cognito User Pool | Migrate user registry to Cognito User Pool with built-in SMS/Email OTP and standardized OAuth2/OIDC JWT tokens. |
| **File Storage** | Base64 strings / local URLs | Amazon S3 with Pre-signed URLs | Migrate image storage to private S3 bucket with CloudFront CDN distribution and short-lived upload tickets. |
| **Market Data** | Mixed live API + unchecked fallback generation written to DB | Segregated Ingestion Lambda + strict Data Contract + explicit Mock Adapter | Remove code that writes mock data to snapshots. Strictly tag all API responses with freshness, observation window, and verified source provenance. |
| **AI Integration** | None (pure placeholder UI) | Amazon Bedrock (Claude 3.5 Sonnet) | Implement domain-grounded prompt templates in Bedrock Lambda service for Advisory, Listing Drafting, and Dispute Summarization. |
| **Dispute Resolution** | Non-existent (orders end at 'Completed') | Comprehensive Dispute State Machine & Evidence Timeline | Add DynamoDB dispute entities, S3 evidence ingestion, and state machine transition controls. |
