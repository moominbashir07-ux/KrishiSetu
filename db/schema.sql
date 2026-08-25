-- KRISHISETU PRODUCTION DATABASE SCHEMA (POSTGRESQL - MARKET INTELLIGENCE)

-- 1. USERS TABLE (SUPPORTING CUSTOMER, SELLER, ADMIN ROLES)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    contact VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('customer', 'seller', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. SELLER PROFILES TABLE
CREATE TABLE IF NOT EXISTS seller_profiles (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_name VARCHAR(255),
    description TEXT,
    verification_status VARCHAR(50) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. CUSTOMER PROFILES TABLE
CREATE TABLE IF NOT EXISTS customer_profiles (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. SELLER LOCATIONS TABLE
CREATE TABLE IF NOT EXISTS seller_locations (
    id VARCHAR(50) PRIMARY KEY,
    seller_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    latitude NUMERIC(9,6) CHECK (latitude >= -90 AND latitude <= 90),
    longitude NUMERIC(9,6) CHECK (longitude >= -180 AND longitude <= 180),
    address TEXT,
    city VARCHAR(100),
    district VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(20),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(50) PRIMARY KEY,
    seller_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    price NUMERIC(10,2) NOT NULL CHECK (price > 0),
    price_unit VARCHAR(20) DEFAULT 'kg',
    quantity NUMERIC(10,2) NOT NULL CHECK (quantity >= 0),
    quantity_unit VARCHAR(20) DEFAULT 'kg',
    grade VARCHAR(50) DEFAULT 'Standard',
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'out_of_stock', 'inactive')),
    available_date DATE,
    location TEXT,
    latitude NUMERIC(9,6),
    longitude NUMERIC(9,6),
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ensure image_url column exists for existing tables
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 6. PRODUCT IMAGES TABLE
CREATE TABLE IF NOT EXISTS product_images (
    id VARCHAR(50) PRIMARY KEY,
    product_id VARCHAR(50) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. CARTS TABLE
CREATE TABLE IF NOT EXISTS carts (
    id VARCHAR(50) PRIMARY KEY,
    customer_id VARCHAR(50) UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. CART ITEMS TABLE
CREATE TABLE IF NOT EXISTS cart_items (
    id VARCHAR(50) PRIMARY KEY,
    cart_id VARCHAR(50) NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id VARCHAR(50) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT cart_product_unique UNIQUE (cart_id, product_id)
);

-- 9. ORDERS TABLE
CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(50) PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id VARCHAR(50) NOT NULL REFERENCES users(id),
    seller_id VARCHAR(50) NOT NULL REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'Order Placed' CHECK (status IN ('Order Placed', 'Farmer Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled', 'Rejected')),
    total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
    buyer_contact VARCHAR(255),
    step INTEGER DEFAULT 1 CHECK (step >= 1 AND step <= 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. ORDER ITEMS TABLE
CREATE TABLE IF NOT EXISTS order_items (
    id VARCHAR(50) PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id VARCHAR(50) NOT NULL REFERENCES products(id),
    product_name_snapshot VARCHAR(255) NOT NULL,
    quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
    unit_price_snapshot NUMERIC(10,2) NOT NULL CHECK (unit_price_snapshot > 0),
    unit VARCHAR(20) DEFAULT 'kg',
    subtotal NUMERIC(10,2) NOT NULL CHECK (subtotal > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. SELLER VERIFICATIONS TABLE (PHASE 5B)
CREATE TABLE IF NOT EXISTS seller_verifications (
    id VARCHAR(50) PRIMARY KEY,
    seller_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('identity', 'land_record', 'business_registration', 'other')),
    document_reference VARCHAR(255) NOT NULL,
    document_url TEXT,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
    admin_id VARCHAR(50) REFERENCES users(id),
    rejection_reason TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. OTPS TABLE (PHASE 5B)
CREATE TABLE IF NOT EXISTS otps (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
    contact VARCHAR(255) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    purpose VARCHAR(50) NOT NULL CHECK (purpose IN ('signup', 'login', 'email_verification', 'password_reset')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    attempt_count INTEGER DEFAULT 0,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. ORDER STATUS HISTORY TABLE (PHASE 5B HARDENING)
CREATE TABLE IF NOT EXISTS order_status_history (
    id VARCHAR(50) PRIMARY KEY,
    order_id VARCHAR(50) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    previous_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    changed_by VARCHAR(50) NOT NULL REFERENCES users(id),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 14. MARKET PRICE SNAPSHOTS TABLE (MARKET INTELLIGENCE ARCHIVE)
CREATE TABLE IF NOT EXISTS market_price_snapshots (
    id VARCHAR(100) PRIMARY KEY,
    state VARCHAR(100) NOT NULL,
    district VARCHAR(100),
    market VARCHAR(100) NOT NULL,
    commodity VARCHAR(100) NOT NULL,
    variety VARCHAR(100),
    grade VARCHAR(50),
    arrival_date DATE,
    min_price NUMERIC(10, 2),
    max_price NUMERIC(10, 2),
    modal_price NUMERIC(10, 2),
    unit VARCHAR(20) DEFAULT 'quintal',
    fetched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ensure column additions for existing tables
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_phone BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(50) DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;

ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS profile_photo TEXT;
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false;
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS show_phone BOOLEAN DEFAULT false;
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS rating NUMERIC(3,2) DEFAULT 5.0;
ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;

-- 15. REVIEWS TABLE (VERIFIED CUSTOMER PURCHASES)
CREATE TABLE IF NOT EXISTS reviews (
    id VARCHAR(50) PRIMARY KEY,
    product_id VARCHAR(50) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    buyer_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id VARCHAR(50) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_buyer_order_product UNIQUE (buyer_id, order_id, product_id)
);

-- 16. FEEDBACK TABLE (PLATFORM FEEDBACK)
CREATE TABLE IF NOT EXISTS feedback (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(255),
    user_email VARCHAR(255),
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    category VARCHAR(50) NOT NULL CHECK (category IN ('Website', 'Seller', 'Buyer', 'Delivery', 'Payment', 'Mandi Rates', 'Bug', 'Other')),
    message TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'cod';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'cod';

-- 17. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT false,
    order_id VARCHAR(50) REFERENCES orders(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES FOR PRODUCTION QUERY PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_seller_verifications_seller ON seller_verifications(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_verifications_status ON seller_verifications(status);
CREATE INDEX IF NOT EXISTS idx_otps_contact ON otps(contact);
CREATE INDEX IF NOT EXISTS idx_order_history_order ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_lookup ON market_price_snapshots(commodity, state, market, arrival_date);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_buyer ON reviews(buyer_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_orders_customer_seller ON orders(customer_id, seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_status ON orders(created_at DESC, status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);

-- 18. ADMIN AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id VARCHAR(50) PRIMARY KEY,
    admin_id VARCHAR(50) NOT NULL REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    target_id VARCHAR(50),
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin ON admin_audit_logs(admin_id);

-- 19. LOGIN HISTORY TABLE
CREATE TABLE IF NOT EXISTS login_history (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
    contact VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'customer',
    status VARCHAR(50) NOT NULL CHECK (status IN ('success', 'failed')),
    failure_reason TEXT,
    ip_address VARCHAR(100),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_login_history_contact ON login_history(contact);
CREATE INDEX IF NOT EXISTS idx_login_history_status ON login_history(status);
CREATE INDEX IF NOT EXISTS idx_login_history_created ON login_history(created_at DESC);

-- 20. USER ACTIVITY TABLE (ONLINE / PRESENCE TRACKING)
CREATE TABLE IF NOT EXISTS user_activity (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'customer',
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_action TEXT,
    current_page VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_user_activity_last_seen ON user_activity(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_role ON user_activity(role);

-- 21. PLATFORM EXPENSES TABLE (FINANCIAL PROFIT/LOSS GOVERNANCE)
CREATE TABLE IF NOT EXISTS platform_expenses (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    description TEXT,
    admin_id VARCHAR(50) NOT NULL REFERENCES users(id),
    expense_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform_expenses_date ON platform_expenses(expense_date DESC);



