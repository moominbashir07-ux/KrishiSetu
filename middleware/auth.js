const jwt = require('jsonwebtoken');
const db = require('../db/db');

const JWT_SECRET = process.env.JWT_SECRET || 'krishisetu_jwt_super_secret_key_2026_change_in_production';

async function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['x-access-token']) {
    token = req.headers['x-access-token'];
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await db.query(
      'SELECT id, name, contact, role, account_status, email_verified, phone, phone_verified, show_phone, profile_photo FROM users WHERE id = $1',
      [decoded.id]
    );
    
    if (!result.rows.length) {
      return res.status(401).json({ error: 'Invalid or expired user session.' });
    }

    const user = result.rows[0];

    if (user.account_status === 'frozen' || user.account_status === 'suspended') {
      return res.status(403).json({ 
        error: 'Your KrishiSetu account has been temporarily frozen. Please contact support.' 
      });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (req.user.role !== role) {
      if (role === 'customer' && req.user.role === 'seller') {
        return res.status(403).json({
          error: 'Sellers cannot add products to a shopping cart. Switch to your buyer account to purchase products.'
        });
      }
      return res.status(403).json({ 
        error: `Access denied. Requires '${role}' role, but user is '${req.user.role}'.` 
      });
    }

    next();
  };
}

function requireAnyRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: `Access denied. Requires one of roles: [${roles.join(', ')}], but user role is '${req.user.role}'.` 
      });
    }

    next();
  };
}

async function requireProductOwnership(req, res, next) {
  const productId = req.params.id;
  
  if (!productId) {
    return res.status(400).json({ error: 'Product ID parameter is required.' });
  }

  try {
    const result = await db.query('SELECT seller_id FROM products WHERE id = $1', [productId]);
    
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const product = result.rows[0];

    if (product.seller_id !== req.user.id) {
      return res.status(403).json({ 
        error: 'You can only manage your own listings.' 
      });
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  authenticateUser,
  requireRole,
  requireAnyRole,
  requireProductOwnership,
  JWT_SECRET
};
