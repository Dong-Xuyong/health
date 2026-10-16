/* Shared visuals for the Health suite. No data, no network. */
(function (root) {
  "use strict";

  var SVGNS = "http://www.w3.org/2000/svg";

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function clamp(n) {
    var v = Number(n);
    if (!isFinite(v) || v < 0) return 0;
    if (v > 100) return 100;
    return v;
  }

  function ring(pct, label) {
    var node = el("span", "mini-ring" + (Number(pct) > 100 ? " over" : ""));
    node.style.setProperty("--p", String(Math.round(clamp(pct) * 10) / 10));
    if (label) {
      node.setAttribute("role", "img");
      node.setAttribute("aria-label", label);
    } else node.setAttribute("aria-hidden", "true");
    return node;
  }

  function bar(pct, label) {
    var node = el("span", "mini-bar" + (Number(pct) > 100 ? " over" : ""));
    var fill = document.createElement("i");
    fill.style.width = clamp(pct) + "%";
    node.appendChild(fill);
    node.setAttribute("role", "progressbar");
    node.setAttribute("aria-valuemin", "0");
    node.setAttribute("aria-valuemax", "100");
    node.setAttribute("aria-valuenow", String(Math.round(clamp(pct))));
    if (label) node.setAttribute("aria-label", label);
    return node;
  }

  function spark(values, label) {
    var svg = document.createElementNS(SVGNS, "svg");
    var nums = [];
    var finite = [];
    var i;
    var min;
    var max;
    var span;
    var path = "";
    var started = false;
    var n;
    var x;
    var y;
    var value;
    var line;
    svg.setAttribute("class", "spark");
    svg.setAttribute("viewBox", "0 0 56 18");
    if (label) {
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", label);
    } else svg.setAttribute("aria-hidden", "true");
    n = values && values.length ? values.length : 0;
    for (i = 0; i < n; i++) {
      value = values[i];
      if (typeof value === "number" && isFinite(value)) {
        nums.push(value);
        finite.push(value);
      } else nums.push(null);
    }
    if (finite.length < 2) return svg;
    min = finite[0];
    max = finite[0];
    for (i = 1; i < finite.length; i++) {
      if (finite[i] < min) min = finite[i];
      if (finite[i] > max) max = finite[i];
    }
    span = max - min || 1;
    for (i = 0; i < nums.length; i++) {
      if (nums[i] == null) {
        started = false;
        continue;
      }
      x = nums.length === 1 ? 28 : (i / (nums.length - 1)) * 54 + 1;
      y = 16 - ((nums[i] - min) / span) * 14;
      path += (started ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
      started = true;
    }
    line = document.createElementNS(SVGNS, "path");
    line.setAttribute("d", path);
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "currentColor");
    line.setAttribute("stroke-width", "1.6");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    svg.appendChild(line);
    return svg;
  }

  function fold(title, stat) {
    var details = el("details", "card fold dx-card");
    var summary = el("summary", "");
    var viz = el("span", "fold-viz");
    var statEl = el("span", "fold-stat", stat || "");
    summary.appendChild(el("span", "fold-title", title || ""));
    summary.appendChild(viz);
    summary.appendChild(statEl);
    details.appendChild(summary);
    return { details: details, viz: viz, stat: statEl };
  }

  root.SuiteUI = { ring: ring, bar: bar, spark: spark, fold: fold };
})(typeof window !== "undefined" ? window : globalThis);
