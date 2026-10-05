/*
 * Pilote Stocks — serveur autonome (prototype)
 * Aucune dépendance : nécessite seulement Node.js 18 ou plus récent.
 *
 *   node server.js                      démarre sur http://localhost:3000
 *   PORT=8080 node server.js            autre port
 *   CODE_ACCES=motdepasse node server.js   demande un code à l'ouverture
 *
 * Les données sont enregistrées dans data/base.json (dossier exclu de Git).
 * Une copie est faite chaque jour dans data/sauvegardes/ (30 jours conservés).
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const CODE = process.env.CODE_ACCES || '';
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const BASE = path.join(DATA_DIR, 'base.json');
const BACKUPS = path.join(DATA_DIR, 'sauvegardes');
const COLLS = ['produits', 'cuves', 'clients', 'fournisseurs', 'commandes', 'cargaisons', 'receptions', 'sorties',
  'jaugeages', 'camions', 'chauffeurs', 'employes', 'paie', 'factures', 'paiements', 'depenses', 'maintenance', 'config'];
// Seuls ces fichiers sont servis : jamais data/, server.js ni les fichiers cachés.
const PUBLIC_FILES = new Set(['/index.html', '/manifest.webmanifest', '/sw.js']);
const ID_OK = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8' };

/* ---------- stockage ---------- */
fs.mkdirSync(BACKUPS, { recursive: true });
let db = {};
function empty() { const o = {}; COLLS.forEach(c => (o[c] = {})); return o; }
function load() {
  try { db = Object.assign(empty(), JSON.parse(fs.readFileSync(BASE, 'utf8'))); }
  catch (e) { if (e.code !== 'ENOENT') { console.error('Fichier de données illisible :', e.message); process.exit(1); } db = empty(); }
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = BASE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, BASE);
    const day = new Date().toISOString().slice(0, 10);
    const bk = path.join(BACKUPS, `base-${day}.json`);
    if (!fs.existsSync(bk)) {
      fs.copyFileSync(BASE, bk);
      fs.readdirSync(BACKUPS).filter(f => f.startsWith('base-')).sort().slice(0, -30).forEach(f => fs.unlinkSync(path.join(BACKUPS, f)));
    }
  }, 150);
}
load();

/* ---------- temps réel (Server-Sent Events) ---------- */
const clients = new Set();
function send(res, msg) { res.write(`data: ${JSON.stringify(msg)}\n\n`); }
function broadcast(msg) { for (const res of clients) send(res, msg); }
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000);

/* ---------- outils HTTP ---------- */
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }
function body(req, limit) {
  return new Promise((ok, ko) => {
    let n = 0; const parts = [];
    req.on('data', c => { n += c.length; if (n > limit) { ko(new Error('trop volumineux')); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch (e) { ko(e); } });
    req.on('error', ko);
  });
}
function authorized(req) {
  if (!CODE) return true;
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const pass = Buffer.from(h.slice(6), 'base64').toString('utf8').split(':').slice(1).join(':');
  return pass === CODE;
}

/* ---------- serveur ---------- */
const server = http.createServer(async (req, res) => {
  if (!authorized(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Pilote Stocks", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Code d\'accès requis.');
  }
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  try {
    if (p === '/api/ping') return json(res, 200, { ok: true, mode: 'serveur' });
    if (p === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      send(res, { type: 'full', data: db });
      clients.add(res); req.on('close', () => clients.delete(res));
      return;
    }
    if (p === '/api/export' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Content-Disposition': `attachment; filename="pilote-stocks-sauvegarde-${new Date().toISOString().slice(0, 10)}.json"` });
      return res.end(JSON.stringify(db, null, 1));
    }
    if (p === '/api/import' && req.method === 'POST') {
      const b = await body(req, 20 * 1024 * 1024);
      const next = empty();
      for (const c of COLLS) for (const [id, d] of Object.entries((b.data || {})[c] || {})) if (ID_OK.test(id) && d && typeof d === 'object' && !Array.isArray(d)) next[c][id] = d;
      db = b.mode === 'merge' ? (() => { const m = empty(); COLLS.forEach(c => (m[c] = Object.assign({}, db[c], next[c]))); return m; })() : next;
      save(); broadcast({ type: 'full', data: db });
      return json(res, 200, { ok: true, total: COLLS.reduce((a, c) => a + Object.keys(db[c]).length, 0) });
    }
    const m = p.match(/^\/api\/([a-z]+)\/([^/]+)$/);
    if (m) {
      const [, c, id] = m;
      if (!COLLS.includes(c) || !ID_OK.test(id)) return json(res, 400, { error: 'chemin invalide' });
      if (req.method === 'PUT') {
        const d = await body(req, 256 * 1024);
        if (!d || typeof d !== 'object' || Array.isArray(d)) return json(res, 400, { error: 'document invalide' });
        db[c][id] = d; save(); broadcast({ type: 'doc', coll: c, id, doc: d });
        return json(res, 200, { ok: true });
      }
      if (req.method === 'DELETE') {
        delete db[c][id]; save(); broadcast({ type: 'doc', coll: c, id, doc: null });
        return json(res, 200, { ok: true });
      }
      return json(res, 405, { error: 'méthode non autorisée' });
    }
    if (p.startsWith('/api/')) return json(res, 404, { error: 'inconnu' });
    // fichiers statiques (liste blanche)
    const rel = p === '/' ? '/index.html' : p;
    const okPath = PUBLIC_FILES.has(rel) || (rel.startsWith('/assets/') && !rel.includes('..') && !/\/\./.test(rel));
    if (!okPath) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Introuvable'); }
    const f = path.join(ROOT, rel);
    fs.stat(f, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Introuvable'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': /index\.html$|sw\.js$/.test(f) ? 'no-cache' : 'max-age=3600' });
      fs.createReadStream(f).pipe(res);
    });
  } catch (e) {
    json(res, 400, { error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log('\n  Pilote Stocks est démarré.\n');
  console.log(`  Sur ce poste :           http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`  Depuis le réseau local : http://${ip}:${PORT}`));
  console.log(`\n  Données : ${BASE}`);
  console.log(CODE ? '  Accès protégé par un code.' : '  Accès sans code (définissez CODE_ACCES pour en exiger un).');
  console.log('  Pour arrêter : fermez cette fenêtre ou appuyez sur Ctrl+C.\n');
});
process.on('SIGINT', () => { clearTimeout(saveTimer); try { fs.writeFileSync(BASE, JSON.stringify(db)); } catch (e) {} process.exit(0); });
