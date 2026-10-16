/* Read-only nutrition log. A GitHub load replaces the copy on this device. */
(function () {
  "use strict";

  var STORE_KEY = "nutrition-v1";
  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var SCORE = {
    green: "🟢 On target",
    yellow: "🟡 Close",
    red: "🔴 Off target",
    grey: "⚪ No log",
    partial: "⚪ Partial log"
  };
  var SVGNS = "http://www.w3.org/2000/svg";
  var GREEN = "hsl(152 55% 40%)";
  var RED = "hsl(4 80% 56%)";

  var syncEl = document.getElementById("sync-label");
  if (
    typeof NutritionCore === "undefined" ||
    typeof GhSync === "undefined" ||
    typeof GhSync.load !== "function"
  ) {
    if (syncEl) syncEl.textContent = "Not synced";
    return;
  }

  var els = {
    sync: syncEl,
    ring: document.getElementById("ring"),
    period: document.getElementById("period-label"),
    remain: document.getElementById("remain-line"),
    score: document.getElementById("score-line"),
    prev: document.getElementById("prev"),
    today: document.getElementById("today"),
    next: document.getElementById("next"),
    main: document.getElementById("main"),
    connect: document.getElementById("connect"),
    connectBtn: document.getElementById("btn-connect")
  };

  var store = readStore();
  var streetlifting = { sessions: {} };
  var range = 7;
  var loading = false;

  function fmt(n) {
    return Math.round(Number(n) || 0).toLocaleString("en-GB");
  }

  function kgText(n) {
    var v = Math.round(Math.abs(n) * 10) / 10;
    return v.toLocaleString("en-GB", { maximumFractionDigits: 1 });
  }

  function hhmm() {
    var now = new Date();
    return String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  }

  function node(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    return el;
  }

  function button(className, text) {
    var el = node("button", className, text);
    el.type = "button";
    return el;
  }

  function svg(tag) {
    return document.createElementNS(SVGNS, tag);
  }

  function card(title, extra) {
    var section = node("section", extra ? "card " + extra : "card");
    section.appendChild(node("h3", "", title));
    return section;
  }

  function cap(name) {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  function hashKey() {
    var raw = location.hash.replace(/^#/, "");
    try {
      raw = decodeURIComponent(raw);
    } catch (e) {}
    return raw;
  }

  function isDayKey(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
    var y = +key.slice(0, 4);
    var m = +key.slice(5, 7);
    var d = +key.slice(8, 10);
    var date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  }

  function readStore() {
    try {
      var data = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (data && data.version === 1 && data.days && typeof data.days === "object") {
        if (!data.goals) data.goals = NutritionCore.blankStore().goals;
        return data;
      }
    } catch (e) {}
    return NutritionCore.blankStore();
  }

  function persist() {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  }

  function hasToken() {
    try {
      var cfg = JSON.parse(localStorage.getItem("dong-gh-sync") || "null");
      return !!(cfg && cfg.token);
    } catch (e) {
      return false;
    }
  }

  function showConnect() {
    els.connect.hidden = hasToken();
  }

  function guide(y) {
    var line = svg("line");
    line.setAttribute("x1", "0");
    line.setAttribute("x2", "300");
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));
    line.setAttribute("class", "guide");
    line.setAttribute("stroke-dasharray", "4 3");
    line.setAttribute("stroke-width", "1.5");
    return line;
  }

  function calorieChart(series) {
    var wrap = node("div", "chart");
    var board = svg("svg");
    var maxK = 0;
    var targets = [];
    var n = series.length;
    var gap = n > 10 ? 2 : 4;
    var bw = n ? (300 - gap * (n - 1)) / n : 0;
    var same;
    var guideCal;
    var maxScale;
    board.setAttribute("viewBox", "0 0 300 120");
    series.forEach(function (day) {
      var k = day && typeof day.kcal === "number" ? day.kcal : 0;
      var t = day && typeof day.target === "number" ? day.target : 0;
      if (k > maxK) maxK = k;
      if (t > 0) targets.push(t);
    });
    same = targets.length > 0;
    targets.forEach(function (t) {
      if (t !== targets[0]) same = false;
    });
    guideCal = same ? targets[0] : 0;
    maxScale = Math.max(guideCal, maxK, 1);
    targets.forEach(function (t) {
      if (t > maxScale) maxScale = t;
    });
    series.forEach(function (day, idx) {
      var kcal = day && typeof day.kcal === "number" ? day.kcal : 0;
      var goal = day && typeof day.target === "number" ? day.target : 0;
      var h = (Math.max(kcal, 0) / maxScale) * 120;
      var rect = svg("rect");
      var title = svg("title");
      rect.setAttribute("x", String(idx * (bw + gap)));
      rect.setAttribute("y", String(120 - h));
      rect.setAttribute("width", String(bw));
      rect.setAttribute("height", String(h));
      rect.setAttribute("fill", goal > 0 && kcal > goal ? RED : GREEN);
      title.textContent = (day && day.key ? day.key + " " : "") + fmt(kcal) + " kcal";
      rect.appendChild(title);
      board.appendChild(rect);
    });
    if (guideCal > 0) board.appendChild(guide(120 - (guideCal / maxScale) * 120));
    wrap.appendChild(board);
    return wrap;
  }

  function sleepChart(series, goalH) {
    var wrap = node("div", "chart");
    var board = svg("svg");
    var maxH = 0;
    var n = series.length;
    var gap = n > 10 ? 2 : 4;
    var bw = n ? (300 - gap * (n - 1)) / n : 0;
    var maxScale;
    board.setAttribute("viewBox", "0 0 300 120");
    series.forEach(function (day) {
      var h = day && typeof day.hours === "number" ? day.hours : 0;
      if (h > maxH) maxH = h;
    });
    maxScale = Math.max(goalH, maxH, 1);
    series.forEach(function (day, idx) {
      var hours = day ? day.hours : null;
      var h;
      var rect;
      var title;
      if (hours === null || typeof hours !== "number") return;
      h = (hours / maxScale) * 120;
      rect = svg("rect");
      title = svg("title");
      rect.setAttribute("x", String(idx * (bw + gap)));
      rect.setAttribute("y", String(120 - h));
      rect.setAttribute("width", String(bw));
      rect.setAttribute("height", String(h));
      rect.setAttribute("fill", goalH <= 0 || hours >= goalH ? GREEN : RED);
      title.textContent = day.key + " " + hours + " h";
      rect.appendChild(title);
      board.appendChild(rect);
    });
    if (goalH > 0) board.appendChild(guide(120 - (goalH / maxScale) * 120));
    wrap.appendChild(board);
    return wrap;
  }

  function weightChart(series, points, goalW) {
    var vals = [];
    var slot = {};
    var min;
    var max;
    var coords = [];
    var wrap = node("div", "chart");
    var board = svg("svg");
    var poly = svg("polyline");
    points.forEach(function (point) {
      if (point && typeof point.weight === "number") vals.push(point.weight);
    });
    if (!vals.length) return null;
    min = vals[0];
    max = vals[0];
    vals.forEach(function (w) {
      if (w < min) min = w;
      if (w > max) max = w;
    });
    if (goalW > 0) {
      if (goalW < min) min = goalW;
      if (goalW > max) max = goalW;
    }
    if (min === max) {
      min -= 1;
      max += 1;
    }
    series.forEach(function (day, i) {
      if (day && day.key) slot[day.key] = i;
    });
    function yOf(w) {
      return 8 + (1 - (w - min) / (max - min)) * 84;
    }
    function xOf(i, count) {
      return count <= 1 ? 150 : 6 + (i / (count - 1)) * 288;
    }
    points.forEach(function (point, i) {
      var at;
      var x;
      var y;
      var dot;
      var title;
      if (!point || typeof point.weight !== "number") return;
      at = point.key != null && slot[point.key] != null ? slot[point.key] : i;
      x = xOf(at, series.length || points.length);
      y = yOf(point.weight);
      coords.push(x.toFixed(1) + "," + y.toFixed(1));
      dot = svg("circle");
      title = svg("title");
      dot.setAttribute("cx", x.toFixed(1));
      dot.setAttribute("cy", y.toFixed(1));
      dot.setAttribute("r", "4");
      dot.setAttribute("fill", GREEN);
      title.textContent = (point.key ? point.key + " " : "") + kgText(point.weight) + " kg";
      dot.appendChild(title);
      board.appendChild(dot);
    });
    board.setAttribute("viewBox", "0 0 300 100");
    poly.setAttribute("fill", "none");
    poly.setAttribute("stroke", GREEN);
    poly.setAttribute("stroke-width", "2");
    poly.setAttribute("stroke-linejoin", "round");
    poly.setAttribute("stroke-linecap", "round");
    poly.setAttribute("points", coords.join(" "));
    if (coords.length >= 2) board.insertBefore(poly, board.firstChild);
    if (goalW > 0) board.appendChild(guide(yOf(goalW)));
    wrap.appendChild(board);
    return wrap;
  }

  function macroRow(label, total, goal) {
    var row = node("div", goal > 0 && total > goal ? "macro over" : "macro");
    var nums = node("div", "nums");
    var bar = node("div", "bar");
    var fill = document.createElement("i");
    row.appendChild(node("span", "name", label));
    nums.appendChild(node("span", "", goal > 0 ? fmt(total) + " / " + fmt(goal) + " g" : fmt(total) + " g"));
    row.appendChild(nums);
    fill.style.width = (goal > 0 ? Math.min(100, (total / goal) * 100) : 0) + "%";
    bar.appendChild(fill);
    row.appendChild(bar);
    return row;
  }

  function sessionsMap() {
    return streetlifting && streetlifting.sessions && typeof streetlifting.sessions === "object"
      ? streetlifting.sessions
      : {};
  }

  function workoutKcalText(item) {
    if (!item || !(item.kcal > 0)) return "";
    if (item.logged) return fmt(item.kcal) + " kcal";
    return "about " + fmt(item.kcal) + " kcal";
  }

  function workoutCard(key) {
    var view;
    var row;
    var section;
    var shown = false;
    if (typeof NutritionCore.workoutView !== "function") return null;
    view = NutritionCore.workoutView(store, streetlifting, key, 1);
    row = view && view.rows ? view.rows[view.rows.length - 1] : null;
    if (!row || row.key !== key) return null;
    section = card("Workout");
    if (row.strength && Array.isArray(row.strength.exercises)) {
      row.strength.exercises.forEach(function (ex) {
        var line;
        var burned;
        if (!ex) return;
        line = node("div", "ex-row");
        line.appendChild(node("span", "", ex.name || "Strength"));
        burned = node(
          "span",
          "kcal",
          row.strength.missingWeight ? "No bodyweight" : NutritionCore.formatKcalRange({
            mid: ex.mid,
            low: ex.low,
            high: ex.high
          })
        );
        burned.style.gridColumn = "3";
        line.appendChild(burned);
        section.appendChild(line);
        shown = true;
      });
    }
    (row.manual || []).forEach(function (item) {
      var line;
      var burned;
      var text = workoutKcalText(item);
      if (!text) return;
      line = node("div", "ex-row");
      line.appendChild(node("span", "", item.name || "Exercise"));
      burned = node("span", "kcal", text);
      burned.style.gridColumn = "3";
      line.appendChild(burned);
      section.appendChild(line);
      shown = true;
    });
    if (!shown) return null;
    section.appendChild(node("p", "chart-label", "Shown separately. Not subtracted from eaten."));
    return section;
  }

  function acceptStreetlifting(remote) {
    if (remote && typeof remote === "object" && remote.sessions && typeof remote.sessions === "object") {
      streetlifting = remote;
      return;
    }
    streetlifting = { sessions: {} };
  }

  function loadStreetlifting() {
    return GhSync.load("streetlifting", acceptStreetlifting).then(function (msg) {
      if (msg === "Nothing saved on GitHub yet") streetlifting = { sessions: {} };
    });
  }

  function weightHistory(endKey) {
    var source = store.days && typeof store.days === "object" ? store.days : {};
    var list = [];
    Object.keys(source).forEach(function (dayKey) {
      var w;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || dayKey > endKey) return;
      w = source[dayKey] && source[dayKey].weight;
      if (typeof w !== "number" || !isFinite(w) || w <= 0) return;
      list.push({ key: dayKey, weight: w });
    });
    list.sort(function (a, b) {
      if (a.key < b.key) return -1;
      if (a.key > b.key) return 1;
      return 0;
    });
    return list;
  }

  function bodyHealthCard(key) {
    var specs = {
      body: [
        ["bodyFat", "Body fat", "%"],
        ["fatMassKg", "Fat mass", "kg"],
        ["leanMassKg", "Lean mass", "kg"],
        ["muscleMassKg", "Muscle mass", "kg"],
        ["metabolicAge", "Metabolic age", "y"],
        ["visceralFat", "Visceral fat", ""],
        ["waterPct", "Body water", "%"]
      ],
      skinfolds: [
        ["triceps", "Triceps", "mm"],
        ["biceps", "Biceps", "mm"],
        ["subscapular", "Subscapular", "mm"],
        ["suprailiac", "Suprailiac", "mm"],
        ["abdominal", "Abdominal", "mm"],
        ["supraspinal", "Supraspinal", "mm"],
        ["thigh", "Thigh", "mm"],
        ["calf", "Calf", "mm"]
      ],
      circ: [
        ["armRelaxedR", "Arm relaxed R", "cm"],
        ["armRelaxedL", "Arm relaxed L", "cm"],
        ["armFlexedR", "Arm flexed R", "cm"],
        ["armFlexedL", "Arm flexed L", "cm"],
        ["thighR", "Thigh R", "cm"],
        ["thighL", "Thigh L", "cm"],
        ["calfR", "Calf R", "cm"],
        ["calfL", "Calf L", "cm"],
        ["waist", "Waist", "cm"],
        ["glutes", "Glutes", "cm"]
      ],
      vitals: [
        ["restingHr", "Resting HR", "bpm"],
        ["bpSys", "BP systolic", "mmHg"],
        ["bpDia", "BP diastolic", "mmHg"]
      ],
      labs: [
        ["glucose", "Glucose", "mmol/L"],
        ["hba1c", "HbA1c", "%"],
        ["ldl", "LDL", "mmol/L"],
        ["hdl", "HDL", "mmol/L"],
        ["triglycerides", "Triglycerides", "mmol/L"],
        ["alt", "ALT", "U/L"],
        ["ast", "AST", "U/L"]
      ]
    };
    var health = typeof NutritionCore.latestHealth === "function" ? NutritionCore.latestHealth(store.days, key) : null;
    var profile = store.profile;
    var section = node("details", "card");
    var shown = false;

    function qty(n, unit) {
      var text = String(Math.round(n * 10) / 10);
      return unit ? text + " " + unit : text;
    }

    function row(label, amount, date) {
      var line = node("div", "item");
      line.appendChild(node("span", "", label));
      line.appendChild(node("span", "qty", amount));
      line.appendChild(node("span", "kcal", date || ""));
      return line;
    }

    function ok(leaf) {
      return !!(leaf && typeof leaf === "object" && typeof leaf.value === "number" && isFinite(leaf.value));
    }

    section.appendChild(node("summary", "", "Body & health"));
    if (!health || typeof health !== "object") {
      health = { body: {}, skinfolds: {}, circ: {}, vitals: {}, labs: {} };
    }
    if (profile && typeof profile === "object") {
      if (typeof profile.heightCm === "number" && isFinite(profile.heightCm)) {
        shown = true;
        section.appendChild(row("Height", qty(profile.heightCm, "cm"), ""));
      }
      [
        ["birthYear", "Birth year"],
        ["sex", "Sex"],
        ["activity", "Activity"]
      ].forEach(function (field) {
        var value = profile[field[0]];
        var amount = null;
        if (typeof value === "number" && isFinite(value)) amount = qty(value, "");
        else if (typeof value === "string" && value.trim()) amount = value.trim();
        if (amount == null) return;
        shown = true;
        section.appendChild(row(field[1], amount, ""));
      });
    }
    [
      ["Composition", "body"],
      ["Skinfolds", "skinfolds"],
      ["Circumferences", "circ"],
      ["Vitals", "vitals"],
      ["Labs", "labs"]
    ].forEach(function (pair) {
      var group = health[pair[1]];
      var known = {};
      var keys = [];
      var head;
      if (!group || typeof group !== "object") return;
      specs[pair[1]].forEach(function (item) {
        known[item[0]] = item;
        if (ok(group[item[0]])) keys.push(item[0]);
      });
      Object.keys(group).forEach(function (name) {
        if (!known[name] && ok(group[name])) keys.push(name);
      });
      if (!keys.length) return;
      shown = true;
      head = node("div", "meal-head");
      head.appendChild(node("h4", "", pair[0]));
      section.appendChild(head);
      keys.forEach(function (name) {
        var leaf = group[name];
        var meta = known[name];
        section.appendChild(row(
          meta ? meta[1] : name,
          qty(leaf.value, meta ? meta[2] : ""),
          typeof leaf.key === "string" ? leaf.key : ""
        ));
      });
    });
    return shown ? section : null;
  }

  function render() {
    var key = hashKey();
    var today = NutritionCore.dayKey(new Date());
    var goals;
    var days;
    var day;
    var totals;
    var band;
    var streak;
    var remaining;
    var eaten;
    var sessions;
    var balance;
    var status;
    var targetCal;
    var workout;
    var macros;
    var anyMacro;
    var meals;
    var series;
    var lines;
    var grid;
    var heat;
    if (!isDayKey(key)) return;
    days = store.days && typeof store.days === "object" ? store.days : {};
    sessions = sessionsMap();
    goals = store.goals || {};
    day = days[key] || {};
    totals = NutritionCore.totals(days[key]) || {};
    balance = NutritionCore.dayBalance(days[key], goals, sessions[key]);
    status = NutritionCore.logStatus(days[key]);
    targetCal = balance.targets.calories;
    band = NutritionCore.score(days[key], goals, sessions[key]);
    streak = NutritionCore.streak(days, goals, today, sessions);
    eaten = balance.eaten;
    remaining = balance.remaining;

    els.period.textContent = NutritionCore.label(key) || "";
    els.today.hidden = key === today;
    els.ring.style.setProperty(
      "--p",
      String(targetCal > 0 ? Math.min(100, Math.round((eaten / targetCal) * 100)) : 0)
    );
    els.ring.classList.toggle("over", targetCal > 0 && eaten > targetCal);
    if (!(targetCal > 0)) els.remain.textContent = fmt(eaten) + " eaten";
    else if (status === "complete") {
      els.remain.textContent =
        fmt(eaten) + " eaten vs " + fmt(targetCal) + " · " +
        fmt(Math.abs(remaining)) + (remaining < 0 ? " over" : " left");
    } else {
      els.remain.textContent = fmt(eaten) + " eaten vs " + fmt(targetCal);
    }
    els.score.textContent =
      (SCORE[band] || "⚪ No log") + " · " +
      (balance.type === "training" ? "Training" : "Rest") + " · " +
      streak + " day streak";

    els.main.textContent = "";
    if (band === "grey") {
      var noMeals = Array.isArray(day.exercise) && day.exercise.length;
      els.main.appendChild(node(
        "section",
        "card empty",
        noMeals ? "No meals logged for this day. It is left out of averages." : "Nothing logged for this day yet."
      ));
    }
    if (band === "partial") {
      var partial = card("Partial log", "note");
      partial.appendChild(node("p", "", "This day is left out of averages."));
      els.main.appendChild(partial);
    }

    macros = node("div", "macros");
    anyMacro = false;
    [
      ["Protein", totals.protein, balance.targets.protein],
      ["Carbs", totals.carbs, balance.targets.carbs],
      ["Fat", totals.fat, balance.targets.fat]
    ].forEach(function (spec) {
      var total = typeof spec[1] === "number" ? spec[1] : 0;
      var goal = typeof spec[2] === "number" ? spec[2] : 0;
      if (!(goal > 0 || total > 0)) return;
      anyMacro = true;
      macros.appendChild(macroRow(spec[0], total, goal));
    });
    if (anyMacro) {
      var macroCard = card("Macros");
      macroCard.appendChild(macros);
      els.main.appendChild(macroCard);
    }

    if (typeof day.note === "string" && day.note.trim()) {
      var note = card("Coach", "note");
      note.appendChild(node("p", "", day.note.trim()));
      els.main.appendChild(note);
    }

    meals = day.meals || {};
    NutritionCore.MEALS.forEach(function (name) {
      var items = meals[name];
      var section;
      var head;
      var sub;
      var mealKcal;
      if (!Array.isArray(items) || !items.length) return;
      sub = totals.byMeal && totals.byMeal[name];
      mealKcal = sub && typeof sub === "object" ? sub.kcal : 0;
      section = node("section", "card");
      head = node("div", "meal-head");
      head.appendChild(node("h4", "", cap(name)));
      head.appendChild(node("span", "", fmt(mealKcal) + " kcal"));
      section.appendChild(head);
      items.forEach(function (item) {
        var row;
        if (!item || typeof item !== "object") return;
        row = node("div", "item");
        row.appendChild(node("span", "", item.name || ""));
        row.appendChild(node("span", "qty", item.qty == null ? "" : String(item.qty)));
        row.appendChild(node("span", "kcal", fmt(item.kcal) + " kcal"));
        section.appendChild(row);
      });
      els.main.appendChild(section);
    });

    workout = workoutCard(key);
    if (workout) els.main.appendChild(workout);

    series = NutritionCore.series(days, goals, key, range, sessions);
    if (!Array.isArray(series)) series = [];
    (function () {
      var trends = card("Trends");
      var toggle = node("div", "toggle");
      [7, 30].forEach(function (days) {
        var choice = button(range === days ? "on" : "", days + " days");
        choice.addEventListener("click", function () {
          if (range === days) return;
          range = days;
          render();
        });
        toggle.appendChild(choice);
      });
      trends.appendChild(toggle);
      trends.appendChild(node("p", "chart-label", "Calories"));
      trends.appendChild(calorieChart(series));
      els.main.appendChild(trends);
    })();

    (function () {
      var history = weightHistory(key);
      var goalN = goals.weight > 0 ? goals.weight : 0;
      var chart;
      var last;
      var box;
      var caption;
      if (!history.length) return;
      chart = weightChart(history, history, goalN);
      if (!chart) return;
      box = card("Weight");
      box.appendChild(chart);
      last = history[history.length - 1];
      caption = kgText(last.weight) + " kg · " + last.key;
      if (goalN > 0) caption += " · goal " + kgText(goalN) + " kg";
      box.appendChild(node("p", "chart-label", caption));
      els.main.appendChild(box);
    })();

    (function () {
      var goalH = goals.sleepHours;
      var series;
      var week;
      var box;
      var parts;
      var last;
      var sum;
      var count;
      function hourText(n) {
        return String(Math.round(n * 10) / 10);
      }
      if (!(typeof goalH === "number" && isFinite(goalH) && goalH > 0)) goalH = 0;
      if (typeof NutritionCore.sleepSeries !== "function") return;
      series = NutritionCore.sleepSeries(store.days, key, range);
      if (!Array.isArray(series)) return;
      series.forEach(function (item) {
        if (item && typeof item.hours === "number" && isFinite(item.hours)) last = item;
      });
      if (!last) return;
      box = card("Sleep");
      box.appendChild(sleepChart(series, goalH));
      parts = ["Last night " + hourText(last.hours) + " h"];
      week = NutritionCore.sleepSeries(store.days, key, 7);
      sum = 0;
      count = 0;
      if (Array.isArray(week)) {
        week.forEach(function (item) {
          if (!(item && typeof item.hours === "number" && isFinite(item.hours))) return;
          sum += item.hours;
          count += 1;
        });
      }
      if (count) parts.push("7-day avg " + hourText(sum / count) + " h");
      if (goalH > 0 && typeof NutritionCore.sleepStreak === "function") {
        parts.push(NutritionCore.sleepStreak(store.days, goalH, key) + "-night streak (goal " + hourText(goalH) + " h)");
      }
      box.appendChild(node("p", "chart-label", parts.join(" \u00b7 ")));
      els.main.appendChild(box);
    })();

    var healthCard = bodyHealthCard(key);
    if (healthCard) els.main.appendChild(healthCard);

    lines = NutritionCore.insights(days, goals, key, sessions) || [];
    if (lines.length) {
      var insightCard = card("Insights");
      var list = node("ul", "insights");
      lines.forEach(function (line) {
        list.appendChild(node("li", "", String(line)));
      });
      insightCard.appendChild(list);
      els.main.appendChild(insightCard);
    }

    grid = NutritionCore.monthGrid(key);
    (function () {
      var month = card(grid.title || "");
      var head = node("div", "heat-head");
      heat = node("div", "heat");
      WEEKDAYS.forEach(function (name) {
        head.appendChild(node("span", "", name));
      });
      month.appendChild(head);
      (grid.cells || []).forEach(function (cell) {
        var mark = NutritionCore.score(days[cell.key], goals, sessions[cell.key]);
        var link = document.createElement("a");
        link.href = "#" + cell.key;
        link.textContent = String(parseInt(cell.key.slice(8), 10));
        link.className = mark + (cell.inMonth ? "" : " out") + (cell.key === today ? " today" : "");
        link.title = cell.key + " " + mark;
        heat.appendChild(link);
      });
      month.appendChild(heat);
      els.main.appendChild(month);
    })();
  }

  function apply(remote) {
    if (!(remote && remote.version === 1 && remote.days && typeof remote.days === "object")) return;
    if (!remote.goals) remote.goals = NutritionCore.blankStore().goals;
    store = remote;
    persist();
  }

  function pull() {
    var nutritionErr = null;
    var streetErr = null;
    var nutritionP;
    var streetP;
    loading = true;
    nutritionP = GhSync.load("nutrition", apply).then(function () {}, function (err) {
      nutritionErr = err;
    });
    streetP = loadStreetlifting().then(function () {}, function (err) {
      streetErr = err;
    });
    Promise.all([nutritionP, streetP]).then(function () {
      var err = nutritionErr || streetErr;
      loading = false;
      showConnect();
      if (err) els.sync.textContent = err && err.message ? err.message : String(err);
      else els.sync.textContent = "Synced " + hhmm();
      render();
    });
  }

  function autoLoad() {
    showConnect();
    if (!hasToken()) {
      els.sync.textContent = "Not synced";
      return;
    }
    if (loading) return;
    pull();
  }

  function go(delta) {
    var key = hashKey();
    if (!isDayKey(key)) return;
    location.hash = "#" + NutritionCore.shift(key, delta);
  }

  function onHash() {
    if (!isDayKey(hashKey())) location.replace("#" + NutritionCore.dayKey(new Date()));
    else render();
  }

  els.prev.addEventListener("click", function () { go(-1); });
  els.next.addEventListener("click", function () { go(1); });
  els.today.addEventListener("click", function () {
    location.hash = "#" + NutritionCore.dayKey(new Date());
  });
  els.connectBtn.addEventListener("click", function () {
    if (!loading) pull();
  });
  window.addEventListener("hashchange", onHash);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") autoLoad();
  });

  if (!isDayKey(hashKey())) location.replace("#" + NutritionCore.dayKey(new Date()));
  else render();
  setInterval(autoLoad, 60000);
  autoLoad();
})();
