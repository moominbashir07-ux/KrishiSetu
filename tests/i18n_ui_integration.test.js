/**
 * KrishiSetu Phase 1 — Frontend HTML & i18n Integration Verification Suite
 * Verifies index.html markup, script references, language selectors, and translation coverage.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const i18n = require('../js/i18n');

describe('KrishiSetu Phase 1 — UI & DOM i18n Integration Suite', () => {
  const indexPath = path.join(__dirname, '..', 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');

  test('1. index.html includes js/i18n.js script tag before api.js and inline scripts', () => {
    assert.ok(indexHtml.includes('<script src="js/i18n.js"></script>'));
    const i18nIdx = indexHtml.indexOf('<script src="js/i18n.js"></script>');
    const apiIdx = indexHtml.indexOf('<script src="js/api.js');
    assert.ok(i18nIdx < apiIdx, 'i18n.js must be loaded before api.js');
  });

  test('2. index.html contains accessible desktop and mobile language selectors', () => {
    assert.ok(indexHtml.includes('id="languageSelector"'));
    assert.ok(indexHtml.includes('id="mobileLanguageSelector"'));
    assert.ok(indexHtml.includes('data-language-selector'));
    assert.ok(indexHtml.includes('value="en"'));
    assert.ok(indexHtml.includes('value="hi"'));
    assert.ok(indexHtml.includes('aria-label="Select website language"'));
  });

  test('3. index.html initializes i18n in application init lifecycle', () => {
    assert.ok(indexHtml.includes('I18n.init()'));
    assert.ok(indexHtml.includes('krishisetu:language-changed'));
  });

  test('4. All data-i18n attributes in index.html correspond to valid translation keys', () => {
    const dataI18nMatches = [...indexHtml.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]);
    assert.ok(dataI18nMatches.length >= 25, `Expected at least 25 data-i18n occurrences, found ${dataI18nMatches.length}`);

    const missingEnKeys = [];
    const missingHiKeys = [];

    dataI18nMatches.forEach(key => {
      const enVal = i18n.t(key, {}, 'en');
      const hiVal = i18n.t(key, {}, 'hi');
      if (enVal === key) missingEnKeys.push(key);
      if (hiVal === key) missingHiKeys.push(key);
    });

    assert.deepStrictEqual(missingEnKeys, [], `Missing English translations for keys: ${missingEnKeys.join(', ')}`);
    assert.deepStrictEqual(missingHiKeys, [], `Missing Hindi translations for keys: ${missingHiKeys.join(', ')}`);
  });

  test('5. All data-i18n-placeholder and data-i18n-title attributes correspond to valid keys', () => {
    const placeholderMatches = [...indexHtml.matchAll(/data-i18n-placeholder="([^"]+)"/g)].map(m => m[1]);
    const titleMatches = [...indexHtml.matchAll(/data-i18n-title="([^"]+)"/g)].map(m => m[1]);

    [...placeholderMatches, ...titleMatches].forEach(key => {
      assert.notStrictEqual(i18n.t(key, {}, 'en'), key, `Missing English translation for attribute key: ${key}`);
      assert.notStrictEqual(i18n.t(key, {}, 'hi'), key, `Missing Hindi translation for attribute key: ${key}`);
    });
  });

  test('6. Dynamic business identifiers and prices in index.html are NOT hardcoded into i18n dictionary', () => {
    // Dynamic values that should never be in static translations
    const dynamicFields = ['order_number', 'seller_id', 'transaction_id', 'buyer_contact', 'mandiModalVal', 'prodPrice'];
    dynamicFields.forEach(field => {
      assert.strictEqual(i18n.t(field), field, `${field} should not be in i18n translation dictionary`);
    });
  });

  test('7. showScreen calls applyTranslations when navigating screens', () => {
    assert.ok(indexHtml.includes('I18n.applyTranslations(target)'));
  });
});
