'use strict';
const express   = require('express');
const crypto    = require('crypto');
const path      = require('path');
const fs        = require('fs');
const bcrypt    = require('bcryptjs');
const mongoose  = require('mongoose');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// ── MongoDB Connection ─────────────────────────────────────────
// Force Node.js to use Google DNS (fixes ECONNREFUSED on Windows with broken system DNS)
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/snl_hr';

mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 })
  .then(() => {
    console.log('MongoDB connected');
    migrateFromFileIfNeeded();
  })
  .catch(err => {
    console.error('MongoDB connection failed:', err.message);
    console.error('Check your MONGO_URI and Network Access whitelist in Atlas');
    // Keep server running so it can retry; mongoose retries automatically
  });

// One document holds all HR data for the company
const HRData = mongoose.model('HRData', new mongoose.Schema({
  key:  { type: String, default: 'main', unique: true },
  data: mongoose.Schema.Types.Mixed
}, { timestamps: true }));

// ── One-time migration from database.json (if it exists) ──────
async function migrateFromFileIfNeeded() {
  try {
    const exists = await HRData.findOne({ key: 'main' });
    if (exists) return; // Already have data in MongoDB

    const filePath = path.join(__dirname, 'database.json');
    if (!fs.existsSync(filePath)) return;

    const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!fileData || !fileData.employees) return;

    await HRData.create({ key: 'main', data: fileData });
    console.log('Migrated database.json → MongoDB');
  } catch (err) {
    console.error('Migration error:', err.message);
  }
}

// ── Database Helpers ──────────────────────────────────────────
async function loadData() {
  try {
    const doc = await HRData.findOne({ key: 'main' });
    return doc?.data || {};
  } catch (err) {
    console.error('DB Load Error:', err);
    return {};
  }
}

async function saveData(data) {
  try {
    await HRData.findOneAndUpdate(
      { key: 'main' },
      { data },
      { upsert: true, new: true }
    );
    return true;
  } catch (err) {
    console.error('DB Save Error:', err);
    return false;
  }
}

// ── Auth Middleware ───────────────────────────────────────────
function authenticate(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1] || req.body?.token;
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const { payload, sig } = JSON.parse(Buffer.from(token, 'base64').toString());
    const secret = process.env.SESSION_SECRET || 'snl-hr-default-secret-change-me';
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    if (sig !== expected) return res.status(401).json({ success: false, error: 'Invalid token' });

    const ts = Number(payload.split(':').pop());
    if (Date.now() - ts > 8 * 60 * 60 * 1000) {
      return res.status(401).json({ success: false, error: 'Session expired' });
    }

    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Authentication failed' });
  }
}

// ── Default admin users (server-side fallback) ────────────────
const DEFAULT_ADMIN_USERS = [
  { id: 'adm1', name: 'Namit Rawat',     email: 'namit@innofarms.co.in',      role: 'Admin',    password: 'Snl@1234' },
  { id: 'adm2', name: 'Akhil Bhaskar',   email: 'akhil@innofarms.co.in',      role: 'HR',       password: 'Snl@1234' },
  { id: 'adm3', name: 'Saurabh Gupta',   email: 'saurabh@innofarms.co.in',    role: 'CBO',      password: 'Snl@1234' },
  { id: 'adm4', name: 'Chandresh Modi',  email: 'chandresh@innofarms.co.in',  role: 'Accounts', password: 'Snl@1234' },
  { id: 'adm5', name: 'Liza Gupta',      email: 'liza@innofarms.co.in',       role: 'COO',      password: 'Snl@1234' },
  { id: 'adm6', name: 'Sudhanshu Gupta', email: 'sudhanshu@innofarms.co.in',  role: 'CEO',      password: 'Snl@1234' },
];

// ── POST /api/login ────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  const dbData = await loadData();
  const adminUsers = (dbData.adminUsers && dbData.adminUsers.length > 0)
    ? dbData.adminUsers
    : DEFAULT_ADMIN_USERS;

  const user = adminUsers.find(u =>
    (u.email || '').toLowerCase() === email.toLowerCase()
  );

  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid email or password' });
  }

  // Support bcrypt hashes and plain text (auto-upgrades plain text on first login)
  const storedPw = user.password || 'Snl@1234';
  const isBcrypt = storedPw.startsWith('$2');
  const match    = isBcrypt
    ? await bcrypt.compare(password, storedPw)
    : storedPw === password;

  if (!match) {
    return res.status(401).json({ success: false, error: 'Invalid email or password' });
  }

  // Auto-upgrade plain-text password to bcrypt hash
  if (!isBcrypt && dbData.adminUsers) {
    const record = dbData.adminUsers.find(u => u.id === user.id);
    if (record) {
      record.password = await bcrypt.hash(password, 10);
      await saveData(dbData);
    }
  }

  const secret  = process.env.SESSION_SECRET || 'snl-hr-default-secret-change-me';
  const payload = `${email.toLowerCase()}:${Date.now()}`;
  const sig     = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const token   = Buffer.from(JSON.stringify({ payload, sig })).toString('base64');

  console.log(`Login: ${user.name} (${user.role})`);
  return res.json({ success: true, token, email: email.toLowerCase(), name: user.name, role: user.role });
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
    const emailPart = payload.slice(0, payload.lastIndexOf(':'));
    const age = Date.now() - Number(payload.split(':').pop());
    if (age > 8 * 60 * 60 * 1000) return res.json({ valid: false });
    return res.json({ valid: true, email: emailPart });
  } catch { return res.json({ valid: false }); }
});

// ── Data Sync API ─────────────────────────────────────────────
app.get('/api/hr-data', authenticate, async (req, res) => {
  const data = await loadData();
  res.json({ success: true, data });
});

app.post('/api/hr-data', authenticate, async (req, res) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ success: false, error: 'No data provided' });

  if (await saveData(data)) {
    res.json({ success: true });
  } else {
    res.status(500).json({ success: false, error: 'Failed to save data' });
  }
});

// ── SPA catch-all ──────────────────────────────────────────────
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SNL HR System running on http://localhost:${PORT}`));

module.exports = app;
