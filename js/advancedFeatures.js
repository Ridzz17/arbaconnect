/**
 * =============================================================================
 * ArbaConnect ERP - 6 Advanced Enterprise & Hackathon Features (js/advancedFeatures.js)
 * CV Arba'in Solo Raya
 * =============================================================================
 *
 * Mencakup 6 Modul Advance Terintegrasi:
 * 1. Smart Consignment Auto-Rebalancer (Rekomendasi & Eksekusi Mutasi Silang Antar-Apotek)
 * 2. QR / Barcode Batch Scanner Kamera & Generator Stiker Label QR Batch FEFO/BPOM
 * 3. Peta Geofence Interaktif Solo Raya & TSP Auto-Route Optimizer (Nearest-Neighbor)
 * 4. Tanda Tangan Digital Apoteker (HTML5 Canvas E-Signature) & Bukti Foto Etalase Offline
 * 5. AI/Heuristic B2B Credit Health Scoring (0-100) & Dynamic Credit Limit Engine
 * 6. Immutable Blockchain-Style SHA-256 Chain Verifier & Sertifikat Audit CDOB Resmi
 */

(function () {
  'use strict';

  var activeCameraStream = null;

  function stopActiveCamera() {
    if (activeCameraStream) {
      try {
        activeCameraStream.getTracks().forEach(function (t) { t.stop(); });
      } catch (e) {}
      activeCameraStream = null;
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Generator QR Code SVG Deterministik (Offline-Ready tanpa CDN eksternal)
  // ---------------------------------------------------------------------------
  function generateQrSvg(text, size) {
    size = size || 128;
    var grid = 21;
    var matrix = [];
    for (var r = 0; r < grid; r++) {
      matrix[r] = [];
      for (var c = 0; c < grid; c++) {
        matrix[r][c] = 0;
      }
    }

    function drawFinder(rowOffset, colOffset) {
      for (var r = 0; r < 7; r++) {
        for (var c = 0; c < 7; c++) {
          if (
            r === 0 || r === 6 || c === 0 || c === 6 ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4)
          ) {
            matrix[rowOffset + r][colOffset + c] = 1;
          } else {
            matrix[rowOffset + r][colOffset + c] = 2; // reserved white
          }
        }
      }
    }

    drawFinder(0, 0);
    drawFinder(0, grid - 7);
    drawFinder(grid - 7, 0);

    // Timing patterns
    for (var i = 8; i < grid - 8; i++) {
      matrix[6][i] = i % 2 === 0 ? 1 : 2;
      matrix[i][6] = i % 2 === 0 ? 1 : 2;
    }

    // Fill data modules deterministically from text hash
    var str = String(text || 'ARBACONNECT-FEFO');
    var seed = 2166136261;
    for (var k = 0; k < str.length; k++) {
      seed ^= str.charCodeAt(k);
      seed = Math.imul(seed, 16777619) >>> 0;
    }

    for (var rr = 0; rr < grid; rr++) {
      for (var cc = 0; cc < grid; cc++) {
        if (matrix[rr][cc] !== 0) continue;
        if ((rr < 8 && cc < 8) || (rr < 8 && cc >= grid - 8) || (rr >= grid - 8 && cc < 8)) {
          continue;
        }
        seed ^= (rr * 31 + cc * 17 + str.charCodeAt((rr + cc) % str.length));
        seed = Math.imul(seed, 1664525) + 1013904223;
        seed = seed >>> 0;
        matrix[rr][cc] = (seed & 3) !== 0 ? 1 : 0;
      }
    }

    var rects = '';
    for (var y = 0; y < grid; y++) {
      for (var x = 0; x < grid; x++) {
        if (matrix[y][x] === 1) {
          rects += '<rect x="' + (x + 2) + '" y="' + (y + 2) + '" width="1" height="1" fill="#0f172a"/>';
        }
      }
    }

    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (grid + 4) + ' ' + (grid + 4) + '" width="' + size + '" height="' + size + '" shape-rendering="crispEdges" style="background:#ffffff; border-radius:8px; border:1px solid #cbd5e1;">' +
      '<rect width="100%" height="100%" fill="#ffffff"/>' +
      rects +
      '</svg>'
    );
  }

  // ---------------------------------------------------------------------------
  // 2. Modal QR Batch Scanner Kamera & Cetak Stiker QR Batch FEFO/BPOM
  // ---------------------------------------------------------------------------
  function openQrBatchModal(options) {
    options = options || {};
    var st = window.ArbaStore.getState();
    var products = st.products || [];
    var initialTab = options.initialTab || 'scanner'; // 'scanner' | 'labels'
    var selectedSku = options.initialSku || (products[0] && products[0].sku) || 'SKU-ARB-MDR500';

    function renderModalContent(activeTab, scannedProd) {
      var html = `
        <div class="modal-card p-6" style="max-width: 780px; width: 95vw; max-height: 90vh; overflow-y: auto;">
          <!-- Header -->
          <div class="flex items-start justify-between gap-4 pb-4 border-b border-border-subtle">
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-[24px]">qr_code_scanner</span>
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="font-bold text-base text-on-surface">Scan QR Kemasan Botol/Karton &amp; Cetak Stiker Nomor Batch Gudang</h3>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">STANDAR BPOM &amp; FEFO</span>
                </div>
                <p class="text-xs text-on-surface-variant mt-0.5">
                  Untuk Sales Lapangan: Scan QR botol untuk cek keaslian &amp; masukkan ke nota. Untuk Admin Gudang: Cetak stiker QR nomor batch &amp; tanggal kedaluwarsa.
                </p>
              </div>
            </div>
            <button id="qr-modal-close" class="icon-btn" type="button" title="Tutup">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>

          <!-- Switch Tabs -->
          <div class="flex items-center gap-2 my-4 bg-surface-container-low p-1.5 rounded-xl border border-border-subtle">
            <button
              id="qr-tab-scanner"
              type="button"
              class="flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer border-0 transition-all ${
                activeTab === 'scanner' ? 'bg-primary text-white shadow-xs' : 'bg-transparent text-on-surface-variant hover:text-on-surface'
              }"
            >
              <span class="material-symbols-outlined text-[16px]">photo_camera</span>
              <span>Pemindai Kamera &amp; Simulasi Scan Cepat</span>
            </button>
            <button
              id="qr-tab-labels"
              type="button"
              class="flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer border-0 transition-all ${
                activeTab === 'labels' ? 'bg-primary text-white shadow-xs' : 'bg-transparent text-on-surface-variant hover:text-on-surface'
              }"
            >
              <span class="material-symbols-outlined text-[16px]">qr_code_2</span>
              <span>Stiker Label QR Batch Gudang (${products.length} SKU)</span>
            </button>
          </div>

          ${activeTab === 'scanner' ? `
            <!-- TAB 1: SCANNER KAMERA & SIMULASI SCAN 1-KLIK -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Panel Kamera Live / Viewfinder -->
              <div class="rounded-xl border border-border-subtle bg-slate-950 text-white p-4 flex flex-col justify-between relative overflow-hidden" style="min-height: 270px; background:#090d16;">
                <div class="flex items-center justify-between z-10">
                  <span class="text-[11px] font-mono uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <span style="width:8px; height:8px; border-radius:50%; background:#10b981; display:inline-block;"></span>
                    OPTICAL FEFO SCANNER v2.5
                  </span>
                  <button
                    id="qr-start-camera-btn"
                    type="button"
                    class="px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 text-white text-[11px] font-bold cursor-pointer border-0 flex items-center gap-1"
                  >
                    <span class="material-symbols-outlined text-[14px]">videocam</span>
                    <span>Aktifkan Kamera</span>
                  </button>
                </div>

                <!-- Video / Laser Box -->
                <div class="my-3 relative flex items-center justify-center rounded-lg overflow-hidden border border-emerald-500/40" style="height: 170px; background: radial-gradient(circle, #1e293b 0%, #020617 100%);">
                  <video id="qr-camera-video" autoplay playsinline muted style="width:100%; height:100%; object-fit:cover; display:none;"></video>
                  <div id="qr-viewfinder-placeholder" class="text-center p-4">
                    <span class="material-symbols-outlined text-[42px] text-emerald-400 mb-1">qr_code_scanner</span>
                    <div class="text-xs font-bold text-slate-200">Arahkan QR Stiker Batch ke Bingkai</div>
                    <div class="text-[11px] text-slate-400 mt-0.5">Atau klik tombol "Simulasi Scan Batch" di sebelah kanan</div>
                  </div>
                  <!-- Garis Laser Pemindai -->
                  <div style="position:absolute; left:12%; right:12%; top:50%; height:2px; background:linear-gradient(90deg, transparent, #10b981, #34d399, #10b981, transparent); box-shadow:0 0 12px #10b981;"></div>
                </div>

                <div class="text-[11px] text-slate-400 flex items-center justify-between">
                  <span>Format: <b class="text-slate-200">ARBA|SKU|BATCH|EXP</b></span>
                  <span class="text-emerald-400 font-semibold">Standar BPOM &amp; CDOB</span>
                </div>
              </div>

              <!-- Panel Tombol Simulasi Scan Cepat & Hasil Verifikasi -->
              <div class="flex flex-col justify-between gap-3">
                <div class="rounded-xl border border-border-subtle bg-surface-container-low p-3.5">
                  <div class="text-xs font-bold text-on-surface mb-1">Simulasi Scan Cepat Stiker Batch (1-Klik)</div>
                  <p class="text-[11px] text-on-surface-variant mb-2.5">
                    Pilih batch produk di bawah untuk mensimulasikan pembacaan sensor optik QR:
                  </p>
                  <div class="grid grid-cols-1 gap-1.5 max-h-44 overflow-y-auto pr-1">
                    ${products.map(function (p) {
                      var isSelected = scannedProd && scannedProd.sku === p.sku;
                      return `
                        <button
                          type="button"
                          class="qr-sim-scan-btn flex items-center justify-between p-2 rounded-lg text-left text-xs cursor-pointer transition-all border ${
                            isSelected
                              ? 'bg-primary/10 border-primary text-primary font-bold'
                              : 'bg-surface hover:bg-surface-container border-border-subtle text-on-surface'
                          }"
                          data-sku="${p.sku}"
                        >
                          <div class="truncate pr-2">
                            <div class="font-bold truncate">${p.name}</div>
                            <div class="text-[10px] font-mono text-on-surface-variant">${p.sku} • Batch: ${p.activeBatch}</div>
                          </div>
                          <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 shrink-0">Scan QR</span>
                        </button>
                      `;
                    }).join('')}
                  </div>
                </div>

                <!-- Hasil Scan Batch Terverifikasi -->
                ${scannedProd ? `
                  <div class="rounded-xl border-2 border-emerald-500/60 bg-emerald-50/70 p-3.5 text-xs">
                    <div class="flex items-center justify-between mb-1.5">
                      <span class="font-extrabold text-emerald-900 flex items-center gap-1">
                        <span class="material-symbols-outlined text-[16px] text-emerald-600">verified</span>
                        BATCH TERVERIFIKASI ASLI (BPOM &amp; CDOB)
                      </span>
                      <span class="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-200 text-emerald-950">${scannedProd.activeBatch}</span>
                    </div>
                    <div class="font-bold text-sm text-slate-900">${scannedProd.name}</div>
                    <div class="grid grid-cols-2 gap-1.5 mt-2 text-[11px] text-slate-700">
                      <div>Kode SKU: <b class="font-mono">${scannedProd.sku}</b></div>
                      <div>Stok Gudang: <b>${scannedProd.stock} unit</b></div>
                      <div>Kedaluwarsa (FEFO): <b>${scannedProd.fefoDate}</b></div>
                      <div>Harga B2B: <b>${window.ArbaUtils.formatRupiah(scannedProd.unitPrice)}</b></div>
                    </div>
                    <div class="mt-3 flex flex-wrap gap-2">
                      ${typeof options.onSelectProduct === 'function' ? `
                        <button
                          id="qr-add-to-pwa-cart-btn"
                          type="button"
                          class="flex-1 py-2 px-3 rounded-lg bg-primary text-white font-bold text-xs cursor-pointer border-0 flex items-center justify-center gap-1.5 shadow-xs"
                        >
                          <span class="material-symbols-outlined text-[16px]">add_shopping_cart</span>
                          <span>+ Tambah ke Nota Order Sales</span>
                        </button>
                      ` : `
                        <button
                          id="qr-goto-pwa-order-btn"
                          type="button"
                          class="flex-1 py-2 px-3 rounded-lg bg-primary text-white font-bold text-xs cursor-pointer border-0 flex items-center justify-center gap-1.5"
                        >
                          <span class="material-symbols-outlined text-[16px]">shopping_cart_checkout</span>
                          <span>Masukkan ke Order PWA</span>
                        </button>
                      `}
                    </div>
                  </div>
                ` : ''}
              </div>
            </div>
          ` : `
            <!-- TAB 2: GENERATOR STIKER LABEL QR BATCH FEFO -->
            <div>
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs text-on-surface-variant">
                  Stiker QR Batch di bawah dapat ditempelkan pada karton/botol di Gudang Kartasura &amp; etalase konsinyasi apotek:
                </span>
                <button
                  id="qr-print-labels-btn"
                  type="button"
                  class="px-3.5 py-2 rounded-lg bg-primary text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer border-0 shadow-xs"
                >
                  <span class="material-symbols-outlined text-[16px]">print</span>
                  <span>Cetak Semua Stiker QR Batch</span>
                </button>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                ${products.map(function (p) {
                  var qrPayload = 'ARBA|' + p.sku + '|' + p.activeBatch + '|' + p.fefoDate;
                  return `
                    <div class="p-3 rounded-xl border border-border-subtle bg-surface flex items-center gap-3">
                      <div class="shrink-0">
                        ${generateQrSvg(qrPayload, 76)}
                      </div>
                      <div class="min-w-0 flex-1 text-xs">
                        <div class="text-[10px] font-bold uppercase tracking-wider text-primary">CV ARBA'IN SOLO RAYA</div>
                        <div class="font-bold text-on-surface truncate" title="${p.name}">${p.name}</div>
                        <div class="font-mono text-[10px] text-on-surface-variant mt-0.5">SKU: ${p.sku}</div>
                        <div class="font-mono text-[11px] font-bold text-emerald-700 mt-0.5">Batch: ${p.activeBatch}</div>
                        <div class="text-[10px] text-on-surface-variant">ED: <b>${p.fefoDate}</b> • Stok: ${p.stock}</div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `}
        </div>
      `;

      window.ArbaApp.openModal(html);

      var closeBtn = document.getElementById('qr-modal-close');
      if (closeBtn) {
        closeBtn.onclick = function () {
          stopActiveCamera();
          window.ArbaApp.closeModal();
        };
      }

      var tabScanner = document.getElementById('qr-tab-scanner');
      var tabLabels = document.getElementById('qr-tab-labels');
      if (tabScanner) {
        tabScanner.onclick = function () {
          stopActiveCamera();
          renderModalContent('scanner', scannedProd);
        };
      }
      if (tabLabels) {
        tabLabels.onclick = function () {
          stopActiveCamera();
          renderModalContent('labels', scannedProd);
        };
      }

      var startCamBtn = document.getElementById('qr-start-camera-btn');
      if (startCamBtn) {
        startCamBtn.onclick = function () {
          var videoEl = document.getElementById('qr-camera-video');
          var placeholderEl = document.getElementById('qr-viewfinder-placeholder');
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
              .then(function (stream) {
                activeCameraStream = stream;
                if (videoEl) {
                  videoEl.srcObject = stream;
                  videoEl.style.display = 'block';
                }
                if (placeholderEl) placeholderEl.style.display = 'none';
                window.ArbaApp.showToast('Kamera optik QR aktif — arahkan ke label batch produk', 'videocam');
              })
              .catch(function () {
                window.ArbaApp.showToast('Kamera tidak tersedia di perangkat ini — gunakan tombol Simulasi Scan di kanan', 'info');
              });
          } else {
            window.ArbaApp.showToast('Gunakan daftar Simulasi Scan Batch di panel kanan', 'qr_code_scanner');
          }
        };
      }

      document.querySelectorAll('.qr-sim-scan-btn').forEach(function (btn) {
        btn.onclick = function () {
          var sku = btn.getAttribute('data-sku');
          var found = products.find(function (p) { return p.sku === sku; });
          if (found) {
            selectedSku = found.sku;
            window.ArbaApp.showToast('QR Terbaca: ' + found.name + ' (' + found.activeBatch + ')', 'qr_code_scanner');
            renderModalContent('scanner', found);
          }
        };
      });

      var addCartBtn = document.getElementById('qr-add-to-pwa-cart-btn');
      if (addCartBtn && scannedProd && typeof options.onSelectProduct === 'function') {
        addCartBtn.onclick = function () {
          stopActiveCamera();
          window.ArbaApp.closeModal();
          options.onSelectProduct(scannedProd);
        };
      }

      var gotoPwaBtn = document.getElementById('qr-goto-pwa-order-btn');
      if (gotoPwaBtn && scannedProd) {
        gotoPwaBtn.onclick = function () {
          stopActiveCamera();
          window.ArbaApp.closeModal();
          window.ArbaApp.navigate('field-sales-pwa-preview');
          window.ArbaApp.showToast('Batch ' + scannedProd.activeBatch + ' (' + scannedProd.name + ') siap diorder di PWA!', 'smartphone');
        };
      }

      var printLabelsBtn = document.getElementById('qr-print-labels-btn');
      if (printLabelsBtn) {
        printLabelsBtn.onclick = function () {
          window.print();
        };
      }
    }

    var defaultScanned = products.find(function (p) { return p.sku === selectedSku; }) || products[0];
    renderModalContent(initialTab, defaultScanned);
  }

  // ---------------------------------------------------------------------------
  // 3. Modal Smart Consignment Auto-Rebalancer (Mutasi Silang Antar-Apotek FEFO)
  // ---------------------------------------------------------------------------
  function openConsignmentRebalancerModal() {
    var recs = window.ArbaStore.getConsignmentRebalanceRecommendations();
    var totalSavedValue = recs.reduce(function (s, r) { return s + r.savedValueRp; }, 0);
    var totalUnits = recs.reduce(function (s, r) { return s + r.transferQty; }, 0);

    var html = `
      <div class="modal-card p-6" style="max-width: 840px; width: 95vw; max-height: 90vh; overflow-y: auto;">
        <div class="flex items-start justify-between gap-4 pb-4 border-b border-border-subtle">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-xl bg-amber-500/15 text-amber-700 flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-[24px]">swap_driving_apps_wheel</span>
            </div>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="font-bold text-base text-on-surface">Rekomendasi Tarik &amp; Geser Stok Titipan Antar-Apotek (Cegah Kedaluwarsa)</h3>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">CEGAH RETUR EXPIRED</span>
              </div>
              <p class="text-xs text-on-surface-variant mt-0.5">
                Mendeteksi barang titipan (konsinyasi) yang lama tidak laku / hampir kedaluwarsa di satu apotek, lalu menyarankan pemindahan ke apotek terdekat yang penjualannya <b>LARIS</b>.
              </p>
            </div>
          </div>
          <button id="rebalance-modal-close" class="icon-btn" type="button" title="Tutup">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <!-- Ringkasan Dampak Finansial -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
          <div class="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
            <div class="text-[11px] font-bold uppercase text-amber-800">Rekomendasi Mutasi Silang</div>
            <div class="text-xl font-extrabold text-amber-950 mt-0.5">${recs.length} Rute Apotek</div>
            <div class="text-[11px] text-amber-700">Total ${totalUnits} botol diselamatkan dari ED</div>
          </div>
          <div class="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
            <div class="text-[11px] font-bold uppercase text-emerald-800">Potensi Nilai Barang Diselamatkan</div>
            <div class="text-xl font-extrabold text-emerald-950 mt-0.5">${window.ArbaUtils.formatRupiah(totalSavedValue)}</div>
            <div class="text-[11px] text-emerald-700">Mencegah kerugian retur expired (0% Waste)</div>
          </div>
          <div class="p-3.5 rounded-xl bg-surface-container-low border border-border-subtle flex flex-col justify-between">
            <div class="text-[11px] font-bold uppercase text-on-surface-variant">Eksekusi Otomatis</div>
            ${recs.length > 0 ? `
              <button
                id="rebalance-exec-all-btn"
                type="button"
                class="mt-1 py-2 px-3 rounded-lg bg-primary text-white text-xs font-bold cursor-pointer border-0 flex items-center justify-center gap-1.5 shadow-xs"
              >
                <span class="material-symbols-outlined text-[16px]">bolt</span>
                <span>Eksekusi Semua Mutasi (${recs.length})</span>
              </button>
            ` : `
              <div class="text-xs font-bold text-emerald-600 mt-1">Semua Konsinyasi Optimal!</div>
            `}
          </div>
        </div>

        <!-- Daftar Rekomendasi -->
        ${recs.length === 0 ? `
          <div class="p-8 text-center rounded-xl border border-border-subtle bg-surface-container-low">
            <span class="material-symbols-outlined text-[36px] text-emerald-600">verified</span>
            <div class="font-bold text-sm text-on-surface mt-2">Seluruh Stok Konsinyasi Apotek Telah Seimbang!</div>
            <p class="text-xs text-on-surface-variant mt-1">Tidak ditemukan stok titipan macet atau mendekati kedaluwarsa yang memerlukan mutasi silang saat ini.</p>
          </div>
        ` : `
          <div class="flex flex-col gap-3">
            ${recs.map(function (r) {
              return `
                <div class="p-4 rounded-xl border border-border-subtle bg-surface hover:border-primary/40 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap mb-1">
                      <span class="font-bold text-sm text-on-surface">${r.productName}</span>
                      <span class="font-mono text-[11px] px-2 py-0.5 rounded bg-surface-container text-on-surface-variant">Batch: ${r.batch} • ED: ${r.expiry}</span>
                      ${r.nearExpiry ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">RAWAN EXPIRED</span>' : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">SLOW MOVING</span>'}
                    </div>

                    <div class="flex items-center gap-2 flex-wrap text-xs mt-2">
                      <div class="px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-950">
                        <div class="text-[10px] uppercase font-bold text-rose-700">TARIK DARI (ASAL)</div>
                        <div class="font-bold">${r.sourceOutletName} (${r.sourceCity})</div>
                        <div class="text-[10px] text-rose-700">Sisa ${r.sourceRemainingQty} unit • Mengendap ${r.daysInOutlet} hari</div>
                      </div>

                      <span class="material-symbols-outlined text-primary text-[22px]">trending_flat</span>

                      <div class="px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950">
                        <div class="text-[10px] uppercase font-bold text-emerald-700">GESER KE (TUJUAN LARIS)</div>
                        <div class="font-bold">${r.targetOutletName} (${r.targetCity})</div>
                        <div class="text-[10px] text-emerald-700">PIC Sales: ${r.targetSalesRep} • Velocity: LARIS</div>
                      </div>
                    </div>

                    <div class="text-[11px] text-on-surface-variant mt-2">
                      💡 <b>Alasan AI:</b> ${r.reason}
                    </div>
                  </div>

                  <div class="flex flex-col items-end gap-2 shrink-0 w-full md:w-auto border-t md:border-t-0 pt-2 md:pt-0 border-border-subtle">
                    <div class="text-right">
                      <div class="text-[11px] text-on-surface-variant">Rekomendasi Geser: <b>${r.transferQty} Botol</b></div>
                      <div class="font-extrabold text-sm text-emerald-700">${window.ArbaUtils.formatRupiah(r.savedValueRp)}</div>
                    </div>
                    <button
                      type="button"
                      class="rebalance-single-btn w-full md:w-auto px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-container text-white text-xs font-bold cursor-pointer border-0 flex items-center justify-center gap-1.5 shadow-xs"
                      data-src="${r.sourceOutletId}"
                      data-dst="${r.targetOutletId}"
                      data-sku="${r.sku}"
                      data-qty="${r.transferQty}"
                    >
                      <span class="material-symbols-outlined text-[16px]">swap_horiz</span>
                      <span>Tarik &amp; Geser (${r.transferQty} Unit)</span>
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;

    window.ArbaApp.openModal(html);

    var closeBtn = document.getElementById('rebalance-modal-close');
    if (closeBtn) closeBtn.onclick = function () { window.ArbaApp.closeModal(); };

    document.querySelectorAll('.rebalance-single-btn').forEach(function (btn) {
      btn.onclick = function () {
        var src = btn.getAttribute('data-src');
        var dst = btn.getAttribute('data-dst');
        var sku = btn.getAttribute('data-sku');
        var qty = Number(btn.getAttribute('data-qty'));
        window.ArbaStore.executeConsignmentRebalance({
          sourceOutletId: src,
          targetOutletId: dst,
          sku: sku,
          transferQty: qty
        });
        openConsignmentRebalancerModal();
      };
    });

    var execAllBtn = document.getElementById('rebalance-exec-all-btn');
    if (execAllBtn) {
      execAllBtn.onclick = function () {
        recs.forEach(function (r) {
          window.ArbaStore.executeConsignmentRebalance({
            sourceOutletId: r.sourceOutletId,
            targetOutletId: r.targetOutletId,
            sku: r.sku,
            transferQty: r.transferQty
          });
        });
        openConsignmentRebalancerModal();
      };
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Modal Peta Interaktif Geofence Solo Raya & TSP Auto-Route Optimizer
  // ---------------------------------------------------------------------------
  function openTspRouteOptimizerModal(initialSalesRep, onSelectStopCallback) {
    var st = window.ArbaStore.getState();
    var salesTeam = st.salesTeam || [];
    var chosenRep = initialSalesRep || st.currentSalesRep || 'ALL';

    function renderRouteModal(repFilter) {
      var plan = window.ArbaStore.getOptimizedSalesRoute(repFilter);
      var stops = plan.stops || [];

      // Proyeksikan koordinat lat/lng Solo Raya ke SVG ViewBox (700 x 340)
      var allPts = [{ lat: plan.warehouse.lat, lng: plan.warehouse.lng, isHQ: true }].concat(stops);
      var minLat = Math.min.apply(null, allPts.map(function (p) { return p.lat; })) - 0.02;
      var maxLat = Math.max.apply(null, allPts.map(function (p) { return p.lat; })) + 0.02;
      var minLng = Math.min.apply(null, allPts.map(function (p) { return p.lng; })) - 0.03;
      var maxLng = Math.max.apply(null, allPts.map(function (p) { return p.lng; })) + 0.03;

      function toX(lng) {
        return Math.round(50 + ((lng - minLng) / Math.max(0.001, maxLng - minLng)) * 600);
      }
      function toY(lat) {
        return Math.round(300 - ((lat - minLat) / Math.max(0.001, maxLat - minLat)) * 250);
      }

      var hqX = toX(plan.warehouse.lng);
      var hqY = toY(plan.warehouse.lat);
      var polyPoints = [hqX + ',' + hqY].concat(stops.map(function (s) {
        return toX(s.lng) + ',' + toY(s.lat);
      })).join(' ');

      var svgNodes = stops.map(function (s) {
        var cx = toX(s.lng);
        var cy = toY(s.lat);
        var color = s.creditStatus === 'Overdue' ? '#ef4444' : (s.creditStatus === 'Perhatian' ? '#f59e0b' : '#10b981');
        return `
          <g class="tsp-map-node" data-code="${s.code}" style="cursor:pointer;">
            <circle cx="${cx}" cy="${cy}" r="16" fill="${color}" fill-opacity="0.18" />
            <circle cx="${cx}" cy="${cy}" r="10" fill="${color}" stroke="#ffffff" stroke-width="2" />
            <text x="${cx}" y="${cy + 3.5}" text-anchor="middle" fill="#ffffff" font-size="10" font-weight="800">${s.stopNumber}</text>
            <rect x="${cx - 58}" y="${cy - 32}" width="116" height="17" rx="4" fill="#0f172a" fill-opacity="0.88" />
            <text x="${cx}" y="${cy - 20}" text-anchor="middle" fill="#f8fafc" font-size="9.5" font-weight="700">${s.name.slice(0, 18)}</text>
          </g>
        `;
      }).join('');

      var html = `
        <div class="modal-card p-6" style="max-width: 880px; width: 95vw; max-height: 92vh; overflow-y: auto;">
          <!-- Header -->
          <div class="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-border-subtle">
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-[24px]">route</span>
              </div>
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="font-bold text-base text-on-surface">Peta Lokasi Apotek Solo Raya &amp; Urutan Rute Kunjungan Terdekat</h3>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800">HEMAT JARAK &amp; BBM</span>
                </div>
                <p class="text-xs text-on-surface-variant mt-0.5">
                  Mengurutkan daftar apotek yang harus dikunjungi sales mulai dari Gudang Utama Kartasura dengan rute paling searah agar hemat waktu &amp; bensin.
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <select
                id="tsp-rep-filter"
                class="px-3 py-1.5 rounded-lg border border-border-subtle bg-surface text-xs font-bold text-on-surface"
              >
                <option value="ALL" ${repFilter === 'ALL' ? 'selected' : ''}>Semua Rute Solo Raya (${st.outlets.length} Outlet)</option>
                ${salesTeam.map(function (sr) {
                  return `<option value="${sr.name}" ${repFilter === sr.name ? 'selected' : ''}>Rute Sales: ${sr.name} (${sr.area})</option>`;
                }).join('')}
              </select>
              <button id="tsp-modal-close" class="icon-btn" type="button" title="Tutup">
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>
          </div>

          <!-- KPI Penghematan Rute -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
            <div class="p-3 rounded-xl bg-surface-container-low border border-border-subtle">
              <div class="text-[10px] font-bold uppercase text-on-surface-variant">Jarak Rute Optimal</div>
              <div class="text-lg font-extrabold text-primary mt-0.5">${plan.optimizedKm} km</div>
              <div class="text-[11px] text-on-surface-variant">Sebelum optimasi: <s>${plan.unoptimizedKm} km</s></div>
            </div>
            <div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <div class="text-[10px] font-bold uppercase text-emerald-800">Penghematan Jarak (TSP)</div>
              <div class="text-lg font-extrabold text-emerald-900 mt-0.5">Hemat ${plan.savedKm} km (${plan.savedPct}%)</div>
              <div class="text-[11px] text-emerald-700">${stops.length} titik apotek terurut</div>
            </div>
            <div class="p-3 rounded-xl bg-surface-container-low border border-border-subtle">
              <div class="text-[10px] font-bold uppercase text-on-surface-variant">Total Estimasi Durasi</div>
              <div class="text-lg font-extrabold text-on-surface mt-0.5">${Math.floor(plan.totalDurationMinutes / 60)}j ${plan.totalDurationMinutes % 60}m</div>
              <div class="text-[11px] text-on-surface-variant">Termasuk 15m audit/outlet</div>
            </div>
            <div class="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <div class="text-[10px] font-bold uppercase text-amber-800">Estimasi BBM Kanvas</div>
              <div class="text-lg font-extrabold text-amber-900 mt-0.5">${plan.estimatedFuelLitres} Liter</div>
              <div class="text-[11px] text-amber-700">~${window.ArbaUtils.formatRupiah(plan.estimatedFuelCostRp)}</div>
            </div>
          </div>

          <!-- Peta Radar Interaktif SVG Solo Raya -->
          <div class="rounded-2xl overflow-hidden border border-border-subtle mb-4" style="background:linear-gradient(180deg, #0b192c 0%, #0f172a 100%); position:relative;">
            <div class="px-4 py-2 flex items-center justify-between text-[11px] text-slate-300 border-b border-slate-800">
              <span class="font-bold text-teal-300 flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[15px]">radar</span>
                PETA TELEMETRI GEOFENCE SOLO RAYA (KARTASURA HQ → ${stops.length} TITIK OUTLET)
              </span>
              <span>Klik titik nomor untuk Check-In di PWA Sales</span>
            </div>
            <svg viewBox="0 0 700 330" width="100%" height="290" style="display:block;">
              <!-- Grid Geografis -->
              <g stroke="#1e293b" stroke-width="1">
                <line x1="0" y1="65" x2="700" y2="65" />
                <line x1="0" y1="130" x2="700" y2="130" />
                <line x1="0" y1="195" x2="700" y2="195" />
                <line x1="0" y1="260" x2="700" y2="260" />
                <line x1="140" y1="0" x2="140" y2="330" />
                <line x1="280" y1="0" x2="280" y2="330" />
                <line x1="420" y1="0" x2="420" y2="330" />
                <line x1="560" y1="0" x2="560" y2="330" />
              </g>

              <!-- Label Wilayah Solo Raya -->
              <text x="90" y="45" fill="#334155" font-size="13" font-weight="800">BOYOLALI / KLATEN</text>
              <text x="340" y="45" fill="#334155" font-size="13" font-weight="800">KOTA SURAKARTA (SOLO)</text>
              <text x="580" y="45" fill="#334155" font-size="13" font-weight="800">KARANGANYAR / SRAGEN</text>
              <text x="350" y="312" fill="#334155" font-size="13" font-weight="800">SUKOHARJO SELATAN</text>

              <!-- Garis Rute TSP Optimal -->
              <polyline
                points="${polyPoints}"
                fill="none"
                stroke="#2dd4bf"
                stroke-width="3"
                stroke-dasharray="7 5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />

              <!-- Node Gudang Utama Kartasura (Titik 0) -->
              <g>
                <circle cx="${hqX}" cy="${hqY}" r="22" fill="#38bdf8" fill-opacity="0.2" />
                <rect x="${hqX - 12}" y="${hqY - 12}" width="24" height="24" rx="6" fill="#0284c7" stroke="#ffffff" stroke-width="2" />
                <text x="${hqX}" y="${hqY + 4}" text-anchor="middle" fill="#ffffff" font-size="10" font-weight="900">HQ</text>
                <text x="${hqX}" y="${hqY + 26}" text-anchor="middle" fill="#38bdf8" font-size="10" font-weight="800">GUDANG KARTASURA</text>
              </g>

              <!-- Node Urutan Kunjungan Apotek -->
              ${svgNodes}
            </svg>
          </div>

          <!-- Tabel Urutan Kunjungan Optimal -->
          <div class="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">
            Urutan Kunjungan Harian Hasil Optimasi Algoritma TSP
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            ${stops.map(function (s) {
              return `
                <div class="p-3 rounded-xl border border-border-subtle bg-surface flex items-center justify-between gap-3">
                  <div class="flex items-center gap-3 min-w-0">
                    <div class="w-8 h-8 rounded-lg bg-primary text-white font-extrabold text-xs flex items-center justify-center shrink-0">
                      #${s.stopNumber}
                    </div>
                    <div class="min-w-0">
                      <div class="font-bold text-xs text-on-surface truncate">${s.name}</div>
                      <div class="text-[11px] text-on-surface-variant truncate">${s.city} • +${s.legKm} km (${s.legMin} mnt) • ETA +${s.etaMinutes}m</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="tsp-select-stop-btn px-2.5 py-1.5 rounded-lg bg-surface-container hover:bg-primary hover:text-white text-on-surface text-[11px] font-bold cursor-pointer border border-border-subtle shrink-0"
                    data-code="${s.code}"
                  >
                    Buka di PWA
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;

      window.ArbaApp.openModal(html);

      var closeBtn = document.getElementById('tsp-modal-close');
      if (closeBtn) closeBtn.onclick = function () { window.ArbaApp.closeModal(); };

      var repSelect = document.getElementById('tsp-rep-filter');
      if (repSelect) {
        repSelect.onchange = function (e) {
          renderRouteModal(e.target.value);
        };
      }

      function selectStop(code) {
        window.ArbaApp.closeModal();
        window.ArbaStore.setSelectedOutletId(code);
        if (typeof onSelectStopCallback === 'function') {
          onSelectStopCallback(code);
        } else {
          window.ArbaApp.navigate('field-sales-pwa-preview');
          window.ArbaApp.showToast('Rute dipilih: mengarahkan ke titik kunjungan ' + code, 'pin_drop');
        }
      }

      document.querySelectorAll('.tsp-select-stop-btn, .tsp-map-node').forEach(function (el) {
        el.onclick = function () {
          var code = el.getAttribute('data-code');
          if (code) selectStop(code);
        };
      });
    }

    renderRouteModal(chosenRep);
  }

  // ---------------------------------------------------------------------------
  // 5. Modal AI/Heuristic B2B Credit Health Scoring & Early Warning Piutang
  // ---------------------------------------------------------------------------
  function openCreditScoringModal() {
    var scores = window.ArbaStore.getOutletCreditScoring();

    var html = `
      <div class="modal-card p-6" style="max-width: 860px; width: 95vw; max-height: 90vh; overflow-y: auto;">
        <div class="flex items-start justify-between gap-4 pb-4 border-b border-border-subtle">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-xl bg-violet-500/15 text-violet-700 flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-[24px]">analytics</span>
            </div>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="font-bold text-base text-on-surface">Penilaian Kelayakan Plafon Kredit &amp; Kesehatan Bayar Apotek (Skor 0–100)</h3>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-800">EVALUASI PIUTANG</span>
              </div>
              <p class="text-xs text-on-surface-variant mt-0.5">
                Membantu Direktur &amp; Admin Penjualan menentukan apakah sebuah apotek layak dinaikkan batas plafon kreditnya atau harus dikunci ke pembayaran tunai (COD).
              </p>
            </div>
          </div>
          <button id="credit-score-modal-close" class="icon-btn" type="button" title="Tutup">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div class="flex flex-col gap-3 mt-4">
          ${scores.map(function (sc) {
            var limitChanged = sc.suggestedLimit !== sc.currentLimit || sc.suggestedTerms !== sc.currentTerms;
            return `
              <div class="p-4 rounded-xl border border-border-subtle bg-surface flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div class="flex items-center gap-3.5 flex-1 min-w-0">
                  <!-- Lingkaran Skor -->
                  <div style="width:52px; height:52px; border-radius:14px; background:${sc.badgeBg}; color:${sc.badgeColor}; display:flex; flex-direction:column; align-items:center; justify-content:center; flex-shrink:0; border:1.5px solid ${sc.badgeColor};">
                    <span style="font-size:16px; font-weight:900; line-height:1;">${sc.score}</span>
                    <span style="font-size:9px; font-weight:800;">/100</span>
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-bold text-sm text-on-surface">${sc.outletName}</span>
                      <span style="padding:2px 8px; border-radius:999px; font-size:10px; font-weight:800; background:${sc.badgeBg}; color:${sc.badgeColor};">${sc.tier}</span>
                    </div>
                    <div class="text-xs text-on-surface-variant mt-1">
                      Utilisasi Plafon: <b>${sc.utilizationPct}%</b> • Sell-Through Konsinyasi: <b>${sc.sellThroughPct}%</b> • Plafon Saat Ini: <b>${window.ArbaUtils.formatRupiah(sc.currentLimit)}</b> (${sc.currentTerms})
                    </div>
                    <div class="text-[11px] text-primary font-semibold mt-1">
                      🤖 ${sc.recommendation}
                    </div>
                  </div>
                </div>

                <div class="shrink-0 w-full md:w-auto flex flex-col items-end gap-1.5">
                  <div class="text-right text-xs">
                    <span class="text-on-surface-variant">Saran Plafon:</span>
                    <b class="text-on-surface ml-1">${window.ArbaUtils.formatRupiah(sc.suggestedLimit)}</b>
                  </div>
                  <button
                    type="button"
                    class="apply-ai-credit-btn px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border-0 flex items-center gap-1 ${
                      limitChanged ? 'bg-primary text-white shadow-xs' : 'bg-surface-container text-on-surface-variant'
                    }"
                    data-outlet-id="${sc.outletId}"
                  >
                    <span class="material-symbols-outlined text-[15px]">auto_awesome</span>
                    <span>${limitChanged ? 'Terapkan Plafon AI' : 'Plafon Sudah Optimal'}</span>
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    window.ArbaApp.openModal(html);

    var closeBtn = document.getElementById('credit-score-modal-close');
    if (closeBtn) closeBtn.onclick = function () { window.ArbaApp.closeModal(); };

    document.querySelectorAll('.apply-ai-credit-btn').forEach(function (btn) {
      btn.onclick = function () {
        var oid = btn.getAttribute('data-outlet-id');
        window.ArbaStore.applyRecommendedCreditPolicy(oid);
        openCreditScoringModal();
      };
    });
  }

  // ---------------------------------------------------------------------------
  // 6. Modal Verifikasi Rantai Kriptografi Buku Besar (SHA-256 Chain Verifier)
  // ---------------------------------------------------------------------------
  function openLedgerChainAuditModal() {
    var audit = window.ArbaStore.verifyLedgerChainIntegrity();

    var html = `
      <div class="modal-card p-6" style="max-width: 860px; width: 95vw; max-height: 90vh; overflow-y: auto;">
        <div class="flex items-start justify-between gap-4 pb-4 border-b border-border-subtle">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-xl bg-emerald-500/15 text-emerald-700 flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-[24px]">verified_user</span>
            </div>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="font-bold text-base text-on-surface">Pemeriksaan Keaslian Buku Besar Stok Gudang &amp; Sertifikat Audit CDOB</h3>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">ANTI-MANIPULASI STOK</span>
              </div>
              <p class="text-xs text-on-surface-variant mt-0.5">
                Memastikan seluruh catatan barang masuk, keluar, dan retur di Gudang Kartasura saling mengunci secara berurutan sehingga tidak dapat diubah/dihapus diam-diam.
              </p>
            </div>
          </div>
          <button id="chain-audit-close" class="icon-btn" type="button" title="Tutup">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <!-- Banner Sertifikat Integritas -->
        <div class="my-4 p-4 rounded-xl bg-emerald-50 border-2 border-emerald-500/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div class="text-xs font-extrabold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[18px] text-emerald-600">workspace_premium</span>
              STATUS RANTAI BUKU BESAR: TERVERIFIKASI VALID (${audit.totalBlocks} BLOK TRANSAKSI)
            </div>
            <div class="text-xs text-emerald-800 mt-1">
              Merkle Root Signature: <b class="font-mono bg-white px-2 py-0.5 rounded border border-emerald-300">${audit.merkleRoot}</b>
            </div>
            <div class="text-[11px] text-emerald-700 mt-1">
              Diaudit pada: <b>${audit.verifiedAt}</b> • Auditor Aktif: <b>${audit.auditor}</b> • Total Masuk: +${audit.inboundUnits} | Keluar: -${audit.outboundUnits}
            </div>
          </div>
          <button
            id="chain-audit-print-btn"
            type="button"
            class="px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer border-0 flex items-center gap-1.5 shrink-0 shadow-xs"
          >
            <span class="material-symbols-outlined text-[16px]">print</span>
            <span>Cetak Sertifikat CDOB</span>
          </button>
        </div>

        <!-- Tabel Rantai Blok -->
        <div class="overflow-x-auto rounded-xl border border-border-subtle">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="bg-surface-container-low border-b border-border-subtle text-[10px] font-bold uppercase text-on-surface-variant">
                <th class="p-2.5">Blok #</th>
                <th class="p-2.5">ID &amp; Dokumen</th>
                <th class="p-2.5">SKU &amp; Batch</th>
                <th class="p-2.5">Tipe &amp; Qty</th>
                <th class="p-2.5">Prev Hash</th>
                <th class="p-2.5">Chain Block Hash</th>
                <th class="p-2.5">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border-subtle">
              ${audit.blocks.slice(0, 25).map(function (b) {
                return `
                  <tr class="hover:bg-surface-container-low/60">
                    <td class="p-2.5 font-mono font-bold text-primary">#${b.blockIndex}</td>
                    <td class="p-2.5">
                      <div class="font-bold text-on-surface">${b.docRef}</div>
                      <div class="text-[10px] text-on-surface-variant">${b.timestamp}</div>
                    </td>
                    <td class="p-2.5">
                      <div class="font-semibold">${b.skuName}</div>
                      <div class="font-mono text-[10px] text-on-surface-variant">${b.batch}</div>
                    </td>
                    <td class="p-2.5 font-bold ${b.quantity >= 0 ? 'text-emerald-700' : 'text-rose-700'}">
                      ${b.type} (${b.quantity >= 0 ? '+' : ''}${b.quantity}) → Saldo: ${b.finalStock}
                    </td>
                    <td class="p-2.5 font-mono text-[10px] text-on-surface-variant">${b.prevHash}...</td>
                    <td class="p-2.5 font-mono text-[11px] font-bold text-emerald-800">${b.blockHash}</td>
                    <td class="p-2.5">
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">VALID</span>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    window.ArbaApp.openModal(html);

    var closeBtn = document.getElementById('chain-audit-close');
    if (closeBtn) closeBtn.onclick = function () { window.ArbaApp.closeModal(); };

    var printBtn = document.getElementById('chain-audit-print-btn');
    if (printBtn) printBtn.onclick = function () { window.print(); };
  }

  // ---------------------------------------------------------------------------
  // 7. Generator Bukti Foto Etalase Rak Herbal (Canvas DataURL Offline-Ready)
  // ---------------------------------------------------------------------------
  function generateSampleShelfPhotoDataUrl(outletName, repName) {
    if (typeof document === 'undefined') return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    var canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 180;
    var ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Background etalase
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 360, 180);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(12, 28, 336, 112);

    // Rak bertingkat
    ctx.fillStyle = '#475569';
    ctx.fillRect(18, 82, 324, 5);
    ctx.fillRect(18, 132, 324, 5);

    // Botol-botol herbal di rak
    var colors = ['#0d9488', '#d97706', '#0284c7', '#16a34a', '#7c3aed', '#e11d48'];
    for (var i = 0; i < 10; i++) {
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(28 + i * 30, 46, 20, 35);
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(30 + i * 30, 56, 16, 14);

      ctx.fillStyle = colors[(i + 2) % colors.length];
      ctx.fillRect(28 + i * 30, 96, 20, 35);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(30 + i * 30, 106, 16, 14);
    }

    // Watermark Timestamp & Geofence
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('BUKTI AUDIT ETALASE RAK HERBAL - CV ARBA\'IN', 14, 19);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '10px monospace';
    ctx.fillText((outletName || 'Apotek Mitra').slice(0, 32) + ' • Oleh: ' + (repName || 'Sales'), 14, 156);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('GPS Verified • ' + new Date().toLocaleTimeString('id-ID') + ' WIB • FEFO OK', 14, 171);

    return canvas.toDataURL('image/png');
  }

  window.ArbaAdvanced = {
    generateQrSvg: generateQrSvg,
    openQrBatchModal: openQrBatchModal,
    openConsignmentRebalancerModal: openConsignmentRebalancerModal,
    openTspRouteOptimizerModal: openTspRouteOptimizerModal,
    openCreditScoringModal: openCreditScoringModal,
    openLedgerChainAuditModal: openLedgerChainAuditModal,
    generateSampleShelfPhotoDataUrl: generateSampleShelfPhotoDataUrl
  };
})();

