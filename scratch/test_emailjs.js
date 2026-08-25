require('dotenv').config();

async function testEmailJSBrowserHeader() {
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_ID;

  console.log('Testing EmailJS with Browser Origin header:');

  const payload = {
    service_id: serviceId,
    template_id: templateId,
    user_id: publicKey,
    template_params: {
      to_email: 'moominbashir07@gmail.com',
      email: 'moominbashir07@gmail.com',
      recipient_email: 'moominbashir07@gmail.com',
      to_name: 'Moomin',
      user_name: 'Moomin',
      name: 'Moomin',
      otp: '654321',
      otp_code: '654321',
      code: '654321',
      verification_code: '654321',
      purpose: 'SIGNUP VERIFICATION',
      expires_in: '10 minutes',
      app_name: 'KrishiSetu'
    }
  };

  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify(payload)
    });

    const status = res.status;
    const text = await res.text();
    console.log('Response status with Origin header:', status);
    console.log('Response body:', text);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

testEmailJSBrowserHeader();
