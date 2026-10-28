/* calc.js — all the MTT maths lives in this file.
 *
 * PLACEHOLDER: FIELDS and compute() below are demo only.
 * Replace them with the real MTT inputs and formulas.
 * The page (index.html + app.js) builds itself from FIELDS,
 * so you only need to edit this file.
 *
 * Rules for this file:
 *  - pure functions only (no DOM, no network)
 *  - compute() never throws; bad input becomes an error message
 */
(function (root) {
  "use strict";

  var TITLE = "MTT Tool";
  var SUBTITLE = "Starter template — demo formulas only";

  // One entry = one input box on the page.
  var FIELDS = [
    { id: "a",    label: "Input A",  unit: "",  value: 100, min: 0, hint: "Demo number" },
    { id: "b",    label: "Input B",  unit: "",  value: 8,   min: 0, hint: "Demo number" },
    { id: "rate", label: "Rate",     unit: "%", value: 12.5, min: 0, max: 100, hint: "0 to 100" }
  ];

  // values: { a: "100", b: "8", rate: "12.5" }  (strings from the page)
  // returns: { errors: { fieldId: "message" }, results: [ { label, value, unit, decimals } ] }
  function compute(values) {
    var errors = {};
    var n = {};

    FIELDS.forEach(function (f) {
      var raw = values[f.id];
      if (raw === undefined || raw === null || String(raw).trim() === "") {
        errors[f.id] = "Required";
        return;
      }
      var x = Number(raw);
      if (!isFinite(x)) { errors[f.id] = "Not a number"; return; }
      if (f.min !== undefined && x < f.min) { errors[f.id] = "Minimum is " + f.min; return; }
      if (f.max !== undefined && x > f.max) { errors[f.id] = "Maximum is " + f.max; return; }
      n[f.id] = x;
    });

    if (Object.keys(errors).length) return { errors: errors, results: [] };

    // ---- DEMO FORMULAS: replace with real MTT formulas ----
    var results = [
      { label: "A + B",        value: n.a + n.b,                  unit: "",  decimals: 2 },
      { label: "A − B",        value: n.a - n.b,                  unit: "",  decimals: 2 },
      { label: "A ÷ B",        value: n.b === 0 ? null : n.a / n.b, unit: "", decimals: 4 },
      { label: "A × Rate",     value: n.a * n.rate / 100,         unit: "",  decimals: 2 }
    ];
    // -------------------------------------------------------

    return { errors: errors, results: results };
  }

  var api = { TITLE: TITLE, SUBTITLE: SUBTITLE, FIELDS: FIELDS, compute: compute };
  root.MTT = root.MTT || {};
  root.MTT.calc = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
