/**
 * NitinCloud Backend — Personal BaaS
 * Stack: Node.js + Express + better-sqlite3
 * Deploy: Render.com (free tier)
 *
 * Features:
 *  - Multi-app management with API keys
 *  - Collections (flexible JSON / Firestore-style)
 *  - Tables (structured SQL-style)
 *  - Full CRUD REST API
 *  - Query, filter, sort, paginate
 */

const express = require('express');
const cors    = require('cors');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs   = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;
const MASTER_KEY = process.env.MASTER_KEY || 'nitincloud-master-2024'; // change this!

// ── DB setup ────────────────────────────────────────────
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'nitincloud.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema bootstrap ────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS nc_apps (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    slug       TEXT UNIQUE NOT NULL,
    description TEXT DEFAULT '',
    api_key    TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS nc_collections (
    id         TEXT PRIMARY KEY,
    app_id     TEXT NOT NULL,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL DEFAULT 'collection',
    schema_def TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(app_id, name),
    FOREIGN KEY(app_id) REFERENCES nc_apps(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS nc_documents (
    id         TEXT PRIMARY KEY,
    app_id     TEXT NOT NULL,
    collection TEXT NOT NULL,
    data       TEXT NOT NULL DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(app_id) REFERENCES nc_apps(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_docs_app_col ON nc_documents(app_id, collection);
  CREATE INDEX IF NOT EXISTS idx_docs_created ON nc_documents(created_at);
`);

// ── Middleware ───────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use((req, _, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.path}`);
  next();
});

// ── Helpers ─────────────────────────────────────────────
function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, ...data });
}
function err(res, msg, status = 400) {
  return res.status(status).json({ success: false, error: msg });
}
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
function genApiKey() {
  return 'nc_live_' + uuidv4().replace(/-/g, '');
}

// ── Auth middleware ──────────────────────────────────────
function requireMaster(req, res, next) {
  const key = req.headers['x-master-key'] || req.query.masterKey;
  if (key !== MASTER_KEY) return err(res, 'Invalid master key', 401);
  next();
}

function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.apiKey;
  if (!key) return err(res, 'API key required. Pass x-api-key header.', 401);
  const app_row = db.prepare('SELECT * FROM nc_apps WHERE api_key = ?').get(key);
  if (!app_row) return err(res, 'Invalid API key', 401);
  req.ncApp = app_row;
  next();
}

// ════════════════════════════════════════════════════════
//  MASTER ROUTES — App Management (requires master key)
// ════════════════════════════════════════════════════════

// GET /admin/apps — list all apps
app.get('/admin/apps', requireMaster, (req, res) => {
  const apps = db.prepare('SELECT * FROM nc_apps ORDER BY created_at DESC').all();
  const result = apps.map(a => ({
    ...a,
    collections: db.prepare('SELECT id, name, type, created_at FROM nc_collections WHERE app_id = ?').all(a.id),
    doc_count:   db.prepare('SELECT COUNT(*) as c FROM nc_documents WHERE app_id = ?').get(a.id).c
  }));
  ok(res, { apps: result });
});

// POST /admin/apps — create new app
app.post('/admin/apps', requireMaster, (req, res) => {
  const { name, description = '' } = req.body;
  if (!name) return err(res, 'name is required');
  const id      = uuidv4();
  const slug    = slugify(name) + '-' + id.slice(0, 6);
  const api_key = genApiKey();
  db.prepare(`
    INSERT INTO nc_apps (id, name, slug, description, api_key)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name, slug, description, api_key);
  const app_row = db.prepare('SELECT * FROM nc_apps WHERE id = ?').get(id);
  ok(res, { app: app_row }, 201);
});

// GET /admin/apps/:id — get single app details
app.get('/admin/apps/:id', requireMaster, (req, res) => {
  const app_row = db.prepare('SELECT * FROM nc_apps WHERE id = ?').get(req.params.id);
  if (!app_row) return err(res, 'App not found', 404);
  const collections = db.prepare('SELECT * FROM nc_collections WHERE app_id = ?').all(app_row.id);
  ok(res, { app: { ...app_row, collections } });
});

// PATCH /admin/apps/:id — update app
app.patch('/admin/apps/:id', requireMaster, (req, res) => {
  const { name, description } = req.body;
  const existing = db.prepare('SELECT * FROM nc_apps WHERE id = ?').get(req.params.id);
  if (!existing) return err(res, 'App not found', 404);
  db.prepare(`
    UPDATE nc_apps SET name = ?, description = ?, updated_at = datetime('now') WHERE id = ?
  `).run(name || existing.name, description ?? existing.description, req.params.id);
  ok(res, { app: db.prepare('SELECT * FROM nc_apps WHERE id = ?').get(req.params.id) });
});

// DELETE /admin/apps/:id — delete app and all its data
app.delete('/admin/apps/:id', requireMaster, (req, res) => {
  const existing = db.prepare('SELECT * FROM nc_apps WHERE id = ?').get(req.params.id);
  if (!existing) return err(res, 'App not found', 404);
  db.prepare('DELETE FROM nc_apps WHERE id = ?').run(req.params.id);
  ok(res, { message: 'App deleted' });
});

// POST /admin/apps/:id/rotate-key — regenerate API key
app.post('/admin/apps/:id/rotate-key', requireMaster, (req, res) => {
  const new_key = genApiKey();
  db.prepare("UPDATE nc_apps SET api_key = ?, updated_at = datetime('now') WHERE id = ?")
    .run(new_key, req.params.id);
  ok(res, { api_key: new_key });
});

// GET /admin/stats — global stats
app.get('/admin/stats', requireMaster, (req, res) => {
  const stats = {
    total_apps:        db.prepare('SELECT COUNT(*) as c FROM nc_apps').get().c,
    total_collections: db.prepare('SELECT COUNT(*) as c FROM nc_collections').get().c,
    total_documents:   db.prepare('SELECT COUNT(*) as c FROM nc_documents').get().c,
    db_size_kb:        Math.round(fs.statSync(DB_PATH).size / 1024)
  };
  ok(res, { stats });
});

// ════════════════════════════════════════════════════════
//  APP API ROUTES — Data Management (requires api key)
// ════════════════════════════════════════════════════════

// GET /api/app — get current app info
app.get('/api/app', requireApiKey, (req, res) => {
  const collections = db.prepare('SELECT id, name, type, schema_def, created_at FROM nc_collections WHERE app_id = ?').all(req.ncApp.id);
  ok(res, {
    app: {
      id: req.ncApp.id,
      name: req.ncApp.name,
      slug: req.ncApp.slug,
      collections
    }
  });
});

// ── Collections ─────────────────────────────────────────

// GET /api/collections — list collections for this app
app.get('/api/collections', requireApiKey, (req, res) => {
  const cols = db.prepare('SELECT * FROM nc_collections WHERE app_id = ?').all(req.ncApp.id);
  const result = cols.map(c => ({
    ...c,
    schema_def: JSON.parse(c.schema_def || '[]'),
    doc_count: db.prepare('SELECT COUNT(*) as c FROM nc_documents WHERE app_id = ? AND collection = ?').get(req.ncApp.id, c.name).c
  }));
  ok(res, { collections: result });
});

// POST /api/collections — create collection
app.post('/api/collections', requireApiKey, (req, res) => {
  const { name, type = 'collection', schema_def = [] } = req.body;
  if (!name) return err(res, 'name is required');
  const existing = db.prepare('SELECT id FROM nc_collections WHERE app_id = ? AND name = ?').get(req.ncApp.id, name);
  if (existing) return err(res, 'Collection already exists');
  const id = uuidv4();
  db.prepare(`INSERT INTO nc_collections (id, app_id, name, type, schema_def) VALUES (?, ?, ?, ?, ?)`)
    .run(id, req.ncApp.id, name, type, JSON.stringify(schema_def));
  ok(res, { collection: db.prepare('SELECT * FROM nc_collections WHERE id = ?').get(id) }, 201);
});

// DELETE /api/collections/:name — delete collection and all docs
app.delete('/api/collections/:name', requireApiKey, (req, res) => {
  db.prepare('DELETE FROM nc_collections WHERE app_id = ? AND name = ?').run(req.ncApp.id, req.params.name);
  db.prepare('DELETE FROM nc_documents WHERE app_id = ? AND collection = ?').run(req.ncApp.id, req.params.name);
  ok(res, { message: 'Collection deleted' });
});

// ── Documents (CRUD) ────────────────────────────────────

// GET /api/:collection — list / query documents
app.get('/api/:collection', requireApiKey, (req, res) => {
  const { collection } = req.params;
  const {
    limit  = 100,
    offset = 0,
    sort   = 'created_at',
    order  = 'desc',
    search = '',
    ...filters
  } = req.query;

  let docs = db.prepare(
    'SELECT * FROM nc_documents WHERE app_id = ? AND collection = ? ORDER BY created_at ' +
    (order.toLowerCase() === 'asc' ? 'ASC' : 'DESC') +
    ' LIMIT ? OFFSET ?'
  ).all(req.ncApp.id, collection, parseInt(limit), parseInt(offset));

  // Parse JSON data
  let results = docs.map(d => ({ _id: d.id, _created_at: d.created_at, _updated_at: d.updated_at, ...JSON.parse(d.data) }));

  // Client-side filtering (flexible JSON)
  if (search) {
    const q = search.toLowerCase();
    results = results.filter(r => JSON.stringify(r).toLowerCase().includes(q));
  }
  // Field filters e.g. ?status=active
  Object.keys(filters).forEach(key => {
    if (!key.startsWith('_')) {
      results = results.filter(r => String(r[key]) === String(filters[key]));
    }
  });

  // Sort by field
  if (sort && sort !== 'created_at') {
    results.sort((a, b) => {
      const va = a[sort] ?? ''; const vb = b[sort] ?? '';
      const na = parseFloat(va), nb = parseFloat(vb);
      if (!isNaN(na) && !isNaN(nb)) return order === 'asc' ? na - nb : nb - na;
      return order === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }

  const total = db.prepare('SELECT COUNT(*) as c FROM nc_documents WHERE app_id = ? AND collection = ?').get(req.ncApp.id, collection).c;
  ok(res, { data: results, total, limit: parseInt(limit), offset: parseInt(offset) });
});

// POST /api/:collection — create document
app.post('/api/:collection', requireApiKey, (req, res) => {
  const { collection } = req.params;
  const id = uuidv4();
  const data = { ...req.body };
  delete data._id; delete data._created_at; delete data._updated_at;

  // Auto-create collection if not exists
  const colExists = db.prepare('SELECT id FROM nc_collections WHERE app_id = ? AND name = ?').get(req.ncApp.id, collection);
  if (!colExists) {
    db.prepare('INSERT INTO nc_collections (id, app_id, name, type) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), req.ncApp.id, collection, 'collection');
  }

  db.prepare('INSERT INTO nc_documents (id, app_id, collection, data) VALUES (?, ?, ?, ?)')
    .run(id, req.ncApp.id, collection, JSON.stringify(data));

  const doc = db.prepare('SELECT * FROM nc_documents WHERE id = ?').get(id);
  ok(res, { data: { _id: doc.id, _created_at: doc.created_at, _updated_at: doc.updated_at, ...JSON.parse(doc.data) } }, 201);
});

// GET /api/:collection/:id — get single document
app.get('/api/:collection/:id', requireApiKey, (req, res) => {
  const doc = db.prepare('SELECT * FROM nc_documents WHERE id = ? AND app_id = ? AND collection = ?')
    .get(req.params.id, req.ncApp.id, req.params.collection);
  if (!doc) return err(res, 'Document not found', 404);
  ok(res, { data: { _id: doc.id, _created_at: doc.created_at, _updated_at: doc.updated_at, ...JSON.parse(doc.data) } });
});

// PATCH /api/:collection/:id — partial update
app.patch('/api/:collection/:id', requireApiKey, (req, res) => {
  const doc = db.prepare('SELECT * FROM nc_documents WHERE id = ? AND app_id = ?')
    .get(req.params.id, req.ncApp.id);
  if (!doc) return err(res, 'Document not found', 404);
  const existing = JSON.parse(doc.data);
  const updated  = { ...existing, ...req.body };
  delete updated._id; delete updated._created_at; delete updated._updated_at;
  db.prepare("UPDATE nc_documents SET data = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(updated), doc.id);
  const fresh = db.prepare('SELECT * FROM nc_documents WHERE id = ?').get(doc.id);
  ok(res, { data: { _id: fresh.id, _created_at: fresh.created_at, _updated_at: fresh.updated_at, ...JSON.parse(fresh.data) } });
});

// PUT /api/:collection/:id — full replace
app.put('/api/:collection/:id', requireApiKey, (req, res) => {
  const doc = db.prepare('SELECT * FROM nc_documents WHERE id = ? AND app_id = ?')
    .get(req.params.id, req.ncApp.id);
  if (!doc) return err(res, 'Document not found', 404);
  const data = { ...req.body };
  delete data._id; delete data._created_at; delete data._updated_at;
  db.prepare("UPDATE nc_documents SET data = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(data), doc.id);
  const fresh = db.prepare('SELECT * FROM nc_documents WHERE id = ?').get(doc.id);
  ok(res, { data: { _id: fresh.id, _created_at: fresh.created_at, _updated_at: fresh.updated_at, ...JSON.parse(fresh.data) } });
});

// DELETE /api/:collection/:id — delete document
app.delete('/api/:collection/:id', requireApiKey, (req, res) => {
  const doc = db.prepare('SELECT * FROM nc_documents WHERE id = ? AND app_id = ?')
    .get(req.params.id, req.ncApp.id);
  if (!doc) return err(res, 'Document not found', 404);
  db.prepare('DELETE FROM nc_documents WHERE id = ?').run(doc.id);
  ok(res, { message: 'Document deleted', id: doc.id });
});

// DELETE /api/:collection — delete multiple (with filter)
app.delete('/api/:collection', requireApiKey, (req, res) => {
  const { ids } = req.body; // array of ids
  if (!Array.isArray(ids) || ids.length === 0) return err(res, 'ids array required');
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM nc_documents WHERE app_id = ? AND id IN (${placeholders})`).run(req.ncApp.id, ...ids);
  ok(res, { message: `Deleted ${ids.length} documents` });
});

// ── Bulk Operations ──────────────────────────────────────

// POST /api/:collection/bulk — insert many
app.post('/api/:collection/bulk', requireApiKey, (req, res) => {
  const { collection } = req.params;
  const { data: rows } = req.body;
  if (!Array.isArray(rows)) return err(res, 'data must be an array');

  // Auto-create collection
  const colExists = db.prepare('SELECT id FROM nc_collections WHERE app_id = ? AND name = ?').get(req.ncApp.id, collection);
  if (!colExists) {
    db.prepare('INSERT INTO nc_collections (id, app_id, name, type) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), req.ncApp.id, collection, 'collection');
  }

  const insert = db.prepare('INSERT INTO nc_documents (id, app_id, collection, data) VALUES (?, ?, ?, ?)');
  const insertMany = db.transaction((items) => {
    const ids = [];
    for (const item of items) {
      const id = uuidv4();
      const d = { ...item }; delete d._id;
      insert.run(id, req.ncApp.id, collection, JSON.stringify(d));
      ids.push(id);
    }
    return ids;
  });

  const ids = insertMany(rows);
  ok(res, { inserted: ids.length, ids }, 201);
});

// ── Health / Root ────────────────────────────────────────
app.get('/', (_, res) => {
  res.json({
    name: 'NitinCloud API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      admin: 'Requires x-master-key header',
      api:   'Requires x-api-key header'
    },
    docs: 'See README.md for full API reference'
  });
});

app.get('/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// 404
app.use((req, res) => err(res, `Route ${req.method} ${req.path} not found`, 404));

// Start
app.listen(PORT, () => {
  console.log(`\n🚀 NitinCloud API running on port ${PORT}`);
  console.log(`🔑 Master key: ${MASTER_KEY}`);
  console.log(`💾 Database: ${DB_PATH}\n`);
});
  
