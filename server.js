'use strict';
const express = require('express');
const path    = require('path');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));  // serve index.html, app.js, style.css

// ── OTP via Fast2SMS ──────────────────────────────────────────
app.post('/api/send-otp', async (req, res) => {
  const { phone, otp } = req.body || {};
  if (!phone || !otp) return res.status(400).json({ success: false, error: 'Missing phone or otp' });

  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey) {
    // No SMS key configured — client will fall back to WhatsApp
    return res.json({ success: false, method: 'none', reason: 'FAST2SMS_API_KEY not set' });
  }

  try {
    const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: {
        'authorization': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        variables_values: otp,
        route: 'otp',
        numbers: phone
      })
    });
    const data = await response.json();
    if (data.return === true) {
      console.log(`OTP ${otp} sent to ${phone} via Fast2SMS`);
      return res.json({ success: true, method: 'sms' });
    }
    throw new Error(data.message || JSON.stringify(data));
  } catch (err) {
    console.error('Fast2SMS error:', err.message);
    return res.json({ success: false, method: 'none', error: err.message });
  }
});

// ── SPA catch-all ─────────────────────────────────────────────
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SNL HR System running on http://localhost:${PORT}`));
