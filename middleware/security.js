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

// Configure standard security headers
const securityHeaders = helmet({
  contentSecurityPolicy: false, // allow inline scripts for static frontend PoC compatibility
  crossOriginEmbedderPolicy: false
});

// Configure CORS
const corsOptions = cors({
  origin: '*', // can be restricted to specific domain in production
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
});

// Global centralized error handler
function errorHandler(err, req, res, next) {
  console.error('[SERVER ERROR]', err.stack || err.message || err);
  
  const statusCode = err.statusCode || err.status || 500;
  let publicMessage = err.message || 'Error processing request.';

  // Mask database connection/internal crash details safely if 500
  if (statusCode === 500 && (publicMessage.includes('ECONNREFUSED') || publicMessage.includes('ENOTFOUND') || publicMessage.includes('FATAL'))) {
    publicMessage = 'A backend database service error occurred. Please try again.';
  }

  res.status(statusCode).json({
    error: publicMessage,
    code: err.code || 'SERVER_ERROR'
  });
}

module.exports = {
  apiLimiter,
  otpLimiter,
  securityHeaders,
  corsOptions,
  errorHandler
};
