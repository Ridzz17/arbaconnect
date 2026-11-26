/**
 * ArbaConnect ERP - Utility Functions & Exporters
 * CV Arba'in Solo Raya
 */

window.ArbaUtils = (function() {
  function formatRupiah(amount) {
    if (typeof amount !== 'number') amount = Number(amount) || 0;
    return 'Rp ' + amount.toLocaleString('id-ID');
  }

  function formatNumber(num) {
    if (typeof num !== 'number') num = Number(num) || 0;
    return num.toLocaleString('id-ID');
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function safeHexColor(val, fallback) {
    const fb = fallback || '#005c55';
    if (!val || typeof val !== 'string') return fb;
    const trimmed = val.trim();
    return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : fb;
  }

  function safeImageDataUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
      return trimmed;
    }
    return '';
  }

  function safeCsvCell(val) {
    if (val === null || val === undefined) return '""';
    let s = String(val);
    if (/^[=+\-@\t\r]/.test(s)) {
      s = "'" + s;
    }
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function hashCredential(raw) {
    if (window.ArbaData && typeof window.ArbaData.hashCredential === 'function') {
      return window.ArbaData.hashCredential(raw);
    }
    return String(raw || '');
  }

  function sanitizeUserRecord(u) {
    if (!u || typeof u !== 'object') return u;
    const copy = Object.assign({}, u);
    if (copy.password) {
      copy.passwordHash = hashCredential(copy.password);
      delete copy.password;
    }
    if (copy.pin) {
      copy.pinHash = hashCredential(copy.pin);
      delete copy.pin;
    }
    return copy;
  }

  function downloadCsv(filename, content) {
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function exportCrmToCsv(outlets) {
    const headers = [
      'Kode Outlet',
      'Nama Outlet',
      'Alamat',
      'Kota/Wilayah',
      'Tipe',
      'Apoteker / PJ',
      'WhatsApp / Telepon',
      'Sales Dedikasi',
      'Area Rute',
      'Termin Pembayaran',
      'Plafon Kredit (IDR)',
      'Pemakaian Kredit (IDR)',
      'Sisa Plafon (IDR)',
      'Status Kredit',
      'Order Terakhir',
      'Total Omset YTD (IDR)'
    ];

    const rows = outlets.map(o => [
      safeCsvCell(o.code),
      safeCsvCell(o.name),
      safeCsvCell(o.address),
      safeCsvCell(o.cityName),
      safeCsvCell(o.type),
      safeCsvCell(o.picName),
      safeCsvCell(o.picPhone),
      safeCsvCell(o.salesRep),
      safeCsvCell(o.salesArea),
      safeCsvCell(o.terms),
      Number(o.creditLimit) || 0,
      Number(o.creditUsed) || 0,
      Number(o.creditRemaining) || 0,
      safeCsvCell(o.creditStatus),
      safeCsvCell(o.lastOrderDate),
      Number(o.ytdTotal) || 0
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadCsv(`ArbaConnect_CRM_Mitra_SoloRaya_${new Date().toISOString().slice(0, 10)}.csv`, csvContent);
  }

  function exportStockLedgerToCsv(ledger) {
    const headers = [
      'ID Transaksi',
      'Waktu',
      'Ref Dokumen',
      'Kode SKU',
      'Nama Produk',
      'Batch Terkait',
      'Tipe Mutasi',
      'Kuantitas',
      'Saldo Akhir',
      'Petugas/Operator',
      'Peran Operator',
      'SHA-256 Hash'
    ];

    const rows = ledger.map(l => [
      safeCsvCell(l.id),
      safeCsvCell(l.timestamp),
      safeCsvCell(l.docRef),
      safeCsvCell(l.skuCode),
      safeCsvCell(l.skuName),
      safeCsvCell(l.batch),
      safeCsvCell(l.type),
      Number(l.quantity) || 0,
      Number(l.finalStock) || 0,
      safeCsvCell(l.operator),
      safeCsvCell(l.operatorRole),
      safeCsvCell(l.hash)
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadCsv(`ArbaConnect_BukuBesarStok_${new Date().toISOString().slice(0, 10)}.csv`, csvContent);
  }

  function exportExecutiveReportToCsv(orders, products, outlets) {
    const a = window.ArbaStore ? window.ArbaStore.getAnalytics() : null;
    const totalOmset = a ? a.revenueMonth : orders.reduce((sum, o) => sum + o.totalAmount, 0);
    const headers = ['METRIK EKSEKUTIF', 'NILAI', 'CATATAN'];
    const summaryRows = [
      ['Total Omset Bulan Berjalan', `Rp ${totalOmset.toLocaleString('id-ID')}`, a ? `Target Rp ${a.revenueTarget.toLocaleString('id-ID')} (${a.revenuePct}%)` : '-'],
      ['Total Mitra B2B Solo Raya', `${a ? a.totalOutlets : outlets.length} Outlet`, a ? `${a.apotekCount} Apotek, ${a.minimarketCount} Minimarket` : '-'],
      ['Kunjungan Sales Hari Ini', a ? `${a.visitsToday} / ${a.visitTargetToday}` : '-', a ? `Effective Call ${a.effectiveCallRate}%` : '-'],
      ['Total Saldo Fisik Gudang', `${products.reduce((acc, p) => acc + p.stock, 0)} Unit`, 'Gudang Utama Kartasura'],
      ['SKU di Bawah ROP', `${products.filter(p => p.stock <= p.rop).length} SKU`, 'Low-stock alert otomatis']
    ];

    const perfHeaders = ['Sales Rep', 'Area', 'Kunjungan Hari Ini', 'Target Harian', 'Kunjungan Bulan Ini', 'Omset Bulan Ini (IDR)', 'Target Omset (IDR)', 'Capaian (%)', 'Effective Call (%)'];
    const perfRows = a ? a.salesPerformance.map(s => [
      safeCsvCell(s.name), safeCsvCell(s.area), Number(s.visitsToday) || 0, Number(s.dailyVisitTarget) || 0, Number(s.visitsMonth) || 0, Number(s.revenueMonth) || 0, Number(s.monthlyRevenueTarget) || 0, Number(s.revenuePct) || 0, Number(s.effectiveCallRate) || 0
    ]) : [];

    const orderHeaders = ['', '', ''];
    const orderTableHeaders = ['Client UUID', 'Nama Outlet', 'Kota', 'Sales Rep', 'Total (IDR)', 'Termin', 'Status'];
    const orderRows = orders.map(o => [
      safeCsvCell(o.clientUuid),
      safeCsvCell(o.outletName),
      safeCsvCell(o.city),
      safeCsvCell(o.salesRep),
      Number(o.totalAmount) || 0,
      safeCsvCell(o.terms),
      safeCsvCell(o.status)
    ]);

    const csvContent = [
      headers.join(','),
      ...summaryRows.map(r => r.map(c => safeCsvCell(c)).join(',')),
      orderHeaders.join(','),
      ['PERFORMA TIM SALES', '', ''].join(','),
      perfHeaders.join(','),
      ...perfRows.map(r => r.join(',')),
      orderHeaders.join(','),
      ['DAFTAR PESANAN MASUK TERBARU', '', ''].join(','),
      orderTableHeaders.join(','),
      ...orderRows.map(r => r.join(','))
    ].join('\n');

    downloadCsv(`ArbaConnect_Laporan_Eksekutif_${new Date().toISOString().slice(0, 10)}.csv`, csvContent);
  }

  /**
   * Parser CSV ringan (RFC 4180): mendukung tanda kutip, koma di dalam kutip,
   * serta delimiter koma (,) atau titik koma (;) — format umum ekspor Excel Indonesia.
   * Mengembalikan array objek dengan key header (lowercase, spasi -> underscore).
   */
  function parseCsv(text) {
    if (!text) return [];
    text = String(text).replace(/^\uFEFF/, '');
    const firstLine = text.split(/\r?\n/)[0] || '';
    const delimiter = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';

    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(field); field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        rows.push(row); row = [];
      } else {
        field += ch;
      }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }

    const nonEmpty = rows.filter(r => r.some(c => String(c).trim() !== ''));
    if (nonEmpty.length < 2) return [];
    const headers = nonEmpty[0].map(h => String(h).trim().toLowerCase().replace(/\s+/g, '_'));
    return nonEmpty.slice(1).map(r => {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = (r[idx] !== undefined ? String(r[idx]).trim() : ''); });
      return obj;
    });
  }

  return {
    formatRupiah,
    formatNumber,
    escapeHtml,
    safeHexColor,
    safeImageDataUrl,
    safeCsvCell,
    hashCredential,
    sanitizeUserRecord,
    downloadCsv,
    parseCsv,
    exportCrmToCsv,
    exportStockLedgerToCsv,
    exportExecutiveReportToCsv
  };
})();
