/* Read-only workout view. GitHub is the only place data is written. */
(function () {
  "use strict";

  var STORE_KEY = "nutrition-v1";
  var SVGNS = "http://www.w3.org/2000/svg";
  var RANGES = [14, 30, 90];

  var syncEl = document.getElementById("sync-label");
  if (typeof NutritionCore === "undefined" || typeof NutritionCore.workoutView !== "function") {
    if (syncEl) syncEl.textContent = "Not synced";
    return;
  }

  var els = {
    sync: syncEl,
    banner: document.getElementById("demo-banner"),
    period: document.getElementById("period-label"),
    remain: document.getElementById("remain-line"),
    score: document.getElementById("score-line"),
    targets: document.getElementById("target-line"),
    range: document.getElementById("range-toggle"),
    prev: document.getElementById("prev"),
    today: document.getElementById("today"),
    next: document.getElementById("next"),
    main: document.getElementById("main"),
    connect: document.getElementById("connect"),
    connectBtn: document.getElementById("btn-connect")
  };

  var demo = /(?:^|[?&])demo=1(?:&|$)/.test(location.search);
  var sample = demo ? NutritionCore.sampleWorkout(NutritionCore.dayKey(new Date())) : null;
  var store = demo ? sample.nutrition : readStore();
  var streetlifting = demo ? sample.streetlifting : { sessions: {} };
  var range = 14;
  var loading = false;

  function fmt(n) {
    return Math.round(Number(n) || 0).toLocaleString("en-GB");
  }

  function kgText(n) {
    return (Math.round(n * 10) / 10).toLocaleString("en-GB", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    });
  }

  function trimNum(n) {
    return String(Math.round(n * 10) / 10);
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

  function chev() {
    return node("span", "chev");
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
    var date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }

  function dateMs(key) {
    return Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10));
  }

  function shortDate(key) {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC"
    }).format(new Date(dateMs(key)));
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
    if (demo) return;
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
    els.connect.hidden = demo || hasToken();
  }

  function typeLabel(type) {
    return type === "training" ? "Active" : "Rest";
  }

  function pointBand(mid) {
    return { mid: mid, low: mid, high: mid };
  }

  function formatSet(set) {
    if (!set || typeof set !== "object") return "";
    var bits = [];
    if (typeof set.kg === "number" && isFinite(set.kg)) bits.push(trimNum(set.kg) + " kg");
    if (typeof set.reps === "number" && isFinite(set.reps)) bits.push("× " + trimNum(set.reps));
    if (typeof set.rpe === "number" && isFinite(set.rpe)) bits.push("RPE " + trimNum(set.rpe));
    return bits.join(" ");
  }

  function durationText(strength) {
    if (!strength || strength.minutes == null) return "";
    var shown = trimNum(strength.minutes);
    var text = shown + " min";
    if (strength.assumed) {
      var sets = 0;
      (strength.exercises || []).forEach(function (ex) {
        sets += ex.sets || 0;
      });
      text += " assumed (" + sets + " sets × 2.5 min)";
    } else text += " logged";
    if (strength.bwKg) text += " · " + kgText(strength.bwKg) + " kg";
    return text;
  }

  function line(className, x1, y1, x2, y2) {
    var el = svg("line");
    el.setAttribute("x1", String(x1));
    el.setAttribute("y1", String(y1));
    el.setAttribute("x2", String(x2));
    el.setAttribute("y2", String(y2));
    el.setAttribute("class", className);
    return el;
  }

  function axisText(x, y, text, anchor) {
    var el = svg("text");
    el.setAttribute("x", String(x));
    el.setAttribute("y", String(y));
    el.setAttribute("text-anchor", anchor || "end");
    el.textContent = text;
    return el;
  }

  function poly(className, coords) {
    var el = svg("polyline");
    el.setAttribute("fill", "none");
    el.setAttribute("class", className);
    el.setAttribute("stroke-width", "2");
    el.setAttribute("stroke-linejoin", "round");
    el.setAttribute("stroke-linecap", "round");
    el.setAttribute("points", coords.join(" "));
    return el;
  }

  function weightChart(view) {
    var points = view.weights || [];
    if (!points.length) return node("p", "hint", "No weigh-ins in this window.");
    var vals = [];
    points.forEach(function (point) {
      vals.push(point.weight);
      if (typeof point.average === "number") vals.push(point.average);
    });
    if (view.startWeight) vals.push(view.startWeight);
    if (view.goalWeight) vals.push(view.goalWeight);
    var min = vals[0];
    var max = vals[0];
    vals.forEach(function (value) {
      if (value < min) min = value;
      if (value > max) max = value;
    });
    if (min === max) {
      min -= 1;
      max += 1;
    }
    var pad = (max - min) * 0.08;
    min -= pad;
    max += pad;

    var width = 360;
    var height = 200;
    var left = 46;
    var right = 10;
    var top = 16;
    var bottom = 28;
    var plotW = width - left - right;
    var plotH = height - top - bottom;
    var t0 = dateMs(points[0].key);
    var t1 = dateMs(points[points.length - 1].key);
    if (t0 === t1) {
      t0 -= 86400000;
      t1 += 86400000;
    }

    function xOf(key) {
      return left + ((dateMs(key) - t0) / (t1 - t0)) * plotW;
    }
    function yOf(weight) {
      return top + (1 - (weight - min) / (max - min)) * plotH;
    }

    var board = svg("svg");
    board.setAttribute("viewBox", "0 0 " + width + " " + height);
    board.setAttribute("role", "img");
    board.setAttribute(
      "aria-label",
      "Weight from " +
        kgText(points[0].weight) +
        " kg on " +
        points[0].key +
        " to " +
        kgText(points[points.length - 1].weight) +
        " kg on " +
        points[points.length - 1].key +
        (view.startWeight ? ". Start " + kgText(view.startWeight) + " kg" : "") +
        (view.goalWeight ? ". Goal " + kgText(view.goalWeight) + " kg" : "")
    );
    board.appendChild(axisText(42, yOf(max - pad) + 4, kgText(max - pad)));
    board.appendChild(axisText(42, yOf(min + pad) + 4, kgText(min + pad)));

    if (view.startWeight) {
      var start = line("start-line", left, yOf(view.startWeight), width - right, yOf(view.startWeight));
      start.setAttribute("stroke-dasharray", "5 4");
      start.setAttribute("stroke-width", "1.5");
      board.appendChild(start);
    }
    if (view.goalWeight) {
      var goal = line("goal-line", left, yOf(view.goalWeight), width - right, yOf(view.goalWeight));
      goal.setAttribute("stroke-dasharray", "2 3");
      goal.setAttribute("stroke-width", "1.5");
      board.appendChild(goal);
    }

    var averagePts = [];
    var weightPts = [];
    points.forEach(function (point) {
      var x = xOf(point.key);
      weightPts.push(x.toFixed(1) + "," + yOf(point.weight).toFixed(1));
      if (typeof point.average === "number") {
        averagePts.push(x.toFixed(1) + "," + yOf(point.average).toFixed(1));
      }
    });
    if (weightPts.length > 1) board.appendChild(poly("weigh-line", weightPts));
    if (averagePts.length > 1) board.appendChild(poly("average-line", averagePts));
    points.forEach(function (point) {
      var dot = svg("circle");
      var title = svg("title");
      dot.setAttribute("class", "weigh-dot");
      dot.setAttribute("cx", xOf(point.key).toFixed(1));
      dot.setAttribute("cy", yOf(point.weight).toFixed(1));
      dot.setAttribute("r", "3.5");
      title.textContent =
        point.key +
        " " +
        kgText(point.weight) +
        " kg, 7-day average " +
        kgText(point.average) +
        " kg";
      dot.appendChild(title);
      board.appendChild(dot);
    });
    board.appendChild(axisText(xOf(points[0].key), height - 8, shortDate(points[0].key), "start"));
    if (points.length > 1) {
      board.appendChild(
        axisText(xOf(points[points.length - 1].key), height - 8, shortDate(points[points.length - 1].key), "end")
      );
    }

    var wrap = node("div", "chart");
    wrap.appendChild(board);
    var legend = node("ul", "legend");
    [
      ["swatch-weight", "Weigh-in"],
      ["swatch-average", "7-day average"],
      ["swatch-start", "Start weight"],
      ["swatch-goal", "Goal weight"]
    ].forEach(function (item) {
      if (item[1] === "Start weight" && !view.startWeight) return;
      if (item[1] === "Goal weight" && !view.goalWeight) return;
      var li = node("li", "");
      var swatch = node("i", item[0]);
      li.appendChild(swatch);
      li.appendChild(document.createTextNode(item[1]));
      legend.appendChild(li);
    });
    wrap.appendChild(legend);
    return wrap;
  }

  function deficitChart(view) {
    var rows = (view.rows || []).filter(function (row) {
      return row.countsInAverage;
    });
    if (!rows.length) return node("p", "hint", "No complete days in this window.");
    var lo = 0;
    var hi = 0;
    rows.forEach(function (row) {
      if (row.deficit.mid < lo) lo = row.deficit.mid;
      if (row.deficit.mid > hi) hi = row.deficit.mid;
    });
    if (lo === hi) {
      lo -= 200;
      hi += 200;
    }
    var pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;

    var width = 360;
    var height = 188;
    var left = 48;
    var right = 8;
    var top = 14;
    var bottom = 26;
    var plotW = width - left - right;
    var plotH = height - top - bottom;
    var gap = rows.length > 24 ? 1 : rows.length > 14 ? 2 : 3;
    var bw = Math.max(2, (plotW - gap * (rows.length - 1)) / rows.length);

    function yOf(value) {
      return top + (1 - (value - lo) / (hi - lo)) * plotH;
    }

    var board = svg("svg");
    board.setAttribute("viewBox", "0 0 " + width + " " + height);
    board.setAttribute("role", "img");
    board.setAttribute(
      "aria-label",
      "Daily deficit for " + rows.length + " complete days. Above the line is a deficit, below is a surplus."
    );
    var zero = line("zero-line", left, yOf(0), width - right, yOf(0));
    zero.setAttribute("stroke-width", "1");
    board.appendChild(zero);
    board.appendChild(axisText(44, yOf(hi - pad) + 4, fmt(hi - pad)));
    board.appendChild(axisText(44, yOf(0) + 4, "0"));
    if (lo + pad < -20) board.appendChild(axisText(44, yOf(lo + pad) + 4, fmt(lo + pad)));

    rows.forEach(function (row, index) {
      var y = yOf(row.deficit.mid);
      var y0 = yOf(0);
      var topY = Math.min(y, y0);
      var h = Math.max(1.5, Math.abs(y - y0));
      var rect = svg("rect");
      var title = svg("title");
      rect.setAttribute("class", row.deficit.mid >= 0 ? "bar-deficit" : "bar-surplus");
      rect.setAttribute("x", String(left + index * (bw + gap)));
      rect.setAttribute("y", String(topY));
      rect.setAttribute("width", String(bw));
      rect.setAttribute("height", String(h));
      rect.setAttribute("rx", "2");
      title.textContent = row.key + " " + NutritionCore.formatDeficit(row.deficit);
      rect.appendChild(title);
      board.appendChild(rect);
    });
    board.appendChild(axisText(left, height - 8, shortDate(rows[0].key), "start"));
    if (rows.length > 1) {
      board.appendChild(
        axisText(left + (rows.length - 1) * (bw + gap) + bw, height - 8, shortDate(rows[rows.length - 1].key), "end")
      );
    }

    var wrap = node("div", "chart");
    wrap.appendChild(board);
    var legend = node("ul", "legend");
    [
      ["swatch-deficit", "Deficit"],
      ["swatch-surplus", "Surplus"]
    ].forEach(function (item) {
      var li = node("li", "");
      li.appendChild(node("i", item[0]));
      li.appendChild(document.createTextNode(item[1]));
      legend.appendChild(li);
    });
    wrap.appendChild(legend);
    wrap.appendChild(node(
      "p",
      "hint",
      "Bars use the middle of the exercise range. Incomplete days are left out. The daily base is " +
        fmt(view.base.kcal) +
        " kcal (BMR " +
        fmt(view.base.bmr) +
        " × " +
        trimNum(view.base.neat) +
        "), plus exercise, minus intake."
    ));
    return wrap;
  }

  function methodNote(view) {
    return node(
      "p",
      "method",
      "Lifting kcal is an estimate: 5.5 METs × body weight × hours. With no session duration, each set counts as 2.5 minutes, and that total is split across lifts by set count. " +
        "Lifting figures are a range of about ±25%. Body weight is the session weight, otherwise the latest weigh-in, otherwise 67.6 kg. " +
        "Other work uses a logged kcal when one is written, otherwise MET × body weight × hours (jump rope about 11, running by pace or about 9.8). " +
        "Workout kcal is shown separately and is not subtracted from what you ate. " +
        "An estimated deficit is the rest-day base (" +
        fmt(view.base.kcal) +
        " kcal) plus that day's workout kcal, minus calories eaten."
    );
  }

  function stat(label, value) {
    var el = node("div", "stat");
    el.appendChild(node("span", "stat-label", label));
    el.appendChild(node("span", "stat-value", value));
    return el;
  }

  function badge(type) {
    return node("span", "badge " + (type === "training" ? "active" : "rest"), typeLabel(type));
  }

  function exerciseBlock(ex, missingWeight) {
    var wrap = node("div", "lift");
    var head = node("div", "lift-head");
    var name = ex.name + (ex.sets ? " · " + ex.sets + (ex.sets === 1 ? " set" : " sets") : "");
    head.appendChild(node("span", "", name));
    if (missingWeight) head.appendChild(node("span", "kcal", "No bodyweight"));
    else if (ex.mid > 0) {
      head.appendChild(node("span", "kcal", NutritionCore.formatKcalRange({
        mid: ex.mid,
        low: ex.low,
        high: ex.high
      })));
    }
    wrap.appendChild(head);
    var details = [];
    (ex.setList || []).forEach(function (set) {
      var text = formatSet(set);
      if (text) details.push(text);
    });
    if (details.length) wrap.appendChild(node("p", "sets", details.join(" · ")));
    return wrap;
  }

  function manualBlock(item) {
    var wrap = node("div", "lift");
    var head = node("div", "lift-head");
    var name = item.name;
    if (item.durationMin != null) name += " · " + trimNum(item.durationMin) + " min";
    head.appendChild(node("span", "", name));
    head.appendChild(node(
      "span",
      "kcal",
      item.kcal > 0 ? (item.logged ? fmt(item.kcal) + " kcal" : "about " + fmt(item.kcal) + " kcal") : ""
    ));
    wrap.appendChild(head);
    return wrap;
  }

  function sessionCard(row) {
    var block = document.createElement("details");
    block.className = "session " + row.type + (row.known && !row.countsInAverage ? " flagged" : "");
    block.id = "day-" + row.key;
    var summary = document.createElement("summary");
    var main = node("span", "session-main");
    main.appendChild(node("span", "session-date", row.weekday + " " + shortDate(row.key)));
    main.appendChild(badge(row.type));
    if (row.known && !row.countsInAverage) main.appendChild(node("span", "badge flag", "Left out"));
    var meta = "No exercise kcal";
    if (row.strength && row.strength.missingWeight && !(row.exercise.mid > 0)) {
      meta = "Strength kcal needs a bodyweight";
    } else if (row.exercise.mid > 0 || row.exercise.low > 0) {
      meta = NutritionCore.formatKcalRange(row.exercise);
    }
    if (row.countsInAverage) meta += " · " + NutritionCore.formatDeficit(row.deficit);
    else if (row.flag) meta += " · " + row.flag;
    main.appendChild(node("span", "session-meta", meta));
    summary.appendChild(main);
    summary.appendChild(chev());
    block.appendChild(summary);

    var body = node("div", "session-body");
    var stats = node("div", "stats");
    stats.appendChild(stat("Eaten", fmt(row.intake) + " kcal"));
    stats.appendChild(stat(
      typeLabel(row.type) + " target",
      fmt(row.targets.calories) + " kcal · P " + fmt(row.targets.protein) +
        " · C " + fmt(row.targets.carbs) + " · F " + fmt(row.targets.fat)
    ));
    stats.appendChild(stat("Burned", row.exercise.mid > 0 ? NutritionCore.formatKcalRange(row.exercise) : "0 kcal"));
    stats.appendChild(stat(
      "Deficit",
      row.countsInAverage ? NutritionCore.formatDeficit(row.deficit) : "Not counted"
    ));
    body.appendChild(stats);
    if (row.strength) {
      var timing = durationText(row.strength);
      if (timing) body.appendChild(node("p", "hint", timing));
      if (row.strength.missingWeight) {
        body.appendChild(node("p", "hint", "This session has no bodyweight, so the strength kcal is blank."));
      }
      if (row.strength.exercises && row.strength.exercises.length) {
        body.appendChild(node("p", "subhead", "Lifts"));
        row.strength.exercises.forEach(function (ex) {
          body.appendChild(exerciseBlock(ex, row.strength.missingWeight));
        });
      }
    }
    if (row.manual.length) {
      body.appendChild(node("p", "subhead", "Other work"));
      row.manual.forEach(function (item) {
        body.appendChild(manualBlock(item));
      });
    }
    if (row.sessionNote) body.appendChild(node("p", "hint", row.sessionNote));
    if (row.note) body.appendChild(node("p", "hint", row.note));
    var link = node("a", "log-link", "Open this day in the log");
    link.href = "index.html#" + row.key;
    body.appendChild(link);
    block.appendChild(body);
    return block;
  }

  function dayStrip(rows) {
    var strip = node("div", "day-strip");
    rows.forEach(function (row) {
      var cell = button(
        (row.type === "training" ? "active-day" : row.known ? "rest-day" : "gap-day") +
          (row.known && !row.countsInAverage ? " left-out" : ""),
        ""
      );
      cell.appendChild(node("span", "", row.weekday.slice(0, 1)));
      cell.appendChild(document.createElement("br"));
      cell.appendChild(node("span", "", String(+row.key.slice(8))));
      var label = row.weekday + " " + shortDate(row.key) + ", " + typeLabel(row.type);
      if (!row.known) label = row.weekday + " " + shortDate(row.key) + ", no log";
      else if (!row.countsInAverage) label += ", left out of averages";
      cell.setAttribute("aria-label", label);
      cell.addEventListener("click", function () {
        var fold = document.getElementById("sessions-fold");
        var day = document.getElementById("day-" + row.key);
        if (fold) fold.open = true;
        if (day) {
          day.open = true;
          day.scrollIntoView({ block: "nearest" });
        }
      });
      strip.appendChild(cell);
    });
    return strip;
  }

  function fold(id, title, aside, open) {
    var details = document.createElement("details");
    details.className = "fold";
    if (id) details.id = id;
    if (open) details.open = true;
    var summary = document.createElement("summary");
    summary.appendChild(node("span", "fold-title", title));
    if (aside) summary.appendChild(node("span", "fold-aside", aside));
    summary.appendChild(chev());
    details.appendChild(summary);
    var body = node("div", "fold-body");
    details.appendChild(body);
    return { details: details, body: body };
  }

  function render() {
    var key = hashKey();
    var today = NutritionCore.dayKey(new Date());
    if (!isDayKey(key)) return;
    var view = NutritionCore.workoutView(store, streetlifting, key, range);
    var train = view.targets.training;
    var rest = view.targets.rest;
    var lastWeight = view.weights.length ? view.weights[view.weights.length - 1] : null;

    els.period.textContent = view.days + " days ending " + (NutritionCore.label(key) || key);
    els.today.hidden = key === today;
    els.next.disabled = key >= today;
    if (view.avgDeficit == null) els.remain.textContent = "No complete days in this window";
    else {
      els.remain.textContent =
        NutritionCore.formatDeficit(pointBand(view.avgDeficit)) + " on average";
    }
    els.score.textContent =
      view.active + " active · " + view.rest + " rest · " + view.flagged.length + " left out of averages";
    els.targets.textContent =
      "Active target " + fmt(train.calories) + " kcal · P " + fmt(train.protein) +
      " · C " + fmt(train.carbs) + " · F " + fmt(train.fat) +
      ". Rest target " + fmt(rest.calories) + " kcal · P " + fmt(rest.protein) +
      " · C " + fmt(rest.carbs) + " · F " + fmt(rest.fat) + ".";

    els.range.textContent = "";
    RANGES.forEach(function (days) {
      var choice = button(range === days ? "on" : "", days + " days");
      choice.addEventListener("click", function () {
        if (range === days) return;
        range = days;
        render();
      });
      els.range.appendChild(choice);
    });

    els.main.textContent = "";
    if (!demo && view.active === 0 && view.rest === 0 && !view.weights.length) {
      els.main.appendChild(node(
        "section",
        "card empty",
        "Connect GitHub to load workouts. Nothing is edited on this page."
      ));
    }

    var weightAside = lastWeight ? kgText(lastWeight.weight) + " kg" : "No weigh-ins";
    var weight = fold("weight-fold", "Weight", weightAside, true);
    weight.body.appendChild(weightChart(view));
    if (view.startWeight || view.goalWeight) {
      var bits = [];
      if (view.startWeight) bits.push("Start " + kgText(view.startWeight) + " kg");
      if (view.goalWeight) bits.push("Goal " + kgText(view.goalWeight) + " kg");
      if (lastWeight) bits.push("7-day average " + kgText(lastWeight.average) + " kg");
      weight.body.appendChild(node("p", "hint", bits.join(" · ")));
    }
    els.main.appendChild(weight.details);

    var deficitAside = view.avgDeficit == null ? "No average" : NutritionCore.formatDeficit(pointBand(view.avgDeficit));
    var deficit = fold("deficit-fold", "Deficit", deficitAside, true);
    deficit.body.appendChild(deficitChart(view));
    deficit.body.appendChild(methodNote(view));
    els.main.appendChild(deficit.details);

    var sessions = fold("sessions-fold", "Sessions", view.active + " active", true);
    sessions.body.appendChild(dayStrip(view.rows));
    sessions.body.appendChild(node(
      "p",
      "hint",
      "Green is an active day and grey is a rest day. Faded days have nothing logged. A dashed outline is left out of the averages. Open a day for each exercise."
    ));
    var ordered = view.rows.slice().reverse();
    ordered.forEach(function (row, index) {
      var card = sessionCard(row);
      if (index === 0) card.open = true;
      sessions.body.appendChild(card);
    });
    els.main.appendChild(sessions.details);

    var breakdown = fold(
      "breakdown-fold",
      "Per exercise",
      view.lifts.length + view.manuals.length ? String(view.lifts.length + view.manuals.length) : "None",
      false
    );
    if (!view.lifts.length && !view.manuals.length) {
      breakdown.body.appendChild(node("p", "hint", "No exercises in this window."));
    }
    view.lifts.forEach(function (item) {
      var row = node("div", "break-row");
      var name = node("span", "", item.name);
      var meta = (item.sets ? item.sets + " sets · " : "") + NutritionCore.formatKcalRange(item.band);
      row.appendChild(name);
      row.appendChild(node("span", "break-meta", meta));
      breakdown.body.appendChild(row);
    });
    if (view.manuals.length) {
      breakdown.body.appendChild(node("p", "subhead", "Logged work"));
      view.manuals.forEach(function (item) {
        var row = node("div", "break-row");
        row.appendChild(node("span", "", item.name));
        row.appendChild(node("span", "break-meta", fmt(item.kcal) + " kcal · " + item.sessions + (item.sessions === 1 ? " day" : " days")));
        breakdown.body.appendChild(row);
      });
    }
    els.main.appendChild(breakdown.details);

    var flags = fold("flagged-fold", "Flagged days", String(view.flagged.length), false);
    if (!view.flagged.length) {
      flags.body.appendChild(node("p", "hint", "Every logged day in this window has a full meal record."));
    }
    view.flagged.slice().reverse().forEach(function (row) {
      var line = node("div", "flag-row");
      var link = node("a", "", row.weekday + " " + shortDate(row.key));
      link.href = "index.html#" + row.key;
      line.appendChild(link);
      line.appendChild(node("span", "", row.flag));
      flags.body.appendChild(line);
    });
    flags.body.appendChild(node(
      "p",
      "hint",
      "A day with no meals, under 500 kcal, or only one main meal under 1,000 kcal stays out of every average."
    ));
    els.main.appendChild(flags.details);
  }

  function apply(remote) {
    if (!(remote && remote.version === 1 && remote.days && typeof remote.days === "object")) return;
    if (!remote.goals) remote.goals = NutritionCore.blankStore().goals;
    store = remote;
    persist();
  }

  function acceptStreetlifting(remote) {
    if (remote && typeof remote === "object" && remote.sessions && typeof remote.sessions === "object") {
      streetlifting = remote;
      return;
    }
    streetlifting = { sessions: {} };
  }

  function pull() {
    if (demo || typeof GhSync === "undefined" || typeof GhSync.load !== "function") return;
    loading = true;
    var note = "";
    GhSync.load("nutrition", apply).then(function () {
      return GhSync.load("streetlifting", acceptStreetlifting);
    }).then(function (msg) {
      if (msg === "Nothing saved on GitHub yet") streetlifting = { sessions: {} };
      loading = false;
      showConnect();
      els.sync.textContent = "Synced " + hhmm();
      render();
    }, function (err) {
      loading = false;
      showConnect();
      note = err && err.message ? err.message : String(err);
      els.sync.textContent = note;
      render();
    });
  }

  function autoLoad() {
    showConnect();
    if (demo) {
      els.banner.hidden = false;
      els.sync.textContent = "Sample data";
      render();
      return;
    }
    if (!hasToken()) {
      els.sync.textContent = "Not synced";
      render();
      return;
    }
    if (loading) return;
    pull();
  }

  function go(delta) {
    var key = hashKey();
    if (!isDayKey(key)) return;
    var next = NutritionCore.shift(key, delta);
    var today = NutritionCore.dayKey(new Date());
    if (next > today) next = today;
    location.hash = "#" + next;
  }

  function onHash() {
    if (!isDayKey(hashKey())) location.replace("#" + NutritionCore.dayKey(new Date()));
    else render();
  }

  els.prev.addEventListener("click", function () { go(-range); });
  els.next.addEventListener("click", function () { go(range); });
  els.today.addEventListener("click", function () {
    location.hash = "#" + NutritionCore.dayKey(new Date());
  });
  els.connectBtn.addEventListener("click", function () {
    if (!loading) pull();
  });
  window.addEventListener("hashchange", onHash);
  document.addEventListener("visibilitychange", function () {
    if (!demo && document.visibilityState === "visible") autoLoad();
  });

  if (!isDayKey(hashKey())) location.replace("#" + NutritionCore.dayKey(new Date()));
  else render();
  if (!demo) setInterval(autoLoad, 60000);
  autoLoad();
})();
