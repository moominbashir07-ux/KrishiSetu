# 🌾 KrishiSetu 2.0 — From Farm to Customer

> **"KrishiSetu is a trusted agricultural marketplace and decision-support layer that connects farmers with buyers while making market data, product quality, and transactions traceable."**

Built for the **First Commit Hackathon (Ship It Track) by WeMakeDevs & AWS**.

---

## 🌟 The Core Problem & Our Differentiators

Most agricultural platforms fall into one of two traps: they are either generic e-commerce clones that ignore farm-level realities, or superficial AI wrappers that hallucinate prices and pretend to solve farming issues.

During our previous hackathon defense, judges asked hard, pragmatic questions:
- *Why should anyone believe the market-price graph is accurate?*
- *What exact time period does the chart represent?*
- *Where does this market data originate from?*
- *How can a customer determine whether delivered produce is genuinely Grade A or Grade B?*
- *What happens if a seller declares Grade A but delivers bruised Grade C produce?*
- *Is there a verifiable return and dispute mechanism?*

KrishiSetu 2.0 answers every one of these questions with structural guarantees:

| Trust Dimension | The Problem | The KrishiSetu 2.0 Solution |
| :--- | :--- | :--- |
| **Data Trust** | Opaque, unverified, or fabricated market prices. | Strict data contracts citing official sources (AGMARKNET/data.gov.in), arrival observation dates, and real-time freshness badges (`LIVE`, `RECENT`, `STALE`). Dedicated, isolated mock adapters for local testing—never mixed with production data. |
| **Quality Trust** | False "Grade A" claims without proof or accountability. | Explicit three-tier grading taxonomy (Seller-Declared vs AI-Assisted Estimate vs Certified AGMARK), supported by mandatory photographic batch proof before publishing. |
| **Transaction Trust** | Buyers left stranded when deliveries don't match declarations. | Complete, auditable order lifecycle backed by a 48-hour inspection window, an immutable evidence timeline, and a formal return/dispute state machine. |
| **AI Decision Support** | Hallucinated pricing and generic chatbots. | Amazon Bedrock (Claude 3.5 Sonnet) decision-support engine strictly grounded in verified real-time mandi data and active platform listings with zero price fabrication. |

---

## 🏗 System Architecture

KrishiSetu 2.0 is engineered as an **AWS-Native Serverless Architecture**:

```
+-----------------------------------------------------------------------------------------+
|                                  CLIENT LAYER (SPA / PWA)                               |
|        Farmer Control Center  |  Buyer Marketplace  |  Mandi Intelligence Terminal      |
+-----------------------------------------------------------------------------------------+
                                             │
                                             ▼
+-----------------------------------------------------------------------------------------+
|                                EDGE & SECURITY PERIMETER                                |
|        Amazon CloudFront CDN  |  AWS WAF  |  Amazon Cognito (RBAC JWT Auth)             |
+-----------------------------------------------------------------------------------------+
                                             │
                                             ▼
+-----------------------------------------------------------------------------------------+
|                                INGRESS & API GATEWAY                                    |
|                       Amazon API Gateway (REST API Router & Validations)                |
+-----------------------------------------------------------------------------------------+
                                             │
                                             ▼
+-----------------------------------------------------------------------------------------+
|                              COMPUTE LAYER: AWS LAMBDA                                  |
|   AuthService  |  CatalogService  |  OrderService  |  DisputeService  |  MandiIngestion |
+-----------------------------------------------------------------------------------------+
                     │                                   │                       │
                     ▼                                   ▼                       ▼
+---------------------------------------+   +-------------------------+   +---------------+
|     Amazon DynamoDB (Single-Table)    |   |    Amazon S3 (Media)    |   | Amazon Bedrock|
|  - Users, Products, Orders, Disputes  |   |  - Harvest Proof        |   | - Advisory    |
|  - Sub-10ms queries, TransactWrites   |   |  - Dispute Photos       |   | - Summarizer  |
+---------------------------------------+   +-------------------------+   +---------------+
```

---

## 🗺 Documentation Map (Phase 0 Deliverables)

- 📘 [ARCHITECTURE.md](file:///c:/Users/moomi/OneDrive/Desktop/sites/krishisetu/ARCHITECTURE.md) — System architecture, AWS topologies, data flows, and security boundaries.
- 📋 [REQUIREMENTS.md](file:///c:/Users/moomi/OneDrive/Desktop/sites/krishisetu/REQUIREMENTS.md) — P0 core features, P1 extensions, and out-of-scope constraints.
- 🗄 [DATA_MODEL.md](file:///c:/Users/moomi/OneDrive/Desktop/sites/krishisetu/DATA_MODEL.md) — Entity schemas, relationships, and Amazon DynamoDB Single-Table Design.
- ☁️ [AWS_SERVICES.md](file:///c:/Users/moomi/OneDrive/Desktop/sites/krishisetu/AWS_SERVICES.md) — AWS service responsibilities, justifications, and services intentionally rejected.
- 🌐 [API_PLAN.md](file:///c:/Users/moomi/OneDrive/Desktop/sites/krishisetu/API_PLAN.md) — Complete REST endpoint catalog, request/response contracts, and status codes.
- 🔍 [DATA_TRUST.md](file:///c:/Users/moomi/OneDrive/Desktop/sites/krishisetu/DATA_TRUST.md) — Market data provenance, freshness rules, timestamps, and mock data policies.
- ⚖️ [QUALITY_AND_DISPUTES.md](file:///c:/Users/moomi/OneDrive/Desktop/sites/krishisetu/QUALITY_AND_DISPUTES.md) — Grading taxonomy, photo evidence upload, and dispute timeline ledger.

---

## 🛠 Local Setup & Environment Variables

Copy the clean environment configuration template:

```bash
cp .env.example .env
```

Review `.env.example` to configure:
- Server configuration (`PORT`, `NODE_ENV`)
- AWS Credentials & Region (`AWS_REGION`, `AWS_DYNAMODB_TABLE`, `AWS_S3_MEDIA_BUCKET`)
- Amazon Bedrock Model ID
- Government Open Data API Key (`DATA_GOV_IN_API_KEY`)

*Note: Never commit secrets, tokens, or API keys into git.*

---

## 📅 Development Roadmap

- **Phase 0 (Completed)**: Product architecture, PRD, data model, DynamoDB schema, AWS selection, API plan, data-trust protocol, quality & dispute specifications.
- **Phase 1 (Next Step)**: 
  - AWS Lambda microservice stubs & DynamoDB client integration.
  - S3 pre-signed upload handler for quality evidence.
  - Verified Mandi Ingestion module with data freshness tags.
  - Dispute lifecycle state transitions and evidence timeline.
- **Phase 2**: Full UI integration, Amazon Bedrock Advisory & Dispute Summarizer, end-to-end user flows.

---

## 📜 Credits & Hackathon Track

Built with dedication for the **First Commit Hackathon (Ship It Track) by WeMakeDevs & AWS**.
Team **Code Red**.
