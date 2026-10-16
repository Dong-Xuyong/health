/* Full streetlifting program. Reads the file the training app already loads. */
(function (root) {
  "use strict";

  var PREFERRED = ["pullup", "squat", "dip", "muscleup"];
  var lastKey = "";

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function num(value) {
    return typeof value === "number" && isFinite(value) ? value : null;
  }

  function fmtKg(n) {
    var rounded = Math.round(n * 10) / 10;
    if (Math.abs(rounded - Math.round(rounded)) < 1e-6) return String(Math.round(rounded));
    return rounded.toFixed(1);
  }

  function countWord(n, one, many) {
    return String(n) + " " + (n === 1 ? one : many);
  }

  function liftName(slug) {
    try {
      if (root.Street && typeof root.Street.label === "function") {
        var name = root.Street.label(slug);
        if (name) return String(name);
      }
    } catch (e) {}
    var raw = slug == null ? "" : String(slug);
    if (!raw) return "Program";
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  function isDone(session) {
    return !!(session && typeof session.done === "string" && session.done.length > 0);
  }

  function pctLabel(n) {
    var v = n <= 1 ? n * 100 : n;
    return fmtKg(v) + "%";
  }

  function loadText(set) {
    var kg = num(set.kg);
    var kgMax = num(set.kgMax);
    var pct = num(set.pct);
    var pctMin = num(set.pctMin);
    var pctMax = num(set.pctMax);
    if (kg !== null && kgMax !== null && kgMax !== kg) return fmtKg(kg) + "–" + fmtKg(kgMax) + " kg";
    if (kg !== null) return fmtKg(kg) + " kg";
    if (pctMin === null) pctMin = pct;
    if (pctMin === null) return "";
    if (pctMax !== null && pctMax !== pctMin) return pctLabel(pctMin) + "–" + pctLabel(pctMax);
    return pctLabel(pctMin);
  }

  function setText(set) {
    var sets;
    var reps;
    var load;
    var work;
    if (!set || typeof set !== "object") return "";
    sets = num(set.sets);
    reps = num(set.reps);
    load = loadText(set);
    if (sets !== null && reps !== null) work = fmtKg(sets) + "×" + fmtKg(reps);
    else if (reps !== null) work = fmtKg(reps) + " reps";
    else if (sets !== null) work = fmtKg(sets) + " sets";
    else work = "";
    if (work && load) return work + " @ " + load;
    return work || load;
  }

  function sessionBits(session) {
    var sets = session && Array.isArray(session.sets) ? session.sets : [];
    var bits = [];
    var i;
    var line;
    for (i = 0; i < sets.length; i++) {
      line = setText(sets[i]);
      if (line) bits.push(line);
    }
    return bits;
  }

  function shortDone(done) {
    var m;
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    if (!/^\d{4}-\d{2}-\d{2}/.test(done)) return done;
    m = parseInt(done.slice(5, 7), 10);
    if (!m || m < 1 || m > 12) return done;
    return String(parseInt(done.slice(8, 10), 10)) + " " + months[m - 1];
  }

  function weekKey(session) {
    var label;
    var match;
    if (!session || typeof session !== "object") return "";
    if (num(session.week) !== null) return String(session.week);
    if (text(session.week)) return text(session.week);
    label = text(session.label) || text(session.name);
    match = /week\s*(\d+)/i.exec(label);
    if (match) return match[1];
    match = /\bW(\d+)/i.exec(label);
    if (match) return match[1];
    return "";
  }

  function blockKey(session) {
    var label;
    var match;
    if (!session || typeof session !== "object") return "";
    if (text(session.block)) return text(session.block);
    if (num(session.block) !== null) return String(session.block);
    label = text(session.label) || text(session.name);
    match = /block\s*(\d+|[A-Za-z0-9]+)/i.exec(label);
    if (match) return match[1];
    return "";
  }

  function weekTitle(key, index) {
    var raw = text(key) || (num(key) !== null ? String(key) : "");
    if (!raw) return "Week " + String(index);
    if (/^week\b/i.test(raw)) return raw.replace(/\s+/g, " ");
    if (/^\d+$/.test(raw)) return "Week " + String(Number(raw));
    return raw;
  }

  function sessionTitle(session, index, weekKeyUsed) {
    var raw = text(session && session.label) || text(session && session.name) || ("Session " + String(index));
    var stripped = raw;
    if (weekKeyUsed) {
      stripped = stripped.replace(/^(?:block\s*[A-Za-z0-9]+\s*[·•\-|–—:]\s*)?/i, "");
      stripped = stripped.replace(/^week\s*\d+\s*(?:[·•\-|–—:]\s*)?/i, "");
      stripped = text(stripped);
    }
    return stripped || raw;
  }

  function pushSession(week, session) {
    if (!session || typeof session !== "object") return;
    week.sessions.push(session);
  }

  function ensureWeek(block, key) {
    var id = key || "1";
    var i;
    for (i = 0; i < block.weeks.length; i++) {
      if (block.weeks[i].key === id) return block.weeks[i];
    }
    block.weeks.push({ key: id, sessions: [] });
    return block.weeks[block.weeks.length - 1];
  }

  function weeksFromSessions(list) {
    var block = { weeks: [] };
    var anyWeek = false;
    var i;
    var key;
    var week;
    for (i = 0; i < list.length; i++) {
      if (weekKey(list[i])) anyWeek = true;
    }
    for (i = 0; i < list.length; i++) {
      key = anyWeek ? weekKey(list[i]) : "1";
      if (!key) key = block.weeks.length ? block.weeks[block.weeks.length - 1].key : "1";
      week = ensureWeek(block, key);
      pushSession(week, list[i]);
    }
    return block.weeks;
  }

  function titledWeeks(weeks) {
    var out = [];
    var i;
    var week;
    var sessions;
    for (i = 0; i < weeks.length; i++) {
      week = weeks[i] && typeof weeks[i] === "object" ? weeks[i] : {};
      sessions = Array.isArray(week.sessions) ? week.sessions : (Array.isArray(week.days) ? week.days : []);
      if (!sessions.length) continue;
      out.push({
        key: text(week.label) || text(week.name) || (week.week != null ? String(week.week) : String(i + 1)),
        sessions: sessions.filter(function (session) {
          return session && typeof session === "object";
        })
      });
    }
    return out.filter(function (week) {
      return week.sessions.length;
    });
  }

  function blocksFromDays(days) {
    var anyBlock = false;
    var blocks = [];
    var index = {};
    var i;
    var key;
    var block;
    var weekId;
    for (i = 0; i < days.length; i++) {
      if (blockKey(days[i])) anyBlock = true;
    }
    if (!anyBlock) {
      return [{ title: "", weeks: weeksFromSessions(days) }];
    }
    function take(id, title) {
      if (Object.prototype.hasOwnProperty.call(index, id)) return blocks[index[id]];
      index[id] = blocks.length;
      blocks.push({ title: title, weeks: [] });
      return blocks[blocks.length - 1];
    }
    for (i = 0; i < days.length; i++) {
      key = blockKey(days[i]) || "Other";
      block = take(key, /^\d+$/.test(key) ? "Block " + String(Number(key)) : key);
      weekId = weekKey(days[i]);
      if (!weekId) weekId = block.weeks.length ? block.weeks[block.weeks.length - 1].key : "1";
      pushSession(ensureWeek(block, weekId), days[i]);
    }
    return blocks;
  }

  function programBlocks(prog, fallback) {
    var name = text(prog && prog.name) || fallback;
    var blocks;
    var days;
    var i;
    if (!prog || typeof prog !== "object") return [];
    if (Array.isArray(prog.blocks) && prog.blocks.length) {
      blocks = [];
      for (i = 0; i < prog.blocks.length; i++) {
        blocks.push({
          title: text(prog.blocks[i] && (prog.blocks[i].name || prog.blocks[i].label || prog.blocks[i].title)) || name || ("Block " + String(i + 1)),
          note: text(prog.blocks[i] && prog.blocks[i].note) || (i === 0 ? text(prog.note) : ""),
          weeks: titledWeeks(Array.isArray(prog.blocks[i].weeks) ? prog.blocks[i].weeks : [])
        });
        if (!blocks[blocks.length - 1].weeks.length) {
          days = Array.isArray(prog.blocks[i].sessions) ? prog.blocks[i].sessions : prog.blocks[i].days;
          if (Array.isArray(days) && days.length) blocks[blocks.length - 1].weeks = weeksFromSessions(days);
        }
      }
      return blocks.filter(function (block) { return block.weeks.length; });
    }
    if (Array.isArray(prog.weeks) && prog.weeks.length) {
      return [{ title: name, note: text(prog.note), weeks: titledWeeks(prog.weeks) }].filter(function (block) {
        return block.weeks.length;
      });
    }
    days = Array.isArray(prog.days) ? prog.days : (Array.isArray(prog.sessions) ? prog.sessions : null);
    if (!days || !days.length) return [];
    blocks = blocksFromDays(days);
    for (i = 0; i < blocks.length; i++) {
      if (!blocks[i].title) blocks[i].title = name;
      blocks[i].note = i === 0 ? text(prog.note) : "";
    }
    return blocks.filter(function (block) { return block.weeks.length; });
  }

  function programOrder(programs) {
    var keys = Object.keys(programs);
    var seen = {};
    var out = [];
    var i;
    for (i = 0; i < PREFERRED.length; i++) {
      if (Object.prototype.hasOwnProperty.call(programs, PREFERRED[i])) {
        seen[PREFERRED[i]] = true;
        out.push(PREFERRED[i]);
      }
    }
    keys.sort();
    for (i = 0; i < keys.length; i++) {
      if (!seen[keys[i]]) out.push(keys[i]);
    }
    return out;
  }

  function decorate(block) {
    var weeks = [];
    var total = 0;
    var done = 0;
    var sawNext = false;
    var w;
    var s;
    var week;
    var sessions;
    var weekDone;
    var weekTotal;
    var session;
    var bits;
    var summary;
    var lines;
    var emoji;
    for (w = 0; w < block.weeks.length; w++) {
      week = block.weeks[w];
      sessions = [];
      weekDone = 0;
      weekTotal = 0;
      for (s = 0; s < week.sessions.length; s++) {
        session = week.sessions[s];
        weekTotal += 1;
        bits = sessionBits(session);
        lines = bits.slice();
        if (isDone(session)) {
          weekDone += 1;
          emoji = "✅";
          if (text(session.done)) lines.push(shortDone(text(session.done)));
        } else if (!sawNext) {
          sawNext = true;
          emoji = "👉";
        } else {
          emoji = "▫️";
        }
        if (text(session.note)) lines.push(text(session.note));
        summary = sessionTitle(session, weekTotal, week.key);
        if (bits.length) summary += " · " + bits.slice(0, 3).join(" · ");
        if (bits.length > 3) summary += " · +" + String(bits.length - 3);
        sessions.push({ emoji: emoji, summary: summary, lines: lines });
      }
      if (!weekTotal) continue;
      total += weekTotal;
      done += weekDone;
      weeks.push({
        emoji: weekDone === weekTotal ? "✅" : "📌",
        summary: weekTitle(week.key, w + 1) + " · " + countWord(weekTotal, "session", "sessions") + " · " + String(weekDone) + " done",
        pct: Math.round((weekDone / weekTotal) * 1000) / 10,
        sessions: sessions
      });
    }
    return {
      emoji: weeks.length && done === total ? "✅" : "🏋️",
      summary: (block.title || "Program") + " · " + countWord(weeks.length, "week", "weeks") + " · " + String(done) + " done",
      note: block.note || "",
      pct: total ? Math.round((done / total) * 1000) / 10 : 0,
      weeks: weeks
    };
  }

  function buildModel(file) {
    var programs;
    var order;
    var blocks = [];
    var i;
    var list;
    var b;
    if (!file || typeof file !== "object" || !file.programs || typeof file.programs !== "object") {
      return { blocks: [] };
    }
    programs = file.programs;
    order = programOrder(programs);
    for (i = 0; i < order.length; i++) {
      list = programBlocks(programs[order[i]], liftName(order[i]));
      for (b = 0; b < list.length; b++) {
        if (!list[b].weeks.length) continue;
        blocks.push(decorate(list[b]));
      }
    }
    return { blocks: blocks };
  }

  function el(tag, className, value) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = value;
    return node;
  }

  function summaryRow(emoji, line, pct) {
    var row = el("summary", "tp-sum");
    var track;
    var fill;
    row.appendChild(el("span", "tp-emoji", emoji));
    row.appendChild(el("span", "tp-line", line));
    if (pct != null) {
      track = el("span", "tp-bar");
      track.setAttribute("aria-hidden", "true");
      fill = document.createElement("i");
      fill.style.width = String(pct) + "%";
      track.appendChild(fill);
      row.appendChild(track);
    }
    return row;
  }

  function sessionNode(session) {
    var node = el("details", "tp-session");
    var body;
    var i;
    node.appendChild(summaryRow(session.emoji, session.summary, null));
    if (!session.lines.length) return node;
    body = el("div", "tp-body");
    for (i = 0; i < session.lines.length; i++) body.appendChild(el("p", "", session.lines[i]));
    node.appendChild(body);
    return node;
  }

  function weekNode(week) {
    var node = el("details", "tp-week");
    var i;
    node.appendChild(summaryRow(week.emoji, week.summary, week.pct));
    for (i = 0; i < week.sessions.length; i++) node.appendChild(sessionNode(week.sessions[i]));
    return node;
  }

  function blockNode(block) {
    var node = el("details", "tp-block");
    var i;
    node.appendChild(summaryRow(block.emoji, block.summary, block.pct));
    if (block.note) node.appendChild(el("p", "tp-note", block.note));
    for (i = 0; i < block.weeks.length; i++) node.appendChild(weekNode(block.weeks[i]));
    return node;
  }

  function paint(model) {
    var host;
    var i;
    if (!root.document || typeof root.document.getElementById !== "function") return;
    host = root.document.getElementById("program");
    if (!host) return;
    host.textContent = "";
    if (!model.blocks.length) {
      host.removeAttribute("role");
      host.removeAttribute("aria-label");
      return;
    }
    host.setAttribute("role", "region");
    host.setAttribute("aria-label", "Program");
    for (i = 0; i < model.blocks.length; i++) host.appendChild(blockNode(model.blocks[i]));
  }

  function render(file) {
    var model = buildModel(file);
    paint(model);
    return model;
  }

  function capture(file) {
    var key = "";
    try {
      key = JSON.stringify(file && file.programs ? file.programs : null);
    } catch (e) {
      key = "";
    }
    if (key === lastKey) return;
    lastKey = key;
    render(file);
  }

  function install() {
    var street;
    var sync;
    var origView;
    var origLoad;
    if (!root || root.nodeType) return;
    street = root.Street;
    sync = root.GhSync;
    if (street && typeof street.programView === "function" && !street.programView.__tp) {
      origView = street.programView;
      street.programView = function (file) {
        try { capture(file); } catch (e) {}
        return origView.apply(this, arguments);
      };
      street.programView.__tp = true;
    }
    if (sync && typeof sync.load === "function" && !sync.load.__tp) {
      origLoad = sync.load;
      sync.load = function (appId, apply) {
        if (appId !== "streetlifting" || typeof apply !== "function") return origLoad.apply(sync, arguments);
        return origLoad.call(sync, appId, function (payload) {
          try { capture(payload); } catch (e) {}
          return apply(payload);
        });
      };
      sync.load.__tp = true;
    }
  }

  var api = { render: render, model: buildModel };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && !root.nodeType) {
    root.TrainingProgram = api;
    install();
  }
})(typeof window !== "undefined" ? window : {});
