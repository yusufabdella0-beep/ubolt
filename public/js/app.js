(function () {
  "use strict";

  const CONFIG = window.APP_CONFIG || { title: "Branch Performance", currency: "" };

  const METRICS = {
    deposits:  { label: "Deposits",      kind: "balance", money: true },
    loans:     { label: "Loans",         kind: "balance", money: true },
    customers: { label: "New customers", kind: "flow",    money: false },
    digital:   { label: "Digital users", kind: "flow",    money: false },
  };
  const METRIC_KEYS = Object.keys(METRICS);

  const state = {
    rows: window.SAMPLE_DATA || [],
    region: "all",
    branch: "all",
    period: "q",
    metric: "overall",
    search: "",
    sortKey: "achievement",
    sortAsc: false,
  };

  const $ = (id) => document.getElementById(id);
  const charts = {};

  // ---------- formatting ----------
  const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
  const whole = new Intl.NumberFormat("en");
  const fmtMoney = (v) => (CONFIG.currency ? CONFIG.currency + " " : "") + compact.format(v);
  const fmtVal = (key, v) => (METRICS[key].money ? fmtMoney(v) : whole.format(Math.round(v)));
  const fmtPct = (v) => (isFinite(v) ? (v * 100).toFixed(1) + "%" : "–");
  const fmtGrowth = (v) => {
    if (!isFinite(v)) return '<span class="hint">–</span>';
    const cls = v >= 0 ? "up" : "down";
    return `<span class="${cls}">${v >= 0 ? "▲" : "▼"} ${Math.abs(v * 100).toFixed(1)}%</span>`;
  };
  const band = (a) => (a >= 1 ? "good" : a >= 0.85 ? "warn" : "bad");
  const monthLabel = (m) => {
    const [y, mo] = m.split("-").map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString("en", { month: "short", year: "numeric" });
  };
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- data helpers ----------
  const allMonths = () => [...new Set(state.rows.map((r) => r.month))].sort();

  // Returns the list of months covered by the selected period, and the equally long period before it.
  function periodMonths() {
    const months = allMonths();
    if (!months.length) return { cur: [], prev: [] };
    const last = months[months.length - 1];
    let cur;
    if (state.period === "ytd") {
      const year = last.slice(0, 4);
      cur = months.filter((m) => m.startsWith(year));
    } else if (state.period === "q") {
      cur = months.slice(-3);
    } else if (state.period === "all") {
      cur = months.slice();
    } else {
      cur = [state.period];
    }
    const firstIdx = months.indexOf(cur[0]);
    const prev = months.slice(Math.max(0, firstIdx - cur.length), firstIdx);
    return { cur, prev };
  }

  function filteredRows() {
    const q = state.search.toLowerCase();
    return state.rows.filter((r) =>
      (state.region === "all" || r.region === state.region) &&
      (state.branch === "all" || r.code === state.branch) &&
      (!q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q))
    );
  }

  // Aggregate a set of rows for a set of months into actual/target per metric.
  // Balances use the last month of the period; flows are summed over the period.
  function aggregate(rows, months) {
    const out = {};
    METRIC_KEYS.forEach((k) => (out[k] = { actual: 0, target: 0 }));
    if (!months.length) return out;
    const last = months[months.length - 1];
    const set = new Set(months);
    rows.forEach((r) => {
      if (!set.has(r.month)) return;
      METRIC_KEYS.forEach((k) => {
        if (METRICS[k].kind === "balance" && r.month !== last) return;
        out[k].actual += +r[k] || 0;
        out[k].target += +r[k + "_target"] || 0;
      });
    });
    return out;
  }

  function achievementOf(agg) {
    if (state.metric !== "overall") {
      const m = agg[state.metric];
      return m.target ? m.actual / m.target : NaN;
    }
    const parts = METRIC_KEYS.map((k) => (agg[k].target ? agg[k].actual / agg[k].target : NaN)).filter(isFinite);
    return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : NaN;
  }

  function primaryValue(agg) {
    const key = state.metric === "overall" ? "deposits" : state.metric;
    return agg[key].actual;
  }

  function branchSummaries(rows) {
    const { cur, prev } = periodMonths();
    const byBranch = new Map();
    rows.forEach((r) => {
      if (!byBranch.has(r.code)) byBranch.set(r.code, { code: r.code, name: r.name, region: r.region, rows: [] });
      byBranch.get(r.code).rows.push(r);
    });
    const list = [...byBranch.values()].map((b) => {
      const a = aggregate(b.rows, cur);
      const p = aggregate(b.rows, prev);
      const pv = primaryValue(p);
      return {
        ...b,
        agg: a,
        deposits: a.deposits.actual,
        loans: a.loans.actual,
        customers: a.customers.actual,
        digital: a.digital.actual,
        achievement: achievementOf(a),
        growth: pv ? primaryValue(a) / pv - 1 : NaN,
      };
    });
    list.sort((x, y) => (y.achievement || 0) - (x.achievement || 0));
    list.forEach((b, i) => (b.rank = i + 1));
    return list;
  }

  // ---------- filters ----------
  function fillSelect(el, options, value) {
    el.innerHTML = options.map(([v, t]) => `<option value="${escapeHtml(v)}">${escapeHtml(t)}</option>`).join("");
    el.value = options.some(([v]) => v === value) ? value : options[0][0];
    return el.value;
  }

  function renderFilters() {
    const regions = [...new Set(state.rows.map((r) => r.region))].sort();
    state.region = fillSelect($("regionFilter"), [["all", "All regions"], ...regions.map((r) => [r, r])], state.region);

    const branches = new Map();
    state.rows.forEach((r) => {
      if (state.region === "all" || r.region === state.region) branches.set(r.code, r.name);
    });
    const branchOpts = [...branches.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([c, n]) => [c, `${n} (${c})`]);
    state.branch = fillSelect($("branchFilter"), [["all", "All branches"], ...branchOpts], state.branch);

    const months = allMonths().slice().reverse();
    state.period = fillSelect(
      $("periodFilter"),
      [["ytd", "Year to date"], ["q", "Last 3 months"], ["all", "All months"], ...months.map((m) => [m, monthLabel(m)])],
      state.period
    );

    state.metric = fillSelect(
      $("metricFilter"),
      [["overall", "Overall score"], ...METRIC_KEYS.map((k) => [k, METRICS[k].label])],
      state.metric
    );
  }

  // ---------- rendering ----------
  function renderKpis(rows) {
    const { cur, prev } = periodMonths();
    const a = aggregate(rows, cur);
    const p = aggregate(rows, prev);
    const cards = METRIC_KEYS.map((k) => {
      const ach = a[k].target ? a[k].actual / a[k].target : NaN;
      const g = p[k].actual ? a[k].actual / p[k].actual - 1 : NaN;
      const width = Math.min(100, Math.max(0, (ach || 0) * 100));
      return `
        <div class="kpi">
          <div class="label">${METRICS[k].label}</div>
          <div class="value">${fmtVal(k, a[k].actual)}</div>
          <div class="meta"><span>Target ${fmtVal(k, a[k].target)}</span>${fmtGrowth(g)}</div>
          <div class="progress"><span style="width:${width}%;background:var(--${band(ach)})"></span></div>
          <div class="meta"><span>Achievement</span><span class="badge ${band(ach)}">${fmtPct(ach)}</span></div>
        </div>`;
    });
    const summaries = branchSummaries(rows);
    const onTarget = summaries.filter((b) => b.achievement >= 1).length;
    cards.unshift(`
      <div class="kpi">
        <div class="label">Overall achievement</div>
        <div class="value">${fmtPct(achievementOf(a))}</div>
        <div class="meta"><span>${summaries.length} branches</span><span>${onTarget} on target</span></div>
        <div class="progress"><span style="width:${summaries.length ? (onTarget / summaries.length) * 100 : 0}%"></span></div>
        <div class="meta"><span>${state.metric === "overall" ? "Average of all metrics" : METRICS[state.metric].label}</span></div>
      </div>`);
    $("kpis").innerHTML = cards.join("");

    const months = cur.length ? `${monthLabel(cur[0])}${cur.length > 1 ? " – " + monthLabel(cur[cur.length - 1]) : ""}` : "No data";
    $("asOf").textContent = months;
  }

  function baseChartOptions() {
    const text = css("--muted");
    const grid = css("--border");
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: text, boxWidth: 12, usePointStyle: true } } },
      scales: {
        x: { ticks: { color: text }, grid: { display: false } },
        y: { ticks: { color: text }, grid: { color: grid } },
      },
    };
  }

  function upsertChart(id, config) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart($(id), config);
  }

  function renderBarChart(summaries) {
    const key = state.metric === "overall" ? null : state.metric;
    const top = summaries.slice().sort((a, b) => (key ? b[key] - a[key] : b.achievement - a.achievement)).slice(0, 15);
    const opts = baseChartOptions();
    $("barTitle").textContent = key ? `${METRICS[key].label}: actual vs target` : "Achievement by branch";

    if (key) {
      opts.scales.y.ticks.callback = (v) => (METRICS[key].money ? compact.format(v) : whole.format(v));
      upsertChart("barChart", {
        type: "bar",
        data: {
          labels: top.map((b) => b.name),
          datasets: [
            { label: "Actual", data: top.map((b) => b.agg[key].actual), backgroundColor: css("--primary"), borderRadius: 4 },
            { label: "Target", data: top.map((b) => b.agg[key].target), backgroundColor: css("--border"), borderRadius: 4 },
          ],
        },
        options: opts,
      });
    } else {
      opts.scales.y.ticks.callback = (v) => v + "%";
      opts.plugins.legend.display = false;
      upsertChart("barChart", {
        type: "bar",
        data: {
          labels: top.map((b) => b.name),
          datasets: [{
            label: "Achievement",
            data: top.map((b) => +(b.achievement * 100).toFixed(1)),
            backgroundColor: top.map((b) => css("--" + band(b.achievement))),
            borderRadius: 4,
          }],
        },
        options: opts,
      });
    }
  }

  function trendSeries(rows, key) {
    const months = allMonths();
    return months.map((m) => {
      const a = aggregate(rows, [m])[key];
      return { m, actual: a.actual, target: a.target };
    });
  }

  function renderTrend(rows) {
    const key = state.metric === "overall" ? "deposits" : state.metric;
    const s = trendSeries(rows, key);
    $("trendTitle").textContent = `${METRICS[key].label}: monthly trend`;
    const opts = baseChartOptions();
    opts.scales.y.ticks.callback = (v) => compact.format(v);
    upsertChart("trendChart", {
      type: "line",
      data: {
        labels: s.map((x) => monthLabel(x.m)),
        datasets: [
          { label: "Actual", data: s.map((x) => x.actual), borderColor: css("--primary"), backgroundColor: css("--primary-soft"), fill: true, tension: 0.3, pointRadius: 3 },
          { label: "Target", data: s.map((x) => x.target), borderColor: css("--muted"), borderDash: [5, 5], tension: 0.3, pointRadius: 0 },
        ],
      },
      options: opts,
    });
  }

  function renderRegionChart() {
    const { cur } = periodMonths();
    const regions = [...new Set(state.rows.map((r) => r.region))].sort();
    const values = regions.map((reg) => achievementOf(aggregate(state.rows.filter((r) => r.region === reg), cur)));
    const opts = baseChartOptions();
    opts.indexAxis = "y";
    opts.plugins.legend.display = false;
    opts.scales.x.ticks.callback = (v) => v + "%";
    opts.scales.x.grid = { color: css("--border") };
    opts.scales.y.grid = { display: false };
    upsertChart("regionChart", {
      type: "bar",
      data: {
        labels: regions,
        datasets: [{
          data: values.map((v) => +(v * 100).toFixed(1)),
          backgroundColor: regions.map((r, i) => (state.region === "all" || state.region === r ? css("--" + band(values[i])) : css("--border"))),
          borderRadius: 4,
        }],
      },
      options: opts,
    });
  }

  function renderBandChart(summaries) {
    const counts = { good: 0, warn: 0, bad: 0 };
    summaries.forEach((b) => counts[band(b.achievement)]++);
    upsertChart("bandChart", {
      type: "doughnut",
      data: {
        labels: ["On target (≥100%)", "Near (85–99%)", "Below (<85%)"],
        datasets: [{
          data: [counts.good, counts.warn, counts.bad],
          backgroundColor: [css("--good"), css("--warn"), css("--bad")],
          borderColor: css("--surface"),
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "65%",
        plugins: { legend: { position: "bottom", labels: { color: css("--muted"), boxWidth: 12, usePointStyle: true } } },
      },
    });
  }

  function renderLeaders(summaries) {
    const item = (b) => `
      <div class="leader" data-code="${escapeHtml(b.code)}">
        <span>${escapeHtml(b.name)}<span class="code">${escapeHtml(b.region)}</span></span>
        <span class="badge ${band(b.achievement)}">${fmtPct(b.achievement)}</span>
      </div>`;
    const top = summaries.slice(0, 5);
    const bottom = summaries.length > 5 ? summaries.slice(-5).reverse() : [];
    $("leaders").innerHTML =
      `<h3>Top 5</h3>${top.map(item).join("")}` +
      (bottom.length ? `<h3>Bottom 5</h3>${bottom.map(item).join("")}` : "");
  }

  function renderTable(summaries) {
    const k = state.sortKey;
    const rows = summaries.slice().sort((a, b) => {
      const x = a[k], y = b[k];
      const r = typeof x === "string" ? x.localeCompare(y) : (x || 0) - (y || 0);
      return state.sortAsc ? r : -r;
    });
    $("rankTable").querySelector("tbody").innerHTML = rows.map((b) => `
      <tr data-code="${escapeHtml(b.code)}">
        <td>${b.rank}</td>
        <td>${escapeHtml(b.name)}<span class="code">${escapeHtml(b.code)}</span></td>
        <td>${escapeHtml(b.region)}</td>
        <td class="num">${fmtMoney(b.deposits)}</td>
        <td class="num">${fmtMoney(b.loans)}</td>
        <td class="num">${whole.format(b.customers)}</td>
        <td class="num">${whole.format(b.digital)}</td>
        <td class="num"><span class="badge ${band(b.achievement)}">${fmtPct(b.achievement)}</span></td>
        <td class="num">${fmtGrowth(b.growth)}</td>
      </tr>`).join("") || `<tr><td colspan="9" class="hint">No branches match the filters.</td></tr>`;
    $("rowCount").textContent = `${rows.length} branches`;
    document.querySelectorAll("#rankTable th").forEach((th) => {
      th.classList.toggle("sorted", th.dataset.key === k);
      th.classList.toggle("asc", th.dataset.key === k && state.sortAsc);
    });
  }

  function render() {
    renderFilters();
    const rows = filteredRows();
    const summaries = branchSummaries(rows);
    renderKpis(rows);
    renderBarChart(summaries);
    renderTrend(rows);
    renderRegionChart();
    renderBandChart(summaries);
    renderLeaders(summaries);
    renderTable(summaries);
    state.lastSummaries = summaries;
  }

  // ---------- branch drawer ----------
  function openBranch(code) {
    const rows = state.rows.filter((r) => r.code === code);
    if (!rows.length) return;
    const b = branchSummaries(rows)[0];
    $("drawerTitle").textContent = b.name;
    $("drawerSub").textContent = `${b.code} · ${b.region} · ${state.metric === "overall" ? "Overall" : METRICS[state.metric].label} achievement ${fmtPct(b.achievement)}`;
    $("drawerKpis").innerHTML = METRIC_KEYS.map((k) => {
      const ach = b.agg[k].target ? b.agg[k].actual / b.agg[k].target : NaN;
      return `<div class="kpi"><div class="label">${METRICS[k].label}</div>
        <div class="value">${fmtVal(k, b.agg[k].actual)}</div>
        <div class="meta"><span>of ${fmtVal(k, b.agg[k].target)}</span><span class="badge ${band(ach)}">${fmtPct(ach)}</span></div></div>`;
    }).join("");

    const months = allMonths();
    const palette = [css("--primary"), css("--good"), css("--warn"), css("--bad")];
    const opts = baseChartOptions();
    opts.scales.y.ticks.callback = (v) => v + "%";
    upsertChart("drawerChart", {
      type: "line",
      data: {
        labels: months.map(monthLabel),
        datasets: METRIC_KEYS.map((k, i) => ({
          label: METRICS[k].label,
          data: months.map((m) => {
            const a = aggregate(rows, [m])[k];
            return a.target ? +((a.actual / a.target) * 100).toFixed(1) : null;
          }),
          borderColor: palette[i],
          backgroundColor: palette[i],
          tension: 0,
          pointRadius: 2,
        })),
      },
      options: opts,
    });
    $("drawer").classList.add("open");
    $("drawer").setAttribute("aria-hidden", "false");
  }

  function closeDrawer() {
    $("drawer").classList.remove("open");
    $("drawer").setAttribute("aria-hidden", "true");
  }

  // ---------- CSV import / export ----------
  function parseCsv(text) {
    const lines = [];
    let row = [], field = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.some((v) => v.trim() !== "")) lines.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.some((v) => v.trim() !== "")) lines.push(row);
    if (lines.length < 2) throw new Error("The file has no data rows.");

    const header = lines[0].map((h) => h.trim().toLowerCase());
    const required = ["month", "code", "name", "region", ...METRIC_KEYS.flatMap((k) => [k, k + "_target"])];
    const missing = required.filter((h) => !header.includes(h));
    if (missing.length) throw new Error("Missing columns: " + missing.join(", "));

    return lines.slice(1).map((cells) => {
      const o = {};
      header.forEach((h, i) => (o[h] = (cells[i] || "").trim()));
      METRIC_KEYS.forEach((k) => {
        o[k] = parseFloat(o[k].replace(/,/g, "")) || 0;
        o[k + "_target"] = parseFloat(o[k + "_target"].replace(/,/g, "")) || 0;
      });
      if (!/^\d{4}-\d{2}$/.test(o.month)) throw new Error(`Invalid month "${o.month}" (use YYYY-MM).`);
      return o;
    });
  }

  function exportCsv() {
    const cols = ["rank", "code", "name", "region", "deposits", "loans", "customers", "digital", "achievement", "growth"];
    const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
    const lines = [cols.join(",")].concat(
      (state.lastSummaries || []).map((b) =>
        cols.map((c) => q(c === "achievement" || c === "growth" ? (isFinite(b[c]) ? b[c].toFixed(4) : "") : b[c])).join(",")
      )
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "branch-performance.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- theme ----------
  function applyTheme(theme) {
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
    render();
  }

  // ---------- events ----------
  function bind() {
    $("regionFilter").addEventListener("change", (e) => { state.region = e.target.value; state.branch = "all"; render(); });
    $("branchFilter").addEventListener("change", (e) => { state.branch = e.target.value; render(); });
    $("periodFilter").addEventListener("change", (e) => { state.period = e.target.value; render(); });
    $("metricFilter").addEventListener("change", (e) => { state.metric = e.target.value; render(); });
    let t;
    $("searchInput").addEventListener("input", (e) => {
      clearTimeout(t);
      t = setTimeout(() => { state.search = e.target.value.trim(); render(); }, 200);
    });

    document.querySelectorAll("#rankTable th").forEach((th) =>
      th.addEventListener("click", () => {
        const k = th.dataset.key;
        if (state.sortKey === k) state.sortAsc = !state.sortAsc;
        else { state.sortKey = k; state.sortAsc = k === "name" || k === "region" || k === "rank"; }
        renderTable(state.lastSummaries || []);
      })
    );
    const openFromClick = (e) => {
      const el = e.target.closest("[data-code]");
      if (el) openBranch(el.dataset.code);
    };
    $("rankTable").addEventListener("click", openFromClick);
    $("leaders").addEventListener("click", openFromClick);
    $("drawerClose").addEventListener("click", closeDrawer);
    $("drawer").addEventListener("click", (e) => { if (e.target.id === "drawer") closeDrawer(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

    $("csvInput").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        state.rows = parseCsv(await file.text());
        Object.assign(state, { region: "all", branch: "all", period: "q", search: "" });
        $("searchInput").value = "";
        document.querySelector(".footer").textContent = `Showing data from ${file.name} (${state.rows.length} rows).`;
        render();
      } catch (err) {
        alert("Could not load CSV: " + err.message);
      }
      e.target.value = "";
    });
    $("exportBtn").addEventListener("click", exportCsv);

    $("themeBtn").addEventListener("click", () => {
      const dark = document.documentElement.getAttribute("data-theme") === "dark" ||
        (!document.documentElement.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
      const next = dark ? "light" : "dark";
      try { localStorage.setItem("bp-theme", next); } catch (_) {}
      applyTheme(next);
    });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => render());
  }

  // ---------- init ----------
  document.title = CONFIG.title;
  document.querySelector(".topbar h1").textContent = CONFIG.title;
  let saved = null;
  try { saved = localStorage.getItem("bp-theme"); } catch (_) {}
  if (saved) document.documentElement.setAttribute("data-theme", saved);
  if (window.Chart) {
    Chart.defaults.font.family = "Inter, system-ui, sans-serif";
  }
  bind();
  render();
})();
