# Health

Injury log and sleep-target override for [dong-xuyong.github.io/health](https://dong-xuyong.github.io/health/).

The page writes one file, `health.json`, in the private repo `Dong-Xuyong/progress-sync`. It reads `journal.json`, `nutrition.json`, and `streetlifting.json` and never writes them.

Sleep is not stored in `health.json`. Last night and the sleep chart come from Journal (`entries[date].fields.sleep`, or the other shapes described in `CONTRACT.md`). The settings screen can save a sleep-target override. With no override, the target is `nutrition.json` `goals.sleepHours`, then 8.

With no sync token the page shows demo data and a **Demo data** banner. Demo data is never saved. Health data is not cached in `localStorage`. The only key this app reads is `dong-gh-sync`, the token shared by the other pages on this site.

## Files

- `index.html`, `styles.css`, `app.js` — the page
- `core.js` — merge, normalize, and the chart math (no DOM)
- `demo.js` — fake EXAMPLE injuries, sleep, meals, and training
- `health.seed.json` — empty document, no personal data
- `CONTRACT.md` — how Chopper writes `health.json`
- `dong-ui/` — vendored theme and write-capable `gh-sync.js` from roadmap

## Tests

```bash
node tests/core.test.mjs
```

The save test stubs `fetch`. It walks GET, 409, GET, PUT, and checks that a PUT never targets `streetlifting.json`, `nutrition.json`, or `journal.json`.

## First real save

Open the live page, connect sync, and add one injury. `health.json` should appear in progress-sync with `app`, `schemaVersion`, `owner`, `updatedAt`, `settings`, and `injuries`, and without a `sleep` key.
