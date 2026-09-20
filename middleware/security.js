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

// Dedicated rate limiter for AI advisory endpoints
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 45, // limit each IP to 45 AI advisory requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI advisory requests from this IP. Please try again after 15 minutes.', code: 'RATE_LIMIT_EXCEEDED' }
});

// Request correlation ID middleware
function requestIdMiddleware(req, res, next) {
  const incomingId = req.headers['x-request-id'];
  const reqId = (incomingId && typeof incomingId === 'string' && incomingId.trim())
    ? incomingId.trim()
    : 'REQ_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  req.id = reqId;
  res.setHeader('x-request-id', reqId);
  next();
}

// Structured request logging middleware
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const rawUrl = req.originalUrl || req.url;
    const safeUrl = rawUrl.replace(/(token|password|otp|secret)=[^&]+/gi, '$1=****');
    const userTag = req.user ? `[user=${req.user.id}]` : '[anon]';
    if (!safeUrl.startsWith('/images') && !safeUrl.endsWith('.png') && !safeUrl.endsWith('.ico')) {
      if (process.env.NODE_ENV !== 'test') {
        console.log(`[HTTP] ${req.method} ${safeUrl} ${res.statusCode} ${duration}ms [reqId=${req.id || 'N/A'}] ${userTag}`);
      }
    }
  });
  next();
}

// Configure environment-driven CORS allowlist
function getAllowedOrigins() {
  const configured = (process.env.APP_ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (process.env.APP_URL && !configured.includes(process.env.APP_URL.trim())) {
    configured.push(process.env.APP_URL.trim());
  }

  if (process.env.RENDER_EXTERNAL_URL && !configured.includes(process.env.RENDER_EXTERNAL_URL.trim())) {
    configured.push(process.env.RENDER_EXTERNAL_URL.trim());
  }

  const productionOrigin = 'https://krishisetu-dj4j.onrender.com';
  if (!configured.includes(productionOrigin)) {
    configured.push(productionOrigin);
  }

  // Local development origins
  if (process.env.NODE_ENV !== 'production') {
    if (!configured.includes('http://localhost:3000')) configured.push('http://localhost:3000');
    if (!configured.includes('http://127.0.0.1:3000')) configured.push('http://127.0.0.1:3000');
  }

  return configured;
}

function isOriginAllowed(origin) {
  if (!origin) return true; // Allow non-browser requests (curl, server-to-server, mobile)
  const allowed = getAllowedOrigins();
  if (allowed.length === 0 && process.env.NODE_ENV !== 'production') return true;

  return allowed.some(allowedOrigin => {
    if (allowedOrigin === origin) return true;
    // Allow localhost with any port in development
    if (process.env.NODE_ENV !== 'production' && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
      return true;
    }
    return false;
  });
}

const corsOptions = cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      const err = new Error(`CORS blocked for origin: ${origin}`);
      err.status = 403;
      err.code = 'CORS_FORBIDDEN';
      callback(err);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-access-token', 'x-request-id']
});

// Configure tailored Content Security Policy compatible with legacy index.html
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // Required for embedded Tailwind config and client scripts in legacy index.html
        "https://cdn.tailwindcss.com",
        "https://cdn.jsdelivr.net"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com",
        "https://cdn.jsdelivr.net"
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "data:"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https:" // Required for remote produce photos and S3 presigned asset display
      ],
      connectSrc: [
        "'self'",
        "https:", // Required for remote S3 PUT uploads and data.gov.in
        "http://localhost:*",
        "http://127.0.0.1:*"
      ],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  frameguard: { action: 'sameorigin' }
});

// Global centralized error handler
function errorHandler(err, req, res, next) {
  const reqId = (req && req.id) ? req.id : null;
  // Sanitize stack/message before logging to ensure secrets/passwords are not logged
  const rawMsg = err.stack || err.message || String(err);
  const sanitizedLog = rawMsg
    .replace(/password(=|:\s*)[^\s&]+/gi, 'password=****')
    .replace(/bearer\s+[a-zA-Z0-9\-_.]+/gi, 'Bearer ****')
    .replace(/otp(=|:\s*)[^\s&]+/gi, 'otp=****');

  console.error(`[SERVER ERROR] [reqId=${reqId || 'N/A'}]`, sanitizedLog);
  
  const statusCode = err.statusCode || err.status || 500;
  let publicMessage = err.message || 'Error processing request.';

  // Mask database connection/internal crash details safely if 500 or database-related
  const isDbError = (
    publicMessage.includes('ECONNREFUSED') ||
    publicMessage.includes('ENOTFOUND') ||
    publicMessage.includes('FATAL') ||
    publicMessage.includes('SELECT') ||
    publicMessage.includes('INSERT') ||
    publicMessage.includes('UPDATE') ||
    publicMessage.includes('DELETE') ||
    publicMessage.includes('PG error') ||
    publicMessage.includes('syntax error at') ||
    publicMessage.includes('relation ') ||
    publicMessage.includes('column ') ||
    publicMessage.includes('null value in column') ||
    publicMessage.includes('password authentication failed') ||
    publicMessage.includes('supabase')
  );

  if (statusCode === 500 && isDbError) {
    publicMessage = 'Database operation failed';
  }

  if (reqId) {
    res.setHeader('x-request-id', reqId);
  }

  res.status(statusCode).json({
    error: publicMessage,
    code: err.code || (isDbError ? 'DB_OPERATION_FAILED' : 'SERVER_ERROR'),
    requestId: reqId
  });
}

module.exports = {
  apiLimiter,
  otpLimiter,
  authLimiter,
  aiLimiter,
  requestIdMiddleware,
  requestLogger,
  securityHeaders,
  corsOptions,
  errorHandler
};
