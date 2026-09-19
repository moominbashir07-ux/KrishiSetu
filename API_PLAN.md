# KrishiSetu 2.0 — API Architecture & Endpoint Plan

## 1. API Design Standards

KrishiSetu 2.0 APIs follow strict RESTful principles:
- **Transport**: HTTPS only via Amazon API Gateway.
- **Authentication**: Bearer JWT issued by Amazon Cognito in `Authorization` header.
- **Payloads**: Strict JSON bodies (`Content-Type: application/json`).
- **Standard Envelopes**:
  - Success: `{ "success": true, "data": { ... }, "meta": { ... } }`
  - Error: `{ "success": false, "error": { "code": "VALIDATION_FAILED", "message": "...", "details": [ ... ] } }`
- **Audit Headers**: Every response returns `X-Request-Id` and `X-Response-Time-Ms`.

---

## 2. API Endpoints Specification

### 2.1 Authentication & Profile (`/api/auth`)

| Method | Path | Auth | Roles | Description | Status Codes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/signup` | Public | Anyone | Register new user (Cognito SignUp). | `201`, `400`, `409` |
| `POST` | `/api/auth/signin` | Public | Anyone | Authenticate with credentials / OTP (Cognito InitiateAuth). Returns JWT tokens. | `200`, `401` |
| `POST` | `/api/auth/send-otp` | Public | Anyone | Request phone/email OTP verification code. | `200`, `429` |
| `POST` | `/api/auth/verify-otp` | Public | Anyone | Submit OTP to confirm registration or signin. | `200`, `400` |
| `GET` | `/api/auth/me` | JWT | Any | Get current authenticated user profile and roles. | `200`, `401` |
| `PUT` | `/api/auth/profile` | JWT | Any | Update profile details (address, primary crops, delivery PIN). | `200`, `400` |

---

### 2.2 Produce Catalog & Quality Declarations (`/api/products`)

| Method | Path | Auth | Roles | Description | Status Codes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/products` | Public | Anyone | List active produce lots. Supports query params: `category`, `commodity`, `state`, `district`, `grade`, `limit`. | `200` |
| `GET` | `/api/products/:id` | Public | Anyone | Fetch comprehensive produce details, seller info, and declared quality evidence. | `200`, `404` |
| `POST` | `/api/products` | JWT | `farmer` | Create a new produce lot with declared grade and S3 photo evidence keys. | `201`, `400`, `403` |
| `PUT` | `/api/products/:id` | JWT | `farmer` | Update listing price, quantity, or description (only listing owner). | `200`, `400`, `403`, `404` |
| `DELETE`| `/api/products/:id` | JWT | `farmer` | Delist / archive produce lot. | `200`, `403`, `404` |

#### Sample Request: `POST /api/products`
```json
{
  "commodity": "Tomato",
  "variety": "Vaibhav Hybrid",
  "category": "Vegetables",
  "description": "Naturally ripened, uniform medium size red tomatoes harvested this morning in Pimpalgaon.",
  "pricePerUnit": 24.50,
  "unit": "kg",
  "availableQuantity": 1500,
  "minOrderQuantity": 50,
  "harvestDate": "2026-09-16",
  "shelfLifeDays": 5,
  "images": [
    "s3://krishisetu-media/products/P101_crate1.jpg",
    "s3://krishisetu-media/products/P101_crate2.jpg"
  ],
  "quality": {
    "declaredGrade": "Grade A",
    "gradeBasis": "Diameter 55-65mm, deep red color, firm calyx, zero fungal or mechanical damage",
    "evidenceImageKeys": [
      "s3://krishisetu-media/quality/Q101_size_gauge.jpg",
      "s3://krishisetu-media/quality/Q101_crate_overview.jpg"
    ],
    "verificationType": "SELLER_DECLARED"
  }
}
```

---

### 2.3 Orders & Escrow Lifecycle (`/api/orders`)

| Method | Path | Auth | Roles | Description | Status Codes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/orders` | JWT | `buyer`, `farmer` | List orders for current user (filtered by role). | `200`, `401` |
| `GET` | `/api/orders/:id` | JWT | `buyer`, `farmer`, `admin` | Fetch full order details, line items, snapshots, and delivery timeline. | `200`, `403`, `404` |
| `POST` | `/api/orders` | JWT | `buyer` | Place order (direct or multi-item cart checkout). Atomically decrements product inventory. | `201`, `400`, `409` |
| `PATCH`| `/api/orders/:id/status` | JWT | `farmer`, `buyer` | Advance order status along validated state machine (`CONFIRMED`, `PREPARING`, `DISPATCHED`, `DELIVERED`, `COMPLETED`). | `200`, `400`, `403` |
| `POST` | `/api/orders/:id/cancel` | JWT | `buyer`, `farmer` | Cancel order prior to dispatch. Reverses inventory. | `200`, `400`, `403` |

---

### 2.4 Disputes & Return Management (`/api/disputes`)

| Method | Path | Auth | Roles | Description | Status Codes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/disputes` | JWT | `buyer` | Raise formal dispute against delivered order. Attaches complaint reason, photo evidence, and claimed condition. | `201`, `400`, `403` |
| `GET` | `/api/disputes/:id` | JWT | `buyer`, `farmer`, `admin` | Fetch dispute record, evidence ledger, timeline, and AI summary. | `200`, `403`, `404` |
| `POST` | `/api/disputes/:id/evidence` | JWT | `buyer`, `farmer` | Attach additional proof (photo/document) to dispute timeline. | `201`, `400`, `403` |
| `POST` | `/api/disputes/:id/respond` | JWT | `farmer` | Seller responds to dispute (offers Partial Refund, Return Acceptance, or Rejection). | `200`, `400`, `403` |
| `POST` | `/api/disputes/:id/resolve` | JWT | `buyer`, `admin` | Buyer accepts proposed resolution, or platform arbiter issues determination. | `200`, `400`, `403` |

#### Sample Request: `POST /api/disputes`
```json
{
  "orderId": "ORD_1726500000_8921",
  "reason": "QUALITY_MISMATCH",
  "description": "Seller declared Grade A (>55mm, firm skin). Upon arrival, over 40% of the tomatoes are undersized (<35mm) and severely bruised with leaky skin.",
  "claimedCondition": "Damaged and undersized produce; fails declared Grade A specification",
  "evidenceKeys": [
    "s3://krishisetu-media/disputes/D201_opened_box.jpg",
    "s3://krishisetu-media/disputes/D201_damaged_tomatoes.jpg",
    "s3://krishisetu-media/disputes/D201_shipping_label.jpg"
  ]
}
```

---

### 2.5 Market Price Intelligence (`/api/market-prices`)

| Method | Path | Auth | Roles | Description | Status Codes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/market-prices` | Public | Anyone | Query latest observed mandi arrival prices. Params: `commodity` (required), `state`, `district`, `market`, `limit`. | `200`, `400` |
| `GET` | `/api/market-prices/history` | Public | Anyone | Query historical modal price time series. Params: `commodity`, `market`, `days` (`7`, `15`, `30`). | `200`, `400` |
| `GET` | `/api/market-prices/sources` | Public | Anyone | Return data provenance and metadata for all upstream data sources. | `200` |

#### Sample Response: `GET /api/market-prices?commodity=Onion&state=Maharashtra&district=Nashik`
```json
{
  "success": true,
  "data": {
    "records": [
      {
        "commodity": "Onion",
        "variety": "Red Onion",
        "grade": "FAQ",
        "market": "Lasalgaon APMC",
        "district": "Nashik",
        "state": "Maharashtra",
        "minPrice": 2400,
        "maxPrice": 3650,
        "modalPrice": 3100,
        "unit": "quintal",
        "observedDate": "2026-09-16",
        "timePeriod": "2026-09-16 06:00 to 14:00 IST",
        "fetchedAt": "2026-09-16T15:30:00Z",
        "dataFreshness": "LIVE",
        "isMock": false,
        "source": {
          "id": "SRC_DATAGOVIN_AGMARKNET",
          "name": "data.gov.in / AGMARKNET",
          "resourceId": "9ef84268-d588-465a-a308-a864a43d0070",
          "publisher": "Ministry of Agriculture and Farmers Welfare, Govt of India"
        }
      }
    ]
  },
  "meta": {
    "count": 1,
    "disclaimer": "Prices are official government mandi arrival rates recorded during market hours. Rates fluctuate based on lot quality and daily supply."
  }
}
```

---

### 2.6 Storage & Pre-signed URLs (`/api/storage`)

| Method | Path | Auth | Roles | Description | Status Codes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/storage/presigned-url` | JWT | `farmer`, `buyer` | Generate a temporary, scoped S3 pre-signed upload URL. Payload specifies `purpose` (`produce_image`, `quality_evidence`, `dispute_evidence`), `contentType`, and `fileSizeBytes`. | `200`, `400`, `401` |

---

### 2.7 AI Assistant & Advisory (`/api/ai`)

| Method | Path | Auth | Roles | Description | Status Codes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/ai/farmer-advisor` | JWT | `farmer` | Ask market decision-support questions (grounded in verified mandi rates). | `200`, `400`, `429` |
| `POST` | `/api/ai/draft-listing` | JWT | `farmer` | Convert informal notes/voice transcript into structured produce draft. | `200`, `400`, `429` |
| `POST` | `/api/ai/summarize-dispute`| JWT | `buyer`, `farmer`, `admin` | Synthesize objective side-by-side dispute evidence summary using Bedrock. | `200`, `400`, `404` |
