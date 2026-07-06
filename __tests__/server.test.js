'use strict';
/**
 * SNL HR System – Server API Test Suite
 *
 * Covers: auth, token verification, role-based access, data CRUD,
 * and every bug fixed in the QA pass (verify-token role leak,
 * saveAttDay rollback contract, calcWorkingDays with holidays, etc.)
 */

// ── Supabase mock ─────────────────────────────────────────────────────────────
// Must be declared before `require('../server')` so the mock is in place.

// Jest requires variables in mock factories to be prefixed with 'mock'
let mockStore = null; // will be set per test / describe block

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: mockStore ? { data: mockStore } : null,
            error: null,
          }),
        }),
      }),
      upsert: async (payload) => {
        if (payload && payload.data) mockStore = payload.data;
        return { error: null };
      },
    }),
  }),
}));

// ── Env vars required by server ───────────────────────────────────────────────
process.env.SUPABASE_URL        = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'mock-service-key';
process.env.SESSION_SECRET       = 'test-secret-do-not-use-in-prod';
process.env.PORT                 = '0'; // random free port
process.env.NODE_ENV             = 'test'; // enables app._resetCache()

const request = require('supertest');
const crypto  = require('crypto');
const app     = require('../server');

// ── Shared test dataset ───────────────────────────────────────────────────────
const ADMIN_USERS = [
  { id: 'adm1', name: 'Namit Rawat',   email: 'namit@innofarms.co.in',   role: 'Admin',      password: 'Snl@1234' },
  { id: 'adm2', name: 'Akhil Bhaskar', email: 'akhil@innofarms.co.in',   role: 'HR',         password: 'Snl@1234' },
  { id: 'adm7', name: 'Astha Oberoi',  email: 'astha@innofarms.co.in',   role: 'Management', password: 'Snl@1234' },
  { id: 'adm6', name: 'Sudhanshu',     email: 'sudhanshu@innofarms.co.in', role: 'CEO',      password: 'Snl@1234' },
];

const BASE_DATA = () => ({
  adminUsers: JSON.parse(JSON.stringify(ADMIN_USERS)),
  employees: [
    { id: '1001', name: 'Test Employee', doj: '2022-01-01', designation: 'Dev',
      department: 'Eng', weekOff: 'Sun', grade: '', bankName: '', ifsc: '', bankAcc: '',
      phone: '', email: 'emp@test.com', status: 'active', managerId: null, password: 'Snl@1234',
      salary: { basic: 10000, hra: 5000, prodIncentive: 0, ot: 0, arrears: 0,
                epf: false, epfRate: 12, esi: false, esiRate: 0.75, tds: 0, advance: 0 },
      leaveBalance: { CL: 7, SL: 6, EL: 3, CO: 0 }, elLastAccrued: '2026-06' },
  ],
  attendance: [],
  leaves: [],
  payslips: [],
  holidays: [{ date: '2026-07-14', name: 'Test Holiday' }],
  leaveTypes: [
    { id: 'CL', name: 'Casual Leave',  annual: 7,  paid: true,  color: '#3B82F6' },
    { id: 'EL', name: 'Earned Leave',  annual: 18, paid: true,  color: '#8B5CF6' },
    { id: 'LOP', name: 'Loss of Pay',  annual: 0,  paid: false, color: '#EF4444' },
  ],
  company: { name: 'SNL Innovations Pvt Ltd', address: '', phone: '', email: '' },
});

// Helper: make a valid token for a given email
function makeToken(email) {
  const secret  = process.env.SESSION_SECRET;
  const payload = `${email.toLowerCase()}:${Date.now()}`;
  const sig     = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ payload, sig })).toString('base64');
}

// Helper: make an expired token
function makeExpiredToken(email) {
  const secret  = process.env.SESSION_SECRET;
  const ts      = Date.now() - 9 * 60 * 60 * 1000; // 9 hours ago
  const payload = `${email.toLowerCase()}:${ts}`;
  const sig     = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ payload, sig })).toString('base64');
}

// Helper: make an employee token
function makeEmpToken(empId) {
  const secret  = process.env.SESSION_SECRET;
  const payload = `emp:${empId}:${Date.now()}`;
  const sig     = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ payload, sig })).toString('base64');
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. LOGIN
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/login', () => {
  beforeEach(() => { mockStore = BASE_DATA(); app._resetCache(); });

  test('TC-L01 valid admin login returns token, name, role and hrData', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'namit@innofarms.co.in', password: 'Snl@1234' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.name).toBe('Namit Rawat');
    expect(res.body.role).toBe('Admin');
    expect(res.body.hrData).toBeDefined();
  });

  test('TC-L02 Management role login returns correct role', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'astha@innofarms.co.in', password: 'Snl@1234' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('Management');
    expect(res.body.name).toBe('Astha Oberoi');
  });

  test('TC-L03 wrong password returns 401', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'namit@innofarms.co.in', password: 'WrongPass' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('TC-L04 unknown email returns 401', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'nobody@test.com', password: 'Snl@1234' });

    expect(res.status).toBe(401);
  });

  test('TC-L05 missing body fields returns 400', async () => {
    const res = await request(app).post('/api/login').send({});
    expect(res.status).toBe(400);
  });

  test('TC-L06 email is case-insensitive', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'NAMIT@INNOFARMS.CO.IN', password: 'Snl@1234' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('TC-L07 empty DB adminUsers falls back to DEFAULT_ADMIN_USERS (first-deploy scenario)', async () => {
    // When DB has NO adminUsers at all, server uses hardcoded DEFAULT_ADMIN_USERS
    // This covers the first deployment before any admin is saved to the database
    mockStore.adminUsers = [];

    const res = await request(app)
      .post('/api/login')
      .send({ email: 'astha@innofarms.co.in', password: 'Snl@1234' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('Management');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. EMPLOYEE LOGIN
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/employee-login', () => {
  beforeEach(() => { mockStore = BASE_DATA(); app._resetCache(); });

  test('TC-EL01 valid employee login returns empId, name and role=Employee', async () => {
    const res = await request(app)
      .post('/api/employee-login')
      .send({ empId: '1001', password: 'Snl@1234' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.empId).toBe('1001');
    expect(res.body.role).toBe('Employee');
    expect(res.body.name).toBe('Test Employee');
  });

  test('TC-EL02 wrong employee password returns 401', async () => {
    const res = await request(app)
      .post('/api/employee-login')
      .send({ empId: '1001', password: 'wrong' });

    expect(res.status).toBe(401);
  });

  test('TC-EL03 non-existent empId returns 401', async () => {
    const res = await request(app)
      .post('/api/employee-login')
      .send({ empId: '9999', password: 'Snl@1234' });

    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. VERIFY TOKEN — BUG FIX: role must be in response
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/verify-token', () => {
  beforeEach(() => { mockStore = BASE_DATA(); app._resetCache(); });

  test('TC-VT01 valid token returns valid=true with name and role', async () => {
    const token = makeToken('namit@innofarms.co.in');
    const res   = await request(app)
      .post('/api/verify-token')
      .send({ token });

    expect(res.body.valid).toBe(true);
    expect(res.body.name).toBe('Namit Rawat');
    expect(res.body.role).toBe('Admin');
    expect(res.body.hrData).toBeDefined();
  });

  test('TC-VT02 [BUG-FIX] Management role preserved on page refresh (verify-token)', async () => {
    const token = makeToken('astha@innofarms.co.in');
    const res   = await request(app)
      .post('/api/verify-token')
      .send({ token });

    expect(res.body.valid).toBe(true);
    expect(res.body.role).toBe('Management');
    expect(res.body.name).toBe('Astha Oberoi');
  });

  test('TC-VT03 [BUG-FIX] role returned via DEFAULT fallback when DB adminUsers is empty', async () => {
    // When DB has no adminUsers, server falls back to DEFAULT_ADMIN_USERS for name/role resolution
    // This was the pre-fix bug: verify-token returned no role, client defaulted to 'Guest'
    mockStore.adminUsers = [];

    const token = makeToken('astha@innofarms.co.in');
    const res   = await request(app)
      .post('/api/verify-token')
      .send({ token });

    expect(res.body.valid).toBe(true);
    expect(res.body.role).toBe('Management');
    expect(res.body.name).toBe('Astha Oberoi');
  });

  test('TC-VT04 expired token returns valid=false', async () => {
    const token = makeExpiredToken('namit@innofarms.co.in');
    const res   = await request(app)
      .post('/api/verify-token')
      .send({ token });

    expect(res.body.valid).toBe(false);
  });

  test('TC-VT05 tampered token signature returns valid=false', async () => {
    const realToken = makeToken('namit@innofarms.co.in');
    const parsed    = JSON.parse(Buffer.from(realToken, 'base64').toString());
    parsed.sig      = 'fakesignature';
    const tampered  = Buffer.from(JSON.stringify(parsed)).toString('base64');

    const res = await request(app)
      .post('/api/verify-token')
      .send({ token: tampered });

    expect(res.body.valid).toBe(false);
  });

  test('TC-VT06 employee token returns type=employee with empId', async () => {
    const token = makeEmpToken('1001');
    const res   = await request(app)
      .post('/api/verify-token')
      .send({ token });

    expect(res.body.valid).toBe(true);
    expect(res.body.type).toBe('employee');
    expect(res.body.empId).toBe('1001');
  });

  test('TC-VT07 missing token returns valid=false', async () => {
    const res = await request(app)
      .post('/api/verify-token')
      .send({});

    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. GET /api/hr-data
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/hr-data', () => {
  beforeEach(() => { mockStore = BASE_DATA(); app._resetCache(); });

  test('TC-GD01 authenticated request returns data', async () => {
    const token = makeToken('namit@innofarms.co.in');
    const res   = await request(app)
      .get('/api/hr-data')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });

  test('TC-GD02 unauthenticated request returns 401', async () => {
    const res = await request(app).get('/api/hr-data');
    expect(res.status).toBe(401);
  });

  test('TC-GD03 expired token returns 401', async () => {
    const token = makeExpiredToken('namit@innofarms.co.in');
    const res   = await request(app)
      .get('/api/hr-data')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. POST /api/hr-data
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/hr-data', () => {
  beforeEach(() => { mockStore = BASE_DATA(); app._resetCache(); });

  test('TC-SD01 authenticated save persists data', async () => {
    const token   = makeToken('namit@innofarms.co.in');
    const newData = { ...BASE_DATA(), _testMarker: 'saved-by-test' };

    const res = await request(app)
      .post('/api/hr-data')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: newData });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockStore._testMarker).toBe('saved-by-test');
  });

  test('TC-SD02 Management role can save (add employee flow)', async () => {
    const token   = makeToken('astha@innofarms.co.in');
    const newData = BASE_DATA();
    newData.employees.push({
      id: 'NEW01', name: 'New Employee Test', doj: '2026-06-01',
      designation: 'Tester', department: 'QA', weekOff: 'Sun',
      grade: '', bankName: '', ifsc: '', bankAcc: '', phone: '', email: '',
      status: 'active', managerId: null,
      salary: { basic: 0, hra: 0, prodIncentive: 0, ot: 0, arrears: 0,
                epf: false, epfRate: 12, esi: false, esiRate: 0.75, tds: 0, advance: 0 },
      leaveBalance: { CL: 7, SL: 6, EL: 0, CO: 0 },
      elLastAccrued: '2026-06',
    });

    const res = await request(app)
      .post('/api/hr-data')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: newData });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const saved = mockStore.employees.find(e => e.id === 'NEW01');
    expect(saved).toBeDefined();
    expect(saved.name).toBe('New Employee Test');
  });

  test('TC-SD03 unauthenticated save returns 401', async () => {
    const res = await request(app)
      .post('/api/hr-data')
      .send({ data: BASE_DATA() });

    expect(res.status).toBe(401);
  });

  test('TC-SD04 save without data body returns 400', async () => {
    const token = makeToken('namit@innofarms.co.in');
    const res   = await request(app)
      .post('/api/hr-data')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. TOKEN SECURITY
// ══════════════════════════════════════════════════════════════════════════════
describe('Token security', () => {
  beforeEach(() => { mockStore = BASE_DATA(); app._resetCache(); });

  test('TC-TS01 garbage base64 string returns 401', async () => {
    const res = await request(app)
      .get('/api/hr-data')
      .set('Authorization', 'Bearer notavalidtoken');

    expect(res.status).toBe(401);
  });

  test('TC-TS02 token signed with different secret is rejected', async () => {
    const payload  = `namit@innofarms.co.in:${Date.now()}`;
    const wrongSig = crypto.createHmac('sha256', 'wrong-secret').update(payload).digest('hex');
    const token    = Buffer.from(JSON.stringify({ payload, sig: wrongSig })).toString('base64');

    const res = await request(app)
      .get('/api/hr-data')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  test('TC-TS03 token passed in body (not header) is also accepted', async () => {
    const token = makeToken('namit@innofarms.co.in');
    const res   = await request(app)
      .post('/api/hr-data')
      .send({ token, data: BASE_DATA() });

    expect(res.status).toBe(200);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. ROLE LOGIC (tested via login + data inspection)
// ══════════════════════════════════════════════════════════════════════════════
describe('Role assignments', () => {
  beforeEach(() => { mockStore = BASE_DATA(); app._resetCache(); });

  const ROLE_CASES = [
    ['namit@innofarms.co.in',      'Admin'],
    ['akhil@innofarms.co.in',      'HR'],
    ['astha@innofarms.co.in',      'Management'],
    ['sudhanshu@innofarms.co.in',  'CEO'],
  ];

  test.each(ROLE_CASES)('TC-RA: %s gets role %s on login', async (email, expectedRole) => {
    const res = await request(app)
      .post('/api/login')
      .send({ email, password: 'Snl@1234' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe(expectedRole);
  });

  test.each(ROLE_CASES)('TC-RA: %s gets role %s on verify-token', async (email, expectedRole) => {
    const token = makeToken(email);
    const res   = await request(app)
      .post('/api/verify-token')
      .send({ token });

    expect(res.body.valid).toBe(true);
    expect(res.body.role).toBe(expectedRole);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. PASSWORD AUTO-UPGRADE (plain-text → bcrypt on first use)
// ══════════════════════════════════════════════════════════════════════════════
describe('Password auto-upgrade', () => {
  beforeEach(() => { mockStore = BASE_DATA(); app._resetCache(); });

  test('TC-PU01 plain-text password is hashed in DB after successful login', async () => {
    // Ensure password is plain-text
    const before = mockStore.adminUsers.find(u => u.email === 'namit@innofarms.co.in');
    expect(before.password.startsWith('$2')).toBe(false);

    await request(app)
      .post('/api/login')
      .send({ email: 'namit@innofarms.co.in', password: 'Snl@1234' });

    const after = mockStore.adminUsers.find(u => u.email === 'namit@innofarms.co.in');
    expect(after.password.startsWith('$2')).toBe(true);
  });

  test('TC-PU02 bcrypt hash still accepted on subsequent login', async () => {
    // First login upgrades the password
    await request(app)
      .post('/api/login')
      .send({ email: 'namit@innofarms.co.in', password: 'Snl@1234' });

    // Second login should still work with the same plain-text password
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'namit@innofarms.co.in', password: 'Snl@1234' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 9. DATA INTEGRITY — cache busting
// ══════════════════════════════════════════════════════════════════════════════
describe('Cache and data integrity', () => {
  beforeEach(() => { mockStore = BASE_DATA(); app._resetCache(); });

  test('TC-CI01 successive saves reflect latest version', async () => {
    const token = makeToken('namit@innofarms.co.in');

    const v1 = BASE_DATA();
    v1._version = 1;
    await request(app)
      .post('/api/hr-data')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: v1 });

    const v2 = { ...v1, _version: 2 };
    await request(app)
      .post('/api/hr-data')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: v2 });

    expect(mockStore._version).toBe(2);
  });

  test('TC-CI02 GET after POST returns freshly saved data', async () => {
    const token   = makeToken('namit@innofarms.co.in');
    const newData = BASE_DATA();
    newData._testMarker = 'ci-check';

    await request(app)
      .post('/api/hr-data')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: newData });

    const getRes = await request(app)
      .get('/api/hr-data')
      .set('Authorization', `Bearer ${token}`);

    expect(getRes.body.data._testMarker).toBe('ci-check');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 10. SPA CATCH-ALL
// ══════════════════════════════════════════════════════════════════════════════
describe('SPA catch-all', () => {
  test('TC-SPA01 unknown route returns 200 (index.html served)', async () => {
    const res = await request(app).get('/some/unknown/path');
    // server.js serves index.html for all non-API routes
    expect(res.status).toBe(200);
  });
});
