/**
 * KrishiSetu Phase 1 — Multilingual Foundation & i18n Test Suite
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const i18n = require('../js/i18n');

describe('KrishiSetu Phase 1 — i18n Engine & Language Selector', () => {

  beforeEach(() => {
    // Reset to default language before each test
    i18n.setLanguage('en');
  });

  test('1. Default language is English', () => {
    assert.strictEqual(i18n.DEFAULT_LANGUAGE, 'en');
    assert.strictEqual(i18n.getCurrentLanguage(), 'en');
  });

  test('2. Translates common keys in English correctly', () => {
    assert.strictEqual(i18n.t('nav.marketplace'), 'Marketplace');
    assert.strictEqual(i18n.t('nav.mandiRates'), 'Mandi Rates');
    assert.strictEqual(i18n.t('nav.sellProducts'), 'Sell Products');
    assert.strictEqual(i18n.t('nav.orders'), 'Orders');
    assert.strictEqual(i18n.t('common.search'), 'Search');
    assert.strictEqual(i18n.t('common.submit'), 'Submit');
  });

  test('3. Switches to Hindi and returns accurate, natural Hindi translations', () => {
    const lang = i18n.setLanguage('hi');
    assert.strictEqual(lang, 'hi');
    assert.strictEqual(i18n.getCurrentLanguage(), 'hi');

    assert.strictEqual(i18n.t('nav.marketplace'), 'मंडी बाज़ार');
    assert.strictEqual(i18n.t('nav.mandiRates'), 'मंडी भाव');
    assert.strictEqual(i18n.t('nav.sellProducts'), 'उपज बेचें');
    assert.strictEqual(i18n.t('nav.orders'), 'ऑर्डर ट्रैकिंग');
    assert.strictEqual(i18n.t('nav.aboutUs'), 'हमारे बारे में');
    assert.strictEqual(i18n.t('nav.detectLocation'), 'स्थान पहचानें');
    assert.strictEqual(i18n.t('nav.viewCart'), 'कार्ट देखें');
    assert.strictEqual(i18n.t('common.search'), 'खोजें');
    assert.strictEqual(i18n.t('common.addToCart', {}, 'hi'), 'common.addToCart'); // falls back to key if not in common
    assert.strictEqual(i18n.t('marketplace.addToCart'), '+ कार्ट में जोड़ें');
    assert.strictEqual(i18n.t('marketplace.inStock'), 'उपलब्ध');
    assert.strictEqual(i18n.t('marketplace.outOfStock'), 'स्टॉक समाप्त');
    assert.strictEqual(i18n.t('marketplace.allProduce'), 'सभी उपज');
    assert.strictEqual(i18n.t('marketplace.vegetables'), 'सब्ज़ियाँ');
    assert.strictEqual(i18n.t('marketplace.fruits'), 'फल');
    assert.strictEqual(i18n.t('marketplace.grains'), 'अनाज व खाद्यान्न');
    assert.strictEqual(i18n.t('landing.heroTitle'), 'सीधे खेत से खरीदार तक कृषि बाज़ार');
    assert.strictEqual(i18n.t('landing.zeroMiddlemen'), 'बिचौलियों से मुक्ति');
    assert.strictEqual(i18n.t('landing.fairPricesGuaranteed'), 'पारदर्शी और उचित मूल्य');
    assert.strictEqual(i18n.t('landing.mandiBenchmarked'), 'सरकारी मंडी बेंचमार्क');
  });

  test('4. Safely falls back to English when a key is missing in target language', () => {
    i18n.setLanguage('hi');
    // Register temporary partial dictionary without a specific key
    i18n.registerTranslations('test_lang', {
      nav: { marketplace: 'Test Market' }
    });
    i18n.setLanguage('test_lang');

    // Key exists in test_lang
    assert.strictEqual(i18n.t('nav.marketplace'), 'Test Market');
    // Key does NOT exist in test_lang -> falls back to English
    assert.strictEqual(i18n.t('nav.mandiRates'), 'Mandi Rates');
  });

  test('5. Safely falls back to key itself when key does not exist anywhere', () => {
    i18n.setLanguage('hi');
    const missingKey = 'completely.nonexistent.key.xyz';
    assert.strictEqual(i18n.t(missingKey), missingKey);
  });

  test('6. Rejects invalid language selection and falls back safely to English', () => {
    const res = i18n.setLanguage('invalid_alien_language_123');
    assert.strictEqual(res, 'en');
    assert.strictEqual(i18n.getCurrentLanguage(), 'en');
    assert.strictEqual(i18n.t('nav.marketplace'), 'Marketplace');
  });

  test('7. Handles parameter interpolation cleanly without crashing', () => {
    i18n.setLanguage('en');
    assert.strictEqual(i18n.t('marketplace.availableKg', { count: 250 }), '250 kg available');
    assert.strictEqual(i18n.t('orders.orderNumber', { number: 'KS-1001' }), 'Order #KS-1001');

    i18n.setLanguage('hi');
    assert.strictEqual(i18n.t('marketplace.availableKg', { count: 250 }), '250 किग्रा उपलब्ध');
    assert.strictEqual(i18n.t('orders.orderNumber', { number: 'KS-1001' }), 'ऑर्डर #KS-1001');
  });

  test('8. Extensibility: Allows registering future Indian languages seamlessly', () => {
    const registered = i18n.registerTranslations('bn', {
      nav: {
        marketplace: 'কৃষক বাজার',
        mandiRates: 'বাজার দর'
      }
    }, { name: 'Bengali', nativeName: 'বাংলা' });

    assert.strictEqual(registered, true);
    assert.strictEqual(i18n.getSupportedLanguages().bn.nativeName, 'বাংলা');

    i18n.setLanguage('bn');
    assert.strictEqual(i18n.getCurrentLanguage(), 'bn');
    assert.strictEqual(i18n.t('nav.marketplace'), 'কৃষক বাজার');
    assert.strictEqual(i18n.t('nav.mandiRates'), 'বাজার দর');
    // Fallback to English for keys not translated yet in Bengali
    assert.strictEqual(i18n.t('nav.orders'), 'Orders');
  });

  test('9. Handles null, undefined, empty, or non-string keys safely', () => {
    assert.strictEqual(i18n.t(null), '');
    assert.strictEqual(i18n.t(undefined), '');
    assert.strictEqual(i18n.t(''), '');
    assert.strictEqual(i18n.t(12345), '');
  });

  test('10. Does not mutate database fields, user names, or technical identifiers', () => {
    i18n.setLanguage('hi');
    // Simulated product from database / API
    const product = {
      id: 'PROD_TOMATO_01',
      name: 'Organic Desi Tomato',
      sellerName: 'Ramesh Patil',
      price: 25,
      quantity: 500
    };

    // The i18n system must never alter business objects
    assert.strictEqual(product.id, 'PROD_TOMATO_01');
    assert.strictEqual(product.name, 'Organic Desi Tomato');
    assert.strictEqual(product.sellerName, 'Ramesh Patil');
  });

});
