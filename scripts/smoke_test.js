#!/usr/bin/env node

/**
 * KrishiSetu 2.0 — Production Deployment Smoke Test Script
 * 
 * Verifies live deployment endpoints non-destructively:
 * - Liveness probe: /health & /api/health
 * - Readiness probe: /ready & /api/ready
 * - Public catalog endpoint: /api/products
 * - Unmatched API endpoint returns structured 404
 * - Protected endpoint returns 401 without auth token
 * 
 * Usage:
 *   SMOKE_TEST_BASE_URL=https://api.krishisetu.example.com node scripts/smoke_test.js
 *   node scripts/smoke_test.js http://localhost:3000
 */

const baseUrl = process.env.SMOKE_TEST_BASE_URL || process.argv[2] || 'http://localhost:3000';

console.log(`====================================================`);
console.log(`🌾 KrishiSetu Deployment Smoke Test`);
console.log(`Target Base URL: ${baseUrl}`);
console.log(`Timestamp: ${new Date().toISOString()}`);
console.log(`====================================================\n`);

async function runTest(baseUrl, name, path, expectedStatus, validator) {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  process.stdout.write(`Testing ${name} (${path}) ... `);
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    let body;
    const text = await res.text();
    try { body = JSON.parse(text); } catch { body = text; }

    const statusMatches = Array.isArray(expectedStatus)
      ? expectedStatus.includes(res.status)
      : res.status === expectedStatus;

    if (!statusMatches) {
      console.log(`FAILED! HTTP ${res.status} (expected ${expectedStatus})`);
      return false;
    }

    if (validator && !validator(res, body)) {
      console.log(`FAILED! Validation assertion failed`);
      return false;
    }

    console.log(`PASSED (HTTP ${res.status})`);
    return true;
  } catch (err) {
    console.log(`ERROR! ${err.message}`);
    return false;
  }
}

async function runSmokeTest(targetBaseUrl = (process.env.SMOKE_TEST_BASE_URL || process.argv[2] || 'http://localhost:3000')) {
  const baseUrl = targetBaseUrl.replace(/\/$/, '');
  console.log(`====================================================`);
  console.log(`🌾 KrishiSetu Deployment Smoke Test`);
  console.log(`Target Base URL: ${baseUrl}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`====================================================\n`);

  const results = [];

  // 1. Health Liveness
  results.push(await runTest(baseUrl, 'Health Liveness Check', '/health', 200, (res, body) => {
    return body && body.status === 'ok' && typeof body.uptime === 'number';
  }));

  // 2. Health API Alias
  results.push(await runTest(baseUrl, 'API Health Alias', '/api/health', 200, (res, body) => {
    return body && (body.status === 'ok' || body.status === 'degraded');
  }));

  // 3. Readiness Probe
  results.push(await runTest(baseUrl, 'Readiness Probe', '/ready', [200, 503], (res, body) => {
    return body && body.checks && (body.status === 'ready' || body.status === 'not_ready');
  }));

  // 4. Products Catalog (Public API)
  results.push(await runTest(baseUrl, 'Products Catalog API', '/api/products', 200, (res, body) => {
    return body && Array.isArray(body.products);
  }));

  // 5. Unmatched API 404 Contract
  results.push(await runTest(baseUrl, 'Unmatched Route 404 Contract', '/api/nonexistent-route-check', 404, (res, body) => {
    return body && body.code === 'ENDPOINT_NOT_FOUND' && body.requestId;
  }));

  // 6. Protected Route 401 Auth Enforcement
  results.push(await runTest(baseUrl, 'Protected Route 401 Shield', '/api/orders', 401, (res, body) => {
    return body && body.error;
  }));

  const passedCount = results.filter(Boolean).length;
  const totalCount = results.length;

  console.log(`\n----------------------------------------------------`);
  console.log(`Smoke Test Summary: ${passedCount}/${totalCount} Passed`);
  console.log(`----------------------------------------------------`);

  const allPassed = (passedCount === totalCount);
  if (allPassed) {
    console.log(`Deployment status: VERIFIED HEALTHY\n`);
  } else {
    console.error(`Deployment status: VERIFICATION FAILED\n`);
  }

  return { passedCount, totalCount, allPassed, results };
}

if (require.main === module) {
  runSmokeTest().then(({ allPassed }) => {
    process.exit(allPassed ? 0 : 1);
  }).catch(err => {
    console.error('Smoke test runner crashed:', err);
    process.exit(1);
  });
}

module.exports = { runSmokeTest };

