'use strict';
const express    = require('express');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const path       = require('path');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// ── In-memory OTP store ────────────────────────────────────────
const otpStore = new Map();
const OTP_TTL  = 5 * 60 * 1000;   // 5 minutes
const MAX_ATTEMPTS = 5;

function hashOTP(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

// ── Email transport (Gmail) ────────────────────────────────────
function getTransport() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });
}

// ── POST /api/send-otp ─────────────────────────────────────────
app.post('/api/send-otp', async (req, res) => {
  const { email } = req.body || {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, error: 'Invalid email address' });
  }

  const transport = getTransport();
  if (!transport) {
    return res.status(503).json({
      success: false,
      error: 'Email not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in Railway variables.'
    });
  }

  // Rate limit: max 3 OTP requests per email per 10 min
  const existing = otpStore.get(email);
  if (existing && existing.expiry > Date.now() && (existing.sendCount || 0) >= 3) {
    return res.status(429).json({ success: false, error: 'Too many OTP requests. Try again later.' });
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));

  try {
    await transport.sendMail({
      from: `"SNL Innovations HR" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: 'Your HR System Login OTP',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px">
          <h2 style="color:#4F46E5;margin-bottom:8px">SNL Innovations HR System</h2>
          <p style="color:#64748b;margin-bottom:24px">Your one-time login password:</p>
          <div style="font-size:40px;font-weight:800;letter-spacing:12px;color:#0F172A;text-align:center;
                      background:#EEF2FF;padding:20px;border-radius:8px;margin-bottom:24px">
            ${otp}
          </div>
          <p style="color:#64748b;font-size:13px">Valid for <strong>5 minutes</strong>. Do not share this code with anyone.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
          <p style="color:#94a3b8;font-size:11px">If you didn't request this, ignore this email.</p>
        </div>
      `
    });

    otpStore.set(email, {
      hash: hashOTP(otp),
      expiry: Date.now() + OTP_TTL,
      attempts: 0,
      sendCount: (existing?.sendCount || 0) + 1
    });

    console.log(`OTP dispatched to ${email}`);
    return res.json({ success: true });
  } catch (err) {
    console.error('Email error:', err.message);
    return res.status(502).json({ success: false, error: 'Failed to send email: ' + err.message });
  }
});

// ── POST /api/verify-otp ───────────────────────────────────────
app.post('/api/verify-otp', (req, res) => {
  const { email, otp } = req.body || {};
  if (!email || !otp) return res.status(400).json({ success: false, error: 'Missing fields' });

  const record = otpStore.get(email);
  if (!record) return res.status(400).json({ success: false, error: 'No OTP requested for this email' });
  if (Date.now() > record.expiry) {
    otpStore.delete(email);
    return res.status(400).json({ success: false, error: 'OTP expired. Request a new one.' });
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(email);
    return res.status(429).json({ success: false, error: 'Too many wrong attempts. Request a new OTP.' });
  }
  record.attempts++;

  if (hashOTP(String(otp)) !== record.hash) {
    const left = MAX_ATTEMPTS - record.attempts;
    return res.status(401).json({ success: false, error: 'Invalid OTP', attemptsLeft: left });
  }

  otpStore.delete(email);

  const secret  = process.env.SESSION_SECRET || 'snl-hr-default-secret-change-me';
  const payload = `${email}:${Date.now()}`;
  const sig     = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const token   = Buffer.from(JSON.stringify({ payload, sig })).toString('base64');

  return res.json({ success: true, token, email });
});

// ── POST /api/verify-token ─────────────────────────────────────
app.post('/api/verify-token', (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ valid: false });
  try {
    const { payload, sig } = JSON.parse(Buffer.from(token, 'base64').toString());
    const secret   = process.env.SESSION_SECRET || 'snl-hr-default-secret-change-me';
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (sig !== expected) return res.json({ valid: false });
    const [,, ts]  = payload.split(':');   // email may contain ':'
    const emailPart = payload.slice(0, payload.lastIndexOf(':'));
    const age = Date.now() - Number(payload.split(':').pop());
    if (age > 8 * 60 * 60 * 1000) return res.json({ valid: false });
    return res.json({ valid: true, email: emailPart });
  } catch { return res.json({ valid: false }); }
});

// ── SPA catch-all ──────────────────────────────────────────────
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SNL HR System running on http://localhost:${PORT}`));
