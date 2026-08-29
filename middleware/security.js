const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// Express rate limiter for API protection
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // limit each IP to 300 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again after 15 minutes.' }
});

// Stricter rate limiter specifically for OTP endpoints
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // limit each IP to 15 OTP requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP attempts from this IP, please try again after 15 minutes.' }
});

// Dedicated rate limiter for login/auth endpoints to protect against credential brute-forcing
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // limit each IP to 30 authentication attempts per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts from this IP. Please try again after 15 minutes.' }
});

// Configure standard security headers
const securityHeaders = helmet({
  contentSecurityPolicy: false, // PoC compatibility with inline script application
  crossOriginEmbedderPolicy: false,
  frameguard: { action: 'sameorigin' }
});

// Configure CORS
const corsOptions = cors({
  origin: true,
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-access-token']
});

// Global centralized error handler
function errorHandler(err, req, res, next) {
  console.error('[SERVER ERROR]', err.stack || err.message || err);
  
  const statusCode = err.statusCode || err.status || 500;
  let publicMessage = err.message || 'Error processing request.';

  // Mask database connection/internal crash details safely if 500
  if (statusCode === 500 && (publicMessage.includes('ECONNREFUSED') || publicMessage.includes('ENOTFOUND') || publicMessage.includes('FATAL') || publicMessage.includes('SELECT') || publicMessage.includes('INSERT') || publicMessage.includes('UPDATE') || publicMessage.includes('DELETE') || publicMessage.includes('PG error'))) {
    publicMessage = 'An internal database error occurred. Please try again.';
  }

  res.status(statusCode).json({
    error: publicMessage,
    code: err.code || 'SERVER_ERROR'
  });
}

module.exports = {
  apiLimiter,
  otpLimiter,
  authLimiter,
  securityHeaders,
  corsOptions,
  errorHandler
};
