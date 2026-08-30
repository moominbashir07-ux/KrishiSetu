// KrishiSetu Centralized Backend API Client Service (Phase 5B - Production Ready)

const API_BASE_URL = (typeof window !== 'undefined' && window.__KRISHISETU_API_URL__) ? window.__KRISHISETU_API_URL__ : '';

const ApiService = {
  getToken() {
    return localStorage.getItem('krishisetu_token') || null;
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('krishisetu_token', token);
    } else {
      localStorage.removeItem('krishisetu_token');
    }
  },

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const targetUrl = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

    try {
      const res = await fetch(targetUrl, {
        ...options,
        headers
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      return data;
    } catch (err) {
      console.warn(`[ApiService] ${endpoint} request failed:`, err.message);
      throw err;
    }
  }
};

const AuthService = {
  getToken() {
    return ApiService.getToken();
  },

  setToken(token) {
    return ApiService.setToken(token);
  },

  async signup(payload) {
    const res = await ApiService.request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res.token) ApiService.setToken(res.token);
    return res;
  },

  async signin(payload) {
    const res = await ApiService.request('/api/auth/signin', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res.token) ApiService.setToken(res.token);
    return res;
  },

  async me() {
    return ApiService.request('/api/auth/me');
  },

  async getProfile() {
    return ApiService.request('/api/auth/profile');
  },

  async getSellerProfile(id) {
    return ApiService.request(`/api/auth/sellers/${id}`);
  },

  logout() {
    ApiService.setToken(null);
    localStorage.removeItem('krishisetu_current_user');
  }
};

const OtpService = {
  async sendOtp(contact, purpose = 'email_verification') {
    return ApiService.request('/api/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ contact, purpose })
    });
  },

  async verifyOtp(contact, purpose, otp) {
    return ApiService.request('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ contact, purpose, otp })
    });
  },

  async forgotPassword(contact) {
    return ApiService.request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ contact })
    });
  },

  async resetPassword(contact, otp, newPassword) {
    return ApiService.request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ contact, otp, newPassword })
    });
  }
};

const SellerVerificationService = {
  async submitVerification(payload) {
    return ApiService.request('/api/seller/verification', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async getStatus() {
    return ApiService.request('/api/seller/verification/status');
  }
};

const AdminService = {
  async seedAdmin(payload) {
    const res = await ApiService.request('/api/auth/admin-seed', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (res.token) ApiService.setToken(res.token);
    return res;
  },

  async getVerifications(status) {
    const url = status ? `/api/admin/verifications?status=${encodeURIComponent(status)}` : '/api/admin/verifications';
    return ApiService.request(url);
  },

  async reviewVerification(id, status, rejectionReason) {
    return ApiService.request(`/api/admin/verifications/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status, rejectionReason })
    });
  },

  async getMetrics() {
    return ApiService.request('/api/admin/metrics');
  }
};

const ProductService = {
  async getProducts(category) {
    const url = category && category !== 'All' && category !== 'All produce'
      ? `/api/products?category=${encodeURIComponent(category)}`
      : '/api/products';
    return ApiService.request(url);
  },

  async createProduct(productData) {
    return ApiService.request('/api/products', {
      method: 'POST',
      body: JSON.stringify(productData)
    });
  },

  async updateProduct(id, productData) {
    return ApiService.request(`/api/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(productData)
    });
  },

  async deleteProduct(id) {
    return ApiService.request(`/api/products/${id}`, {
      method: 'DELETE'
    });
  }
};

const OrderService = {
  async createOrder(payload) {
    return ApiService.request('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async getOrders() {
    return ApiService.request('/api/orders');
  },

  async updateStatus(orderId, statusOrStep) {
    const body = typeof statusOrStep === 'object'
      ? statusOrStep
      : typeof statusOrStep === 'number'
        ? { step: statusOrStep }
        : { status: statusOrStep };

    return ApiService.request(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  },

  async submitPaymentVerification(orderId, transactionId) {
    return ApiService.request(`/api/orders/${orderId}/verify-payment`, {
      method: 'POST',
      body: JSON.stringify({ transactionId })
    });
  },

  async sellerVerifyPayment(orderId, action, reason) {
    return ApiService.request(`/api/orders/${orderId}/seller-verify-payment`, {
      method: 'PUT',
      body: JSON.stringify({ action, reason })
    });
  }
};

const CartService = {
  async getCart() {
    return ApiService.request('/api/cart');
  },

  async addItem(productId, quantity = 1) {
    return ApiService.request('/api/cart/items', {
      method: 'POST',
      body: JSON.stringify({ productId, quantity })
    });
  },

  async updateItem(itemId, quantity) {
    return ApiService.request(`/api/cart/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity })
    });
  },

  async removeItem(itemId) {
    return ApiService.request(`/api/cart/items/${itemId}`, {
      method: 'DELETE'
    });
  }
};

const MarketIntelligenceService = {
  async getMarketPrices({ commodity = 'Onion', state = 'Maharashtra', district, market, force = false } = {}) {
    const params = new URLSearchParams({ commodity, state });
    if (district) params.append('district', district);
    if (market) params.append('market', market);
    if (force) params.append('t', Date.now());

    return ApiService.request(`/api/market-prices?${params.toString()}`);
  },

  async getHistory({ commodity = 'Onion', market, state = 'Maharashtra', district } = {}) {
    const params = new URLSearchParams({ commodity, state });
    if (district) params.append('district', district);
    if (market) params.append('market', market);

    return ApiService.request(`/api/market-prices/history?${params.toString()}`);
  },

  async getComparison({ commodity = 'Onion', state = 'Maharashtra', district } = {}) {
    const params = new URLSearchParams({ commodity, state });
    if (district) params.append('district', district);
    return ApiService.request(`/api/market-prices/compare?${params.toString()}`);
  }
};
