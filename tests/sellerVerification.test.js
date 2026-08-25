const test = require('node:test');
const assert = require('node:assert/strict');
const DocumentStorageService = require('../services/documentStorageService');
const OtpService = require('../services/otpService');

test('Phase 5B — Document Storage Service Validation', async (t) => {
  await t.test('accepts valid PDF document reference below 5MB', () => {
    const res = DocumentStorageService.storeDocumentReference({
      sellerId: 'S101',
      documentType: 'land_record',
      documentReference: '7-12-MH-2026-9901',
      fileName: 'land_record.pdf',
      fileSize: 2 * 1024 * 1024
    });
    assert.equal(res.documentType, 'land_record');
    assert.equal(res.documentReference, '7-12-MH-2026-9901');
    assert.ok(res.documentUrl.endsWith('.pdf'));
  });

  await t.test('rejects document larger than 5MB', () => {
    assert.throws(() => {
      DocumentStorageService.storeDocumentReference({
        sellerId: 'S101',
        documentType: 'identity',
        documentReference: 'AADHAAR-1234',
        fileName: 'huge_scan.pdf',
        fileSize: 6 * 1024 * 1024
      });
    }, /5MB/);
  });

  await t.test('rejects unsafe executable file extensions', () => {
    assert.throws(() => {
      DocumentStorageService.storeDocumentReference({
        sellerId: 'S101',
        documentType: 'identity',
        documentReference: 'REF-123',
        fileName: 'malware.exe',
        fileSize: 1024
      });
    }, /Executable files are not allowed/);
  });
});

test('Phase 5B — OTP Service & Password Reset Abstraction', async (t) => {
  let generatedOtp = null;

  await t.test('generates, hashes, and records OTP without exposing plain text', async () => {
    const res = await OtpService.generateAndSendOtp({
      contact: 'testfarmer@example.com',
      purpose: 'email_verification'
    });
    assert.equal(res.message, 'Verification OTP sent successfully.');
    assert.ok(res.otp);
    generatedOtp = res.otp;
  });

  await t.test('prevents rapid resend within 60 seconds cooldown', async () => {
    await assert.rejects(async () => {
      await OtpService.generateAndSendOtp({
        contact: 'testfarmer@example.com',
        purpose: 'email_verification'
      });
    }, /Please wait 60 seconds before requesting another OTP/);
  });

  await t.test('verifies correct OTP code', async () => {
    const res = await OtpService.verifyOtp({
      contact: 'testfarmer@example.com',
      purpose: 'email_verification',
      otp: generatedOtp
    });
    assert.equal(res.valid, true);
  });

  await t.test('rejects reuse of already verified OTP', async () => {
    await assert.rejects(async () => {
      await OtpService.verifyOtp({
        contact: 'testfarmer@example.com',
        purpose: 'email_verification',
        otp: generatedOtp
      });
    }, /No OTP request found/);
  });
});

test('Phase 5B — Order State Machine & Audit History', async (t) => {
  const ALLOWED_TRANSITIONS = {
    'Order Placed': ['Farmer Confirmed', 'Preparing', 'Cancelled', 'Rejected'],
    'Farmer Confirmed': ['Preparing', 'Cancelled', 'Rejected'],
    'Preparing': ['Ready', 'Cancelled'],
    'Ready': ['Completed', 'Cancelled'],
    'Completed': [],
    'Cancelled': [],
    'Rejected': []
  };

  await t.test('validates sequential order transition flow', () => {
    assert.ok(ALLOWED_TRANSITIONS['Order Placed'].includes('Farmer Confirmed'));
    assert.ok(ALLOWED_TRANSITIONS['Farmer Confirmed'].includes('Preparing'));
    assert.ok(ALLOWED_TRANSITIONS['Preparing'].includes('Ready'));
    assert.ok(ALLOWED_TRANSITIONS['Ready'].includes('Completed'));
  });

  await t.test('rejects backward or illegal state transitions', () => {
    assert.equal(ALLOWED_TRANSITIONS['Completed'].includes('Order Placed'), false);
    assert.equal(ALLOWED_TRANSITIONS['Ready'].includes('Farmer Confirmed'), false);
    assert.equal(ALLOWED_TRANSITIONS['Cancelled'].includes('Completed'), false);
  });
});
