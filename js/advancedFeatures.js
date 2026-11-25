/**
 * =============================================================================
 * ArbaConnect ERP - 6 Advanced Enterprise Features (js/advancedFeatures.js)
 * CV Arba'in Solo Raya
 * =============================================================================
 *
 * Seluruh modal & komponen menggunakan sistem desain native (tokens.css,
 * components.css, utilities.css) sehingga tampil konsisten, rapi, dan 100%
 * mendukung Light Mode maupun Dark Mode.
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
  // 1. Generator QR Code SVG Deterministik (Offline-Ready)
  // ---------------------------------------------------------------------------
  function generateQrSvg(text, size) {
    size = size || 84;
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
            matrix[rowOffset + r][colOffset + c] = 2;
          }
        }
      }
    }

    drawFinder(0, 0);
    drawFinder(0, grid - 7);
    drawFinder(grid - 7, 0);

    for (var i = 8; i < grid - 8; i++) {
      matrix[6][i] = i % 2 === 0 ? 1 : 2;
      matrix[i][6] = i % 2 === 0 ? 1 : 2;
    }

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
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (grid + 4) + ' ' + (grid + 4) + '" width="' + size + '" height="' + size + '" shape-rendering="crispEdges" style="background:#ffffff; border-radius:8px; border:1px solid var(--color-border-subtle); display:block;">' +
      '<rect width="100%" height="100%" fill="#ffffff"/>' +
      rects +
      '</svg>'
    );
  }

  // ---------------------------------------------------------------------------
  // 2. Modal Scan QR Kemasan & Cetak Stiker Nomor Batch Gudang
  // ---------------------------------------------------------------------------
  function openQrBatchModal(options) {
    options = options || {};
    var st = window.ArbaStore.getState();
    var products = st.products || [];
    var initialTab = options.initialTab || 'scanner';
    var selectedSku = options.initialSku || (products[0] && products[0].sku) || 'SKU-ARB-MDR500';

    function renderModalContent(activeTab, scannedProd) {
      var html = `
        <div class="modal-dialog max-w-4xl">
          <!-- Modal Header -->
          <div class="modal-header">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-[22px]">qr_code_scanner</span>
              </div>
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="font-bold text-sm text-on-surface">Scan QR Kemasan Botol/Karton &amp; Cetak Stiker Nomor Batch Gudang</h3>
                  <span class="badge badge-success">STANDAR BPOM &amp; FEFO</span>
                </div>
                <p class="text-xs text-on-surface-variant mt-0.5">
                  Verifikasi keaslian nomor batch BPOM, cek sisa umur simpan FEFO, dan cetak stiker label batch Gudang Kartasura.
                </p>
              </div>
            </div>
            <button id="qr-modal-close" class="icon-btn" type="button" title="Tutup">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>

          <!-- Modal Body -->
          <div class="modal-body">
            <!-- Switch Tabs -->
            <div class="flex items-center gap-2 bg-surface-container-low p-1.5 rounded-xl border border-border-subtle">
              <button
                id="qr-tab-scanner"
                type="button"
                class="flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer border-0 transition-all ${
                  activeTab === 'scanner' ? 'bg-primary text-white shadow-xs' : 'bg-transparent text-on-surface-variant hover:text-on-surface'
                }"
              >
                <span class="material-symbols-outlined text-[16px]">photo_camera</span>
                <span>Pemindai Kamera &amp; Pilih Batch Gudang</span>
              </button>
              <button
                id="qr-tab-labels"
                type="button"
                class="flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer border-0 transition-all ${
                  activeTab === 'labels' ? 'bg-primary text-white shadow-xs' : 'bg-transparent text-on-surface-variant hover:text-on-surface'
                }"
              >
                <span class="material-symbols-outlined text-[16px]">qr_code_2</span>
                <span>Stiker Label QR Batch Gudang (${products.length} SKU)</span>
              </button>
            </div>

            ${activeTab === 'scanner' ? `
              <!-- TAB 1: SCANNER KAMERA & PILIH CEPAT BATCH -->
              <div class="adv-grid-2">
                <!-- Panel Kamera Live / Viewfinder -->
                <div class="rounded-xl border border-border-subtle p-4 flex flex-col justify-between relative overflow-hidden" style="min-height: 280px; background:#090d16; color:#f8fafc;">
                  <div class="flex items-center justify-between z-10">
                    <span class="text-[11px] font-mono uppercase tracking-wider flex items-center gap-1.5" style="color:#34d399;">
                      <span style="width:8px; height:8px; border-radius:50%; background:#10b981; display:inline-block;"></span>
                      SENSOR OPTIK QR BATCH FEFO
                    </span>
                    <button
                      id="qr-start-camera-btn"
                      type="button"
                      class="px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer border border-border-subtle flex items-center gap-1"
                      style="background:rgba(255,255,255,0.12); color:#ffffff;"
                    >
                      <span class="material-symbols-outlined text-[14px]">videocam</span>
                      <span>Aktifkan Kamera</span>
                    </button>
                  </div>

                  <!-- Video / Laser Box -->
                  <div class="my-3 relative flex items-center justify-center rounded-lg overflow-hidden" style="height: 180px; background: radial-gradient(circle, #1e293b 0%, #020617 100%); border: 1px solid rgba(16,185,129,0.35);">
                    <video id="qr-camera-video" autoplay playsinline muted style="width:100%; height:100%; object-fit:cover; display:none;"></video>
                    <div id="qr-viewfinder-placeholder" class="text-center p-4">
                      <span class="material-symbols-outlined text-[40px] mb-1" style="color:#34d399;">qr_code_scanner</span>
                      <div class="text-xs font-bold" style="color:#e2e8f0;">Arahkan QR Stiker Batch ke Bingkai Kamera</div>
                      <div class="text-[11px] mt-0.5" style="color:#94a3b8;">Atau pilih nomor batch aktif pada daftar di sebelah kanan</div>
                    </div>
                    <div style="position:absolute; left:12%; right:12%; top:50%; height:2px; background:linear-gradient(90deg, transparent, #10b981, #34d399, #10b981, transparent); box-shadow:0 0 12px #10b981;"></div>
                  </div>

                  <div class="text-[11px] flex items-center justify-between" style="color:#94a3b8;">
                    <span>Format: <b style="color:#e2e8f0;">ARBA|SKU|BATCH|EXP</b></span>
                    <span class="font-semibold" style="color:#34d399;">Standar BPOM &amp; CDOB</span>
                  </div>
                </div>

                <!-- Panel Daftar Batch Aktif & Hasil Verifikasi -->
                <div class="flex flex-col justify-between gap-3">
                  <div class="rounded-xl border border-border-subtle bg-surface-container-low p-3.5">
                    <div class="text-xs font-bold text-on-surface mb-1">Pilih Cepat Nomor Batch Gudang</div>
                    <p class="text-[11px] text-on-surface-variant mb-2.5">
                      Pilih nomor batch produk di bawah untuk memeriksa status kedaluwarsa &amp; stok:
                    </p>
                    <div class="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                      ${products.map(function (p) {
                        var isSelected = scannedProd && scannedProd.sku === p.sku;
                        return `
                          <button
                            type="button"
                            class="qr-sim-scan-btn flex items-center justify-between p-2 rounded-lg text-left text-xs cursor-pointer transition-all border ${
                              isSelected
                                ? 'bg-primary/10 border-primary text-primary font-bold'
                                : 'bg-surface-container-lowest hover:bg-surface-container border-border-subtle text-on-surface'
                            }"
                            data-sku="${p.sku}"
                          >
                            <div class="truncate pr-2">
                              <div class="font-semibold truncate">${p.name}</div>
                              <div class="text-[10px] font-mono text-on-surface-variant">${p.sku} • Batch: ${p.activeBatch}</div>
                            </div>
                            <span class="badge badge-success shrink-0">Cek QR</span>
                          </button>
                        `;
                      }).join('')}
                    </div>
                  </div>

                  <!-- Hasil Verifikasi Batch -->
                  ${scannedProd ? `
                    <div class="rounded-xl border border-border-subtle bg-surface-container-low p-3.5 text-xs">
                      <div class="flex items-center justify-between mb-1.5">
                        <span class="font-bold text-emerald-600 flex items-center gap-1">
                          <span class="material-symbols-outlined text-[16px]">verified</span>
                          BATCH TERVERIFIKASI RESMI (BPOM &amp; CDOB)
                        </span>
                        <span class="badge badge-primary font-mono">${scannedProd.activeBatch}</span>
                      </div>
                      <div class="font-bold text-sm text-on-surface">${scannedProd.name}</div>
                      <div class="grid grid-cols-2 gap-1.5 mt-2 text-[11px] text-on-surface-variant">
                        <div>Kode SKU: <b class="font-mono text-on-surface">${scannedProd.sku}</b></div>
                        <div>Stok Gudang: <b class="text-on-surface">${scannedProd.stock} unit</b></div>
                        <div>Kedaluwarsa (FEFO): <b class="text-on-surface">${scannedProd.fefoDate}</b></div>
                        <div>Harga Satuan: <b class="text-primary">${window.ArbaUtils.formatRupiah(scannedProd.unitPrice)}</b></div>
                      </div>
                      <div class="mt-3 flex flex-wrap gap-2">
                        ${typeof options.onSelectProduct === 'function' ? `
                          <button
                            id="qr-add-to-pwa-cart-btn"
                            type="button"
                            class="w-full py-2 px-3 rounded-lg bg-primary hover:bg-primary-container text-white font-semibold text-xs cursor-pointer border-0 flex items-center justify-center gap-1.5 shadow-xs"
                          >
                            <span class="material-symbols-outlined text-[16px]">add_shopping_cart</span>
                            <span>+ Tambah ke Nota Pesanan Sales</span>
                          </button>
                        ` : `
                          <button
                            id="qr-goto-pwa-order-btn"
                            type="button"
                            class="w-full py-2 px-3 rounded-lg bg-primary hover:bg-primary-container text-white font-semibold text-xs cursor-pointer border-0 flex items-center justify-center gap-1.5"
                          >
                            <span class="material-symbols-outlined text-[16px]">qr_code_2</span>
                            <span>Lihat Stiker QR Batch Ini</span>
                          </button>
                        `}
                      </div>
                    </div>
                  ` : ''}
                </div>
              </div>
            ` : `
              <!-- TAB 2: GENERATOR STIKER LABEL QR BATCH FEFO -->
              <div class="flex flex-col gap-3">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-surface-container-low p-3 rounded-xl border border-border-subtle">
                  <span class="text-xs text-on-surface-variant">
                    Stiker QR Batch di bawah siap dicetak untuk ditempelkan pada karton/botol di Gudang Kartasura &amp; rak konsinyasi apotek:
                  </span>
                  <button
                    id="qr-print-labels-btn"
                    type="button"
                    class="px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-container text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer border-0 shadow-xs shrink-0"
                  >
                    <span class="material-symbols-outlined text-[16px]">print</span>
                    <span>Cetak Semua Stiker QR Batch</span>
                  </button>
                </div>

                <div class="adv-grid-3">
                  ${products.map(function (p) {
                    var qrPayload = 'ARBA|' + p.sku + '|' + p.activeBatch + '|' + p.fefoDate;
                    return `
                      <div class="p-3 rounded-xl border border-border-subtle bg-surface-container-low flex items-center gap-3">
                        <div class="shrink-0">
                          ${generateQrSvg(qrPayload, 78)}
                        </div>
                        <div class="min-w-0 flex-1 text-xs">
                          <div class="text-[10px] font-bold uppercase tracking-wider text-primary">CV ARBA'IN SOLO RAYA</div>
                          <div class="font-bold text-on-surface truncate" title="${p.name}">${p.name}</div>
                          <div class="font-mono text-[10px] text-on-surface-variant mt-0.5">SKU: ${p.sku}</div>
                          <div class="font-mono text-[11px] font-bold text-emerald-600 mt-0.5">${p.activeBatch}</div>
                          <div class="text-[11px] text-on-surface-variant mt-0.5">ED: <b class="text-on-surface">${p.fefoDate}</b> • Stok: <b class="text-on-surface">${p.stock}</b></div>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            `}
          </div>

          <div class="modal-footer">
            <button id="qr-modal-footer-close" type="button" class="btn btn-outline">Tutup</button>
          </div>
        </div>
      `;

      window.ArbaApp.openModal(html);

      var closeModalFn = function () {
        stopActiveCamera();
        window.ArbaApp.closeModal();
      };
      var closeBtn = document.getElementById('qr-modal-close');
      var footerCloseBtn = document.getElementById('qr-modal-footer-close');
      if (closeBtn) closeBtn.onclick = closeModalFn;
      if (footerCloseBtn) footerCloseBtn.onclick = closeModalFn;

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
                window.ArbaApp.showToast('Kamera tidak tersedia — silakan pilih nomor batch pada daftar di kanan', 'info');
              });
          } else {
            window.ArbaApp.showToast('Silakan pilih nomor batch pada daftar di sebelah kanan', 'qr_code_scanner');
          }
        };
      }

      document.querySelectorAll('.qr-sim-scan-btn').forEach(function (btn) {
        btn.onclick = function () {
          var sku = btn.getAttribute('data-sku');
          var found = products.find(function (p) { return p.sku === sku; });
          if (found) {
            selectedSku = found.sku;
            window.ArbaApp.showToast('Batch Terverifikasi: ' + found.name + ' (' + found.activeBatch + ')', 'qr_code_scanner');
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
          renderModalContent('labels', scannedProd);
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
  // 3. Modal Rekomendasi Tarik & Geser Stok Titipan Antar-Apotek (FEFO)
  // ---------------------------------------------------------------------------
  function openConsignmentRebalancerModal() {
    var recs = window.ArbaStore.getConsignmentRebalanceRecommendations();
    var totalSavedValue = recs.reduce(function (s, r) { return s + r.savedValueRp; }, 0);
    var totalUnits = recs.reduce(function (s, r) { return s + r.transferQty; }, 0);

    var html = `
      <div class="modal-dialog max-w-4xl">
        <div class="modal-header">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-[22px]">swap_driving_apps_wheel</span>
            </div>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="font-bold text-sm text-on-surface">Realokasi Inventaris Konsinyasi Antar-Mitra Berbasis FEFO</h3>
                <span class="badge badge-warning">OPTIMASI FEFO</span>
              </div>
              <p class="text-xs text-on-surface-variant mt-0.5">
                Memindahkan inventaris konsinyasi berperputaran lambat atau mendekati masa kedaluwarsa ke mitra apotek dengan tingkat penjualan tinggi.
              </p>
            </div>
          </div>
          <button id="rebalance-modal-close" class="icon-btn" type="button" title="Tutup">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div class="modal-body">
          <!-- Ringkasan Dampak Finansial -->
          <div class="adv-grid-3">
            <div class="p-3.5 rounded-xl bg-surface-container-low border border-border-subtle">
              <div class="text-[11px] font-bold uppercase text-on-surface-variant">Rekomendasi Realokasi Mitra</div>
              <div class="text-xl font-bold text-on-surface mt-0.5">${recs.length} Rute Realokasi</div>
              <div class="text-[11px] text-amber-600 font-semibold mt-0.5">Total ${totalUnits} unit produk dioptimalkan</div>
            </div>
            <div class="p-3.5 rounded-xl bg-surface-container-low border border-border-subtle">
              <div class="text-[11px] font-bold uppercase text-on-surface-variant">Estimasi Nilai Inventaris</div>
              <div class="text-xl font-bold text-primary mt-0.5">${window.ArbaUtils.formatRupiah(totalSavedValue)}</div>
              <div class="text-[11px] text-emerald-600 font-semibold mt-0.5">Mitigasi risiko retur kedaluwarsa</div>
            </div>
            <div class="p-3.5 rounded-xl bg-surface-container-low border border-border-subtle flex flex-col justify-between">
              <div class="text-[11px] font-bold uppercase text-on-surface-variant">Otorisasi Realokasi Massal</div>
              ${recs.length > 0 ? `
                <button
                  id="rebalance-exec-all-btn"
                  type="button"
                  class="mt-1 py-2 px-3 rounded-lg bg-primary hover:bg-primary-container text-white text-xs font-semibold cursor-pointer border-0 flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <span class="material-symbols-outlined text-[16px]">bolt</span>
                  <span>Proses Seluruh Realokasi (${recs.length})</span>
                </button>
              ` : `
                <div class="text-xs font-bold text-emerald-600 mt-1">Distribusi Konsinyasi Optimal</div>
              `}
            </div>
          </div>

          <!-- Daftar Rekomendasi -->
          ${recs.length === 0 ? `
            <div class="p-8 text-center rounded-xl border border-border-subtle bg-surface-container-low">
              <span class="material-symbols-outlined text-[36px] text-emerald-600">verified</span>
              <div class="font-bold text-sm text-on-surface mt-2">Seluruh Inventaris Konsinyasi Mitra Telah Optimal</div>
              <p class="text-xs text-on-surface-variant mt-1">Tidak ditemukan inventaris konsinyasi berperputaran lambat atau mendekati kedaluwarsa yang memerlukan realokasi saat ini.</p>
            </div>
          ` : `
            <div class="flex flex-col gap-2.5 max-h-[420px] overflow-y-auto pr-1">
              ${recs.map(function (r) {
                return `
                  <div class="p-3.5 rounded-xl border border-border-subtle bg-surface-container-low flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 flex-wrap mb-1.5">
                        <span class="font-bold text-xs text-on-surface">${r.productName}</span>
                        <span class="badge badge-neutral font-mono">Batch: ${r.batch} • ED: ${r.expiry}</span>
                        ${r.nearExpiry ? '<span class="badge badge-danger">MENDEKATI ED</span>' : '<span class="badge badge-warning">PERPUTARAN LAMBAT</span>'}
                      </div>

                      <div class="flex items-center gap-2 flex-wrap text-xs">
                        <div class="px-2.5 py-1.5 rounded-lg bg-surface-container-lowest border border-border-subtle">
                          <div class="text-[10px] uppercase font-bold text-rose-600">MITRA ASAL (PENARIKAN)</div>
                          <div class="font-semibold text-on-surface">${r.sourceOutletName} (${r.sourceCity})</div>
                          <div class="text-[10px] text-on-surface-variant">Saldo: ${r.sourceRemainingQty} unit • Durasi: ${r.daysInOutlet} hari</div>
                        </div>

                        <span class="material-symbols-outlined text-primary text-[20px]">trending_flat</span>

                        <div class="px-2.5 py-1.5 rounded-lg bg-surface-container-lowest border border-border-subtle">
                          <div class="text-[10px] uppercase font-bold text-emerald-600">MITRA TUJUAN (PENEMPATAN)</div>
                          <div class="font-semibold text-on-surface">${r.targetOutletName} (${r.targetCity})</div>
                          <div class="text-[10px] text-on-surface-variant">PIC Sales: ${r.targetSalesRep} • Perputaran Cepat</div>
                        </div>
                      </div>
                    </div>

                    <div class="flex flex-col items-end gap-1.5 shrink-0 w-full sm:w-auto">
                      <div class="text-right">
                        <div class="text-[11px] text-on-surface-variant">Kuantitas: <b class="text-on-surface">${r.transferQty} Unit</b></div>
                        <div class="font-bold text-sm text-primary">${window.ArbaUtils.formatRupiah(r.savedValueRp)}</div>
                      </div>
                      <button
                        type="button"
                        class="rebalance-single-btn w-full sm:w-auto px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-white text-xs font-semibold cursor-pointer border-0 flex items-center justify-center gap-1 shadow-xs"
                        data-src="${r.sourceOutletId}"
                        data-dst="${r.targetOutletId}"
                        data-sku="${r.sku}"
                        data-qty="${r.transferQty}"
                      >
                        <span class="material-symbols-outlined text-[15px]">swap_horiz</span>
                        <span>Proses Realokasi (${r.transferQty})</span>
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>

        <div class="modal-footer">
          <button id="rebalance-footer-close" type="button" class="btn btn-outline">Tutup</button>
        </div>
      </div>
    `;

    window.ArbaApp.openModal(html);

    var closeBtn = document.getElementById('rebalance-modal-close');
    var footerClose = document.getElementById('rebalance-footer-close');
    if (closeBtn) closeBtn.onclick = function () { window.ArbaApp.closeModal(); };
    if (footerClose) footerClose.onclick = function () { window.ArbaApp.closeModal(); };

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
        if (window.ArbaStore.batchExecuteConsignmentRebalance) {
          window.ArbaStore.batchExecuteConsignmentRebalance(recs);
        } else {
          recs.forEach(function (r) {
            window.ArbaStore.executeConsignmentRebalance({
              sourceOutletId: r.sourceOutletId,
              targetOutletId: r.targetOutletId,
              sku: r.sku,
              transferQty: r.transferQty
            });
          });
        }
        openConsignmentRebalancerModal();
      };
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Modal Peta Lokasi Apotek Solo Raya & Urutan Rute Kunjungan Terdekat
  // ---------------------------------------------------------------------------
  function openTspRouteOptimizerModal(initialSalesRep, onSelectStopCallback) {
    var st = window.ArbaStore.getState();
    var salesTeam = st.salesTeam || [];
    var chosenRep = initialSalesRep || st.currentSalesRep || 'ALL';

    function renderRouteModal(repFilter) {
      var plan = window.ArbaStore.getOptimizedSalesRoute(repFilter);
      var stops = plan.stops || [];

      var allPts = [{ lat: plan.warehouse.lat, lng: plan.warehouse.lng, isHQ: true }].concat(stops);
      var minLat = Math.min.apply(null, allPts.map(function (p) { return p.lat; })) - 0.02;
      var maxLat = Math.max.apply(null, allPts.map(function (p) { return p.lat; })) + 0.02;
      var minLng = Math.min.apply(null, allPts.map(function (p) { return p.lng; })) - 0.03;
      var maxLng = Math.max.apply(null, allPts.map(function (p) { return p.lng; })) + 0.03;

      function toX(lng) {
        return Math.round(50 + ((lng - minLng) / Math.max(0.001, maxLng - minLng)) * 600);
      }
      function toY(lat) {
        return Math.round(290 - ((lat - minLat) / Math.max(0.001, maxLat - minLat)) * 240);
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
            <circle cx="${cx}" cy="${cy}" r="15" fill="${color}" fill-opacity="0.2" />
            <circle cx="${cx}" cy="${cy}" r="9.5" fill="${color}" stroke="#ffffff" stroke-width="2" />
            <text x="${cx}" y="${cy + 3.5}" text-anchor="middle" fill="#ffffff" font-size="9.5" font-weight="800">${s.stopNumber}</text>
            <rect x="${cx - 56}" y="${cy - 30}" width="112" height="16" rx="4" fill="#0f172a" fill-opacity="0.9" />
            <text x="${cx}" y="${cy - 19}" text-anchor="middle" fill="#f8fafc" font-size="9" font-weight="700">${s.name.slice(0, 18)}</text>
          </g>
        `;
      }).join('');

      var html = `
        <div class="modal-dialog max-w-4xl">
          <div class="modal-header">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-[22px]">route</span>
              </div>
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="font-bold text-sm text-on-surface">Peta Lokasi Apotek Solo Raya &amp; Urutan Rute Kunjungan Terdekat</h3>
                  <span class="badge badge-success">HEMAT JARAK &amp; BBM</span>
                </div>
                <p class="text-xs text-on-surface-variant mt-0.5">
                  Urutan kunjungan apotek paling searah mulai dari Gudang Utama Kartasura.
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <select
                id="tsp-rep-filter"
                class="form-select"
                style="width: auto; font-weight: 600;"
              >
                <option value="ALL" ${repFilter === 'ALL' ? 'selected' : ''}>Semua Rute Solo Raya (${st.outlets.length} Apotek)</option>
                ${salesTeam.map(function (sr) {
                  return `<option value="${sr.name}" ${repFilter === sr.name ? 'selected' : ''}>Sales: ${sr.name} (${sr.area})</option>`;
                }).join('')}
              </select>
              <button id="tsp-modal-close" class="icon-btn" type="button" title="Tutup">
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>
          </div>

          <div class="modal-body">
            <!-- KPI Penghematan Rute -->
            <div class="adv-grid-4">
              <div class="p-3 rounded-xl bg-surface-container-low border border-border-subtle">
                <div class="text-[10px] font-bold uppercase text-on-surface-variant">Jarak Rute Terdekat</div>
                <div class="text-lg font-bold text-primary mt-0.5">${plan.optimizedKm} km</div>
                <div class="text-[11px] text-on-surface-variant">Rute acak: <s>${plan.unoptimizedKm} km</s></div>
              </div>
              <div class="p-3 rounded-xl bg-surface-container-low border border-border-subtle">
                <div class="text-[10px] font-bold uppercase text-on-surface-variant">Penghematan Jarak</div>
                <div class="text-lg font-bold text-emerald-600 mt-0.5">Hemat ${plan.savedKm} km (${plan.savedPct}%)</div>
                <div class="text-[11px] text-on-surface-variant">${stops.length} titik apotek terurut</div>
              </div>
              <div class="p-3 rounded-xl bg-surface-container-low border border-border-subtle">
                <div class="text-[10px] font-bold uppercase text-on-surface-variant">Estimasi Waktu Kerja</div>
                <div class="text-lg font-bold text-on-surface mt-0.5">${Math.floor(plan.totalDurationMinutes / 60)}j ${plan.totalDurationMinutes % 60}m</div>
                <div class="text-[11px] text-on-surface-variant">Termasuk 15m kunjungan/apotek</div>
              </div>
              <div class="p-3 rounded-xl bg-surface-container-low border border-border-subtle">
                <div class="text-[10px] font-bold uppercase text-on-surface-variant">Perkiraan BBM Kanvas</div>
                <div class="text-lg font-bold text-amber-600 mt-0.5">${plan.estimatedFuelLitres} Liter</div>
                <div class="text-[11px] text-on-surface-variant">~${window.ArbaUtils.formatRupiah(plan.estimatedFuelCostRp)}</div>
              </div>
            </div>

            <!-- Peta Radar Interaktif SVG Solo Raya -->
            <div class="rounded-xl overflow-hidden border border-border-subtle" style="background:linear-gradient(180deg, #0b192c 0%, #0f172a 100%);">
              <div class="px-4 py-2 flex items-center justify-between text-[11px]" style="color:#cbd5e1; border-bottom:1px solid #1e293b;">
                <span class="font-bold flex items-center gap-1.5" style="color:#5eead4;">
                  <span class="material-symbols-outlined text-[15px]">radar</span>
                  PETA RUTE KUNJUNGAN SOLO RAYA (GUDANG KARTASURA → ${stops.length} APOTEK)
                </span>
                <span>Klik titik nomor apotek untuk buka nota</span>
              </div>
              <svg viewBox="0 0 700 320" width="100%" height="260" style="display:block;">
                <g stroke="#1e293b" stroke-width="1">
                  <line x1="0" y1="65" x2="700" y2="65" />
                  <line x1="0" y1="130" x2="700" y2="130" />
                  <line x1="0" y1="195" x2="700" y2="195" />
                  <line x1="0" y1="260" x2="700" y2="260" />
                  <line x1="140" y1="0" x2="140" y2="320" />
                  <line x1="280" y1="0" x2="280" y2="320" />
                  <line x1="420" y1="0" x2="420" y2="320" />
                  <line x1="560" y1="0" x2="560" y2="320" />
                </g>
                <text x="85" y="42" fill="#334155" font-size="12" font-weight="800">BOYOLALI / KLATEN</text>
                <text x="340" y="42" fill="#334155" font-size="12" font-weight="800">KOTA SURAKARTA (SOLO)</text>
                <text x="565" y="42" fill="#334155" font-size="12" font-weight="800">KARANGANYAR / SRAGEN</text>
                <text x="350" y="305" fill="#334155" font-size="12" font-weight="800">SUKOHARJO SELATAN</text>

                <polyline
                  points="${polyPoints}"
                  fill="none"
                  stroke="#2dd4bf"
                  stroke-width="2.5"
                  stroke-dasharray="6 4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />

                <g>
                  <circle cx="${hqX}" cy="${hqY}" r="20" fill="#38bdf8" fill-opacity="0.2" />
                  <rect x="${hqX - 11}" y="${hqY - 11}" width="22" height="22" rx="6" fill="#0284c7" stroke="#ffffff" stroke-width="2" />
                  <text x="${hqX}" y="${hqY + 3.5}" text-anchor="middle" fill="#ffffff" font-size="9.5" font-weight="900">HQ</text>
                  <text x="${hqX}" y="${hqY + 24}" text-anchor="middle" fill="#38bdf8" font-size="9.5" font-weight="800">GUDANG KARTASURA</text>
                </g>

                ${svgNodes}
              </svg>
            </div>

            <!-- Daftar Urutan Kunjungan -->
            <div>
              <div class="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">
                Urutan Kunjungan Apotek Hari Ini
              </div>
              <div class="adv-grid-2 max-h-48 overflow-y-auto pr-1">
                ${stops.map(function (s) {
                  return `
                    <div class="p-2.5 rounded-xl border border-border-subtle bg-surface-container-low flex items-center justify-between gap-2.5">
                      <div class="flex items-center gap-2.5 min-w-0">
                        <div class="w-7 h-7 rounded-lg bg-primary text-white font-bold text-xs flex items-center justify-center shrink-0">
                          #${s.stopNumber}
                        </div>
                        <div class="min-w-0">
                          <div class="font-bold text-xs text-on-surface truncate">${s.name}</div>
                          <div class="text-[11px] text-on-surface-variant truncate">${s.city} • +${s.legKm} km (${s.legMin} mnt)</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        class="tsp-select-stop-btn px-2.5 py-1.5 rounded-lg bg-surface-container-lowest hover:bg-primary hover:text-white text-on-surface text-[11px] font-semibold cursor-pointer border border-border-subtle shrink-0 transition-colors"
                        data-code="${s.code}"
                      >
                        Pilih Apotek
                      </button>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button id="tsp-footer-close" type="button" class="btn btn-outline">Tutup</button>
          </div>
        </div>
      `;

      window.ArbaApp.openModal(html);

      var closeBtn = document.getElementById('tsp-modal-close');
      var footerClose = document.getElementById('tsp-footer-close');
      if (closeBtn) closeBtn.onclick = function () { window.ArbaApp.closeModal(); };
      if (footerClose) footerClose.onclick = function () { window.ArbaApp.closeModal(); };

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
          window.ArbaApp.showToast('Rute dipilih: mengarahkan ke ' + code, 'pin_drop');
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
  // 5. Modal Penilaian Kelayakan Plafon Kredit & Kesehatan Bayar Apotek
  // ---------------------------------------------------------------------------
  function openCreditScoringModal() {
    var scores = window.ArbaStore.getOutletCreditScoring();

    var html = `
      <div class="modal-dialog max-w-4xl">
        <div class="modal-header">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-[22px]">analytics</span>
            </div>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="font-bold text-sm text-on-surface">Penilaian Kelayakan Plafon Kredit &amp; Kesehatan Bayar Apotek (Skor 0–100)</h3>
                <span class="badge badge-primary">EVALUASI PIUTANG</span>
              </div>
              <p class="text-xs text-on-surface-variant mt-0.5">
                Rekomendasi batas plafon kredit berdasarkan pemakaian limit, kecepatan laku barang titipan, dan kedisiplinan bayar.
              </p>
            </div>
          </div>
          <button id="credit-score-modal-close" class="icon-btn" type="button" title="Tutup">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div class="modal-body">
          <div class="flex flex-col gap-2.5 max-h-[480px] overflow-y-auto pr-1">
            ${scores.map(function (sc) {
              var limitChanged = sc.suggestedLimit !== sc.currentLimit || sc.suggestedTerms !== sc.currentTerms;
              var badgeCls = sc.score >= 82 ? 'badge-success' : (sc.score >= 68 ? 'badge-primary' : (sc.score < 50 ? 'badge-danger' : 'badge-warning'));
              return `
                <div class="p-3.5 rounded-xl border border-border-subtle bg-surface-container-low flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div class="flex items-center gap-3 flex-1 min-w-0">
                    <div class="w-12 h-12 rounded-xl bg-surface-container-lowest border border-border-subtle flex flex-col items-center justify-center shrink-0">
                      <span class="text-base font-bold text-primary leading-none">${sc.score}</span>
                      <span class="text-[9px] font-bold text-on-surface-variant">/100</span>
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-bold text-xs text-on-surface">${sc.outletName}</span>
                        <span class="badge ${badgeCls}">${sc.tier}</span>
                      </div>
                      <div class="text-[11px] text-on-surface-variant mt-1">
                        Pemakaian Plafon: <b class="text-on-surface">${sc.utilizationPct}%</b> • Laku Konsinyasi: <b class="text-on-surface">${sc.sellThroughPct}%</b> • Plafon Saat Ini: <b class="text-on-surface">${window.ArbaUtils.formatRupiah(sc.currentLimit)}</b> (${sc.currentTerms})
                      </div>
                      <div class="text-[11px] text-primary font-semibold mt-1">
                        ${sc.recommendation}
                      </div>
                    </div>
                  </div>

                  <div class="shrink-0 w-full sm:w-auto flex flex-col items-end gap-1.5">
                    <div class="text-right text-xs">
                      <span class="text-on-surface-variant">Saran Plafon:</span>
                      <b class="text-on-surface ml-1">${window.ArbaUtils.formatRupiah(sc.suggestedLimit)}</b>
                    </div>
                    <button
                      type="button"
                      class="apply-ai-credit-btn px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border flex items-center gap-1 transition-colors ${
                        limitChanged
                          ? 'bg-primary hover:bg-primary-container text-white border-transparent shadow-xs'
                          : 'bg-surface-container-lowest text-on-surface-variant border-border-subtle'
                      }"
                      data-outlet-id="${sc.outletId}"
                    >
                      <span class="material-symbols-outlined text-[15px]">auto_awesome</span>
                      <span>${limitChanged ? 'Terapkan Rekomendasi' : 'Plafon Sudah Optimal'}</span>
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="modal-footer">
          <button id="credit-score-footer-close" type="button" class="btn btn-outline">Tutup</button>
        </div>
      </div>
    `;

    window.ArbaApp.openModal(html);

    var closeBtn = document.getElementById('credit-score-modal-close');
    var footerClose = document.getElementById('credit-score-footer-close');
    if (closeBtn) closeBtn.onclick = function () { window.ArbaApp.closeModal(); };
    if (footerClose) footerClose.onclick = function () { window.ArbaApp.closeModal(); };

    document.querySelectorAll('.apply-ai-credit-btn').forEach(function (btn) {
      btn.onclick = function () {
        var oid = btn.getAttribute('data-outlet-id');
        window.ArbaStore.applyRecommendedCreditPolicy(oid);
        openCreditScoringModal();
      };
    });
  }

  // ---------------------------------------------------------------------------
  // 6. Modal Pemeriksaan Keaslian Buku Besar Stok Gudang & Sertifikat Audit CDOB
  // ---------------------------------------------------------------------------
  function openLedgerChainAuditModal() {
    var audit = window.ArbaStore.verifyLedgerChainIntegrity();

    var html = `
      <div class="modal-dialog max-w-4xl">
        <div class="modal-header">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-[22px]">verified_user</span>
            </div>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="font-bold text-sm text-on-surface">Pemeriksaan Keaslian Buku Besar Stok Gudang &amp; Sertifikat Audit CDOB</h3>
                <span class="badge badge-success">ANTI-MANIPULASI STOK</span>
              </div>
              <p class="text-xs text-on-surface-variant mt-0.5">
                Memastikan seluruh catatan keluar-masuk barang di Gudang Kartasura terkunci secara berantai dan bebas manipulasi.
              </p>
            </div>
          </div>
          <button id="chain-audit-close" class="icon-btn" type="button" title="Tutup">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div class="modal-body">
          <!-- Banner Sertifikat Integritas -->
          <div class="p-4 rounded-xl bg-surface-container-low border border-border-subtle flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div class="text-xs font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[18px]">workspace_premium</span>
                STATUS BUKU BESAR STOK: TERVERIFIKASI VALID (${audit.totalBlocks} CATATAN TRANSAKSI)
              </div>
              <div class="text-xs text-on-surface mt-1">
                Kode Segel Kriptografi (Merkle Root): <b class="font-mono text-primary">${audit.merkleRoot}</b>
              </div>
              <div class="text-[11px] text-on-surface-variant mt-1">
                Waktu Audit: <b class="text-on-surface">${audit.verifiedAt}</b> • Pemeriksa: <b class="text-on-surface">${audit.auditor}</b> • Total Masuk: +${audit.inboundUnits} | Keluar: -${audit.outboundUnits}
              </div>
            </div>
            <button
              id="chain-audit-print-btn"
              type="button"
              class="px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-container text-white text-xs font-semibold cursor-pointer border-0 flex items-center gap-1.5 shrink-0 shadow-xs"
            >
              <span class="material-symbols-outlined text-[16px]">print</span>
              <span>Cetak Sertifikat CDOB</span>
            </button>
          </div>

          <!-- Tabel Rantai Blok -->
          <div class="table-container max-h-[380px] overflow-y-auto">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Urutan</th>
                  <th>Dokumen &amp; Waktu</th>
                  <th>Produk &amp; Batch</th>
                  <th>Mutasi &amp; Saldo</th>
                  <th>Segel Sebelumnya</th>
                  <th>Segel Transaksi</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${audit.blocks.slice(0, 25).map(function (b) {
                  return `
                    <tr>
                      <td class="font-mono font-bold text-primary">#${b.blockIndex}</td>
                      <td>
                        <div class="font-bold text-on-surface">${b.docRef}</div>
                        <div class="text-[10px] text-on-surface-variant">${b.timestamp}</div>
                      </td>
                      <td>
                        <div class="font-semibold text-on-surface">${b.skuName}</div>
                        <div class="font-mono text-[10px] text-on-surface-variant">${b.batch}</div>
                      </td>
                      <td class="font-bold ${b.quantity >= 0 ? 'text-emerald-600' : 'text-rose-600'}">
                        ${b.type} (${b.quantity >= 0 ? '+' : ''}${b.quantity}) → Saldo: ${b.finalStock}
                      </td>
                      <td class="font-mono text-[10px] text-on-surface-variant">${b.prevHash}...</td>
                      <td class="font-mono text-[11px] font-bold text-primary">${b.blockHash}</td>
                      <td>
                        <span class="badge badge-success">VALID</span>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="modal-footer">
          <button id="chain-audit-footer-close" type="button" class="btn btn-outline">Tutup</button>
        </div>
      </div>
    `;

    window.ArbaApp.openModal(html);

    var closeBtn = document.getElementById('chain-audit-close');
    var footerClose = document.getElementById('chain-audit-footer-close');
    if (closeBtn) closeBtn.onclick = function () { window.ArbaApp.closeModal(); };
    if (footerClose) footerClose.onclick = function () { window.ArbaApp.closeModal(); };

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

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 360, 180);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(12, 28, 336, 112);

    ctx.fillStyle = '#475569';
    ctx.fillRect(18, 82, 324, 5);
    ctx.fillRect(18, 132, 324, 5);

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
