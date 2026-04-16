const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const STORE_PATH = path.join(__dirname, 'data', 'store.json');

const readStore = () => JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
const writeStore = (data) => fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

app.use(express.static(path.join(__dirname, 'public')));

const ensureAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const store = readStore();
  const user = store.users.find((u) => u.username === username && u.password === password);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.user = { id: user.id, username: user.username };
  return res.json({ user: req.session.user });
});

app.post('/api/auth/logout', ensureAuth, (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.json({ user: req.session.user });
});

app.get('/api/assets', ensureAuth, (req, res) => {
  const store = readStore();
  res.json(store.assets);
});

app.post('/api/assets', ensureAuth, (req, res) => {
  const { name, category, tags, value, purchaseDate, lifespanYears, location } = req.body;

  if (!name || !category || !value || !purchaseDate || !lifespanYears) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const parsedValue = Number(value);
  const parsedLifespan = Number(lifespanYears);
  if (Number.isNaN(parsedValue) || Number.isNaN(parsedLifespan) || parsedLifespan <= 0 || parsedValue < 0) {
    return res.status(400).json({ error: 'Invalid numeric values' });
  }

  const store = readStore();
  const asset = {
    id: uuidv4(),
    name,
    category,
    tags: (tags || '').split(',').map((x) => x.trim()).filter(Boolean),
    value: parsedValue,
    purchaseDate,
    lifespanYears: parsedLifespan,
    location: location || 'Unspecified',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  store.assets.push(asset);
  writeStore(store);
  return res.status(201).json(asset);
});

app.put('/api/assets/:id', ensureAuth, (req, res) => {
  const store = readStore();
  const index = store.assets.findIndex((a) => a.id === req.params.id);

  if (index < 0) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  const asset = store.assets[index];
  const merged = {
    ...asset,
    ...req.body,
    tags: typeof req.body.tags === 'string'
      ? req.body.tags.split(',').map((x) => x.trim()).filter(Boolean)
      : asset.tags,
    updatedAt: new Date().toISOString()
  };

  merged.value = Number(merged.value);
  merged.lifespanYears = Number(merged.lifespanYears);

  if (Number.isNaN(merged.value) || Number.isNaN(merged.lifespanYears) || merged.value < 0 || merged.lifespanYears <= 0) {
    return res.status(400).json({ error: 'Invalid numeric values' });
  }

  store.assets[index] = merged;
  writeStore(store);
  return res.json(merged);
});

app.delete('/api/assets/:id', ensureAuth, (req, res) => {
  const store = readStore();
  const remaining = store.assets.filter((a) => a.id !== req.params.id);
  if (remaining.length === store.assets.length) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  store.assets = remaining;
  writeStore(store);
  return res.json({ ok: true });
});

app.get('/api/assets/report/summary', ensureAuth, (req, res) => {
  const store = readStore();
  const now = new Date();

  const withDep = store.assets.map((asset) => {
    const ageYears = Math.max(0, (now - new Date(asset.purchaseDate)) / (1000 * 60 * 60 * 24 * 365.25));
    const annualDep = asset.value / asset.lifespanYears;
    const depreciation = Math.min(asset.value, annualDep * ageYears);
    return {
      ...asset,
      netBookValue: +(asset.value - depreciation).toFixed(2),
      depreciation: +depreciation.toFixed(2)
    };
  });

  const totals = withDep.reduce(
    (acc, item) => {
      acc.count += 1;
      acc.originalValue += item.value;
      acc.netBookValue += item.netBookValue;
      acc.depreciation += item.depreciation;
      acc.byCategory[item.category] = (acc.byCategory[item.category] || 0) + item.netBookValue;
      return acc;
    },
    { count: 0, originalValue: 0, netBookValue: 0, depreciation: 0, byCategory: {} }
  );

  res.json({
    assets: withDep,
    totals: {
      ...totals,
      originalValue: +totals.originalValue.toFixed(2),
      netBookValue: +totals.netBookValue.toFixed(2),
      depreciation: +totals.depreciation.toFixed(2)
    }
  });
});

app.get('/api/assets/export.csv', ensureAuth, (req, res) => {
  const store = readStore();
  const rows = [
    ['id', 'name', 'category', 'value', 'purchaseDate', 'lifespanYears', 'tags', 'location'].join(',')
  ];

  store.assets.forEach((a) => {
    rows.push([
      a.id,
      `"${String(a.name).replaceAll('"', '""')}"`,
      `"${String(a.category).replaceAll('"', '""')}"`,
      a.value,
      a.purchaseDate,
      a.lifespanYears,
      `"${a.tags.join('|')}"`,
      `"${String(a.location || '').replaceAll('"', '""')}"`
    ].join(','));
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="assets-export.csv"');
  res.send(rows.join('\n'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
