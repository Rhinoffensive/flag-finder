# Ay ★ Yıldız — Turkish-flag sky scene finder

Finds nights when the sky looks like the Turkish flag: a crescent Moon standing
beside a bright planet or star. Scans a year of nights for your location, scores
each pairing for flag-likeness, and previews how the scene will actually look —
crescent tilt and all. Also shows the Moon's phase and an ordered
brightest-objects list for any night.

Inspired by the crescent–Venus conjunction over Auckland on 17 July 2026.

## Run

```bash
npm install
npm run dev       # web app on http://localhost:5173
```

CLI (same engine, good for scripting/verification):

```bash
npm run find -- --from 2026-07-10 --days 30
npm run find -- --probe "2026-07-17T18:30:00+12:00"   # explain one night
npm run find -- --lat 41.0082 --lon 28.9784 --tz Europe/Istanbul --days 90
```

## How scenes are scored (0–100)

Weighted geometric mean — one bad component sinks the score:

| Component | Weight | Ideal |
| --- | --- | --- |
| Crescent thinness | 0.27 | ~18% illuminated |
| Angular separation | 0.23 | ~2.5° |
| Companion brightness | 0.22 | Venus-class (mag −4) |
| Flag geometry | 0.12 | companion off the crescent's dark opening, like the flag |
| Altitude | 0.10 | 25°+ above horizon |
| Sky darkness | 0.06 | Sun 12°+ below horizon |

The finder samples every 10 minutes across each night, requires the Sun below
−5°, the Moon under 45% lit and above 3° altitude, and companions within 14°.
Candidates: Mercury–Saturn plus 21 first-magnitude stars.

## Accuracy

Positions come from [astronomy-engine](https://github.com/cosinekitty/astronomy)
(±1 arcminute vs. JPL ephemerides), topocentric (lunar parallax matters — up to
1°) and refraction-corrected. Crescent orientation is computed by projecting the
Sun–Moon geometry onto the observer's sky frame, so previews are correct for
either hemisphere. Scene previews enlarge the Moon ~3× (noted on each card);
separations and position angles are true.
