/**
 * KrishiSetu 2.0 — Phase 6B Forensic Remediation & Regression Test Suite
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const LocalStorageProvider = require('../services/storage/localStorageProvider');
const { handleLocalUpload } = require('../routes/storage');
const { MandiIntelligenceService } = require('../services/market/mandiIntelligenceService');
const { AgriculturalAdvisorService, DeterministicAdvisoryProvider } = require('../services/ai/agriculturalAdvisorService');

describe('Phase 6B — LocalStorageProvider HMAC & Security Hardening', () => {
  const provider = new LocalStorageProvider('http://localhost:3000');

  test('1. Generates cryptographic HMAC signature in presigned URL', async () => {
    const upload = await provider.getPresignedUploadUrl({
      key: 'media/product/test/sample.jpg',
      contentType: 'image/jpeg',
      expiresIn: 300
    });
    assert.ok(upload.uploadUrl.includes('signature='));
    assert.ok(upload.uploadUrl.includes('expires='));
    assert.ok(upload.uploadUrl.includes('key='));

    const parsedUrl = new URL(upload.uploadUrl);
    const key = parsedUrl.searchParams.get('key');
    const expires = parseInt(parsedUrl.searchParams.get('expires'), 10);
    const signature = parsedUrl.searchParams.get('signature');

    assert.strictEqual(key, 'media/product/test/sample.jpg');
    assert.ok(expires > Date.now());
    assert.strictEqual(signature.length, 64); // hex sha256

    const isValid = provider.verifySignature(key, expires, signature);
    assert.strictEqual(isValid, true);
  });

  test('2. Rejects tampered signature or modified key', () => {
    const key = 'media/product/test/sample.jpg';
    const expires = Date.now() + 300000;
    const signature = provider.generateSignature(key, expires);

    assert.strictEqual(provider.verifySignature('media/product/test/tampered.jpg', expires, signature), false);
    assert.strictEqual(provider.verifySignature(key, expires + 10, signature), false);
    assert.strictEqual(provider.verifySignature(key, expires, signature.slice(0, -2) + 'aa'), false);
  });

  test('3. Rejects expired upload signatures in route handler', async () => {
    const key = 'media/product/test/sample.jpg';
    const pastExpires = Date.now() - 10000;
    const signature = provider.generateSignature(key, pastExpires);

    let statusCode = null;
    let jsonBody = null;
    const req = {
      method: 'PUT',
      url: `/api/storage/local-upload?key=${encodeURIComponent(key)}&expires=${pastExpires}&signature=${signature}`,
      query: { key, expires: pastExpires, signature },
      headers: { 'content-type': 'image/jpeg' },
      on: () => {}
    };
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonBody = data; return res; }
    };

    await handleLocalUpload(req, res);
    assert.strictEqual(statusCode, 403);
    assert.match(jsonBody.error, /expired/i);
  });

  test('4. Route handler handleLocalUpload rejects unsigned requests with 403', async () => {
    const expires = Date.now() + 300000;
    const req = {
      method: 'PUT',
      url: `/api/storage/local-upload?key=media/product/test/sample.jpg&expires=${expires}`,
      query: { key: 'media/product/test/sample.jpg', expires },
      headers: { 'content-type': 'image/jpeg' },
      on: () => {}
    };

    let statusCode = null;
    let jsonBody = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonBody = data; return res; }
    };

    await handleLocalUpload(req, res);
    assert.strictEqual(statusCode, 403);
    assert.match(jsonBody.error, /Missing cryptographic HMAC signature/i);
  });

  test('5. Route handler handleLocalUpload rejects path traversal attempts with 400', async () => {
    const expires = Date.now() + 300000;
    const traversalKey = 'media/../../etc/passwd';
    const signature = provider.generateSignature(traversalKey, expires);

    const req = {
      method: 'PUT',
      url: `/api/storage/local-upload?key=${encodeURIComponent(traversalKey)}&expires=${expires}&signature=${signature}`,
      query: { key: traversalKey, expires, signature },
      headers: { 'content-type': 'image/jpeg' },
      on: () => {}
    };

    let statusCode = null;
    let jsonBody = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { jsonBody = data; return res; }
    };

    await handleLocalUpload(req, res);
    assert.strictEqual(statusCode, 400);
    assert.match(jsonBody.error, /path traversal/i);
  });
});

describe('Phase 6B — Market Data Freshness Handling', () => {
  const mandiService = new MandiIntelligenceService({});

  test('1. calculateFreshness returns UNAVAILABLE for future timestamps', () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
    const freshness = mandiService.calculateFreshness(futureDate);
    assert.strictEqual(freshness, 'UNAVAILABLE');
  });

  test('2. calculateFreshness returns LIVE for recent timestamps, RECENT and STALE for older', () => {
    const recentDate = new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString();
    assert.strictEqual(mandiService.calculateFreshness(recentDate), 'LIVE');

    const twoDaysAgo = new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString();
    assert.strictEqual(mandiService.calculateFreshness(twoDaysAgo), 'RECENT');

    const tenDaysAgo = new Date(Date.now() - 1000 * 60 * 60 * 240).toISOString();
    assert.strictEqual(mandiService.calculateFreshness(tenDaysAgo), 'STALE');
  });
});

describe('Phase 6B — Deterministic Advisory Metadata & Engine Hardening', () => {
  const provider = new DeterministicAdvisoryProvider();
  const advisor = new AgriculturalAdvisorService();

  test('1. DeterministicAdvisoryProvider sets isMock: false, isDeterministic: true', async () => {
    const result = await provider.invokeModel({ prompt: 'Market prices for wheat in Nashik', taskType: 'mandi_rate_query' });
    assert.strictEqual(result.isMock, false);
    assert.strictEqual(result.isDeterministic, true);
    assert.strictEqual(result.providerType, 'local_rules_engine');
  });

  test('2. AgriculturalAdvisorService reports local_rules_engine in provider status', () => {
    const status = advisor.getProviderStatus();
    assert.strictEqual(status.isMock, false);
    assert.strictEqual(status.isDeterministic, true);
    assert.strictEqual(status.providerType, 'local_rules_engine');
    assert.strictEqual(status.activeProvider, 'deterministic');
  });

  test('3. AgriculturalAdvisorService chat returns local_rules_engine metadata', async () => {
    const chat = await advisor.chat({ message: 'What is the price of onion in Nashik?', language: 'en' });
    assert.strictEqual(chat.isMock, false);
    assert.strictEqual(chat.isDeterministic, true);
    assert.strictEqual(chat.providerType, 'local_rules_engine');
  });
});

describe('Phase 6B — HTML UI Header & Profile Verification', () => {
  const htmlPath = path.join(__dirname, '..', 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  test('1. Header navigation links have font-bold styling', () => {
    assert.ok(htmlContent.includes('id="dashboardNavBtn"'), 'dashboardNavBtn exists');
    assert.ok(htmlContent.includes('data-action="nav-marketplace"'), 'Marketplace nav exists');
    assert.ok(htmlContent.includes('data-i18n="nav.aboutUs"'), 'About Us nav exists');
    
    // Check that every main desktop nav button has font-bold
    const desktopNavSection = htmlContent.substring(
      htmlContent.indexOf('id="dashboardNavBtn"'),
      htmlContent.indexOf('data-i18n="nav.aboutUs"') + 50
    );
    const buttons = desktopNavSection.split('<button');
    for (let i = 1; i < buttons.length; i++) {
      assert.ok(buttons[i].includes('font-bold'), `Nav button ${i} should have font-bold`);
    }
  });

  test('2. Language selector uses styled container with language image', () => {
    assert.ok(htmlContent.includes('images/language.png'), 'Language selector must use images/language.png');
    assert.ok(htmlContent.includes('id="desktopLangSelectorWrapper"'), 'desktopLangSelectorWrapper must exist');
    assert.ok(htmlContent.includes('id="languageSelector"'), 'languageSelector must exist');
  });

  test('3. Profile button uses farmer image and nav-profile action', () => {
    assert.ok(htmlContent.includes('id="profileNavBtn"'), 'Profile button must exist');
    assert.ok(htmlContent.includes('data-action="nav-profile"'), 'Profile button must have nav-profile action');
    assert.ok(htmlContent.includes('images/farmer.png'), 'Farmer icon must be present');
  });

  test('4. onNavProfileClick function handles unauthenticated state gracefully', () => {
    assert.ok(htmlContent.includes('function onNavProfileClick()'), 'onNavProfileClick must be defined');
    assert.ok(htmlContent.includes('AuthService.getToken()'), 'Must check authentication token');
  });
});
