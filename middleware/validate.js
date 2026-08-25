function validateProductInput(req, res, next) {
  const { name, category, price, quantity, latitude, longitude } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Product name is required.' });
  }

  const numPrice = Number(price);
  if (!Number.isFinite(numPrice) || numPrice <= 0) {
    return res.status(400).json({ error: 'Price must be a positive number greater than 0.' });
  }

  const numQty = Number(quantity);
  if (!Number.isFinite(numQty) || numQty < 0) {
    return res.status(400).json({ error: 'Quantity must be a valid non-negative number.' });
  }

  if (latitude !== undefined && latitude !== null) {
    const lat = Number(latitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return res.status(400).json({ error: 'Latitude must be a valid number between -90 and 90.' });
    }
  }

  if (longitude !== undefined && longitude !== null) {
    const lng = Number(longitude);
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'Longitude must be a valid number between -180 and 180.' });
    }
  }

  next();
}

function validateAuthInput(req, res, next) {
  const { contact, password, role } = req.body;

  if (!contact || typeof contact !== 'string' || !contact.trim()) {
    return res.status(400).json({ error: 'Phone or email contact is required.' });
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  if (role && !['customer', 'seller'].includes(role)) {
    return res.status(400).json({ error: 'Role must be either customer or seller.' });
  }

  next();
}

function validateCartItemInput(req, res, next) {
  const { productId, quantity } = req.body;

  if (!productId || typeof productId !== 'string') {
    return res.status(400).json({ error: 'Product ID is required.' });
  }

  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Requested quantity must be a positive number greater than 0.' });
  }

  next();
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const str = email.trim();
  if (str.includes('..')) return false;
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return regex.test(str);
}

module.exports = {
  validateProductInput,
  validateAuthInput,
  validateCartItemInput,
  isValidEmail
};
