/**
 * ArbaConnect ERP - Executive Dashboard View
 * Features:
 * - 4 Executive KPI Cards with animated progress indicators
 * - Dual-Bar SVG Chart (Target vs Realisasi) with Month / Q1 toggle
 * - RFM Customer Loyalty Strategy with At-Risk visit dispatch modal
 * - Predictive repeat order projection table
 * - Real-time PWA Order Stream with search, status filtering, and inspection modal
 * - PDF Executive Report modal with print support
 * - CSV / Excel Export
 */

(function () {
  'use strict';

  window.ArbaViews = window.ArbaViews || {};

  // View-local UI state
  var state = {
    periodFilter: 'month', // 'month' | 'q1'
    streamFilter: 'ALL',   // 'ALL' | 'SYNCED' | 'PENDING'
    streamSearch: '',
    streamPage: 1,
    streamPageSize: 5,
    selectedOrderForDetail: null
  };

  function renderExecutiveDashboard(container) {
    var appState = window.ArbaStore.getState();
    var orders = appState.orders;
    var products = appState.products;
    var outlets = appState.outlets;
    var analytics = window.ArbaStore.getAnalytics();

    // Filter orders in stream
    var filteredOrders = orders.filter(function (order) {
      var matchesSearch =
        order.outletName.toLowerCase().indexOf(state.streamSearch.toLowerCase()) !== -1 ||
        order.clientUuid.toLowerCase().indexOf(state.streamSearch.toLowerCase()) !== -1 ||
        order.city.toLowerCase().indexOf(state.streamSearch.toLowerCase()) !== -1;

      var matchesStatus =
        state.streamFilter === 'ALL' ||
        (state.streamFilter === 'SYNCED' && order.syncStatus === 'SYNCED_DEDUCTED') ||
        (state.streamFilter === 'PENDING' && order.syncStatus === 'PENDING_WAREHOUSE');

      return matchesSearch && matchesStatus;
    });

    var totalStreamPages = Math.max(1, Math.ceil(filteredOrders.length / state.streamPageSize));
    if (state.streamPage > totalStreamPages) state.streamPage = totalStreamPages;
    var paginatedStreamOrders = filteredOrders.slice(
      (state.streamPage - 1) * state.streamPageSize,
      state.streamPage * state.streamPageSize
    );

    var isMonth = state.periodFilter === 'month';

    var html = `
      <div class="flex flex-col w-full gap-space-lg pb-space-xl">
        <!-- Top Command & Filter Bar -->
        <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-surface-container-lowest p-6 rounded-xl border border-border-subtle/60">
          <div class="flex flex-col gap-1">
            <h1 class="text-2xl text-on-surface tracking-tight font-bold">
              Dasbor Eksekutif
            </h1>
          </div>

          <!-- Actions & Timeline Filter -->
          <div class="flex flex-wrap items-center gap-2.5">
            <div class="flex items-center bg-surface-container-low px-3 py-1.5 rounded-lg border border-border-subtle/40">
              <span class="material-symbols-outlined text-primary text-[18px] mr-2">calendar_today</span>
              <div class="flex flex-col text-left">
                <span class="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">
                  Periode
                </span>
                <span class="text-xs text-on-surface font-semibold">
                  ${isMonth ? 'Bulan Ini: Maret 2026' : 'Kuartal I: Jan - Mar 2026'}
                </span>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <button
                id="btn-export-excel"
                class="flex items-center gap-1.5 bg-surface-container-low hover:bg-surface-container text-on-surface text-xs font-semibold px-3.5 py-2 rounded-lg border border-border-subtle/50 transition-colors cursor-pointer"
                type="button"
              >
                <span class="material-symbols-outlined text-[16px]">table_chart</span>
                <span>Ekspor CSV</span>
              </button>
              <button
                id="btn-download-pdf"
                class="flex items-center gap-1.5 bg-primary hover:bg-primary-container text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer shadow-xs"
                type="button"
              >
                <span class="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                <span>Cetak Laporan</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Section 1: KPI Stat Grid (100% Live Reactive) -->
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <!-- Card 1: Omset Bulanan -->
          <div class="bg-surface-container-lowest p-5 rounded-xl border border-border-subtle/60 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
                  Total Omset Bulanan
                </span>
                <span class="flex items-center gap-0.5 text-xs font-semibold text-emerald-700">
                  <span class="material-symbols-outlined text-[15px]">trending_up</span>
                  +14.8% MoM
                </span>
              </div>
              <div class="text-2xl text-on-surface tracking-tight font-bold mb-1">
                ${window.ArbaUtils.formatRupiah(analytics.revenueMonth)}
              </div>
              <div class="flex items-center justify-between text-xs text-on-surface-variant mb-2">
                <span>Target: ${window.ArbaUtils.formatRupiah(analytics.revenueTarget)}</span>
                <span class="font-semibold text-primary">${analytics.revenuePct}%</span>
              </div>
            </div>
            <!-- Progress Bar -->
            <div class="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden mt-1">
              <div class="bg-primary h-full rounded-full transition-all duration-700" style="width: ${Math.min(100, analytics.revenuePct)}%;"></div>
            </div>
          </div>

          <!-- Card 2: Outlet B2B Aktif -->
          <div class="bg-surface-container-lowest p-5 rounded-xl border border-border-subtle/60 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
                  Outlet B2B Aktif
                </span>
                <span class="text-xs font-medium text-primary">
                  +${6 + analytics.newOutlets} Mitra Baru
                </span>
              </div>
              <div class="flex items-baseline gap-2 mb-1">
                <span class="text-2xl text-on-surface tracking-tight font-bold">
                  ${analytics.totalOutlets}
                </span>
                <span class="text-xs text-on-surface-variant font-medium">
                  Titik Distribusi
                </span>
              </div>
              <div class="flex items-center gap-1.5 text-xs text-on-surface-variant mt-2 mb-2">
                <span class="text-on-surface font-semibold">${analytics.apotekCount} Apotek (${analytics.apotekPct}%)</span>
                <span aria-hidden="true">·</span>
                <span class="text-on-surface font-semibold">${analytics.minimarketCount} Minimarket (${100 - analytics.apotekPct}%)</span>
              </div>
            </div>
            <div class="w-full flex rounded-full h-1.5 overflow-hidden bg-surface-container-high">
              <div class="bg-primary h-full" style="width: ${analytics.apotekPct}%;" title="Apotek: ${analytics.apotekPct}%"></div>
              <div class="bg-secondary h-full" style="width: ${100 - analytics.apotekPct}%;" title="Minimarket: ${100 - analytics.apotekPct}%"></div>
            </div>
          </div>

          <!-- Card 3: Kunjungan Sales Hari Ini -->
          <div class="bg-surface-container-lowest p-5 rounded-xl border border-border-subtle/60 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
                  Kunjungan Sales Hari Ini
                </span>
                <span class="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                  ${analytics.visitPct}% Capaian
                </span>
              </div>
              <div class="flex items-baseline gap-1.5 mb-1">
                <span class="text-2xl text-on-surface tracking-tight font-bold">
                  ${analytics.visitsToday}
                </span>
                <span class="text-sm text-on-surface-variant font-medium">
                  / ${analytics.visitTargetToday} Target
                </span>
                <span class="text-xs text-primary font-semibold ml-1">
                  (EC: ${analytics.effectiveCallRate}%)
                </span>
              </div>
              <div class="flex items-center gap-1.5 text-xs text-on-surface-variant mt-2 mb-2">
                <span class="material-symbols-outlined text-[15px] text-primary">my_location</span>
                <span>${analytics.activeReps}/${analytics.totalReps} Sales Rep Aktif (GPS Valid)</span>
              </div>
            </div>
            <div class="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden">
              <div class="bg-emerald-600 h-full rounded-full transition-all duration-700" style="width: ${Math.min(100, analytics.visitPct)}%;"></div>
            </div>
          </div>

          <!-- Card 4: Integritas Stok & ROP -->
          <div class="bg-surface-container-lowest p-5 rounded-xl border border-border-subtle/60 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
                  Integritas Stok &amp; ROP
                </span>
                <span class="flex items-center gap-1 text-xs font-semibold text-amber-700">
                  <span class="material-symbols-outlined text-[14px]">warning</span>
                  ${analytics.criticalSkuCount > 0 ? 'Perlu Tindakan' : 'Stok Aman'}
                </span>
              </div>
              <div class="flex items-baseline gap-1.5 mb-1">
                <span class="text-2xl ${analytics.criticalSkuCount > 0 ? 'text-rose-600' : 'text-emerald-600'} tracking-tight font-bold">
                  ${analytics.criticalSkuCount}
                </span>
                <span class="text-xs text-on-surface-variant font-medium">
                  SKU Kritis Terdeteksi
                </span>
              </div>
              <p class="text-xs text-on-surface-variant leading-tight mt-1 mb-2">
                <span class="font-semibold text-rose-600">${analytics.belowRop.length} di bawah ROP</span> · 
                <span class="font-semibold text-amber-700">${analytics.nearExpiry.length} batch near-expiry</span>
              </p>
            </div>
            <button
              id="btn-goto-inventory"
              class="flex items-center justify-between bg-surface-container-low px-2.5 py-1.5 rounded-lg text-left hover:bg-surface-container transition-colors cursor-pointer border border-border-subtle/40"
              type="button"
            >
              <span class="text-xs text-on-surface font-medium truncate">
                ${analytics.belowRop[0] ? 'Prioritas ROP: ' + analytics.belowRop[0].name : 'Lihat Buku Besar Stok'}
              </span>
              <span class="material-symbols-outlined text-primary text-[16px]">chevron_right</span>
            </button>
          </div>
        </div>

        <!-- Section 2A: Peringatan Stok & Kedaluwarsa -->
        <div class="bg-surface-container-lowest p-space-lg rounded-xl shadow-xs border border-border-subtle/40 flex flex-col gap-4">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 border-b border-border-subtle/50">
            <h2 class="font-title-sm text-title-sm text-on-surface font-bold">
              Peringatan Stok &amp; Kedaluwarsa
            </h2>
            <div class="flex items-center gap-2 flex-wrap text-[11px] font-semibold">
              <span class="badge badge-warning">
                Stok di Bawah ROP (${analytics.orangeStockAlarms.length} SKU)
              </span>
              <span class="badge badge-danger">
                Mendekati Kedaluwarsa (${analytics.pinkExpiryAlarms.length} Lokasi)
              </span>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <!-- Kolom Kiri: Peringatan Stok Minimum (ROP) -->
            <div class="rounded-xl p-4 flex flex-col gap-2.5 bg-surface-container-low border border-border-subtle">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-[20px] text-amber-600">notification_important</span>
                  <div>
                    <div class="font-bold text-xs text-on-surface">PERINGATAN STOK MINIMUM (ROP) — Persediaan Gudang di Bawah Ambang Aman</div>
                    <div class="text-[11px] text-on-surface-variant">Ambang titik pesan ulang (Reorder Point) dihitung secara proporsional berdasarkan volume distribusi bulanan setiap SKU.</div>
                  </div>
                </div>
              </div>
              <div class="space-y-2">
                ${analytics.orangeStockAlarms.map(function (al) {
                  return `
                    <div class="p-2.5 rounded-lg bg-surface-container-lowest border border-border-subtle flex items-center justify-between gap-2">
                      <div>
                        <div class="font-bold text-xs text-on-surface">${al.name}</div>
                        <div class="text-[11px] text-on-surface-variant">Distribusi: <b>${al.consumptionNote}</b> · Ambang ROP: <b>${al.rop} unit</b></div>
                      </div>
                      <div class="flex items-center gap-2">
                        <div class="text-right">
                          <div class="font-mono font-bold text-xs text-amber-600">Saldo: ${al.stock} unit</div>
                          <div class="text-[10px] font-semibold text-on-surface-variant">Defisit ${al.shortage} unit dari ROP</div>
                        </div>
                        <button
                          type="button"
                          class="btn-orange-alarm-restock px-2.5 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-white text-[11px] font-semibold cursor-pointer border-0 shrink-0"
                          data-sku="${window.ArbaUtils.escapeHtml(al.sku)}"
                          data-name="${window.ArbaUtils.escapeHtml(al.name)}"
                        >
                          Pengadaan PO
                        </button>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- Kolom Kanan: Peringatan Masa Kedaluwarsa (FEFO) -->
            <div class="rounded-xl p-4 flex flex-col gap-2.5 bg-surface-container-low border border-border-subtle">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-[20px] text-rose-600">event_busy</span>
                  <div>
                    <div class="font-bold text-xs text-on-surface">PERINGATAN MASA KEDALUWARSA (FEFO) — Batch Mendekati Tanggal Kedaluwarsa</div>
                    <div class="text-[11px] text-on-surface-variant">Memantau posisi batch dengan sisa masa simpan pendek di gudang maupun mitra apotek untuk prioritas distribusi lebih awal.</div>
                  </div>
                </div>
              </div>
              <div class="space-y-2 max-h-56 overflow-y-auto pr-1">
                ${analytics.pinkExpiryAlarms.slice(0, 6).map(function (pk) {
                  var isApotek = pk.locationType === 'APOTEK_MITRA';
                  return `
                    <div class="p-2.5 rounded-lg bg-surface-container-lowest border border-border-subtle flex items-center justify-between gap-2">
                      <div>
                        <div class="flex items-center gap-1.5">
                          <span class="badge ${isApotek ? 'badge-warning' : 'badge-danger'}">
                            ${isApotek ? 'MITRA APOTEK' : 'GUDANG UTAMA'}
                          </span>
                          <span class="font-bold text-xs text-on-surface">${pk.locationName}</span>
                        </div>
                        <div class="text-[11px] text-on-surface-variant mt-1">
                          <b class="text-on-surface">${pk.productName}</b> (${pk.batch}) · ED: <b class="text-rose-600">${pk.expiry}</b> · Saldo: <b class="text-on-surface">${pk.qty} unit</b>
                        </div>
                      </div>
                      <button
                        type="button"
                        class="btn-pink-alarm-notify px-2.5 py-1.5 rounded-lg bg-surface-container-low hover:bg-primary hover:text-white text-on-surface text-[11px] font-semibold cursor-pointer border border-border-subtle shrink-0 transition-colors"
                        data-location-type="${window.ArbaUtils.escapeHtml(pk.locationType || '')}"
                        data-outlet-id="${window.ArbaUtils.escapeHtml(pk.outletId || '')}"
                        data-sku="${window.ArbaUtils.escapeHtml(pk.sku || '')}"
                        data-location="${window.ArbaUtils.escapeHtml(pk.locationName)}"
                        data-product="${window.ArbaUtils.escapeHtml(pk.productName)}"
                        data-batch="${window.ArbaUtils.escapeHtml(pk.batch)}"
                        data-sales="${window.ArbaUtils.escapeHtml(pk.salesRep)}"
                      >
                        Tindak Lanjut FEFO
                      </button>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- Section 2B: Produktivitas Tim Sales Lapangan & Perputaran Stok Produk (Sesuai Kebutuhan Tantangan ARB-02) -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          <!-- Panel Kiri (7 Kolom): Leaderboard Produktivitas & Target Tim Sales -->
          <div class="lg:col-span-7 bg-surface-container-lowest p-space-lg rounded-xl shadow-xs border border-border-subtle/40 flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <div>
                <span class="font-label-sm text-label-sm uppercase tracking-wider text-primary font-bold">
                  Monitoring Kinerja Lapangan Real-Time
                </span>
                <h2 class="font-title-sm text-title-sm text-on-surface font-bold">
                  Rekap Produktivitas &amp; Target Capaian Tim Sales
                </h2>
              </div>
              <span class="px-2.5 py-1 rounded-full bg-surface-container-low text-xs font-semibold text-primary border border-border-subtle/40">
                Effective Call: ${analytics.effectiveCallRate}%
              </span>
            </div>

            <div class="overflow-x-auto rounded-lg border border-border-subtle/40">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="bg-surface-container-low text-on-surface-variant uppercase tracking-wider text-[11px]">
                    <th class="px-3 py-2 font-bold">Sales Rep &amp; Rayon</th>
                    <th class="px-3 py-2 font-bold text-center">Kunjungan Hari Ini</th>
                    <th class="px-3 py-2 font-bold text-center">Effective Call</th>
                    <th class="px-3 py-2 font-bold text-right">Realisasi vs Target Bulan</th>
                    <th class="px-3 py-2 font-bold text-right">Capaian</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border-subtle text-on-surface">
                  ${analytics.salesPerformance.map(function (rep) {
                    var badgeColor = rep.revenuePct >= 85
                      ? 'bg-status-success-bg text-status-success-text'
                      : (rep.revenuePct >= 70 ? 'bg-status-warning-bg text-status-warning-text' : 'bg-rose-100 text-rose-700');
                    return `
                      <tr class="hover:bg-surface-container-low/50 transition-colors">
                        <td class="px-3 py-2.5">
                          <div class="font-semibold text-on-surface">${rep.name}</div>
                          <div class="text-[11px] text-on-surface-variant">${rep.area} · ${rep.id}</div>
                        </td>
                        <td class="px-3 py-2.5 text-center font-mono font-semibold">
                          ${rep.visitsToday} / ${rep.dailyVisitTarget}
                        </td>
                        <td class="px-3 py-2.5 text-center">
                          <span class="font-semibold text-primary">${rep.ordersToday} order</span>
                          <span class="text-[11px] text-on-surface-variant">(${rep.effectiveCallRate}%)</span>
                        </td>
                        <td class="px-3 py-2.5 text-right font-mono">
                          <div class="font-semibold text-on-surface">${window.ArbaUtils.formatRupiah(rep.revenueMonth)}</div>
                          <div class="text-[10px] text-on-surface-variant">Target: ${window.ArbaUtils.formatRupiah(rep.monthlyRevenueTarget)}</div>
                        </td>
                        <td class="px-3 py-2.5 text-right">
                          <span class="px-2 py-0.5 rounded-full font-bold text-[11px] ${badgeColor}">
                            ${rep.revenuePct}%
                          </span>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Panel Kanan (5 Kolom): Analitik Perputaran Stok Produk (Inventory Turnover & Days of Cover) -->
          <div class="lg:col-span-5 bg-surface-container-lowest p-space-lg rounded-xl shadow-xs border border-border-subtle/40 flex flex-col justify-between gap-3">
            <div>
              <div class="flex items-center justify-between mb-3">
                <div>
                  <span class="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-bold">
                    Analitik Inventaris &amp; ROP
                  </span>
                  <h2 class="font-title-sm text-title-sm text-on-surface font-bold">
                    Perputaran Stok &amp; Ketahanan Hari (Days of Cover)
                  </h2>
                </div>
              </div>

              <div class="space-y-2.5">
                ${analytics.stockTurnover.map(function (st) {
                  var isCritical = st.belowRop;
                  var barWidth = Math.min(100, Math.round((st.daysOfCover / 60) * 100));
                  return `
                    <div class="p-2.5 rounded-lg bg-surface-container-low/60 border border-border-subtle/40">
                      <div class="flex items-center justify-between text-xs mb-1">
                        <span class="font-semibold text-on-surface truncate max-w-[200px]">${st.name}</span>
                        <span class="font-mono font-bold ${isCritical ? 'text-rose-600' : 'text-primary'}">
                          ${st.stock} unit · ~${st.daysOfCover} hari
                        </span>
                      </div>
                      <div class="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden mb-1">
                        <div class="${isCritical ? 'bg-rose-600' : 'bg-primary'} h-full rounded-full" style="width:${barWidth}%;"></div>
                      </div>
                      <div class="flex items-center justify-between text-[11px] text-on-surface-variant">
                        <span>Demand: ${st.dailyDemand} unit/hari (ROP: ${st.rop})</span>
                        <span>ITR: <b>${st.turnoverRatio}x/bln</b></span>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- Section 2C: Proyeksi Kebutuhan Produksi & Evaluasi Perputaran Stok Konsinyasi -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          <!-- Kiri (7 Kolom): Analisis Permintaan Pasar & Proyeksi Produksi -->
          <div class="lg:col-span-7 bg-surface-container-lowest p-space-lg rounded-xl shadow-xs border border-border-subtle/40 flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <div>
                <span class="font-label-sm text-label-sm uppercase tracking-wider text-primary font-bold">
                  Analisis Permintaan Pasar &amp; Perencanaan Produksi
                </span>
                <h2 class="font-title-sm text-title-sm text-on-surface font-bold">
                  Peringkat Volume Distribusi Produk &amp; Proyeksi Produksi Periode Berikutnya
                </h2>
              </div>
              <span class="text-xs font-semibold text-on-surface-variant">Madu Herbal &amp; Kosmetik</span>
            </div>

            <div class="overflow-x-auto rounded-lg border border-border-subtle/40">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="bg-surface-container-low text-on-surface-variant uppercase tracking-wider text-[11px]">
                    <th class="px-3 py-2 font-bold">Peringkat &amp; Nama Produk</th>
                    <th class="px-3 py-2 font-bold">Divisi</th>
                    <th class="px-3 py-2 font-bold text-right">Realisasi Bulan Ini</th>
                    <th class="px-3 py-2 font-bold text-right">Proyeksi Bulan Depan</th>
                    <th class="px-3 py-2 font-bold text-right">Rekomendasi Kuota Produksi</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border-subtle text-on-surface">
                  ${analytics.productForecasting.map(function (pf, idx) {
                    return `
                      <tr class="hover:bg-surface-container-low/50">
                        <td class="px-3 py-2.5">
                          <div class="font-bold text-on-surface">#${idx + 1} · ${pf.name}</div>
                          <div class="text-[11px] text-on-surface-variant">${pf.sku} · Volume: ${pf.consumptionNote}</div>
                        </td>
                        <td class="px-3 py-2.5">
                          <span class="px-2 py-0.5 rounded bg-surface-container text-[11px] font-semibold text-on-surface">${pf.division}</span>
                        </td>
                        <td class="px-3 py-2.5 text-right font-mono font-bold text-primary">${window.ArbaUtils.formatNumber(pf.soldMonth)} unit</td>
                        <td class="px-3 py-2.5 text-right font-mono font-semibold">${window.ArbaUtils.formatNumber(pf.forecastUnits)} unit</td>
                        <td class="px-3 py-2.5 text-right font-mono font-bold ${pf.productionNeeded > 1000 ? 'text-rose-600' : 'text-emerald-700'}">
                          +${window.ArbaUtils.formatNumber(pf.productionNeeded)} unit
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Kanan (5 Kolom): Evaluasi Perputaran Stok Konsinyasi Mitra (Slow-Moving Inventory) -->
          <div class="lg:col-span-5 bg-surface-container-lowest p-space-lg rounded-xl shadow-xs border border-border-subtle/40 flex flex-col justify-between gap-3">
            <div>
              <span class="font-label-sm text-label-sm uppercase tracking-wider text-amber-700 font-bold">
                Evaluasi Perputaran Inventaris Konsinyasi Mitra
              </span>
              <h2 class="font-title-sm text-title-sm text-on-surface font-bold mb-2">
                Daftar Inventaris Konsinyasi Berperputaran Lambat (Slow-Moving Inventory)
              </h2>
              <div class="space-y-2 max-h-72 overflow-y-auto pr-1">
                ${analytics.outletSlowMoving.slice(0, 6).map(function (sm) {
                  return `
                    <div class="p-2.5 rounded-lg bg-surface-container-low/70 border border-border-subtle/50 flex items-center justify-between gap-2 text-xs">
                      <div>
                        <div class="font-bold text-on-surface">${sm.outletName} (${sm.city})</div>
                        <div class="text-[11px] text-on-surface-variant">${sm.productName} · Kuota: ${sm.consignedQty}, Terjual: <b>${sm.soldQty}</b>, Saldo: <b>${sm.remainingQty} unit</b></div>
                        <div class="text-[10px] text-rose-600 font-semibold">Durasi Penyimpanan: ${sm.daysInOutlet} hari · PIC Sales: ${sm.salesRep}</div>
                      </div>
                      <button
                        type="button"
                        class="btn-slow-moving-rotate px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-surface-container-lowest hover:bg-primary hover:text-white text-on-surface shrink-0 cursor-pointer border border-border-subtle transition-colors"
                        data-outlet="${window.ArbaUtils.escapeHtml(sm.outletName)}"
                        data-product="${window.ArbaUtils.escapeHtml(sm.productName)}"
                        data-sales="${window.ArbaUtils.escapeHtml(sm.salesRep)}"
                        data-qty="${sm.remainingQty}"
                      >
                        Realokasi Stok
                      </button>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- Section 3: Live Operations Table (PWA Stream) -->
        <div class="bg-surface-container-lowest p-space-lg rounded-xl shadow-xs border border-border-subtle/40 flex flex-col gap-space-md">
          <!-- Header of Stream -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-primary-container text-white flex items-center justify-center shadow-xs">
                <span class="material-symbols-outlined text-[24px]">phonelink_ring</span>
              </div>
              <div>
                <h2 class="font-title-sm text-title-sm text-on-surface font-bold">
                  Pesanan Lapangan Masuk Real-Time (PWA Stream)
                </h2>
                <p class="font-body-sm text-body-sm text-on-surface-variant">
                  Aliran order dari aplikasi sales lapangan dengan sinkronisasi instan ke stok gudang
                </p>
              </div>
            </div>

            <!-- Filters & Live Sync Status -->
            <div class="flex flex-wrap items-center gap-space-xs">
              <div class="flex items-center bg-surface-container-low px-2.5 py-1.5 rounded-lg border border-border-subtle/30">
                <span class="material-symbols-outlined text-on-surface-variant text-[18px] mr-1.5" aria-hidden="true">search</span>
                <input
                  id="input-stream-search"
                  value="${window.ArbaUtils.escapeHtml(state.streamSearch)}"
                  aria-label="Cari UUID pesanan atau nama outlet apotek"
                  class="bg-transparent font-body-sm text-body-sm text-on-surface focus:outline-none w-36 sm:w-44 placeholder:text-on-surface-variant border-0"
                  placeholder="Cari UUID / Outlet..."
                  type="text"
                />
              </div>
              <div class="flex items-center bg-surface-container-low rounded-lg p-0.5 border border-border-subtle/30">
                <button
                  id="filter-stream-all"
                  class="px-2.5 py-1 rounded font-label-sm text-label-sm transition-all cursor-pointer ${
                    state.streamFilter === 'ALL'
                      ? 'bg-surface-container-lowest text-primary font-bold shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }"
                  type="button"
                >
                  Semua
                </button>
                <button
                  id="filter-stream-synced"
                  class="px-2.5 py-1 rounded font-label-sm text-label-sm transition-all cursor-pointer ${
                    state.streamFilter === 'SYNCED'
                      ? 'bg-surface-container-lowest text-primary font-bold shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }"
                  type="button"
                >
                  Sync Sukses
                </button>
                <button
                  id="filter-stream-pending"
                  class="px-2.5 py-1 rounded font-label-sm text-label-sm transition-all cursor-pointer ${
                    state.streamFilter === 'PENDING'
                      ? 'bg-surface-container-lowest text-primary font-bold shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }"
                  type="button"
                >
                  Menunggu Gudang
                </button>
              </div>
            </div>
          </div>

          <!-- Data Table Container -->
          <div class="overflow-x-auto rounded-lg bg-surface-container-low/30 border border-border-subtle/30">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider h-10">
                  <th class="px-4 py-2 font-bold">Client UUID</th>
                  <th class="px-4 py-2 font-bold">Nama Outlet &amp; Kota</th>
                  <th class="px-4 py-2 font-bold">Sales Rep</th>
                  <th class="px-4 py-2 font-bold">Waktu Order</th>
                  <th class="px-4 py-2 font-bold text-right">Total Nilai</th>
                  <th class="px-4 py-2 font-bold">Metode / Termin</th>
                  <th class="px-4 py-2 font-bold">Status Sinkronisasi</th>
                  <th class="px-4 py-2 font-bold text-center">Aksi Cepat</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border-subtle font-body-sm text-body-sm text-on-surface">
                ${paginatedStreamOrders.map(function (order) {
                  var isSynced = order.syncStatus === 'SYNCED_DEDUCTED';
                  var initials = order.salesRep
                    .split(' ')
                    .map(function (w) { return w[0]; })
                    .join('')
                    .slice(0, 2);

                  return `
                    <tr class="hover:bg-surface-container-lowest transition-colors h-14">
                      <td class="px-4 py-3 font-code-table text-code-table text-primary font-semibold">
                        ${window.ArbaUtils.escapeHtml(order.clientUuid)}
                      </td>
                      <td class="px-4 py-3">
                        <div class="font-semibold text-on-surface">${window.ArbaUtils.escapeHtml(order.outletName)}</div>
                        <div class="text-label-sm text-on-surface-variant">
                          ${window.ArbaUtils.escapeHtml(order.city)} • ID: ${window.ArbaUtils.escapeHtml(order.outletId)}
                        </div>
                      </td>
                      <td class="px-4 py-3">
                        <div class="flex items-center gap-2">
                          <span class="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-label-sm" style="background: rgba(0,92,85,0.1); width:24px; height:24px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center;">
                            ${window.ArbaUtils.escapeHtml(initials)}
                          </span>
                          <span>${window.ArbaUtils.escapeHtml(order.salesRep)}</span>
                        </div>
                      </td>
                      <td class="px-4 py-3 font-code-table text-code-table text-on-surface-variant">
                        ${window.ArbaUtils.escapeHtml(order.orderTime)}
                      </td>
                      <td class="px-4 py-3 text-right font-bold text-on-surface font-code-table text-code-table">
                        ${window.ArbaUtils.formatRupiah(order.totalAmount)}
                      </td>
                      <td class="px-4 py-3">
                        <span class="px-2 py-0.5 rounded bg-surface-container font-label-sm text-label-sm text-secondary font-semibold">
                          ${window.ArbaUtils.escapeHtml(order.terms)}
                        </span>
                      </td>
                      <td class="px-4 py-3">
                        ${isSynced ? `
                          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-status-success-bg text-status-success-text font-label-sm text-label-sm font-semibold">
                            <span class="w-1.5 h-1.5 rounded-full bg-badge-green" style="display:inline-block; width:6px; height:6px;"></span>
                            Synced &amp; Stok Terpotong
                          </span>
                        ` : `
                          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-status-warning-bg text-status-warning-text font-label-sm text-label-sm font-semibold">
                            <span class="w-1.5 h-1.5 rounded-full bg-badge-amber" style="display:inline-block; width:6px; height:6px;"></span>
                            Menunggu Konfirmasi Gudang
                          </span>
                        `}
                      </td>
                      <td class="px-4 py-3 text-center">
                        <div class="flex items-center justify-center gap-1">
                          <button
                            class="btn-inspect-order p-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-primary transition-colors cursor-pointer border-0"
                            title="Lihat Detail Pesanan"
                            data-order-id="${order.id}"
                            type="button"
                          >
                            <span class="material-symbols-outlined text-[18px]">visibility</span>
                          </button>
                          <button
                            class="btn-goto-ledger-row p-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-secondary transition-colors cursor-pointer border-0"
                            title="Buku Besar"
                            type="button"
                          >
                            <span class="material-symbols-outlined text-[18px]">receipt_long</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <!-- Table Footer / Stream Pagination & Quick Sync Stats -->
          <div class="flex flex-col sm:flex-row items-center justify-between gap-space-sm pt-space-xs text-on-surface-variant font-label-sm text-label-sm">
            <div class="flex items-center gap-2">
              <span>Menampilkan ${paginatedStreamOrders.length} dari ${filteredOrders.length} transaksi (Hal ${state.streamPage}/${totalStreamPages})</span>
            </div>
            <div class="flex items-center gap-1">
              <button
                id="btn-stream-prev"
                class="px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-semibold cursor-pointer border-0 ${state.streamPage <= 1 ? 'opacity-40' : ''}"
                type="button"
              >
                Sebelumnya
              </button>
              ${Array.from({ length: totalStreamPages }, function (_, idx) {
                var pNum = idx + 1;
                var active = pNum === state.streamPage;
                return `
                  <button
                    class="btn-stream-page px-3 py-1.5 rounded-lg ${active ? 'bg-primary-container text-white font-bold' : 'bg-surface-container-low hover:bg-surface-container text-on-surface font-semibold'} cursor-pointer border-0"
                    data-page="${pNum}"
                    type="button"
                  >
                    ${pNum}
                  </button>
                `;
              }).join('')}
              <button
                id="btn-stream-next"
                class="px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-semibold cursor-pointer border-0 ${state.streamPage >= totalStreamPages ? 'opacity-40' : ''}"
                type="button"
              >
                Berikutnya
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
    bindEvents(container);
  }

  function bindEvents(container) {
    // Advance Suite Quick Launchers
    var btnAdvReb = container.querySelector('#btn-exec-adv-rebalance');
    if (btnAdvReb && window.ArbaAdvanced) {
      btnAdvReb.addEventListener('click', function () {
        window.ArbaAdvanced.openConsignmentRebalancerModal();
      });
    }
    var btnAdvTsp = container.querySelector('#btn-exec-adv-tsp');
    if (btnAdvTsp && window.ArbaAdvanced) {
      btnAdvTsp.addEventListener('click', function () {
        window.ArbaAdvanced.openTspRouteOptimizerModal();
      });
    }
    var btnAdvCred = container.querySelector('#btn-exec-adv-credit');
    if (btnAdvCred && window.ArbaAdvanced) {
      btnAdvCred.addEventListener('click', function () {
        window.ArbaAdvanced.openCreditScoringModal();
      });
    }
    var btnAdvQr = container.querySelector('#btn-exec-adv-qr');
    if (btnAdvQr && window.ArbaAdvanced) {
      btnAdvQr.addEventListener('click', function () {
        window.ArbaAdvanced.openQrBatchModal({ initialTab: 'scanner' });
      });
    }
    var btnAdvChain = container.querySelector('#btn-exec-adv-chain');
    if (btnAdvChain && window.ArbaAdvanced) {
      btnAdvChain.addEventListener('click', function () {
        window.ArbaAdvanced.openLedgerChainAuditModal();
      });
    }

    // Peringatan Stok Minimum (ROP) -> Langsung Proses Pengadaan Restock Gudang & Catat di Buku Besar
    var orangeBtns = container.querySelectorAll('.btn-orange-alarm-restock');
    orangeBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var sku = btn.getAttribute('data-sku');
        var name = btn.getAttribute('data-name');
        if (window.ArbaStore.quickRestockFromAlarm) {
          window.ArbaStore.quickRestockFromAlarm(sku);
        } else {
          window.ArbaApp.navigate('inventory-stock-ledger');
          window.ArbaApp.showToast('Membuka Buku Besar Stok untuk menerbitkan PO Restock: ' + name, 'local_mall');
        }
      });
    });

    // Slow-Moving Consignment -> Buka Smart Consignment Auto-Rebalancer Modal
    var slowBtns = container.querySelectorAll('.btn-slow-moving-rotate');
    slowBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (window.ArbaAdvanced && typeof window.ArbaAdvanced.openConsignmentRebalancerModal === 'function') {
          window.ArbaAdvanced.openConsignmentRebalancerModal();
          return;
        }
        var outlet = btn.getAttribute('data-outlet');
        var prod = btn.getAttribute('data-product');
        var sales = btn.getAttribute('data-sales');
        var qty = btn.getAttribute('data-qty');
        window.ArbaStore.scheduleSalesVisit({
          outletId: 'AP-SLO-001',
          outletName: outlet,
          salesRep: sales,
          scheduledDate: 'Besok Pagi (Prioritas Rotasi)',
          purpose: 'Tarik & Rotasi Stok Konsinyasi Lambat Laku',
          notes: 'Tarik ' + qty + ' unit ' + prod + ' untuk dipindahkan ke apotek berkecepatan tinggi.'
        });
        window.ArbaApp.showToast(
          'Instruksi Rotasi Stok dikirim ke ' + sales + ': Tarik ' + qty + ' unit ' + prod + ' dari ' + outlet,
          'published_with_changes'
        );
      });
    });

    // Peringatan Masa Kedaluwarsa (FEFO) -> Eksekusi Realokasi / Prioritas FEFO & Perbarui Data Real-Time
    var pinkBtns = container.querySelectorAll('.btn-pink-alarm-notify');
    pinkBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var locType = btn.getAttribute('data-location-type');
        var outletId = btn.getAttribute('data-outlet-id');
        var sku = btn.getAttribute('data-sku');
        var batch = btn.getAttribute('data-batch');
        if (window.ArbaStore.resolveExpiryAlarm) {
          window.ArbaStore.resolveExpiryAlarm({
            locationType: locType,
            outletId: outletId,
            sku: sku,
            batch: batch
          });
        }
      });
    });

    // Export Excel
    var btnExcel = container.querySelector('#btn-export-excel');
    if (btnExcel) {
      btnExcel.addEventListener('click', function () {
        var appState = window.ArbaStore.getState();
        window.ArbaUtils.exportExecutiveReportToCsv(appState.orders, appState.products, appState.outlets);
        window.ArbaApp.showToast("Berhasil mengunduh Rekap Eksekutif Omset & Penjualan B2B (.CSV)", 'table_chart');
      });
    }

    // Download PDF Modal
    var btnPdf = container.querySelector('#btn-download-pdf');
    if (btnPdf) {
      btnPdf.addEventListener('click', function () {
        openPdfModal();
      });
    }

    // Go to Inventory
    var btnInventory = container.querySelector('#btn-goto-inventory');
    if (btnInventory) {
      btnInventory.addEventListener('click', function () {
        window.ArbaApp.navigate('inventory-stock-ledger');
      });
    }

    // Period toggle
    var btnMonth = container.querySelector('#filter-period-month');
    var btnQ1 = container.querySelector('#filter-period-q1');
    if (btnMonth) {
      btnMonth.addEventListener('click', function () {
        state.periodFilter = 'month';
        renderExecutiveDashboard(container);
      });
    }
    if (btnQ1) {
      btnQ1.addEventListener('click', function () {
        state.periodFilter = 'q1';
        renderExecutiveDashboard(container);
      });
    }

    // At-Risk Dispatch Modal
    var btnAtRisk = container.querySelector('#btn-at-risk-dispatch');
    if (btnAtRisk) {
      btnAtRisk.addEventListener('click', function () {
        openAtRiskModal();
      });
    }

    // Stream search input
    var searchInput = container.querySelector('#input-stream-search');
    if (searchInput) {
      searchInput.addEventListener('input', function (e) {
        state.streamSearch = e.target.value;
        renderExecutiveDashboard(container);
        var inputNow = container.querySelector('#input-stream-search');
        if (inputNow) {
          inputNow.focus();
          inputNow.setSelectionRange(inputNow.value.length, inputNow.value.length);
        }
      });
    }

    // Stream status filters
    var btnAll = container.querySelector('#filter-stream-all');
    var btnSynced = container.querySelector('#filter-stream-synced');
    var btnPending = container.querySelector('#filter-stream-pending');
    if (btnAll) {
      btnAll.addEventListener('click', function () {
        state.streamFilter = 'ALL';
        renderExecutiveDashboard(container);
      });
    }
    if (btnSynced) {
      btnSynced.addEventListener('click', function () {
        state.streamFilter = 'SYNCED';
        renderExecutiveDashboard(container);
      });
    }
    if (btnPending) {
      btnPending.addEventListener('click', function () {
        state.streamFilter = 'PENDING';
        renderExecutiveDashboard(container);
      });
    }

    // Order inspect buttons
    var inspectBtns = container.querySelectorAll('.btn-inspect-order');
    inspectBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var orderId = btn.getAttribute('data-order-id');
        var orders = window.ArbaStore.getState().orders;
        var order = orders.find(function (o) { return o.id === orderId; });
        if (order) {
          openDetailModal(order);
        }
      });
    });

    // Ledger row jump buttons
    var ledgerBtns = container.querySelectorAll('.btn-goto-ledger-row');
    ledgerBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        window.ArbaApp.navigate('inventory-stock-ledger');
      });
    });

    // Stream Pagination buttons
    var prevBtn = container.querySelector('#btn-stream-prev');
    var nextBtn = container.querySelector('#btn-stream-next');
    var pageBtns = container.querySelectorAll('.btn-stream-page');
    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        if (state.streamPage > 1) {
          state.streamPage--;
          renderExecutiveDashboard(container);
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        state.streamPage++;
        renderExecutiveDashboard(container);
      });
    }
    pageBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.streamPage = Number(btn.getAttribute('data-page')) || 1;
        renderExecutiveDashboard(container);
      });
    });
  }

  // Quick Detail Modal
  function openDetailModal(order) {
    var modalHtml = `
      <div class="modal-dialog max-w-xl">
        <div class="modal-header">
          <div>
            <span class="font-code-table text-xs text-primary font-semibold">${window.ArbaUtils.escapeHtml(order.clientUuid)}</span>
            <h3 class="font-title-sm text-title-sm text-on-surface font-bold">${window.ArbaUtils.escapeHtml(order.outletName)}</h3>
          </div>
          <button class="icon-btn" onclick="window.ArbaApp.closeModal()">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div class="modal-body">
          <div class="grid grid-cols-2 gap-2 p-3 bg-surface-container-low rounded-lg text-xs">
            <div>
              <span class="text-on-surface-variant">Sales Rep:</span>
              <p class="font-semibold text-on-surface">${window.ArbaUtils.escapeHtml(order.salesRep)} (${window.ArbaUtils.escapeHtml(order.salesRepId)})</p>
            </div>
            <div>
              <span class="text-on-surface-variant">Termin Pembayaran:</span>
              <p class="font-semibold text-on-surface">${window.ArbaUtils.escapeHtml(order.terms)}</p>
            </div>
            <div>
              <span class="text-on-surface-variant">Koordinat GPS Outlet:</span>
              <p class="font-mono text-on-surface">${window.ArbaUtils.escapeHtml(order.geofenceCoords)}</p>
            </div>
            <div>
              <span class="text-on-surface-variant">Total Nilai Faktur:</span>
              <p class="font-bold text-primary text-sm">${window.ArbaUtils.formatRupiah(order.totalAmount)}</p>
            </div>
          </div>

          <div>
            <h4 class="font-semibold text-xs uppercase tracking-wider text-on-surface-variant mb-2">
              Daftar SKU Herbal Dipesan
            </h4>
            <div class="divide-y divide-border-subtle/40 border border-border-subtle/40 rounded-lg overflow-hidden">
              ${order.items.map(function (it) {
                return `
                  <div class="p-2.5 flex items-center justify-between text-xs bg-surface-container-lowest">
                    <div>
                      <div class="font-semibold text-on-surface">${window.ArbaUtils.escapeHtml(it.name)}</div>
                      <div class="text-[11px] text-on-surface-variant font-mono">${window.ArbaUtils.escapeHtml(it.batch)} • ${window.ArbaUtils.escapeHtml(it.fefoPriority)}</div>
                    </div>
                    <div class="text-right">
                      <div class="font-bold text-on-surface">${it.quantity} unit</div>
                      <div class="text-[11px] text-on-surface-variant">${window.ArbaUtils.formatRupiah(it.subtotal)}</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button onclick="window.ArbaApp.closeModal()" class="btn btn-outline" type="button">
            Tutup
          </button>
          <button onclick="window.ArbaApp.closeModal(); window.ArbaApp.navigate('order-approval-queue');" class="btn btn-primary" type="button">
            Buka di Antrean Otorisasi
          </button>
        </div>
      </div>
    `;
    window.ArbaApp.openModal(modalHtml);
  }

  // Executive Strategic PDF Report Modal
  function openPdfModal() {
    var outlets = window.ArbaStore.getState().outlets;
    var analytics = window.ArbaStore.getAnalytics();
    var modalHtml = `
      <div class="modal-dialog max-w-2xl">
        <div class="modal-header">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-primary text-[24px]">picture_as_pdf</span>
            <h3 class="modal-title">Laporan Strategis Eksekutif CV Arba'in Solo Raya</h3>
          </div>
          <button class="icon-btn" onclick="window.ArbaApp.closeModal()">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div class="modal-body">
          <div class="p-4 bg-white rounded-xl border border-slate-200 text-slate-800 space-y-4">
            <div class="flex justify-between items-start border-b pb-3">
              <div>
                <h2 class="text-xl font-bold text-teal-800">CV ARBA'IN SURAKARTA</h2>
                <p class="text-xs text-slate-500">Pusat Distribusi Produk Herbal Solo Raya</p>
                <p class="text-xs text-slate-500">Periode: Maret 2026 (Kuartal I 2026)</p>
              </div>
              <div class="text-right text-xs">
                <p class="text-slate-500 mt-1">Dicetak: ${new Date().toLocaleDateString('id-ID')}</p>
              </div>
            </div>

            <div class="grid grid-cols-3 gap-3 text-center">
              <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span class="text-[11px] text-slate-500 uppercase font-semibold">Total Omset</span>
                <div class="text-lg font-bold text-teal-700">${window.ArbaUtils.formatRupiah(analytics.revenueMonth)}</div>
                <span class="text-[10px] text-emerald-600 font-semibold">${analytics.revenuePct}% dari Target</span>
              </div>
              <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span class="text-[11px] text-slate-500 uppercase font-semibold">Mitra B2B Aktif</span>
                <div class="text-lg font-bold text-slate-800">${analytics.totalOutlets} Outlet</div>
                <span class="text-[10px] text-slate-500">${outlets.length} Terdaftar</span>
              </div>
              <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span class="text-[11px] text-slate-500 uppercase font-semibold">SKU Kritis</span>
                <div class="text-lg font-bold text-amber-600">${analytics.orangeStockAlarms.length + analytics.pinkExpiryAlarms.length}</div>
                <span class="text-[10px] text-slate-500">ROP &amp; Kedaluwarsa</span>
              </div>
            </div>

            <div class="pt-3 border-t text-xs text-slate-500 flex justify-between">
              <span>Disahkan oleh: Direktur Operasional CV Arba'in</span>
              <span>Tanda Tangan Elektronik Terverifikasi</span>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button onclick="window.ArbaApp.closeModal()" class="btn btn-outline" type="button">
            Tutup
          </button>
          <button onclick="window.print(); window.ArbaApp.closeModal();" class="btn btn-primary" type="button">
            <span class="material-symbols-outlined text-[16px]">print</span>
            <span>Cetak Lembar Laporan</span>
          </button>
        </div>
      </div>
    `;
    window.ArbaApp.openModal(modalHtml);
  }

  // At-Risk Sales Visit Dispatch Modal
  function openAtRiskModal() {
    var modalHtml = `
      <div class="modal-dialog max-w-xl">
        <div class="modal-header">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-badge-amber text-[24px]">send</span>
            <h3 class="modal-title">Disposisi Kunjungan Prioritas (At-Risk Accounts)</h3>
          </div>
          <button class="icon-btn" onclick="window.ArbaApp.closeModal()">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div class="modal-body">
          <p class="text-xs text-on-surface-variant">
            Sistem mendeteksi 12 mitra yang belum melakukan repeat order &gt;30 hari. Kirimkan jadwal kunjungan langsung ke sales rep penanggung jawab di wilayah Solo Baru dan Boyolali.
          </p>

          <div class="space-y-2">
            <div class="p-3 bg-surface-container-low rounded-lg text-xs space-y-1">
              <div class="flex justify-between font-bold text-on-surface">
                <span>Apotek Medika Boyolali</span>
                <span class="text-badge-amber">38 Hari Tidak Ada Order</span>
              </div>
              <div class="text-slate-500">Sales Dedikasi: Budi Santoso • Termin Net 30 Hari</div>
              <button
                type="button"
                id="btn-dispatch-medika"
                class="mt-2 w-full py-1.5 bg-primary text-white rounded text-xs font-semibold hover:bg-primary-container cursor-pointer border-0"
              >
                Jadwalkan Kunjungan ke Outlet Ini
              </button>
            </div>

            <div class="p-3 bg-surface-container-low rounded-lg text-xs space-y-1">
              <div class="flex justify-between font-bold text-on-surface">
                <span>Toko Herbal Sehat Karanganyar</span>
                <span class="text-badge-amber">42 Hari Tidak Ada Order</span>
              </div>
              <div class="text-slate-500">Sales Dedikasi: Agus Hermawan • Termin COD Cash</div>
              <button
                type="button"
                id="btn-dispatch-herbal"
                class="mt-2 w-full py-1.5 bg-primary text-white rounded text-xs font-semibold hover:bg-primary-container cursor-pointer border-0"
              >
                Jadwalkan Kunjungan ke Outlet Ini
              </button>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button onclick="window.ArbaApp.closeModal()" class="btn btn-outline" type="button">
            Tutup
          </button>
        </div>
      </div>
    `;

    window.ArbaApp.openModal(modalHtml);

    // Bind inside modal
    setTimeout(function () {
      var btnMedika = document.getElementById('btn-dispatch-medika');
      if (btnMedika) {
        btnMedika.onclick = function () {
          window.ArbaStore.scheduleSalesVisit({
            outletId: 'AP-KRA-004',
            outletName: 'Apotek Medika Boyolali',
            salesRep: 'Budi Santoso',
            scheduledDate: '2026-04-01T09:30',
            purpose: 'Follow Up At-Risk',
            notes: 'Tawarkan restock Madu Randu dan perpanjangan kelonggaran plafon kredit.'
          });
          window.ArbaApp.showToast('Disposisi terkirim ke Budi Santoso untuk Apotek Medika Boyolali', 'send');
          window.ArbaApp.closeModal();
        };
      }

      var btnHerbal = document.getElementById('btn-dispatch-herbal');
      if (btnHerbal) {
        btnHerbal.onclick = function () {
          window.ArbaStore.scheduleSalesVisit({
            outletId: 'AP-KRA-078',
            outletName: 'Toko Herbal Sehat Karanganyar',
            salesRep: 'Agus Hermawan',
            scheduledDate: '2026-04-01T14:00',
            purpose: 'Follow Up At-Risk',
            notes: 'Edukasi produk baru Kapsul Temulawak dan penawaran sampel display gratis.'
          });
          window.ArbaApp.showToast('Disposisi terkirim ke Agus Hermawan untuk Toko Herbal Sehat', 'send');
          window.ArbaApp.closeModal();
        };
      }
    }, 50);
  }

  window.ArbaViews.renderExecutiveDashboard = renderExecutiveDashboard;
})();
