/* calc.js — all the MTT assay maths lives in this file.
 *
 * It follows the lab Excel sheet (BT_24.xlsx), one sheet at a time:
 *   readings (OD) − blank          -> corrected OD        (Excel rows 14-16)
 *   control average                -> the 100% reference  (Excel C18 / D18)
 *   corrected / reference × 100    -> % viability         (Excel rows 20-22)
 *   per group: mean, SD, %RSD, N, SEM, mean OD            (Excel rows 25-32)
 *
 * Pure functions only: no DOM, no network. compute() never throws.
 *
 * Layout of one plate sheet (same as Excel columns B..Y):
 *   8 groups × 3 wells = 24 columns, 3 readings ("Okuma") = 3 rows.
 *   Group 0 is always the control ("Kontrol").
 */
(function (root) {
  "use strict";

  var GROUPS = 8;
  var WELLS = 3;
  var READINGS = 3;
  var COLS = GROUPS * WELLS;
  var CONTROL_GROUP = 0;
  var CONTROL_WARN_PCT = 5;      // warn if the control wells are not about 100% of the reference

  // Default group order, as on the plate: control first, then 60 nM down to 0.1 nM.
  var DEFAULT_CONCS = ["0", "60", "30", "10", "3", "1", "0.3", "0.1"];

  // ---------- reading numbers typed by people ----------
  // Accepts "1.5", "1,5" (decimal comma), "1.234,5" and "1,234.5". Empty -> null. Bad -> NaN.
  var NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
  function parseNum(s) {
    if (s === null || s === undefined) return null;
    var t = String(s).replace(/\s/g, "");
    if (t === "") return null;
    var lastDot = t.lastIndexOf("."), lastComma = t.lastIndexOf(",");
    if (lastDot !== -1 && lastComma !== -1) {
      // the separator that comes last is the decimal mark; the other one is a thousands mark
      t = lastComma > lastDot ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
    } else if (lastComma !== -1) {
      t = t.replace(",", ".");
    }
    if (!NUM_RE.test(t)) return NaN;
    var x = Number(t);
    return isFinite(x) ? x : NaN;
  }

  function isNum(x) { return typeof x === "number" && isFinite(x); }

  // ---------- small statistics (empty wells are skipped, like Excel AVERAGE / STDEV.S / COUNT) ----------
  function nums(list) { return list.filter(isNum); }
  function mean(list) {
    var a = nums(list);
    if (!a.length) return null;
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i];
    return s / a.length;
  }
  function sampleSd(list) {            // STDEV.S: divides by n − 1
    var a = nums(list);
    if (a.length < 2) return null;
    var m = mean(a), s = 0;
    for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
    return Math.sqrt(s / (a.length - 1));
  }

  // ---------- a new, empty sheet ----------
  function emptyGrid(fill) {
    var g = [];
    for (var r = 0; r < READINGS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) row.push(fill);
      g.push(row);
    }
    return g;
  }

  function newSheet(name) {
    var unit = "nM";
    return {
      name: name || "Sheet",
      unit: unit,
      groups: DEFAULT_CONCS.map(function (c, i) {
        return { label: i === CONTROL_GROUP ? "Kontrol" : c + " " + unit, conc: c };
      }),
      raw: emptyGrid(""),
      blank: emptyGrid("0"),
      refMode: "auto",          // "auto" = control average is 100%;  "fixed" = type your own value
      refValue: ""
    };
  }

  // ---------- the calculation ----------
  function wellsOf(g) {
    var cols = [];
    for (var w = 0; w < WELLS; w++) cols.push(g * WELLS + w);
    return cols;
  }

  function gather(grid, g) {          // all values of one group, all readings
    var out = [];
    wellsOf(g).forEach(function (c) {
      for (var r = 0; r < READINGS; r++) out.push(grid[r][c]);
    });
    return out;
  }

  function compute(sheet) {
    var warnings = [];
    var invalid = { raw: [], blank: [] };
    var raw = [], blank = [], corrected = [], viability = [];

    for (var r = 0; r < READINGS; r++) {
      raw.push([]); blank.push([]); corrected.push([]); viability.push([]);
      for (var c = 0; c < COLS; c++) {
        var rv = parseNum(sheet.raw[r][c]);
        var bv = parseNum(sheet.blank[r][c]);
        if (Number.isNaN(rv)) invalid.raw.push([r, c]);
        if (Number.isNaN(bv)) invalid.blank.push([r, c]);
        raw[r].push(rv); blank[r].push(bv);
        // empty blank counts as 0; empty or bad reading gives no result
        corrected[r].push(isNum(rv) && !Number.isNaN(bv) ? rv - (bv === null ? 0 : bv) : null);
      }
    }

    // control average (Excel C18)
    var controlMean = mean(gather(corrected, CONTROL_GROUP));

    // the value that counts as 100% (Excel D18)
    var reference = null, referenceError = "";
    if (sheet.refMode === "fixed") {
      var fv = parseNum(sheet.refValue);
      if (fv === null) referenceError = "Type the fixed reference value.";
      else if (!isNum(fv) || fv <= 0) referenceError = "Reference must be a number above 0.";
      else reference = fv;
    } else {
      if (controlMean === null) referenceError = "Fill in the control readings to get the reference.";
      else if (controlMean <= 0) referenceError = "Control average is 0 or less. Check the readings and blanks.";
      else reference = controlMean;
    }

    for (r = 0; r < READINGS; r++) {
      for (c = 0; c < COLS; c++) {
        var cv = corrected[r][c];
        viability[r].push(isNum(cv) && reference !== null ? cv / reference * 100 : null);
      }
    }

    // per-group statistics
    var groups = [];
    for (var g = 0; g < GROUPS; g++) {
      var v = gather(viability, g);
      var m = mean(v), sd = sampleSd(v), n = nums(v).length;
      groups.push({
        index: g,
        label: sheet.groups[g].label,
        conc: parseNum(sheet.groups[g].conc),
        mean: m,                                   // Excel C  "% Cell Viability"
        sd: sd,                                    // Excel D  "SD"
        rsd: sd !== null && m ? sd / m * 100 : null, // Excel E  "%RSD"
        n: n,                                      // Excel F  "N"
        sem: sd !== null ? sd / Math.sqrt(n) : null, // Excel G  "SEM"
        meanOd: mean(gather(corrected, g))         // Excel H  "Conct Avr"
      });
    }

    // summary table: lowest concentration first
    var summary = groups.slice().sort(function (a, b) {
      var ax = isNum(a.conc) ? a.conc : Infinity, bx = isNum(b.conc) ? b.conc : Infinity;
      return ax - bx || a.index - b.index;
    });

    // warnings
    // an empty sheet is not a mistake, so stay quiet until there are control readings
    if (referenceError && (sheet.refMode === "fixed" || controlMean !== null)) warnings.push(referenceError);
    var ctl = groups[CONTROL_GROUP].mean;
    if (reference !== null && ctl !== null && Math.abs(ctl - 100) > CONTROL_WARN_PCT) {
      warnings.push("The control wells average " + ctl.toFixed(1) + "% of the reference. " +
        "They should be about 100%. Check the reference value" +
        (sheet.refMode === "fixed" ? " (try “Control average”)." : "."));
    }
    var concSeen = {};
    groups.forEach(function (gr) {
      if (!isNum(gr.conc)) warnings.push("Group " + (gr.index + 1) + " has no valid concentration, so it is left out of the chart.");
      else if (concSeen[gr.conc]) warnings.push("Two groups have the same concentration (" + gr.conc + ").");
      else concSeen[gr.conc] = true;
    });
    if (invalid.raw.length || invalid.blank.length) {
      warnings.push((invalid.raw.length + invalid.blank.length) + " cell(s) are not numbers and are ignored.");
    }

    return {
      corrected: corrected, viability: viability,
      controlMean: controlMean, reference: reference, referenceError: referenceError,
      groups: groups, summary: summary,
      invalid: invalid, warnings: warnings
    };
  }

  // ---------- straight-line fit (Excel "linear trendline" with equation and R²) ----------
  // xMode "linear": x = concentration.  "log": x = log10(concentration); the control (0) is left out.
  function plotPoints(summary, xMode) {
    var pts = [];
    summary.forEach(function (s) {
      if (!isNum(s.conc) || !isNum(s.mean)) return;
      if (xMode === "log" && s.conc <= 0) return;
      pts.push({ x: xMode === "log" ? Math.log10(s.conc) : s.conc, y: s.mean, conc: s.conc, label: s.label, sd: s.sd, sem: s.sem });
    });
    return pts;
  }

  function linearFit(points) {
    var n = points.length;
    if (n < 2) return null;
    var mx = 0, my = 0, i;
    for (i = 0; i < n; i++) { mx += points[i].x; my += points[i].y; }
    mx /= n; my /= n;
    var sxx = 0, sxy = 0, syy = 0;
    for (i = 0; i < n; i++) {
      var dx = points[i].x - mx, dy = points[i].y - my;
      sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
    }
    if (sxx === 0) return null;
    var slope = sxy / sxx;
    return { slope: slope, intercept: my - slope * mx, r2: syy === 0 ? null : sxy * sxy / (sxx * syy), n: n };
  }

  var api = {
    GROUPS: GROUPS, WELLS: WELLS, READINGS: READINGS, COLS: COLS, CONTROL_GROUP: CONTROL_GROUP,
    parseNum: parseNum, newSheet: newSheet, compute: compute,
    plotPoints: plotPoints, linearFit: linearFit
  };
  root.MTT = root.MTT || {};
  root.MTT.calc = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
