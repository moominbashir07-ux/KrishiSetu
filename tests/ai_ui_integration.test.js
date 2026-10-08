const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const i18n = require('../js/i18n');

test('KrishiSetu Phase 2 — AI Chatbot UI & Accessibility Integration Suite', async (t) => {
  const indexPath = path.join(__dirname, '..', 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');

  await t.test('1. Floating AI Assistant container and launcher button exist in DOM', () => {
    assert.ok(indexHtml.includes('id="aiChatContainer"'), 'Must contain #aiChatContainer');
    assert.ok(indexHtml.includes('id="aiChatLauncher"'), 'Must contain #aiChatLauncher');
    assert.ok(indexHtml.includes('data-action="toggle-ai-chat"'), 'Launcher must have toggle-ai-chat action');
  });

  await t.test('2. Chatbot widget exists with strict WCAG accessibility attributes', () => {
    assert.ok(indexHtml.includes('id="aiChatWidget"'), 'Must contain #aiChatWidget');
    assert.ok(indexHtml.includes('role="dialog"'), 'Widget must have role="dialog"');
    assert.ok(indexHtml.includes('aria-labelledby="aiChatTitle"'), 'Widget must have aria-labelledby');
    assert.ok(indexHtml.includes('id="aiChatTitle"'), 'Widget must have header title with id="aiChatTitle"');
  });

  await t.test('3. Chat conversation area, typing indicator, and form controls exist', () => {
    assert.ok(indexHtml.includes('id="aiChatMessages"'), 'Must contain #aiChatMessages');
    assert.ok(indexHtml.includes('id="aiChatTypingIndicator"'), 'Must contain #aiChatTypingIndicator');
    assert.ok(indexHtml.includes('id="aiChatForm"'), 'Must contain #aiChatForm');
    assert.ok(indexHtml.includes('id="aiChatInput"'), 'Must contain #aiChatInput');
    assert.ok(indexHtml.includes('id="aiChatSendBtn"'), 'Must contain #aiChatSendBtn');
  });

  await t.test('4. Strict CSP compliance: Zero inline event handlers (script-src-attr none)', () => {
    const chatContainerMatch = indexHtml.match(/<div id="aiChatContainer"[\s\S]*?<\/form>\s*<\/div>\s*<\/div>/);
    assert.ok(chatContainerMatch, 'Must find aiChatContainer block');
    const chatBlock = chatContainerMatch[0];
    const inlineEventHandlers = /on(click|submit|change|input|keydown|keyup|load|error)\s*=/i;
    assert.ok(!inlineEventHandlers.test(chatBlock), 'No inline event handlers allowed in AI Chatbot UI');
  });

  await t.test('5. Keyboard accessibility: Escape key listener is registered to dismiss chat', () => {
    assert.ok(indexHtml.includes("e.key === 'Escape'"), 'Must handle Escape key for accessibility');
    assert.ok(indexHtml.includes("toggleAiChat(false)"), 'Escape must close chat widget');
  });

  await t.test('6. Internationalization: All required chat.* translation keys exist for en and hi', () => {
    const requiredKeys = [
      'chat.title',
      'chat.subtitle',
      'chat.welcomeMessage',
      'chat.inputPlaceholder',
      'chat.send',
      'chat.clear',
      'chat.close',
      'chat.typing',
      'chat.signInRequired',
      'chat.signInPrompt',
      'chat.promptQuality',
      'chat.promptMandi',
      'chat.promptBuy',
      'chat.promptSell',
      'chat.errorGeneric',
      'chat.aiUnavailable'
    ];

    i18n.setLanguage('en');
    for (const key of requiredKeys) {
      const val = i18n.t(key);
      assert.notEqual(val, key, `English key ${key} must have translated value`);
      assert.ok(val.length > 0, `English key ${key} must not be empty`);
    }

    i18n.setLanguage('hi');
    for (const key of requiredKeys) {
      const val = i18n.t(key);
      assert.notEqual(val, key, `Hindi key ${key} must have translated value`);
      assert.ok(val.length > 0, `Hindi key ${key} must not be empty`);
    }
  });

  await t.test('7. Language synchronization: krishisetu:language-changed triggers chat UI translation', () => {
    assert.ok(
      indexHtml.includes("window.addEventListener('krishisetu:language-changed'"),
      'Must listen for language change event'
    );
    assert.ok(
      indexHtml.includes("I18n.applyTranslations($('aiChatWidget'))"),
      'Must apply translations to AI chat widget on language switch'
    );
  });

  await t.test('8. Product Details Modal displays transparent Quality & Verification Signals', () => {
    assert.ok(indexHtml.includes('Quality & Verification Signals'), 'Product modal must contain Quality Signals header');
    assert.ok(indexHtml.includes('Declared Grade:'), 'Must show declared grade');
    assert.ok(indexHtml.includes('Buyer Rating:'), 'Must show verified buyer rating');
    assert.ok(indexHtml.includes('Verified Purchases:'), 'Must show verified purchase count');
    assert.ok(indexHtml.includes('48h Quality Dispute Window'), 'Must show 48h quality dispute protection');
  });
});
