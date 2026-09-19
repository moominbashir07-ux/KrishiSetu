/**
 * KrishiSetu 2.0 — Environment Configuration & Validation Module
 * 
 * Validates critical environment variables required for server operation,
 * security tokens, third-party integrations, and PostgreSQL database access.
 * Masks sensitive values in diagnostic logs.
 */

function validateEnv(options = {}) {
  const env = options.env || (options.NODE_ENV !== undefined ? options : process.env);
  const isProduction = env.NODE_ENV === 'production';
  const silent = options.silent || false;
  const missingCritical = [];

  const requiredInProduction = [
    'DATABASE_URL',
    'JWT_SECRET',
    'ADMIN_BOOTSTRAP_KEY'
  ];

  const criticalVars = {
    PORT: env.PORT || '3000 (default)',
    NODE_ENV: env.NODE_ENV || 'development (default)',
    DATABASE_URL: env.DATABASE_URL ? '[CONFIGURED]' : '[MISSING]',
    JWT_SECRET: env.JWT_SECRET ? '[CONFIGURED]' : '[MISSING]',
    DATA_GOV_IN_API_KEY: env.DATA_GOV_IN_API_KEY ? '[CONFIGURED]' : '[NOT SET]',
    EMAIL_OTP_PROVIDER: env.EMAIL_OTP_PROVIDER || 'dev (default)',
    EMAILJS_PUBLIC_KEY: env.EMAILJS_PUBLIC_KEY ? '[CONFIGURED]' : '[NOT SET]',
    EMAILJS_SERVICE_ID: env.EMAILJS_SERVICE_ID ? '[CONFIGURED]' : '[NOT SET]',
    EMAILJS_TEMPLATE_ID: env.EMAILJS_TEMPLATE_ID ? '[CONFIGURED]' : '[NOT SET]',
    EMAIL_FROM: env.EMAIL_FROM || '[NOT SET]',
    ADMIN_BOOTSTRAP_KEY: env.ADMIN_BOOTSTRAP_KEY ? '[CONFIGURED]' : '[NOT SET]'
  };

  const KNOWN_JWT_PLACEHOLDERS = [
    'krishisetu_jwt_super_secret_key_2026_change_in_production',
    'krishisetu_super_secret_jwt_key_development_only_change_in_prod',
    'your_jwt_secret',
    'your-secret-key',
    'secret',
    'jwt_secret_key',
    'change_this_secret'
  ];

  if (!env.DATABASE_URL) {
    missingCritical.push('DATABASE_URL is required for PostgreSQL database access.');
  }

  if (isProduction) {
    for (const key of requiredInProduction) {
      if (!env[key] || !String(env[key]).trim()) {
        missingCritical.push(`Critical production variable missing: ${key}`);
      }
    }

    // Validate DATABASE_URL in production
    if (env.DATABASE_URL) {
      try {
        const parsedUrl = new URL(env.DATABASE_URL);
        if (!parsedUrl.protocol.startsWith('postgres')) {
          missingCritical.push('Invalid DATABASE_URL in production: Must be a valid PostgreSQL connection URI.');
        }
      } catch {
        missingCritical.push('Invalid DATABASE_URL in production: Malformed connection URL.');
      }
    }

    // Reject documented/example JWT placeholders in production
    if (env.JWT_SECRET) {
      const secret = String(env.JWT_SECRET).trim();
      if (KNOWN_JWT_PLACEHOLDERS.includes(secret) || secret.length < 16) {
        missingCritical.push('Production rejects default/example JWT placeholder or insecure secret. A secure non-placeholder secret is required.');
      }
    }

    // Validate required provider configuration if specified
    const storageProvider = (env.STORAGE_PROVIDER || '').toLowerCase();
    if (storageProvider === 's3') {
      if (!env.AWS_S3_MEDIA_BUCKET) {
        missingCritical.push('Production storage provider "s3" requires AWS_S3_MEDIA_BUCKET.');
      }
      if (!env.AWS_REGION && !env.AWS_DEFAULT_REGION) {
        missingCritical.push('Production storage provider "s3" requires AWS_REGION or AWS_DEFAULT_REGION.');
      }
    }

    const bedrockProvider = (env.BEDROCK_PROVIDER || '').toLowerCase();
    if (bedrockProvider === 'aws') {
      if (!env.AWS_REGION && !env.BEDROCK_REGION && !env.AWS_DEFAULT_REGION) {
        missingCritical.push('Production AI provider "aws" requires AWS_REGION, BEDROCK_REGION, or AWS_DEFAULT_REGION.');
      }
    }

    // Validate CORS origins in production if specified
    if (env.APP_ALLOWED_ORIGINS) {
      const origins = env.APP_ALLOWED_ORIGINS.split(',').map(o => o.trim());
      for (const origin of origins) {
        if (origin !== '*' && !/^https?:\/\//i.test(origin)) {
          missingCritical.push(`Invalid APP_ALLOWED_ORIGINS entry "${origin}": Must include protocol (http:// or https://).`);
        }
      }
    }
  }

  if (!silent) {
    if (missingCritical.length > 0) {
      console.warn('====================================================');
      console.warn('[ENV VALIDATION WARNING]');
      missingCritical.forEach(msg => console.warn(` - ${msg}`));
      if (!env.DATABASE_URL) {
        console.warn(' Application will use embedded database fallback engine.');
      }
      console.warn('====================================================');
    }
  }

  if (options.strict && isProduction && missingCritical.length > 0) {
    const isJwtIssue = missingCritical.some(m => m.includes('JWT placeholder'));
    const err = new Error(`Production environment validation failed: ${missingCritical.join('; ')}`);
    err.code = isJwtIssue ? 'JWT_SECRET_INSECURE_PLACEHOLDER' : 'ENV_VALIDATION_FAILED';
    err.missing = missingCritical;
    throw err;
  }

  return {
    valid: missingCritical.length === 0,
    missing: missingCritical,
    summary: criticalVars,
    isProduction
  };
}

function getSanitizedDbUrl(url = process.env.DATABASE_URL) {
  if (!url) return '[NOT CONFIGURED]';
  try {
    const parsed = new URL(url);
    parsed.password = '****';
    if (parsed.username) {
      const parts = parsed.username.split('.');
      parsed.username = parts.length > 1 ? `${parts[0]}.***` : '***';
    }
    return parsed.toString();
  } catch {
    return '[CONFIGURED (MASKED)]';
  }
}

module.exports = {
  validateEnv,
  getSanitizedDbUrl
};
