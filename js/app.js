/* app.js — builds the Excel-style sheet from MTT.calc and wires up the page.
 * No framework, no build step. Works on GitHub Pages and from a file (Electron later).
 *
 * Anything that comes from outside (a shared link, an opened file, a paste) is untrusted.
 * It is cleaned by cleanSheet() and shown with textContent / value, never innerHTML.
 */
(function () {
  "use strict";

  var calc = window.MTT.calc;
  var GROUPS = calc.GROUPS, WELLS = calc.WELLS, READINGS = calc.READINGS, COLS = calc.COLS;
  var STORE_KEY = "mtt-tool:workbook:v2";
  var MAX_SHEETS = 12;
  var SVGNS = "http://www.w3.org/2000/svg";

  var $ = function (id) { return document.getElementById(id); };

  // ---------- state ----------
  var wb = { sheets: [], active: 0, chartX: "linear" };
  var table = { raw: [], blank: [], corr: [], viab: [], labels: [], ctrl: null, ref: null };
  var lastOut = null;
  var chartWidth = 0;

  function sheet() { return wb.sheets[wb.active]; }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function fmt(x, d) { return x === null || x === undefined || !isFinite(x) ? "–" : x.toFixed(d); }

  // ---------- cleaning data from outside ----------
  function str(x, max) {
    if (typeof x === "number" && isFinite(x)) x = String(x);
    return typeof x === "string" ? x.slice(0, max) : "";
  }

  function cleanGrid(g, fill) {
    var out = [];
    for (var r = 0; r < READINGS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) {
        var v = g && g[r] ? str(g[r][c], 16) : "";
        row.push(v === "" ? fill : v);
      }
      out.push(row);
    }
    return out;
  }

  function cleanSheet(o) {
    if (!o || typeof o !== "object") return null;
    var base = calc.newSheet();
    var s = {
      name: str(o.name, 24) || "Sheet",
      unit: str(o.unit, 8) || base.unit,
      groups: [],
      raw: cleanGrid(o.raw, ""),
      blank: cleanGrid(o.blank, "0"),
      refMode: o.refMode === "fixed" ? "fixed" : "auto",
      refValue: str(o.refValue, 16)
    };
    for (var g = 0; g < GROUPS; g++) {
      var src = Array.isArray(o.groups) && o.groups[g] ? o.groups[g] : {};
      s.groups.push({
        label: str(src.label, 24) || base.groups[g].label,
        conc: src.conc === undefined ? base.groups[g].conc : str(src.conc, 12)
      });
    }
    return s;
  }

  function uniqueName(name) {
    var taken = wb.sheets.map(function (s) { return s.name; });
    if (taken.indexOf(name) === -1) return name;
    for (var i = 2; i < 100; i++) {
      var n = name.slice(0, 20) + " " + i;
      if (taken.indexOf(n) === -1) return n;
    }
    return name;
  }

  // ---------- saving in this browser ----------
  var saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(wb)); } catch (e) { /* storage blocked */ }
    }, 250);
  }

  function load() {
    var data = null;
    try { data = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { data = null; }
    if (data && Array.isArray(data.sheets)) {
      wb.sheets = data.sheets.slice(0, MAX_SHEETS).map(cleanSheet).filter(Boolean);
      wb.chartX = data.chartX === "log" ? "log" : "linear";
      wb.active = Math.min(Math.max(0, +data.active || 0), Math.max(0, wb.sheets.length - 1));
    }
    if (!wb.sheets.length) {
      wb.sheets = ["Cıs", "Car", "Doco"].map(function (n) { return calc.newSheet(n); });
      wb.active = 0;
    }
  }

  // ---------- toast ----------
  var toastTimer;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2400);
  }

  // ---------- tabs ----------
  function renderTabs() {
    var box = $("tabs");
    box.textContent = "";
    wb.sheets.forEach(function (s, i) {
      var b = el("button", "tab", s.name);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", i === wb.active ? "true" : "false");
      b.addEventListener("click", function () { wb.active = i; openSheet(); save(); });
      box.appendChild(b);
    });
    if (wb.sheets.length < MAX_SHEETS) {
      var add = el("button", "tab add", "+ New sheet");
      add.type = "button";
      add.addEventListener("click", function () {
        wb.sheets.push(calc.newSheet(uniqueName("Sheet " + (wb.sheets.length + 1))));
        wb.active = wb.sheets.length - 1;
        openSheet();
        save();
      });
      box.appendChild(add);
    }
    $("delete").disabled = wb.sheets.length < 2;
  }

  // ---------- the plate sheet ----------
  function groupClass(g) { return g % 2 ? "g-odd" : "g-even"; }

  function labelCell(text, cls) {
    var th = el("th", "rowlabel" + (cls ? " " + cls : ""), text);
    th.scope = "row";
    return th;
  }

  function headerRow(T, title, editable) {
    var tr = el("tr");
    tr.appendChild(labelCell(title, "section"));
    for (var g = 0; g < GROUPS; g++) {
      var th = el("th", "ghead");
      th.colSpan = WELLS;
      if (editable) {
        var inp = el("input");
        inp.type = "text";
        inp.maxLength = 24;
        inp.autocomplete = "off";
        inp.value = sheet().groups[g].label;
        inp.dataset.kind = "label";
        inp.dataset.g = g;
        inp.setAttribute("aria-label", "Group " + (g + 1) + " name");
        th.appendChild(inp);
      } else {
        var span = el("span", "", sheet().groups[g].label);
        table.labels.push({ g: g, node: span });
        th.appendChild(span);
      }
      tr.appendChild(th);
    }
    T.appendChild(tr);
  }

  function concRow(T) {
    var tr = el("tr");
    var lab = labelCell("Conc (" + sheet().unit + ")");
    lab.id = "conc-label";
    tr.appendChild(lab);
    for (var g = 0; g < GROUPS; g++) {
      var th = el("th", "conc " + groupClass(g));
      th.colSpan = WELLS;
      var inp = el("input");
      inp.type = "text";
      inp.inputMode = "decimal";
      inp.autocomplete = "off";
      inp.maxLength = 12;
      inp.value = sheet().groups[g].conc;
      inp.dataset.kind = "conc";
      inp.dataset.g = g;
      inp.setAttribute("aria-label", "Group " + (g + 1) + " concentration");
      th.appendChild(inp);
      tr.appendChild(th);
    }
    T.appendChild(tr);
  }

  function inputRows(T, kind, name) {
    table[kind] = [];
    for (var r = 0; r < READINGS; r++) {
      var tr = el("tr");
      tr.appendChild(labelCell((r + 1) + ". Okuma"));
      table[kind].push([]);
      for (var c = 0; c < COLS; c++) {
        var td = el("td", "cell " + groupClass(Math.floor(c / WELLS)));
        var inp = el("input");
        inp.type = "text";
        inp.inputMode = "decimal";
        inp.autocomplete = "off";
        inp.spellcheck = false;
        inp.value = sheet()[kind][r][c];
        inp.dataset.kind = kind;
        inp.dataset.r = r;
        inp.dataset.c = c;
        inp.setAttribute("aria-label", name + ", reading " + (r + 1) + ", group " + (Math.floor(c / WELLS) + 1) + ", well " + (c % WELLS + 1));
        td.appendChild(inp);
        tr.appendChild(td);
        table[kind][r].push(inp);
      }
      T.appendChild(tr);
    }
  }

  function calcRows(T, kind) {
    table[kind] = [];
    for (var r = 0; r < READINGS; r++) {
      var tr = el("tr");
      tr.appendChild(labelCell((r + 1) + ". Okuma"));
      table[kind].push([]);
      for (var c = 0; c < COLS; c++) {
        var td = el("td", "calc " + groupClass(Math.floor(c / WELLS)), "–");
        tr.appendChild(td);
        table[kind][r].push(td);
      }
      T.appendChild(tr);
    }
  }

  function singleValueRow(T, title) {
    var tr = el("tr");
    tr.appendChild(labelCell(title));
    var v = el("td", "calc big", "–");
    v.colSpan = WELLS;
    tr.appendChild(v);
    var rest = el("td", "fill");
    rest.colSpan = COLS - WELLS;
    tr.appendChild(rest);
    T.appendChild(tr);
    return v;
  }

  function buildTable() {
    var T = $("sheet");
    T.textContent = "";
    table.labels = [];
    headerRow(T, "Plate readings (OD)", true);
    concRow(T);
    inputRows(T, "raw", "Reading");
    headerRow(T, "Blank readings", false);
    inputRows(T, "blank", "Blank");
    headerRow(T, "Reading − Blank", false);
    calcRows(T, "corr");
    table.ctrl = singleValueRow(T, "Control average");
    table.ref = singleValueRow(T, "100% reference");
    headerRow(T, "% viability", false);
    calcRows(T, "viab");
  }

  function syncInputs() {                    // push state into the boxes (after paste / demo / clear)
    var s = sheet();
    ["raw", "blank"].forEach(function (k) {
      for (var r = 0; r < READINGS; r++) for (var c = 0; c < COLS; c++) table[k][r][c].value = s[k][r][c];
    });
  }

  // ---------- typing, pasting, keys ----------
  var NAV = [["raw", 0], ["raw", 1], ["raw", 2], ["blank", 0], ["blank", 1], ["blank", 2]];

  function onInput(e) {
    var t = e.target, k = t.dataset.kind, s = sheet();
    if (!k) return;
    if (k === "raw" || k === "blank") s[k][+t.dataset.r][+t.dataset.c] = t.value;
    else if (k === "label") s.groups[+t.dataset.g].label = t.value;
    else if (k === "conc") s.groups[+t.dataset.g].conc = t.value;
    update();
    save();
  }

  function onPaste(e) {
    var t = e.target, k = t.dataset && t.dataset.kind;
    if (k !== "raw" && k !== "blank") return;
    var text = (e.clipboardData || window.clipboardData).getData("text") || "";
    var body = text.replace(/\r/g, "").replace(/\n+$/, "");
    if (body.indexOf("\t") === -1 && body.indexOf("\n") === -1) return;   // one value: normal paste
    e.preventDefault();
    var r0 = +t.dataset.r, c0 = +t.dataset.c, filled = 0, s = sheet();
    body.split("\n").forEach(function (line, dr) {
      line.split("\t").forEach(function (v, dc) {
        var r = r0 + dr, c = c0 + dc;
        if (r < READINGS && c < COLS) { s[k][r][c] = v.trim().slice(0, 16); filled++; }
      });
    });
    syncInputs();
    update();
    save();
    toast("Pasted " + filled + " cells");
  }

  function onKey(e) {
    var t = e.target, k = t.dataset && t.dataset.kind;
    if (k !== "raw" && k !== "blank") return;
    var step = e.key === "Enter" ? (e.shiftKey ? -1 : 1) : e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    var idx = -1;
    NAV.forEach(function (n, i) { if (n[0] === k && n[1] === +t.dataset.r) idx = i; });
    var next = NAV[idx + step];
    if (!next) return;
    e.preventDefault();
    var target = table[next[0]][next[1]][+t.dataset.c];
    target.focus();
    target.select();
  }

  // ---------- chart (inline SVG) ----------
  function svgEl(tag, attrs, text) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (a) { n.setAttribute(a, attrs[a]); });
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function niceTicks(lo, hi, target) {
    var range = hi - lo || 1;
    var raw = range / target, mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
    var step = (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
    var out = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }

  function sig(x, d) { return x === null ? "–" : (+x.toPrecision(d)).toString().replace("-", "−"); }

  function drawChart(out) {
    var box = $("chart"), mode = wb.chartX;
    box.textContent = "";
    $("fit").textContent = "";
    var pts = calc.plotPoints(out.summary, mode);
    var unit = sheet().unit;

    if (!pts.length) {
      box.appendChild(el("p", "chart-empty", "Enter readings and concentrations to see the chart."));
      return;
    }

    var W = Math.max(280, Math.round(box.clientWidth || 640));
    var H = Math.round(Math.min(380, Math.max(240, W * 0.62)));
    var L = 44, R = 14, T = 14, B = 46;
    var pw = W - L - R, ph = H - T - B;
    chartWidth = box.clientWidth;

    // domains
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var x0, x1, xt;
    if (mode === "log") {
      x0 = Math.floor(Math.min.apply(null, xs)); x1 = Math.ceil(Math.max.apply(null, xs));
      if (x1 === x0) x1 = x0 + 1;
      xt = []; for (var e = x0; e <= x1; e++) xt.push(e);
    } else {
      x0 = Math.min(0, Math.min.apply(null, xs)); x1 = Math.max.apply(null, xs);
      if (x1 === x0) x1 = x0 + 1;
      var pad = (x1 - x0) * 0.04; x1 += pad; if (x0 < 0) x0 -= pad;
      xt = niceTicks(x0, x1, Math.max(3, Math.floor(pw / 70)));
    }
    var yMax = Math.max(100, Math.ceil((Math.max.apply(null, ys) + 5) / 20) * 20);
    var yMin = Math.min(0, Math.floor((Math.min.apply(null, ys) - 5) / 20) * 20);
    var yt = niceTicks(yMin, yMax, Math.max(4, Math.floor(ph / 32)));

    var X = function (v) { return L + (v - x0) / (x1 - x0) * pw; };
    var Y = function (v) { return T + (1 - (v - yMin) / (yMax - yMin)) * ph; };

    var svg = svgEl("svg", { "class": "chart", viewBox: "0 0 " + W + " " + H, role: "img",
      "aria-label": "Scatter chart of mean percent viability against concentration. The same numbers are in the summary table." });
    var clip = svgEl("clipPath", { id: "plot-clip" });
    clip.appendChild(svgEl("rect", { x: L, y: T, width: pw, height: ph }));
    svg.appendChild(clip);

    // grid + y ticks
    yt.forEach(function (v) {
      svg.appendChild(svgEl("line", { "class": "grid", x1: L, x2: W - R, y1: Y(v), y2: Y(v) }));
      svg.appendChild(svgEl("text", { x: L - 8, y: Y(v) + 4, "text-anchor": "end" }, String(v)));
    });
    // x ticks
    xt.forEach(function (v) {
      var label = mode === "log" ? sig(Math.pow(10, v), 3) : String(v);
      svg.appendChild(svgEl("line", { "class": "axis", x1: X(v), x2: X(v), y1: T + ph, y2: T + ph + 5 }));
      svg.appendChild(svgEl("text", { x: X(v), y: T + ph + 20, "text-anchor": "middle" }, label));
    });
    svg.appendChild(svgEl("line", { "class": "axis", x1: L, x2: W - R, y1: T + ph, y2: T + ph }));
    svg.appendChild(svgEl("text", { "class": "axis-title", x: L + pw / 2, y: H - 8, "text-anchor": "middle" },
      mode === "log" ? "Concentration (" + unit + ", log scale)" : "Concentration (" + unit + ")"));
    svg.appendChild(svgEl("text", { "class": "axis-title", x: 14, y: T + ph / 2, "text-anchor": "middle",
      transform: "rotate(-90 14 " + (T + ph / 2) + ")" }, "% cell viability"));

    // fit line
    var fit = calc.linearFit(pts);
    if (fit) {
      var fx0 = Math.min.apply(null, xs), fx1 = Math.max.apply(null, xs);
      var g = svgEl("g", { "clip-path": "url(#plot-clip)" });
      g.appendChild(svgEl("line", { "class": "fit-line", x1: X(fx0), y1: Y(fit.slope * fx0 + fit.intercept), x2: X(fx1), y2: Y(fit.slope * fx1 + fit.intercept) }));
      svg.appendChild(g);
      var eq = "y = " + sig(fit.slope, 4) + "x " + (fit.intercept < 0 ? "− " : "+ ") + sig(Math.abs(fit.intercept), 4);
      var r2 = fit.r2 === null ? "–" : fit.r2.toFixed(4);
      $("fit").textContent = "Linear fit: " + eq + ",  R² = " + r2 + (mode === "log" ? "  (x = log10 of concentration; control left out)" : "");
      if (W >= 520) svg.appendChild(svgEl("text", { "class": "fit-label", x: W - R - 4, y: T + 16, "text-anchor": "end" }, eq + "   R² = " + r2));
    }

    // points (drawn last, on top). Each has a big invisible hit area.
    var tip = el("div", "tip");
    tip.hidden = true;
    var nodes = pts.map(function (p, i) {
      var cx = X(p.x), cy = Y(p.y);
      var g2 = svgEl("g", { "class": "pt", tabindex: "0", role: "img",
        "aria-label": p.label + ", " + p.conc + " " + unit + ", mean viability " + fmt(p.y, 2) + " percent" });
      g2.appendChild(svgEl("circle", { "class": "hit", cx: cx, cy: cy, r: 16 }));
      g2.appendChild(svgEl("circle", { "class": "dot", cx: cx, cy: cy, r: 5 }));
      g2.addEventListener("focus", function () { showTip(i); });
      g2.addEventListener("blur", hideTip);
      svg.appendChild(g2);
      return { g: g2, cx: cx, cy: cy, p: p };
    });

    function showTip(i) {
      nodes.forEach(function (n, j) { n.g.classList.toggle("hot", i === j); });
      var n = nodes[i];
      tip.textContent = "";
      tip.appendChild(el("strong", "", fmt(n.p.y, 2) + " %"));
      tip.appendChild(el("span", "", n.p.label + " · " + n.p.conc + " " + unit));
      tip.appendChild(el("span", "", "SD " + fmt(n.p.sd, 2) + " · SEM " + fmt(n.p.sem, 2)));
      tip.hidden = false;
      var left = Math.min(Math.max(n.cx - tip.offsetWidth / 2, 0), box.clientWidth - tip.offsetWidth);
      var top = n.cy - tip.offsetHeight - 14;
      tip.style.left = left + "px";
      tip.style.top = (top < 0 ? n.cy + 14 : top) + "px";
    }
    function hideTip() { tip.hidden = true; nodes.forEach(function (n) { n.g.classList.remove("hot"); }); }

    svg.addEventListener("pointermove", function (ev) {
      var rect = svg.getBoundingClientRect();
      var mx = (ev.clientX - rect.left) * W / rect.width, my = (ev.clientY - rect.top) * W / rect.width;
      var best = -1, bestD = 40 * 40;
      nodes.forEach(function (n, i) {
        var d = (n.cx - mx) * (n.cx - mx) + (n.cy - my) * (n.cy - my);
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best >= 0) showTip(best); else hideTip();
    });
    svg.addEventListener("pointerleave", hideTip);

    box.appendChild(svg);
    box.appendChild(tip);
  }

  // ---------- summary table ----------
  function drawSummary(out) {
    var T = $("summary"), unit = sheet().unit;
    T.textContent = "";
    var head = el("tr");
    ["Conc (" + unit + ")", "Group", "% Viability", "SD", "%RSD", "N", "SEM", "Mean OD"].forEach(function (h) { head.appendChild(el("th", "", h)); });
    var thead = el("thead"); thead.appendChild(head); T.appendChild(thead);
    var body = el("tbody");
    out.summary.forEach(function (g) {
      var tr = el("tr");
      [calc.parseNum(sheet().groups[g.index].conc) === null ? "–" : sheet().groups[g.index].conc, g.label,
        fmt(g.mean, 4), fmt(g.sd, 4), fmt(g.rsd, 2), String(g.n), fmt(g.sem, 4), fmt(g.meanOd, 4)
      ].forEach(function (v) { tr.appendChild(el("td", "", v)); });
      body.appendChild(tr);
    });
    T.appendChild(body);
  }

  // ---------- update everything that is calculated ----------
  function update() {
    var s0 = sheet();
    var out = calc.compute(s0);
    lastOut = out;

    for (var r = 0; r < READINGS; r++) {
      for (var c = 0; c < COLS; c++) {
        table.corr[r][c].textContent = fmt(out.corrected[r][c], 4);
        table.viab[r][c].textContent = fmt(out.viability[r][c], 2);
      }
    }
    table.ctrl.textContent = fmt(out.controlMean, 4);
    table.ref.textContent = fmt(out.reference, 4);
    table.labels.forEach(function (l) { l.node.textContent = s0.groups[l.g].label; });
    $("conc-label").textContent = "Conc (" + s0.unit + ")";

    // mark boxes that are not numbers
    Array.prototype.forEach.call($("sheet").querySelectorAll('[aria-invalid="true"]'), function (n) { n.removeAttribute("aria-invalid"); });
    out.invalid.raw.forEach(function (p) { table.raw[p[0]][p[1]].setAttribute("aria-invalid", "true"); });
    out.invalid.blank.forEach(function (p) { table.blank[p[0]][p[1]].setAttribute("aria-invalid", "true"); });
    Array.prototype.forEach.call($("sheet").querySelectorAll('input[data-kind="conc"]'), function (n) {
      var v = calc.parseNum(n.value);
      if (v === null || Number.isNaN(v)) n.setAttribute("aria-invalid", "true");
    });

    // reference panel
    $("ref-auto").textContent = out.controlMean === null ? "–" : "(" + fmt(out.controlMean, 4) + ")";
    document.querySelector('input[name="refmode"][value="' + s0.refMode + '"]').checked = true;
    $("ref-fixed").disabled = s0.refMode !== "fixed";
    $("ref-note").textContent = s0.refMode === "fixed"
      ? "The Excel sheet used a typed number here (cell D18)."
      : "The control wells are the 100% mark. This is the usual way.";

    // warnings
    var wl = $("warnings");
    wl.textContent = "";
    out.warnings.forEach(function (w) { wl.appendChild(el("li", "", w)); });

    drawSummary(out);
    drawChart(out);
  }

  // ---------- sheet-level actions ----------
  function openSheet() {
    var s0 = sheet();
    $("sheet-name").value = s0.name;
    $("unit").value = s0.unit;
    $("ref-fixed").value = s0.refValue;
    $("share-box").hidden = true;
    renderTabs();
    buildTable();
    update();
    Array.prototype.forEach.call(document.querySelectorAll(".seg-btn"), function (b) {
      b.setAttribute("aria-pressed", b.dataset.x === wb.chartX ? "true" : "false");
    });
  }

  function hasReadings() {
    return sheet().raw.some(function (row) { return row.some(function (v) { return v.trim() !== ""; }); });
  }

  function fillDemo() {
    if (hasReadings() && !window.confirm("Replace the readings on this sheet with demo numbers?")) return;
    var s0 = sheet(), seed = 20260101;
    var rnd = function () {                       // small repeatable random numbers (mulberry32)
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (var c = 0; c < COLS; c++) {
      var conc = calc.parseNum(s0.groups[Math.floor(c / WELLS)].conc);
      var viab = conc === null || Number.isNaN(conc) || conc <= 0 ? 100 : 100 - 55 * conc / (conc + 12);
      for (var r = 0; r < READINGS; r++) {
        var blank = 0.05 + (rnd() - 0.5) * 0.01;
        var od = 2.0 * viab / 100 * (1 + (rnd() - 0.5) * 0.1);
        s0.blank[r][c] = blank.toFixed(4);
        s0.raw[r][c] = (od + blank).toFixed(4);
      }
    }
    syncInputs();
    update();
    save();
    toast("Demo numbers added");
  }

  function clearReadings() {
    if (hasReadings() && !window.confirm("Clear all readings on this sheet?")) return;
    var s0 = sheet(), base = calc.newSheet();
    s0.raw = base.raw;
    s0.blank = base.blank;
    syncInputs();
    update();
    save();
  }

  function deleteSheet() {
    if (wb.sheets.length < 2) return;
    if (!window.confirm("Delete the sheet “" + sheet().name + "”?")) return;
    wb.sheets.splice(wb.active, 1);
    wb.active = Math.max(0, wb.active - 1);
    openSheet();
    save();
  }

  // ---------- share, save file, open file, CSV ----------
  function toB64(text) {
    var bytes = new TextEncoder().encode(text), bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function fromB64(b64) {
    var bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/")), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function shareLink() {
    var url = location.href.split("#")[0] + "#d=" + toB64(JSON.stringify(sheet()));
    var done = function () { toast("Link copied"); };
    var fallback = function () {
      var b = $("share-box");
      b.hidden = false;
      b.value = url;
      b.focus();
      b.select();
      toast("Copy the link below");
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(done, fallback);
    else fallback();
  }

  function importShared() {
    var m = /^#d=([A-Za-z0-9_-]+)$/.exec(location.hash);
    if (!m) return;
    var added = null;
    try { added = cleanSheet(JSON.parse(fromB64(m[1]))); } catch (e) { added = null; }
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
    if (!added) { toast("That link could not be read"); return; }
    if (wb.sheets.length >= MAX_SHEETS) { toast("Too many sheets. Delete one first."); return; }
    added.name = uniqueName(added.name);
    wb.sheets.push(added);
    wb.active = wb.sheets.length - 1;
    openSheet();
    save();
    toast("Opened a shared sheet as a new tab");
  }

  function download(name, text, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type }));
    var a = el("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportFile() {
    download("mtt-sheets.json", JSON.stringify({ app: "mtt-tool", version: 2, sheets: wb.sheets }, null, 1), "application/json");
  }

  function importFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var list = null;
      try { var d = JSON.parse(reader.result); list = Array.isArray(d.sheets) ? d.sheets : [d]; } catch (e) { list = null; }
      var clean = list ? list.map(cleanSheet).filter(Boolean) : [];
      if (!clean.length) { toast("That file could not be read"); return; }
      clean.slice(0, MAX_SHEETS - wb.sheets.length).forEach(function (x) { x.name = uniqueName(x.name); wb.sheets.push(x); });
      wb.active = wb.sheets.length - clean.length;
      wb.active = Math.min(Math.max(0, wb.active), wb.sheets.length - 1);
      openSheet();
      save();
      toast("Opened " + clean.length + " sheet(s)");
    };
    reader.readAsText(file);
  }

  function csvCell(v) {
    v = String(v);
    if (/^[=+\-@\t\r]/.test(v) && !isFinite(calc.parseNum(v))) v = "'" + v;   // stop spreadsheet formula injection
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function exportCsv() {
    var unit = sheet().unit;
    var rows = [["Conc (" + unit + ")", "Group", "% Viability", "SD", "%RSD", "N", "SEM", "Mean OD"]];
    lastOut.summary.forEach(function (g) {
      rows.push([sheet().groups[g.index].conc, g.label, g.mean, g.sd, g.rsd, g.n, g.sem, g.meanOd].map(function (v) { return v === null ? "" : v; }));
    });
    download(sheet().name + "-summary.csv", rows.map(function (r) { return r.map(csvCell).join(","); }).join("\n"), "text/csv");
  }

  // ---------- start ----------
  function init() {
    load();

    var T = $("sheet");
    T.addEventListener("input", onInput);
    T.addEventListener("paste", onPaste);
    T.addEventListener("keydown", onKey);

    $("sheet-name").addEventListener("input", function (e) { sheet().name = e.target.value.slice(0, 24); renderTabs(); save(); });
    $("unit").addEventListener("input", function (e) { sheet().unit = e.target.value.slice(0, 8); update(); save(); });

    Array.prototype.forEach.call(document.querySelectorAll('input[name="refmode"]'), function (r) {
      r.addEventListener("change", function () {
        sheet().refMode = r.value;
        update();
        save();
        if (r.value === "fixed") $("ref-fixed").focus();
      });
    });
    $("ref-fixed").addEventListener("input", function (e) { sheet().refValue = e.target.value.slice(0, 16); update(); save(); });

    Array.prototype.forEach.call(document.querySelectorAll(".seg-btn"), function (b) {
      b.addEventListener("click", function () { wb.chartX = b.dataset.x; Array.prototype.forEach.call(document.querySelectorAll(".seg-btn"), function (o) { o.setAttribute("aria-pressed", o === b ? "true" : "false"); }); drawChart(lastOut); save(); });
    });

    $("demo").addEventListener("click", fillDemo);
    $("clear").addEventListener("click", clearReadings);
    $("delete").addEventListener("click", deleteSheet);
    $("share").addEventListener("click", shareLink);
    $("export").addEventListener("click", exportFile);
    $("csv").addEventListener("click", exportCsv);
    $("import").addEventListener("click", function () { $("file").click(); });
    $("file").addEventListener("change", function (e) { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ""; });
    window.addEventListener("hashchange", importShared);
    window.addEventListener("resize", function () {
      if (lastOut && $("chart").clientWidth !== chartWidth) drawChart(lastOut);
    });

    openSheet();
    importShared();
  }

  init();
})();
