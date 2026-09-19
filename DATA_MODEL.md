# KrishiSetu 2.0 — Data Model Specification & DynamoDB Design

## 1. Overview & Storage Strategy

KrishiSetu 2.0 adopts an optimized **Amazon DynamoDB Single-Table Design** pattern, complemented by **Amazon S3** for binary artifacts (produce photos, verification docs, dispute evidence). 

This design:
- Provides sub-10ms query latency at any scale.
- Eliminates relational join overhead on high-frequency queries.
- Ensures atomic transactional updates for order lifecycle transitions and dispute submissions using `TransactWriteItems`.

---

## 2. Core Entity Definitions

### 2.1 User
Represents an authenticated principal in the system (authenticated via Amazon Cognito).

| Field | Type | Required | Description & Validation |
| :--- | :--- | :--- | :--- |
| `id` | String | Yes | Unique ID formatted as `USR_<cognito_sub_uuid>`. |
| `cognitoSub` | String | Yes | Amazon Cognito User Sub. |
| `name` | String | Yes | Full Name (2 to 100 characters). |
| `contact` | String | Yes | Unique Email or E.164 Phone (`+91XXXXXXXXXX`). |
| `role` | String | Yes | Enum: `'farmer'`, `'buyer'`, `'admin'`. |
| `status` | String | Yes | Enum: `'active'`, `'suspended'`, `'pending_verification'`. |
| `createdAt` | ISO 8601 | Yes | Creation timestamp. |
| `updatedAt` | ISO 8601 | Yes | Last update timestamp. |

---

### 2.2 FarmerProfile
Extended attributes specific to agricultural sellers and FPOs.

| Field | Type | Required | Description & Validation |
| :--- | :--- | :--- | :--- |
| `userId` | String | Yes | Foreign key referencing `User.id`. |
| `farmName` | String | Yes | Farm / Business / FPO Name (3-150 characters). |
| `state` | String | Yes | Operating Indian State (e.g., `'Maharashtra'`). |
| `district` | String | Yes | Operating District (e.g., `'Nashik'`). |
| `villageOrTaluk`| String | No | Village / Tehsil location. |
| `pincode` | String | Yes | 6-digit Indian postal code. |
| `geoCoordinates`| Object | No | `{ latitude: Number, longitude: Number }`. |
| `primaryCrops` | Array | Yes | Array of commodity strings (e.g., `['Tomato', 'Onion']`). |
| `landAcreage` | Number | No | Approximate farm size in acres. |
| `verifiedStatus`| String | Yes | Enum: `'unverified'`, `'document_submitted'`, `'verified'`. |
| `trustScore` | Number | Yes | Default: 100.0 (Range: 0.0 to 100.0). |

---

### 2.3 BuyerProfile
Extended attributes for retail consumers and commercial buyers.

| Field | Type | Required | Description & Validation |
| :--- | :--- | :--- | :--- |
| `userId` | String | Yes | Foreign key referencing `User.id`. |
| `buyerType` | String | Yes | Enum: `'retail_consumer'`, `'restaurant'`, `'wholesaler'`. |
| `deliveryAddress`| String | Yes | Street address. |
| `city` | String | Yes | City / Town. |
| `district` | String | Yes | District. |
| `state` | String | Yes | State. |
| `pincode` | String | Yes | 6-digit Indian PIN. |
| `preferredRadiusKm`| Number | No | Maximum local sourcing distance. |

---

### 2.4 Product
Represents an available lot/listing of agricultural produce.

| Field | Type | Required | Description & Validation |
| :--- | :--- | :--- | :--- |
| `id` | String | Yes | Format: `PROD_<timestamp>_<random>`. |
| `sellerId` | String | Yes | References `User.id` (must have role `'farmer'`). |
| `commodity` | String | Yes | Canonical commodity name (e.g., `'Tomato'`). |
| `variety` | String | No | Agricultural variety (e.g., `'Vaibhav'`, `'Hybrid'`). |
| `category` | String | Yes | Enum: `'Vegetables'`, `'Fruits'`, `'Grains'`, `'Pulses'`, `'Spices'`. |
| `description` | String | Yes | Minimum 10 chars, maximum 1000 chars. |
| `pricePerUnit` | Number | Yes | Positive number (> 0). |
| `unit` | String | Yes | Enum: `'kg'`, `'quintal'`, `'crate'`, `'ton'`. |
| `availableQuantity`| Number | Yes | Remaining stock (>= 0). |
| `minOrderQuantity` | Number | Yes | Minimum purchase quantity (default: 1). |
| `harvestDate` | ISO Date | Yes | Date harvested (`YYYY-MM-DD`). Cannot be future date. |
| `shelfLifeDays` | Number | No | Expected shelf life in days. |
| `status` | String | Yes | Enum: `'active'`, `'sold_out'`, `'delisted'`. |
| `images` | Array | Yes | Array of S3 image keys (minimum 1 required). |
| `quality` | Object | Yes | Embedded `ProductQuality` declaration. |
| `createdAt` | ISO 8601 | Yes | Creation timestamp. |
| `updatedAt` | ISO 8601 | Yes | Last modification timestamp. |

---

### 2.5 ProductQuality
Explicit quality and grading declaration embedded in the Product entity.

| Field | Type | Required | Description & Validation |
| :--- | :--- | :--- | :--- |
| `declaredGrade` | String | Yes | Enum: `'Grade A'`, `'Grade B'`, `'Grade C'`, `'Ungraded'`. |
| `gradeBasis` | String | Yes | Stated criteria: Size, color, ripeness, defects. |
| `evidenceImageKeys`| Array | Yes | S3 keys of harvested batch photos / proof. |
| `verificationType`| String | Yes | Constant: `'SELLER_DECLARED'` (or `'AI_ASSISTED_ESTIMATE'`, `'CERTIFIED_AGMARK'`). |
| `inspectionNotes` | String | No | Optional seller or visual observation remarks. |
| `certificationDocKey`| String | No | S3 key if official lab certificate exists (Optional). |

---

### 2.6 MarketPrice
Mandi arrival rates observed from verified government sources or mock adapter.

| Field | Type | Required | Description & Validation |
| :--- | :--- | :--- | :--- |
| `id` | String | Yes | Format: `MP_<state>_<market>_<commodity>_<date>`. |
| `commodity` | String | Yes | Standardized commodity name (e.g., `'Onion'`). |
| `variety` | String | Yes | Specific variety (e.g., `'Red Onion'`, `'Local'`). |
| `grade` | String | Yes | Mandi arrival grade (e.g., `'FAQ'`, `'Medium'`). |
| `market` | String | Yes | Mandi/APMC Name (e.g., `'Lasalgaon APMC'`). |
| `district` | String | Yes | District (e.g., `'Nashik'`). |
| `state` | String | Yes | State (e.g., `'Maharashtra'`). |
| `minPrice` | Number | Yes | Minimum observed price in INR per quintal. |
| `maxPrice` | Number | Yes | Maximum observed price in INR per quintal. |
| `modalPrice` | Number | Yes | Modal (most common) price in INR per quintal. |
| `unit` | String | Yes | Standardized: `'quintal'`. |
| `observedDate` | ISO Date | Yes | `YYYY-MM-DD` of arrival. |
| `fetchedAt` | ISO 8601 | Yes | Ingestion timestamp. |
| `dataFreshness`| String | Yes | Calculated: `'LIVE'` (<24h), `'RECENT'` (<48h), `'STALE'`. |
| `timePeriod` | String | Yes | Exact observation window (e.g., `'2026-09-15 06:00 to 14:00'`). |
| `sourceId` | String | Yes | References `MarketDataSource.id`. |
| `isMock` | Boolean | Yes | `true` if generated by development mock adapter; `false` if verified. |

---

### 2.7 MarketDataSource
Data provenance metadata tracking upstream API origins.

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | String | Yes | e.g., `'SRC_DATAGOVIN_AGMARKNET'`, `'SRC_MOCK_DEV'`. |
| `name` | String | Yes | Human-readable name (e.g., `'Open Government Data Platform India / AGMARKNET'`). |
| `resourceId` | String | No | Upstream API ID (`9ef84268-d588-465a-a308-a864a43d0070`). |
| `url` | String | Yes | Source URL / portal link. |
| `publisher` | String | Yes | e.g., `'Ministry of Agriculture and Farmers Welfare, Govt of India'`. |
| `termsOfUse` | String | Yes | Usage license (e.g., `'National Data Sharing and Accessibility Policy (NDSAP)'`). |

---

### 2.8 Order
Transactional agreement between a buyer and a seller for farm produce.

| Field | Type | Required | Description & Validation |
| :--- | :--- | :--- | :--- |
| `id` | String | Yes | Format: `ORD_<timestamp>_<random>`. |
| `orderNumber` | String | Yes | Human-readable: `KS-2026-XXXXX`. |
| `customerId` | String | Yes | References `User.id` (role: `'buyer'`). |
| `sellerId` | String | Yes | References `User.id` (role: `'farmer'`). |
| `status` | String | Yes | Enum: `'ORDER_PLACED'`, `'FARMER_CONFIRMED'`, `'PREPARING'`, `'DISPATCHED'`, `'DELIVERED'`, `'COMPLETED'`, `'DISPUTED'`, `'CANCELLED'`. |
| `items` | Array | Yes | Array of embedded `OrderItem` objects. |
| `itemSubtotal` | Number | Yes | Sum of line items. |
| `platformFee` | Number | Yes | Transparent platform fee (0.5% - 2.0%). |
| `totalAmount` | Number | Yes | `itemSubtotal + platformFee`. |
| `paymentMethod`| String | Yes | Enum: `'COD'`, `'UPI_QR'`. |
| `paymentStatus`| String | Yes | Enum: `'PENDING'`, `'SUBMITTED'`, `'VERIFIED'`, `'REFUNDED'`. |
| `transactionId`| String | No | UPI reference / Transaction ID if paid electronically. |
| `deliveryDetails`| Object | Yes | Recipient name, phone, address, instructions. |
| `createdAt` | ISO 8601 | Yes | Order placement time. |
| `updatedAt` | ISO 8601 | Yes | Last transition time. |

---

### 2.9 OrderItem
Specific line item within an order, capturing immutable snapshot of listing at purchase.

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `productId` | String | Yes | References `Product.id`. |
| `commoditySnapshot`| String | Yes | Commodity name at time of order. |
| `declaredGradeSnapshot`| String | Yes | Declared grade at time of order (e.g., `'Grade A'`). |
| `unitPriceSnapshot` | Number | Yes | Price per unit at checkout. |
| `unit` | String | Yes | Measurement unit (`kg`, `quintal`). |
| `quantity` | Number | Yes | Purchased quantity (> 0). |
| `subtotal` | Number | Yes | `quantity * unitPriceSnapshot`. |

---

### 2.10 Dispute
Formal conflict record raised when delivered goods violate declared terms.

| Field | Type | Required | Description & Validation |
| :--- | :--- | :--- | :--- |
| `id` | String | Yes | Format: `DSP_<timestamp>_<random>`. |
| `orderId` | String | Yes | References `Order.id`. |
| `claimantId` | String | Yes | `User.id` of buyer filing dispute. |
| `respondentId`| String | Yes | `User.id` of farmer responding. |
| `reason` | String | Yes | Enum: `'QUALITY_MISMATCH'`, `'WRONG_GRADE'`, `'DAMAGED_PRODUCE'`, `'QUANTITY_SHORTAGE'`, `'NON_DELIVERY'`. |
| `description` | String | Yes | Buyer explanation (min 20, max 2000 chars). |
| `declaredGrade` | String | Yes | Snapshot of seller's grade. |
| `claimedCondition`| String| Yes | Specific defect observed by buyer. |
| `status` | String | Yes | Enum: `'OPEN'`, `'SELLER_REVIEW'`, `'EVIDENCE_SUBMITTED'`, `'RESOLUTION_PROPOSED'`, `'RESOLVED'`, `'REJECTED'`. |
| `resolutionOffer`| Object | No | `{ type: 'PARTIAL_REFUND'|'RETURN'|'REPLACE', amount: Number, notes: String }`. |
| `aiSummary` | String | No | Objective summary synthesized by Amazon Bedrock. |
| `createdAt` | ISO 8601 | Yes | Time of dispute filing. |
| `resolvedAt` | ISO 8601 | No | Time of formal dispute closure. |

---

### 2.11 Evidence
Individual proof artifact attached to an order or dispute timeline.

| Field | Type | Required | Description & Validation |
| :--- | :--- | :--- | :--- |
| `id` | String | Yes | Format: `EVD_<timestamp>_<random>`. |
| `targetType` | String | Yes | Enum: `'ORDER'`, `'DISPUTE'`. |
| `targetId` | String | Yes | References `Order.id` or `Dispute.id`. |
| `uploaderId` | String | Yes | References `User.id`. |
| `uploaderRole`| String | Yes | Enum: `'farmer'`, `'buyer'`, `'admin'`. |
| `evidenceType`| String | Yes | Enum: `'PHOTO'`, `'VIDEO'`, `'INVOICE'`, `'WEIGHMENT_SLIP'`. |
| `s3Key` | String | Yes | Private S3 object path. |
| `mimeType` | String | Yes | Enum: `'image/jpeg'`, `'image/png'`, `'application/pdf'`. |
| `fileSizeBytes`| Number | Yes | Positive integer (max 5 MB). |
| `caption` | String | No | Descriptive text of proof. |
| `capturedAt` | ISO 8601 | No | EXIF timestamp if extracted from photo. |
| `uploadedAt` | ISO 8601 | Yes | Time of upload. |

---

### 2.12 Notification
In-app notification dispatched to users for order and dispute events.

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | String | Yes | Format: `NTF_<timestamp>_<random>`. |
| `recipientId`| String | Yes | References `User.id`. |
| `type` | String | Yes | Enum: `'ORDER_UPDATE'`, `'DISPUTE_ALERT'`, `'PRICE_ALERT'`. |
| `title` | String | Yes | Short subject line. |
| `message` | String | Yes | Detailed body text. |
| `actionUrl` | String | No | Link to relevant order or dispute page. |
| `read` | Boolean | Yes | Default: `false`. |
| `createdAt` | ISO 8601 | Yes | Dispatch timestamp. |

---

### 2.13 AIInteraction
Audit record of interactions with Amazon Bedrock to verify ground truth and prevent hallucination drift.

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | String | Yes | Format: `AI_<timestamp>_<random>`. |
| `userId` | String | Yes | References `User.id`. |
| `taskType` | String | Yes | Enum: `'FARMER_ADVISORY'`, `'LISTING_ASSISTANCE'`, `'DISPUTE_SUMMARY'`. |
| `promptPayload` | Object | Yes | Cleaned prompt and system instruction. |
| `groundingContext`| Object | Yes | Exact mandi rates and catalog items provided to model. |
| `modelId` | String | Yes | Bedrock Model ID (`anthropic.claude-3-5-sonnet-20240620-v1:0`). |
| `rawResponse` | String | Yes | Model output text. |
| `tokensConsumed`| Object | No | `{ promptTokens: Number, completionTokens: Number }`. |
| `createdAt` | ISO 8601 | Yes | Execution timestamp. |

---

## 3. DynamoDB Single-Table Schema Design

KrishiSetu 2.0 uses a single DynamoDB table named **`KrishiSetuCore`**.

### 3.1 Primary Keys & Global Secondary Indexes (GSIs)
- **Partition Key (PK)**: String
- **Sort Key (SK)**: String
- **GSI1-PK**: String
- **GSI1-SK**: String
- **GSI2-PK**: String
- **GSI2-SK**: String

### 3.2 Access Pattern Mapping Table

| Entity / Access Pattern | PK | SK | GSI1-PK | GSI1-SK | GSI2-PK | GSI2-SK |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Get User by ID** | `USER#<userId>` | `PROFILE` | `CONTACT#<contact>` | `USER#<userId>` | - | - |
| **Get User by Contact** | - | - | `CONTACT#<contact>` | `USER#<userId>` | - | - |
| **Get Product by ID** | `PRODUCT#<prodId>` | `METADATA` | `STATUS#active` | `COMMODITY#<name>` | `SELLER#<sellerId>`| `PROD#<prodId>` |
| **List Active Products by Category** | `CATEGORY#<cat>` | `PROD#<prodId>` | `STATUS#active` | `CREATED#<date>` | - | - |
| **List Seller's Products** | `USER#<sellerId>` | `PROD#<prodId>` | - | - | `SELLER#<sellerId>`| `CREATED#<date>` |
| **Get Order by ID** | `ORDER#<orderId>` | `METADATA` | `BUYER#<buyerId>` | `CREATED#<date>` | `SELLER#<sellerId>`| `CREATED#<date>` |
| **List Orders for Buyer** | - | - | `BUYER#<buyerId>` | `CREATED#<date>` | - | - |
| **List Orders for Farmer**| - | - | - | - | `SELLER#<sellerId>`| `CREATED#<date>` |
| **Get Dispute by ID** | `DISPUTE#<dispId>`| `METADATA` | `ORDER#<orderId>` | `DISPUTE` | `STATUS#<status>` | `CREATED#<date>` |
| **List Dispute Timeline Evidence** | `DISPUTE#<dispId>`| `EVD#<timestamp>#<id>` | `TARGET#<dispId>` | `CREATED#<date>` | - | - |
| **Query Mandi Price by Market** | `COMMODITY#<name>`| `MANDI#<state>#<market>#<date>` | `STATE#<state>` | `DATE#<date>` | `MANDI#<market>` | `DATE#<date>` |
| **Query Mandi Price History (7-30d)** | `COMMODITY#<name>#<market>` | `DATE#<date>` | - | - | - | - |
| **Get User Notifications**| `USER#<userId>` | `NOTIF#<timestamp>#<id>` | `USER#<userId>` | `READ#false` | - | - |
