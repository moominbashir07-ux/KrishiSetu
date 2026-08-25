require('dotenv').config();
const OtpService = require('../services/otpService');

async function testLiveEmailJs() {
  const targetEmail = 'moominbashir07@gmail.com';
  console.log(`[TEST] Dispatching live EmailJS OTP to ${targetEmail}...`);

  try {
    const res = await OtpService.sendEmailJsOtp({
      contact: targetEmail,
      otpCode: '854912',
      purpose: 'email_verification',
      userName: 'Moomin Bashir'
    });
    console.log('[SUCCESS] EmailJS API returned 200 OK! Check inbox for code 854912.');
  } catch (err) {
    console.error('[FAILURE] EmailJS API dispatch failed:', err.message);
  }
}

testLiveEmailJs();
