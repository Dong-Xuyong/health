# Nutrition

Copied from `Dong-Xuyong/nutrition` @ `e651262b0d657441fd3a85ebeb1816d4c7dcc68d`.

A read-only nutrition log for meals, exercise, weight, and daily targets. The Workout page charts weight, estimates session burn, and shows the daily deficit.

Live: https://dong-xuyong.github.io/health/nutrition/

The pages read `nutrition.json` and `streetlifting.json` in `Dong-Xuyong/progress-sync` and stay read-only. Nothing on the page is editable. Grok writes those files.

`nutrition.json` also holds a profile (height) plus per-day body composition, skinfolds, circumferences, vitals, and labs. Data stays in `Dong-Xuyong/progress-sync`.

The log and workout pages auto-load those files on open, on focus, and every 60 seconds.

The writer spec is [`Dong-Xuyong/nutrition/CONTRACT.md`](https://github.com/Dong-Xuyong/nutrition/blob/main/CONTRACT.md).
