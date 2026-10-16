/**
 * Health core tests. Never calls the GitHub API.
 * Run: node tests/core.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Core = require("../core.js");
const Demo = require("../demo.js");

const fixture = (name) => JSON.parse(fs.readFileSync(new URL("./fixtures/" + name, import.meta.url), "utf8"));
const nutrition = fixture("nutrition.json");
const street = fixture("streetlifting.json");
const journal = fixture("journal.json");
const seed = JSON.parse(fs.readFileSync(new URL("../health.seed.json", import.meta.url), "utf8"));

function injury(partial) {
  return Object.assign({
    id: "inj_aaaaaa",
    area: "EXAMPLE elbow",
    side: "left",
    startedOn: "2026-09-01",
    resolvedOn: null,
    status: "active",
    cause: "",
    notes: "",
    avoid: [],
    checkins: [],
    updatedAt: "2026-10-01T00:00:00Z"
  }, partial);
}

function checkin(partial) {
  return Object.assign({
    id: "ck_aaaaaa",
    date: "2026-10-01",
    pain: 1,
    note: "",
    updatedAt: "2026-10-01T00:00:00Z"
  }, partial);
}

assert.equal(Core.sleepHours("23:30", "07:15"), 7.75);
assert.equal(Core.sleepHours("01:00", "07:30"), 6.5);
assert.equal(Core.sleepHours(null, "07:15"), null);
assert.equal(Core.sleepHours("23:30", null), null);
assert.equal(Core.sleepHours("", "07:15"), null);
assert.equal(Core.sleepHours("23:30", ""), null);
assert.equal(Core.sleepHours("25:00", "07:15"), null);

assert.deepEqual(Core.fresh(), seed);
assert.equal(Object.prototype.hasOwnProperty.call(seed, "sleep"), false);
assert.equal(Object.prototype.hasOwnProperty.call(Core.normalize(seed), "sleep"), false);

const bare = { app: "health", schemaVersion: 1, owner: "chopper", updatedAt: null, settings: seed.settings, injuries: [], badge: "EXAMPLE" };
const normalized = Core.normalize(bare);
assert.equal(normalized.badge, "EXAMPLE");
assert.equal(Object.prototype.hasOwnProperty.call(normalized, "sleep"), false);
bare.badge = "changed";
assert.equal(normalized.badge, "EXAMPLE");

const side = Core.normalize({ injuries: [injury({ side: "nope", checkins: [checkin({ pain: 4 })] })] });
assert.equal(side.injuries[0].side, "n/a");
assert.equal(side.injuries[0].checkins[0].pain, 4);

assert.equal(Core.lisbonToday(new Date("2026-01-15T00:30:00Z")), "2026-01-15");
assert.equal(Core.lisbonToday(new Date("2026-07-15T23:30:00Z")), "2026-07-16");
assert.equal(Core.addDays("2026-03-01", -1), "2026-02-28");
assert.equal(Core.addDays("2024-03-01", -1), "2024-02-29");
assert.deepEqual(Core.dateWindow("2026-10-03", 3), ["2026-10-01", "2026-10-02", "2026-10-03"]);

const ids = {};
for (let n = 0; n < 50; n++) {
  const next = Core.newId("inj", ids);
  assert.match(next, /^inj_[a-z0-9]{6}$/);
  assert.equal(ids[next], undefined);
  ids[next] = true;
}
assert.match(Core.newId("ck", {}), /^ck_[a-z0-9]{6}$/);

const localLose = {
  app: "health",
  schemaVersion: 1,
  owner: "chopper",
  updatedAt: "2026-10-03T00:00:00Z",
  settings: { sleepTargetHours: 7.5, updatedAt: "2026-10-03T00:00:00Z", note: "EXAMPLE local setting" },
  kept: "EXAMPLE local top",
  injuries: [injury({
    area: "EXAMPLE local area",
    status: "active",
    side: "left",
    updatedAt: "2026-10-01T00:00:00Z",
    clinic: "EXAMPLE local clinic",
    checkins: [checkin({
      id: "ck_local1",
      pain: 3,
      note: "EXAMPLE newer check-in",
      updatedAt: "2026-10-03T00:00:00Z"
    })]
  })]
};
const remoteWin = {
  app: "health",
  schemaVersion: 1,
  owner: "chopper",
  updatedAt: "2026-10-02T00:00:00Z",
  settings: { sleepTargetHours: 9, updatedAt: "2026-10-01T00:00:00Z" },
  remoteOnly: "EXAMPLE remote top",
  injuries: [
    injury({
      area: "EXAMPLE remote area",
      status: "recovering",
      side: "right",
      updatedAt: "2026-10-02T00:00:00Z",
      extra: "EXAMPLE remote extra",
      checkins: [
        checkin({ id: "ck_remote", date: "2026-10-02", pain: 8, note: "EXAMPLE remote", updatedAt: "2026-10-02T00:00:00Z" }),
        checkin({ id: "ck_local1", pain: 9, note: "EXAMPLE stale", updatedAt: "2026-10-01T00:00:00Z" })
      ]
    }),
    injury({ id: "inj_remote", area: "EXAMPLE remote only", updatedAt: "2026-10-02T00:00:00Z" })
  ]
};
const localSnap = JSON.stringify(localLose);
const mergedLose = Core.merge(localLose, remoteWin);
assert.equal(JSON.stringify(localLose), localSnap);
const shared = mergedLose.injuries.find((item) => item.id === "inj_aaaaaa");
assert.equal(shared.area, "EXAMPLE remote area");
assert.equal(shared.status, "recovering");
assert.equal(shared.side, "right");
assert.equal(shared.extra, "EXAMPLE remote extra");
assert.equal(shared.clinic, "EXAMPLE local clinic");
const keptCheckin = shared.checkins.find((item) => item.id === "ck_local1");
const remoteCheckin = shared.checkins.find((item) => item.id === "ck_remote");
assert.equal(keptCheckin.pain, 3);
assert.equal(keptCheckin.note, "EXAMPLE newer check-in");
assert.equal(remoteCheckin.pain, 8);
assert.ok(mergedLose.injuries.find((item) => item.id === "inj_remote"));
assert.equal(mergedLose.settings.sleepTargetHours, 7.5);
assert.equal(mergedLose.settings.note, "EXAMPLE local setting");
assert.equal(mergedLose.kept, "EXAMPLE local top");
assert.equal(mergedLose.remoteOnly, "EXAMPLE remote top");
assert.equal(Object.prototype.hasOwnProperty.call(mergedLose, "sleep"), false);

const deleted = Core.merge(
  { injuries: [injury({ deleted: true, updatedAt: "2026-10-05T00:00:00Z" })] },
  { injuries: [injury({ deleted: false, area: "EXAMPLE old", updatedAt: "2026-10-01T00:00:00Z" })] }
);
assert.equal(deleted.injuries.length, 1);
assert.equal(deleted.injuries[0].deleted, true);

const withSleep = Core.merge(
  {
    updatedAt: "2026-10-02T00:00:00Z",
    sleep: {
      "2026-10-01": { hours: 8, updatedAt: "2026-01-01T00:00:00+00:00" }
    }
  },
  {
    updatedAt: "2026-10-01T00:00:00Z",
    sleep: {
      "2026-10-01": { hours: 5, note: "EXAMPLE old", updatedAt: "2026-01-01T01:00:00+02:00" },
      "2026-10-02": { hours: 6, updatedAt: "2026-10-02T00:00:00Z" }
    }
  }
);
assert.equal(withSleep.sleep["2026-10-01"].hours, 8);
assert.equal(withSleep.sleep["2026-10-01"].note, "EXAMPLE old");
assert.equal(withSleep.sleep["2026-10-02"].hours, 6);
assert.equal(Core.merge({ schemaVersion: 1 }, { schemaVersion: 3 }).schemaVersion, 3);
assert.equal(Core.merge({ schemaVersion: 4, updatedAt: "2026-10-02T00:00:00Z" }, { schemaVersion: 1, updatedAt: "2026-10-01T00:00:00Z" }).schemaVersion, 4);

assert.equal(Core.sleepTarget({ settings: { sleepTargetHours: 7.5 } }, { goals: { sleepHours: 9 } }), 7.5);
assert.equal(Core.sleepTarget({ settings: { sleepTargetHours: null } }, { goals: { sleepHours: 9 } }), 9);
assert.equal(Core.sleepTarget({ settings: { sleepTargetHours: 0 } }, { goals: { sleepHours: 9 } }), 9);
assert.equal(Core.sleepTarget({ settings: { sleepTargetHours: null } }, {}), 8);
assert.equal(Core.sleepTarget(null, null), 8);

const days = ["2026-10-01", "2026-10-02", "2026-10-03"];
const nutritionRows = Core.nutritionDaily(nutrition, days);
assert.equal(nutritionRows[0].kcal, 1890);
assert.equal(nutritionRows[0].protein, 117);
assert.equal(nutritionRows[0].carbs, 184);
assert.equal(nutritionRows[0].fat, 62);
assert.equal(nutritionRows[0].calorieTarget, 2000);
assert.equal(nutritionRows[0].proteinTarget, 120);
assert.equal(nutritionRows[0].weight, 70.4);
assert.equal(nutritionRows[0].dayType, "training");
assert.equal(nutritionRows[1].kcal, 890);
assert.equal(nutritionRows[1].protein, 43);
assert.equal(nutritionRows[1].carbs, 90);
assert.equal(nutritionRows[1].fat, 28);
assert.equal(nutritionRows[1].calorieTarget, 1600);
assert.equal(nutritionRows[1].proteinTarget, 110);
assert.equal(nutritionRows[1].dayType, "rest");
assert.equal(nutritionRows[2].kcal, null);
assert.equal(nutritionRows[2].logged, false);
assert.equal(nutritionRows[2].weight, 70.1);

const trainingRows = Core.trainingDaily(street, days);
assert.deepEqual(trainingRows.map((row) => row.sets), [5, 0, 0]);

const pain = Core.painSeries(injury({
  checkins: [
    checkin({ id: "ck_oldday", date: "2026-10-01", pain: 2, updatedAt: "2026-10-01T00:00:00Z" }),
    checkin({ id: "ck_newer", date: "2026-10-01", pain: 6, updatedAt: "2026-10-01T09:00:00Z" }),
    checkin({ id: "ck_dead1", date: "2026-10-01", pain: 9, deleted: true, updatedAt: "2026-10-02T00:00:00Z" }),
    checkin({ id: "ck_later", date: "2026-10-03", pain: 1, updatedAt: "2026-10-03T00:00:00Z" })
  ]
}), days);
assert.deepEqual(pain.map((row) => row.pain), [6, null, 1]);

assert.deepEqual(Core.rollingAvg([null, 8, null, 6], 2), [null, 8, 8, 6]);
assert.deepEqual(Core.rollingAvg([7, null, 5], 7), [7, 7, 6]);

const nights = Core.journalSleep(journal);
assert.equal(nights["2026-10-01"].hours, 7.75);
assert.equal(nights["2026-10-01"].quality, 4);
assert.equal(nights["2026-10-02"].hours, 6.5);
assert.equal(nights["2026-10-03"].hours, 7.25);
assert.equal(nights["2026-10-04"].hours, 6.5);
assert.equal(nights["2026-10-04"].quality, 2);
assert.equal(nights["2026-10-05"], undefined);
assert.equal(nights["2026-10-06"].hours, 8);

const series = Core.sleepSeries(journal, ["2026-10-01", "2026-10-05", "2026-10-06"]);
assert.deepEqual(series.map((row) => row.hours), [7.75, null, 8]);

const summary = Core.summarize({
  today: "2026-10-08",
  sleepRows: [
    { date: "2026-10-01", hours: 8 },
    { date: "2026-10-03", hours: null },
    { date: "2026-10-04", hours: 6 },
    { date: "2026-10-08", hours: 9 }
  ],
  weightRows: [
    { date: "2026-10-01", weight: 70.4 },
    { date: "2026-10-02", weight: null },
    { date: "2026-10-08", weight: 70.1 }
  ],
  injuries: [injury({
    area: "EXAMPLE elbow",
    checkins: [
      checkin({ date: "2026-10-01", pain: 6, updatedAt: "2026-10-01T00:00:00Z" }),
      checkin({ date: "2026-10-08", pain: 3, updatedAt: "2026-10-08T00:00:00Z" })
    ]
  })]
});
assert.equal(summary.sleepAvg7, 7.5);
assert.equal(summary.nightsUnder7, 1);
assert.equal(summary.sleepNights7, 2);
assert.ok(Math.abs(summary.weightChange + 0.3) < 1e-9);
assert.equal(summary.pain[0].today, 3);
assert.equal(summary.pain[0].weekAgo, 6);
assert.equal(summary.pain[0].delta, -3);

const demo = Demo.build("2026-10-16");
assert.equal(Object.prototype.hasOwnProperty.call(demo.health, "sleep"), false);
assert.equal(demo.health.injuries.length, 2);
assert.equal(Object.keys(demo.journal.entries).length, 28);
demo.health.injuries.forEach((item) => {
  assert.equal(item.area.startsWith("EXAMPLE"), true);
  item.avoid.forEach((move) => assert.equal(move.startsWith("EXAMPLE"), true));
});
Object.keys(demo.journal.entries).forEach((date) => {
  const night = demo.journal.entries[date].fields.sleep;
  assert.equal(typeof night.bed, "string");
  assert.equal(typeof night.wake, "string");
  assert.equal(night.note.startsWith("EXAMPLE"), true);
});
const demoSleep = Core.sleepSeries(demo.journal, Core.dateWindow("2026-10-16", 28));
assert.equal(demoSleep.length, 28);
assert.equal(demoSleep.every((row) => typeof row.hours === "number"), true);
Object.keys(demo.nutrition.days).forEach((date) => {
  const meals = demo.nutrition.days[date].meals;
  const list = Array.isArray(meals) ? meals : Object.keys(meals).flatMap((key) => meals[key]);
  list.forEach((item) => assert.equal(item.name.startsWith("EXAMPLE"), true));
});
Object.keys(demo.streetlifting.sessions).forEach((date) => {
  const session = demo.streetlifting.sessions[date];
  Object.keys(session.lifts).forEach((name) => assert.equal(name.startsWith("EXAMPLE"), true));
  session.activities.forEach((item) => assert.equal(String(item.type || item.name).startsWith("EXAMPLE"), true));
});

const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
assert.match(appSource, /saveHealth\(/);
assert.doesNotMatch(appSource, /localStorage\.setItem/);
assert.doesNotMatch(appSource, /GhSync\.save\s*\(\s*["']streetlifting/);
assert.doesNotMatch(appSource, /GhSync\.save\s*\(\s*["']nutrition/);
assert.doesNotMatch(appSource, /GhSync\.save\s*\(\s*["']journal/);
assert.doesNotMatch(appSource, /GhSync\.save\s*\(\s*["']health/);
for (const id of Core.READ_IDS) assert.match(appSource, new RegExp("GhSync\\.load\\(\\s*" + id + "|READ_IDS|loadRead"));

const memory = new Map();
const localStorage = {
  getItem(key) { return memory.has(key) ? memory.get(key) : null; },
  setItem(key, value) { memory.set(key, String(value)); },
  removeItem(key) { memory.delete(key); }
};
const calls = [];
let handler = async () => { throw new Error("fetch not stubbed"); };

function encodeContent(data) {
  return Buffer.from(unescape(encodeURIComponent(JSON.stringify(data))), "binary").toString("base64");
}
function decodeContent(b64) {
  return JSON.parse(decodeURIComponent(escape(Buffer.from(String(b64).replace(/\s/g, ""), "base64").toString("binary"))));
}
function response(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

const context = vm.createContext({
  localStorage,
  console,
  JSON,
  Object,
  Array,
  Error,
  Promise,
  Date,
  String,
  Number,
  unescape,
  escape,
  encodeURIComponent,
  decodeURIComponent,
  btoa: (value) => Buffer.from(value, "binary").toString("base64"),
  atob: (value) => Buffer.from(value, "base64").toString("binary"),
  fetch: (url, opts) => {
    calls.push({ url: String(url), method: opts && opts.method, body: opts && opts.body });
    return handler(String(url), opts || {});
  }
});
context.window = context;
context.globalThis = context;
vm.runInContext(fs.readFileSync(new URL("../dong-ui/gh-sync.js", import.meta.url), "utf8"), context);
const { GhSync } = context;

function puts() { return calls.filter((call) => call.method === "PUT"); }
localStorage.setItem("dong-gh-sync", JSON.stringify({
  token: "test-token",
  repo: "Dong-Xuyong/progress-sync"
}));

handler = async (url, opts) => {
  assert.equal(opts.headers.Authorization, "Bearer test-token");
  assert.match(url, /\/contents\/(health|streetlifting|nutrition|journal)\.json$/);
  if (opts.method === "PUT") {
    assert.match(url, /\/contents\/health\.json$/);
    return response(200, {});
  }
  return response(404, {});
};
await GhSync.load("streetlifting", () => { throw new Error("404 must not apply"); });
await GhSync.load("nutrition", () => { throw new Error("404 must not apply"); });
await GhSync.load("journal", () => { throw new Error("404 must not apply"); });
let created = null;
handler = async (url, opts) => {
  assert.match(url, /\/contents\/health\.json$/);
  if (opts.method === "GET") return response(404, {});
  const body = JSON.parse(opts.body);
  assert.equal(body.sha, undefined);
  created = decodeContent(body.content);
  assert.equal(body.message, "Save health progress");
  return response(200, {});
};
const first = Core.fresh();
await Core.saveHealth(GhSync, () => first, () => { throw new Error("no remote on 404"); });
assert.equal(Object.prototype.hasOwnProperty.call(created, "sleep"), false);
assert.equal(created.app, "health");
assert.equal(puts().every((call) => call.url.endsWith("/contents/health.json")), true);
assert.equal(calls.some((call) => call.method === "PUT" && /streetlifting|nutrition|journal/.test(call.url)), false);

calls.length = 0;
const remoteDoc = Core.fresh();
remoteDoc.updatedAt = "2026-10-15T00:00:00Z";
remoteDoc.injuries = [injury({ id: "inj_remote", area: "EXAMPLE remote", updatedAt: "2026-10-15T00:00:00Z" })];
let doc = Core.fresh();
doc.updatedAt = "2026-10-16T00:00:00Z";
doc.injuries = [injury({ id: "inj_local1", area: "EXAMPLE local", updatedAt: "2026-10-16T00:00:00Z" })];
let conflictPuts = 0;
handler = async (url, opts) => {
  assert.match(url, /\/contents\/health\.json$/);
  if (opts.method === "GET") {
    return response(200, {
      sha: conflictPuts === 0 ? "sha-old" : "sha-new",
      content: encodeContent(remoteDoc)
    });
  }
  conflictPuts += 1;
  const body = JSON.parse(opts.body);
  const saved = decodeContent(body.content);
  assert.equal(Object.prototype.hasOwnProperty.call(saved, "sleep"), false);
  assert.ok(saved.injuries.find((item) => item.id === "inj_local1"));
  assert.ok(saved.injuries.find((item) => item.id === "inj_remote"));
  if (conflictPuts === 1) {
    assert.equal(body.sha, "sha-old");
    return response(409, {});
  }
  assert.equal(body.sha, "sha-new");
  return response(200, {});
};
const savedMessage = await Core.saveHealth(GhSync, () => doc, (remote) => {
  doc = Core.merge(doc, remote);
});
assert.equal(savedMessage, "Saved to GitHub");
assert.equal(conflictPuts, 2);
assert.equal(puts().length, 2);
assert.equal(calls.filter((call) => call.method === "GET").length, 2);

calls.length = 0;
conflictPuts = 0;
handler = async (url, opts) => {
  if (opts.method === "GET") {
    return response(200, { sha: "sha-" + conflictPuts, content: encodeContent(remoteDoc) });
  }
  conflictPuts += 1;
  return response(409, {});
};
await assert.rejects(
  Core.saveHealth(GhSync, () => doc, (remote) => { doc = Core.merge(doc, remote); }),
  /Not saved, reload/
);
assert.equal(conflictPuts, 2);

console.log("health core tests passed");
