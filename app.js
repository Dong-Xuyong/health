/* Health UI. Writes health.json only. Sleep is read from journal.json. */
(function () {
  "use strict";

  var Core = window.HealthCore;
  var Demo = window.HealthDemo;
  var SAVE_DELAY = 2500;
  var QUALITY_COLOR = {
    1: "#dc2626",
    2: "#ea580c",
    3: "#ca8a04",
    4: "#65a30d",
    5: "#059669"
  };

  var els = {
    sync: document.getElementById("sync-label"),
    main: document.getElementById("main"),
    banner: document.getElementById("demo-banner"),
    format: document.getElementById("format-banner"),
    connectBtn: document.getElementById("btn-connect")
  };

  var doc = null;
  var reads = { streetlifting: null, nutrition: null, journal: null };
  var readError = { streetlifting: false, nutrition: false, journal: false };
  var demo = false;
  var readOnly = false;
  var dirty = false;
  var saving = false;
  var saveAgain = false;
  var saveTimer = null;
  var loading = false;
  var gaveUp = false;
  var pendingRender = false;
  var trendDays = 28;
  var openFolds = {};

  function hasToken() {
    try {
      var cfg = JSON.parse(localStorage.getItem("dong-gh-sync") || "null");
      return !!(cfg && cfg.token);
    } catch (e) {
      return false;
    }
  }

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function hhmm() {
    var now = new Date();
    return pad2(now.getHours()) + ":" + pad2(now.getMinutes());
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function fold(title, stat, key) {
    var made = window.SuiteUI && SuiteUI.fold ? SuiteUI.fold(title, stat || "") : null;
    var card = made ? made.details : el("details", "card fold dx-card");
    var summary;
    if (!made) {
      summary = el("summary", "");
      summary.appendChild(el("span", "fold-title", title));
      summary.appendChild(el("span", "fold-viz", ""));
      summary.appendChild(el("span", "fold-stat", stat || ""));
      card.appendChild(summary);
    }
    if (key && openFolds[key]) card.open = true;
    card.addEventListener("toggle", function () {
      if (!key) return;
      if (card.open) openFolds[key] = true;
      else delete openFolds[key];
    });
    return card;
  }

  function foldViz(card) {
    return card && card.querySelector ? card.querySelector(":scope > summary .fold-viz") : null;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function svgEl(name, attrs) {
    var node = document.createElementNS("http://www.w3.org/2000/svg", name);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (attrs[key] != null) node.setAttribute(key, String(attrs[key]));
      });
    }
    return node;
  }

  function svgText(x, y, text, anchor) {
    var node = svgEl("text", { x: x, y: y, "text-anchor": anchor || "middle" });
    node.textContent = text;
    return node;
  }

  function round(n) {
    return Math.round(n * 10) / 10;
  }

  function showConnect() {
    if (els.connectBtn) els.connectBtn.hidden = hasToken();
  }

  function fieldFocused() {
    var active = document.activeElement;
    if (!active || active === document.body || active === document.documentElement) return false;
    var tag = active.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  function scheduleRender() {
    if (fieldFocused()) {
      pendingRender = true;
      return;
    }
    render();
  }

  function findInjury(id) {
    var list = doc && doc.injuries ? doc.injuries : [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return list[i];
    }
    return null;
  }

  function live(list) {
    return (list || []).filter(function (item) { return item && item.deleted !== true; });
  }

  function openInjuries() {
    return live(doc && doc.injuries).filter(function (item) {
      return item.status === "active" || item.status === "recovering";
    });
  }

  function control(attr, id) {
    var nodes = document.querySelectorAll("[" + attr + "]");
    var i;
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute(attr) === id) return nodes[i];
    }
    return null;
  }

  function stamp() {
    return new Date().toISOString();
  }

  function markDirty() {
    if (!doc || readOnly) return;
    doc.updatedAt = stamp();
    if (demo || !hasToken()) {
      dirty = false;
      if (els.sync) els.sync.textContent = "Demo";
      return;
    }
    scheduleSave();
  }

  function scheduleSave() {
    if (gaveUp || readOnly || demo || !hasToken()) return;
    dirty = true;
    if (els.sync) els.sync.textContent = "✏️ Saving soon…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(pushNow, SAVE_DELAY);
  }

  function mergeRemote(remote) {
    if (remote && Number(remote.schemaVersion) > Core.SCHEMA_VERSION) {
      readOnly = true;
      doc = Core.normalize(remote);
      throw new Error("Newer data format, update the app");
    }
    doc = Core.merge(doc, remote);
  }

  function pushNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!doc || demo || readOnly || gaveUp || !hasToken() || !window.GhSync) return;
    if (saving) {
      saveAgain = true;
      return;
    }
    saving = true;
    if (els.sync) els.sync.textContent = "☁️ Saving…";
    Core.saveHealth(window.GhSync, function () { return doc; }, mergeRemote).then(function () {
      saving = false;
      if (readOnly) {
        gaveUp = true;
        if (els.sync) els.sync.textContent = "Newer data format, update the app";
        scheduleRender();
        return;
      }
      if (!saveAgain) dirty = false;
      if (els.sync) els.sync.textContent = "✅ Saved " + hhmm();
      if (saveAgain) {
        saveAgain = false;
        pushNow();
      }
    }, function (err) {
      saving = false;
      var message = err && err.message ? err.message : "Not saved";
      if (message === "⚠️ Not saved, reload" || /Newer data format/.test(message)) {
        gaveUp = true;
        if (/Newer data format/.test(message)) readOnly = true;
        if (els.sync) els.sync.textContent = /Newer data format/.test(message) ? message : "⚠️ Not saved, reload";
        scheduleRender();
        return;
      }
      dirty = true;
      if (els.sync) els.sync.textContent = "⚠️ " + message;
    });
  }

  function applyLoaded(remote) {
    if (!remote || typeof remote !== "object") return;
    if (Number(remote.schemaVersion) > Core.SCHEMA_VERSION) {
      readOnly = true;
      doc = Core.normalize(remote);
      return;
    }
    readOnly = false;
    doc = Core.normalize(remote);
  }

  function resetReads() {
    reads = { streetlifting: null, nutrition: null, journal: null };
    readError = { streetlifting: false, nutrition: false, journal: false };
  }

  function loadRead(id) {
    if (demo || !hasToken() || !window.GhSync) return;
    window.GhSync.load(id, function (data) {
      reads[id] = data;
      readError[id] = false;
    }).then(function (msg) {
      if (msg === "Nothing saved on GitHub yet") {
        reads[id] = null;
        readError[id] = false;
      }
      scheduleRender();
    }, function () {
      reads[id] = null;
      readError[id] = true;
      scheduleRender();
    });
  }

  function loadReads() {
    Core.READ_IDS.forEach(loadRead);
  }

  function autoLoad() {
    showConnect();
    if (demo || !hasToken() || !window.GhSync) return;
    if (loading || saving || saveTimer || dirty || gaveUp || readOnly) return;
    if (fieldFocused()) return;
    loading = true;
    window.GhSync.load(Core.APP_ID, applyLoaded).then(function (msg) {
      loading = false;
      if (!doc) {
        doc = Core.fresh();
        if (els.sync) els.sync.textContent = msg || "Nothing saved on GitHub yet";
      } else if (readOnly) {
        if (els.sync) els.sync.textContent = "Newer data format, update the app";
      } else if (els.sync && !dirty) {
        els.sync.textContent = "☁️ Synced " + hhmm();
      }
      scheduleRender();
    }, function (err) {
      loading = false;
      if (els.sync) els.sync.textContent = "⚠️ " + (err && err.message ? err.message : "Could not load");
    });
  }

  function enterDemo() {
    var built = Demo.build(Core.lisbonToday());
    demo = true;
    readOnly = false;
    gaveUp = false;
    dirty = false;
    doc = built.health;
    reads = {
      streetlifting: built.streetlifting,
      nutrition: built.nutrition,
      journal: built.journal
    };
    readError = { streetlifting: false, nutrition: false, journal: false };
    if (els.banner) els.banner.hidden = false;
    if (els.format) els.format.hidden = true;
    if (els.sync) els.sync.textContent = "Demo";
    showConnect();
    render();
  }

  function connectSync() {
    if (!window.GhSync) return;
    var sawRemote = false;
    window.GhSync.load(Core.APP_ID, function (remote) {
      sawRemote = true;
      applyLoaded(remote);
    }).then(function (msg) {
      if (!hasToken()) {
        enterDemo();
        return;
      }
      demo = false;
      if (!sawRemote) doc = Core.fresh();
      if (els.banner) els.banner.hidden = true;
      resetReads();
      loadReads();
      if (readOnly) {
        if (els.sync) els.sync.textContent = "Newer data format, update the app";
      } else if (els.sync) {
        els.sync.textContent = sawRemote ? "☁️ Synced " + hhmm() : (msg || "Nothing saved on GitHub yet");
      }
      showConnect();
      scheduleRender();
    }, function (err) {
      if (!hasToken()) enterDemo();
      else if (els.sync) els.sync.textContent = "⚠️ " + (err && err.message ? err.message : "Could not connect");
    });
  }

  function parseRoute() {
    var path = (location.hash || "#/").replace(/^#/, "");
    if (path === "" || path === "/") return { name: "today" };
    if (path === "/trends") return { name: "trends" };
    if (path === "/settings") return { name: "settings" };
    if (path === "/injuries" || path === "/injuries/") return { name: "injuries" };
    var match = /^\/injuries\/(inj_[a-z0-9]{6})$/.exec(path);
    if (match) return { name: "editor", id: match[1] };
    return { name: "today" };
  }

  function markTab(name) {
    var tabs = document.querySelectorAll(".tabs a");
    var i;
    for (i = 0; i < tabs.length; i++) {
      var tab = tabs[i].getAttribute("data-tab");
      var on = tab === name || (name === "editor" && tab === "injuries");
      if (on) tabs[i].setAttribute("aria-current", "page");
      else tabs[i].removeAttribute("aria-current");
    }
  }

  function lock(node) {
    if (!readOnly || !node) return;
    var controls = node.querySelectorAll("input, textarea, select, button");
    var i;
    for (i = 0; i < controls.length; i++) {
      if (controls[i].hasAttribute("data-window")) continue;
      controls[i].disabled = true;
    }
  }

  function formatHours(value) {
    if (typeof value !== "number" || !isFinite(value)) return "—";
    return String(Math.round(value * 100) / 100);
  }

  function signed(value, suffix) {
    if (typeof value !== "number" || !isFinite(value)) return "—";
    var rounded = Math.round(value * 10) / 10;
    return (rounded > 0 ? "+" : "") + rounded + suffix;
  }

  function latestPain(injury) {
    var best = null;
    live(injury.checkins).forEach(function (item) {
      if (!best || String(item.date) > String(best.date)) best = item;
      else if (item.date === best.date && Date.parse(item.updatedAt) > Date.parse(best.updatedAt)) best = item;
    });
    return best;
  }

  function checkinOn(injury, date) {
    var best = null;
    live(injury.checkins).forEach(function (item) {
      if (item.date !== date) return;
      if (!best || Date.parse(item.updatedAt) >= Date.parse(best.updatedAt)) best = item;
    });
    return best;
  }

  function takenIds() {
    var map = {};
    (doc.injuries || []).forEach(function (injury) {
      if (injury && injury.id) map[injury.id] = true;
      (injury && injury.checkins || []).forEach(function (item) {
        if (item && item.id) map[item.id] = true;
      });
    });
    return map;
  }

  function upsertCheckin(injury, date, pain, note) {
    var now = stamp();
    var found = checkinOn(injury, date);
    if (!found) {
      if (!Array.isArray(injury.checkins)) injury.checkins = [];
      found = {
        id: Core.newId("ck", takenIds()),
        date: date,
        pain: pain,
        note: note,
        updatedAt: now
      };
      injury.checkins.push(found);
    } else {
      found.pain = pain;
      found.note = note;
      found.updatedAt = now;
    }
    injury.updatedAt = now;
    markDirty();
  }

  function renderSleepCard(today) {
    var target = Core.sleepTarget(doc, readError.nutrition ? null : reads.nutrition);
    var night = readError.journal ? null : Core.sleepSeries(reads.journal, [today])[0];
    var hours = night && typeof night.hours === "number" ? night.hours : null;
    var stat = readError.journal ? "—" : (hours == null ? "—" : formatHours(hours) + " h");
    var card = fold("Last night", stat, "sleep");
    var viz = foldViz(card);
    var series;
    if (viz && window.SuiteUI && hours != null && target > 0) {
      viz.appendChild(SuiteUI.ring((hours / target) * 100, formatHours(hours) + " of " + formatHours(target) + " h"));
    }
    if (!readError.journal) {
      series = Core.sleepSeries(reads.journal, Core.dateWindow(today, 7));
      if (viz && window.SuiteUI && series && series.length > 1) {
        viz.appendChild(SuiteUI.spark(series.map(function (row) { return row && row.hours; }), "Sleep"));
      }
    }
    if (readError.journal) {
      card.appendChild(el("p", "warn", "Journal sleep unavailable"));
      return card;
    }
    var empty = !night || (night.hours == null && !night.bed && !night.wake && !night.note && night.quality == null);
    if (empty) {
      card.appendChild(el("p", "", "No sleep logged."));
      return card;
    }
    card.appendChild(el("p", "meta", "Bed " + (night.bed || "—") + " · Wake " + (night.wake || "—") + " · target " + formatHours(target) + " h"));
    if (night.quality != null) card.appendChild(el("p", "meta", "Quality " + night.quality + " / 5"));
    if (night.note) card.appendChild(el("p", "note", night.note));
    return card;
  }

  function renderPainCard(injury, today) {
    var todayCheck = checkinOn(injury, today);
    var shown = todayCheck ? todayCheck.pain : null;
    var card = fold(injury.area || "Injury", shown == null ? "—" : String(shown) + "/10", "pain:" + injury.id);
    var viz = foldViz(card);
    var pains;
    card.classList.add("pain-card");
    (function () {
      var stat = card.querySelector(".fold-stat");
      if (stat) stat.setAttribute("data-pain-value", injury.id);
    })();
    if (viz && window.SuiteUI && shown != null) viz.appendChild(SuiteUI.bar((shown / 10) * 100, "Pain " + shown));
    pains = (injury.checkins || []).filter(function (item) { return item && !item.deleted && typeof item.pain === "number"; });
    if (viz && window.SuiteUI && pains.length > 1) {
      viz.appendChild(SuiteUI.spark(pains.map(function (item) { return item.pain; }), "Pain"));
    }
    card.appendChild(el("p", "muted", (injury.side || "n/a") + " · " + (injury.status || "active")));
    var slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "10";
    slider.step = "1";
    slider.value = shown == null ? "0" : String(shown);
    slider.setAttribute("data-pain-for", injury.id);
    slider.setAttribute("aria-label", "Pain for " + (injury.area || "injury"));
    card.appendChild(fieldLabel("Pain today, 0 to 10", slider));
    var note = document.createElement("textarea");
    note.rows = 2;
    note.value = todayCheck && todayCheck.note ? todayCheck.note : "";
    note.setAttribute("data-note-for", injury.id);
    note.setAttribute("aria-label", "Note for " + (injury.area || "injury"));
    card.appendChild(fieldLabel("Note", note));
    var save = el("button", "primary", todayCheck ? "Update today's pain" : "Save today's pain");
    save.type = "button";
    save.setAttribute("data-save-pain", injury.id);
    var row = el("div", "btn-row");
    row.appendChild(save);
    card.appendChild(row);
    return card;
  }

  function fieldLabel(text, control) {
    var wrap = el("label", "field");
    wrap.appendChild(el("span", "", text));
    wrap.appendChild(control);
    return wrap;
  }

  var SCAN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function oneDecimal(value) {
    return String(Math.round(value * 10) / 10);
  }

  function scanDateLabel(iso) {
    if (typeof iso !== "string" || iso.length < 10) return iso || "";
    var month = Number(iso.slice(5, 7));
    var day = Number(iso.slice(8, 10));
    var year = iso.slice(0, 4);
    if (!month || !day || month > 12) return iso;
    return day + " " + SCAN_MONTHS[month - 1] + " " + year;
  }

  function formatDelta(value, digits, suffix) {
    var factor = Math.pow(10, digits);
    var rounded = Math.round(value * factor) / factor;
    if (rounded === 0) return null;
    return (rounded > 0 ? "+" : "") + rounded + suffix;
  }

  function scanHeadline(scan) {
    if (scan.weight != null) return oneDecimal(scan.weight) + " kg";
    if (scan.bfPct != null) return oneDecimal(scan.bfPct) + "%";
    return "Scan";
  }

  function trendSeries(scans) {
    var keys = ["weight", "bfPct", "fatMass", "smm"];
    var best = null;
    keys.forEach(function (key) {
      var values = scans.map(function (scan) { return scan[key]; });
      var count = values.filter(function (value) { return typeof value === "number"; }).length;
      if (count < 2) return;
      if (!best || count > best.count) best = { key: key, values: values, count: count };
    });
    return best;
  }

  function appendScanMetric(grid, value, label) {
    if (value == null || value === "") return;
    grid.appendChild(statCard(value, label));
  }

  function deltaChip(text) {
    return el("span", "chip delta moved", text);
  }

  function renderBodyScanCard() {
    var scans = readError.nutrition ? null : Core.bodyScans(reads.nutrition);
    var latest = scans && scans.length ? scans[scans.length - 1] : null;
    var card = fold("Body scan", latest ? scanHeadline(latest) : "—", "body-scan");
    var viz = foldViz(card);
    var series;
    var when;
    var device;
    var grid;
    var fatParts;
    var prev;
    var chips;
    var showed;
    card.classList.add("body-scan");
    if (readError.nutrition) {
      card.appendChild(el("p", "muted", "Body scan unavailable."));
      return card;
    }
    if (!latest) {
      card.appendChild(el("p", "muted", "No body scan yet."));
      return card;
    }
    series = trendSeries(scans);
    if (viz && window.SuiteUI && series) {
      viz.appendChild(SuiteUI.spark(series.values, {
        weight: "Weight trend",
        bfPct: "Body fat trend",
        fatMass: "Fat mass trend",
        smm: "SMM trend"
      }[series.key] || "Body scan trend"));
    }
    device = latest.device || latest.source;
    when = scanDateLabel(latest.date);
    if (device) when += " · " + device;
    card.appendChild(el("p", "meta scan-when", when));
    if (latest.timing) card.appendChild(el("p", "muted scan-timing", latest.timing));
    grid = el("div", "stats scan-stats");
    if (latest.weight != null) appendScanMetric(grid, oneDecimal(latest.weight) + " kg", "⚖️ Weight");
    fatParts = [];
    if (latest.bfPct != null) fatParts.push(oneDecimal(latest.bfPct) + "%");
    if (latest.fatMass != null) fatParts.push(oneDecimal(latest.fatMass) + " kg");
    if (fatParts.length) appendScanMetric(grid, fatParts.join(" · "), "🔥 Body fat");
    if (latest.smm != null) appendScanMetric(grid, oneDecimal(latest.smm) + " kg", "💪 SMM");
    if (latest.leanMass != null) appendScanMetric(grid, oneDecimal(latest.leanMass) + " kg", "Lean");
    if (latest.visceral != null) appendScanMetric(grid, oneDecimal(latest.visceral), "Visceral");
    if (latest.bmr != null) appendScanMetric(grid, String(Math.round(latest.bmr)), "⚡ BMR");
    if (latest.score != null) appendScanMetric(grid, oneDecimal(latest.score), "⭐ Score");
    if (grid.childNodes.length) card.appendChild(grid);
    if (scans.length < 2) return card;
    prev = scans[scans.length - 2];
    card.appendChild(el("p", "muted scan-trend", "vs " + scanDateLabel(prev.date)));
    chips = el("div", "scan-deltas");
    showed = false;
    function addDelta(current, previous, digits, suffix, label) {
      var text;
      if (typeof current !== "number" || typeof previous !== "number") return;
      text = formatDelta(current - previous, digits, suffix);
      if (!text) return;
      chips.appendChild(deltaChip(label + " " + text));
      showed = true;
    }
    addDelta(latest.weight, prev.weight, 1, " kg", "⚖️");
    (function () {
      var bits = [];
      var pct = typeof latest.bfPct === "number" && typeof prev.bfPct === "number"
        ? formatDelta(latest.bfPct - prev.bfPct, 1, "%")
        : null;
      var mass = typeof latest.fatMass === "number" && typeof prev.fatMass === "number"
        ? formatDelta(latest.fatMass - prev.fatMass, 1, " kg")
        : null;
      if (pct) bits.push(pct);
      if (mass) bits.push(mass);
      if (!bits.length) return;
      chips.appendChild(deltaChip("🔥 " + bits.join(" · ")));
      showed = true;
    })();
    addDelta(latest.smm, prev.smm, 1, " kg", "💪");
    addDelta(latest.leanMass, prev.leanMass, 1, " kg", "Lean");
    addDelta(latest.visceral, prev.visceral, 1, "", "Visceral");
    addDelta(latest.bmr, prev.bmr, 0, "", "⚡");
    addDelta(latest.score, prev.score, 1, "", "⭐");
    if (!showed) chips.appendChild(el("span", "chip delta", "No change"));
    card.appendChild(chips);
    return card;
  }

  function renderToday() {
    var today = Core.lisbonToday();
    var wrap = el("div", "");
    wrap.appendChild(renderSleepCard(today));
    wrap.appendChild(renderBodyScanCard());
    var open = openInjuries();
    if (!open.length) {
      var empty = fold("Pain", "0", "pain-empty");
      empty.appendChild(el("p", "muted", "No active injuries."));
      var add = el("button", "primary", "+ Injury");
      add.type = "button";
      add.setAttribute("data-action", "add-injury");
      var row = el("div", "btn-row");
      row.appendChild(add);
      empty.appendChild(row);
      wrap.appendChild(empty);
    } else {
      open.forEach(function (injury) { wrap.appendChild(renderPainCard(injury, today)); });
    }
    return wrap;
  }

  function renderInjuryList() {
    var wrap = el("div", "");
    var head = el("div", "btn-row");
    var add = el("button", "primary", "+ Injury");
    add.type = "button";
    add.setAttribute("data-action", "add-injury");
    head.appendChild(add);
    wrap.appendChild(head);
    var items = live(doc.injuries).slice().sort(function (a, b) {
      var order = { active: 0, recovering: 1, resolved: 2 };
      var ar = Object.prototype.hasOwnProperty.call(order, a.status) ? order[a.status] : 9;
      var br = Object.prototype.hasOwnProperty.call(order, b.status) ? order[b.status] : 9;
      if (ar !== br) return ar - br;
      return String(a.area).localeCompare(String(b.area));
    });
    if (!items.length) {
      var empty = fold("Injuries", "0", "injuries");
      empty.appendChild(el("p", "", "No injuries yet."));
      wrap.appendChild(empty);
      return wrap;
    }
    var list = fold("Injuries", String(items.length), "injuries");
    items.forEach(function (injury) {
      var link = el("a", "card injury-link dx-card");
      link.href = "#/injuries/" + injury.id;
      var top = el("div", "row-top");
      top.appendChild(el("h3", "", injury.area || "Untitled injury"));
      top.appendChild(el("span", "chip " + (injury.status || "active"), injury.status || "active"));
      link.appendChild(top);
      var latest = latestPain(injury);
      var detail = (injury.side || "n/a");
      if (latest && typeof latest.pain === "number") detail += " · pain " + latest.pain + " on " + latest.date;
      link.appendChild(el("p", "muted", detail));
      list.appendChild(link);
    });
    wrap.appendChild(list);
    return wrap;
  }

  function option(select, value, label, current) {
    var node = document.createElement("option");
    node.value = value;
    node.textContent = label;
    if (value === current) node.selected = true;
    select.appendChild(node);
  }

  function renderEditor(id) {
    var injury = findInjury(id);
    var wrap = el("div", "");
    var back = el("a", "btn", "All injuries");
    back.href = "#/injuries";
    var top = el("div", "btn-row");
    top.appendChild(back);
    wrap.appendChild(top);
    if (!injury || injury.deleted) {
      var missing = fold("Injury", "Missing", "missing");
      missing.appendChild(el("p", "", "That injury is not in this file."));
      wrap.appendChild(missing);
      return wrap;
    }
    var card = fold(injury.area || "Injury", injury.status || "active", "edit:" + injury.id);
    var area = document.createElement("input");
    area.value = injury.area || "";
    area.setAttribute("data-field", "area");
    area.setAttribute("data-injury", injury.id);
    card.appendChild(fieldLabel("Area", area));
    var side = document.createElement("select");
    side.setAttribute("data-field", "side");
    side.setAttribute("data-injury", injury.id);
    [["left", "Left"], ["right", "Right"], ["both", "Both"], ["n/a", "N/A"]].forEach(function (pair) {
      option(side, pair[0], pair[1], injury.side || "n/a");
    });
    card.appendChild(fieldLabel("Side", side));
    var status = document.createElement("select");
    status.setAttribute("data-field", "status");
    status.setAttribute("data-injury", injury.id);
    [["active", "Active"], ["recovering", "Recovering"], ["resolved", "Resolved"]].forEach(function (pair) {
      option(status, pair[0], pair[1], injury.status || "active");
    });
    card.appendChild(fieldLabel("Status", status));
    var started = document.createElement("input");
    started.type = "date";
    started.value = injury.startedOn || "";
    started.setAttribute("data-field", "startedOn");
    started.setAttribute("data-injury", injury.id);
    card.appendChild(fieldLabel("Started", started));
    var resolved = document.createElement("input");
    resolved.type = "date";
    resolved.value = injury.resolvedOn || "";
    resolved.setAttribute("data-field", "resolvedOn");
    resolved.setAttribute("data-injury", injury.id);
    card.appendChild(fieldLabel("Resolved", resolved));
    var cause = document.createElement("textarea");
    cause.value = injury.cause || "";
    cause.setAttribute("data-field", "cause");
    cause.setAttribute("data-injury", injury.id);
    card.appendChild(fieldLabel("Cause", cause));
    var notes = document.createElement("textarea");
    notes.value = injury.notes || "";
    notes.setAttribute("data-field", "notes");
    notes.setAttribute("data-injury", injury.id);
    card.appendChild(fieldLabel("Notes", notes));
    var avoid = document.createElement("textarea");
    avoid.value = (injury.avoid || []).join("\n");
    avoid.setAttribute("data-field", "avoid");
    avoid.setAttribute("data-injury", injury.id);
    card.appendChild(fieldLabel("Movements to avoid, one per line", avoid));
    var remove = el("button", "", "Delete injury");
    remove.type = "button";
    remove.setAttribute("data-action", "delete-injury");
    remove.setAttribute("data-injury", injury.id);
    var actions = el("div", "btn-row");
    actions.appendChild(remove);
    card.appendChild(actions);
    wrap.appendChild(card);

    var rows = live(injury.checkins).slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return Date.parse(a.updatedAt) < Date.parse(b.updatedAt) ? 1 : -1;
    });
    var history = fold("Check-ins", String(rows.length), "checks:" + injury.id);
    var form = document.createElement("form");
    form.setAttribute("data-action", "add-checkin");
    form.setAttribute("data-injury", injury.id);
    var date = document.createElement("input");
    date.type = "date";
    date.name = "date";
    date.required = true;
    date.value = Core.lisbonToday();
    form.appendChild(fieldLabel("Date", date));
    var pain = document.createElement("input");
    pain.type = "number";
    pain.name = "pain";
    pain.min = "0";
    pain.max = "10";
    pain.step = "1";
    pain.required = true;
    pain.inputMode = "numeric";
    form.appendChild(fieldLabel("Pain, 0 to 10", pain));
    var note = document.createElement("input");
    note.type = "text";
    note.name = "note";
    form.appendChild(fieldLabel("Note", note));
    var submit = el("button", "primary", "Add check-in");
    submit.type = "submit";
    var submitRow = el("div", "btn-row");
    submitRow.appendChild(submit);
    form.appendChild(submitRow);
    history.appendChild(form);
    if (!rows.length) history.appendChild(el("p", "muted", "No check-ins yet."));
    rows.forEach(function (item) {
      var block = el("article", "checkin");
      var line = el("div", "row-top");
      line.appendChild(el("p", "", item.date + " · pain " + item.pain));
      var del = el("button", "", "Delete");
      del.type = "button";
      del.setAttribute("data-action", "delete-checkin");
      del.setAttribute("data-injury", injury.id);
      del.setAttribute("data-checkin", item.id);
      line.appendChild(del);
      block.appendChild(line);
      if (item.note) block.appendChild(el("p", "note", item.note));
      history.appendChild(block);
    });
    wrap.appendChild(history);
    return wrap;
  }

  function drawChart(svg, opts) {
    var labels = opts.labels || [];
    var n = Math.max(1, labels.length);
    var padL = 46;
    var padR = 14;
    var padT = 12;
    var padB = 26;
    var width = 360;
    var height = 200;
    var plotW = width - padL - padR;
    var plotH = height - padT - padB;
    var yMin = opts.yMin || 0;
    var yMax = opts.yMax;
    if (!(yMax > yMin)) yMax = yMin + 1;
    function xAt(i) { return padL + (i + 0.5) * (plotW / n); }
    function yAt(value) { return padT + plotH - ((value - yMin) / (yMax - yMin)) * plotH; }
    [yMin, (yMin + yMax) / 2, yMax].forEach(function (tick) {
      var y = yAt(tick);
      svg.appendChild(svgEl("line", { class: "chart-grid", x1: padL, x2: width - padR, y1: y, y2: y }));
      svg.appendChild(svgText(padL - 4, y + 4, String(round(tick)), "end"));
    });
    [0, Math.floor((labels.length - 1) / 2), labels.length - 1].forEach(function (index, pos) {
      if (!labels[index]) return;
      var anchor = pos === 0 ? "start" : pos === 2 ? "end" : "middle";
      var x = pos === 0 ? padL : pos === 2 ? width - padR : xAt(index);
      svg.appendChild(svgText(x, height - 6, labels[index].slice(5), anchor));
    });
    var barW = Math.max(1, (plotW / n) * 0.62);
    (opts.bars || []).forEach(function (bar) {
      bar.values.forEach(function (value, index) {
        if (typeof value !== "number" || !isFinite(value)) return;
        var y = yAt(value);
        var base = yAt(yMin);
        var rect = svgEl("rect", {
          class: bar.className || "chart-bar",
          x: xAt(index) - barW / 2,
          y: Math.min(y, base),
          width: barW,
          height: Math.max(0.5, Math.abs(base - y))
        });
        svg.appendChild(rect);
      });
    });
    (opts.lines || []).forEach(function (line) {
      var d = "";
      var drawing = false;
      line.values.forEach(function (value, index) {
        if (typeof value !== "number" || !isFinite(value)) {
          drawing = false;
          return;
        }
        d += (drawing ? "L" : "M") + round(xAt(index)) + " " + round(yAt(value));
        drawing = true;
      });
      if (d) svg.appendChild(svgEl("path", { class: line.className || "chart-line", d: d }));
    });
    if (typeof opts.target === "number" && isFinite(opts.target)) {
      var y = yAt(opts.target);
      svg.appendChild(svgEl("line", { class: "chart-target", x1: padL, x2: width - padR, y1: y, y2: y }));
    }
    (opts.dots || []).forEach(function (dot) {
      dot.values.forEach(function (value, index) {
        if (typeof value !== "number" || !isFinite(value)) return;
        var circle = svgEl("circle", { class: "chart-dot", cx: xAt(index), cy: yAt(value), r: 3.2 });
        var color = dot.color ? dot.color(index) : "";
        if (color) circle.setAttribute("fill", color);
        svg.appendChild(circle);
      });
    });
  }

  function chartFigure(caption, aria) {
    var fig = el("figure", "chart");
    fig.appendChild(el("figcaption", "", caption));
    var svg = svgEl("svg", { viewBox: "0 0 360 200", width: "100%", role: "img" });
    svg.setAttribute("aria-label", aria);
    fig.appendChild(svg);
    return { fig: fig, svg: svg };
  }

  function legendItem(colorOrClass, text) {
    var node = el("span", "", "");
    var swatch = document.createElement("i");
    if (colorOrClass.charAt(0) === "#" || colorOrClass.indexOf("hsl") === 0) swatch.style.background = colorOrClass;
    else swatch.className = colorOrClass;
    node.appendChild(swatch);
    node.appendChild(document.createTextNode(text));
    return node;
  }

  function renderTrends() {
    var wrap = el("div", "");
    var today = Core.lisbonToday();
    var dates = Core.dateWindow(today, trendDays);
    var toggle = el("div", "window-toggle");
    [7, 28, 90].forEach(function (size) {
      var btn = el("button", "", String(size));
      btn.type = "button";
      btn.setAttribute("data-window", String(size));
      btn.setAttribute("aria-pressed", size === trendDays ? "true" : "false");
      toggle.appendChild(btn);
    });
    wrap.appendChild(toggle);

    var sleepRows = readError.journal ? [] : Core.sleepSeries(reads.journal, dates);
    var nutritionRows = readError.nutrition ? [] : Core.nutritionDaily(reads.nutrition, dates);
    var trainingRows = readError.streetlifting ? [] : Core.trainingDaily(reads.streetlifting, dates);
    var target = Core.sleepTarget(doc, readError.nutrition ? null : reads.nutrition);
    var summary = Core.summarize({
      today: today,
      sleepRows: sleepRows,
      weightRows: nutritionRows,
      injuries: doc.injuries || []
    });
    var stats = el("div", "stats");
    if (readError.journal) {
      stats.appendChild(statCard("—", "Sleep, last 7 days"));
      stats.appendChild(statCard("—", "Nights under 7 h"));
    } else {
      var avg = summary.sleepAvg7 == null ? "—" : formatHours(summary.sleepAvg7) + " h";
      stats.appendChild(statCard(avg + " / " + formatHours(target) + " h", "Sleep, last 7 days"));
      stats.appendChild(statCard(String(summary.nightsUnder7), "Nights under 7 h"));
    }
    var snapshot = fold("Snapshot", "", "snapshot");
    stats.appendChild(statCard(signed(summary.weightChange, " kg"), "Weight change in window"));
    if (!summary.pain.length) stats.appendChild(statCard("—", "Pain vs 7 days ago"));
    summary.pain.forEach(function (item) {
      var label = (item.area || "Pain") + " vs 7 days ago";
      var text = item.today == null ? "—" : String(item.today);
      if (item.weekAgo != null) text += " (was " + item.weekAgo + ")";
      stats.appendChild(statCard(text, label));
    });
    snapshot.appendChild(stats);
    (function () {
      var viz = foldViz(snapshot);
      if (viz && window.SuiteUI && !readError.journal) {
        viz.appendChild(SuiteUI.spark(sleepRows.map(function (row) { return row.hours; }), "Sleep"));
      }
    })();
    foldStat(snapshot);
    (function () {
      var stat = snapshot.querySelector(".fold-stat");
      if (!stat) return;
      if (readError.journal || summary.sleepAvg7 == null) stat.textContent = "—";
      else stat.textContent = formatHours(summary.sleepAvg7) + " h";
    })();
    wrap.appendChild(snapshot);

    var sleepCard = fold("Sleep", readError.journal || summary.sleepAvg7 == null ? "—" : formatHours(summary.sleepAvg7) + " h", "trend-sleep");
    (function () {
      var viz = foldViz(sleepCard);
      if (viz && window.SuiteUI && !readError.journal) {
        viz.appendChild(SuiteUI.spark(sleepRows.map(function (row) { return row.hours; }), "Sleep hours"));
      }
    })();
    if (readError.journal) {
      sleepCard.appendChild(el("p", "warn", "Journal sleep unavailable"));
    } else {
      var hours = sleepRows.map(function (row) { return row.hours; });
      var yMax = 8;
      hours.forEach(function (value) { if (typeof value === "number" && value > yMax) yMax = value; });
      if (target > yMax) yMax = target;
      yMax = Math.ceil(yMax) + 1;
      var chart = chartFigure("Hours, target, and 7-day average. Dot colour is quality.", "Sleep hours");
      drawChart(chart.svg, {
        labels: dates,
        yMax: yMax,
        bars: [{ values: hours, className: "chart-bar" }],
        lines: [{ values: Core.rollingAvg(hours, 7), className: "chart-avg" }],
        target: target,
        dots: [{
          values: hours,
          color: function (index) {
            var quality = sleepRows[index] && sleepRows[index].quality;
            return QUALITY_COLOR[quality] || "";
          }
        }]
      });
      sleepCard.appendChild(chart.fig);
      var sleepLegend = el("div", "legend");
      [1, 2, 3, 4, 5].forEach(function (quality) {
        sleepLegend.appendChild(legendItem(QUALITY_COLOR[quality], "Q" + quality));
      });
      sleepLegend.appendChild(legendItem("swatch-avg", "7-day average"));
      sleepCard.appendChild(sleepLegend);
    }
    wrap.appendChild(sleepCard);

    var painCard = fold("Pain", summary.pain.length && summary.pain[0].today != null ? String(summary.pain[0].today) : "—", "trend-pain");
    if (readError.streetlifting) painCard.appendChild(el("p", "warn", "Training/Nutrition trends unavailable"));
    var injuries = openInjuries();
    var sets = trainingRows.map(function (row) { return row.sets; });
    var maxSets = 0;
    sets.forEach(function (value) { if (value > maxSets) maxSets = value; });
    var scaled = sets.map(function (value) {
      return value && maxSets ? (value / maxSets) * 10 : null;
    });
    var lines = injuries.map(function (injury, index) {
      return {
        values: Core.painSeries(injury, dates).map(function (row) { return row.pain; }),
        className: "chart-line chart-pain-" + (index % 4)
      };
    });
    if (!readError.streetlifting || injuries.length) {
      var painChart = chartFigure(
        "Bars are training sets, scaled to the busiest day. Lines are pain from 0 to 10.",
        "Pain and training sets"
      );
      drawChart(painChart.svg, {
        labels: dates,
        yMax: 10,
        bars: readError.streetlifting ? [] : [{ values: scaled, className: "chart-set" }],
        lines: lines
      });
      painCard.appendChild(painChart.fig);
      if (injuries.length) {
        var painLegend = el("div", "legend");
        injuries.forEach(function (injury, index) {
          painLegend.appendChild(legendItem("chart-pain-" + (index % 4), injury.area || "Injury"));
        });
        painCard.appendChild(painLegend);
      }
    }
    wrap.appendChild(painCard);

    var weightCard = fold("Weight", "", "trend-weight");
    if (readError.nutrition) {
      weightCard.appendChild(el("p", "warn", "Training/Nutrition trends unavailable"));
    } else {
      var weights = nutritionRows.map(function (row) { return row.weight; });
      var wMax = 0;
      var wMin = Infinity;
      weights.forEach(function (value) {
        if (typeof value !== "number") return;
        if (value > wMax) wMax = value;
        if (value < wMin) wMin = value;
      });
      (function () {
        var lastW = null;
        var i;
        var statEl = foldStat(weightCard);
        var viz = foldViz(weightCard);
        for (i = weights.length - 1; i >= 0; i--) {
          if (typeof weights[i] === "number") { lastW = weights[i]; break; }
        }
        if (statEl) statEl.textContent = lastW == null ? "—" : String(Math.round(lastW * 10) / 10) + " kg";
        if (viz && window.SuiteUI) viz.appendChild(SuiteUI.spark(weights, "Weight"));
      })();
      if (wMin === Infinity) {
        weightCard.appendChild(el("p", "muted", "No weight in this window."));
      } else {
        var weightChart = chartFigure("Kilograms from nutrition.", "Body weight");
        drawChart(weightChart.svg, {
          labels: dates,
          yMin: Math.floor(wMin - 1),
          yMax: Math.ceil(wMax + 1),
          lines: [{ values: weights, className: "chart-line" }]
        });
        weightCard.appendChild(weightChart.fig);
      }
    }
    wrap.appendChild(weightCard);

    wrap.appendChild(macroCard("Calories", nutritionRows, "kcal", "calorieTarget", "kcal"));
    wrap.appendChild(macroCard("Protein", nutritionRows, "protein", "proteinTarget", "g"));
    return wrap;
  }

  function statCard(value, label) {
    var card = el("div", "stat");
    card.appendChild(el("b", "", value));
    card.appendChild(el("span", "", label));
    return card;
  }

  function foldStat(card) {
    return card && card.querySelector ? card.querySelector(".fold-stat") : null;
  }

  function macroCard(title, rows, key, targetKey, unit) {
    var latest = null;
    rows.forEach(function (row) {
      if (row && typeof row[key] === "number") latest = row[key];
    });
    var card = fold(title, latest == null ? "—" : String(Math.round(latest)) + " " + unit, "macro:" + key);
    (function () {
      var viz = foldViz(card);
      if (!viz || !window.SuiteUI || readError.nutrition) return;
      viz.appendChild(SuiteUI.spark(rows.map(function (row) { return row[key]; }), title));
    })();
    if (readError.nutrition) {
      card.appendChild(el("p", "warn", "Training/Nutrition trends unavailable"));
      return card;
    }
    var values = rows.map(function (row) { return row[key]; });
    var targets = rows.map(function (row) { return row[targetKey]; });
    var max = 0;
    values.concat(targets).forEach(function (value) {
      if (typeof value === "number" && value > max) max = value;
    });
    if (!max) {
      card.appendChild(el("p", "muted", "No " + title.toLowerCase() + " logged in this window."));
      return card;
    }
    var chart = chartFigure("Daily " + unit + " and the target for that day type.", title);
    drawChart(chart.svg, {
      labels: rows.map(function (row) { return row.date; }),
      yMax: Math.ceil(max * 1.05),
      bars: [{ values: values, className: "chart-bar" }],
      lines: [{ values: targets, className: "chart-target" }]
    });
    card.appendChild(chart.fig);
    return card;
  }

  function renderSettings() {
    var target = Core.sleepTarget(doc, readError.nutrition ? null : reads.nutrition);
    var card = fold("Sleep target", formatHours(target) + " h", "settings");
    var shown = card.querySelector(".fold-stat");
    if (shown) shown.setAttribute("data-sleep-stat", "1");
    card.appendChild(el("p", "muted", "Override only. Nights stay in Journal."));
    var hint = el("p", "muted", targetHint());
    hint.id = "target-hint";
    card.appendChild(hint);
    var input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "24";
    input.step = "0.25";
    input.inputMode = "decimal";
    input.placeholder = "Hours, or blank for the fallback";
    if (doc.settings && typeof doc.settings.sleepTargetHours === "number") input.value = String(doc.settings.sleepTargetHours);
    input.setAttribute("data-setting", "sleepTarget");
    card.appendChild(fieldLabel("Override hours", input));
    return card;
  }

  function targetHint() {
    var override = doc && doc.settings ? doc.settings.sleepTargetHours : null;
    var goals = reads.nutrition && reads.nutrition.goals;
    var goal = goals ? goals.sleepHours : null;
    if (typeof override === "number" && override > 0) return "Saved override. Clear the field to use the fallback.";
    if (readError.nutrition) return "Nutrition goals unavailable. Fallback is 8 h.";
    if (typeof goal === "number" && isFinite(goal) && goal > 0) return "Using the nutrition goal, " + goal + " h.";
    return "No override and no nutrition goal. Fallback is 8 h.";
  }

  function render() {
    if (!els.main) return;
    if (els.format) els.format.hidden = !readOnly;
    if (els.banner) els.banner.hidden = !demo;
    var route = parseRoute();
    markTab(route.name);
    clear(els.main);
    if (!doc) {
      els.main.appendChild(el("section", "card empty dx-card", ""));
      els.main.lastChild.appendChild(el("p", "", hasToken() ? "Loading…" : "Demo data is unavailable."));
      return;
    }
    var view;
    if (route.name === "injuries") view = renderInjuryList();
    else if (route.name === "editor") view = renderEditor(route.id);
    else if (route.name === "trends") view = renderTrends();
    else if (route.name === "settings") view = renderSettings();
    else view = renderToday();
    lock(view);
    els.main.appendChild(view);
  }

  function addInjury() {
    if (readOnly || !doc) return;
    var item = {
      id: Core.newId("inj", takenIds()),
      area: "",
      side: "n/a",
      startedOn: Core.lisbonToday(),
      resolvedOn: null,
      status: "active",
      cause: "",
      notes: "",
      avoid: [],
      checkins: [],
      updatedAt: stamp()
    };
    doc.injuries.push(item);
    markDirty();
    if (location.hash === "#/injuries/" + item.id) render();
    else location.hash = "#/injuries/" + item.id;
  }

  function commitPain(id) {
    var injury = findInjury(id);
    var slider = control("data-pain-for", id);
    var note = control("data-note-for", id);
    if (!injury || !slider) return;
    var pain = Number(slider.value);
    if (!isFinite(pain)) return;
    pain = Math.max(0, Math.min(10, Math.round(pain)));
    upsertCheckin(injury, Core.lisbonToday(), pain, note ? note.value : "");
    var label = control("data-pain-value", id);
    if (label) label.textContent = String(pain) + "/10";
  }

  function onInput(e) {
    var target = e.target;
    if (!target || readOnly || !doc) return;
    var painId = target.getAttribute && target.getAttribute("data-pain-for");
    if (painId) {
      var label = control("data-pain-value", painId);
      if (label) label.textContent = target.value + "/10";
      commitPain(painId);
      return;
    }
    var noteId = target.getAttribute && target.getAttribute("data-note-for");
    if (noteId) {
      var noted = findInjury(noteId);
      var existing = noted && checkinOn(noted, Core.lisbonToday());
      if (existing) {
        existing.note = target.value;
        existing.updatedAt = stamp();
        noted.updatedAt = stamp();
        markDirty();
      }
      return;
    }
    var field = target.getAttribute && target.getAttribute("data-field");
    var injuryId = target.getAttribute && target.getAttribute("data-injury");
    if (!field || !injuryId) return;
    var injury = findInjury(injuryId);
    if (!injury) return;
    if (field === "avoid") injury.avoid = String(target.value).split(/\n/).map(function (line) { return line.trim(); }).filter(Boolean);
    else if (field === "area" || field === "cause" || field === "notes") injury[field] = target.value;
    else return;
    injury.updatedAt = stamp();
    markDirty();
  }

  function onChange(e) {
    var target = e.target;
    if (!target || readOnly || !doc) return;
    if (target.getAttribute("data-setting") === "sleepTarget") {
      var text = String(target.value || "").trim();
      if (!doc.settings || typeof doc.settings !== "object") doc.settings = { sleepTargetHours: null, updatedAt: null };
      if (!text) doc.settings.sleepTargetHours = null;
      else {
        var hours = Number(text);
        if (!isFinite(hours) || hours <= 0 || hours > 24) {
          if (els.sync) els.sync.textContent = "⚠️ Sleep target must be above 0 and at most 24";
          return;
        }
        doc.settings.sleepTargetHours = Math.round(hours * 100) / 100;
      }
      doc.settings.updatedAt = stamp();
      markDirty();
      var hint = document.getElementById("target-hint");
      if (hint) hint.textContent = targetHint();
      var num = document.querySelector("[data-sleep-stat]");
      if (num) num.textContent = formatHours(Core.sleepTarget(doc, readError.nutrition ? null : reads.nutrition)) + " h";
      return;
    }
    var field = target.getAttribute("data-field");
    var injury = findInjury(target.getAttribute("data-injury"));
    if (!field || !injury) return;
    if (field === "side") injury.side = target.value;
    else if (field === "status") {
      injury.status = target.value;
      if (target.value === "resolved") injury.resolvedOn = injury.resolvedOn || Core.lisbonToday();
      else injury.resolvedOn = null;
    } else if (field === "startedOn") injury.startedOn = target.value;
    else if (field === "resolvedOn") injury.resolvedOn = target.value || null;
    else return;
    injury.updatedAt = stamp();
    markDirty();
    if (field === "status") render();
  }

  function onClick(e) {
    var target = e.target && e.target.closest ? e.target.closest("[data-action], [data-save-pain], [data-window]") : null;
    if (!target || !doc) return;
    var size = target.getAttribute("data-window");
    if (size) {
      trendDays = Number(size);
      render();
      return;
    }
    var painId = target.getAttribute("data-save-pain");
    if (painId) {
      commitPain(painId);
      return;
    }
    var action = target.getAttribute("data-action");
    if (action === "add-injury") {
      addInjury();
      return;
    }
    if (readOnly) return;
    if (action === "delete-injury") {
      var injury = findInjury(target.getAttribute("data-injury"));
      if (!injury) return;
      if (!window.confirm("Delete this injury? It stays in the file, hidden.")) return;
      injury.deleted = true;
      injury.updatedAt = stamp();
      markDirty();
      location.hash = "#/injuries";
      render();
      return;
    }
    if (action === "delete-checkin") {
      var owner = findInjury(target.getAttribute("data-injury"));
      if (!owner) return;
      var checkId = target.getAttribute("data-checkin");
      (owner.checkins || []).forEach(function (item) {
        if (item && item.id === checkId) {
          item.deleted = true;
          item.updatedAt = stamp();
        }
      });
      owner.updatedAt = stamp();
      markDirty();
      render();
    }
  }

  function onSubmit(e) {
    var form = e.target;
    if (!form || !form.getAttribute || form.getAttribute("data-action") !== "add-checkin") return;
    e.preventDefault();
    if (readOnly || !doc) return;
    var injury = findInjury(form.getAttribute("data-injury"));
    if (!injury) return;
    var data = new FormData(form);
    var date = String(data.get("date") || "");
    var pain = Number(data.get("pain"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isFinite(pain)) {
      if (els.sync) els.sync.textContent = "⚠️ Check the date and pain";
      return;
    }
    pain = Math.max(0, Math.min(10, Math.round(pain)));
    upsertCheckin(injury, date, pain, String(data.get("note") || ""));
    render();
  }

  if (!els.main || !Core || !Demo || !window.GhSync) {
    if (els.sync) els.sync.textContent = "⚠️ App failed to load";
    return;
  }

  els.main.addEventListener("input", onInput);
  els.main.addEventListener("change", onChange);
  els.main.addEventListener("click", onClick);
  els.main.addEventListener("submit", onSubmit);
  els.main.addEventListener("focusout", function () {
    setTimeout(function () {
      if (pendingRender && !fieldFocused()) {
        pendingRender = false;
        render();
      }
    }, 0);
  });
  window.addEventListener("hashchange", function () {
    if (!fieldFocused()) render();
    else pendingRender = true;
  });
  if (els.connectBtn) els.connectBtn.addEventListener("click", connectSync);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden" && saveTimer) pushNow();
    if (document.visibilityState === "visible") {
      autoLoad();
      if (!demo && hasToken() && !fieldFocused()) loadReads();
    }
  });

  showConnect();
  if (!hasToken()) enterDemo();
  else {
    if (els.banner) els.banner.hidden = true;
    if (els.sync) els.sync.textContent = "☁️ Loading…";
    render();
    autoLoad();
    loadReads();
  }
  setInterval(function () {
    autoLoad();
    if (!demo && hasToken() && !fieldFocused() && !saving && !dirty && !gaveUp) loadReads();
  }, 60000);
})();
