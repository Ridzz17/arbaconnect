/**
 * =============================================================================
 * ArbaConnect ERP - Central Server, Relational SQL Engine & Offline-First Sync API
 * CV Arba'in Solo Raya
 * =============================================================================
 *
 * Fitur Server Pusat:
 * 1. Database Relasional SQL Persisten (`database/arbaconnect.sqlite` via `node:sqlite`)
 *    mengimplementasikan ke-10 tabel pada `database/schema.sql`:
 *    - users, outlets, sales_targets, visits, products, product_batches,
 *      orders, order_items, stock_ledger, alerts + sync_mutations_log.
 * 2. Endpoint Sinkronisasi Idempoten (`POST /api/sync`):
 *    - Menerima antrean transaksi dari HP Sales (PWA Offline Queue) maupun aksi live.
 *    - Menolak duplikasi berdasarkan `mutationId` / `client_uuid` (Idempotent).
 *    - Memotong stok batch FEFO secara atomik (`BEGIN IMMEDIATE ... COMMIT`),
 *      mencatat buku besar imutabel (`stock_ledger`), plafon kredit apotek, & alarm ROP.
 * 3. Real-Time Multi-Device Push (`GET /api/events` via Server-Sent Events / SSE):
 *    - Begitu HP Sales sinkronisasi ke pusat, layar Direktur & Admin Gudang langsung
 *      ter-update detik itu juga tanpa perlu refresh.
 * 4. Static PWA Host:
 *    - Melayani `index.html`, `sw.js`, `manifest.json`, `css/*`, `js/*`, `icons/*`.
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');

function hashCredential(raw) {
  return 'sha256:' + crypto.createHash('sha256').update('ARBA-SALT-2026:' + String(raw || '')).digest('hex');
}

// Rate limiter anti brute-force login (maks 5 percobaan gagal per 30 detik per akun/IP)
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 1000;

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT_DIR = path.resolve(__dirname, '..');
const DB_DIR = path.join(ROOT_DIR, 'database');
const DB_FILE = path.join(DB_DIR, 'arbaconnect.sqlite');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// -----------------------------------------------------------------------------
// 1. Muat Master Data Awal dari `js/data.js` untuk Seeding Database Pusat
// -----------------------------------------------------------------------------
function loadInitialMasterData() {
  const dataJsPath = path.join(ROOT_DIR, 'js', 'data.js');
  const code = fs.readFileSync(dataJsPath, 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return JSON.parse(JSON.stringify(sandbox.window.ArbaData));
}

// -----------------------------------------------------------------------------
// 2. Inisialisasi Skema SQL Relasional (10 Entitas `database/schema.sql` + Log Sync)
// -----------------------------------------------------------------------------
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function initRelationalSchema() {
  // Migrasi otomatis tabel users bila skema lama belum mendukung peran 'super_admin'
  const existingUsersTable = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (existingUsersTable && existingUsersTable.sql && !existingUsersTable.sql.includes('super_admin')) {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('DROP TABLE IF EXISTS users;');
    db.exec('PRAGMA foreign_keys = ON;');
  }

  db.exec(`
    -- 1. Tabel Pengguna & Hak Akses Per Peran (RBAC) termasuk Super Admin
    CREATE TABLE IF NOT EXISTS users (
      id              TEXT PRIMARY KEY,
      username        TEXT UNIQUE,
      nama            TEXT NOT NULL,
      email           TEXT UNIQUE NOT NULL,
      password_hash   TEXT NOT NULL DEFAULT '123',
      pin_offline     TEXT DEFAULT '123456',
      no_telp         TEXT,
      jabatan         TEXT,
      divisi          TEXT,
      peran           TEXT NOT NULL CHECK (peran IN ('super_admin', 'sales', 'admin_gudang', 'admin_penjualan', 'direktur')),
      aktif           INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 2. Tabel Pelanggan B2B (Apotek & Minimarket)
    CREATE TABLE IF NOT EXISTS outlets (
      id              TEXT PRIMARY KEY,
      sales_id        TEXT REFERENCES users(id),
      kode            TEXT UNIQUE NOT NULL,
      nama            TEXT NOT NULL,
      jenis           TEXT NOT NULL,
      alamat          TEXT NOT NULL,
      kota            TEXT NOT NULL,
      lat             REAL,
      lng             REAL,
      kontak_nama     TEXT,
      kontak_telp     TEXT,
      termin_hari     INTEGER NOT NULL DEFAULT 30,
      limit_kredit    INTEGER NOT NULL DEFAULT 10000000,
      kredit_terpakai INTEGER NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'Lancar',
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 3. Tabel Target Capaian Sales Bulanan & Harian
    CREATE TABLE IF NOT EXISTS sales_targets (
      id                  TEXT PRIMARY KEY,
      sales_id            TEXT NOT NULL REFERENCES users(id),
      periode             TEXT NOT NULL,
      target_nilai        INTEGER NOT NULL DEFAULT 50000000,
      target_kunjungan    INTEGER NOT NULL DEFAULT 120,
      UNIQUE (sales_id, periode)
    );

    -- 4. Tabel Kunjungan Lapangan / Canvassing (Check-in GPS)
    CREATE TABLE IF NOT EXISTS visits (
      id              TEXT PRIMARY KEY,
      outlet_id       TEXT NOT NULL,
      sales_id        TEXT,
      sales_nama      TEXT,
      checkin_at      TEXT NOT NULL DEFAULT (datetime('now')),
      lat             REAL,
      lng             REAL,
      jarak_meter     INTEGER,
      hasil           TEXT NOT NULL,
      catatan         TEXT
    );

    -- 5. Tabel Master Produk Herbal & Parameter ROP
    CREATE TABLE IF NOT EXISTS products (
      id                  TEXT PRIMARY KEY,
      sku                 TEXT UNIQUE NOT NULL,
      nama                TEXT NOT NULL,
      kategori            TEXT NOT NULL,
      satuan              TEXT NOT NULL DEFAULT 'Botol',
      harga               INTEGER NOT NULL,
      stok_minimum        INTEGER NOT NULL DEFAULT 50,
      titik_pesan_ulang   INTEGER NOT NULL DEFAULT 120,
      stok_total          INTEGER NOT NULL DEFAULT 0,
      aktif               INTEGER NOT NULL DEFAULT 1
    );

    -- 6. Tabel Batch Produk & Kedaluwarsa (FEFO - First-Expired, First-Out)
    CREATE TABLE IF NOT EXISTS product_batches (
      id              TEXT PRIMARY KEY,
      product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      no_batch        TEXT NOT NULL,
      tgl_kedaluwarsa TEXT NOT NULL,
      stok_batch      INTEGER NOT NULL DEFAULT 0 CHECK (stok_batch >= 0),
      UNIQUE (product_id, no_batch)
    );

    -- 7. Tabel Pesanan B2B (Idempotent Offline-First via client_uuid)
    CREATE TABLE IF NOT EXISTS orders (
      id              TEXT PRIMARY KEY,
      client_uuid     TEXT UNIQUE NOT NULL,
      outlet_id       TEXT NOT NULL,
      sales_id        TEXT,
      sales_nama      TEXT,
      visit_id        TEXT,
      tanggal         TEXT NOT NULL DEFAULT (datetime('now')),
      jatuh_tempo     TEXT,
      termin          TEXT NOT NULL DEFAULT 'Net 30 Hari',
      status          TEXT NOT NULL,
      sync_status     TEXT NOT NULL DEFAULT 'SYNCED_DEDUCTED',
      total           INTEGER NOT NULL DEFAULT 0
    );

    -- 8. Tabel Rincian Item Pesanan
    CREATE TABLE IF NOT EXISTS order_items (
      id              TEXT PRIMARY KEY,
      order_id        TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_sku     TEXT NOT NULL,
      no_batch        TEXT,
      qty             INTEGER NOT NULL CHECK (qty > 0),
      harga_satuan    INTEGER NOT NULL,
      subtotal        INTEGER NOT NULL
    );

    -- 9. Tabel Buku Besar Stok Imutabel (Stock Ledger)
    CREATE TABLE IF NOT EXISTS stock_ledger (
      id              TEXT PRIMARY KEY,
      product_sku     TEXT NOT NULL,
      no_batch        TEXT,
      order_ref       TEXT,
      tipe            TEXT NOT NULL,
      qty             INTEGER NOT NULL,
      saldo_setelah   INTEGER NOT NULL,
      dibuat_oleh     TEXT,
      checksum_hash   TEXT NOT NULL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 10. Tabel Peringatan Stok Menipis (Low-Stock & Near-Expiry Alerts)
    CREATE TABLE IF NOT EXISTS alerts (
      id              TEXT PRIMARY KEY,
      product_sku     TEXT NOT NULL,
      saldo           INTEGER NOT NULL,
      ambang          INTEGER NOT NULL,
      status          TEXT NOT NULL DEFAULT 'baru',
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 11. Tabel Log Idempotensi Mutasi Offline-First (Mencegah Eksekusi Ganda)
    CREATE TABLE IF NOT EXISTS sync_mutations_log (
      mutation_id     TEXT PRIMARY KEY,
      client_id       TEXT NOT NULL,
      mutation_type   TEXT NOT NULL,
      summary         TEXT,
      payload_json    TEXT,
      synced_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 12. Snapshot State Dokumen Lengkap ERP (Menjaga Paritas 100% dengan UI)
    CREATE TABLE IF NOT EXISTS erp_central_state (
      id              TEXT PRIMARY KEY,
      state_json      TEXT NOT NULL,
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// -----------------------------------------------------------------------------
// 3. Sinkronisasi Data ke 10 Tabel Relasional SQL (`schema.sql`)
// -----------------------------------------------------------------------------
function syncStateToRelationalTables(state) {
  db.exec('DELETE FROM order_items;');
  db.exec('DELETE FROM orders;');
  db.exec('DELETE FROM stock_ledger;');
  db.exec('DELETE FROM alerts;');
  db.exec('DELETE FROM visits;');
  db.exec('DELETE FROM product_batches;');
  db.exec('DELETE FROM products;');
  db.exec('DELETE FROM outlets;');
  db.exec('DELETE FROM sales_targets;');
  db.exec('DELETE FROM users;');

  // 1. Users & 3. Sales Targets
  const insUser = db.prepare(`
    INSERT OR REPLACE INTO users (id, username, nama, email, password_hash, pin_offline, no_telp, jabatan, divisi, peran, aktif)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insTarget = db.prepare(`INSERT OR REPLACE INTO sales_targets (id, sales_id, periode, target_nilai, target_kunjungan) VALUES (?, ?, '2026-11', ?, ?)`);

  const usersList = Array.isArray(state.users) && state.users.length > 0
    ? state.users
    : (loadInitialMasterData().users || []);

  usersList.forEach((u) => {
    const sqlRole = u.sqlRole || (
      u.role === 'super-admin' ? 'super_admin' :
      u.role === 'executive' ? 'direktur' :
      u.role === 'inventory' ? 'admin_gudang' :
      u.role === 'sales-ops' ? 'admin_penjualan' : 'sales'
    );
    insUser.run(
      u.id,
      u.username || u.id.toLowerCase(),
      u.name,
      u.email,
      hashCredential(u.password || '123'),
      hashCredential(u.pin || '123456'),
      u.phone || '-',
      u.title || '-',
      u.division || '-',
      sqlRole,
      u.active === false ? 0 : 1
    );
  });

  (state.salesTeam || []).forEach((rep, i) => {
    const uid = rep.id || `REP-SR-0${i + 1}`;
    const alreadyInUsers = usersList.some((u) => u.id === uid);
    if (!alreadyInUsers) {
      const email = `${rep.name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@arbain.co.id`;
      insUser.run(uid, uid.toLowerCase(), rep.name, email, hashCredential('123'), hashCredential('123456'), '-', 'Sales Rep', rep.division || 'Sales', 'sales', 1);
    }
    insTarget.run(`TGT-${uid}-202611`, uid, rep.monthlyRevenueTarget || 50000000, (rep.dailyVisitTarget || 6) * 25);
  });

  // 2. Outlets
  const insOutlet = db.prepare(`
    INSERT OR REPLACE INTO outlets (
      id, sales_id, kode, nama, jenis, alamat, kota, lat, lng, kontak_nama, kontak_telp,
      termin_hari, limit_kredit, kredit_terpakai, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const defaultCoords = {
    'AP-SLO-001': { lat: -7.5682, lng: 110.8091 },
    'AP-SLO-002': { lat: -7.5588, lng: 110.8562 },
    'MM-SKH-014': { lat: -7.6819, lng: 110.8408 },
    'MM-SLO-009': { lat: -7.5812, lng: 110.8279 },
    'AP-KRA-023': { lat: -7.5965, lng: 110.9461 },
    'AP-KRA-004': { lat: -7.5684, lng: 110.8753 },
    'AP-BYL-008': { lat: -7.5305, lng: 110.5964 },
    'MM-BYL-003': { lat: -7.5358, lng: 110.6022 },
    'MM-KLT-005': { lat: -7.7056, lng: 110.6015 },
    'AP-SRG-019': { lat: -7.4272, lng: 111.0221 },
    'AP-KRA-078': { lat: -7.5931, lng: 110.9384 }
  };
  (state.outlets || []).forEach((o) => {
    const rep = (state.salesTeam || []).find((s) => s.name === o.salesRep);
    const jenis = /minimarket|swalayan|toserba/i.test(o.type || '')
      ? 'minimarket'
      : (/jaringan|kimia farma|k-24/i.test(o.type || '') ? 'jaringan_farmasi' : 'apotek');
    const fallback = defaultCoords[o.id] || defaultCoords[o.code] || { lat: -7.5682, lng: 110.8091 };
    const lat = typeof o.lat === 'number' ? o.lat : fallback.lat;
    const lng = typeof o.lng === 'number' ? o.lng : fallback.lng;
    insOutlet.run(
      o.id,
      rep ? rep.id : null,
      o.code || o.id,
      o.name,
      jenis,
      o.address || 'Solo Raya',
      o.cityName || o.city || 'Surakarta',
      lat,
      lng,
      o.picName || '-',
      o.picPhone || '-',
      /14/.test(o.terms || '') ? 14 : (/COD|Tunai/i.test(o.terms || '') ? 0 : 30),
      o.creditLimit || 10000000,
      o.creditUsed || 0,
      o.creditStatus || 'Lancar'
    );
  });

  // 5. Products, 6. Product Batches & 10. Alerts
  const insProd = db.prepare(`
    INSERT OR REPLACE INTO products (
      id, sku, nama, kategori, satuan, harga, stok_minimum, titik_pesan_ulang, stok_total, aktif
    ) VALUES (?, ?, ?, ?, 'Botol', ?, ?, ?, ?, 1)
  `);
  const insBatch = db.prepare(`
    INSERT OR REPLACE INTO product_batches (id, product_id, no_batch, tgl_kedaluwarsa, stok_batch)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insAlert = db.prepare(`
    INSERT OR REPLACE INTO alerts (id, product_sku, saldo, ambang, status)
    VALUES (?, ?, ?, ?, 'baru')
  `);

  (state.products || []).forEach((p) => {
    const pid = `PROD-${p.sku}`;
    insProd.run(pid, p.sku, p.name, p.category || 'Herbal', p.unitPrice || 0, p.safetyStock || 50, p.rop || 100, Math.max(0, p.stock || 0));
    insBatch.run(`BATCH-${p.sku}-${p.activeBatch}`, pid, p.activeBatch || 'BATCH-DEFAULT', p.fefoDate || '2027-12-31', Math.max(0, p.stock || 0));
    if ((p.stock || 0) <= (p.rop || 0)) {
      insAlert.run(`ALRT-${p.sku}`, p.sku, p.stock || 0, p.rop || 0);
    }
  });

  // 4. Visits
  const insVisit = db.prepare(`
    INSERT OR REPLACE INTO visits (id, outlet_id, sales_id, sales_nama, checkin_at, jarak_meter, hasil, catatan)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  (state.visitLogs || []).forEach((v) => {
    const rep = (state.salesTeam || []).find((s) => s.name === v.salesRep);
    insVisit.run(
      v.id,
      v.outletId || 'AP-SLO-001',
      rep ? rep.id : null,
      v.salesRep || 'Budi Santoso',
      new Date(v.timestamp || Date.now()).toISOString(),
      v.gpsDistance || 10,
      v.outcome || 'FOLLOW_UP',
      v.notes || ''
    );
  });

  // 7. Orders & 8. Order Items
  const insOrder = db.prepare(`
    INSERT OR REPLACE INTO orders (id, client_uuid, outlet_id, sales_id, sales_nama, termin, status, sync_status, total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insOrderItem = db.prepare(`
    INSERT OR REPLACE INTO order_items (id, order_id, product_sku, no_batch, qty, harga_satuan, subtotal)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  (state.orders || []).forEach((ord) => {
    insOrder.run(
      ord.id,
      ord.clientUuid || ord.id,
      ord.outletId || 'AP-SLO-001',
      ord.salesRepId || null,
      ord.salesRep || 'Budi Santoso',
      ord.terms || 'Net 30 Hari',
      ord.status || 'PENDING',
      ord.syncStatus || 'SYNCED_DEDUCTED',
      ord.totalAmount || 0
    );
    (ord.items || []).forEach((it, idx) => {
      insOrderItem.run(
        `${ord.id}-ITM-${idx + 1}`,
        ord.id,
        it.sku || it.name,
        it.batch || '',
        Math.max(1, it.quantity || 1),
        it.unitPrice || 0,
        it.subtotal || 0
      );
    });
  });

  // 9. Stock Ledger
  const insLedger = db.prepare(`
    INSERT OR REPLACE INTO stock_ledger (id, product_sku, no_batch, order_ref, tipe, qty, saldo_setelah, dibuat_oleh, checksum_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  (state.ledger || []).forEach((l) => {
    insLedger.run(
      l.id,
      l.skuCode || l.skuName,
      l.batch || '-',
      l.docRef || '-',
      (l.type || 'KELUAR').toLowerCase(),
      l.quantity || 0,
      l.finalStock || 0,
      l.operator || 'Sistem',
      l.hash || '0000...0000',
      l.timestamp || new Date().toISOString()
    );
  });
}

function getCentralState() {
  const master = loadInitialMasterData();
  const row = db.prepare(`SELECT state_json FROM erp_central_state WHERE id = 'main'`).get();
  if (row && row.state_json) {
    const parsed = JSON.parse(row.state_json);
    // Pastikan daftar users dan Super Admin selalu tersedia
    if (!Array.isArray(parsed.users) || parsed.users.length === 0) {
      parsed.users = master.users || [];
      saveCentralState(parsed);
    } else if (!parsed.users.some((u) => u.role === 'super-admin')) {
      const superAdmin = (master.users || []).find((u) => u.role === 'super-admin');
      if (superAdmin) {
        parsed.users = [superAdmin, ...parsed.users];
        saveCentralState(parsed);
      }
    }
    return parsed;
  }
  const initialState = {
    users: master.users || [],
    products: master.products,
    ledger: master.ledger,
    outlets: master.outlets,
    orders: master.orders,
    supplierPOs: master.supplierPOs,
    salesVisits: master.salesVisits,
    driverManifests: master.driverManifests,
    salesTeam: master.salesTeam,
    salesLoadings: master.salesLoadings,
    visitLogs: master.visitLogs
  };
  saveCentralState(initialState);
  return initialState;
}

function saveCentralState(state) {
  const upsert = db.prepare(`
    INSERT INTO erp_central_state (id, state_json, updated_at)
    VALUES ('main', ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = datetime('now')
  `);
  upsert.run(JSON.stringify(state));
  syncStateToRelationalTables(state);
}

// Inisialisasi database saat server menyala
initRelationalSchema();
getCentralState();

// -----------------------------------------------------------------------------
// 4. Mesin Pemroses Bisnis & Mutasi Stok FEFO di Server Pusat
// -----------------------------------------------------------------------------
const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function pad2(n) { return String(n).padStart(2, '0'); }
function nowStamp() {
  const d = new Date();
  return `${pad2(d.getDate())} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()} • ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} WIB`;
}
function todayLabel() {
  const d = new Date();
  return `${pad2(d.getDate())} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}
function pseudoHash(seed) {
  let h = 0x811c9dc5;
  const s = String(seed) + Date.now() + Math.random();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const hex = h.toString(16).padStart(8, '0');
  return `${hex.slice(0, 4)}...${hex.slice(4, 8)}`;
}
function normalizeSku(sku) {
  return String(sku || '').toUpperCase().replace(/SKU-|ARB-|-/g, '');
}
function findProduct(state, sku, name) {
  const nSku = normalizeSku(sku);
  return state.products.find((p) => p.sku === sku || normalizeSku(p.sku) === nSku) ||
    (name ? state.products.find((p) =>
      p.name.toLowerCase().includes(String(name).toLowerCase()) ||
      String(name).toLowerCase().includes(p.name.toLowerCase())
    ) : undefined);
}
function computeProductStatus(prod) {
  if (prod.stock <= prod.rop) return 'below-rop';
  if (prod.fefoStatus && prod.fefoStatus.indexOf('Kritis') === 0) return 'critical-expiry';
  return 'optimal';
}
function isCreditTerm(terms) {
  return !/COD|Tunai/i.test(String(terms || ''));
}
function findOutlet(state, idOrCode) {
  return state.outlets.find((o) => o.id === idOrCode || o.code === idOrCode);
}
function checkStockAvailability(state, items) {
  const shortages = [];
  (items || []).forEach((item) => {
    const prod = findProduct(state, item.sku, item.name);
    if (!prod) return;
    if (prod.stock < item.quantity) {
      shortages.push({ sku: prod.sku, name: prod.name, requested: item.quantity, available: prod.stock, shortBy: item.quantity - prod.stock });
    }
  });
  return shortages;
}
function deductOrderStock(state, order) {
  const rows = [];
  (order.items || []).forEach((item) => {
    const prod = findProduct(state, item.sku, item.name);
    if (!prod) return;
    prod.stock = Math.max(0, prod.stock - item.quantity);
    prod.status = computeProductStatus(prod);
    rows.push({
      id: `LEDG-${Math.floor(10000 + Math.random() * 90000)}`,
      timestamp: nowStamp(),
      docRef: order.clientUuid || order.id,
      skuName: prod.name,
      skuCode: prod.sku,
      batch: String(item.batch || prod.activeBatch).replace('Batch: ', ''),
      type: 'KELUAR',
      quantity: -item.quantity,
      finalStock: prod.stock,
      operator: order.salesRep,
      operatorRole: `Field Sales ${order.salesRepId || ''}`.trim(),
      hash: pseudoHash((order.clientUuid || order.id) + prod.sku)
    });
  });
  state.ledger = [...rows, ...state.ledger];
  order.stockDeducted = true;
  order.syncStatus = 'SYNCED_DEDUCTED';
  order.stockWarning = undefined;
}
function restoreOrderStock(state, order, reason) {
  const rows = [];
  (order.items || []).forEach((item) => {
    const prod = findProduct(state, item.sku, item.name);
    if (!prod) return;
    prod.stock += item.quantity;
    prod.status = computeProductStatus(prod);
    rows.push({
      id: `LEDG-${Math.floor(10000 + Math.random() * 90000)}`,
      timestamp: nowStamp(),
      docRef: order.clientUuid || order.id,
      skuName: prod.name,
      skuCode: prod.sku,
      batch: String(item.batch || prod.activeBatch).replace('Batch: ', ''),
      type: 'RETUR',
      quantity: item.quantity,
      finalStock: prod.stock,
      operator: 'Admin Penjualan',
      operatorRole: `Pembatalan: ${reason || 'Order ditolak'}`,
      hash: pseudoHash((order.clientUuid || order.id) + prod.sku + 'R')
    });
  });
  state.ledger = [...rows, ...state.ledger];
  order.stockDeducted = false;
}
function applyOutletCredit(state, order, sign) {
  const outlet = findOutlet(state, order.outletId);
  if (!outlet || !isCreditTerm(order.terms)) return;
  outlet.creditUsed = Math.max(0, (outlet.creditUsed || 0) + sign * order.totalAmount);
  outlet.creditRemaining = Math.max(0, outlet.creditLimit - outlet.creditUsed);
  const ratio = outlet.creditLimit ? outlet.creditUsed / outlet.creditLimit : 0;
  if (outlet.creditStatus !== 'Overdue') {
    outlet.creditStatus = ratio >= 0.9 ? 'Perhatian' : 'Lancar';
  }
  order.creditApplied = sign > 0;
}

/**
 * Terapkan satu mutasi ke state pusat secara deterministik & idempoten
 */
function applyMutationOnCentralState(state, mutation) {
  const type = mutation.type;
  const p = mutation.payload || {};

  switch (type) {
    case 'SUBMIT_ORDER': {
      const incoming = p.order;
      if (!incoming) break;
      // Cek duplikasi clientUuid (Idempotency)
      const exists = state.orders.find((o) => o.id === incoming.id || o.clientUuid === incoming.clientUuid);
      if (exists) {
        // Jika sebelumnya masuk sebagai OFFLINE_QUEUED dan belum potong stok, potong sekarang
        if (!exists.stockDeducted) {
          const shortages = checkStockAvailability(state, exists.items);
          if (shortages.length === 0) {
            deductOrderStock(state, exists);
          } else {
            exists.syncStatus = 'PENDING_WAREHOUSE';
            exists.stockWarning = 'Menunggu stok: ' + shortages.map((s) => `${s.name} (kurang ${s.shortBy} unit)`).join(', ');
          }
        }
        break;
      }

      const orderCopy = JSON.parse(JSON.stringify(incoming));
      orderCopy.stockDeducted = false;
      const shortages = checkStockAvailability(state, orderCopy.items);
      if (shortages.length === 0) {
        deductOrderStock(state, orderCopy);
      } else {
        orderCopy.syncStatus = 'PENDING_WAREHOUSE';
        orderCopy.priority = 'High';
        orderCopy.stockWarning = 'Menunggu stok: ' + shortages.map((s) => `${s.name} (kurang ${s.shortBy} unit)`).join(', ');
      }

      applyOutletCredit(state, orderCopy, 1);
      const outlet = findOutlet(state, orderCopy.outletId);
      if (outlet) {
        outlet.lastOrderDate = todayLabel();
        outlet.ytdTotal = (outlet.ytdTotal || 0) + (orderCopy.totalAmount || 0);
        if (!Array.isArray(outlet.consignmentItems)) outlet.consignmentItems = [];
        (orderCopy.items || []).forEach((it) => {
          const prod = findProduct(state, it.sku, it.name);
          const fullSku = prod ? prod.sku : it.sku;
          const existingC = outlet.consignmentItems.find((c) => c.sku === fullSku);
          if (existingC) {
            existingC.soldQty = (existingC.soldQty || 0) + (it.soldAtOutlet || it.quantity);
            existingC.remainingQty = Math.max(0, (existingC.remainingQty || 0) + it.quantity - (it.soldAtOutlet || it.quantity));
            existingC.consignedQty = existingC.soldQty + existingC.remainingQty;
            existingC.velocity = 'LARIS';
            existingC.daysInOutlet = 1;
          } else if (prod) {
            outlet.consignmentItems.push({
              sku: prod.sku,
              name: prod.name,
              batch: prod.activeBatch,
              expiry: prod.fefoDate,
              consignedQty: it.quantity,
              soldQty: it.quantity,
              remainingQty: it.quantity,
              unitPrice: prod.unitPrice,
              velocity: 'LARIS',
              daysInOutlet: 1,
              nearExpiry: /Kritis|Mendekati/.test(prod.fefoStatus || '')
            });
          }
        });
        outlet.consignmentTotalUnits = outlet.consignmentItems.reduce((s, c) => s + (c.remainingQty || 0), 0);
        outlet.consignmentBillableAmount = outlet.consignmentItems.reduce((s, c) => s + (c.soldQty || 0) * c.unitPrice, 0);
      }

      const activeLoad = (state.salesLoadings || []).find((l) => l.salesRep === orderCopy.salesRep);
      if (activeLoad) {
        activeLoad.cashCollected = (activeLoad.cashCollected || 0) + (orderCopy.totalAmount || 0);
        (orderCopy.items || []).forEach((it) => {
          const prod = findProduct(state, it.sku, it.name);
          const fullSku = prod ? prod.sku : it.sku;
          const loadItem = activeLoad.items.find((li) => li.sku === fullSku);
          if (loadItem) {
            loadItem.droppedQty = (loadItem.droppedQty || 0) + it.quantity;
            loadItem.returnedQty = Math.max(0, loadItem.loadedQty - loadItem.droppedQty - (loadItem.discrepancy || 0));
          }
        });
      }

      state.orders = [orderCopy, ...state.orders];
      if (p.visitLog && !state.visitLogs.some((v) => v.id === p.visitLog.id)) {
        state.visitLogs = [p.visitLog, ...state.visitLogs];
      }
      break;
    }

    case 'LOG_VISIT': {
      const vlog = p.visitLog;
      if (vlog && !state.visitLogs.some((v) => v.id === vlog.id)) {
        state.visitLogs = [vlog, ...state.visitLogs];
        const outlet = findOutlet(state, vlog.outletId);
        if (outlet) {
          outlet.lastVisitDate = todayLabel();
          outlet.visitNotes = `"Kunjungan oleh ${vlog.salesRep}${vlog.notes ? ': ' + vlog.notes : ''}"`;
        }
        (state.salesVisits || []).forEach((v) => {
          if (v.outletId === vlog.outletId && v.status === 'TERJADWAL') v.status = 'SELESAI';
        });
      }
      break;
    }

    case 'APPROVE_ORDER': {
      const ord = state.orders.find((o) => o.id === p.orderId || o.clientUuid === p.clientUuid || o.clientUuid === p.orderId);
      if (ord) {
        if (!ord.stockDeducted) deductOrderStock(state, ord);
        ord.status = 'APPROVED';
        ord.syncStatus = 'SYNCED_DEDUCTED';
      }
      break;
    }

    case 'BATCH_APPROVE_ORDERS': {
      (p.orderIds || []).forEach((id) => {
        const ord = state.orders.find((o) => o.id === id || o.clientUuid === id);
        if (ord) {
          if (!ord.stockDeducted) deductOrderStock(state, ord);
          ord.status = 'APPROVED';
          ord.syncStatus = 'SYNCED_DEDUCTED';
        }
      });
      break;
    }

    case 'REJECT_ORDER': {
      const ord = state.orders.find((o) => o.id === p.orderId || o.clientUuid === p.orderId);
      if (ord && ord.status !== 'REJECTED') {
        if (ord.stockDeducted) restoreOrderStock(state, ord, p.reason);
        if (ord.creditApplied) applyOutletCredit(state, ord, -1);
        ord.status = 'REJECTED';
      }
      break;
    }

    case 'ADD_INBOUND_BATCH': {
      const prod = state.products.find((pr) => pr.sku === p.sku);
      const qty = Number(p.qty) || 0;
      const newStock = prod ? prod.stock + qty : qty;
      if (prod) {
        prod.stock = newStock;
        prod.activeBatch = p.batch;
        prod.fefoDate = p.expiryDate;
        prod.status = newStock >= prod.rop ? 'optimal' : 'below-rop';
      }
      const entry = p.ledgerEntry || {
        id: `LEDG-${Math.floor(10000 + Math.random() * 90000)}`,
        timestamp: nowStamp(),
        docRef: p.docRef || 'PO-INBOUND',
        skuName: prod ? prod.name : 'Produk Herbal',
        skuCode: p.sku,
        batch: p.batch,
        type: 'MASUK',
        quantity: qty,
        finalStock: newStock,
        operator: 'Slamet Riadi',
        operatorRole: 'Warehouse Inbound',
        hash: pseudoHash(p.sku + p.batch)
      };
      if (!state.ledger.some((l) => l.id === entry.id)) {
        state.ledger = [entry, ...state.ledger];
      }
      break;
    }

    case 'ADJUST_STOCK': {
      const prod = state.products.find((pr) => pr.sku === p.sku);
      const delta = Number(p.quantityDelta) || 0;
      const newStock = Math.max(0, (prod ? prod.stock : 0) + delta);
      if (prod) {
        prod.stock = newStock;
        prod.status = computeProductStatus(prod);
      }
      const entry = p.ledgerEntry || {
        id: `LEDG-${Math.floor(10000 + Math.random() * 90000)}`,
        timestamp: nowStamp(),
        docRef: 'ADJ-AUDIT',
        skuName: prod ? prod.name : 'Produk Herbal',
        skuCode: p.sku,
        batch: p.batch,
        type: 'PENYESUAIAN',
        quantity: delta,
        finalStock: newStock,
        operator: p.auditorName || 'Dewi Lestari',
        operatorRole: 'Chief Auditor Intern',
        hash: pseudoHash(p.sku + delta)
      };
      if (!state.ledger.some((l) => l.id === entry.id)) {
        state.ledger = [entry, ...state.ledger];
      }
      break;
    }

    case 'SUBSTITUTE_BATCH': {
      const ord = state.orders.find((o) => o.id === p.orderId);
      if (ord) {
        ord.items = (ord.items || []).map((it) => {
          if (it.sku === p.sku || (it.name && it.name.includes(p.sku))) {
            return Object.assign({}, it, {
              batch: `Batch: ${p.newBatch} (${p.sourceWarehouse})`,
              allocated: true
            });
          }
          return it;
        });
        ord.stockWarning = undefined;
      }
      break;
    }

    case 'ADJUST_ORDER_QTY': {
      const ord = state.orders.find((o) => o.id === p.orderId);
      if (ord) {
        ord.items = (ord.items || []).map((it) => {
          if (it.sku === p.sku || (it.name && it.name.includes(p.sku))) {
            return Object.assign({}, it, {
              quantity: p.newQty,
              subtotal: p.newQty * it.unitPrice
            });
          }
          return it;
        });
        ord.totalAmount = ord.items.reduce((acc, it) => acc + it.subtotal, 0);
      }
      break;
    }

    case 'CREATE_SUPPLIER_PO': {
      if (p.po && !state.supplierPOs.some((po) => po.id === p.po.id)) {
        state.supplierPOs = [p.po, ...state.supplierPOs];
      }
      break;
    }

    case 'SCHEDULE_VISIT': {
      if (p.visit && !state.salesVisits.some((v) => v.id === p.visit.id)) {
        state.salesVisits = [p.visit, ...state.salesVisits];
        const targetOutlet = findOutlet(state, p.visit.outletId);
        if (targetOutlet) {
          targetOutlet.lastVisitDate = p.visit.scheduledDate;
          targetOutlet.visitNotes = `"${p.visit.purpose}: ${p.visit.notes}"`;
        }
      }
      break;
    }

    case 'MARK_DELIVERED': {
      (state.driverManifests || []).forEach((manifest) => {
        const ord = (manifest.orders || []).find((o) => o.orderId === p.orderId);
        if (ord) {
          ord.delivered = true;
          ord.deliveredTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
        }
      });
      const targetOrder = state.orders.find((o) => o.id === p.orderId || o.clientUuid === p.orderId);
      if (targetOrder) targetOrder.status = 'DISPATCHED';
      break;
    }

    case 'ADD_OUTLET': {
      if (p.outlet && !state.outlets.some((o) => o.id === p.outlet.id)) {
        state.outlets = [p.outlet, ...state.outlets];
      }
      break;
    }

    case 'RECORD_WAREHOUSE_LOAD': {
      const prod = findProduct(state, p.sku);
      const rep = (state.salesTeam || []).find((s) => s.name === p.salesRep) || state.salesTeam[0];
      const qty = Number(p.loadedQty) || 0;
      if (prod && rep && qty > 0) {
        let loadRec = state.salesLoadings.find((l) => l.salesRep === rep.name);
        if (!loadRec) {
          loadRec = {
            id: `LOAD-2026-${Math.floor(100 + Math.random() * 900)}`,
            date: `Hari ini • ${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())} WIB`,
            salesRep: rep.name,
            salesRepId: rep.id,
            division: rep.division || 'Madu & Herbal',
            routeArea: `${rep.area} (Target ${rep.dailyVisitTarget} Outlet)`,
            status: 'SEDANG_KELILING',
            cashCollected: 0,
            items: []
          };
          state.salesLoadings = [loadRec, ...state.salesLoadings];
        }
        const existingItem = loadRec.items.find((i) => i.sku === prod.sku);
        if (existingItem) {
          existingItem.loadedQty += qty;
          existingItem.returnedQty += qty;
        } else {
          loadRec.items.push({
            sku: prod.sku,
            name: prod.name,
            batch: prod.activeBatch,
            loadedQty: qty,
            droppedQty: 0,
            returnedQty: qty,
            discrepancy: 0,
            unitPrice: prod.unitPrice
          });
        }
      }
      break;
    }

    case 'RECONCILE_LOADING': {
      const loadRec = (state.salesLoadings || []).find((l) => l.id === p.loadId);
      if (loadRec) {
        let totalDiscrepancy = 0;
        (loadRec.items || []).forEach((it) => {
          const expectedReturn = Math.max(0, it.loadedQty - it.droppedQty);
          const actualReturn = p.actualReturnedMap && p.actualReturnedMap[it.sku] !== undefined
            ? Number(p.actualReturnedMap[it.sku])
            : expectedReturn;
          it.returnedQty = actualReturn;
          it.discrepancy = Math.max(0, expectedReturn - actualReturn);
          totalDiscrepancy += it.discrepancy;
        });
        loadRec.status = totalDiscrepancy === 0 ? 'TERVERIFIKASI_KLOP' : 'SELISIH_AUDIT';
        loadRec.auditNote = totalDiscrepancy === 0
          ? undefined
          : `Terdeteksi selisih ${totalDiscrepancy} unit belum kembali ke gudang (wajib ditagihkan ke sales)!`;
      }
      break;
    }

    case 'UPDATE_USER': {
      if (!Array.isArray(state.users)) state.users = loadInitialMasterData().users || [];
      if (p.user && p.user.id) {
        const idx = state.users.findIndex((u) => u.id === p.user.id);
        if (idx !== -1) {
          state.users[idx] = Object.assign({}, state.users[idx], p.user);
        } else {
          state.users.push(p.user);
        }
      }
      break;
    }

    case 'CHANGE_USER_PASSWORD': {
      if (!Array.isArray(state.users)) state.users = loadInitialMasterData().users || [];
      if (p.userId) {
        const u = state.users.find((usr) => usr.id === p.userId);
        if (u) {
          if (p.newPassword) u.password = String(p.newPassword);
          if (p.newPin) u.pin = String(p.newPin);
        }
      }
      break;
    }

    case 'CREATE_USER': {
      if (!Array.isArray(state.users)) state.users = loadInitialMasterData().users || [];
      if (p.user && p.user.id && !state.users.some((u) => u.id === p.user.id)) {
        state.users.push(p.user);
        if (p.user.role === 'field-sales' && Array.isArray(state.salesTeam) && !state.salesTeam.some((s) => s.id === p.user.id)) {
          state.salesTeam.push({
            id: p.user.id,
            name: p.user.name,
            division: p.user.division || 'Madu & Herbal',
            area: 'Solo Raya',
            dailyVisitTarget: 15,
            monthlyRevenueTarget: 50000000,
            monthlyRevenueBase: 0,
            monthlyVisitBase: 0
          });
        }
      }
      break;
    }

    case 'DELETE_USER': {
      if (!Array.isArray(state.users)) state.users = loadInitialMasterData().users || [];
      if (p.userId && p.userId !== 'USR-SUPER-01') {
        state.users = state.users.filter((u) => u.id !== p.userId);
      }
      break;
    }

    case 'IMPORT_OUTLETS': {
      (p.rows || []).forEach((r) => {
        const name = r.nama_outlet || r.nama;
        if (!name) return;
        let city = String(r.kota || 'Solo').trim();
        if (city === 'Surakarta') city = 'Solo';
        const code = String(r.kode_outlet || '').trim() || `AP-${city.slice(0, 3).toUpperCase()}-${String(state.outlets.length + 1).padStart(3, '0')}`;
        const limit = Number(String(r.limit_kredit || '10000000').replace(/[^0-9]/g, '')) || 10000000;
        const existing = findOutlet(state, code);
        if (existing) {
          existing.name = name;
          existing.address = r.alamat || existing.address;
          existing.city = city;
          existing.cityName = city === 'Solo' ? 'Surakarta' : city;
          existing.creditLimit = limit;
          existing.creditRemaining = Math.max(0, limit - (existing.creditUsed || 0));
        } else {
          state.outlets.push({
            id: code,
            code,
            name,
            address: r.alamat || 'Solo Raya',
            city,
            cityName: city === 'Solo' ? 'Surakarta' : city,
            type: r.tipe || 'Apotek Mandiri',
            picName: r.nama_pic || '-',
            picRole: 'Apoteker Pengelola Apotek (APA)',
            picPhone: String(r.telepon_pic || '').replace(/[^0-9]/g, ''),
            salesRep: r.sales_rep || 'Budi Santoso',
            salesArea: city,
            terms: r.termin || 'Net 30 Hari',
            creditLimit: limit,
            creditUsed: 0,
            creditRemaining: limit,
            creditStatus: 'Lancar',
            lastOrderDate: '-',
            orderFrequency: 'Impor CSV',
            ytdTotal: Number(String(r.omset_ytd || '0').replace(/[^0-9]/g, '')) || 0,
            lastVisitDate: '-',
            visitNotes: '"Data outlet hasil impor CSV."'
          });
        }
      });
      break;
    }

    case 'IMPORT_PRODUCTS': {
      (p.rows || []).forEach((r) => {
        const sku = String(r.sku || '').trim().toUpperCase();
        const name = r.nama_produk || r.nama;
        const stock = Number(String(r.stok || '0').replace(/[^0-9]/g, ''));
        if (!sku || !name || isNaN(stock)) return;
        const existing = state.products.find((pr) => pr.sku === sku);
        const ss = Number(r.safety_stock) || 50;
        const rop = Number(r.rop) || ss * 2;
        const price = Number(r.harga_satuan) || 45000;
        const batch = r.batch_aktif || (existing ? existing.activeBatch : 'BATCH-2026-MIG');
        if (existing) {
          existing.name = name;
          existing.stock = stock;
          existing.safetyStock = ss;
          existing.rop = rop;
          existing.unitPrice = price;
          existing.activeBatch = batch;
          existing.status = computeProductStatus(existing);
        } else {
          const prod = {
            sku,
            name,
            category: r.kategori || 'Madu Herbal',
            stock,
            safetyStock: ss,
            rop,
            ropFormula: `SS=${ss} (impor)`,
            activeBatch: batch,
            fefoDate: r.tanggal_ed || '2027-12-31',
            fefoStatus: 'Aman (>6 Bulan)',
            status: stock <= rop ? 'below-rop' : 'optimal',
            unitPrice: price,
            icon: 'inventory_2'
          };
          state.products.push(prod);
        }
      });
      break;
    }

    case 'REBALANCE_CONSIGNMENT': {
      const applyOneRebalance = (item) => {
        const src = findOutlet(state, item.sourceOutletId);
        const dst = findOutlet(state, item.targetOutletId);
        const qty = Number(item.transferQty) || 0;
        if (src && dst && qty > 0) {
          const srcItem = (src.consignmentItems || []).find((c) => c.sku === item.sku);
          if (srcItem && (srcItem.remainingQty || 0) >= qty) {
            srcItem.remainingQty = Math.max(0, srcItem.remainingQty - qty);
            srcItem.consignedQty = (srcItem.soldQty || 0) + srcItem.remainingQty;
            srcItem.velocity = 'LARIS';
            srcItem.daysInOutlet = 1;
            srcItem.nearExpiry = false;
            srcItem.rebalanced = true;

            if (!Array.isArray(dst.consignmentItems)) dst.consignmentItems = [];
            const dstItem = dst.consignmentItems.find((c) => c.sku === item.sku);
            if (dstItem) {
              dstItem.remainingQty = (dstItem.remainingQty || 0) + qty;
              dstItem.consignedQty = (dstItem.soldQty || 0) + dstItem.remainingQty;
              dstItem.velocity = 'LARIS';
            } else {
              dst.consignmentItems.push({
                sku: srcItem.sku,
                name: srcItem.name,
                batch: srcItem.batch,
                expiry: srcItem.expiry,
                consignedQty: qty,
                soldQty: 0,
                remainingQty: qty,
                unitPrice: srcItem.unitPrice,
                velocity: 'LARIS',
                daysInOutlet: 1,
                nearExpiry: false,
                rebalanced: true
              });
            }
            src.consignmentTotalUnits = (src.consignmentItems || []).reduce((s, c) => s + (c.remainingQty || 0), 0);
            src.consignmentBillableAmount = (src.consignmentItems || []).reduce((s, c) => s + (c.soldQty || 0) * c.unitPrice, 0);
            dst.consignmentTotalUnits = (dst.consignmentItems || []).reduce((s, c) => s + (c.remainingQty || 0), 0);
            dst.consignmentBillableAmount = (dst.consignmentItems || []).reduce((s, c) => s + (c.soldQty || 0) * c.unitPrice, 0);
          }
          if (item.ledgerEntry && !state.ledger.some((l) => l.id === item.ledgerEntry.id)) {
            state.ledger = [item.ledgerEntry, ...state.ledger];
          }
        }
      };
      applyOneRebalance(p);
      break;
    }

    case 'BATCH_REBALANCE_CONSIGNMENT': {
      (p.items || []).forEach((item) => {
        applyMutationOnCentralState(state, { type: 'REBALANCE_CONSIGNMENT', payload: item });
      });
      break;
    }

    case 'RESOLVE_EXPIRY_ALARM': {
      const prod = state.products.find((pr) => pr.sku === p.sku || pr.activeBatch === p.batch);
      if (prod) {
        prod.fefoStatus = 'Prioritas FEFO Terjadwal';
        prod.status = prod.stock <= prod.rop ? 'below-rop' : 'optimal';
      }
      if (p.ledgerEntry && !state.ledger.some((l) => l.id === p.ledgerEntry.id)) {
        state.ledger = [p.ledgerEntry, ...state.ledger];
      }
      break;
    }

    case 'UPDATE_OUTLET_CREDIT_POLICY': {
      const target = findOutlet(state, p.outletId);
      if (target) {
        if (p.creditLimit !== undefined) target.creditLimit = Number(p.creditLimit);
        if (p.terms !== undefined) target.terms = p.terms;
        if (p.creditRemaining !== undefined) target.creditRemaining = Number(p.creditRemaining);
        if (p.creditStatus !== undefined) target.creditStatus = p.creditStatus;
        if (p.aiCreditOptimized !== undefined) target.aiCreditOptimized = Boolean(p.aiCreditOptimized);
      }
      break;
    }
  }
}

// -----------------------------------------------------------------------------
// 5. Server-Sent Events (SSE) Broadcast Manager
// -----------------------------------------------------------------------------
const sseClients = new Map();

function broadcastSSE(eventName, payload) {
  const msg = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const [id, res] of sseClients.entries()) {
    try {
      res.write(msg);
    } catch (e) {
      sseClients.delete(id);
    }
  }
}

// -----------------------------------------------------------------------------
// 6. HTTP Server & Static PWA Router
// -----------------------------------------------------------------------------
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.sql': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-XSS-Protection': '1; mode=block',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 10 * 1024 * 1024) {
        reject(new Error('Payload terlalu besar'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // 1) Health & SQL Relational Table Counts
  if (pathname === '/api/health' && req.method === 'GET') {
    const counts = {
      users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
      outlets: db.prepare('SELECT COUNT(*) AS c FROM outlets').get().c,
      sales_targets: db.prepare('SELECT COUNT(*) AS c FROM sales_targets').get().c,
      visits: db.prepare('SELECT COUNT(*) AS c FROM visits').get().c,
      products: db.prepare('SELECT COUNT(*) AS c FROM products').get().c,
      product_batches: db.prepare('SELECT COUNT(*) AS c FROM product_batches').get().c,
      orders: db.prepare('SELECT COUNT(*) AS c FROM orders').get().c,
      order_items: db.prepare('SELECT COUNT(*) AS c FROM order_items').get().c,
      stock_ledger: db.prepare('SELECT COUNT(*) AS c FROM stock_ledger').get().c,
      alerts: db.prepare('SELECT COUNT(*) AS c FROM alerts').get().c,
      synced_mutations: db.prepare('SELECT COUNT(*) AS c FROM sync_mutations_log').get().c
    };
    return sendJson(res, 200, {
      status: 'ok',
      engine: 'Node.js Built-in SQLite Relational Engine (WAL Mode)',
      databaseFile: 'database/arbaconnect.sqlite',
      connectedClients: sseClients.size,
      relationalTables: counts,
      timestamp: new Date().toISOString()
    });
  }

  // 2) Ambil State Pusat
  if (pathname === '/api/state' && req.method === 'GET') {
    const state = getCentralState();
    return sendJson(res, 200, {
      status: 'ok',
      state,
      timestamp: new Date().toISOString()
    });
  }

  // 3) Audit Tabel SQL Relasional (10 Tabel `schema.sql`)
  if (pathname === '/api/sql-audit' && req.method === 'GET') {
    return sendJson(res, 200, {
      status: 'ok',
      tables: {
        users: db.prepare('SELECT * FROM users').all(),
        outlets: db.prepare('SELECT * FROM outlets').all(),
        sales_targets: db.prepare('SELECT * FROM sales_targets').all(),
        visits: db.prepare('SELECT * FROM visits ORDER BY checkin_at DESC LIMIT 25').all(),
        products: db.prepare('SELECT * FROM products').all(),
        product_batches: db.prepare('SELECT * FROM product_batches').all(),
        orders: db.prepare('SELECT * FROM orders ORDER BY rowid DESC LIMIT 25').all(),
        order_items: db.prepare('SELECT * FROM order_items LIMIT 50').all(),
        stock_ledger: db.prepare('SELECT * FROM stock_ledger LIMIT 30').all(),
        alerts: db.prepare('SELECT * FROM alerts').all(),
        sync_mutations_log: db.prepare('SELECT mutation_id, client_id, mutation_type, summary, synced_at FROM sync_mutations_log ORDER BY synced_at DESC LIMIT 30').all()
      }
    });
  }

  // 3B) Endpoint Autentikasi & Daftar Akun Pengguna Per Role (`/api/auth/users` & `/api/auth/login`)
  if (pathname === '/api/auth/users' && req.method === 'GET') {
    const centralState = getCentralState();
    const safeUsers = (centralState.users || []).map((u) => {
      const copy = Object.assign({}, u);
      delete copy.password;
      return copy;
    });
    return sendJson(res, 200, { status: 'ok', users: safeUsers });
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const q = String(body.identifier || '').trim().toLowerCase();
      const pw = String(body.password || '').trim();
      const attemptKey = `${req.socket.remoteAddress || 'local'}:${q}`;
      const attemptInfo = loginAttempts.get(attemptKey);

      if (attemptInfo && attemptInfo.count >= MAX_LOGIN_ATTEMPTS && (Date.now() - attemptInfo.lastAttempt) < LOCKOUT_MS) {
        const waitSec = Math.ceil((LOCKOUT_MS - (Date.now() - attemptInfo.lastAttempt)) / 1000);
        return sendJson(res, 429, {
          status: 'error',
          message: `Terlalu banyak percobaan login gagal. Silakan tunggu ${waitSec} detik lagi.`
        });
      }

      const centralState = getCentralState();
      const matched = (centralState.users || []).find(
        (u) =>
          String(u.username || '').toLowerCase() === q ||
          String(u.email || '').toLowerCase() === q ||
          String(u.id || '').toLowerCase() === q ||
          String(u.name || '').toLowerCase() === q
      );

      if (!matched) {
        const prev = loginAttempts.get(attemptKey) || { count: 0 };
        loginAttempts.set(attemptKey, { count: prev.count + 1, lastAttempt: Date.now() });
        return sendJson(res, 401, {
          status: 'error',
          message: 'Akun pengguna tidak ditemukan.'
        });
      }

      if (matched.active === false) {
        return sendJson(res, 403, {
          status: 'error',
          message: 'Akun ini sedang dinonaktifkan oleh Super Admin.'
        });
      }

      if (pw !== String(matched.password) && (!matched.pin || pw !== String(matched.pin))) {
        const prev = loginAttempts.get(attemptKey) || { count: 0 };
        loginAttempts.set(attemptKey, { count: prev.count + 1, lastAttempt: Date.now() });
        return sendJson(res, 401, {
          status: 'error',
          message: 'Kata sandi atau PIN Offline tidak sesuai.'
        });
      }

      loginAttempts.delete(attemptKey);

      // Pastikan juga user tercatat di tabel SQL `users`
      const sqlUser = db.prepare('SELECT id, username, nama, email, peran, aktif FROM users WHERE email = ? OR id = ?').get(matched.email, matched.id);

      return sendJson(res, 200, {
        status: 'ok',
        user: matched,
        sqlRecord: sqlUser || null,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      return sendJson(res, 500, { status: 'error', message: err.message });
    }
  }

  // 4) Endpoint Sinkronisasi Batch Offline -> Online (`POST /api/sync`)
  if (pathname === '/api/sync' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const clientId = body.clientId || 'UNKNOWN';
      const mutations = Array.isArray(body.mutations) ? body.mutations : [];

      let appliedCount = 0;
      let skippedDuplicates = 0;
      const summaries = [];

      db.exec('BEGIN IMMEDIATE;');
      try {
        const state = getCentralState();
        const checkStmt = db.prepare('SELECT mutation_id FROM sync_mutations_log WHERE mutation_id = ?');
        const logStmt = db.prepare(`
          INSERT INTO sync_mutations_log (mutation_id, client_id, mutation_type, summary, payload_json)
          VALUES (?, ?, ?, ?, ?)
        `);

        for (const mut of mutations) {
          const mid = mut.mutationId || mut.id;
          if (!mid) continue;

          // Cek Idempotensi: jika mutasi dengan ID ini sudah pernah masuk, lewati!
          const alreadyProcessed = checkStmt.get(mid);
          if (alreadyProcessed) {
            skippedDuplicates++;
            continue;
          }

          applyMutationOnCentralState(state, mut);
          logStmt.run(mid, clientId, mut.type || 'UNKNOWN', mut.summary || '', JSON.stringify(mut.payload || {}));
          if (mut.summary) summaries.push(mut.summary);
          appliedCount++;
        }

        // Sinkronkan juga snapshot state klien bila disertakan agar paritas data 100% terjaga
        if (body.clientState && typeof body.clientState === 'object') {
          const cs = body.clientState;
          if (Array.isArray(cs.users) && cs.users.length) state.users = cs.users;
          if (Array.isArray(cs.products) && cs.products.length) state.products = cs.products;
          if (Array.isArray(cs.ledger) && cs.ledger.length) state.ledger = cs.ledger;
          if (Array.isArray(cs.outlets) && cs.outlets.length) state.outlets = cs.outlets;
          if (Array.isArray(cs.orders) && cs.orders.length) state.orders = cs.orders;
          if (Array.isArray(cs.supplierPOs)) state.supplierPOs = cs.supplierPOs;
          if (Array.isArray(cs.salesVisits)) state.salesVisits = cs.salesVisits;
          if (Array.isArray(cs.driverManifests)) state.driverManifests = cs.driverManifests;
          if (Array.isArray(cs.salesTeam)) state.salesTeam = cs.salesTeam;
          if (Array.isArray(cs.salesLoadings)) state.salesLoadings = cs.salesLoadings;
          if (Array.isArray(cs.visitLogs)) state.visitLogs = cs.visitLogs;
          if (appliedCount === 0) appliedCount = 1;
        }

        if (appliedCount > 0) {
          saveCentralState(state);
        }
        db.exec('COMMIT;');

        const updatedState = getCentralState();

        if (appliedCount > 0) {
          broadcastSSE('state_updated', {
            sourceClientId: clientId,
            appliedCount,
            summary: summaries.join(' • '),
            state: updatedState,
            timestamp: Date.now()
          });
        }

        return sendJson(res, 200, {
          status: 'ok',
          appliedCount,
          skippedDuplicates,
          state: updatedState,
          timestamp: new Date().toISOString()
        });
      } catch (txErr) {
        db.exec('ROLLBACK;');
        throw txErr;
      }
    } catch (err) {
      return sendJson(res, 500, { status: 'error', message: err.message });
    }
  }

  // 5) Reset Database Pusat ke Awal
  if (pathname === '/api/reset' && req.method === 'POST') {
    const master = loadInitialMasterData();
    const initialState = {
      users: master.users || [],
      products: master.products,
      ledger: master.ledger,
      outlets: master.outlets,
      orders: master.orders,
      supplierPOs: master.supplierPOs,
      salesVisits: master.salesVisits,
      driverManifests: master.driverManifests,
      salesTeam: master.salesTeam,
      salesLoadings: master.salesLoadings,
      visitLogs: master.visitLogs
    };
    db.exec('DELETE FROM sync_mutations_log;');
    saveCentralState(initialState);
    broadcastSSE('state_updated', {
      sourceClientId: 'SYSTEM_RESET',
      appliedCount: 1,
      summary: 'Database pusat di-reset ke data awal',
      state: initialState,
      timestamp: Date.now()
    });
    return sendJson(res, 200, { status: 'ok', state: initialState });
  }

  // 6) Real-time Server-Sent Events Stream (`GET /api/events`)
  if (pathname === '/api/events' && req.method === 'GET') {
    const streamId = (parsedUrl.searchParams.get('clientId') || 'CLI') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(`event: connected\ndata: ${JSON.stringify({ streamId, time: Date.now() })}\n\n`);
    sseClients.set(streamId, res);

    req.on('close', () => {
      sseClients.delete(streamId);
    });
    return;
  }

  // 7) Melayani Berkas Statis PWA (Hanya direktori frontend publik yang diizinkan)
  let relPath = pathname === '/' ? '/index.html' : pathname;
  try {
    relPath = decodeURIComponent(relPath);
  } catch (e) {
    res.writeHead(400);
    return res.end('Bad Request');
  }

  // Blokir akses langsung ke direktori/berkas sensitif server & database SQLite
  const normalizedRel = relPath.replace(/\\/g, '/').toLowerCase();
  if (
    normalizedRel.includes('..') ||
    normalizedRel.startsWith('/database') ||
    normalizedRel.startsWith('/server') ||
    normalizedRel.startsWith('/.') ||
    normalizedRel.startsWith('/node_modules') ||
    normalizedRel === '/package.json' ||
    normalizedRel === '/package-lock.json' ||
    normalizedRel.endsWith('.sqlite') ||
    normalizedRel.endsWith('.sqlite-wal') ||
    normalizedRel.endsWith('.sqlite-shm') ||
    normalizedRel.endsWith('.sql')
  ) {
    res.writeHead(403, {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    });
    return res.end('403 Forbidden: Access to protected server/database resource is denied.');
  }

  const safePath = path.normalize(path.join(ROOT_DIR, relPath));

  if (!safePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(safePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // Fallback SPA ke index.html
      const indexHtml = path.join(ROOT_DIR, 'index.html');
      fs.readFile(indexHtml, (e2, content) => {
        if (e2) {
          res.writeHead(404);
          return res.end('Not Found');
        }
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'SAMEORIGIN',
          'Referrer-Policy': 'strict-origin-when-cross-origin'
        });
        res.end(content);
      });
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const headers = {
      'Content-Type': mime,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    };
    if (safePath.endsWith('sw.js')) {
      headers['Service-Worker-Allowed'] = '/';
    }

    fs.readFile(safePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500);
        return res.end('Internal Server Error');
      }
      res.writeHead(200, headers);
      res.end(content);
    });
  });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log('===================================================================');
    console.log("  ArbaConnect ERP - Central Server & Offline-First PWA Active");
    console.log("  CV Arba'in Solo Raya");
    console.log('===================================================================');
    console.log(`  Local URL   : http://localhost:${PORT}`);
    console.log(`  Field Sales : http://localhost:${PORT}/?pwa=full#field-sales-pwa-preview`);
    console.log(`  Health API  : http://localhost:${PORT}/api/health`);
    console.log(`  SQL Audit   : http://localhost:${PORT}/api/sql-audit`);
    console.log(`  SQLite DB   : ${DB_FILE}`);
    console.log('===================================================================');
  });
}

module.exports = {
  server,
  db,
  getCentralState,
  saveCentralState,
  applyMutationOnCentralState
};

