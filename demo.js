/* Fake Health demo. Nothing here is personal, and the app never saves it. */
(function (root) {
  "use strict";

  function pad(n) {
    var alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    var s = "";
    var x = n + 1;
    var i;
    for (i = 0; i < 6; i++) {
      s = alphabet[x % 36] + s;
      x = Math.floor(x / 36);
    }
    return s;
  }

  function id(prefix, n) {
    return prefix + "_" + pad(n);
  }

  function addDays(iso, delta) {
    var parts = iso.split("-");
    var dt = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    dt.setUTCDate(dt.getUTCDate() + delta);
    return dt.toISOString().slice(0, 10);
  }

  function clock(hour, minute) {
    function two(n) { return (n < 10 ? "0" : "") + n; }
    return two(hour) + ":" + two(minute);
  }

  function build(today) {
    var end = today || "2026-10-16";
    var dates = [];
    var i;
    for (i = 27; i >= 0; i--) dates.push(addDays(end, -i));

    var seq = 10;
    function checkin(offset, pain, note) {
      seq += 1;
      return {
        id: id("ck", seq),
        date: addDays(end, offset),
        pain: pain,
        note: note,
        updatedAt: addDays(end, offset) + "T08:00:00Z"
      };
    }

    var elbow = {
      id: id("inj", 1),
      area: "EXAMPLE elbow",
      side: "left",
      startedOn: addDays(end, -40),
      resolvedOn: null,
      status: "active",
      cause: "EXAMPLE too much pressing volume",
      notes: "EXAMPLE stiff after heavy days",
      avoid: ["EXAMPLE dip lockout", "EXAMPLE overhead press"],
      checkins: [
        checkin(-21, 6, "EXAMPLE sharp on the way down"),
        checkin(-14, 5, "EXAMPLE easier after rest"),
        checkin(-7, 4, "EXAMPLE dull ache"),
        checkin(0, 3, "EXAMPLE manageable")
      ],
      updatedAt: end + "T09:00:00Z"
    };

    var back = {
      id: id("inj", 2),
      area: "EXAMPLE lower back",
      side: "n/a",
      startedOn: addDays(end, -18),
      resolvedOn: null,
      status: "recovering",
      cause: "EXAMPLE long sitting",
      notes: "EXAMPLE better when I walk",
      avoid: ["EXAMPLE heavy hinge"],
      checkins: [
        checkin(-14, 7, "EXAMPLE hard to hinge"),
        checkin(-7, 4, "EXAMPLE looser"),
        checkin(0, 2, "EXAMPLE almost quiet")
      ],
      updatedAt: end + "T09:05:00Z"
    };

    var entries = {};
    var days = {};
    var sessions = {};
    var beds = [
      [22, 40],
      [23, 15],
      [23, 50],
      [0, 20]
    ];
    var wakes = [
      [6, 30],
      [7, 15],
      [6, 50],
      [7, 45]
    ];

    dates.forEach(function (date, index) {
      var bed = beds[index % beds.length];
      var wake = wakes[index % wakes.length];
      var quality = (index % 5) + 1;
      entries[date] = {
        updatedAt: date + "T08:00:00Z",
        fields: {
          sleep: {
            bed: clock(bed[0], bed[1]),
            wake: clock(wake[0], wake[1]),
            hours: null,
            quality: quality,
            note: "EXAMPLE night " + (index + 1),
            updatedAt: date + "T08:00:00Z"
          }
        }
      };

      var training = index % 2 === 0;
      var meals = {
        breakfast: [
          { name: "EXAMPLE oats", kcal: 420, protein: 22, carbs: 58, fat: 11 },
          { name: "EXAMPLE yogurt", kcal: 180, protein: 16, carbs: 14, fat: 6 }
        ],
        lunch: [
          { name: "EXAMPLE rice bowl", kcal: training ? 780 : 620, protein: training ? 42 : 34, carbs: 80, fat: 18 }
        ],
        dinner: [
          { name: "EXAMPLE beans", kcal: 540, protein: 28, carbs: 62, fat: 14 }
        ],
        snacks: [
          { name: "EXAMPLE fruit", kcal: 120, protein: 2, carbs: 28, fat: 0 }
        ]
      };
      days[date] = {
        weight: Math.round((70 + (index % 6) * 0.2) * 10) / 10,
        dayType: training ? "training" : "rest",
        meals: index === 3
          ? [
              { name: "EXAMPLE stew", kcal: 640, protein: 35, carbs: 50, fat: 22 },
              { name: "EXAMPLE bread", kcal: 260, protein: 9, carbs: 46, fat: 4 }
            ]
          : meals
      };

      if (training) {
        var sets = [];
        var s;
        for (s = 0; s < 3 + (index % 3); s++) sets.push({ reps: 5, load: 40 });
        sessions[date] = {
          lifts: { "EXAMPLE squat": sets },
          liftKcal: 150,
          activities: [{ type: "EXAMPLE walk", durationMin: 20 }]
        };
      }
    });

    return {
      health: {
        app: "health",
        schemaVersion: 1,
        owner: "chopper",
        updatedAt: end + "T09:05:00Z",
        settings: { sleepTargetHours: null, updatedAt: null },
        injuries: [elbow, back]
      },
      journal: {
        version: 1,
        entries: entries
      },
      nutrition: {
        version: 1,
        goals: {
          sleepHours: 8,
          calories: 2000,
          protein: 120,
          restDay: { calories: 1600, protein: 110 }
        },
        days: days
      },
      streetlifting: {
        sessions: sessions
      }
    };
  }

  var api = { build: build };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.HealthDemo = api;
})(typeof window !== "undefined" ? window : globalThis);
