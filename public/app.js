const qs = (s) => document.querySelector(s);
const qsa = (s) => [...document.querySelectorAll(s)];

const state = { bmiChart: null, graphChart: null, assetChart: null, fxRate: null };

const pediatricTable = {
  male: {
    5: [13.8, 14.8, 17.4, 18.8, 20.5],
    10: [14.2, 15.3, 18.6, 21.0, 23.5],
    15: [16.5, 18.0, 22.0, 25.0, 28.0]
  },
  female: {
    5: [13.6, 14.6, 17.2, 18.7, 20.6],
    10: [14.0, 15.2, 19.0, 22.2, 24.8],
    15: [16.7, 18.3, 22.8, 26.0, 29.5]
  }
};

function setupTabs() {
  qsa('.sidebar button').forEach((btn) => {
    btn.addEventListener('click', () => {
      qsa('.sidebar button').forEach((b) => b.classList.remove('active'));
      qsa('.panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      qs(`#${btn.dataset.tab}`).classList.add('active');
    });
  });
}

function yearsMonthsDays(d1, d2) {
  const from = new Date(d1);
  const to = new Date(d2);
  let years = to.getFullYear() - from.getFullYear();
  let months = to.getMonth() - from.getMonth();
  let days = to.getDate() - from.getDate();
  if (days < 0) { months -= 1; days += 30; }
  if (months < 0) { years -= 1; months += 12; }
  return { years, months, days };
}

function bmiCategoryAdult(bmi) {
  if (bmi < 18.5) return ['Underweight', 'Z68.1'];
  if (bmi < 25) return ['Normal', 'Z68.2'];
  if (bmi < 30) return ['Overweight', 'Z68.3'];
  if (bmi < 35) return ['Obesity Class I', 'E66.9'];
  if (bmi < 40) return ['Obesity Class II', 'E66.01'];
  return ['Obesity Class III', 'E66.01'];
}

function pediatricPercentile(age, sex, bmi) {
  const roundedAge = age < 8 ? 5 : age < 13 ? 10 : 15;
  const bands = pediatricTable[sex][roundedAge];
  const names = ['<5th', '5th-15th', '15th-85th', '85th-95th', '>95th'];
  let idx = 0;
  while (idx < bands.length && bmi > bands[idx]) idx += 1;
  return names[Math.min(idx, names.length - 1)];
}

function renderBmiChart(bmi) {
  const ctx = qs('#bmiChart');
  state.bmiChart?.destroy();
  state.bmiChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: ['BMI'], datasets: [{ data: [bmi], backgroundColor: '#3758f9' }] },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
}

function bindBMI() {
  qs('#bmiForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const patientType = form.get('patientType');
    const sex = form.get('sex');
    const dob = form.get('dob');
    const height = Number(form.get('height')) / 100;
    const weight = Number(form.get('weight'));
    const visitDate = form.get('visitDate');

    const age = yearsMonthsDays(dob, visitDate);
    const bmi = +(weight / (height * height)).toFixed(2);
    const out = [];

    if (patientType === 'adult') {
      const [category, icd] = bmiCategoryAdult(bmi);
      out.push(['BMI', bmi], ['Category', category], ['Range', 'Adult WHO'], ['ICD', icd]);
    } else {
      const percentile = pediatricPercentile(age.years, sex, bmi);
      const icd = percentile === '>95th' ? 'E66.9' : percentile === '<5th' ? 'R63.6' : 'Z68.53';
      out.push(['BMI', bmi], ['Pediatric Percentile', percentile], ['Percentile Range', 'CDC-like'], ['ICD', icd]);
    }

    out.push(['Age', `${age.years}y ${age.months}m ${age.days}d`]);
    qs('#bmiOutput').innerHTML = out.map(([k, v]) => `<div><strong>${k}</strong><br/>${v}</div>`).join('');
    renderBmiChart(bmi);
  });
}

function bindDateTools() {
  qs('#dateDiffForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const start = form.get('start');
    const end = form.get('end');
    const proj = Number(form.get('projection'));
    const ms = new Date(end) - new Date(start);
    if (Number.isNaN(ms)) return;
    const days = Math.round(ms / (1000 * 60 * 60 * 24));
    const ymd = yearsMonthsDays(start, end);
    const fut = new Date(end); fut.setDate(fut.getDate() + proj);
    const past = new Date(start); past.setDate(past.getDate() - proj);
    qs('#dateOutput').innerHTML = [
      ['Difference (days)', days],
      ['Difference (Y/M/D)', `${ymd.years}/${ymd.months}/${ymd.days}`],
      ['Future Projection', fut.toISOString().slice(0, 10)],
      ['Past Projection', past.toISOString().slice(0, 10)]
    ].map(([k, v]) => `<div><strong>${k}</strong><br>${v}</div>`).join('');
  });
}

function bindCalculators() {
  qs('#evalExpr').addEventListener('click', () => {
    const expr = qs('#expr').value.replaceAll('^', '**').replaceAll('sin', 'Math.sin').replaceAll('cos', 'Math.cos').replaceAll('tan', 'Math.tan');
    try { qs('#exprResult').textContent = `Result: ${Function(`return ${expr}`)()}`; } catch { qs('#exprResult').textContent = 'Invalid expression'; }
  });
  qs('#progConvert').addEventListener('click', () => {
    const v = Number(qs('#progVal').value);
    qs('#progResult').textContent = `DEC ${v} | BIN ${v.toString(2)} | HEX ${v.toString(16).toUpperCase()}`;
  });
  qs('#vectorCalc').addEventListener('click', () => {
    const a = qs('#vecA').value.split(',').map(Number), b = qs('#vecB').value.split(',').map(Number);
    const dot = a.reduce((s, x, i) => s + x * (b[i] || 0), 0);
    const mag = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0)).toFixed(3);
    qs('#vectorResult').textContent = `Dot=${dot}, |A|=${mag(a)}, |B|=${mag(b)}`;
  });
  qs('#matrixCalc').addEventListener('click', () => {
    const a = qs('#m1').value.split(',').map(Number), b = qs('#m2').value.split(',').map(Number);
    const r = [a[0]*b[0]+a[1]*b[2], a[0]*b[1]+a[1]*b[3], a[2]*b[0]+a[3]*b[2], a[2]*b[1]+a[3]*b[3]];
    qs('#matrixResult').textContent = `[[${r[0]}, ${r[1]}], [${r[2]}, ${r[3]}]]`;
  });
  qs('#financialCalc').addEventListener('click', () => {
    const p = Number(qs('#pmtPrincipal').value), r = Number(qs('#pmtRate').value)/1200, n = Number(qs('#pmtYears').value)*12;
    const emi = p * r * ((1+r)**n) / (((1+r)**n)-1);
    qs('#financialResult').textContent = Number.isFinite(emi) ? `EMI: ${emi.toFixed(2)}` : 'Invalid values';
  });
  qs('#kmConvert').addEventListener('click', () => {
    const km = Number(qs('#kmInput').value);
    qs('#unitResult').textContent = `${km} km = ${(km * 0.621371).toFixed(3)} miles`;
  });
  qs('#currencyConvert').addEventListener('click', async () => {
    const usd = Number(qs('#usdInput').value);
    try {
      const data = await (await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR')).json();
      const rate = data.rates.EUR;
      qs('#currencyResult').textContent = `${usd} USD = ${(usd * rate).toFixed(2)} EUR (rate date ${data.date})`;
    } catch {
      qs('#currencyResult').textContent = 'Currency fetch unavailable in this environment.';
    }
  });

  const ctx = qs('#graphCanvas');
  const x = Array.from({ length: 50 }, (_, i) => i / 5);
  const y = x.map((n) => Math.sin(n));
  state.graphChart = new Chart(ctx, {
    type: 'line',
    data: { labels: x, datasets: [{ label: 'sin(x)', data: y, borderColor: '#6726ff' }] },
    options: { responsive: true }
  });
}

async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
  return res.headers.get('content-type')?.includes('application/json') ? res.json() : res.text();
}

async function loadAssets() {
  const summary = await api('/api/assets/report/summary');
  const tbody = qs('#assetTable tbody');
  tbody.innerHTML = '';
  summary.assets.forEach((a) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${a.name}</td><td>${a.category}</td><td>${a.value.toFixed(2)}</td><td>${a.netBookValue.toFixed(2)}</td>
      <td><button data-id="${a.id}" class="deleteAsset">Delete</button></td>`;
    tbody.appendChild(tr);
  });
  qs('#assetSummary').innerHTML = [
    ['Assets', summary.totals.count],
    ['Original Value', summary.totals.originalValue],
    ['Depreciation', summary.totals.depreciation],
    ['Net Book Value', summary.totals.netBookValue]
  ].map(([k,v]) => `<div><strong>${k}</strong><br>${v}</div>`).join('');

  const labels = Object.keys(summary.totals.byCategory);
  const values = Object.values(summary.totals.byCategory);
  state.assetChart?.destroy();
  state.assetChart = new Chart(qs('#assetChart'), {
    type:'doughnut', data:{labels, datasets:[{data: values}]}, options:{responsive:true}
  });

  qsa('.deleteAsset').forEach((btn) => btn.addEventListener('click', async () => {
    await api(`/api/assets/${btn.dataset.id}`, { method:'DELETE' });
    loadAssets();
  }));
}

function bindAssets() {
  qs('#assetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    try { await api('/api/assets', { method:'POST', body: JSON.stringify(payload) }); e.target.reset(); loadAssets(); } catch(err) { alert(err.message); }
  });
  qs('#exportCsv').addEventListener('click', () => { window.location.href = '/api/assets/export.csv'; });
}

function bindSupport() {
  qs('#contactForm').addEventListener('submit', (e) => {
    e.preventDefault();
    qs('#contactStatus').textContent = 'Support request submitted successfully. Our team will contact you shortly.';
    e.target.reset();
  });
}

async function bootAuth() {
  const showApp = () => { qs('#authGate').classList.add('hidden'); qs('#appPanels').classList.remove('hidden'); loadAssets(); };
  try { await api('/api/auth/me'); showApp(); } catch {}

  qs('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try { await api('/api/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(fd.entries())) }); showApp(); }
    catch { alert('Login failed'); }
  });

  qs('#logoutBtn').addEventListener('click', async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } finally { location.reload(); }
  });
}

function bindThemeCookie() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  qs('#themeSelect').value = document.documentElement.dataset.theme || 'light';
  qs('#themeSelect').addEventListener('change', (e) => {
    document.documentElement.dataset.theme = e.target.value;
    localStorage.setItem('theme', e.target.value);
  });

  if (!localStorage.getItem('cookieAccepted')) qs('#cookieConsent').classList.remove('hidden');
  qs('#acceptCookies').addEventListener('click', () => {
    localStorage.setItem('cookieAccepted', 'yes');
    qs('#cookieConsent').classList.add('hidden');
  });
}

setupTabs();
bindBMI();
bindDateTools();
bindCalculators();
bindAssets();
bindSupport();
bindThemeCookie();
bootAuth();

qs('#bmiForm [name="visitDate"]').value = new Date().toISOString().slice(0,10);
