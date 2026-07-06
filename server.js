'use strict';
const express = require('express');
const crypto  = require('crypto');
const path    = require('path');
const bcrypt  = require('bcryptjs');
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// ── Supabase Client ────────────────────────────────────────────
const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in environment variables');
  }
  _supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  });
  return _supabase;
}

// ── In-memory cache (reduces Supabase round-trips on warm Vercel instances) ──
let _dbCache    = null;
let _dbCacheTime = 0;
const DB_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ── Database Helpers ──────────────────────────────────────────
async function loadData() {
  if (_dbCache && (Date.now() - _dbCacheTime < DB_CACHE_TTL)) return _dbCache;
  try {
    const { data: row, error } = await getSupabase()
      .from('hr_data')
      .select('data')
      .eq('key', 'main')
      .maybeSingle();

    if (error) throw error;

    let data = row?.data;

    // Auto-migrate from MongoDB on first Supabase deploy (runs once)
    if (!data && process.env.MONGO_URI) {
      console.log('Supabase has no HR data — attempting one-time migration from MongoDB…');
      data = await migrateFromMongo();
    }

    data = data || {};

    // One-time: normalize all weekOff to "Sun"
    if (!data._weekOffMigrated && Array.isArray(data.employees)) {
      let changed = false;
      data.employees.forEach(emp => {
        if ((emp.weekOff || '').toLowerCase().includes('sat')) {
          emp.weekOff = 'Sun';
          changed = true;
        }
      });
      data._weekOffMigrated = true;
      if (changed) console.log('Migration: weekOff normalized to Sun for all employees');
      await saveData(data);
    }

    _dbCache    = data;
    _dbCacheTime = Date.now();
    return _dbCache;
  } catch (err) {
    console.error('DB Load Error:', err.message);
    return _dbCache || {};
  }
}

async function saveData(data) {
  try {
    const { error } = await getSupabase()
      .from('hr_data')
      .upsert(
        { key: 'main', data, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
    if (error) throw error;
    _dbCache    = data;
    _dbCacheTime = Date.now();
    return true;
  } catch (err) {
    console.error('DB Save Error:', err.message);
    return false;
  }
}

// ── One-time MongoDB → Supabase migration ─────────────────────
async function migrateFromMongo() {
  try {
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 20000,
    });
    const MongoHRData = mongoose.models.HRData ||
      mongoose.model('HRData', new mongoose.Schema({ key: String, data: mongoose.Schema.Types.Mixed }));
    const doc = await MongoHRData.findOne({ key: 'main' }).lean();
    await mongoose.disconnect();
    if (doc?.data) {
      await saveData(doc.data);
      console.log('✅ MongoDB → Supabase migration complete. All HR data synced.');
      return doc.data;
    }
    console.log('MongoDB had no data to migrate.');
    return null;
  } catch (err) {
    console.error('MongoDB migration failed:', err.message);
    return null;
  }
}

// ── Auth Middleware ───────────────────────────────────────────
function authenticate(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1] || req.body?.token;
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const { payload, sig } = JSON.parse(Buffer.from(token, 'base64').toString());
    const secret   = process.env.SESSION_SECRET || 'snl-hr-default-secret-change-me';
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
  { id: 'adm1', name: 'Namit Rawat',     email: 'namit@innofarms.co.in',      role: 'Admin',      password: 'Snl@1234' },
  { id: 'adm2', name: 'Akhil Bhaskar',   email: 'akhil@innofarms.co.in',      role: 'HR',         password: 'Snl@1234' },
  { id: 'adm3', name: 'Saurabh Gupta',   email: 'saurabh@innofarms.co.in',    role: 'CBO',        password: 'Snl@1234' },
  { id: 'adm5', name: 'Liza Gupta',      email: 'liza@innofarms.co.in',       role: 'COO',        password: 'Snl@1234' },
  { id: 'adm6', name: 'Sudhanshu Gupta', email: 'sudhanshu@innofarms.co.in',  role: 'CEO',        password: 'Snl@1234' },
  { id: 'adm7', name: 'Astha Oberoi',    email: 'astha@innofarms.co.in',      role: 'Management', password: 'Snl@1234' },
  { id: 'adm8', name: 'Accounts',        email: 'accounts@innofarms.co.in',   role: 'Accounts',   password: 'Snl@1234' },
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

  const user = adminUsers.find(u => (u.email || '').toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid email or password' });
  }

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
  return res.json({ success: true, token, email: email.toLowerCase(), name: user.name, role: user.role, hrData: dbData });
});

// ── POST /api/employee-login ───────────────────────────────────
app.post('/api/employee-login', async (req, res) => {
  const { empId, password } = req.body || {};
  if (!empId || !password) {
    return res.status(400).json({ success: false, error: 'Employee ID and password required' });
  }

  const dbData = await loadData();
  const emp = (dbData.employees || []).find(e => e.id === String(empId));
  if (!emp) {
    return res.status(401).json({ success: false, error: 'Employee ID not found' });
  }

  const storedPw = emp.password || 'Snl@1234';
  const isBcrypt = storedPw.startsWith('$2');
  const match    = isBcrypt ? await bcrypt.compare(password, storedPw) : storedPw === password;

  if (!match) {
    return res.status(401).json({ success: false, error: 'Invalid password' });
  }

  if (!isBcrypt && dbData.employees) {
    const record = dbData.employees.find(e => e.id === String(empId));
    if (record) {
      record.password = await bcrypt.hash(password, 10);
      await saveData(dbData);
    }
  }

  const secret  = process.env.SESSION_SECRET || 'snl-hr-default-secret-change-me';
  const payload = `emp:${empId}:${Date.now()}`;
  const sig     = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const token   = Buffer.from(JSON.stringify({ payload, sig })).toString('base64');

  console.log(`Employee login: ${emp.name} (${empId})`);
  return res.json({ success: true, token, empId: String(empId), name: emp.name, role: 'Employee', hrData: dbData });
});

// ── POST /api/verify-token ─────────────────────────────────────
app.post('/api/verify-token', async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ valid: false });
  try {
    const { payload, sig } = JSON.parse(Buffer.from(token, 'base64').toString());
    const secret   = process.env.SESSION_SECRET || 'snl-hr-default-secret-change-me';
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (sig !== expected) return res.json({ valid: false });
    const parts = payload.split(':');
    const age   = Date.now() - Number(parts[parts.length - 1]);
    if (age > 8 * 60 * 60 * 1000) return res.json({ valid: false });
    const hrData = await loadData();
    if (parts[0] === 'emp') {
      return res.json({ valid: true, type: 'employee', empId: parts[1], hrData });
    }
    const emailPart = payload.slice(0, payload.lastIndexOf(':'));
    // Resolve name+role using same priority as login (DB users → DEFAULT_ADMIN_USERS fallback)
    const adminUsers = (hrData.adminUsers && hrData.adminUsers.length > 0)
      ? hrData.adminUsers
      : DEFAULT_ADMIN_USERS;
    const adminUser = adminUsers.find(u => (u.email || '').toLowerCase() === emailPart.toLowerCase());
    return res.json({
      valid: true, type: 'admin', email: emailPart,
      name: adminUser?.name, role: adminUser?.role, hrData
    });
  } catch { return res.json({ valid: false }); }
});

// ── Data Sync API ─────────────────────────────────────────────
app.get('/api/hr-data', authenticate, async (_req, res) => {
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

// ── Test helpers (only active in test environment) ────────────
if (process.env.NODE_ENV === 'test') {
  app._resetCache = () => { _dbCache = null; _dbCacheTime = 0; };
}

// ── SPA catch-all ──────────────────────────────────────────────
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SNL HR System running on http://localhost:${PORT}`));

module.exports = app;
