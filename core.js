/* Health core. DOM-free.
   Writes health.json (injuries + sleep target). No sleep log in that file.
   Sleep nights are read from journal.json. */
(function (root) {
  "use strict";

  var SCHEMA_VERSION = 1;
  var APP_ID = "health";
  var READ_IDS = ["streetlifting", "nutrition", "journal"];
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var CLOCK_RE = /^(\d{2}):(\d{2})$/;
  var SIDES = ["left", "right", "both", "n/a"];
  var STATUSES = ["active", "recovering", "resolved"];

  function fresh() {
    return {
      app: "health",
      schemaVersion: SCHEMA_VERSION,
      owner: "chopper",
      updatedAt: null,
      settings: { sleepTargetHours: null, updatedAt: null },
      injuries: []
    };
  }

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function isPlain(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function finite(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function timeOf(record) {
    if (!record || record.updatedAt == null) return null;
    var t = Date.parse(record.updatedAt);
    return Number.isFinite(t) ? t : null;
  }

  /* Newer parsed instant wins. A missing stamp loses to a real one.
     Ties keep the second record so the in-memory side wins. */
  function newerRecord(a, b) {
    var ta = timeOf(a);
    var tb = timeOf(b);
    if (ta == null && tb == null) return b;
    if (ta == null) return b;
    if (tb == null) return a;
    return tb >= ta ? b : a;
  }

  function overlay(loser, winner) {
    return Object.assign({}, loser || {}, winner || {});
  }

  function dateOrEmpty(value) {
    return typeof value === "string" && DATE_RE.test(value) ? value : "";
  }

  function dateOrNull(value) {
    return typeof value === "string" && DATE_RE.test(value) ? value : null;
  }

  function lisbonToday(now) {
    var fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Lisbon",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return fmt.format(now || new Date());
  }

  function addDays(iso, delta) {
    var parts = String(iso || "").split("-");
    if (parts.length !== 3) return "";
    var y = Number(parts[0]);
    var m = Number(parts[1]);
    var d = Number(parts[2]);
    if (!y || !m || !d) return "";
    var dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + delta);
    return dt.toISOString().slice(0, 10);
  }

  function dateWindow(end, n) {
    var count = typeof n === "number" && n > 0 ? Math.floor(n) : 0;
    var out = [];
    var i;
    for (i = count - 1; i >= 0; i--) out.push(addDays(end, -i));
    return out;
  }

  function asDates(days, today) {
    if (Array.isArray(days)) return days.filter(function (d) { return typeof d === "string"; });
    var n = typeof days === "number" ? days : 28;
    return dateWindow(today || lisbonToday(), n);
  }

  function clockMinutes(value) {
    if (typeof value !== "string") return null;
    var m = CLOCK_RE.exec(value.trim());
    if (!m) return null;
    var h = Number(m[1]);
    var min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  function clockOrNull(value) {
    return clockMinutes(value) == null ? null : value.trim();
  }

  /* Hours from bed to wake. A wake that is not later than bed crosses midnight. */
  function sleepHours(bed, wake) {
    var b = clockMinutes(bed);
    var w = clockMinutes(wake);
    if (b == null || w == null) return null;
    var diff = w - b;
    if (diff <= 0) diff += 24 * 60;
    return diff / 60;
  }

  function qualityOrNull(value) {
    if (typeof value !== "number" || !Number.isInteger(value)) return null;
    if (value < 1 || value > 5) return null;
    return value;
  }

  function painOrNull(value) {
    if (typeof value !== "number" || !Number.isInteger(value)) return null;
    if (value < 0 || value > 10) return null;
    return value;
  }

  function normalizeSettings(raw) {
    var src = isPlain(raw) ? raw : {};
    var out = Object.assign({}, src);
    var hours = finite(src.sleepTargetHours);
    out.sleepTargetHours = hours != null && hours > 0 ? hours : null;
    out.updatedAt = src.updatedAt == null ? null : src.updatedAt;
    return out;
  }

  function normalizeCheckin(raw) {
    if (!isPlain(raw)) return null;
    var out = Object.assign({}, raw);
    if (typeof out.id !== "string" || !out.id) return null;
    out.date = dateOrEmpty(raw.date);
    var pain = painOrNull(raw.pain);
    if (pain == null && raw.pain != null) out.pain = raw.pain;
    else out.pain = pain;
    out.note = typeof raw.note === "string" ? raw.note : "";
    if (typeof raw.updatedAt === "string") out.updatedAt = raw.updatedAt;
    if (raw.deleted === true) out.deleted = true;
    else delete out.deleted;
    return out;
  }

  function normalizeInjury(raw) {
    if (!isPlain(raw) || typeof raw.id !== "string" || !raw.id) return null;
    var out = Object.assign({}, raw);
    out.area = typeof raw.area === "string" ? raw.area : "";
    out.side = SIDES.indexOf(raw.side) >= 0 ? raw.side : "n/a";
    out.startedOn = dateOrEmpty(raw.startedOn);
    out.resolvedOn = dateOrNull(raw.resolvedOn);
    out.status = STATUSES.indexOf(raw.status) >= 0 ? raw.status : "active";
    out.cause = typeof raw.cause === "string" ? raw.cause : "";
    out.notes = typeof raw.notes === "string" ? raw.notes : "";
    out.avoid = Array.isArray(raw.avoid)
      ? raw.avoid.filter(function (item) { return typeof item === "string"; })
      : [];
    out.checkins = Array.isArray(raw.checkins)
      ? raw.checkins.map(normalizeCheckin).filter(Boolean)
      : [];
    if (typeof raw.updatedAt !== "string") out.updatedAt = raw.updatedAt == null ? null : String(raw.updatedAt);
    if (raw.deleted === true) out.deleted = true;
    else delete out.deleted;
    return out;
  }

  function normalize(data) {
    var src = isPlain(data) ? data : {};
    var out = clone(src) || {};
    out.app = "health";
    var schema = finite(src.schemaVersion);
    out.schemaVersion = schema == null ? SCHEMA_VERSION : schema;
    out.owner = typeof src.owner === "string" && src.owner ? src.owner : "chopper";
    if (!Object.prototype.hasOwnProperty.call(src, "updatedAt")) out.updatedAt = null;
    out.settings = normalizeSettings(src.settings);
    out.injuries = Array.isArray(src.injuries)
      ? src.injuries.map(normalizeInjury).filter(Boolean)
      : [];
    if (!Object.prototype.hasOwnProperty.call(src, "sleep")) delete out.sleep;
    return out;
  }

  function mergeById(localList, remoteList, combine) {
    var order = [];
    var map = {};
    function take(list) {
      (list || []).forEach(function (rec) {
        if (!isPlain(rec) || typeof rec.id !== "string" || !rec.id) return;
        if (!map[rec.id]) {
          map[rec.id] = clone(rec);
          order.push(rec.id);
          return;
        }
        map[rec.id] = combine(map[rec.id], clone(rec));
      });
    }
    take(remoteList);
    take(localList);
    return order.map(function (id) { return map[id]; });
  }

  function mergePair(existing, incoming) {
    var winner = newerRecord(existing, incoming);
    var loser = winner === existing ? incoming : existing;
    return overlay(loser, winner);
  }

  function mergeInjury(existing, incoming) {
    var winner = newerRecord(existing, incoming);
    var loser = winner === existing ? incoming : existing;
    var merged = overlay(loser, winner);
    merged.checkins = mergeById(incoming.checkins, existing.checkins, mergePair);
    return merged;
  }

  function mergeDateMap(localMap, remoteMap) {
    var keys = {};
    var out = {};
    Object.keys(remoteMap || {}).forEach(function (key) { keys[key] = true; });
    Object.keys(localMap || {}).forEach(function (key) { keys[key] = true; });
    Object.keys(keys).forEach(function (key) {
      var local = localMap && Object.prototype.hasOwnProperty.call(localMap, key) ? localMap[key] : undefined;
      var remote = remoteMap && Object.prototype.hasOwnProperty.call(remoteMap, key) ? remoteMap[key] : undefined;
      if (local === undefined) out[key] = clone(remote);
      else if (remote === undefined) out[key] = clone(local);
      else out[key] = mergePair(clone(remote), clone(local));
    });
    return out;
  }

  function hasSleepMap(doc) {
    return isPlain(doc) && isPlain(doc.sleep);
  }

  function schemaNum(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }

  function merge(local, remote) {
    var l = isPlain(local) ? local : {};
    var r = isPlain(remote) ? remote : {};
    var winner = newerRecord(r, l);
    var loser = winner === l ? r : l;
    var out = overlay(clone(loser), clone(winner));
    out.injuries = mergeById(l.injuries, r.injuries, mergeInjury);
    out.settings = mergePair(
      normalizeSettings(r.settings),
      normalizeSettings(l.settings)
    );
    if (hasSleepMap(l) || hasSleepMap(r)) {
      out.sleep = mergeDateMap(hasSleepMap(l) ? l.sleep : {}, hasSleepMap(r) ? r.sleep : {});
    } else {
      delete out.sleep;
    }
    out.schemaVersion = Math.max(schemaNum(l.schemaVersion), schemaNum(r.schemaVersion));
    out.updatedAt = (winner && Object.prototype.hasOwnProperty.call(winner, "updatedAt"))
      ? winner.updatedAt
      : null;
    if (!out.app) out.app = "health";
    if (!out.owner) out.owner = "chopper";
    return out;
  }

  function newId(prefix, taken) {
    var alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    var id = "";
    var guard = 0;
    var i;
    do {
      id = prefix + "_";
      for (i = 0; i < 6; i++) id += alphabet[Math.floor(Math.random() * alphabet.length)];
      guard += 1;
    } while (taken && taken[id] && guard < 100);
    return id;
  }

  function sleepTarget(health, nutrition) {
    var settings = health && health.settings;
    var override = settings ? finite(settings.sleepTargetHours) : null;
    if (override != null && override > 0) return override;
    var goals = nutrition && nutrition.goals;
    var goal = goals ? finite(goals.sleepHours) : null;
    if (goal != null && goal > 0) return goal;
    return 8;
  }

  function liveCheckins(injury) {
    var list = injury && Array.isArray(injury.checkins) ? injury.checkins : [];
    return list.filter(function (c) { return isPlain(c) && c.deleted !== true; });
  }

  function checkinOn(injury, date) {
    var best = null;
    liveCheckins(injury).forEach(function (c) {
      if (c.date !== date) return;
      if (!best || newerRecord(best, c) === c) best = c;
    });
    return best;
  }

  function painSeries(injury, days, today) {
    return asDates(days, today).map(function (date) {
      var hit = checkinOn(injury, date);
      return {
        date: date,
        pain: hit ? painOrNull(hit.pain) : null,
        note: hit && typeof hit.note === "string" ? hit.note : ""
      };
    });
  }

  function addItem(totals, entry) {
    if (!isPlain(entry)) return;
    totals.kcal += finite(entry.kcal) || 0;
    totals.protein += finite(entry.protein) || 0;
    totals.carbs += finite(entry.carbs) || 0;
    totals.fat += finite(entry.fat) || 0;
  }

  function addList(totals, list) {
    if (!Array.isArray(list)) return;
    list.forEach(function (entry) { addItem(totals, entry); });
  }

  function mealTotals(day) {
    var totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    var meals = day && day.meals;
    if (Array.isArray(meals)) addList(totals, meals);
    else if (isPlain(meals)) {
      Object.keys(meals).forEach(function (key) { addList(totals, meals[key]); });
    }
    return totals;
  }

  function mealsLogged(day) {
    if (!day) return false;
    if (Array.isArray(day.meals)) return true;
    return isPlain(day.meals);
  }

  function dayTargets(goals, dayType) {
    var g = isPlain(goals) ? goals : {};
    var source = null;
    if (dayType === "rest") source = isPlain(g.restDay) ? g.restDay : null;
    else if (dayType === "training") source = g;
    if (!source) return { calories: null, protein: null };
    return {
      calories: finite(source.calories),
      protein: finite(source.protein)
    };
  }

  function nutritionDaily(nutrition, days, today) {
    var goals = nutrition && nutrition.goals;
    var map = nutrition && isPlain(nutrition.days) ? nutrition.days : {};
    return asDates(days, today).map(function (date) {
      var day = isPlain(map[date]) ? map[date] : null;
      var logged = mealsLogged(day);
      var totals = logged ? mealTotals(day) : { kcal: null, protein: null, carbs: null, fat: null };
      var dayType = day && (day.dayType === "training" || day.dayType === "rest") ? day.dayType : null;
      var targets = dayTargets(goals, dayType);
      var weight = day ? finite(day.weight) : null;
      return {
        date: date,
        weight: weight != null && weight > 0 ? weight : null,
        kcal: totals.kcal,
        protein: totals.protein,
        carbs: totals.carbs,
        fat: totals.fat,
        dayType: dayType,
        calorieTarget: targets.calories,
        proteinTarget: targets.protein,
        logged: logged
      };
    });
  }

  function countSets(session) {
    var n = 0;
    if (!isPlain(session) || !isPlain(session.lifts)) return 0;
    Object.keys(session.lifts).forEach(function (name) {
      if (Array.isArray(session.lifts[name])) n += session.lifts[name].length;
    });
    return n;
  }

  function trainingDaily(street, days, today) {
    var sessions = street && isPlain(street.sessions) ? street.sessions : {};
    return asDates(days, today).map(function (date) {
      return { date: date, sets: countSets(sessions[date]) };
    });
  }

  function rollingAvg(values, windowSize) {
    var size = typeof windowSize === "number" && windowSize > 0 ? Math.floor(windowSize) : 7;
    var list = Array.isArray(values) ? values : [];
    return list.map(function (_, index) {
      var start = Math.max(0, index - size + 1);
      var sum = 0;
      var count = 0;
      var i;
      for (i = start; i <= index; i++) {
        if (typeof list[i] === "number" && Number.isFinite(list[i])) {
          sum += list[i];
          count += 1;
        }
      }
      return count ? sum / count : null;
    });
  }

  function hoursFromText(value) {
    var text = value.trim();
    var range = /^(\d{2}:\d{2})\s*[-–—]\s*(\d{2}:\d{2})$/.exec(text);
    if (range) {
      return { bed: range[1], wake: range[2], hours: sleepHours(range[1], range[2]) };
    }
    if (CLOCK_RE.test(text)) return null;
    var leading = /^\s*(-?\d+(?:\.\d+)?)/.exec(text);
    if (!leading) return null;
    var n = Number(leading[1]);
    if (!Number.isFinite(n) || n < 0 || n > 24) return null;
    return { bed: null, wake: null, hours: n };
  }

  function readNight(value) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 24) {
      return { bed: null, wake: null, hours: value, quality: null, note: "", updatedAt: null };
    }
    if (typeof value === "string") {
      var parsed = hoursFromText(value);
      if (!parsed) return null;
      return {
        bed: parsed.bed,
        wake: parsed.wake,
        hours: parsed.hours,
        quality: null,
        note: "",
        updatedAt: null
      };
    }
    if (!isPlain(value)) return null;
    var bed = clockOrNull(value.bed);
    var wake = clockOrNull(value.wake);
    var hours = finite(value.hours);
    if (hours == null) hours = finite(value.sleepHours);
    if (hours == null) hours = sleepHours(bed, wake);
    if (hours != null && (hours < 0 || hours > 24)) hours = null;
    var quality = qualityOrNull(value.quality);
    var note = typeof value.note === "string" ? value.note : "";
    if (bed == null && wake == null && hours == null && quality == null && !note) return null;
    return {
      bed: bed,
      wake: wake,
      hours: hours,
      quality: quality,
      note: note,
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null
    };
  }

  function nightFromEntry(entry) {
    if (!isPlain(entry)) return null;
    var fields = isPlain(entry.fields) ? entry.fields : {};
    var night = readNight(fields.sleep) || readNight(entry.sleep) || readNight(fields.sleepHours);
    if (night && !night.updatedAt && typeof entry.updatedAt === "string") night.updatedAt = entry.updatedAt;
    return night;
  }

  /* Map of wake-date to night. Journal is the only sleep source. */
  function journalSleep(journal) {
    var out = {};
    if (!isPlain(journal)) return out;
    var entries = isPlain(journal.entries) ? journal.entries : {};
    Object.keys(entries).forEach(function (date) {
      if (!DATE_RE.test(date)) return;
      var night = nightFromEntry(entries[date]);
      if (night) out[date] = night;
    });
    if (isPlain(journal.sleep)) {
      Object.keys(journal.sleep).forEach(function (date) {
        if (!DATE_RE.test(date)) return;
        var night = readNight(journal.sleep[date]);
        if (!night) return;
        if (!out[date]) out[date] = night;
        else {
          var winner = newerRecord(out[date], night);
          var loser = winner === out[date] ? night : out[date];
          out[date] = overlay(loser, winner);
          if (out[date].hours == null) out[date].hours = sleepHours(out[date].bed, out[date].wake);
        }
      });
    }
    return out;
  }

  function sleepSeries(journal, days, today) {
    var map = journalSleep(journal);
    return asDates(days, today).map(function (date) {
      var night = map[date] || null;
      var hours = night ? night.hours : null;
      if (night && hours == null) hours = sleepHours(night.bed, night.wake);
      return {
        date: date,
        hours: typeof hours === "number" && Number.isFinite(hours) ? hours : null,
        quality: night ? night.quality : null,
        bed: night ? night.bed : null,
        wake: night ? night.wake : null,
        note: night && night.note ? night.note : ""
      };
    });
  }

  function mean(values) {
    var nums = values.filter(function (v) { return typeof v === "number" && Number.isFinite(v); });
    if (!nums.length) return null;
    var sum = nums.reduce(function (a, b) { return a + b; }, 0);
    return sum / nums.length;
  }

  function summarize(opts) {
    var today = opts && opts.today;
    var sleepRows = (opts && opts.sleepRows) || [];
    var from = addDays(today, -6);
    var last7 = sleepRows.filter(function (row) {
      return row && row.date >= from && row.date <= today;
    });
    var hours = last7.map(function (row) { return row.hours; });
    var under = 0;
    hours.forEach(function (value) {
      if (typeof value === "number" && Number.isFinite(value) && value < 7) under += 1;
    });
    var weights = ((opts && opts.weightRows) || []).filter(function (row) {
      return row && typeof row.weight === "number" && Number.isFinite(row.weight);
    });
    var weightChange = weights.length >= 2
      ? weights[weights.length - 1].weight - weights[0].weight
      : null;
    var weekAgo = addDays(today, -7);
    var pain = [];
    ((opts && opts.injuries) || []).forEach(function (injury) {
      if (!injury || injury.deleted === true) return;
      if (injury.status !== "active" && injury.status !== "recovering") return;
      var now = checkinOn(injury, today);
      var then = checkinOn(injury, weekAgo);
      var nowPain = now ? painOrNull(now.pain) : null;
      var thenPain = then ? painOrNull(then.pain) : null;
      pain.push({
        id: injury.id,
        area: injury.area || "",
        today: nowPain,
        weekAgo: thenPain,
        delta: nowPain == null || thenPain == null ? null : nowPain - thenPain
      });
    });
    return {
      sleepAvg7: mean(hours),
      nightsUnder7: under,
      sleepNights7: hours.filter(function (v) { return typeof v === "number" && Number.isFinite(v); }).length,
      weightChange: weightChange,
      pain: pain
    };
  }

  function saveHealth(ghSync, getDoc, mergeRemote) {
    function once() {
      return ghSync.save(APP_ID, getDoc, mergeRemote, { quiet: true });
    }
    // One retry path: gh-sync.js re-fetches, merges and retries a 409 once itself.
    return once().catch(function (err) {
      if (!(err && (err.status === 409 || /another device/.test(String(err.message))))) return Promise.reject(err);
      return Promise.reject(new Error("⚠️ Not saved, reload"));
    });
  }

  var api = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    APP_ID: APP_ID,
    READ_IDS: READ_IDS,
    fresh: fresh,
    clone: clone,
    normalize: normalize,
    merge: merge,
    newId: newId,
    sleepHours: sleepHours,
    sleepTarget: sleepTarget,
    painSeries: painSeries,
    nutritionDaily: nutritionDaily,
    trainingDaily: trainingDaily,
    rollingAvg: rollingAvg,
    journalSleep: journalSleep,
    sleepSeries: sleepSeries,
    summarize: summarize,
    saveHealth: saveHealth,
    mealTotals: mealTotals,
    countSets: countSets,
    lisbonToday: lisbonToday,
    addDays: addDays,
    dateWindow: dateWindow,
    newerRecord: newerRecord
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.HealthCore = api;
})(typeof window !== "undefined" ? window : globalThis);
