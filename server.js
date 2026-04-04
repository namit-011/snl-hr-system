'use strict';
const express = require('express');
const crypto  = require('crypto');
const path    = require('path');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// ── In-memory OTP store (phone → { hash, expiry, attempts }) ──
const otpStore = new Map();
const OTP_TTL  = 5 * 60 * 1000;  // 5 minutes
const MAX_ATTEMPTS = 5;

function hashOTP(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

// ── POST /api/send-otp ────────────────────────────────────────
// Generates OTP server-side, sends via SMS, never returns OTP to client
app.post('/api/send-otp', async (req, res) => {
  const { phone } = req.body || {};
  if (!phone || !/^\d{10}$/.test(phone)) {
    return res.status(400).json({ success: false, error: 'Invalid phone number' });
  }

  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      success: false,
      error: 'SMS service not configured. Add FAST2SMS_API_KEY to Railway environment variables.'
    });
  }

  // Rate limit: max 3 requests per phone per 10 minutes
  const existing = otpStore.get(phone);
  if (existing && existing.expiry > Date.now() && existing.sendCount >= 3) {
    return res.status(429).json({ success: false, error: 'Too many OTP requests. Try again later.' });
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));

  try {
    const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: { 'authorization': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ variables_values: otp, route: 'otp', numbers: phone })
    });
    const data = await response.json();
    if (data.return !== true) throw new Error(data.message || JSON.stringify(data));

    // Store hash only — OTP never leaves the server
    otpStore.set(phone, {
      hash: hashOTP(otp),
      expiry: Date.now() + OTP_TTL,
      attempts: 0,
      sendCount: (existing?.sendCount || 0) + 1
    });

    console.log(`OTP dispatched to ${phone}`); // log without printing the actual OTP
    return res.json({ success: true });
  } catch (err) {
    console.error('Fast2SMS error:', err.message);
    return res.status(502).json({ success: false, error: 'Failed to send SMS: ' + err.message });
  }
});

// ── POST /api/verify-otp ──────────────────────────────────────
// Verifies OTP submitted by client — returns session token on success
app.post('/api/verify-otp', (req, res) => {
  const { phone, otp } = req.body || {};
  if (!phone || !otp) return res.status(400).json({ success: false, error: 'Missing fields' });

  const record = otpStore.get(phone);
  if (!record) return res.status(400).json({ success: false, error: 'No OTP requested for this number' });
  if (Date.now() > record.expiry) {
    otpStore.delete(phone);
    return res.status(400).json({ success: false, error: 'OTP expired' });
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(phone);
    return res.status(429).json({ success: false, error: 'Too many wrong attempts' });
  }

  record.attempts++;

  if (hashOTP(String(otp)) !== record.hash) {
    return res.status(401).json({ success: false, error: 'Invalid OTP', attemptsLeft: MAX_ATTEMPTS - record.attempts });
  }

  // Correct — delete OTP so it can't be reused
  otpStore.delete(phone);

  // Issue a simple signed session token (HMAC)
  const secret  = process.env.SESSION_SECRET || 'snl-hr-default-secret-change-me';
  const payload = `${phone}:${Date.now()}`;
  const sig     = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const token   = Buffer.from(JSON.stringify({ payload, sig })).toString('base64');

  return res.json({ success: true, token, phone });
});

// ── POST /api/verify-token ────────────────────────────────────
// Lets client re-validate a stored token on page refresh
app.post('/api/verify-token', (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ valid: false });
  try {
    const { payload, sig } = JSON.parse(Buffer.from(token, 'base64').toString());
    const secret  = process.env.SESSION_SECRET || 'snl-hr-default-secret-change-me';
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (sig !== expected) return res.json({ valid: false });
    const [phone, ts] = payload.split(':');
    const age = Date.now() - Number(ts);
    if (age > 8 * 60 * 60 * 1000) return res.json({ valid: false }); // 8h expiry
    return res.json({ valid: true, phone });
  } catch { return res.json({ valid: false }); }
});

// ── SPA catch-all ─────────────────────────────────────────────
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SNL HR System running on http://localhost:${PORT}`));
