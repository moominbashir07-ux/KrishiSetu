# KrishiSetu 2.0 — AWS Services Architecture & Justification

This document details the selected AWS services for KrishiSetu 2.0 for the **First Commit "Ship It"** track. Every service is justified with a specific functional responsibility and engineering rationale. We reject superficial "architecture diagram padding."

---

## 1. Selected AWS Services Matrix

```
                      +------------------------------------------+
                      |         Amazon Cognito User Pool         |
                      |   (Farmer, Buyer & Admin Auth & RBAC)    |
                      +------------------------------------------+
                                           │
                                           ▼
                      +------------------------------------------+
                      |         Amazon API Gateway (REST)        |
                      |   (Secure Ingress, Validation & Routing) |
                      +------------------------------------------+
                                           │
                                           ▼
                      +------------------------------------------+
                      |         AWS Lambda Microservices         |
                      |     (Stateless Serverless Compute)       |
                      +------------------------------------------+
                                    │      │      │
            ┌───────────────────────┘      │      └───────────────────────┐
            ▼                              ▼                              ▼
+-----------------------+      +-----------------------+      +-----------------------+
|    Amazon DynamoDB    |      |       Amazon S3       |      |     Amazon Bedrock    |
| (Single-Table Storage)|      | (Encrypted Artifacts) |      | (Claude 3.5 Advisory) |
+-----------------------+      +-----------------------+      +-----------------------+
            ▲                              ▲
            │                              │
+------------------------------------------------------+
|        Amazon EventBridge (Scheduled Crons)          |
|    (Hourly Ingestion of Gov Mandi Rates from API)    |
+------------------------------------------------------+
```

---

## 2. In-Depth Service Justifications

### 2.1 Amazon Cognito (User Pools)
- **Why we need it**: KrishiSetu requires role-based access control (RBAC) across distinct user archetypes: Farmers, Buyers, and Platform Arbiters. User sessions must be cryptographically verifiable across distributed Lambda functions.
- **What part uses it**: The entire authentication lifecycle (`/api/auth/signup`, `/api/auth/signin`, token refresh, role gating in API Gateway).
- **What problem it solves**: Eliminates homegrown password hashing bugs, vulnerable JWT signing routines, and complex OTP state management. Provides secure SRP (Secure Remote Password) protocol and JSON Web Tokens.
- **Why it is better than pretending**: Provides authentic enterprise identity federation, compliant JWT tokens containing verified role claims (`cognito:groups`), and native API Gateway authorizer integration without bespoke middleware.

### 2.2 Amazon API Gateway
- **Why we need it**: Serves as the unified HTTPS reverse proxy and ingress entry point for all frontend and mobile client traffic.
- **What part uses it**: Routes incoming requests to specialized AWS Lambda functions (`/api/products`, `/api/orders`, `/api/disputes`, `/api/market-prices`, `/api/ai`).
- **What problem it solves**: Manages TLS termination, CORS headers, API rate limiting, IP throttling, and payload schema validation before requests ever touch application compute.
- **Why it is better than pretending**: Enforces perimeter rate limits against DDoS attacks and validates incoming JSON payloads at the edge, reducing compute cost and attack surface.

### 2.3 AWS Lambda
- **Why we need it**: Executes application logic on-demand without managing or provisioning virtual servers.
- **What part uses it**: 
  1. `AuthServiceLambda`: Profile synchronization and post-confirmation triggers.
  2. `CatalogServiceLambda`: Produce listings, stock tracking, and filtering.
  3. `OrderServiceLambda`: Order placement, escrow tracking, and state machine transitions.
  4. `DisputeServiceLambda`: Dispute registration, evidence collection, and status updates.
  5. `MarketIngestionLambda`: Automated ingestion and normalization of government mandi rates.
  6. `StoragePreSignerLambda`: Creation of constrained S3 pre-signed upload URLs.
  7. `BedrockAdvisorLambda`: Retrieval-augmented AI advisory and listing formatting.
- **What problem it solves**: Completely eliminates server idle costs, OS patching, and scaling bottlenecks during harvest rush periods.
- **Why it is better than pretending**: True serverless microservice execution with sub-second cold starts, zero maintenance overhead, and seamless native IAM security boundaries.

### 2.4 Amazon DynamoDB
- **Why we need it**: Provides ultra-fast, single-digit millisecond NoSQL persistence for all high-velocity marketplace data.
- **What part uses it**: Core persistence for `Users`, `Products`, `Orders`, `Disputes`, `EvidenceMetadata`, and `MarketPriceSnapshots`.
- **What problem it solves**: Eliminates relational database connection exhaustion, expensive schema migrations, and complex replication setups.
- **Why it is better than pretending**: Single-Table Design leverages partition keys (`PK`) and sort keys (`SK`) to satisfy all 13 primary platform access patterns with predictable sub-10ms latency. Supports atomic transactions (`TransactWriteItems`) for order fulfillment and dispute state transitions.

### 2.5 Amazon S3 (Simple Storage Service)
- **Why we need it**: Durable, immutable object storage for binary media: produce photos, farmer verification papers, weighment slips, and customer dispute photos.
- **What part uses it**: Direct-to-S3 uploads coordinated via short-lived pre-signed PUT URLs.
- **What problem it solves**: Protects compute servers from handling heavy binary payloads. Provides infinite, cost-effective media durability.
- **Why it is better than pretending**: Client uploads bypass application servers completely via scoped pre-signed URLs with strict MIME-type and file-size constraints. Encrypted at rest via AWS KMS.

### 2.6 Amazon Bedrock (Anthropic Claude 3.5 Sonnet / Haiku)
- **Why we need it**: Provides foundational generative AI capabilities grounded strictly in KrishiSetu's verified market and catalog context.
- **What part uses it**:
  1. **Farmer Advisory Engine**: Formulates market recommendations using verified mandi arrival prices.
  2. **Listing Draft Assistant**: Parses informal farmer speech/notes into structured listings.
  3. **Dispute Summarization**: Synthesizes side-by-side evidence audits for human arbiters.
- **What problem it solves**: Replaces generic, hallucination-prone public LLMs with enterprise-grade AWS models governed by private API contracts and strict system guardrails.
- **Why it is better than pretending**: Directly invoked via AWS SDK (`@aws-sdk/client-bedrock-runtime`). System prompts inject verified real-time database context, enforcing zero-hallucination policies.

### 2.7 Amazon EventBridge (Scheduled Rules)
- **Why we need it**: Reliable serverless cron scheduler.
- **What part uses it**: Triggers `MarketIngestionLambda` on an hourly schedule to sync fresh mandi rates from data.gov.in.
- **What problem it solves**: Removes the need for a constantly running background Node.js process or fragile OS cron daemon.
- **Why it is better than pretending**: Fully managed, highly resilient serverless trigger with automatic retries and dead-letter queues (DLQ).

---

## 3. Services Intentionally NOT Selected (And Why)

Engineering rigor requires knowing what *not* to build. The following AWS services were evaluated and intentionally deferred or rejected:

| Service Evaluated | Status | Technical Rationale for Rejection / Deferral |
| :--- | :--- | :--- |
| **Amazon EC2 / Elastic Beanstalk** | **REJECTED** | Running traditional virtual machines introduces server maintenance, OS patching, idle compute billing, and scaling friction. Serverless Lambda + DynamoDB is lighter, more cost-effective, and technically superior for a modern hackathon project. |
| **Amazon RDS (PostgreSQL / Aurora)** | **REJECTED** | Relational databases suffer from connection limits in serverless Lambda environments (requiring RDS Proxy), slow spin-up times, and high baseline operating costs. DynamoDB Single-Table Design provides better performance, native serverless integration, and zero connection pooling issues. |
| **Amazon OpenSearch Service** | **DEFERRED (Phase 2)** | OpenSearch introduces significant cost overhead and cluster provisioning complexity. For the MVP catalog of hundreds of produce lots, DynamoDB GSI queries and prefix filtering are fast and sufficient. |
| **AWS Step Functions** | **DEFERRED (Phase 2)** | While suitable for complex long-running business workflows, KrishiSetu's order and dispute state transitions can be cleanly and reliably orchestrated using DynamoDB conditional writes and atomic transactions. Adding Step Functions in Phase 0 would add needless deployment complexity. |
| **Amazon Rekognition** | **REJECTED** | Pre-trained vision models lack specialized understanding of agricultural produce maturity, blemish grading, and Indian variety classifications. Promising automated grading via generic Rekognition would be dishonest and misaligned with product trust. |

---

## 4. Hackathon Deployment & Integration Plan

1. **Local Emulation Phase**: 
   - Express mock adapter + DynamoDB Local / In-memory store for rapid local development and unit tests.
   - S3 Local / Mock Pre-signer for local photo uploads.
2. **AWS Cloud Deployment Phase (Ship It Track)**:
   - Infrastructure defined via AWS SAM (Serverless Application Model) or AWS CDK.
   - Cognito User Pool created with Farmer and Buyer groups.
   - DynamoDB table created with On-Demand capacity.
   - S3 Bucket created with CORS and bucket policies.
   - Lambda functions bundled with TypeScript and deployed behind API Gateway.
   - Bedrock permissions configured via IAM least-privilege role (`bedrock:InvokeModel`).
