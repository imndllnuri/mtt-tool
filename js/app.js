/* app.js — builds the page from MTT.calc and wires up the buttons.
 * No framework, no build step. Works on GitHub Pages and from a file (Electron later).
 *
 * Values from the URL are untrusted, so everything is written with
 * textContent / value, never innerHTML.
 */
(function () {
  "use strict";

  var calc = window.MTT.calc;
  var HISTORY_KEY = "mtt-tool:history:v1";
  var HISTORY_MAX = 20;

  var $ = function (id) { return document.getElementById(id); };
  var inputs = {};          // fieldId -> <input>
  var errorEls = {};        // fieldId -> <p>

  // ---------- small helpers ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function currentValues() {
    var v = {};
    calc.FIELDS.forEach(function (f) { v[f.id] = inputs[f.id].value; });
    return v;
  }

  function setValues(v) {
    calc.FIELDS.forEach(function (f) {
      if (v[f.id] !== undefined) inputs[f.id].value = v[f.id];
    });
  }

  function defaults() {
    var v = {};
    calc.FIELDS.forEach(function (f) { v[f.id] = String(f.value); });
    return v;
  }

  function formatNumber(x, decimals) {
    return x.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals === undefined ? 2 : decimals
    });
  }

  // ---------- share link (values live in the URL after the #) ----------
  function valuesToHash(v) {
    var p = new URLSearchParams();
    calc.FIELDS.forEach(function (f) { p.set(f.id, v[f.id]); });
    return "#" + p.toString();
  }

  function hashToValues() {
    var out = {};
    var p = new URLSearchParams(location.hash.replace(/^#/, ""));
    calc.FIELDS.forEach(function (f) {
      if (!p.has(f.id)) return;
      var raw = p.get(f.id);
      if (raw.trim() !== "" && isFinite(Number(raw))) out[f.id] = raw;
    });
    return out;
  }

  function syncHash() {
    try { history.replaceState(null, "", valuesToHash(currentValues())); } catch (e) { /* file:// etc. */ }
  }

  // ---------- build the form ----------
  function buildForm() {
    var box = $("fields");
    calc.FIELDS.forEach(function (f) {
      var wrap = el("div", "field");
      var label = el("label", "", f.label + (f.unit ? " (" + f.unit + ")" : ""));
      label.htmlFor = "in-" + f.id;

      var input = el("input");
      input.id = "in-" + f.id;
      input.type = "number";
      input.inputMode = "decimal";
      input.step = "any";
      input.autocomplete = "off";
      if (f.min !== undefined) input.min = f.min;
      if (f.max !== undefined) input.max = f.max;
      input.addEventListener("input", update);

      var hint = el("p", "hint", f.hint || "");
      var err = el("p", "error");
      err.id = "err-" + f.id;
      err.setAttribute("role", "alert");
      input.setAttribute("aria-describedby", err.id);

      inputs[f.id] = input;
      errorEls[f.id] = err;
      wrap.appendChild(label);
      wrap.appendChild(input);
      if (f.hint) wrap.appendChild(hint);
      wrap.appendChild(err);
      box.appendChild(wrap);
    });
  }

  // ---------- results ----------
  function update() {
    var out = calc.compute(currentValues());
    var list = $("results");
    list.textContent = "";

    calc.FIELDS.forEach(function (f) {
      var msg = out.errors[f.id] || "";
      errorEls[f.id].textContent = msg;
      inputs[f.id].setAttribute("aria-invalid", msg ? "true" : "false");
    });

    if (!out.results.length) {
      list.appendChild(el("p", "empty", "Fill in all the inputs to see results."));
    } else {
      out.results.forEach(function (r) {
        var row = el("div", "result");
        row.appendChild(el("span", "result-label", r.label));
        var text = r.value === null ? "n/a" : formatNumber(r.value, r.decimals) + (r.unit ? " " + r.unit : "");
        row.appendChild(el("strong", "result-value", text));
        list.appendChild(row);
      });
    }
    $("save").disabled = !out.results.length;
    syncHash();
  }

  // ---------- history (saved only in this browser) ----------
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch (e) { return []; }
  }
  function saveHistory(items) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items)); } catch (e) { /* storage blocked */ }
  }

  function renderHistory() {
    var items = loadHistory();
    var list = $("history");
    list.textContent = "";
    $("clear-history").hidden = !items.length;
    if (!items.length) {
      list.appendChild(el("p", "empty", "Nothing saved yet."));
      return;
    }
    items.forEach(function (item) {
      var row = el("div", "history-item");
      var info = el("div", "history-info");
      info.appendChild(el("span", "history-time", new Date(item.t).toLocaleString()));
      info.appendChild(el("span", "history-values", calc.FIELDS.map(function (f) {
        return f.label + ": " + item.v[f.id];
      }).join("  ·  ")));
      var load = el("button", "btn small", "Load");
      load.type = "button";
      load.addEventListener("click", function () { setValues(item.v); update(); window.scrollTo({ top: 0, behavior: "smooth" }); });
      row.appendChild(info);
      row.appendChild(load);
      list.appendChild(row);
    });
  }

  function saveCurrent() {
    var items = loadHistory();
    items.unshift({ t: Date.now(), v: currentValues() });
    saveHistory(items.slice(0, HISTORY_MAX));
    renderHistory();
    toast("Saved to history");
  }

  // ---------- toast + copy ----------
  var toastTimer;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  function copyLink() {
    syncHash();
    var url = location.href;
    var done = function () { toast("Link copied"); };
    var fallback = function () {
      var box = $("share-box");
      box.hidden = false;
      box.value = url;
      box.focus();
      box.select();
      toast("Copy the link below");
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(done, fallback);
    } else {
      fallback();
    }
  }

  // ---------- start ----------
  function init() {
    document.title = calc.TITLE;
    $("title").textContent = calc.TITLE;
    $("subtitle").textContent = calc.SUBTITLE;
    buildForm();
    setValues(defaults());
    setValues(hashToValues());     // a shared link wins over defaults

    $("reset").addEventListener("click", function () { setValues(defaults()); update(); });
    $("save").addEventListener("click", saveCurrent);
    $("share").addEventListener("click", copyLink);
    $("clear-history").addEventListener("click", function () { saveHistory([]); renderHistory(); });
    window.addEventListener("hashchange", function () { setValues(hashToValues()); update(); });

    update();
    renderHistory();
  }

  init();
})();
