const OtpService = require('../services/otpService');
const db = require('../db/db');
require('dotenv').config();

async function testLiveEmailJs() {
  await db.initDb();
  console.log('Testing live EmailJS dispatch...');
  console.log('Provider:', process.env.EMAIL_OTP_PROVIDER);
  console.log('Service ID:', process.env.EMAILJS_SERVICE_ID);
  console.log('Template ID:', process.env.EMAILJS_TEMPLATE_ID);

  try {
    const res = await OtpService.generateAndSendOtp({
      contact: 'test_receiver@example.com',
      purpose: 'email_verification',
      userName: 'KrishiSetu Test User'
    });
    console.log('Live EmailJS dispatch result:', res);
  } catch (err) {
    console.error('Live EmailJS dispatch error:', err.statusCode, err.message);
  }
}

testLiveEmailJs();
