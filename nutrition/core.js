(function () {
  "use strict";

  var MEALS = ["breakfast", "lunch", "dinner", "snacks"];

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function parseKey(key) {
    var parts = key.split("-");
    return {
      y: Number(parts[0]),
      m: Number(parts[1]),
      d: Number(parts[2])
    };
  }

  function formatUTC(date) {
    return (
      date.getUTCFullYear() +
      "-" +
      pad2(date.getUTCMonth() + 1) +
      "-" +
      pad2(date.getUTCDate())
    );
  }

  function utcFromKey(key) {
    var p = parseKey(key);
    return new Date(Date.UTC(p.y, p.m - 1, p.d));
  }

  function num(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }

  function formatInt(n) {
    var rounded = Math.round(n);
    var sign = rounded < 0 ? "-" : "";
    var body = String(Math.abs(rounded));
    return sign + body.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function emptyMacros() {
    return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  }

  function mealFill(day) {
    var meals = day && day.meals && typeof day.meals === "object" ? day.meals : {};
    var slots = 0;
    var main = 0;
    for (var i = 0; i < MEALS.length; i++) {
      var list = meals[MEALS[i]];
      if (!Array.isArray(list) || list.length === 0) continue;
      slots += 1;
      if (MEALS[i] !== "snacks") main += 1;
    }
    return { slots: slots, main: main };
  }

  // Empty: no meals. Partial: a log that cannot be a finished day
  // (under 500 kcal, or a single main meal under 1,000 kcal).
  // Exercise with no meals is empty, so it stays out of averages.
  function logStatus(day) {
    var fill = mealFill(day);
    if (fill.slots === 0) return "empty";
    var kcal = totals(day).kcal;
    if (kcal < 500) return "partial";
    if (fill.main < 2 && kcal < 1000) return "partial";
    return "complete";
  }

  function isLogged(day) {
    return logStatus(day) === "complete";
  }

  function keysEnding(endKey, n) {
    var keys = [];
    var key = shift(endKey, -(n - 1));
    for (var i = 0; i < n; i++) {
      keys.push(key);
      key = shift(key, 1);
    }
    return keys;
  }

  function positiveWeight(day) {
    if (!day || typeof day.weight !== "number") return null;
    if (!Number.isFinite(day.weight) || day.weight <= 0) return null;
    return day.weight;
  }

  function daySpan(earlier, later) {
    var ms = utcFromKey(later).getTime() - utcFromKey(earlier).getTime();
    return Math.round(ms / 86400000);
  }

  function blankStore() {
    return {
      version: 1,
      goals: {
        updatedAt: "",
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        weight: 0,
        startWeight: 0
      },
      days: {}
    };
  }

  function dayKey(date) {
    return (
      date.getFullYear() +
      "-" +
      pad2(date.getMonth() + 1) +
      "-" +
      pad2(date.getDate())
    );
  }

  function shift(key, delta) {
    var p = parseKey(key);
    return formatUTC(new Date(Date.UTC(p.y, p.m - 1, p.d + delta)));
  }

  function label(key) {
    var date = utcFromKey(key);
    var weekdayName = new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      timeZone: "UTC"
    }).format(date);
    var dayNum = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      timeZone: "UTC"
    }).format(date);
    var monthName = new Intl.DateTimeFormat("en-GB", {
      month: "long",
      timeZone: "UTC"
    }).format(date);
    return weekdayName + ", " + dayNum + " " + monthName;
  }

  function weekday(key) {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      timeZone: "UTC"
    }).format(utcFromKey(key));
  }

  function monthGrid(key) {
    var p = parseKey(key);
    var first = new Date(Date.UTC(p.y, p.m - 1, 1));
    var title = new Intl.DateTimeFormat("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    }).format(first);
    var lead = first.getUTCDay();
    var daysInMonth = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate();
    var count = Math.ceil((lead + daysInMonth) / 7) * 7;
    var cells = [];
    for (var i = 0; i < count; i++) {
      var date = new Date(Date.UTC(p.y, p.m - 1, 1 - lead + i));
      cells.push({
        key: formatUTC(date),
        inMonth: date.getUTCFullYear() === p.y && date.getUTCMonth() === p.m - 1
      });
    }
    return { title: title, cells: cells };
  }

  function totals(day) {
    var byMeal = {
      breakfast: emptyMacros(),
      lunch: emptyMacros(),
      dinner: emptyMacros(),
      snacks: emptyMacros()
    };
    var meals = day && day.meals && typeof day.meals === "object" ? day.meals : {};
    for (var i = 0; i < MEALS.length; i++) {
      var meal = MEALS[i];
      var items = Array.isArray(meals[meal]) ? meals[meal] : [];
      for (var j = 0; j < items.length; j++) {
        var item = items[j];
        if (!item || typeof item !== "object") continue;
        byMeal[meal].kcal += num(item.kcal);
        byMeal[meal].protein += num(item.protein);
        byMeal[meal].carbs += num(item.carbs);
        byMeal[meal].fat += num(item.fat);
      }
    }
    var kcal = 0;
    var protein = 0;
    var carbs = 0;
    var fat = 0;
    for (var k = 0; k < MEALS.length; k++) {
      kcal += byMeal[MEALS[k]].kcal;
      protein += byMeal[MEALS[k]].protein;
      carbs += byMeal[MEALS[k]].carbs;
      fat += byMeal[MEALS[k]].fat;
    }
    var exercise = 0;
    var burned = day && Array.isArray(day.exercise) ? day.exercise : [];
    for (var e = 0; e < burned.length; e++) {
      if (burned[e] && typeof burned[e] === "object") exercise += num(burned[e].kcal);
    }
    return {
      kcal: kcal,
      protein: protein,
      carbs: carbs,
      fat: fat,
      exercise: exercise,
      net: kcal - exercise,
      byMeal: byMeal
    };
  }

  function score(day, goals, session) {
    var status = logStatus(day);
    if (status === "partial") return "partial";
    if (status !== "complete") return "grey";
    var bal = dayBalance(day, goals, session);
    var t = totals(day);
    var cal = bal.targets.calories;
    var pro = bal.targets.protein;
    var ratio = cal > 0 ? bal.eaten / cal : 1;
    var band10 = ratio >= 0.9 && ratio <= 1.1;
    var band20 = ratio >= 0.8 && ratio <= 1.2;
    var pOk = !(pro > 0) || t.protein >= pro * 0.9;
    if (band10 && pOk) return "green";
    if (band20) return "yellow";
    return "red";
  }

  function streak(days, goals, todayKey, sessions) {
    var map = days || {};
    var sess = sessions || {};
    var key = todayKey;
    var todayBand = score(map[key], goals, sess[key]);
    if (todayBand === "grey" || todayBand === "partial") key = shift(key, -1);
    var count = 0;
    for (var i = 0; i < 400; i++) {
      if (score(map[key], goals, sess[key]) !== "green") break;
      count += 1;
      key = shift(key, -1);
    }
    return count;
  }

  function series(days, goals, endKey, n, sessions) {
    var map = days || {};
    var sess = sessions || {};
    var keys = keysEnding(endKey, n);
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var day = map[key];
      var t = totals(day);
      var bal = dayBalance(day, goals, sess[key]);
      out.push({
        key: key,
        weekday: weekday(key),
        kcal: t.kcal,
        protein: t.protein,
        carbs: t.carbs,
        fat: t.fat,
        exercise: t.exercise,
        net: t.kcal,
        target: bal.targets.calories,
        type: bal.type,
        score: score(day, goals, sess[key]),
        weight: positiveWeight(day)
      });
    }
    return out;
  }

  function insights(days, goals, endKey, sessions) {
    var map = days || {};
    var sess = sessions || {};
    var keys = keysEnding(endKey, 7);
    var logged = [];
    for (var i = 0; i < keys.length; i++) {
      if (logStatus(map[keys[i]]) === "complete") logged.push(keys[i]);
    }
    if (logged.length === 0) return [];

    var lines = [];
    var kcalSum = 0;
    var over = 0;
    var under = 0;
    var proDays = 0;
    for (var a = 0; a < logged.length; a++) {
      var loggedDay = map[logged[a]];
      var bal = dayBalance(loggedDay, goals, sess[logged[a]]);
      var eatenKcal = totals(loggedDay).kcal;
      kcalSum += eatenKcal;
      if (bal.targets.calories > 0 && eatenKcal > bal.targets.calories) over += 1;
      if (bal.targets.protein > 0) {
        proDays += 1;
        if (totals(loggedDay).protein < bal.targets.protein) under += 1;
      }
    }
    var avg = Math.round(kcalSum / logged.length);
    lines.push("Averaging " + formatInt(avg) + " kcal eaten");
    lines.push("Over that day's target on " + over + " of " + logged.length + " logged days");
    if (proDays > 0) {
      lines.push("Protein under that day's target on " + under + " of " + proDays + " logged days");
    }

    var foods = new Map();
    var seq = 0;
    for (var d = 0; d < keys.length; d++) {
      var day = map[keys[d]];
      var meals = day && day.meals && typeof day.meals === "object" ? day.meals : null;
      if (!meals) continue;
      for (var m = 0; m < MEALS.length; m++) {
        var items = Array.isArray(meals[MEALS[m]]) ? meals[MEALS[m]] : [];
        for (var j = 0; j < items.length; j++) {
          var item = items[j];
          if (!item || typeof item.name !== "string") continue;
          var name = item.name.trim();
          if (!name) continue;
          var id = name.toLowerCase();
          var found = foods.get(id);
          if (!found) {
            foods.set(id, { name: name, kcal: num(item.kcal), seq: seq });
            seq += 1;
          } else {
            found.kcal += num(item.kcal);
          }
        }
      }
    }
    var ranked = Array.from(foods.values()).filter(function (food) {
      return food.kcal > 0;
    });
    ranked.sort(function (a, b) {
      if (b.kcal !== a.kcal) return b.kcal - a.kcal;
      return a.seq - b.seq;
    });
    ranked = ranked.slice(0, 3);
    if (ranked.length > 0) {
      var parts = ranked.map(function (food) {
        return food.name + " (" + formatInt(food.kcal) + " kcal)";
      });
      lines.push("Top foods: " + parts.join(", "));
    }

    var weights = [];
    for (var w = 0; w < keys.length; w++) {
      var weight = positiveWeight(map[keys[w]]);
      if (weight !== null) weights.push(weight);
    }
    if (weights.length >= 2) {
      var change = weights[weights.length - 1] - weights[0];
      var absText = Math.abs(change).toFixed(1);
      if (absText === "0.0") lines.push("Weight steady");
      else if (change > 0) lines.push("Weight up " + absText + " kg");
      else lines.push("Weight down " + absText + " kg");
    }

    return lines;
  }

  function weightTrend(days, goals, endKey, n) {
    var map = days || {};
    var keys = keysEnding(endKey, n);
    var points = [];
    for (var i = 0; i < keys.length; i++) {
      var weight = positiveWeight(map[keys[i]]);
      if (weight !== null) points.push({ key: keys[i], weight: weight });
    }

    var weeklyKg = null;
    if (points.length >= 2) {
      var span = daySpan(points[0].key, points[points.length - 1].key);
      if (span !== 0) {
        var raw =
          (points[points.length - 1].weight - points[0].weight) / span * 7;
        weeklyKg = Number(raw.toFixed(10));
      }
    }

    var etaDays = null;
    var goalWeight = goals && goals.weight > 0 ? goals.weight : 0;
    if (weeklyKg !== null && weeklyKg !== 0 && goalWeight > 0) {
      var delta = goalWeight - points[points.length - 1].weight;
      if (delta === 0) etaDays = 0;
      else if (delta * weeklyKg < 0) etaDays = null;
      else etaDays = Math.round(Math.abs(delta) / Math.abs(weeklyKg) * 7);
    }

    return { points: points, weeklyKg: weeklyKg, etaDays: etaDays };
  }

  function copyFinite(bucket, source, dateKey) {
    if (!source || typeof source !== "object") return;
    var names = Object.keys(source);
    for (var i = 0; i < names.length; i++) {
      var value = source[names[i]];
      if (value !== null && typeof value === "object") continue;
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      bucket[names[i]] = { value: value, key: dateKey };
    }
  }

  function latestHealth(days, endKey) {
    var out = {
      body: {},
      skinfolds: {},
      circ: {},
      vitals: {},
      labs: {}
    };
    if (!days || typeof days !== "object") return out;

    var keys = [];
    var all = Object.keys(days);
    for (var i = 0; i < all.length; i++) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(all[i])) continue;
      if (all[i] <= endKey) keys.push(all[i]);
    }
    keys.sort();

    for (var d = 0; d < keys.length; d++) {
      var dateKey = keys[d];
      var day = days[dateKey];
      if (!day || typeof day !== "object") continue;
      var body = day.body;
      if (body && typeof body === "object") {
        copyFinite(out.body, body, dateKey);
        copyFinite(out.skinfolds, body.skinfolds, dateKey);
        copyFinite(out.circ, body.circ, dateKey);
      }
      copyFinite(out.vitals, day.vitals, dateKey);
      copyFinite(out.labs, day.labs, dateKey);
    }

    return out;
  }

  var STRENGTH_MET = 5.5;
  var MIN_PER_SET = 2.5;
  var LIFT_BAND = 0.25;
  var DEFAULT_BMR = 1610;
  var DEFAULT_NEAT = 1.3;
  var DEFAULT_BW = 67.6;
  var DEFAULT_TRAIN_KCAL = 2050;
  var DEFAULT_TRAIN_PROTEIN = 150;
  var DEFAULT_TRAIN_CARBS = 225;
  var DEFAULT_TRAIN_FAT = 60;
  var DEFAULT_REST_KCAL = 1650;
  var DEFAULT_REST_PROTEIN = 150;
  var DEFAULT_REST_CARBS = 130;
  var DEFAULT_REST_FAT = 60;

  function positiveNum(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
  }

  function round10(n) {
    return Math.round(n / 10) * 10;
  }

  function bandFromMid(mid) {
    var value = mid > 0 ? mid : 0;
    return {
      mid: value,
      low: value * (1 - LIFT_BAND),
      high: value * (1 + LIFT_BAND)
    };
  }

  function pointBand(mid) {
    var value = mid > 0 ? mid : 0;
    return { mid: value, low: value, high: value };
  }

  function addBands(a, b) {
    return {
      mid: (a ? a.mid : 0) + (b ? b.mid : 0),
      low: (a ? a.low : 0) + (b ? b.low : 0),
      high: (a ? a.high : 0) + (b ? b.high : 0)
    };
  }

  function formatKcalRange(band) {
    if (!band || !(band.mid > 0)) return "0 kcal";
    var lo = round10(band.low);
    var hi = round10(band.high);
    if (hi < lo) hi = lo;
    if (Math.abs(band.high - band.low) < 1 || lo === hi) return "about " + formatInt(lo) + " kcal";
    return "about " + formatInt(lo) + "–" + formatInt(hi) + " kcal";
  }

  function formatDeficit(band) {
    if (!band) return "";
    var lo = round10(band.low);
    var hi = round10(band.high);
    if (hi < lo) {
      var swap = lo;
      lo = hi;
      hi = swap;
    }
    function side(n) {
      if (n > 0) return formatInt(n) + " kcal deficit";
      if (n < 0) return formatInt(Math.abs(n)) + " kcal surplus";
      return "even";
    }
    if (lo === hi) {
      if (lo === 0) return "about even";
      return "about " + side(lo);
    }
    if (lo >= 0) return "about " + formatInt(lo) + "–" + formatInt(hi) + " kcal deficit";
    if (hi <= 0) return "about " + formatInt(Math.abs(hi)) + "–" + formatInt(Math.abs(lo)) + " kcal surplus";
    return "about " + formatInt(Math.abs(lo)) + " kcal surplus to " + formatInt(hi) + " kcal deficit";
  }

  function expenditureBase(goals) {
    var g = goals || {};
    var bmr = positiveNum(g.bmr) || DEFAULT_BMR;
    var neat = positiveNum(g.neatFactor) || DEFAULT_NEAT;
    return {
      kcal: bmr * neat,
      bmr: bmr,
      neat: neat,
      bmrDefault: !positiveNum(g.bmr),
      neatDefault: !positiveNum(g.neatFactor)
    };
  }

  function dayTargets(goals, type) {
    var g = goals || {};
    var rest = g.restDay && typeof g.restDay === "object" ? g.restDay : {};
    if (type === "rest") {
      return {
        calories: positiveNum(rest.calories) || DEFAULT_REST_KCAL,
        protein: positiveNum(rest.protein) || DEFAULT_REST_PROTEIN,
        carbs: positiveNum(rest.carbs) || DEFAULT_REST_CARBS,
        fat: positiveNum(rest.fat) || DEFAULT_REST_FAT
      };
    }
    return {
      calories: positiveNum(g.calories) || DEFAULT_TRAIN_KCAL,
      protein: positiveNum(g.protein) || DEFAULT_TRAIN_PROTEIN,
      carbs: positiveNum(g.carbs) || DEFAULT_TRAIN_CARBS,
      fat: positiveNum(g.fat) || DEFAULT_TRAIN_FAT
    };
  }

  function dayBalance(day, goals, session) {
    var kind = resolveDayType(day, session);
    var targets = dayTargets(goals, kind.type);
    var eaten = totals(day).kcal;
    return {
      type: kind.type,
      typeSource: kind.source,
      targets: targets,
      eaten: eaten,
      remaining: targets.calories > 0 ? targets.calories - eaten : null
    };
  }

  function exerciseRole(name) {
    var n = String(name || "").toLowerCase();
    if (/\b(walk|walking)\b/.test(n)) return "walk";
    if (/\bmobility\b|\bstretch(?:ing)?\b/.test(n)) return "mobility";
    if (/\bwork(?:\s|-)?shift\b|\bshift\b/.test(n) || /\bwork\b/.test(n)) return "work";
    if (/\brun(?:ning)?\b|\bjog(?:ging)?\b/.test(n)) return "run";
    return "other";
  }

  function durationMinutes(entry) {
    if (!entry || typeof entry !== "object") return null;
    if (typeof entry.durationMin === "number" && Number.isFinite(entry.durationMin) && entry.durationMin > 0) {
      return entry.durationMin;
    }
    if (typeof entry.minutes === "number" && Number.isFinite(entry.minutes) && entry.minutes > 0) {
      return entry.minutes;
    }
    return null;
  }

  function entryTrains(entry) {
    if (!entry || typeof entry !== "object") return false;
    var name = entry.name || entry.type || "";
    if (exerciseRole(name) !== "run") return false;
    var minutes = durationMinutes(entry);
    return minutes != null && minutes >= 30;
  }

  function normalizeDayType(value) {
    if (typeof value !== "string") return null;
    var v = value.trim().toLowerCase();
    if (v === "training" || v === "active" || v === "train") return "training";
    if (v === "rest" || v === "rest-day" || v === "off") return "rest";
    return null;
  }

  function eachLift(session, fn) {
    var lifts = session && session.lifts && typeof session.lifts === "object" ? session.lifts : null;
    if (!lifts) return;
    var names = Object.keys(lifts);
    for (var i = 0; i < names.length; i++) {
      if (!Array.isArray(lifts[names[i]])) continue;
      fn(names[i], lifts[names[i]]);
    }
  }

  function countSets(session) {
    var n = 0;
    eachLift(session, function (_name, sets) {
      n += sets.length;
    });
    return n;
  }

  function hasStreetSession(session) {
    if (!session || typeof session !== "object") return false;
    if (countSets(session) > 0) return true;
    if (positiveNum(session.liftKcal) > 0) return true;
    return Array.isArray(session.activities) && session.activities.length > 0;
  }

  function liftLabel(slug) {
    var key = String(slug || "").trim().toLowerCase();
    var known = {
      squat: "Squat",
      pullup: "Pull-up",
      "pull-up": "Pull-up",
      pullups: "Pull-up",
      chinup: "Chin-up",
      "chin-up": "Chin-up",
      dip: "Dip",
      dips: "Dip",
      muscleup: "Muscle-up",
      "muscle-up": "Muscle-up",
      press: "Press",
      pushup: "Push-up",
      "push-up": "Push-up",
      bench: "Bench press",
      deadlift: "Deadlift",
      rdl: "Romanian deadlift",
      row: "Row",
      hinge: "Hinge",
      lunge: "Lunge",
      ohp: "Overhead press",
      curl: "Curl"
    };
    if (known[key]) return known[key];
    if (!key) return "Exercise";
    return key.replace(/[-_]+/g, " ").replace(/\b[a-z]/g, function (c) {
      return c.toUpperCase();
    });
  }

  function isLiftNamed(name) {
    return /\b(squats?|pull-?ups?|chin-?ups?|dips?|push-?ups?|bench|deadlifts?|press(?:es)?|rows?|curls?|lunges?|hinge|ohp|rdls?|muscle-?ups?|gym|weights?|lifting|strength)\b/i.test(
      String(name || "")
    );
  }

  function resolveBodyweight(session, day, days, key, goals) {
    if (session && positiveNum(session.bw)) return session.bw;
    var own = positiveWeight(day);
    if (own != null) return own;
    var bestKey = "";
    var best = null;
    var map = days || {};
    var names = Object.keys(map);
    for (var i = 0; i < names.length; i++) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(names[i]) || names[i] > key) continue;
      var weight = positiveWeight(map[names[i]]);
      if (weight == null || names[i] < bestKey) continue;
      bestKey = names[i];
      best = weight;
    }
    if (best != null) return best;
    return DEFAULT_BW;
  }

  function strengthEstimate(session, bwKg) {
    var sets = countSets(session);
    var exercises = [];
    eachLift(session, function (name, list) {
      exercises.push({
        name: liftLabel(name),
        slug: name,
        sets: list.length,
        setList: list
      });
    });
    if (sets <= 0) return null;
    var assumed = true;
    var minutes = sets * MIN_PER_SET;
    if (
      session &&
      typeof session.durationMin === "number" &&
      Number.isFinite(session.durationMin) &&
      session.durationMin > 0
    ) {
      minutes = session.durationMin;
      assumed = false;
    }
    if (!(bwKg > 0)) {
      return {
        minutes: minutes,
        assumed: assumed,
        bwKg: null,
        missingWeight: true,
        total: pointBand(0),
        exercises: exercises
      };
    }
    var gross = STRENGTH_MET * bwKg * (minutes / 60);
    var total = bandFromMid(gross);
    for (var i = 0; i < exercises.length; i++) {
      var share = gross * (exercises[i].sets / sets);
      var band = bandFromMid(share);
      exercises[i].mid = band.mid;
      exercises[i].low = band.low;
      exercises[i].high = band.high;
    }
    return {
      minutes: minutes,
      assumed: assumed,
      bwKg: bwKg,
      missingWeight: false,
      total: total,
      exercises: exercises
    };
  }

  function loggedStrength(kcal) {
    var band = bandFromMid(kcal);
    return {
      minutes: null,
      assumed: false,
      logged: true,
      bwKg: null,
      missingWeight: false,
      total: band,
      exercises: [
        {
          name: "Strength",
          slug: "strength",
          sets: 0,
          setList: [],
          mid: band.mid,
          low: band.low,
          high: band.high
        }
      ]
    };
  }

  function runMet(km, minutes) {
    if (!(km > 0) || !(minutes > 0)) return 9.8;
    var mph = (km / 1.60934) / (minutes / 60);
    var met = mph * (9.8 / 6);
    if (met < 6) return 6;
    return Math.round(met * 10) / 10;
  }

  function metForName(name, km, minutes) {
    var n = String(name || "").toLowerCase();
    if (/jump\s*-?\s*rope|\bskipping\b/.test(n)) return 11;
    if (exerciseRole(name) === "run" || /\bjog/.test(n)) return runMet(km, minutes);
    if (exerciseRole(name) === "walk") return 3.5;
    if (exerciseRole(name) === "mobility") return 2.5;
    return STRENGTH_MET;
  }

  function workName(raw, km) {
    var label = String(raw || "").trim() || "Exercise";
    if (typeof km === "number" && Number.isFinite(km) && km > 0 && label.indexOf(String(km)) === -1) {
      label = label + " " + km + " km";
    }
    return label;
  }

  function workKey(name) {
    return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function estimateWork(name, givenKcal, minutes, km, bwKg) {
    if (givenKcal > 0) return { kcal: givenKcal, logged: true, met: null };
    if (!(minutes > 0) || !(bwKg > 0)) return null;
    var met = metForName(name, km, minutes);
    return { kcal: met * bwKg * (minutes / 60), logged: false, met: met };
  }

  function manualExercises(day, session, bwKg) {
    var covered = countSets(session) > 0 || (session && positiveNum(session.liftKcal) > 0);
    var map = {};
    var order = [];
    function add(item) {
      if (!item || !(item.kcal > 0)) return;
      var id = workKey(item.name);
      if (!id) return;
      var prev = map[id];
      if (!prev) {
        map[id] = item;
        order.push(id);
        return;
      }
      if (item.logged && !prev.logged) map[id] = item;
      else if (item.logged === prev.logged && item.kcal > prev.kcal) map[id] = item;
    }
    var list = day && Array.isArray(day.exercise) ? day.exercise : [];
    for (var i = 0; i < list.length; i++) {
      var entry = list[i];
      if (!entry || typeof entry !== "object") continue;
      if (covered && isLiftNamed(entry.name)) continue;
      var minutes = durationMinutes(entry);
      var est = estimateWork(entry.name, positiveNum(entry.kcal), minutes, entry.km, bwKg);
      if (!est) continue;
      add({
        name: workName(entry.name, entry.km),
        kcal: est.kcal,
        logged: est.logged,
        met: est.met,
        durationMin: minutes,
        source: typeof entry.source === "string" ? entry.source.trim() : "",
        role: exerciseRole(entry.name)
      });
    }
    var activities = session && Array.isArray(session.activities) ? session.activities : [];
    for (var a = 0; a < activities.length; a++) {
      var activity = activities[a];
      if (!activity || typeof activity !== "object") continue;
      var label = activity.type || activity.name;
      if (covered && isLiftNamed(label)) continue;
      var actMinutes = durationMinutes(activity);
      var actEst = estimateWork(label, positiveNum(activity.kcal), actMinutes, activity.km, bwKg);
      if (!actEst) continue;
      add({
        name: workName(label, activity.km),
        kcal: actEst.kcal,
        logged: actEst.logged,
        met: actEst.met,
        durationMin: actMinutes,
        source: "streetlifting",
        role: exerciseRole(label)
      });
    }
    var out = [];
    for (var n = 0; n < order.length; n++) out.push(map[order[n]]);
    return out;
  }

  function inferDayType(day, session) {
    if (hasStreetSession(session)) return "training";
    var list = day && Array.isArray(day.exercise) ? day.exercise : [];
    for (var i = 0; i < list.length; i++) {
      if (entryTrains(list[i])) return "training";
    }
    if (session && Array.isArray(session.activities)) {
      for (var a = 0; a < session.activities.length; a++) {
        var activity = session.activities[a];
        if (!activity || typeof activity !== "object") continue;
        var pseudo = {
          name: activity.type,
          kcal: activity.kcal,
          durationMin: activity.durationMin
        };
        if (entryTrains(pseudo)) return "training";
      }
    }
    return "rest";
  }

  function resolveDayType(day, session) {
    var override = normalizeDayType(day && day.dayType);
    if (override) return { type: override, source: "override" };
    var inferred = inferDayType(day, session);
    if (inferred === "training" && hasStreetSession(session)) return { type: "training", source: "session" };
    if (inferred === "training") return { type: "training", source: "exercise" };
    return { type: "rest", source: "rest" };
  }

  function flagText(day) {
    var status = logStatus(day);
    if (status === "empty") return "No meals";
    if (status !== "partial") return "";
    var kcal = totals(day).kcal;
    if (kcal < 500) return "Partial log, under 500 kcal";
    return "Partial log, one main meal under 1,000 kcal";
  }

  function dayKnown(day, session) {
    if (hasStreetSession(session)) return true;
    if (session && typeof session === "object") {
      if (typeof session.note === "string" && session.note.trim()) return true;
      if (positiveNum(session.bw)) return true;
    }
    if (!day || typeof day !== "object") return false;
    if (mealFill(day).slots > 0) return true;
    if (Array.isArray(day.exercise) && day.exercise.length > 0) return true;
    if (positiveWeight(day) != null) return true;
    if (typeof day.note === "string" && day.note.trim()) return true;
    if (normalizeDayType(day.dayType)) return true;
    if (day.body || day.vitals || day.labs) return true;
    return false;
  }

  function collectWeights(days) {
    var points = [];
    var map = days || {};
    var names = Object.keys(map);
    for (var i = 0; i < names.length; i++) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(names[i])) continue;
      var weight = positiveWeight(map[names[i]]);
      if (weight == null) continue;
      points.push({ key: names[i], weight: weight });
    }
    points.sort(function (a, b) {
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });
    return points;
  }

  function withMovingAverage(points, windowDays) {
    var span = windowDays > 1 ? windowDays : 7;
    var out = [];
    for (var i = 0; i < points.length; i++) {
      var start = shift(points[i].key, -(span - 1));
      var sum = 0;
      var n = 0;
      for (var j = 0; j < points.length; j++) {
        if (points[j].key < start) continue;
        if (points[j].key > points[i].key) break;
        sum += points[j].weight;
        n += 1;
      }
      out.push({
        key: points[i].key,
        weight: points[i].weight,
        average: n ? sum / n : points[i].weight
      });
    }
    return out;
  }

  function buildWorkoutDay(key, day, session, goals, days) {
    var status = logStatus(day);
    var kind = resolveDayType(day, session);
    var targets = dayTargets(goals, kind.type);
    var intake = totals(day).kcal;
    var bw = resolveBodyweight(session, day, days, key, goals);
    var strength = null;
    if (countSets(session) > 0) strength = strengthEstimate(session, bw);
    else if (session && positiveNum(session.liftKcal) > 0) strength = loggedStrength(session.liftKcal);
    var manual = manualExercises(day, session, bw);
    var manualMid = 0;
    for (var i = 0; i < manual.length; i++) manualMid += manual[i].kcal;
    var manualBand = pointBand(manualMid);
    var exercise = addBands(strength ? strength.total : pointBand(0), manualBand);
    var base = expenditureBase(goals).kcal;
    var deficit = {
      mid: base + exercise.mid - intake,
      low: base + exercise.low - intake,
      high: base + exercise.high - intake
    };
    return {
      key: key,
      weekday: weekday(key),
      label: label(key),
      type: kind.type,
      typeSource: kind.source,
      status: status,
      flag: flagText(day),
      intake: intake,
      targets: targets,
      weight: positiveWeight(day),
      strength: strength,
      manual: manual,
      exercise: exercise,
      deficit: deficit,
      countsInAverage: status === "complete",
      known: dayKnown(day, session),
      note: day && typeof day.note === "string" ? day.note.trim() : "",
      sessionNote: session && typeof session.note === "string" ? session.note.trim() : ""
    };
  }

  function workoutView(store, street, endKey, n) {
    var goals = store && store.goals && typeof store.goals === "object" ? store.goals : {};
    var days = store && store.days && typeof store.days === "object" ? store.days : {};
    var sessions =
      street && street.sessions && typeof street.sessions === "object" ? street.sessions : {};
    var count = n > 0 ? n : 14;
    var keys = keysEnding(endKey, count);
    var rows = [];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      rows.push(buildWorkoutDay(key, days[key], sessions[key], goals, days));
    }
    var weights = withMovingAverage(collectWeights(days), 7).filter(function (point) {
      return point.key >= keys[0] && point.key <= keys[keys.length - 1];
    });
    var complete = [];
    var flagged = [];
    var active = 0;
    var rest = 0;
    var liftMap = {};
    var manualMap = {};
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      if (row.type === "training") active += 1;
      else if (row.known) rest += 1;
      if (row.countsInAverage) complete.push(row);
      if (row.known && !row.countsInAverage) flagged.push(row);
      if (row.strength && Array.isArray(row.strength.exercises)) {
        for (var e = 0; e < row.strength.exercises.length; e++) {
          var ex = row.strength.exercises[e];
          if (!ex || ex.sets <= 0 && !(ex.mid > 0)) continue;
          var bucket = liftMap[ex.name] || { name: ex.name, sets: 0, sessions: 0, mid: 0, logged: !!row.strength.logged };
          bucket.sets += ex.sets;
          bucket.sessions += 1;
          bucket.mid += ex.mid || 0;
          if (row.strength.logged) bucket.logged = true;
          liftMap[ex.name] = bucket;
        }
      }
      for (var m = 0; m < row.manual.length; m++) {
        var item = row.manual[m];
        var id = item.name.toLowerCase();
        var acc = manualMap[id] || { name: item.name, kcal: 0, sessions: 0 };
        acc.kcal += item.kcal;
        acc.sessions += 1;
        manualMap[id] = acc;
      }
    }
    function byMid(a, b) {
      return b.mid - a.mid;
    }
    var lifts = Object.keys(liftMap).map(function (name) {
      var item = liftMap[name];
      item.band = bandFromMid(item.mid);
      return item;
    });
    lifts.sort(byMid);
    var manuals = Object.keys(manualMap).map(function (id) {
      return manualMap[id];
    });
    manuals.sort(function (a, b) {
      return b.kcal - a.kcal;
    });
    var intakeSum = 0;
    var deficitSum = 0;
    for (var c = 0; c < complete.length; c++) {
      intakeSum += complete[c].intake;
      deficitSum += complete[c].deficit.mid;
    }
    var base = expenditureBase(goals);
    return {
      endKey: endKey,
      days: count,
      base: base,
      active: active,
      rest: rest,
      rows: rows,
      weights: weights,
      startWeight: positiveNum(goals.startWeight) || null,
      goalWeight: positiveNum(goals.weight) || null,
      flagged: flagged,
      completeCount: complete.length,
      avgIntake: complete.length ? intakeSum / complete.length : null,
      avgDeficit: complete.length ? deficitSum / complete.length : null,
      lifts: lifts,
      manuals: manuals,
      targets: {
        training: dayTargets(goals, "training"),
        rest: dayTargets(goals, "rest")
      }
    };
  }

  function meal(name, kcal, protein, carbs, fat) {
    return { name: name, qty: "", kcal: kcal, protein: protein, carbs: carbs, fat: fat };
  }

  function sampleWorkout(endKey) {
    function on(delta) {
      return shift(endKey, delta);
    }
    var goals = {
      updatedAt: "2026-10-01T00:00:00Z",
      calories: 2050,
      protein: 160,
      carbs: 225,
      fat: 60,
      weight: 75,
      startWeight: 82
    };
    var days = {};
    var sessions = {};
    function put(delta, spec) {
      var key = on(delta);
      var entry = { updatedAt: key + "T12:00:00Z" };
      if (spec.weight) entry.weight = spec.weight;
      if (spec.note) entry.note = spec.note;
      if (spec.dayType) entry.dayType = spec.dayType;
      if (spec.meals) entry.meals = spec.meals;
      if (spec.exercise) entry.exercise = spec.exercise;
      days[key] = entry;
      if (spec.session) sessions[key] = spec.session;
    }
    var full = {
      breakfast: [meal("Oats", 420, 18, 62, 10)],
      lunch: [meal("Rice and chicken", 720, 48, 80, 18)],
      dinner: [meal("Potatoes and fish", 680, 42, 70, 20)],
      snacks: [meal("Yogurt", 150, 12, 16, 4)]
    };
    function sets(kg, reps, n, rpe) {
      var list = [];
      for (var i = 0; i < n; i++) {
        var set = { kg: kg, reps: reps };
        if (rpe) set.rpe = rpe;
        list.push(set);
      }
      return list;
    }
    put(0, {
      weight: 78.6,
      meals: full,
      session: { bw: 78.6, note: "Squat day", lifts: { squat: sets(120, 5, 4, 8), pullup: sets(20, 5, 4), dip: sets(30, 6, 3) } }
    });
    put(-1, {
      weight: 78.8,
      meals: {
        breakfast: [meal("Eggs", 380, 26, 4, 28)],
        lunch: [meal("Salad and tuna", 540, 40, 18, 28)],
        dinner: [meal("Soup and bread", 620, 24, 70, 22)],
        snacks: []
      },
      exercise: [{ name: "Walk", durationMin: 25, kcal: 90, source: "manual" }]
    });
    put(-2, {
      weight: 78.7,
      meals: full,
      exercise: [{ name: "Easy run", durationMin: 42, kcal: 480, source: "manual" }]
    });
    put(-3, {
      weight: 79.0,
      meals: { breakfast: [meal("Toast", 320, 10, 48, 8)], lunch: [], dinner: [], snacks: [] },
      note: "Left the rest of the day blank."
    });
    put(-4, {
      weight: 79.1,
      exercise: [{ name: "Run", kcal: 360, source: "manual" }]
    });
    put(-5, {
      weight: 79.2,
      meals: full,
      session: { bw: 79.2, durationMin: 70, lifts: { squat: sets(115, 5, 5), pullup: sets(15, 6, 4) } }
    });
    put(-6, {
      weight: 79.4,
      meals: {
        breakfast: [meal("Oats", 400, 16, 60, 9)],
        lunch: [meal("Pasta", 640, 28, 90, 16)],
        dinner: [meal("Chicken", 560, 46, 20, 28)],
        snacks: []
      },
      exercise: [{ name: "Mobility", durationMin: 15, kcal: 40, source: "manual" }]
    });
    put(-7, {
      weight: 79.3,
      meals: full,
      session: { bw: 79.3, lifts: { squat: sets(110, 5, 5), dip: sets(25, 8, 3) } }
    });
    put(-8, {
      weight: 79.6,
      meals: full,
      dayType: "rest",
      session: { bw: 79.6, note: "Marked rest", lifts: { pullup: sets(10, 5, 2) } }
    });
    put(-9, {
      weight: 79.5,
      meals: full,
      exercise: [{ name: "Work shift", durationMin: 480, kcal: 220, source: "manual" }]
    });
    put(-10, {
      weight: 79.8,
      meals: full,
      dayType: "training",
      exercise: [{ name: "Walk", durationMin: 40, kcal: 140, source: "manual" }]
    });
    put(-11, {
      weight: 80.0,
      meals: {
        breakfast: [meal("Oats", 500, 18, 70, 12)],
        lunch: [meal("Burger", 1100, 45, 90, 55)],
        dinner: [meal("Pasta", 900, 30, 110, 28)],
        snacks: [meal("Ice cream", 450, 8, 50, 24)]
      }
    });
    put(-12, {
      weight: 80.2,
      meals: full,
      session: { bw: 80.2, lifts: { squat: sets(105, 5, 4), pullup: sets(12, 6, 3), dip: sets(20, 8, 3) } }
    });
    put(-13, { weight: 80.4 });
    return {
      nutrition: { version: 1, goals: goals, days: days },
      streetlifting: { sessions: sessions }
    };
  }

  function sleepHours(day) {
    var value = day && day.vitals ? day.vitals.sleepHours : undefined;
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
    return null;
  }

  function sleepSeries(days, endKey, n) {
    var map = days || {};
    var keys = keysEnding(endKey, n);
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      out.push({
        key: keys[i],
        hours: sleepHours(map[keys[i]])
      });
    }
    return out;
  }

  function sleepStreak(days, goal, endKey) {
    if (typeof goal !== "number" || !Number.isFinite(goal) || goal <= 0) return 0;
    var map = days || {};
    var key = endKey;
    if (sleepHours(map[key]) === null) key = shift(key, -1);
    var count = 0;
    for (var i = 0; i < 3660; i++) {
      var hours = sleepHours(map[key]);
      if (hours === null || hours < goal) break;
      count += 1;
      key = shift(key, -1);
    }
    return count;
  }

  var NutritionCore = {
    MEALS: MEALS,
    blankStore: blankStore,
    dayKey: dayKey,
    shift: shift,
    label: label,
    weekday: weekday,
    monthGrid: monthGrid,
    totals: totals,
    score: score,
    streak: streak,
    series: series,
    insights: insights,
    weightTrend: weightTrend,
    latestHealth: latestHealth,
    sleepSeries: sleepSeries,
    sleepStreak: sleepStreak,
    logStatus: logStatus,
    dayBalance: dayBalance,
    expenditureBase: expenditureBase,
    dayTargets: dayTargets,
    exerciseRole: exerciseRole,
    entryTrains: entryTrains,
    strengthEstimate: strengthEstimate,
    formatKcalRange: formatKcalRange,
    formatDeficit: formatDeficit,
    workoutView: workoutView,
    sampleWorkout: sampleWorkout
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = NutritionCore;
  }
  if (typeof window !== "undefined") {
    window.NutritionCore = NutritionCore;
  }
})();

if (typeof module !== "undefined" && require.main === module) {
  var assert = require("assert");
  var NutritionCore = module.exports;

  var days = {
    "2026-08-20": { body: { bodyFat: 10.8, skinfolds: { abdominal: 17 }, circ: { waist: 79.5 } } },
    "2026-09-01": { body: { bodyFat: 11 } },
    "2026-10-01": { body: { bodyFat: 12 } }
  };
  var health = NutritionCore.latestHealth(days, "2026-09-15");
  assert.strictEqual(health.body.bodyFat.value, 11);
  assert.strictEqual(health.body.bodyFat.key, "2026-09-01");
  assert.strictEqual(health.skinfolds.abdominal.value, 17);
  assert.strictEqual(health.skinfolds.abdominal.key, "2026-08-20");
  assert.strictEqual(health.circ.waist.value, 79.5);
  assert.strictEqual(health.circ.waist.key, "2026-08-20");
  assert.deepStrictEqual(health.vitals, {});
  assert.deepStrictEqual(health.labs, {});
  var groups = ["body", "skinfolds", "circ", "vitals", "labs"];
  var g;
  var names;
  var n;
  for (g = 0; g < groups.length; g++) {
    names = Object.keys(health[groups[g]]);
    for (n = 0; n < names.length; n++) {
      assert.notStrictEqual(health[groups[g]][names[n]].key, "2026-10-01");
    }
  }

  assert.strictEqual(
    NutritionCore.logStatus({ exercise: [{ name: "Run", kcal: 400 }] }),
    "empty"
  );
  assert.strictEqual(
    NutritionCore.logStatus({
      meals: { breakfast: [{ name: "Toast", kcal: 320 }], lunch: [], dinner: [], snacks: [] }
    }),
    "partial"
  );
  assert.strictEqual(
    NutritionCore.logStatus({
      meals: {
        breakfast: [{ name: "Oats", kcal: 400 }],
        lunch: [{ name: "Rice", kcal: 700 }],
        dinner: [{ name: "Fish", kcal: 600 }],
        snacks: []
      }
    }),
    "complete"
  );
  assert.strictEqual(
    NutritionCore.score({ exercise: [{ name: "Gym", kcal: 300 }] }, { calories: 2050, protein: 160 }),
    "grey"
  );
  assert.strictEqual(
    NutritionCore.score(
      { meals: { breakfast: [{ name: "Toast", kcal: 320, protein: 10 }] } },
      { calories: 2050, protein: 160 }
    ),
    "partial"
  );

  var avgDays = {};
  avgDays["2026-10-06"] = {
    meals: {
      breakfast: [{ name: "Oats", kcal: 400, protein: 20 }],
      lunch: [{ name: "Rice", kcal: 700, protein: 40 }],
      dinner: [{ name: "Fish", kcal: 600, protein: 40 }],
      snacks: []
    }
  };
  avgDays["2026-10-05"] = { exercise: [{ name: "Run", kcal: 500 }] };
  avgDays["2026-10-04"] = {
    meals: { breakfast: [{ name: "Toast", kcal: 200 }], lunch: [], dinner: [], snacks: [] }
  };
  var avgLines = NutritionCore.insights(avgDays, { calories: 2050, protein: 100 }, "2026-10-06");
  assert.ok(avgLines[0].indexOf("1,700") !== -1);

  var est = NutritionCore.strengthEstimate(
    {
      lifts: {
        squat: [{ kg: 100, reps: 5 }, { kg: 100, reps: 5 }, { kg: 100, reps: 5 }, { kg: 100, reps: 5 }, { kg: 100, reps: 5 }],
        pullup: [{ kg: 20, reps: 5 }, { kg: 20, reps: 5 }, { kg: 20, reps: 5 }]
      }
    },
    80
  );
  var expectGross = 5.5 * 80 * ((8 * 2.5) / 60);
  assert.strictEqual(est.assumed, true);
  assert.strictEqual(est.minutes, 20);
  assert.ok(Math.abs(est.total.mid - expectGross) < 1e-9);
  assert.ok(Math.abs(expectGross - (440 / 3)) < 1e-9);
  assert.strictEqual(est.exercises[0].name, "Squat");
  assert.ok(Math.abs(est.exercises[0].mid - expectGross * (5 / 8)) < 1e-9);
  assert.ok(Math.abs(est.exercises[1].mid - expectGross * (3 / 8)) < 1e-9);
  assert.strictEqual(NutritionCore.formatKcalRange(est.total), "about 110–180 kcal");
  assert.ok(Math.abs(est.total.low - expectGross * 0.75) < 1e-9);
  assert.ok(Math.abs(est.total.high - expectGross * 1.25) < 1e-9);

  var timed = NutritionCore.strengthEstimate(
    { durationMin: 60, lifts: { dip: [{ kg: 40, reps: 5 }] } },
    80
  );
  assert.strictEqual(timed.assumed, false);
  assert.strictEqual(timed.minutes, 60);
  assert.ok(Math.abs(timed.total.mid - 5.5 * 80) < 1e-9);

  assert.strictEqual(NutritionCore.exerciseRole("Lunch walk"), "walk");
  assert.strictEqual(NutritionCore.exerciseRole("Workout"), "other");
  assert.strictEqual(NutritionCore.entryTrains({ name: "Walk", durationMin: 60, kcal: 200 }), false);
  assert.strictEqual(NutritionCore.entryTrains({ name: "Mobility", kcal: 40 }), false);
  assert.strictEqual(NutritionCore.entryTrains({ name: "Work shift", durationMin: 480, kcal: 220 }), false);
  assert.strictEqual(NutritionCore.entryTrains({ name: "Easy run", durationMin: 42, kcal: 480 }), true);
  assert.strictEqual(NutritionCore.entryTrains({ name: "Run", durationMin: 20, kcal: 200 }), false);
  assert.strictEqual(NutritionCore.entryTrains({ name: "Run", kcal: 360 }), false);
  assert.strictEqual(NutritionCore.entryTrains({ name: "Bike", kcal: 250 }), false);
  assert.strictEqual(NutritionCore.entryTrains({ name: "Bike", durationMin: 20, kcal: 150 }), false);
  assert.strictEqual(NutritionCore.entryTrains({ name: "Jump rope", kcal: 125 }), false);

  var customBase = NutritionCore.expenditureBase({ bmr: 1700, neatFactor: 1.2 });
  assert.strictEqual(customBase.kcal, 2040);
  var defaultBase = NutritionCore.expenditureBase({});
  assert.ok(Math.abs(defaultBase.kcal - 1610 * 1.3) < 1e-9);
  var restTargets = NutritionCore.dayTargets({}, "rest");
  assert.strictEqual(restTargets.calories, 1650);
  assert.strictEqual(restTargets.protein, 150);
  assert.strictEqual(restTargets.carbs, 130);
  assert.strictEqual(restTargets.fat, 60);
  var restOverride = NutritionCore.dayTargets(
    { restDay: { calories: 1700, carbs: 140 }, calories: 2050, protein: 160, carbs: 225, fat: 70 },
    "rest"
  );
  assert.strictEqual(restOverride.calories, 1700);
  assert.strictEqual(restOverride.protein, 150);
  assert.strictEqual(restOverride.carbs, 140);
  assert.strictEqual(restOverride.fat, 60);
  var trainTargets = NutritionCore.dayTargets({ calories: 2050, carbs: 225 }, "training");
  assert.strictEqual(trainTargets.calories, 2050);
  assert.strictEqual(trainTargets.carbs, 225);
  var trainFallback = NutritionCore.dayTargets({}, "training");
  assert.strictEqual(trainFallback.calories, 2050);
  assert.strictEqual(trainFallback.protein, 150);
  assert.strictEqual(trainFallback.carbs, 225);
  assert.strictEqual(trainFallback.fat, 60);

  var sample = NutritionCore.sampleWorkout("2026-10-06");
  var view = NutritionCore.workoutView(sample.nutrition, sample.streetlifting, "2026-10-06", 14);
  assert.strictEqual(view.rows.length, 14);
  assert.strictEqual(view.rows[13].type, "training");
  assert.strictEqual(view.rows[13].status, "complete");
  assert.strictEqual(view.rows[12].type, "rest");
  assert.strictEqual(view.rows[11].type, "training");
  assert.strictEqual(view.rows[10].status, "partial");
  assert.strictEqual(view.rows[10].flag.indexOf("Partial") === 0, true);
  assert.strictEqual(view.rows[9].status, "empty");
  assert.strictEqual(view.rows[9].type, "rest");
  assert.strictEqual(view.rows[9].countsInAverage, false);
  assert.strictEqual(view.rows[5].type, "rest");
  assert.strictEqual(view.rows[5].typeSource, "override");
  assert.ok(view.rows[5].exercise.mid > 0);
  assert.strictEqual(view.rows[4].type, "rest");
  assert.strictEqual(view.rows[3].type, "training");
  assert.strictEqual(view.rows[3].typeSource, "override");
  assert.ok(view.weights.length >= 2);
  assert.ok(view.weights[view.weights.length - 1].average > 0);
  assert.strictEqual(view.startWeight, 82);
  assert.strictEqual(view.goalWeight, 75);
  assert.ok(view.flagged.length >= 3);
  assert.ok(view.completeCount < 14);
  assert.ok(view.lifts.length >= 1);
  var squat = null;
  for (var s = 0; s < view.lifts.length; s++) {
    if (view.lifts[s].name === "Squat") squat = view.lifts[s];
  }
  assert.ok(squat && squat.sets >= 4);
  assert.ok(view.avgDeficit != null);
  var todayRow = view.rows[13];
  var todayGross = 5.5 * 78.6 * ((11 * 2.5) / 60);
  assert.ok(Math.abs(todayRow.exercise.mid - todayGross) < 1e-6);
  assert.ok(Math.abs(todayRow.deficit.mid - (1610 * 1.3 + todayGross - 1970)) < 1e-6);
  assert.ok(todayRow.deficit.high > todayRow.deficit.low);

  var wider = NutritionCore.workoutView(sample.nutrition, sample.streetlifting, "2026-10-06", 16);
  assert.strictEqual(wider.rows[0].known, false);
  assert.strictEqual(wider.rows[0].countsInAverage, false);
  assert.strictEqual(wider.flagged.indexOf(wider.rows[0]), -1);
  assert.ok(wider.flagged.length === view.flagged.length);

  var acceptGoals = {
    calories: 2050,
    protein: 150,
    carbs: 225,
    fat: 60,
    restDay: { calories: 1650, protein: 150, carbs: 130, fat: 60 }
  };
  var acceptDay = {
    meals: {
      breakfast: [{ name: "Breakfast", kcal: 500, protein: 40 }],
      lunch: [{ name: "Lunch", kcal: 800, protein: 50 }],
      dinner: [{ name: "Dinner", kcal: 600, protein: 45 }],
      snacks: [{ name: "Snack", kcal: 187, protein: 20 }]
    }
  };
  var acceptSession = {
    bw: 70,
    lifts: {
      pullup: [
        { kg: 20, reps: 5 },
        { kg: 20, reps: 5 },
        { kg: 20, reps: 5 },
        { kg: 20, reps: 5 }
      ]
    },
    activities: [{ type: "Jump rope", kcal: 125 }]
  };
  var acceptBal = NutritionCore.dayBalance(acceptDay, acceptGoals, acceptSession);
  assert.strictEqual(acceptBal.eaten, 2087);
  assert.strictEqual(acceptBal.type, "training");
  assert.strictEqual(acceptBal.typeSource, "session");
  assert.strictEqual(acceptBal.targets.calories, 2050);
  assert.strictEqual(acceptBal.remaining, -37);
  var acceptView = NutritionCore.workoutView(
    { version: 1, goals: acceptGoals, days: { "2026-10-06": acceptDay } },
    { sessions: { "2026-10-06": acceptSession } },
    "2026-10-06",
    1
  );
  var acceptRow = acceptView.rows[0];
  assert.strictEqual(acceptRow.key, "2026-10-06");
  assert.strictEqual(acceptRow.intake, 2087);
  assert.strictEqual(acceptRow.targets.calories, 2050);
  var rope = null;
  var ropeI;
  for (ropeI = 0; ropeI < acceptRow.manual.length; ropeI++) {
    if (acceptRow.manual[ropeI].name === "Jump rope") rope = acceptRow.manual[ropeI];
  }
  assert.ok(rope);
  assert.strictEqual(rope.kcal, 125);
  assert.strictEqual(rope.logged, true);
  var liftMid = 5.5 * 70 * ((4 * 2.5) / 60);
  assert.ok(Math.abs(acceptRow.strength.total.mid - liftMid) < 1e-6);
  assert.ok(Math.abs(acceptRow.exercise.mid - (liftMid + 125)) < 1e-6);
  assert.ok(Math.abs(acceptRow.deficit.mid - (1610 * 1.3 + liftMid + 125 - 2087)) < 1e-6);
  assert.ok(Math.abs(acceptRow.deficit.mid - (2400 + liftMid + 125 - 2087)) > 1);

  var shortRun = NutritionCore.dayBalance(
    { exercise: [{ name: "Run", durationMin: 25, kcal: 200 }] },
    acceptGoals,
    null
  );
  assert.strictEqual(shortRun.type, "rest");
  assert.strictEqual(shortRun.targets.calories, 1650);
  var longRun = NutritionCore.dayBalance(
    { exercise: [{ name: "Easy run", durationMin: 40, kcal: 400 }] },
    acceptGoals,
    null
  );
  assert.strictEqual(longRun.type, "training");
  assert.strictEqual(longRun.targets.calories, 2050);
  var forcedRest = NutritionCore.dayBalance(
    { dayType: "rest" },
    acceptGoals,
    acceptSession
  );
  assert.strictEqual(forcedRest.type, "rest");
  assert.strictEqual(forcedRest.targets.calories, 1650);

  var eatBackDay = {
    meals: {
      breakfast: [{ name: "Big", kcal: 2500, protein: 200 }],
      lunch: [],
      dinner: [],
      snacks: []
    },
    exercise: [{ name: "Jump rope", kcal: 800 }]
  };
  assert.strictEqual(NutritionCore.logStatus(eatBackDay), "complete");
  assert.strictEqual(NutritionCore.totals(eatBackDay).kcal, 2500);
  assert.strictEqual(NutritionCore.dayBalance(eatBackDay, acceptGoals, null).type, "rest");
  assert.strictEqual(NutritionCore.dayBalance(eatBackDay, acceptGoals, null).remaining, 1650 - 2500);
  assert.strictEqual(NutritionCore.score(eatBackDay, acceptGoals, null), "red");
  var eatBackTrain = NutritionCore.dayBalance(eatBackDay, acceptGoals, acceptSession);
  assert.strictEqual(eatBackTrain.type, "training");
  assert.strictEqual(eatBackTrain.eaten, 2500);
  assert.strictEqual(eatBackTrain.remaining, 2050 - 2500);
  assert.strictEqual(NutritionCore.score(eatBackDay, acceptGoals, acceptSession), "red");

  var fallbackBw = NutritionCore.workoutView(
    {
      goals: {},
      days: {
        "2026-10-06": {
          meals: {
            breakfast: [{ name: "A", kcal: 600 }],
            lunch: [{ name: "B", kcal: 600 }],
            dinner: [],
            snacks: []
          }
        }
      }
    },
    { sessions: { "2026-10-06": { lifts: { pullup: [{ kg: 10, reps: 5 }] } } } },
    "2026-10-06",
    1
  );
  assert.ok(Math.abs(fallbackBw.rows[0].strength.total.mid - 5.5 * 67.6 * (2.5 / 60)) < 1e-6);
  assert.ok(Math.abs(fallbackBw.rows[0].deficit.mid - (1610 * 1.3 + 5.5 * 67.6 * (2.5 / 60) - 1200)) < 1e-6);

  var sleepDays = {
    "2026-10-01": { vitals: { sleepHours: 8 } },
    "2026-10-02": { vitals: { sleepHours: 8.5 } },
    "2026-10-03": { vitals: { sleepHours: 9 } },
    "2026-10-04": { vitals: { sleepHours: 6 } },
    "2026-10-05": { vitals: { sleepHours: 8 } },
    "2026-10-06": { vitals: { sleepHours: 8 } }
  };
  assert.strictEqual(NutritionCore.sleepStreak(sleepDays, 8, "2026-10-03"), 3);
  assert.strictEqual(NutritionCore.sleepStreak(sleepDays, 8, "2026-10-04"), 0);
  assert.strictEqual(NutritionCore.sleepStreak(sleepDays, 8, "2026-10-06"), 2);
  assert.strictEqual(NutritionCore.sleepStreak(sleepDays, 8, "2026-10-07"), 2);

  var gappedSleep = {};
  var sleepKeyList = Object.keys(sleepDays);
  var si;
  for (si = 0; si < sleepKeyList.length; si++) {
    gappedSleep[sleepKeyList[si]] = sleepDays[sleepKeyList[si]];
  }
  delete gappedSleep["2026-10-02"];
  assert.strictEqual(NutritionCore.sleepStreak(gappedSleep, 8, "2026-10-03"), 1);

  var sleepWindow = NutritionCore.sleepSeries(sleepDays, "2026-10-03", 3);
  assert.strictEqual(sleepWindow.length, 3);
  assert.strictEqual(sleepWindow[0].hours, 8);
  assert.strictEqual(sleepWindow[1].hours, 8.5);
  assert.strictEqual(sleepWindow[2].hours, 9);

  var emptySleep = NutritionCore.sleepSeries({}, "2026-10-03", 2);
  assert.strictEqual(emptySleep[0].hours, null);
  assert.strictEqual(emptySleep[1].hours, null);
}
