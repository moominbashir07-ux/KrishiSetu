/**
 * KrishiSetu 2.0 — Shared Domain Types & Contracts
 * Phase 0 Technical Foundation
 */

// ============================================================================
// 1. User & Profiles
// ============================================================================

export type UserRole = 'customer' | 'seller' | 'admin';

export interface User {
  id: string; // USR_<uuid>
  name: string;
  contact: string; // email or +91 phone
  role: UserRole;
  status: 'active' | 'suspended' | 'frozen';
  createdAt: string;
  updatedAt: string;
}

export interface SellerProfile {
  userId: string;
  businessName: string;
  state: string;
  district: string;
  address?: string;
  pincode: string;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  rating: number;
  reviewCount: number;
}

export interface CustomerProfile {
  userId: string;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
}

// ============================================================================
// 2. Produce & Quality
// ============================================================================

export type DeclaredGrade = 'Grade A' | 'Grade B' | 'Grade C' | 'Standard' | 'Ungraded';
export type VerificationType = 'SELLER_DECLARED' | 'AI_ASSISTED_ESTIMATE' | 'CERTIFIED_AGMARK';
export type QualityStatus = 'OFFICIALLY_CERTIFIED' | 'UNVERIFIED_DECLARATION';

export interface ProductQuality {
  declaredGrade: DeclaredGrade;
  gradeCriteria: string;
  qualityEvidence: string[]; // S3 keys
  verificationType: VerificationType;
  verificationStatus: QualityStatus;
  displayBadge: string;
  isCertified: boolean;
  certificationDocKey?: string | null;
  disclaimer: string;
}

export type ProduceCategory = 'Vegetables' | 'Fruits' | 'Grains' | 'Pulses' | 'Spices';

export interface Product {
  id: string; // PROD_<timestamp>_<random>
  sellerId: string;
  commodity: string;
  variety?: string;
  category: ProduceCategory;
  description: string;
  pricePerUnit: number;
  unit: 'kg' | 'quintal' | 'crate' | 'ton';
  availableQuantity: number;
  minOrderQuantity: number;
  harvestDate?: string;
  status: 'active' | 'out_of_stock' | 'delisted';
  images: string[];
  quality: ProductQuality;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// 3. Market Price & Provenance
// ============================================================================

export type DataFreshness = 'LIVE' | 'RECENT' | 'STALE' | 'UNAVAILABLE';

export interface MarketDataSource {
  id: string;
  name: string;
  resourceId?: string;
  url: string;
  publisher: string;
  termsOfUse: string;
}

export interface MarketPriceRecord {
  id: string;
  commodity: string;
  variety: string;
  grade: string;
  market: string;
  district: string;
  state: string;
  minPrice: number;
  maxPrice: number;
  modalPrice: number;
  unit: 'quintal' | 'kg';
  arrival_date: string; // YYYY-MM-DD
  fetchedAt: string; // ISO 8601
  freshnessStatus: DataFreshness;
  dataFreshness: DataFreshness;
  source: string;
  isMock: boolean;
}

// ============================================================================
// 4. Orders & Escrow
// ============================================================================

export type OrderStatus = 
  | 'Order Placed' 
  | 'Farmer Confirmed' 
  | 'Preparing' 
  | 'Ready' 
  | 'Completed' 
  | 'Cancelled' 
  | 'Rejected' 
  | 'Disputed';

export interface OrderItem {
  productId: string;
  productNameSnapshot: string;
  quantity: number;
  unitPriceSnapshot: number;
  unit: string;
  subtotal: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  sellerId: string;
  status: OrderStatus;
  items: OrderItem[];
  itemSubtotal: number;
  platformFee: number;
  totalAmount: number;
  paymentMethod: 'cod' | 'upi' | 'card';
  paymentStatus: 'pending' | 'completed' | 'rejected' | 'cod';
  transactionId?: string;
  deliveryAddress: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// 5. Quality Claims, Evidence & Disputes
// ============================================================================

export type DisputeReason = 
  | 'QUALITY_MISMATCH' 
  | 'WRONG_GRADE' 
  | 'DAMAGED_PRODUCE' 
  | 'QUANTITY_SHORTAGE' 
  | 'NON_DELIVERY';

export type DisputeStatus = 
  | 'OPEN' 
  | 'SELLER_RESPONDED' 
  | 'UNDER_REVIEW' 
  | 'RESOLVED' 
  | 'REJECTED' 
  | 'CANCELLED';

export type EvidenceType = 'PHOTO' | 'VIDEO' | 'INVOICE' | 'WEIGHMENT_SLIP';

export interface Evidence {
  id: string;
  targetType: 'ORDER' | 'DISPUTE';
  targetId: string;
  uploaderId: string;
  uploaderRole: UserRole;
  evidenceType: EvidenceType;
  s3Key: string;
  mimeType: string;
  fileSizeBytes: number;
  caption?: string;
  capturedAt?: string;
  uploadedAt: string;
}

export interface Dispute {
  id: string; // DSP_<timestamp>_<random>
  orderId: string;
  claimantId: string;
  respondentId: string;
  reason: DisputeReason;
  description: string;
  declaredGrade: DeclaredGrade;
  claimedCondition: string;
  status: DisputeStatus;
  evidenceKeys: string[];
  resolutionOffer?: {
    type: 'PARTIAL_REFUND' | 'RETURN' | 'REPLACE';
    amount?: number;
    notes?: string;
  };
  aiSummary?: string;
  createdAt: string;
  resolvedAt?: string;
}

// ============================================================================
// 6. AI Interactions (Amazon Bedrock)
// ============================================================================

export interface AIInteraction {
  id: string;
  userId: string;
  taskType: 'FARMER_ADVISORY' | 'LISTING_ASSISTANCE' | 'DISPUTE_SUMMARY';
  promptPayload: string;
  groundingContext: Record<string, unknown>;
  modelId: string;
  rawResponse: string;
  createdAt: string;
}
