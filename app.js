/* ============================================================
   HR MANAGEMENT SYSTEM – app.js
   SNL Innovations Pvt Ltd
   Features: Employees · Attendance · Leaves · Salary · Payslip
   ============================================================ */
'use strict';

// ============================================================
// UTILITIES
// ============================================================
const U = {
  fmtINR(n) {
    if (n == null || n === '') return '—';
    return new Intl.NumberFormat('en-IN').format(Math.round(n));
  },
  fmtDate(s) {
    if (!s) return '—';
    const d = new Date(s);
    return isNaN(d) ? s : d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
  },
  fmtMonthYear(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]} ${y}`;
  },
  daysInMonth(y, m) { return new Date(y, m, 0).getDate(); },
  today() { return new Date().toISOString().split('T')[0]; },
  currentYM() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
  },
  numToWords(n) {
    if (!n) return 'Zero Only';
    const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven',
      'Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    function conv(x) {
      if (x < 20) return ones[x];
      if (x < 100) return tens[Math.floor(x/10)] + (x%10 ? ' '+ones[x%10] : '');
      if (x < 1000) return ones[Math.floor(x/100)]+' Hundred'+(x%100 ? ' '+conv(x%100) : '');
      if (x < 100000) return conv(Math.floor(x/1000))+' Thousand'+(x%1000 ? ' '+conv(x%1000) : '');
      if (x < 10000000) return conv(Math.floor(x/100000))+' Lakh'+(x%100000 ? ' '+conv(x%100000) : '');
      return conv(Math.floor(x/10000000))+' Crore'+(x%10000000 ? ' '+conv(x%10000000) : '');
    }
    return conv(Math.round(n)) + ' Only';
  },
  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); },
  escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
};

// ============================================================
// DATA STORE (localStorage)
// ============================================================
const Store = {
  KEY: 'hr_snl_v1',
  defaults() {
    return {
      company: { name: 'SNL Innovations Pvt Ltd', address: '', phone: '', email: '' },
      adminUsers: [
        { id: 'adm1', name: 'Namit Rawat', email: 'namit@innofarms.co.in', role: 'Admin' },
        { id: 'adm2', name: 'HR',          email: 'hr@innofarms.co.in',    role: 'HR' }
      ],
      employees: [{
        id: '1017', name: 'Namit Rawat', grade: 'L-5', weekOff: 'Sat,Sun',
        designation: "Founder's Office", department: 'Sales & Marketing',
        doj: '2024-05-20', bankName: 'BOB', ifsc: 'BARB0JAWJAI',
        bankAcc: '30120100013795', phone: '', email: '', status: 'active',
        salary: { basic: 18214, hra: 18214, prodIncentive: 1429, ot: 0, arrears: 0,
          epf: false, epfRate: 12, esi: false, esiRate: 0.75, tds: 0, advance: 0 },
        leaveBalance: { CL: 12, SL: 12, EL: 15, CO: 0 }
      }],
      attendance: [],
      leaves: [],
      payslips: [],
      holidays: [
        { date: '2026-01-26', name: 'Republic Day' },
        { date: '2026-03-25', name: 'Holi' },
        { date: '2026-08-15', name: 'Independence Day' },
        { date: '2026-10-02', name: 'Gandhi Jayanti' },
        { date: '2026-12-25', name: 'Christmas' },
      ],
      leaveTypes: [
        { id: 'CL',  name: 'Casual Leave',  annual: 12, paid: true,  color: '#3B82F6' },
        { id: 'SL',  name: 'Sick Leave',    annual: 12, paid: true,  color: '#10B981' },
        { id: 'EL',  name: 'Earned Leave',  annual: 15, paid: true,  color: '#8B5CF6' },
        { id: 'LOP', name: 'Loss of Pay',   annual: 0,  paid: false, color: '#EF4444' },
        { id: 'CO',  name: 'Comp Off',      annual: 0,  paid: true,  color: '#F59E0B' },
      ]
    };
  },
  load() {
    try {
      const s = localStorage.getItem(this.KEY);
      if (s) return { ...this.defaults(), ...JSON.parse(s) };
    } catch(e) {}
    return this.defaults();
  },
  save(d) {
    try { localStorage.setItem(this.KEY, JSON.stringify(d)); } catch(e) {}
  }
};

// ============================================================
// MAIN APP
// ============================================================
// ============================================================
// AUTH (OTP LOGIN)
// ============================================================
const Auth = {
  _email: null,
  _timerInterval: null,
  SESSION_KEY: 'hr_snl_token',

  async isLoggedIn() {
    const token = sessionStorage.getItem(this.SESSION_KEY);
    if (!token) return false;
    try {
      const res  = await fetch('/api/verify-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await res.json();
      return data.valid === true;
    } catch { return false; }
  },

  showLogin() {
    const data = Store.load();
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('login-company-name').textContent =
      data.company.name || 'SNL Innovations';

    const sel = document.getElementById('login-user-select');
    sel.innerHTML = '<option value="">— Choose your name —</option>';
    (data.adminUsers || []).forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.email || '';
      opt.textContent = `${u.name} (${u.role})`;
      sel.appendChild(opt);
    });
    sel.onchange = () => {
      if (sel.value) document.getElementById('login-email-input').value = sel.value;
    };
    this._showStep(1);
  },

  _showStep(n) {
    document.getElementById('login-step1').classList.toggle('active', n === 1);
    document.getElementById('login-step2').classList.toggle('active', n === 2);
  },

  backToStep1() {
    clearInterval(this._timerInterval);
    this._showStep(1);
  },

  async sendOTP() {
    const emailInput = document.getElementById('login-email-input');
    const email = (emailInput.value || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailInput.style.borderColor = 'var(--danger)';
      emailInput.placeholder = 'Enter a valid email address';
      return;
    }
    emailInput.style.borderColor = '';

    const btn = document.querySelector('#login-step1 .btn-primary');
    btn.disabled = true;
    btn.textContent = 'Sending…';

    try {
      const res  = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!data.success) {
        btn.disabled = false;
        btn.textContent = 'Send OTP via Email →';
        this._showError(data.error || 'Could not send OTP');
        return;
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Send OTP via Email →';
      this._showError('Network error — is the server running?');
      return;
    }

    btn.disabled = false;
    btn.textContent = 'Send OTP via Email →';

    this._email = email;
    const boxes = document.getElementById('otp-boxes');
    boxes.innerHTML = [0,1,2,3,4,5].map(i =>
      `<input class="otp-digit" id="otp-d${i}" maxlength="1" type="text" inputmode="numeric"
        oninput="Auth._otpInput(this,${i})" onkeydown="Auth._otpKey(event,${i})">`
    ).join('');

    document.getElementById('login-phone-display').textContent = email;
    this._showStep(2);
    this._startTimer(5 * 60);
    setTimeout(() => document.getElementById('otp-d0')?.focus(), 100);
  },

  _showError(msg) {
    let el = document.getElementById('login-error');
    if (!el) {
      el = document.createElement('div');
      el.id = 'login-error';
      el.style.cssText = 'color:var(--danger);font-size:12px;margin-top:8px;text-align:center';
      document.getElementById('login-step1').appendChild(el);
    }
    el.textContent = msg;
    setTimeout(() => { if (el) el.textContent = ''; }, 5000);
  },

  _otpInput(el, idx) {
    el.value = el.value.replace(/\D/g,'').slice(-1);
    el.style.borderColor = '';
    if (el.value && idx < 5) document.getElementById(`otp-d${idx+1}`)?.focus();
    if (idx === 5 && el.value) this.verifyOTP();
  },

  _otpKey(e, idx) {
    if (e.key === 'Backspace' && !e.target.value && idx > 0)
      document.getElementById(`otp-d${idx-1}`)?.focus();
    if (e.key === 'Enter') this.verifyOTP();
  },

  _startTimer(seconds) {
    clearInterval(this._timerInterval);
    let rem = seconds;
    const timerEl = document.getElementById('otp-timer');
    const update = () => {
      const m = Math.floor(rem/60), s = rem % 60;
      timerEl.innerHTML = rem > 0
        ? `OTP expires in <strong>${m}:${String(s).padStart(2,'0')}</strong>`
        : `<strong style="color:var(--danger)">OTP expired. Go back and request a new one.</strong>`;
      if (rem-- <= 0) clearInterval(this._timerInterval);
    };
    update();
    this._timerInterval = setInterval(update, 1000);
  },

  async verifyOTP() {
    const entered = [0,1,2,3,4,5].map(i =>
      document.getElementById(`otp-d${i}`)?.value || ''
    ).join('');
    if (entered.length < 6) return;

    const btn = document.querySelector('#login-step2 .btn-primary');
    btn.disabled = true;
    btn.textContent = 'Verifying…';

    try {
      const res  = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: this._email, otp: entered })
      });
      const data = await res.json();

      if (!data.success) {
        btn.disabled = false;
        btn.textContent = 'Verify & Login';
        [0,1,2,3,4,5].forEach(i => {
          const el = document.getElementById(`otp-d${i}`);
          if (el) { el.value = ''; el.style.borderColor = 'var(--danger)'; }
        });
        document.getElementById('otp-d0')?.focus();
        const rem = data.attemptsLeft != null ? ` (${data.attemptsLeft} attempts left)` : '';
        document.getElementById('otp-timer').innerHTML =
          `<span style="color:var(--danger)">${data.error}${rem}</span>`;
        return;
      }

      // Success
      clearInterval(this._timerInterval);
      sessionStorage.setItem(this.SESSION_KEY, data.token);

      const hrData = Store.load();
      const adminUser = (hrData.adminUsers || []).find(u =>
        (u.email||'').toLowerCase() === this._email.toLowerCase()
      );
      const userName = adminUser?.name || 'Admin';
      const userRole = adminUser?.role || 'HR';

      document.getElementById('login-screen').classList.add('hidden');
      HR._onLoginSuccess(userName, userRole);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Verify & Login';
      document.getElementById('otp-timer').innerHTML =
        `<span style="color:var(--danger)">Network error — try again</span>`;
    }
  },

  logout() {
    if (!confirm('Logout from HR System?')) return;
    sessionStorage.removeItem(this.SESSION_KEY);
    this._email = null;
    clearInterval(this._timerInterval);
    document.getElementById('btn-logout').style.display = 'none';
    document.getElementById('header-user-badge').style.display = 'none';
    this.showLogin();
  }
};

// ============================================================
// MAIN HR APP
// ============================================================
const HR = {
  data: null,
  page: 'dashboard',

  // ── INIT ──────────────────────────────────────────────────
  async init() {
    this.data = Store.load();
    const loggedIn = await Auth.isLoggedIn();
    if (!loggedIn) {
      Auth.showLogin();
      return;
    }
    // Re-resolve name/role from stored token phone
    const token = sessionStorage.getItem(Auth.SESSION_KEY);
    let userName = 'Admin', userRole = 'HR';
    if (token) {
      try {
        const { payload } = JSON.parse(atob(token));
        const email = payload.slice(0, payload.lastIndexOf(':'));
        const adminUser = (this.data.adminUsers || []).find(u =>
          (u.email||'').toLowerCase() === email.toLowerCase()
        );
        if (adminUser) { userName = adminUser.name; userRole = adminUser.role; }
      } catch {}
    }
    this._onLoginSuccess(userName, userRole);
  },

  _onLoginSuccess(userName, userRole) {
    this.data = Store.load();
    document.getElementById('sidebar-company').textContent =
      this.data.company.name.split(' ').slice(0,2).join(' ');
    document.getElementById('today-date').textContent =
      new Date().toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
    document.getElementById('header-user-name').textContent = `${userName} · ${userRole}`;
    document.getElementById('header-user-avatar').textContent = userName.charAt(0).toUpperCase();
    document.getElementById('header-user-badge').style.display = 'flex';
    document.getElementById('btn-logout').style.display = '';
    document.querySelectorAll('.nav-link').forEach(el =>
      el.addEventListener('click', e => { e.preventDefault(); HR.nav(el.dataset.page); })
    );
    document.getElementById('sidebar-toggle').addEventListener('click', () =>
      document.getElementById('sidebar').classList.toggle('collapsed')
    );
    document.getElementById('modal-close').addEventListener('click', () => HR.closeModal());
    document.getElementById('modal-backdrop').addEventListener('click', e => {
      if (e.target.id === 'modal-backdrop') HR.closeModal();
    });
    this.nav('dashboard');
  },

  save() { Store.save(this.data); },

  // ── NAVIGATION ────────────────────────────────────────────
  nav(page) {
    this.page = page;
    document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.page === page));
    const titles = { dashboard:'Dashboard', employees:'Employee Management', attendance:'Attendance',
      leaves:'Leave Management', salary:'Salary Configuration', payslip:'Payslip Generator', settings:'Settings' };
    document.getElementById('page-title').textContent = titles[page] || page;
    document.getElementById('content').innerHTML = this['render_' + page] ? this['render_' + page]() : '';
    this['init_' + page] && this['init_' + page]();
  },

  // ── MODAL ─────────────────────────────────────────────────
  openModal(title, html, size = 'md') {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-box').className = 'modal-box modal-' + size;
    document.getElementById('modal-backdrop').classList.add('open');
  },
  closeModal() {
    document.getElementById('modal-backdrop').classList.remove('open');
    document.getElementById('modal-body').innerHTML = '';
  },

  // ── TOAST ─────────────────────────────────────────────────
  toast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.className = 'toast toast-' + type;
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.style.display = 'none', 3000);
  },

  // ============================================================
  // DASHBOARD
  // ============================================================
  render_dashboard() {
    const today   = U.today();
    const curYm   = U.currentYM();
    const active  = this.data.employees.filter(e => e.status === 'active');
    const todayRecs = this.data.attendance.filter(a => a.date === today);
    const markedIds = new Set(todayRecs.map(a => a.empId));
    const present   = todayRecs.filter(a => ['P','HD'].includes(a.status)).length
                    + active.filter(e => !markedIds.has(e.id)).length; // unmarked = present
    const onLeave   = todayRecs.filter(a => a.status === 'L').length;
    const absent    = todayRecs.filter(a => a.status === 'A').length;
    const pending   = this.data.leaves.filter(l => l.status === 'pending').length;
    const recentLeaves = [...this.data.leaves].sort((a,b) => b.appliedOn > a.appliedOn ? 1 : -1).slice(0,5);

    return `
    <div class="stats-grid">
      <div class="stat-card stat-primary"><div class="stat-icon">👥</div><div class="stat-info"><div class="stat-value">${active.length}</div><div class="stat-label">Active Employees</div></div></div>
      <div class="stat-card stat-success"><div class="stat-icon">✅</div><div class="stat-info"><div class="stat-value">${present}</div><div class="stat-label">Present Today</div></div></div>
      <div class="stat-card stat-warning"><div class="stat-icon">🏖</div><div class="stat-info"><div class="stat-value">${onLeave}</div><div class="stat-label">On Leave Today</div></div></div>
      <div class="stat-card stat-danger"><div class="stat-icon">⏳</div><div class="stat-info"><div class="stat-value">${pending}</div><div class="stat-label">Pending Leave Approvals</div></div></div>
    </div>
    <div class="dashboard-grid">
      <div class="card">
        <div class="card-head">
          <h3>Today's Attendance — ${U.fmtDate(today)}</h3>
          <button class="btn btn-primary btn-sm" onclick="HR.nav('attendance')">Mark Attendance →</button>
        </div>
        <div class="card-body" style="padding:0">
          <table class="table">
            <thead><tr><th>Employee</th><th>Status</th><th>Leave Type</th><th>Notes</th></tr></thead>
            <tbody>${active.map(e => {
              const rec = todayRecs.find(a => a.empId === e.id);
              const st  = rec?.status || 'P';
              const lt  = rec?.leaveType ? this.data.leaveTypes.find(t => t.id === rec.leaveType)?.name || rec.leaveType : '—';
              const stLabel = {P:'Present',HD:'Half Day',L:'Leave',A:'Absent'};
              const stBadge = {P:'success',HD:'warning',L:'info',A:'danger'};
              return `<tr>
                <td><strong>${U.escHtml(e.name)}</strong><div class="text-muted text-sm">${e.id}</div></td>
                <td><span class="badge badge-${stBadge[st]||'success'}">${stLabel[st]||st}</span></td>
                <td>${st === 'L' ? lt : '—'}</td>
                <td class="text-muted text-sm">${U.escHtml(rec?.notes||'')}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Recent Leave Requests</h3>${pending > 0 ? `<span class="badge badge-warning">${pending} pending</span>` : ''}</div>
        <div class="card-body">
          ${recentLeaves.length === 0 ? '<p class="empty-msg">No leave records yet</p>' :
            recentLeaves.map(l => {
              const emp = this.data.employees.find(e => e.id === l.empId);
              const lt  = this.data.leaveTypes.find(t => t.id === l.type);
              return `<div class="leave-item">
                <div class="leave-emp">${U.escHtml(emp?.name||'?')}</div>
                <div class="leave-details">
                  <span class="badge badge-info">${lt?.name||l.type}</span>
                  <span>${l.days} day(s) • ${U.fmtDate(l.from)}</span>
                  <span class="badge badge-${l.status==='approved'?'success':l.status==='rejected'?'danger':'warning'}">${l.status}</span>
                </div>
              </div>`;
            }).join('')
          }
          <button class="btn btn-outline btn-sm mt-2" onclick="HR.nav('leaves')">Manage Leaves →</button>
        </div>
      </div>
    </div>
    <div class="card mt-3">
      <div class="card-head"><h3>Employee Overview</h3><button class="btn btn-primary btn-sm" onclick="HR.nav('employees')">Manage</button></div>
      <div class="card-body" style="padding:0">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Emp ID</th><th>Name</th><th>Designation</th><th>Department</th><th>Grade</th><th>DOJ</th><th>Status</th></tr></thead>
            <tbody>${this.data.employees.map(e=>`<tr>
              <td><strong>${e.id}</strong></td>
              <td>${U.escHtml(e.name)}</td>
              <td>${U.escHtml(e.designation)}</td>
              <td>${U.escHtml(e.department)}</td>
              <td><span class="badge badge-primary">${e.grade}</span></td>
              <td>${U.fmtDate(e.doj)}</td>
              <td><span class="badge badge-${e.status==='active'?'success':'gray'}">${e.status}</span></td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
    </div>`;
  },

  // ============================================================
  // EMPLOYEES
  // ============================================================
  render_employees() {
    return `
    <div class="toolbar">
      <div class="search-box">
        <svg class="search-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="form-control" id="emp-search" placeholder="Search employees…" oninput="HR.filterEmployees()">
      </div>
      <button class="btn btn-primary" onclick="HR.openEmpForm()">+ Add Employee</button>
    </div>
    <div class="card">
      <div class="card-body" style="padding:0">
        <div class="table-wrap">
          <table class="table" id="emp-table">
            <thead><tr><th>Emp ID</th><th>Name</th><th>Designation</th><th>Department</th><th>Grade</th><th>DOJ</th><th>Gross Salary</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody id="emp-tbody">${this.empRows(this.data.employees)}</tbody>
          </table>
        </div>
      </div>
    </div>`;
  },
  empRows(list) {
    if (!list.length) return `<tr><td colspan="9"><div class="empty-state"><p>No employees found</p></div></td></tr>`;
    return list.map(e => {
      const s = e.salary || {};
      const gross = (s.basic||0) + (s.hra||0) + (s.prodIncentive||0);
      return `<tr>
        <td><strong>${e.id}</strong></td>
        <td>${U.escHtml(e.name)}</td>
        <td>${U.escHtml(e.designation)}</td>
        <td>${U.escHtml(e.department)}</td>
        <td><span class="badge badge-primary">${e.grade}</span></td>
        <td>${U.fmtDate(e.doj)}</td>
        <td>₹${U.fmtINR(gross)}</td>
        <td><span class="badge badge-${e.status==='active'?'success':'gray'}">${e.status}</span></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="HR.openEmpForm('${e.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="HR.deleteEmp('${e.id}')">Delete</button>
        </td>
      </tr>`;
    }).join('');
  },
  filterEmployees() {
    const q = document.getElementById('emp-search').value.toLowerCase();
    const filtered = this.data.employees.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.id.toLowerCase().includes(q) ||
      e.designation.toLowerCase().includes(q) ||
      e.department.toLowerCase().includes(q)
    );
    document.getElementById('emp-tbody').innerHTML = this.empRows(filtered);
  },
  openEmpForm(id) {
    const emp = id ? this.data.employees.find(e => e.id === id) : null;
    const s = emp?.salary || { basic:0, hra:0, prodIncentive:0, ot:0, arrears:0, epf:false, epfRate:12, esi:false, esiRate:0.75, tds:0, advance:0 };
    const v = (k, fallback='') => U.escHtml(emp?.[k] ?? fallback);
    this.openModal(emp ? 'Edit Employee' : 'Add New Employee', `
    <form onsubmit="HR.saveEmp(event,'${id||''}')">
      <div class="form-grid">
        <div class="form-section">Personal & Employment Info</div>
        <div class="form-group"><label>Employee ID *</label><input class="form-control" name="id" value="${v('id')}" required ${emp?'readonly':''}></div>
        <div class="form-group"><label>Full Name *</label><input class="form-control" name="name" value="${v('name')}" required></div>
        <div class="form-group"><label>Designation *</label><input class="form-control" name="designation" value="${v('designation')}" required></div>
        <div class="form-group"><label>Department *</label><input class="form-control" name="department" value="${v('department')}" required></div>
        <div class="form-group"><label>Grade</label><input class="form-control" name="grade" value="${v('grade')}"></div>
        <div class="form-group"><label>Week Off</label><input class="form-control" name="weekOff" value="${v('weekOff','Sat,Sun')}" placeholder="e.g. Sat,Sun"></div>
        <div class="form-group"><label>Date of Joining</label><input class="form-control" type="date" name="doj" value="${v('doj')}"></div>
        <div class="form-group"><label>Status</label>
          <select class="form-control" name="status">
            <option value="active" ${emp?.status==='active'?'selected':''}>Active</option>
            <option value="inactive" ${emp?.status==='inactive'?'selected':''}>Inactive</option>
          </select>
        </div>
        <div class="form-group"><label>Phone</label><input class="form-control" name="phone" value="${v('phone')}"></div>
        <div class="form-group"><label>Email</label><input class="form-control" type="email" name="email" value="${v('email')}"></div>

        <div class="form-section">Bank Details</div>
        <div class="form-group"><label>Bank Name</label><input class="form-control" name="bankName" value="${v('bankName')}"></div>
        <div class="form-group"><label>IFSC Code</label><input class="form-control" name="ifsc" value="${v('ifsc')}"></div>
        <div class="form-group span-2"><label>Bank Account Number</label><input class="form-control" name="bankAcc" value="${v('bankAcc')}"></div>

        <div class="form-section">Salary Structure (Monthly)</div>
        <div class="form-group"><label>Basic Wage (₹)</label><input class="form-control" type="number" name="s_basic" value="${s.basic||0}" min="0"></div>
        <div class="form-group"><label>HRA (₹)</label><input class="form-control" type="number" name="s_hra" value="${s.hra||0}" min="0"></div>
        <div class="form-group"><label>Production Incentive (₹)</label><input class="form-control" type="number" name="s_prodIncentive" value="${s.prodIncentive||0}" min="0"></div>
        <div class="form-group"><label>Arrears (₹)</label><input class="form-control" type="number" name="s_arrears" value="${s.arrears||0}" min="0"></div>
        <div class="form-group"><label>OT Rate / hour (₹)</label><input class="form-control" type="number" name="s_ot" value="${s.ot||0}" min="0"></div>
        <div class="form-group"><label>TDS (₹/month)</label><input class="form-control" type="number" name="s_tds" value="${s.tds||0}" min="0"></div>
        <div class="form-group"><label>Advance (₹)</label><input class="form-control" type="number" name="s_advance" value="${s.advance||0}" min="0"></div>
        <div class="form-group"><label>EPF Applicable?</label>
          <select class="form-control" name="s_epf">
            <option value="0" ${!s.epf?'selected':''}>No</option>
            <option value="1" ${s.epf?'selected':''}>Yes (${s.epfRate||12}% of Basic)</option>
          </select>
        </div>
        <div class="form-group"><label>ESI Applicable?</label>
          <select class="form-control" name="s_esi">
            <option value="0" ${!s.esi?'selected':''}>No</option>
            <option value="1" ${s.esi?'selected':''}>Yes (${s.esiRate||0.75}% of Gross)</option>
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="HR.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${emp ? 'Update Employee' : 'Add Employee'}</button>
      </div>
    </form>`, 'lg');
  },
  saveEmp(e, existingId) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const get = k => fd.get(k) || '';
    const emp = {
      id: get('id').trim(), name: get('name').trim(), designation: get('designation').trim(),
      department: get('department').trim(), grade: get('grade').trim(), weekOff: get('weekOff').trim(),
      doj: get('doj'), status: get('status'), phone: get('phone').trim(), email: get('email').trim(),
      bankName: get('bankName').trim(), ifsc: get('ifsc').trim(), bankAcc: get('bankAcc').trim(),
      salary: {
        basic: +get('s_basic')||0, hra: +get('s_hra')||0, prodIncentive: +get('s_prodIncentive')||0,
        arrears: +get('s_arrears')||0, ot: +get('s_ot')||0, tds: +get('s_tds')||0, advance: +get('s_advance')||0,
        epf: get('s_epf')==='1', epfRate: 12, esi: get('s_esi')==='1', esiRate: 0.75
      },
      leaveBalance: existingId ? (this.data.employees.find(x=>x.id===existingId)?.leaveBalance || {CL:12,SL:12,EL:15}) : {CL:12,SL:12,EL:15}
    };
    if (!emp.id) return this.toast('Employee ID is required','error');
    if (existingId) {
      const idx = this.data.employees.findIndex(x => x.id === existingId);
      if (idx >= 0) this.data.employees[idx] = emp;
    } else {
      if (this.data.employees.find(x => x.id === emp.id)) return this.toast('Employee ID already exists','error');
      this.data.employees.push(emp);
    }
    this.save();
    this.closeModal();
    this.nav('employees');
    this.toast(existingId ? 'Employee updated' : 'Employee added');
  },
  deleteEmp(id) {
    if (!confirm('Delete this employee? This cannot be undone.')) return;
    this.data.employees = this.data.employees.filter(e => e.id !== id);
    this.save();
    this.nav('employees');
    this.toast('Employee deleted', 'info');
  },

  // ============================================================
  // ATTENDANCE  (Daily Exception Marking — HR/Admin)
  // ============================================================
  _attDate: null,
  _attHistYm: null,
  _attTab: 'mark',
  render_attendance() {
    return `
    <div class="tabs">
      <button class="tab-btn ${this._attTab==='mark'?'active':''}" onclick="HR.switchAttTab('mark')">📋 Mark Today</button>
      <button class="tab-btn ${this._attTab==='history'?'active':''}" onclick="HR.switchAttTab('history')">📅 Monthly Summary</button>
    </div>
    <div id="att-tab-content">${this._attTab==='mark' ? this.renderDailyMark() : this.renderAttHistory()}</div>`;
  },
  init_attendance() { setTimeout(() => HR.updateAttCounts(), 50); },

  switchAttTab(tab) {
    this._attTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.textContent.includes(tab === 'mark' ? 'Mark' : 'Monthly')));
    document.getElementById('att-tab-content').innerHTML = tab === 'mark' ? this.renderDailyMark() : this.renderAttHistory();
    if (tab === 'mark') setTimeout(() => HR.updateAttCounts(), 50);
  },

  renderDailyMark() {
    const today   = U.today();
    const date    = this._attDate || today;
    this._attDate = date;
    const activeEmps = this.data.employees.filter(e => e.status === 'active');
    const dayLabel   = new Date(date).toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    const isSunday   = new Date(date).getDay() === 0;
    const holiday    = this.data.holidays.find(h => h.date === date);
    // Existing records for this date
    const existing   = {};
    this.data.attendance.filter(a => a.date === date).forEach(a => existing[a.empId] = a);

    return `
    <div class="att-controls" style="margin-bottom:12px">
      <div class="form-group" style="margin:0">
        <label>Date</label>
        <input class="form-control" type="date" id="att-date-pick" value="${date}" max="${today}"
          onchange="HR._attDate=this.value;HR.switchAttTab('mark')">
      </div>
      <div style="flex:1"></div>
      ${!isSunday ? `<button class="btn btn-outline btn-sm" onclick="HR.markAllPresent()">✅ All Present</button>` : ''}
      <button class="btn btn-primary" onclick="HR.saveAttDay()">💾 Save Attendance</button>
    </div>

    ${isSunday ? `<div class="alert alert-warning" style="font-weight:600">
      🔵 Sunday — Weekly Off. Employees marked <strong>Present</strong> will earn +1 Comp Off leave.
    </div>` : ''}
    ${holiday ? `<div class="alert alert-info">🎉 Public Holiday: <strong>${U.escHtml(holiday.name)}</strong></div>` : ''}

    <div class="card">
      <div class="card-head">
        <h3>${dayLabel}</h3>
        <div style="display:flex;gap:8px">
          <span class="badge badge-success" id="cnt-p">—</span>
          <span class="badge badge-info"    id="cnt-l">—</span>
          <span class="badge badge-warning" id="cnt-hd">—</span>
          <span class="badge badge-danger"  id="cnt-a">—</span>
        </div>
      </div>
      <div class="card-body" style="padding:0">
        <div class="alert alert-info" style="margin:12px 16px 0;font-size:12px">
          ${isSunday
            ? 'Sunday — default is <strong>Week Off</strong>. Mark <strong>Present</strong> only if employee worked today (earns Comp Off).'
            : 'Default is <strong>Present</strong> for all weekdays. Only mark exceptions (Leave / Half Day / Absent).'}
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Leave Balance</th>
                <th style="width:165px">Status</th>
                <th style="width:145px">Leave Type</th>
                <th style="width:170px">Notes</th>
              </tr>
            </thead>
            <tbody>
              ${activeEmps.map(emp => {
                const rec  = existing[emp.id];
                const st   = rec?.status || (isSunday ? 'WO' : 'P');
                const lt   = rec?.leaveType || 'CL';
                const clBal = emp.leaveBalance?.CL ?? 0;
                const slBal = emp.leaveBalance?.SL ?? 0;
                const elBal = emp.leaveBalance?.EL ?? 0;
                const coBal = emp.leaveBalance?.CO ?? 0;
                return `<tr style="${st==='P' && isSunday ? 'background:#FFFBEB' : ''}">
                  <td>
                    <strong>${U.escHtml(emp.name)}</strong>
                    <div class="text-muted text-sm">${emp.id} · ${U.escHtml(emp.designation)}</div>
                  </td>
                  <td>
                    <span class="badge badge-${clBal>0?'success':'danger'}" title="Casual Leave">CL:${clBal}</span>&nbsp;
                    <span class="badge badge-${slBal>0?'success':'danger'}" title="Sick Leave">SL:${slBal}</span>&nbsp;
                    <span class="badge badge-${elBal>0?'success':'danger'}" title="Earned Leave">EL:${elBal}</span>&nbsp;
                    <span class="badge badge-warning" title="Comp Off">CO:${coBal}</span>
                  </td>
                  <td>
                    <select class="form-control" id="st-${emp.id}" style="font-size:12px;padding:5px 8px"
                      onchange="HR.onStatusChange('${emp.id}',this.value);HR.updateAttCounts()">
                      ${isSunday ? `
                      <option value="WO" ${st==='WO'?'selected':''}>🔵 Sunday Off</option>
                      <option value="P"  ${st==='P' ?'selected':''}>✅ Present (Comp-off)</option>
                      ` : `
                      <option value="P"  ${st==='P' ?'selected':''}>✅ Present</option>
                      <option value="L"  ${st==='L' ?'selected':''}>🏖 Leave</option>
                      <option value="HD" ${st==='HD'?'selected':''}>⏰ Half Day</option>
                      <option value="A"  ${st==='A' ?'selected':''}>❌ Absent / LOP</option>
                      `}
                    </select>
                  </td>
                  <td>
                    <select class="form-control" id="lt-${emp.id}" style="font-size:12px;padding:5px 8px;${st==='L'?'':'display:none'}"
                      onchange="HR.checkLOP('${emp.id}',this.value)">
                      ${this.data.leaveTypes.map(t=>`<option value="${t.id}" ${lt===t.id?'selected':''}>${t.name}${t.paid?'':' ⚠'}</option>`).join('')}
                    </select>
                    <span id="lop-${emp.id}" style="font-size:11px;color:var(--danger);font-weight:700;display:none">⚠ LOP — balance exhausted</span>
                  </td>
                  <td>
                    <input class="form-control" id="nt-${emp.id}" value="${U.escHtml(rec?.notes||'')}"
                      placeholder="Optional" style="font-size:12px">
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  },

  isWeekOff(emp, date) {
    const woDays = (emp.weekOff||'').split(',').map(s => s.trim().toLowerCase());
    const dayName = new Date(date).toLocaleDateString('en-IN', { weekday:'long' }).toLowerCase();
    return woDays.some(w => w && dayName.includes(w.slice(0,3)));
  },

  onStatusChange(empId, status) {
    const ltEl  = document.getElementById(`lt-${empId}`);
    const lopEl = document.getElementById(`lop-${empId}`);
    if (ltEl)  ltEl.style.display  = status === 'L' ? 'block' : 'none';
    if (lopEl) lopEl.style.display = 'none';
    if (status === 'L') this.checkLOP(empId, ltEl?.value || 'CL');
  },

  checkLOP(empId, typeId) {
    const emp  = this.data.employees.find(e => e.id === empId);
    const lt   = this.data.leaveTypes.find(t => t.id === typeId);
    const lopEl = document.getElementById(`lop-${empId}`);
    if (!lopEl) return;
    const isLOP = !lt?.paid || (lt.paid && (emp?.leaveBalance?.[typeId] || 0) <= 0);
    lopEl.style.display = isLOP ? 'inline' : 'none';
  },

  markAllPresent() {
    this.data.employees.filter(e => e.status === 'active').forEach(emp => {
      const sel = document.getElementById(`st-${emp.id}`);
      if (sel) { sel.value = 'P'; this.onStatusChange(emp.id, 'P'); }
    });
    this.updateAttCounts();
  },

  updateAttCounts() {
    let p = 0, l = 0, hd = 0, a = 0;
    this.data.employees.filter(e => e.status === 'active').forEach(emp => {
      const v = document.getElementById(`st-${emp.id}`)?.value || 'P';
      if (v === 'P') p++;
      else if (v === 'L') l++;
      else if (v === 'HD') hd++;
      else if (v === 'A') a++;
    });
    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    set('cnt-p',  `✅ ${p} Present`);
    set('cnt-l',  `🏖 ${l} On Leave`);
    set('cnt-hd', `⏰ ${hd} Half Day`);
    set('cnt-a',  `❌ ${a} Absent/LOP`);
  },

  saveAttDay() {
    const date = document.getElementById('att-date-pick')?.value || this._attDate || U.today();
    const activeEmps = this.data.employees.filter(e => e.status === 'active');

    // Remove all existing records for this date first
    this.data.attendance = this.data.attendance.filter(a => a.date !== date);

    activeEmps.forEach(emp => {
      const status    = document.getElementById(`st-${emp.id}`)?.value || 'P';
      const leaveType = document.getElementById(`lt-${emp.id}`)?.value || '';
      const notes     = document.getElementById(`nt-${emp.id}`)?.value || '';

      // Determine if this leave is LOP
      let isLOP = false;
      if (status === 'A') { isLOP = true; } // Absent without leave = LOP
      if (status === 'L' && leaveType) {
        const lt = this.data.leaveTypes.find(t => t.id === leaveType);
        if (!lt?.paid) isLOP = true;
        else if ((emp.leaveBalance?.[leaveType] || 0) <= 0) isLOP = true;
      }

      const isSundayOT = new Date(date).getDay() === 0 && status === 'P';
      this.data.attendance.push({
        empId: emp.id, date, status,
        leaveType: status === 'L' ? leaveType : '',
        notes, isLOP,
        isSundayOT,           // flagged for end-of-month resolution
        sundayOTResolved: isSundayOT ? null : undefined  // null = pending
      });
    });

    // Deduct leave balance for approved paid leaves (Sunday OT resolved separately at month-end)
    activeEmps.forEach(emp => {
      const rec = this.data.attendance.find(a => a.empId === emp.id && a.date === date);
      if (!emp.leaveBalance) emp.leaveBalance = {};
      if (rec?.status === 'L' && rec.leaveType && !rec.isLOP) {
        emp.leaveBalance[rec.leaveType] = Math.max(0, (emp.leaveBalance[rec.leaveType] || 0) - 1);
      }
    });

    this.save();
    this.updateAttCounts();
    this.toast(`Attendance saved for ${U.fmtDate(date)}`);
  },

  renderAttHistory() {
    const ym = this._attHistYm || U.currentYM();
    const activeEmps = this.data.employees.filter(e => e.status === 'active');

    const summaries = activeEmps.map(emp => {
      const recs = this.data.attendance.filter(a => a.empId === emp.id && a.date.startsWith(ym));
      const cnt = { P:0, HD:0, L:0, A:0, LOP:0 };
      recs.forEach(r => {
        if (r.isLOP) cnt.LOP++;
        else if (r.status === 'P') cnt.P++;
        else if (r.status === 'HD') cnt.HD++;
        else if (r.status === 'L') cnt.L++;
        else if (r.status === 'A') cnt.A++;
      });
      const wd = this.calcWorkingDays(emp, ym);
      const weekdayRecs = recs.filter(r => new Date(r.date).getDay() !== 0);
      const sundayWorked = recs.filter(r => new Date(r.date).getDay() === 0 && r.status === 'P').length;
      const unmarkedDays = Math.max(0, wd - weekdayRecs.length);
      const paidDays = (cnt.P + unmarkedDays) + cnt.HD * 0.5 + cnt.L; // Sunday work = comp-off, not extra pay
      return { emp, cnt, wd, paidDays, sundayWorked };
    });

    return `
    <div class="att-controls" style="margin-bottom:16px">
      <div class="form-group" style="margin:0">
        <label>Month</label>
        <input class="form-control" type="month" id="att-hist-ym" value="${ym}"
          onchange="HR._attHistYm=this.value;HR.switchAttTab('history')">
      </div>
      <button class="btn btn-outline" onclick="HR.exportAttCSV()">Export CSV</button>
    </div>
    <div class="card">
      <div class="card-head"><h3>Monthly Summary — ${U.fmtMonthYear(ym)}</h3></div>
      <div class="card-body" style="padding:0">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Employee</th><th>Working Days</th><th>Present</th><th>Half Day</th><th>Leave</th><th>LOP / Absent</th><th>Sunday Worked</th><th>Paid Days</th></tr></thead>
            <tbody>${summaries.map(s => `<tr>
              <td><strong>${U.escHtml(s.emp.name)}</strong><div class="text-muted text-sm">${s.emp.id}</div></td>
              <td>${s.wd}</td>
              <td><span class="badge badge-success">${s.cnt.P}</span></td>
              <td><span class="badge badge-warning">${s.cnt.HD}</span></td>
              <td><span class="badge badge-info">${s.cnt.L}</span></td>
              <td>${(s.cnt.LOP + s.cnt.A) > 0 ? `<span class="badge badge-danger">${s.cnt.LOP + s.cnt.A}</span>` : '—'}</td>
              <td>${s.sundayWorked > 0 ? `<span class="badge badge-warning">+${s.sundayWorked} CO</span>` : '—'}</td>
              <td><strong style="color:var(--primary)">${s.paidDays}</strong></td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
    </div>`;
  },

  calcWorkingDays(emp, ym) {
    // All days except Sundays are working days
    const [y, m] = ym.split('-').map(Number);
    const total = U.daysInMonth(y, m);
    let sundays = 0;
    for (let d = 1; d <= total; d++) {
      if (new Date(y, m - 1, d).getDay() === 0) sundays++;
    }
    return total - sundays;
  },

  exportAttCSV() {
    const ym = this._attHistYm || U.currentYM();
    const activeEmps = this.data.employees.filter(e => e.status === 'active');
    const [y, m]  = ym.split('-').map(Number);
    const days    = U.daysInMonth(y, m);
    const headers = ['ID','Employee', ...Array.from({length:days}, (_,i) => i+1), 'Present','Leave','HalfDay','LOP','PaidDays'];
    const rows    = [headers];
    activeEmps.forEach(emp => {
      const recMap = {};
      this.data.attendance.filter(a => a.empId === emp.id && a.date.startsWith(ym)).forEach(a => {
        recMap[a.date] = a.isLOP ? 'LOP' : a.status;
      });
      const dayCols = Array.from({length:days}, (_,i) => {
        const ds = `${y}-${String(m).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;
        return recMap[ds] || 'P';
      });
      const recs = this.data.attendance.filter(a => a.empId===emp.id && a.date.startsWith(ym));
      const cnt  = { P:0, L:0, HD:0, LOP:0 };
      recs.forEach(r => { if (r.isLOP) cnt.LOP++; else if (r.status==='P') cnt.P++; else if (r.status==='L') cnt.L++; else if (r.status==='HD') cnt.HD++; });
      const wd = this.calcWorkingDays(emp, ym);
      const weekdayRecs3 = recs.filter(r => new Date(r.date).getDay() !== 0);
      const unmarked = Math.max(0, wd - weekdayRecs3.length);
      rows.push([emp.id, emp.name, ...dayCols, cnt.P + unmarked, cnt.L, cnt.HD, cnt.LOP, (cnt.P+unmarked)+cnt.HD*0.5+cnt.L]);
    });
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `attendance_${ym}.csv`;
    a.click();
    this.toast('Exported');
  },

  // ============================================================
  // LEAVES
  // ============================================================
  _leaveTab: 'apply',
  render_leaves() {
    return `
    <div class="tabs">
      <button class="tab-btn ${this._leaveTab==='apply'?'active':''}" onclick="HR.switchLeaveTab('apply')">Record Leave</button>
      <button class="tab-btn ${this._leaveTab==='requests'?'active':''}" onclick="HR.switchLeaveTab('requests')">Leave Records</button>
      <button class="tab-btn ${this._leaveTab==='balance'?'active':''}" onclick="HR.switchLeaveTab('balance')">Leave Balance</button>
    </div>
    <div id="leave-tab-content">${this.renderLeaveTab(this._leaveTab)}</div>`;
  },
  init_leaves() {},
  switchLeaveTab(tab) {
    this._leaveTab = tab;
    const tabMap = { apply:'record', requests:'leave records', balance:'leave balance' };
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.textContent.toLowerCase().includes(tabMap[tab]||tab)));
    document.getElementById('leave-tab-content').innerHTML = this.renderLeaveTab(tab);
  },
  renderLeaveTab(tab) {
    if (tab === 'apply') return this.renderLeaveApply();
    if (tab === 'requests') return this.renderLeaveRequests();
    if (tab === 'balance') return this.renderLeaveBalance();
    return '';
  },
  renderLeaveApply() {
    const today = U.today();
    return `<div class="card">
      <div class="card-head">
        <h3>Record Leave Entry</h3>
        <span class="badge badge-info">Admin / Accounts</span>
      </div>
      <div class="card-body">
        <div class="alert alert-info" style="margin-bottom:14px">
          Record leave on behalf of an employee. Leave balance is automatically deducted upon saving.
        </div>
        <form onsubmit="HR.submitLeave(event)">
          <div class="form-grid">
            <div class="form-group">
              <label>Employee *</label>
              <select class="form-control" name="empId" required>
                ${this.data.employees.filter(e=>e.status==='active').map(e=>`<option value="${e.id}">${e.name} (${e.id})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Leave Type *</label>
              <select class="form-control" name="type" required>
                ${this.data.leaveTypes.map(t=>`<option value="${t.id}">${t.name}${t.paid ? '' : ' (Unpaid/LOP)'}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>From Date *</label>
              <input class="form-control" type="date" name="from" value="${today}" required>
            </div>
            <div class="form-group">
              <label>To Date *</label>
              <input class="form-control" type="date" name="to" value="${today}" required>
            </div>
            <div class="form-group">
              <label>Status</label>
              <select class="form-control" name="status">
                <option value="approved">Approved</option>
                <option value="pending">Pending / Under Review</option>
              </select>
            </div>
            <div class="form-group">
              <label>Recorded By</label>
              <input class="form-control" name="recordedBy" placeholder="e.g. HR / Accounts">
            </div>
            <div class="form-group span-2">
              <label>Reason / Notes</label>
              <textarea class="form-control" name="reason" rows="2" placeholder="Reason for leave or admin notes…"></textarea>
            </div>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Record Leave</button>
          </div>
        </form>
      </div>
    </div>`;
  },
  submitLeave(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const from = fd.get('from'), to = fd.get('to');
    if (to < from) return this.toast('To date must be after from date', 'error');

    const empId = fd.get('empId');
    const emp = this.data.employees.find(x => x.id === empId);

    // Count all calendar days in the range (all days are working days)
    const msPerDay = 86400000;
    const days = Math.round((new Date(to) - new Date(from)) / msPerDay) + 1;
    if (days <= 0) return this.toast('Invalid date range', 'error');

    const typeId    = fd.get('type');
    const status    = fd.get('status') || 'approved';
    const lt        = this.data.leaveTypes.find(t => t.id === typeId);

    // Check & deduct balance only if approved and paid leave
    if (status === 'approved' && lt?.paid) {
      const bal = emp?.leaveBalance?.[typeId] || 0;
      if (days > bal) return this.toast(`Insufficient balance for ${lt.name}. Available: ${bal} day(s)`, 'error');
      emp.leaveBalance[typeId] = Math.max(0, bal - days);
    }

    const leave = {
      id: U.uid(), empId, type: typeId, from, to, days,
      reason: fd.get('reason')||'',
      recordedBy: fd.get('recordedBy')||'Admin',
      status,
      appliedOn: U.today()
    };
    this.data.leaves.push(leave);
    this.save();
    e.target.reset();
    this.toast(`Leave recorded — ${days} day(s) ${status === 'approved' ? '& balance updated' : '(pending)'}`);
    this.switchLeaveTab('requests');
  },
  renderLeaveRequests() {
    const leaves = [...this.data.leaves].sort((a,b) => b.appliedOn > a.appliedOn ? 1 : -1);
    if (!leaves.length) return `<div class="empty-state"><p>No leave requests yet</p></div>`;
    return `
    <div class="card">
      <div class="card-body" style="padding:0">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Employee</th><th>Leave Type</th><th>From</th><th>To</th><th>Days</th><th>Reason / Notes</th><th>Recorded By</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>${leaves.map(l => {
              const emp = this.data.employees.find(e => e.id === l.empId);
              const lt  = this.data.leaveTypes.find(t => t.id === l.type);
              return `<tr>
                <td><strong>${U.escHtml(emp?.name||l.empId)}</strong><div class="text-muted text-sm">${l.empId}</div></td>
                <td><span class="badge badge-info">${lt?.name||l.type}</span>${lt&&!lt.paid?'<br><span class="text-sm" style="color:var(--danger)">Unpaid</span>':''}</td>
                <td>${U.fmtDate(l.from)}</td>
                <td>${U.fmtDate(l.to)}</td>
                <td><strong>${l.days}</strong></td>
                <td>${U.escHtml(l.reason||'—')}</td>
                <td><span class="badge badge-gray">${U.escHtml(l.recordedBy||'Admin')}</span></td>
                <td>${U.fmtDate(l.appliedOn)}</td>
                <td><span class="badge badge-${l.status==='approved'?'success':l.status==='rejected'?'danger':'warning'}">${l.status}</span></td>
                <td style="white-space:nowrap">
                  ${l.status==='pending'?`
                    <button class="btn btn-success btn-sm" onclick="HR.actionLeave('${l.id}','approved')">Approve</button>
                    <button class="btn btn-danger btn-sm" onclick="HR.actionLeave('${l.id}','rejected')">Reject</button>
                  `:`<button class="btn btn-outline btn-sm" onclick="HR.actionLeave('${l.id}','pending')">Revert</button>`}
                  <button class="btn btn-outline btn-sm" onclick="HR.deleteLeave('${l.id}')">Del</button>
                </td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>
      </div>
    </div>`;
  },
  actionLeave(id, newStatus) {
    const leave = this.data.leaves.find(l => l.id === id);
    if (!leave) return;
    const oldStatus = leave.status;
    leave.status = newStatus;

    const emp = this.data.employees.find(e => e.id === leave.empId);
    const lt  = this.data.leaveTypes.find(t => t.id === leave.type);

    // Deduct balance when approving a pending leave
    if (newStatus === 'approved' && oldStatus !== 'approved') {
      if (emp && lt?.paid && emp.leaveBalance[leave.type] != null) {
        emp.leaveBalance[leave.type] = Math.max(0, (emp.leaveBalance[leave.type]||0) - leave.days);
      }
    }
    // Restore balance when reverting an approved leave back to pending/rejected
    if (oldStatus === 'approved' && newStatus !== 'approved') {
      if (emp && lt?.paid && emp.leaveBalance[leave.type] != null) {
        emp.leaveBalance[leave.type] = (emp.leaveBalance[leave.type]||0) + leave.days;
      }
    }

    this.save();
    this.switchLeaveTab('requests');
    this.toast(`Leave status updated to: ${newStatus}`);
  },
  deleteLeave(id) {
    if (!confirm('Delete this leave record?')) return;
    this.data.leaves = this.data.leaves.filter(l => l.id !== id);
    this.save();
    this.switchLeaveTab('requests');
    this.toast('Deleted','info');
  },
  renderLeaveBalance() {
    return `
    <div class="card">
      <div class="card-head"><h3>Leave Balance — Current Year</h3></div>
      <div class="card-body" style="padding:0">
        <div class="table-wrap">
          <table class="table">
            <thead><tr>
              <th>Employee</th>
              ${this.data.leaveTypes.filter(t=>t.paid).map(t=>`<th>${t.name}</th>`).join('')}
              <th>Actions</th>
            </tr></thead>
            <tbody>${this.data.employees.filter(e=>e.status==='active').map(emp=>`<tr>
              <td><strong>${U.escHtml(emp.name)}</strong><br><span class="text-muted text-sm">${emp.id}</span></td>
              ${this.data.leaveTypes.filter(t=>t.paid).map(t=>{
                const bal = emp.leaveBalance?.[t.id]??0;
                return `<td><span class="badge badge-${bal>5?'success':bal>0?'warning':'danger'}">${bal} days</span></td>`;
              }).join('')}
              <td><button class="btn btn-outline btn-sm" onclick="HR.editLeaveBalance('${emp.id}')">Adjust</button></td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
    </div>`;
  },
  editLeaveBalance(empId) {
    const emp = this.data.employees.find(e => e.id === empId);
    if (!emp) return;
    const paidTypes = this.data.leaveTypes.filter(t => t.paid);
    this.openModal(`Adjust Leave Balance – ${emp.name}`, `
    <form onsubmit="HR.saveLeaveBalance(event,'${empId}')">
      <div class="form-grid">
        ${paidTypes.map(t=>`
          <div class="form-group">
            <label>${t.name} (${t.id})</label>
            <input class="form-control" type="number" name="${t.id}" value="${emp.leaveBalance?.[t.id]??0}" min="0" max="365">
          </div>`).join('')}
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="HR.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Balance</button>
      </div>
    </form>`, 'sm');
  },
  saveLeaveBalance(e, empId) {
    e.preventDefault();
    const emp = this.data.employees.find(x => x.id === empId);
    if (!emp) return;
    const fd = new FormData(e.target);
    if (!emp.leaveBalance) emp.leaveBalance = {};
    this.data.leaveTypes.filter(t=>t.paid).forEach(t => {
      emp.leaveBalance[t.id] = +fd.get(t.id)||0;
    });
    this.save(); this.closeModal();
    this.switchLeaveTab('balance');
    this.toast('Leave balance updated');
  },

  // ============================================================
  // SALARY CONFIGURATION
  // ============================================================
  render_salary() {
    return `
    <div class="toolbar">
      <h3 style="color:var(--gray-700)">Employee Salary Structures</h3>
      <button class="btn btn-outline" onclick="HR.nav('employees')">Manage Employees</button>
    </div>
    <div class="salary-grid">
      ${this.data.employees.map(emp => {
        const s = emp.salary||{};
        const gross = (s.basic||0)+(s.hra||0)+(s.prodIncentive||0);
        const epfAmt = s.epf ? Math.round((s.basic||0)*s.epfRate/100) : 0;
        const esiAmt = s.esi ? Math.round(gross*s.esiRate/100) : 0;
        const totalDed = epfAmt + esiAmt + (s.tds||0) + (s.advance||0);
        const net = gross - totalDed;
        return `<div class="salary-card">
          <div class="flex items-center justify-between mb-3">
            <div>
              <div class="salary-card-name">${U.escHtml(emp.name)}</div>
              <div class="salary-card-emp">${emp.id} · ${emp.designation}</div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="HR.openEmpForm('${emp.id}')">Edit</button>
          </div>
          <div class="salary-items">
            <div class="salary-row"><span class="label">Basic Wage</span><span class="value">₹${U.fmtINR(s.basic)}</span></div>
            <div class="salary-row"><span class="label">HRA</span><span class="value">₹${U.fmtINR(s.hra)}</span></div>
            <div class="salary-row"><span class="label">Production Incentive</span><span class="value">₹${U.fmtINR(s.prodIncentive)}</span></div>
            ${s.arrears?`<div class="salary-row"><span class="label">Arrears</span><span class="value">₹${U.fmtINR(s.arrears)}</span></div>`:''}
            <div class="salary-row salary-total"><span>Gross Earnings</span><span>₹${U.fmtINR(gross)}</span></div>
            <div style="height:1px;background:var(--gray-100);margin:4px 0"></div>
            ${epfAmt?`<div class="salary-row"><span class="label">EPF (${s.epfRate}%)</span><span class="value" style="color:var(--danger)">-₹${U.fmtINR(epfAmt)}</span></div>`:''}
            ${esiAmt?`<div class="salary-row"><span class="label">ESI (${s.esiRate}%)</span><span class="value" style="color:var(--danger)">-₹${U.fmtINR(esiAmt)}</span></div>`:''}
            ${s.tds?`<div class="salary-row"><span class="label">TDS</span><span class="value" style="color:var(--danger)">-₹${U.fmtINR(s.tds)}</span></div>`:''}
            ${s.advance?`<div class="salary-row"><span class="label">Advance</span><span class="value" style="color:var(--danger)">-₹${U.fmtINR(s.advance)}</span></div>`:''}
            <div class="salary-row salary-total" style="color:var(--primary)"><span>Net Salary</span><span>₹${U.fmtINR(net)}</span></div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  },

  // ============================================================
  // PAYSLIP GENERATOR
  // ============================================================
  _psState: { empId: null, ym: null },
  render_payslip() {
    const ym    = this._psState.ym || U.currentYM();
    const empId = this._psState.empId || (this.data.employees[0]?.id||'');
    this._psState = { empId, ym };

    const history = [...this.data.payslips]
      .sort((a,b) => b.generatedOn > a.generatedOn ? 1 : -1)
      .slice(0, 10);

    return `
    <div class="payslip-controls">
      <div class="form-group" style="margin:0">
        <label>Employee</label>
        <select class="form-control" id="ps-emp" onchange="HR._psState.empId=this.value">
          ${this.data.employees.map(e=>`<option value="${e.id}" ${e.id===empId?'selected':''}>${e.name} (${e.id})</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="margin:0">
        <label>Month</label>
        <input class="form-control" type="month" id="ps-month" value="${ym}" onchange="HR._psState.ym=this.value;document.getElementById('sunday-ot-section').innerHTML=HR.renderSundayOTSection(this.value)">
      </div>
      <button class="btn btn-primary" onclick="HR.generatePayslip()">⚡ Generate Payslip</button>
      <button class="btn btn-outline" onclick="HR.generateAllPayslips()">Generate All Employees</button>
      <button class="btn btn-success" onclick="HR.sendAllWhatsApp(document.getElementById('ps-month')?.value||HR._psState.ym)">📱 Send All via WhatsApp</button>
    </div>
    <div id="sunday-ot-section">${this.renderSundayOTSection(ym)}</div>
    <div id="ps-preview"></div>
    <div class="card ps-history">
      <div class="card-head"><h3>Payslip History</h3></div>
      <div class="card-body" style="padding:0">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Employee</th><th>Month</th><th>Paid Days</th><th>Net Salary</th><th>Generated</th><th>Actions</th></tr></thead>
            <tbody>${history.length === 0 ? `<tr><td colspan="6"><div class="empty-state"><p>No payslips generated yet</p></div></td></tr>` :
              history.map(ps => {
                const emp = this.data.employees.find(e => e.id === ps.empId);
                return `<tr>
                  <td><strong>${U.escHtml(emp?.name||ps.empId)}</strong></td>
                  <td>${U.fmtMonthYear(ps.ym)}</td>
                  <td>${ps.paidDays}</td>
                  <td><strong>₹${U.fmtINR(ps.net)}</strong></td>
                  <td>${U.fmtDate(ps.generatedOn)}</td>
                  <td>
                    <button class="btn btn-outline btn-sm" onclick="HR.previewPayslip('${ps.id}')">View</button>
                    <button class="btn btn-primary btn-sm" onclick="HR.printPayslipById('${ps.id}')">Print</button>
                    <button class="btn btn-outline btn-sm" onclick="HR.downloadPayslipPDF('${ps.id}')">⬇ PDF</button>
                    <button class="btn btn-success btn-sm" onclick="HR.sendWhatsApp('${ps.id}')">📱 WA</button>
                    <button class="btn btn-danger btn-sm" onclick="HR.deletePayslip('${ps.id}')">Del</button>
                  </td>
                </tr>`;
              }).join('')
            }</tbody>
          </table>
        </div>
      </div>
    </div>`;
  },
  init_payslip() {},
  generatePayslip() {
    const empId = document.getElementById('ps-emp')?.value || this._psState.empId;
    const ym    = document.getElementById('ps-month')?.value || this._psState.ym;
    if (!empId || !ym) return this.toast('Select employee and month', 'error');

    const emp = this.data.employees.find(e => e.id === empId);
    if (!emp) return this.toast('Employee not found', 'error');

    const s = emp.salary || {};
    const totalWorkingDays = this.calcWorkingDays(emp, ym);

    // Read daily attendance records for this employee this month
    const recs = this.data.attendance.filter(a => a.empId === empId && a.date.startsWith(ym));

    // Count statuses
    let cntP = 0, cntHD = 0, cntL = 0, cntLOP = 0;
    recs.forEach(r => {
      if (r.isLOP || r.status === 'A') cntLOP++;
      else if (r.status === 'P') cntP++;
      else if (r.status === 'HD') cntHD++;
      else if (r.status === 'L') cntL++;
    });

    // Only weekday records count toward unmarked calculation (Sundays are off by default)
    const weekdayRecs = recs.filter(r => new Date(r.date).getDay() !== 0);
    const unmarkedPresentDays = Math.max(0, totalWorkingDays - weekdayRecs.length);
    const effectivePresent    = cntP + unmarkedPresentDays;
    const paidDays   = effectivePresent + cntHD * 0.5 + cntL;
    const leavesAvailed = cntL;
    const lopDays    = cntLOP; // Absent/LOP records

    // Leave balance as of now
    const leaveBalance = (emp.leaveBalance?.CL || 0) + (emp.leaveBalance?.SL || 0) + (emp.leaveBalance?.EL || 0);

    // Salary: proportional deduction only for LOP days
    const payRatio    = totalWorkingDays > 0 ? Math.min(1, paidDays / totalWorkingDays) : 1;
    const basicEarned = lopDays > 0 ? Math.round((s.basic||0) * payRatio) : (s.basic||0);
    const hraEarned   = lopDays > 0 ? Math.round((s.hra||0)   * payRatio) : (s.hra||0);

    // Sunday OT encashment for this month
    const sundayOTDays = emp.pendingSundayOTEncash?.[ym] || 0;
    const dailyRate    = totalWorkingDays > 0 ? Math.round(((s.basic||0) + (s.hra||0)) / totalWorkingDays) : 0;
    const sundayOTAmt  = dailyRate * sundayOTDays;

    const earnings = {
      basic:         basicEarned,
      hra:           hraEarned,
      ot:            (s.ot || 0) + sundayOTAmt,   // merge Sunday OT encashment into OT line
      arrears:       s.arrears || 0,
      prodIncentive: s.prodIncentive || 0
    };
    const totalEarnings = earnings.basic + earnings.hra + earnings.ot + earnings.arrears + earnings.prodIncentive;

    const epfAmt = s.epf ? Math.round(basicEarned * (s.epfRate||12) / 100) : 0;
    const esiAmt = s.esi ? Math.round(totalEarnings * (s.esiRate||0.75) / 100) : 0;
    const deductions = { epf: epfAmt, esi: esiAmt, tds: s.tds||0, advance: s.advance||0 };
    const totalDed   = deductions.epf + deductions.esi + deductions.tds + deductions.advance;
    const net        = totalEarnings - totalDed;

    // Clear the pending encashment after including in payslip
    if (sundayOTDays > 0 && emp.pendingSundayOTEncash) {
      delete emp.pendingSundayOTEncash[ym];
    }

    const ps = {
      id: U.uid(), empId, ym,
      totalWorkingDays, paidDays, leavesAvailed, leaveBalance, lopDays,
      sundayOTDays, sundayOTAmt,
      earnings, deductions, totalEarnings, totalDeductions: totalDed, net,
      generatedOn: U.today()
    };

    this.data.payslips = this.data.payslips.filter(p => !(p.empId===empId && p.ym===ym));
    this.data.payslips.push(ps);
    this.save();

    this.showPayslipPreview(ps);
    this.toast('Payslip generated successfully!');
  },
  showPayslipPreview(ps) {
    const emp  = this.data.employees.find(e => e.id === ps.empId);
    const html = this.buildPayslipHTML(ps, emp);
    const hasPhone = !!(emp?.phone||'').replace(/\D/g,'').length;
    document.getElementById('ps-preview').innerHTML = `
    <div class="card" style="margin-bottom:20px">
      <div class="card-head">
        <h3>Payslip Preview — ${U.fmtMonthYear(ps.ym)}</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${ps.lopDays > 0 ? `<span class="badge badge-danger">LOP: ${ps.lopDays} day(s)</span>` : ''}
          <button class="btn btn-primary" onclick="HR.printPayslipById('${ps.id}')">🖨 Print</button>
          <button class="btn btn-outline" onclick="HR.downloadPayslipPDF('${ps.id}')">⬇ Download PDF</button>
          <button class="btn btn-success" onclick="HR.sendWhatsApp('${ps.id}')" ${hasPhone?'':'title="Add phone number to employee profile"'}>
            📱 WhatsApp
          </button>
          <button class="btn btn-outline" onclick="document.getElementById('ps-preview').innerHTML=''">✕ Close</button>
        </div>
      </div>
      <div class="card-body">${html}</div>
    </div>`;
  },
  previewPayslip(id) {
    const ps  = this.data.payslips.find(p => p.id === id);
    const emp = ps ? this.data.employees.find(e => e.id === ps.empId) : null;
    if (!ps) return this.toast('Payslip not found','error');
    document.getElementById('ps-preview').innerHTML = '';
    this.showPayslipPreview(ps);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  printPayslipById(id) {
    const ps  = this.data.payslips.find(p => p.id === id);
    const emp = ps ? this.data.employees.find(e => e.id === ps.empId) : null;
    if (!ps) return this.toast('Payslip not found','error');
    const printArea = document.getElementById('print-area');
    printArea.innerHTML = this.buildPayslipHTML(ps, emp);
    printArea.style.display = 'block';
    window.print();
    printArea.style.display = 'none';
  },
  deletePayslip(id) {
    if (!confirm('Delete this payslip?')) return;
    this.data.payslips = this.data.payslips.filter(p => p.id !== id);
    this.save(); this.nav('payslip');
    this.toast('Payslip deleted','info');
  },

  generateAllPayslips() {
    const ym = document.getElementById('ps-month')?.value || this._psState.ym || U.currentYM();
    const active = this.data.employees.filter(e => e.status === 'active');
    let count = 0;
    active.forEach(emp => {
      this._psState = { empId: emp.id, ym };
      // Temporarily set values so generatePayslip reads them correctly
      const origEmpSel = document.getElementById('ps-emp');
      const origMonSel = document.getElementById('ps-month');
      if (origEmpSel) origEmpSel.value = emp.id;
      // Call the calculation directly
      const s = emp.salary || {};
      const totalWorkingDays = this.calcWorkingDays(emp, ym);
      const recs = this.data.attendance.filter(a => a.empId === emp.id && a.date.startsWith(ym));
      let cntP = 0, cntHD = 0, cntL = 0, cntLOP = 0;
      recs.forEach(r => { if (r.isLOP||r.status==='A') cntLOP++; else if(r.status==='P') cntP++; else if(r.status==='HD') cntHD++; else if(r.status==='L') cntL++; });
      const weekdayRecs2 = recs.filter(r => new Date(r.date).getDay() !== 0);
      const unmarked = Math.max(0, totalWorkingDays - weekdayRecs2.length);
      const paidDays = (cntP+unmarked) + cntHD*0.5 + cntL;
      const lopDays  = cntLOP;
      const leaveBalance = (emp.leaveBalance?.CL||0)+(emp.leaveBalance?.SL||0)+(emp.leaveBalance?.EL||0);
      const payRatio = totalWorkingDays > 0 ? Math.min(1, paidDays/totalWorkingDays) : 1;
      const basicEarned = lopDays > 0 ? Math.round((s.basic||0)*payRatio) : (s.basic||0);
      const hraEarned   = lopDays > 0 ? Math.round((s.hra||0)*payRatio)   : (s.hra||0);
      const sundayOTDays2 = emp.pendingSundayOTEncash?.[ym] || 0;
      const dailyRate2    = totalWorkingDays > 0 ? Math.round(((s.basic||0)+(s.hra||0))/totalWorkingDays) : 0;
      const sundayOTAmt2  = dailyRate2 * sundayOTDays2;
      if (sundayOTDays2 > 0 && emp.pendingSundayOTEncash) delete emp.pendingSundayOTEncash[ym];
      const earnings = { basic: basicEarned, hra: hraEarned, ot:(s.ot||0)+sundayOTAmt2, arrears: s.arrears||0, prodIncentive: s.prodIncentive||0 };
      const totalEarnings = Object.values(earnings).reduce((a,b)=>a+b,0);
      const epfAmt = s.epf ? Math.round(basicEarned*(s.epfRate||12)/100) : 0;
      const esiAmt = s.esi ? Math.round(totalEarnings*(s.esiRate||0.75)/100) : 0;
      const deductions = { epf:epfAmt, esi:esiAmt, tds:s.tds||0, advance:s.advance||0 };
      const totalDed   = Object.values(deductions).reduce((a,b)=>a+b,0);
      const ps = { id:U.uid(), empId:emp.id, ym, totalWorkingDays, paidDays, leavesAvailed:cntL,
        leaveBalance, lopDays, earnings, deductions, totalEarnings, totalDeductions:totalDed,
        net: totalEarnings-totalDed, generatedOn: U.today() };
      this.data.payslips = this.data.payslips.filter(p=>!(p.empId===emp.id&&p.ym===ym));
      this.data.payslips.push(ps);
      count++;
    });
    this.save();
    this.nav('payslip');
    this.toast(`Payslips generated for ${count} employee(s) — ${U.fmtMonthYear(ym)}`);
  },

  // ── WHATSAPP ─────────────────────────────────────────────
  buildWhatsAppMsg(ps, emp) {
    const co  = this.data.company;
    const e   = ps.earnings, d = ps.deductions;
    const lines = [
      `*${co.name}*`,
      `*Pay Slip — ${U.fmtMonthYear(ps.ym)}*`,
      ``,
      `Employee : ${emp?.name}`,
      `ID       : ${emp?.id}  |  ${emp?.department}`,
      ``,
      `Working Days : ${ps.totalWorkingDays}  |  Paid Days : ${ps.paidDays}`,
      `Leaves       : ${ps.leavesAvailed}  |  Leave Bal : ${ps.leaveBalance}`,
      ps.lopDays > 0 ? `⚠ LOP (Loss of Pay) : ${ps.lopDays} day(s)` : null,
      ``,
      `*EARNINGS*`,
      `Basic Wage          : ₹${U.fmtINR(e.basic)}`,
      `HRA                 : ₹${U.fmtINR(e.hra)}`,
      e.prodIncentive ? `Production Incentive: ₹${U.fmtINR(e.prodIncentive)}` : null,
      e.ot     ? `OT                  : ₹${U.fmtINR(e.ot)}`     : null,
      e.arrears? `Arrears             : ₹${U.fmtINR(e.arrears)}` : null,
      `Total Earnings      : ₹${U.fmtINR(ps.totalEarnings)}`,
      ``,
      `*DEDUCTIONS*`,
      d.epf     ? `EPF     : ₹${U.fmtINR(d.epf)}`     : null,
      d.esi     ? `ESI     : ₹${U.fmtINR(d.esi)}`     : null,
      d.tds     ? `TDS     : ₹${U.fmtINR(d.tds)}`     : null,
      d.advance ? `Advance : ₹${U.fmtINR(d.advance)}` : null,
      `Total Deductions: ₹${U.fmtINR(ps.totalDeductions)}`,
      ``,
      `*NET SALARY : ₹${U.fmtINR(ps.net)}*`,
      `_(${U.numToWords(ps.net)})_`,
      ``,
      `For any queries, contact HR.`,
    ];
    return lines.filter(l => l !== null).join('\n');
  },

  // ── PDF GENERATION ───────────────────────────────────────
  async generatePDF(psId) {
    const ps  = this.data.payslips.find(p => p.id === psId);
    const emp = ps ? this.data.employees.find(e => e.id === ps.empId) : null;
    if (!ps || !emp) { this.toast('Payslip not found','error'); return null; }

    // Render payslip HTML into a temporary offscreen container
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#fff;padding:24px;font-family:Arial,sans-serif;z-index:-1';
    container.innerHTML = this.buildPayslipHTML(ps, emp);
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW  = pageW - 20; // 10mm margin each side
      const imgH  = (canvas.height * imgW) / canvas.width;
      const topY  = imgH > (pageH - 20) ? 10 : (pageH - imgH) / 2;
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, topY, imgW, Math.min(imgH, pageH - 20));
      return pdf;
    } finally {
      document.body.removeChild(container);
    }
  },

  async downloadPayslipPDF(psId) {
    this.toast('Generating PDF…','info');
    try {
      const ps  = this.data.payslips.find(p => p.id === psId);
      const emp = ps ? this.data.employees.find(e => e.id === ps.empId) : null;
      const pdf = await this.generatePDF(psId);
      if (!pdf) return;
      const fname = `Payslip_${(emp?.name||ps.empId).replace(/\s+/g,'_')}_${ps.ym}.pdf`;
      pdf.save(fname);
      this.toast('PDF downloaded!','success');
    } catch(err) {
      console.error(err);
      this.toast('PDF generation failed: ' + err.message,'error');
    }
  },

  async sendWhatsApp(psId) {
    const ps  = this.data.payslips.find(p => p.id === psId);
    const emp = ps ? this.data.employees.find(e => e.id === ps.empId) : null;
    if (!ps || !emp) return this.toast('Payslip not found','error');
    let phone = (emp.phone||'').replace(/\D/g,'');
    if (!phone || phone.length < 10) {
      return this.toast(`No valid phone number for ${emp.name}. Add it in Employees → Edit.`,'error');
    }
    if (phone.length === 10) phone = '91' + phone;

    this.toast('Generating PDF…','info');
    try {
      const pdf = await this.generatePDF(psId);
      if (!pdf) return;
      const fname = `Payslip_${emp.name.replace(/\s+/g,'_')}_${ps.ym}.pdf`;
      pdf.save(fname);

      // Brief pause so the download starts before WhatsApp tab opens
      await new Promise(r => setTimeout(r, 600));

      this.openModal(`📱 Send Payslip to ${U.escHtml(emp.name)}`, `
        <div class="alert alert-info" style="margin-bottom:12px">
          <strong>Step 1:</strong> The PDF <code>${fname}</code> has been downloaded to your device.<br>
          <strong>Step 2:</strong> Click <strong>Open WhatsApp</strong> below.<br>
          <strong>Step 3:</strong> In WhatsApp, tap the <strong>attachment (📎)</strong> icon and attach the downloaded PDF.
        </div>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:8px">
          <a class="btn btn-whatsapp" href="https://wa.me/${phone}" target="_blank" rel="noopener">
            📱 Open WhatsApp Chat
          </a>
          <button class="btn btn-outline" onclick="HR.downloadPayslipPDF('${psId}')">⬇ Re-download PDF</button>
        </div>
        <div style="margin-top:12px;font-size:12px;color:var(--gray-400);text-align:center">
          WhatsApp Web: use the paperclip icon → Document to attach the PDF.
        </div>
      `, 'sm');
    } catch(err) {
      console.error(err);
      this.toast('PDF generation failed: ' + err.message,'error');
    }
  },

  sendAllWhatsApp(ym) {
    ym = ym || U.currentYM();
    const payslips = this.data.payslips.filter(p => p.ym === ym);
    if (!payslips.length) {
      return this.toast(`No payslips for ${U.fmtMonthYear(ym)}. Generate them first.`,'error');
    }
    const rows = payslips.map(ps => {
      const emp   = this.data.employees.find(e => e.id === ps.empId);
      const phone = (emp?.phone||'').replace(/\D/g,'');
      return { ps, emp, phone, ok: phone.length >= 10 };
    });
    this.openModal(`📱 Send Payslips via WhatsApp — ${U.fmtMonthYear(ym)}`, `
    <div class="alert alert-info">
      Click <strong>📥 PDF + Send</strong> next to each employee. The PDF will be downloaded,
      then WhatsApp will open — attach the PDF using the 📎 icon.
    </div>
    <table class="table">
      <thead><tr><th>Employee</th><th>Net Salary</th><th>LOP</th><th>Phone</th><th>Action</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td><strong>${U.escHtml(r.emp?.name||r.ps.empId)}</strong><div class="text-muted text-sm">${r.ps.empId}</div></td>
        <td><strong>₹${U.fmtINR(r.ps.net)}</strong></td>
        <td>${r.ps.lopDays > 0 ? `<span class="badge badge-danger">${r.ps.lopDays}d LOP</span>` : '—'}</td>
        <td>${r.ok ? `<span class="badge badge-success">+${r.phone}</span>` : '<span class="badge badge-danger">No phone</span>'}</td>
        <td style="display:flex;gap:4px;flex-wrap:wrap">
          ${r.ok
            ? `<button class="btn btn-success btn-sm" onclick="HR.closeModal();HR.sendWhatsApp('${r.ps.id}')">📥 PDF + Send</button>`
            : `<button class="btn btn-outline btn-sm" onclick="HR.closeModal();HR.openEmpForm('${r.ps.empId}')">Add Phone</button>`}
          <button class="btn btn-outline btn-sm" onclick="HR.downloadPayslipPDF('${r.ps.id}')">⬇ PDF</button>
        </td>
      </tr>`).join('')}</tbody>
    </table>
    <div style="margin-top:12px;font-size:12px;color:var(--gray-400)">
      Tip: Add each employee's WhatsApp number (10 digits, India) in their profile to enable sending.
    </div>`, 'md');
  },

  // Build payslip HTML matching the PDF format
  buildPayslipHTML(ps, emp) {
    const s = emp?.salary || {};
    const company = this.data.company;
    const e = ps.earnings;
    const d = ps.deductions;

    return `<div class="payslip-sheet">
    <table class="ps-table">
      <tr><td colspan="4" class="ps-company">${U.escHtml(company.name)}</td></tr>
      <tr><td colspan="4" class="ps-month">Pay Slip for ${U.fmtMonthYear(ps.ym)}</td></tr>
      <tr>
        <td class="ps-label">Name</td><td class="ps-value">${U.escHtml(emp?.name||'')}</td>
        <td class="ps-label">Grade</td><td class="ps-value">${U.escHtml(emp?.grade||'')}</td>
      </tr>
      <tr>
        <td class="ps-label">Employee ID</td><td class="ps-value">${U.escHtml(emp?.id||'')}</td>
        <td class="ps-label">Week Off</td><td class="ps-value">${U.escHtml(emp?.weekOff||'')}</td>
      </tr>
      <tr>
        <td class="ps-label">Designation</td><td class="ps-value">${U.escHtml(emp?.designation||'')}</td>
        <td class="ps-label">Bank Name</td><td class="ps-value">${U.escHtml(emp?.bankName||'')}</td>
      </tr>
      <tr>
        <td class="ps-label">Department</td><td class="ps-value">${U.escHtml(emp?.department||'')}</td>
        <td class="ps-label">IFSC Code</td><td class="ps-value">${U.escHtml(emp?.ifsc||'')}</td>
      </tr>
      <tr>
        <td class="ps-label">DOJ</td><td class="ps-value">${U.fmtDate(emp?.doj)}</td>
        <td class="ps-label">Bank A/C No</td><td class="ps-value">${U.escHtml(emp?.bankAcc||'')}</td>
      </tr>
      <tr>
        <td class="ps-label">Total working days in the month</td>
        <td class="ps-value" style="text-align:center">${ps.totalWorkingDays}</td>
        <td class="ps-label">Paid Days</td>
        <td class="ps-value" style="text-align:center">${ps.paidDays}</td>
      </tr>
      <tr>
        <td class="ps-label">Leaves Availed in Month</td>
        <td class="ps-value" style="text-align:center">${ps.leavesAvailed}</td>
        <td class="ps-label">Leave Balance Available as on date</td>
        <td class="ps-value" style="text-align:center">${ps.leaveBalance}</td>
      </tr>
      ${ps.lopDays > 0 ? `<tr>
        <td class="ps-label" style="color:#DC2626;font-weight:700">Loss of Pay (LOP)</td>
        <td class="ps-value" style="color:#DC2626;font-weight:700;text-align:center">${ps.lopDays} day(s)</td>
        <td colspan="2" class="ps-value" style="font-size:11px;color:#666">Salary proportionally reduced for LOP days</td>
      </tr>` : '<tr style="display:none"><td></td></tr>'}
      </tr>
      <tr>
        <td colspan="2" class="ps-section-head">Earnings</td>
        <td colspan="2" class="ps-section-head">Deductions</td>
      </tr>
      <tr>
        <td class="ps-earn-label">Basic Wage</td>
        <td class="ps-earn-val">${e.basic ? U.fmtINR(e.basic) : ''}</td>
        <td class="ps-ded-label">EPF</td>
        <td class="ps-ded-val">${d.epf ? U.fmtINR(d.epf) : ''}</td>
      </tr>
      <tr>
        <td class="ps-earn-label">HRA</td>
        <td class="ps-earn-val">${e.hra ? U.fmtINR(e.hra) : ''}</td>
        <td class="ps-ded-label">ESI</td>
        <td class="ps-ded-val">${d.esi !== undefined ? U.fmtINR(d.esi) : ''}</td>
      </tr>
      <tr>
        <td class="ps-earn-label">OT</td>
        <td class="ps-earn-val">${e.ot ? U.fmtINR(e.ot) : 0}</td>
        <td class="ps-ded-label">TDS</td>
        <td class="ps-ded-val">${d.tds ? U.fmtINR(d.tds) : ''}</td>
      </tr>
      <tr>
        <td class="ps-earn-label">Arrears</td>
        <td class="ps-earn-val">${e.arrears ? U.fmtINR(e.arrears) : ''}</td>
        <td class="ps-ded-label">Advance</td>
        <td class="ps-ded-val">${d.advance ? U.fmtINR(d.advance) : 0}</td>
      </tr>
      <tr>
        <td class="ps-earn-label">Production Incentive</td>
        <td class="ps-earn-val">${e.prodIncentive ? U.fmtINR(e.prodIncentive) : ''}</td>
        <td></td><td></td>
      </tr>
      <tr>
        <td class="ps-earn-label" style="font-weight:700">Total Earnings</td>
        <td class="ps-earn-val" style="font-weight:700">${U.fmtINR(ps.totalEarnings)}</td>
        <td></td><td></td>
      </tr>
      <tr>
        <td colspan="2" class="ps-net">Net Salary ${U.fmtINR(ps.net)}</td>
        <td colspan="2" class="ps-net">Rs ${U.fmtINR(ps.net)} only<br>
          <span style="font-size:11px;font-weight:400">(${U.numToWords(ps.net)})</span>
        </td>
      </tr>
      <tr>
        <td colspan="2" class="ps-sig">
          <div class="ps-sig-line"></div><br>Employer Signature
        </td>
        <td colspan="2" class="ps-sig-right">
          <div class="ps-sig-line"></div><br>Employee Signature
        </td>
      </tr>
    </table>
    </div>`;
  },

  // ============================================================
  // SETTINGS
  // ============================================================
  render_settings() {
    return `
    <div class="settings-grid">
      <div class="card">
        <div class="card-head"><h3>Company Information</h3></div>
        <div class="card-body">
          <form onsubmit="HR.saveCompany(event)">
            <div class="form-grid cols-1">
              <div class="form-group"><label>Company Name</label>
                <input class="form-control" name="name" value="${U.escHtml(this.data.company.name)}"></div>
              <div class="form-group"><label>Address</label>
                <textarea class="form-control" name="address" rows="2">${U.escHtml(this.data.company.address||'')}</textarea></div>
              <div class="form-group"><label>Phone</label>
                <input class="form-control" name="phone" value="${U.escHtml(this.data.company.phone||'')}"></div>
              <div class="form-group"><label>Email</label>
                <input class="form-control" type="email" name="email" value="${U.escHtml(this.data.company.email||'')}"></div>
            </div>
            <div class="form-actions"><button type="submit" class="btn btn-primary">Save Company Info</button></div>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>Leave Types</h3>
          <button class="btn btn-primary btn-sm" onclick="HR.openLeaveTypeForm()">+ Add Type</button>
        </div>
        <div class="card-body" style="padding:0">
          <table class="table">
            <thead><tr><th>Code</th><th>Name</th><th>Annual Days</th><th>Paid</th><th></th></tr></thead>
            <tbody id="lt-tbody">${this.leaveTypeRows()}</tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>Public Holidays</h3>
          <button class="btn btn-primary btn-sm" onclick="HR.openHolidayForm()">+ Add Holiday</button>
        </div>
        <div class="card-body">
          <ul class="holiday-list" id="holiday-list">${this.holidayItems()}</ul>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>Admin Users (OTP Login)</h3>
          <button class="btn btn-primary btn-sm" onclick="HR.openAdminUserForm()">+ Add User</button>
        </div>
        <div class="card-body" style="padding:0">
          <table class="table">
            <thead><tr><th>Name</th><th>Role</th><th>Email</th><th></th></tr></thead>
            <tbody id="admin-users-tbody">${this.adminUserRows()}</tbody>
          </table>
        </div>
        <div style="padding:10px 16px;font-size:11px;color:var(--gray-400)">
          OTP will be sent to the email address of the selected user at login.
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Data Management</h3></div>
        <div class="card-body">
          <div style="display:flex;flex-direction:column;gap:10px">
            <button class="btn btn-outline" onclick="HR.exportData()">📤 Export All Data (JSON)</button>
            <label class="btn btn-outline" style="cursor:pointer">
              📥 Import Data (JSON)
              <input type="file" accept=".json" style="display:none" onchange="HR.importData(this)">
            </label>
            <button class="btn btn-danger" onclick="HR.resetData()">🗑 Reset All Data</button>
          </div>
        </div>
      </div>
    </div>`;
  },
  init_settings() {},
  saveCompany(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    this.data.company = { name: fd.get('name'), address: fd.get('address'), phone: fd.get('phone'), email: fd.get('email') };
    this.save();
    document.getElementById('sidebar-company').textContent = this.data.company.name.split(' ').slice(0,2).join(' ');
    this.toast('Company info saved');
  },
  leaveTypeRows() {
    return this.data.leaveTypes.map(t => `<tr>
      <td><span class="badge badge-info">${t.id}</span></td>
      <td>${U.escHtml(t.name)}</td>
      <td>${t.annual}</td>
      <td><span class="badge badge-${t.paid?'success':'danger'}">${t.paid?'Paid':'Unpaid'}</span></td>
      <td><button class="btn btn-danger btn-sm" onclick="HR.deleteLeaveType('${t.id}')">Del</button></td>
    </tr>`).join('');
  },
  openLeaveTypeForm() {
    this.openModal('Add Leave Type', `
    <form onsubmit="HR.addLeaveType(event)">
      <div class="form-grid">
        <div class="form-group"><label>Code (e.g. CL)</label><input class="form-control" name="id" maxlength="5" required></div>
        <div class="form-group"><label>Name</label><input class="form-control" name="name" required></div>
        <div class="form-group"><label>Annual Days</label><input class="form-control" type="number" name="annual" value="12" min="0"></div>
        <div class="form-group"><label>Paid?</label>
          <select class="form-control" name="paid">
            <option value="1">Paid</option><option value="0">Unpaid</option>
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="HR.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Add</button>
      </div>
    </form>`, 'sm');
  },
  addLeaveType(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const id = fd.get('id').toUpperCase().trim();
    if (this.data.leaveTypes.find(t => t.id === id)) return this.toast('Code already exists','error');
    this.data.leaveTypes.push({ id, name: fd.get('name'), annual: +fd.get('annual'), paid: fd.get('paid')==='1', color: '#64748B' });
    this.save(); this.closeModal();
    document.getElementById('lt-tbody').innerHTML = this.leaveTypeRows();
    this.toast('Leave type added');
  },
  deleteLeaveType(id) {
    if (!confirm('Delete this leave type?')) return;
    this.data.leaveTypes = this.data.leaveTypes.filter(t => t.id !== id);
    this.save();
    document.getElementById('lt-tbody').innerHTML = this.leaveTypeRows();
    this.toast('Deleted','info');
  },
  holidayItems() {
    const sorted = [...this.data.holidays].sort((a,b) => a.date > b.date ? 1 : -1);
    return sorted.map(h => `<li class="holiday-item">
      <span><strong>${U.fmtDate(h.date)}</strong> — ${U.escHtml(h.name)}</span>
      <button class="btn btn-danger btn-sm" onclick="HR.deleteHoliday('${h.date}')">Del</button>
    </li>`).join('') || '<li class="text-muted text-sm">No holidays added</li>';
  },
  openHolidayForm() {
    this.openModal('Add Public Holiday', `
    <form onsubmit="HR.addHoliday(event)">
      <div class="form-grid">
        <div class="form-group"><label>Date</label><input class="form-control" type="date" name="date" required></div>
        <div class="form-group"><label>Holiday Name</label><input class="form-control" name="name" required></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="HR.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Add</button>
      </div>
    </form>`, 'sm');
  },
  addHoliday(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const date = fd.get('date'), name = fd.get('name');
    if (this.data.holidays.find(h => h.date === date)) return this.toast('Holiday already exists for this date','error');
    this.data.holidays.push({ date, name });
    this.save(); this.closeModal();
    document.getElementById('holiday-list').innerHTML = this.holidayItems();
    this.toast('Holiday added');
  },
  deleteHoliday(date) {
    this.data.holidays = this.data.holidays.filter(h => h.date !== date);
    this.save();
    document.getElementById('holiday-list').innerHTML = this.holidayItems();
    this.toast('Deleted','info');
  },
  // ── SUNDAY OT RESOLUTION ────────────────────────────────────
  renderSundayOTSection(ym) {
    ym = ym || this._psState.ym || U.currentYM();
    const activeEmps = this.data.employees.filter(e => e.status === 'active');

    // Gather unresolved Sunday OT records per employee for this month
    const pending = [];
    activeEmps.forEach(emp => {
      const sunRecs = this.data.attendance.filter(a =>
        a.empId === emp.id && a.isSundayOT && a.date.startsWith(ym) && a.sundayOTResolved === null
      );
      if (sunRecs.length > 0) {
        const s = emp.salary || {};
        const wd = this.calcWorkingDays(emp, ym);
        const dailyRate = wd > 0 ? Math.round(((s.basic||0) + (s.hra||0)) / wd) : 0;
        const encashAmt = dailyRate * sunRecs.length;
        pending.push({ emp, sunRecs, dailyRate, encashAmt });
      }
    });

    if (pending.length === 0) return '';

    return `
    <div class="card" style="border:2px solid var(--warning);margin-bottom:16px">
      <div class="card-head" style="background:var(--warning-light)">
        <h3 style="color:#92400E">☀ Sunday OT — Pending Resolution (${U.fmtMonthYear(ym)})</h3>
        <div style="font-size:12px;color:#92400E">${pending.length} employee(s) worked on Sundays this month</div>
      </div>
      <div class="card-body" style="padding:0">
        <table class="table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Sundays Worked</th>
              <th>Daily Rate</th>
              <th>Encash Amount</th>
              <th>Resolution</th>
            </tr>
          </thead>
          <tbody>
            ${pending.map(p => `<tr>
              <td>
                <strong>${U.escHtml(p.emp.name)}</strong>
                <div class="text-muted text-sm">${p.emp.id}</div>
              </td>
              <td>
                ${p.sunRecs.map(r => `<span class="badge badge-warning">${U.fmtDate(r.date)}</span>`).join(' ')}
              </td>
              <td>₹${U.fmtINR(p.dailyRate)}/day</td>
              <td><strong>₹${U.fmtINR(p.encashAmt)}</strong></td>
              <td style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-success btn-sm"
                  onclick="HR.resolveSundayOT('${p.emp.id}','${ym}','encash')">
                  💰 Encash ₹${U.fmtINR(p.encashAmt)}
                </button>
                <button class="btn btn-primary btn-sm"
                  onclick="HR.resolveSundayOT('${p.emp.id}','${ym}','leave')">
                  📅 Add ${p.sunRecs.length} Comp Off
                </button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div style="padding:10px 16px;font-size:11px;color:var(--gray-400)">
          Encash: extra pay added to next payslip earnings. Add Leave: credited to Comp Off balance.
        </div>
      </div>
    </div>`;
  },

  resolveSundayOT(empId, ym, type) {
    const emp = this.data.employees.find(e => e.id === empId);
    if (!emp) return;

    const sunRecs = this.data.attendance.filter(a =>
      a.empId === empId && a.isSundayOT && a.date.startsWith(ym) && a.sundayOTResolved === null
    );
    if (!sunRecs.length) return;

    const count = sunRecs.length;
    sunRecs.forEach(r => { r.sundayOTResolved = type; });

    if (!emp.leaveBalance) emp.leaveBalance = {};

    if (type === 'leave') {
      emp.leaveBalance.CO = (emp.leaveBalance.CO || 0) + count;
      this.toast(`+${count} Comp Off added to ${emp.name}'s leave balance`);
    } else {
      // Encash: store pending encashment; picked up during payslip generation
      if (!emp.pendingSundayOTEncash) emp.pendingSundayOTEncash = {};
      emp.pendingSundayOTEncash[ym] = (emp.pendingSundayOTEncash[ym] || 0) + count;
      const s = emp.salary || {};
      const wd = this.calcWorkingDays(emp, ym);
      const dailyRate = wd > 0 ? Math.round(((s.basic||0) + (s.hra||0)) / wd) : 0;
      this.toast(`₹${U.fmtINR(dailyRate * count)} Sunday OT encashment recorded for ${emp.name} — will appear in payslip`);
    }

    this.save();
    // Refresh the section
    const el = document.getElementById('sunday-ot-section');
    if (el) el.innerHTML = this.renderSundayOTSection(ym);
  },

  adminUserRows() {
    return (this.data.adminUsers || []).map(u => `<tr>
      <td><strong>${U.escHtml(u.name)}</strong></td>
      <td><span class="badge badge-info">${U.escHtml(u.role)}</span></td>
      <td>${u.email ? U.escHtml(u.email) : '<span class="text-muted">Not set</span>'}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="HR.openAdminUserForm('${u.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="HR.deleteAdminUser('${u.id}')">Del</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="4" class="text-muted text-sm" style="padding:12px">No admin users. Add at least one.</td></tr>';
  },

  openAdminUserForm(id) {
    const u = id ? this.data.adminUsers.find(x => x.id === id) : null;
    this.openModal(u ? 'Edit Admin User' : 'Add Admin User', `
    <form onsubmit="HR.saveAdminUser(event,'${id||''}')">
      <div class="form-grid">
        <div class="form-group"><label>Full Name</label>
          <input class="form-control" name="name" value="${U.escHtml(u?.name||'')}" required></div>
        <div class="form-group"><label>Role</label>
          <select class="form-control" name="role">
            <option value="HR"${u?.role==='HR'?' selected':''}>HR</option>
            <option value="Accounts"${u?.role==='Accounts'?' selected':''}>Accounts</option>
            <option value="Admin"${u?.role==='Admin'?' selected':''}>Admin</option>
            <option value="Management"${u?.role==='Management'?' selected':''}>Management</option>
          </select></div>
        <div class="form-group"><label>Email Address (for OTP login)</label>
          <input class="form-control" name="email" type="email"
            value="${U.escHtml(u?.email||'')}" placeholder="e.g. hr@snlinnovations.com" required></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-outline" onclick="HR.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${u ? 'Save Changes' : 'Add User'}</button>
      </div>
    </form>`, 'sm');
  },

  saveAdminUser(e, id) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const email = (fd.get('email')||'').trim().toLowerCase();
    if (!this.data.adminUsers) this.data.adminUsers = [];
    if (id) {
      const u = this.data.adminUsers.find(x => x.id === id);
      if (u) { u.name = fd.get('name'); u.role = fd.get('role'); u.email = email; }
    } else {
      this.data.adminUsers.push({ id: U.uid(), name: fd.get('name'), role: fd.get('role'), email });
    }
    this.save(); this.closeModal();
    document.getElementById('admin-users-tbody').innerHTML = this.adminUserRows();
    this.toast('Admin user saved');
  },

  deleteAdminUser(id) {
    if (!confirm('Remove this admin user?')) return;
    this.data.adminUsers = (this.data.adminUsers || []).filter(u => u.id !== id);
    this.save();
    document.getElementById('admin-users-tbody').innerHTML = this.adminUserRows();
    this.toast('Deleted','info');
  },

  exportData() {
    const blob = new Blob([JSON.stringify(this.data, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hr_data_${U.today()}.json`;
    a.click();
    this.toast('Data exported');
  },
  importData(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (!imported.employees) throw new Error('Invalid format');
        if (!confirm('This will replace all current data. Continue?')) return;
        this.data = { ...Store.defaults(), ...imported };
        this.save(); this.nav('dashboard');
        this.toast('Data imported successfully');
      } catch(err) { this.toast('Invalid JSON file','error'); }
    };
    reader.readAsText(file);
  },
  resetData() {
    if (!confirm('⚠ This will delete ALL data permanently. Are you sure?')) return;
    if (!confirm('Last chance – this cannot be undone. Reset everything?')) return;
    this.data = Store.defaults();
    this.save(); this.nav('dashboard');
    this.toast('All data reset','info');
  }
};

// Start the app
document.addEventListener('DOMContentLoaded', () => HR.init());
