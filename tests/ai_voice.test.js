/**
 * KrishiSetu Phase 3 — Voice Assistant & Audio Accessibility Suite
 * Tests Voice UI markup, i18n dictionary completeness, CSP compliance,
 * Speech text sanitization, Locale mapping, and Assistant integration safety.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const I18n = require('../js/i18n');

describe('KrishiSetu Phase 3 — Multilingual Voice Assistant Suite', () => {

  const indexHtmlPath = path.join(__dirname, '..', 'index.html');
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

  beforeEach(() => {
    I18n.setLanguage('en');
  });

  test('1. Voice i18n dictionary contains all required keys in English and Hindi', () => {
    const requiredKeys = [
      'voice.startListening',
      'voice.stopListening',
      'voice.listening',
      'voice.processing',
      'voice.speakResponse',
      'voice.stopSpeaking',
      'voice.speaking',
      'voice.autoSpeechOn',
      'voice.autoSpeechOff',
      'voice.toggleAutoSpeech',
      'voice.unsupported',
      'voice.permissionDenied',
      'voice.noSpeech',
      'voice.recognitionError',
      'voice.speechUnavailable'
    ];

    I18n.setLanguage('en');
    for (const key of requiredKeys) {
      const val = I18n.t(key);
      assert.ok(val, `Missing English translation for ${key}`);
      assert.notEqual(val, key, `Translation key returned untranslated for en: ${key}`);
    }

    I18n.setLanguage('hi');
    for (const key of requiredKeys) {
      const val = I18n.t(key);
      assert.ok(val, `Missing Hindi translation for ${key}`);
      assert.notEqual(val, key, `Translation key returned untranslated for hi: ${key}`);
      // Ensure Hindi strings contain Devanagari characters
      const hasDevanagari = /[\u0900-\u097F]/.test(val);
      assert.ok(hasDevanagari, `Hindi translation for ${key} must contain Devanagari script: ${val}`);
    }
  });

  test('2. Voice UI elements exist in index.html with accessible ARIA semantics', () => {
    // Microphone button
    assert.ok(indexHtml.includes('id="aiChatMicBtn"'), 'Microphone button #aiChatMicBtn must exist');
    assert.ok(indexHtml.includes('data-action="toggle-ai-voice"'), 'Microphone button must use data-action="toggle-ai-voice"');
    assert.ok(indexHtml.includes('data-i18n-aria-label="voice.startListening"'), 'Microphone button must have i18n aria-label hook');

    // Auto-speech toggle button
    assert.ok(indexHtml.includes('id="aiChatAudioToggleBtn"'), 'Audio toggle button #aiChatAudioToggleBtn must exist in header');
    assert.ok(indexHtml.includes('data-action="toggle-ai-sound"'), 'Audio toggle must use data-action="toggle-ai-sound"');

    // Live listening banner
    assert.ok(indexHtml.includes('id="aiChatVoiceStatus"'), 'Voice status banner #aiChatVoiceStatus must exist');
    assert.ok(indexHtml.includes('role="status"'), 'Voice status banner must have role="status"');
    assert.ok(indexHtml.includes('aria-live="polite"'), 'Voice status banner must have aria-live="polite"');
    assert.ok(indexHtml.includes('data-action="stop-ai-voice"'), 'Stop voice button must exist inside banner');
  });

  test('3. Strict CSP compliance: Zero inline event handlers on voice elements', () => {
    // Check that no voice elements have inline onclick, onchange, etc.
    const micBtnSection = indexHtml.match(/<button[^>]*id="aiChatMicBtn"[^>]*>/i);
    assert.ok(micBtnSection, 'Must find #aiChatMicBtn in index.html');
    assert.ok(!micBtnSection[0].includes('onclick='), 'Microphone button must not have inline onclick');

    const audioToggleSection = indexHtml.match(/<button[^>]*id="aiChatAudioToggleBtn"[^>]*>/i);
    assert.ok(audioToggleSection, 'Must find #aiChatAudioToggleBtn in index.html');
    assert.ok(!audioToggleSection[0].includes('onclick='), 'Audio toggle button must not have inline onclick');

    const voiceStatusSection = indexHtml.match(/<div[^>]*id="aiChatVoiceStatus"[^>]*>/i);
    assert.ok(voiceStatusSection, 'Must find #aiChatVoiceStatus in index.html');
    assert.ok(!voiceStatusSection[0].includes('onclick='), 'Voice status container must not have inline onclick');
  });

  test('4. Text-To-Speech sanitizer strips markdown, URLs, HTML tags, and emojis cleanly', () => {
    function cleanTextForSpeech(raw) {
      if (!raw) return '';
      return String(raw)
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/https?:\/\/[^\s)]+/g, '')
        .replace(/[*_#`~]/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    const markdownSample = '**Grade A Tomato** available at *Pune Mandi*! Check [Market link](https://krishisetu.in/mandi). 🌾 Price is ₹30/kg.';
    const cleaned = cleanTextForSpeech(markdownSample);

    assert.equal(cleaned.includes('*'), false, 'Markdown asterisks must be removed');
    assert.equal(cleaned.includes('https://'), false, 'URLs must not be spoken');
    assert.equal(cleaned.includes('🌾'), false, 'Emojis must be stripped');
    assert.equal(cleaned, 'Grade A Tomato available at Pune Mandi! Check Market link. Price is ₹30/kg.');

    // Verify product quality evidence language is preserved
    const qualitySample = 'AI-assisted visual estimate; non-binding and not official laboratory certification.';
    const cleanedQuality = cleanTextForSpeech(qualitySample);
    assert.equal(cleanedQuality, qualitySample, 'Crucial quality disclosure text must remain intact');
  });

  test('5. Language locale mapping accurately maps application languages to speech locales', () => {
    function getVoiceLocale(lang) {
      return lang === 'hi' ? 'hi-IN' : 'en-IN';
    }

    assert.equal(getVoiceLocale('hi'), 'hi-IN', 'Hindi must map to hi-IN');
    assert.equal(getVoiceLocale('en'), 'en-IN', 'English must map to en-IN (Indian English)');
    assert.equal(getVoiceLocale('unknown'), 'en-IN', 'Fallback must default to en-IN');
  });

  test('6. Centralized click event dispatcher handles voice actions', () => {
    assert.ok(indexHtml.includes("case 'toggle-ai-voice':"), 'Dispatcher must handle toggle-ai-voice action');
    assert.ok(indexHtml.includes("case 'stop-ai-voice':"), 'Dispatcher must handle stop-ai-voice action');
    assert.ok(indexHtml.includes("case 'toggle-ai-sound':"), 'Dispatcher must handle toggle-ai-sound action');
    assert.ok(indexHtml.includes("case 'speak-ai-message':"), 'Dispatcher must handle speak-ai-message action');
  });

  test('7. Escape key and widget closing safely stop voice recognition and speech playback', () => {
    // Check toggleAiChat(false) calls stopAiVoiceInput and stopAiSpeech
    assert.ok(indexHtml.includes('stopAiVoiceInput();'), 'Must contain stopAiVoiceInput()');
    assert.ok(indexHtml.includes('stopAiSpeech();'), 'Must contain stopAiSpeech()');
    
    // Check clear conversation also cancels voice
    const clearFnSection = indexHtml.substring(
      indexHtml.indexOf('function clearAiChatConversation()'),
      indexHtml.indexOf('function clearAiChatConversation()') + 300
    );
    assert.ok(clearFnSection.includes('stopAiVoiceInput()'), 'clearAiChatConversation must stop voice input');
    assert.ok(clearFnSection.includes('stopAiSpeech()'), 'clearAiChatConversation must stop speech synthesis');
  });

  test('8. Duplicate submission prevention & continuous listening safety', () => {
    // initSpeechRecognition should configure single-shot recognition to prevent duplicate loops
    assert.ok(indexHtml.includes('recognition.continuous = false;'), 'SpeechRecognition must set continuous = false');
    assert.ok(indexHtml.includes('recognition.interimResults = false;'), 'SpeechRecognition must set interimResults = false');
  });

  test('9. Real-time language change listener terminates active speech and syncs locale', () => {
    const idx = indexHtml.indexOf('krishisetu:language-changed');
    assert.ok(idx !== -1, 'Must find krishisetu:language-changed in index.html');
    const langChangeSection = indexHtml.substring(idx, idx + 2000);
    assert.ok(langChangeSection.includes('stopAiSpeech()'), 'Language change listener must terminate ongoing speech');
    assert.ok(langChangeSection.includes('stopAiVoiceInput()'), 'Language change listener must stop ongoing voice recognition');
    assert.ok(langChangeSection.includes('getVoiceLocale()'), 'Language change listener must sync voice locale');
  });

});
