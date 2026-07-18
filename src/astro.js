// Core astronomy logic for the Turkish-flag sky-scene finder.
// Pure module (no DOM) so it runs both in the browser and in Node CLI scripts.
import * as AEmod from 'astronomy-engine'

// astronomy-engine ships CJS; interop differs between Vite and Node.
const AE = AEmod.Observer ? AEmod : AEmod.default

const D2R = Math.PI / 180
const R2D = 180 / Math.PI

export const PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']

// Bright stars (J2000 RA in hours, Dec in degrees, visual magnitude).
// The zodiacal ones (Aldebaran, Pollux, Regulus, Spica, Antares) are the
// classic Moon companions; the rest matter for the brightest-tonight list.
export const STARS = [
  { name: 'Sirius', ra: 6.7525, dec: -16.7161, mag: -1.46 },
  { name: 'Canopus', ra: 6.3992, dec: -52.6957, mag: -0.74 },
  { name: 'Rigil Kentaurus', ra: 14.6599, dec: -60.8340, mag: -0.27 },
  { name: 'Arcturus', ra: 14.2610, dec: 19.1824, mag: -0.05 },
  { name: 'Vega', ra: 18.6156, dec: 38.7837, mag: 0.03 },
  { name: 'Capella', ra: 5.2782, dec: 45.9980, mag: 0.08 },
  { name: 'Rigel', ra: 5.2423, dec: -8.2016, mag: 0.13 },
  { name: 'Procyon', ra: 7.6550, dec: 5.2250, mag: 0.34 },
  { name: 'Achernar', ra: 1.6286, dec: -57.2368, mag: 0.46 },
  { name: 'Betelgeuse', ra: 5.9195, dec: 7.4071, mag: 0.50 },
  { name: 'Hadar', ra: 14.0637, dec: -60.3730, mag: 0.61 },
  { name: 'Altair', ra: 19.8464, dec: 8.8683, mag: 0.76 },
  { name: 'Acrux', ra: 12.4433, dec: -63.0990, mag: 0.76 },
  { name: 'Aldebaran', ra: 4.5987, dec: 16.5093, mag: 0.86 },
  { name: 'Spica', ra: 13.4199, dec: -11.1613, mag: 0.97 },
  { name: 'Antares', ra: 16.4901, dec: -26.4320, mag: 1.06 },
  { name: 'Pollux', ra: 7.7553, dec: 28.0262, mag: 1.14 },
  { name: 'Fomalhaut', ra: 22.9608, dec: -29.6222, mag: 1.16 },
  { name: 'Deneb', ra: 20.6905, dec: 45.2803, mag: 1.25 },
  { name: 'Mimosa', ra: 12.7953, dec: -59.6888, mag: 1.25 },
  { name: 'Regulus', ra: 10.1395, dec: 11.9672, mag: 1.36 },
]

export const COMPASS_16 = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
export const compass = (az) => COMPASS_16[Math.round(((az % 360) + 360) % 360 / 22.5) % 16]

export function makeObserver(lat, lon, heightM = 0) {
  return new AE.Observer(lat, lon, heightM)
}

// ---------- small vector helpers ----------
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (v) => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l] }

function unitFromRaDec(raHours, decDeg) {
  const ra = raHours * 15 * D2R, dec = decDeg * D2R
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)]
}

export function sepDeg(eq1, eq2) {
  const d = dot(unitFromRaDec(eq1.ra, eq1.dec), unitFromRaDec(eq2.ra, eq2.dec))
  return Math.acos(Math.min(1, Math.max(-1, d))) * R2D
}

// East-North-Up unit vector from azimuth (N=0, E=90) and altitude, degrees.
const enu = (az, alt) => {
  const A = az * D2R, h = alt * D2R
  return [Math.cos(h) * Math.sin(A), Math.cos(h) * Math.cos(A), Math.sin(h)]
}

// Screen frame centered on the Moon as the observer sees it:
// x = right, y = up (toward zenith). Returns a projector ENU -> {x, y} direction.
function screenFrame(moonAz, moonAlt) {
  const m = enu(moonAz, moonAlt)
  let u = [-m[0] * m[2], -m[1] * m[2], 1 - m[2] * m[2]] // zenith projected onto sky plane
  u = norm(u)
  const r = norm(cross(m, u)) // screen-right when facing the Moon head-up
  return (az, alt) => {
    const v = enu(az, alt)
    const k = dot(v, m)
    const p = [v[0] - k * m[0], v[1] - k * m[1], v[2] - k * m[2]]
    const x = dot(p, r), y = dot(p, u)
    const l = Math.hypot(x, y) || 1
    return { x: x / l, y: y / l } // unit direction on the sky as seen
  }
}

// Precess a J2000 star to equator-of-date RA/Dec.
function starEquatorOfDate(star, date) {
  const time = AE.MakeTime(date)
  const sph = new AE.Spherical(star.dec, star.ra * 15, 1000)
  const vecJ = AE.VectorFromSphere(sph, time)
  const vecD = AE.RotateVector(AE.Rotation_EQJ_EQD(time), vecJ)
  const eq = AE.EquatorFromVector(vecD)
  return { ra: eq.ra, dec: eq.dec }
}

function bodyState(name, date, observer) {
  const body = AE.Body[name]
  const eq = AE.Equator(body, date, observer, true, true) // topocentric, of-date
  const hor = AE.Horizon(date, observer, eq.ra, eq.dec, 'normal')
  return { eq, hor }
}

function starState(star, date, observer) {
  const eq = starEquatorOfDate(star, date)
  const hor = AE.Horizon(date, observer, eq.ra, eq.dec, 'normal')
  return { eq, hor }
}

export function moonInfo(date) {
  const ill = AE.Illumination(AE.Body.Moon, date)
  const phaseLon = AE.MoonPhase(date) // 0 new, 90 first quarter, 180 full
  return {
    fraction: ill.phase_fraction,
    mag: ill.mag,
    waxing: phaseLon < 180,
    phaseLon,
  }
}

export function phaseName(fraction, waxing) {
  if (fraction < 0.02) return 'New Moon'
  if (fraction < 0.35) return waxing ? 'Waxing Crescent' : 'Waning Crescent'
  if (fraction < 0.65) return waxing ? 'First Quarter' : 'Last Quarter'
  if (fraction < 0.97) return waxing ? 'Waxing Gibbous' : 'Waning Gibbous'
  return 'Full Moon'
}

// ---------- flag-likeness scoring ----------
const gauss = (x, mu, sigma) => Math.exp(-0.5 * ((x - mu) / sigma) ** 2)
const clamp01 = (x) => Math.min(1, Math.max(0, x))
const smooth = (x, a, b) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const angDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d) }

// Weighted geometric mean: any single terrible component sinks the score,
// which is right — a full moon next to Venus is pretty, but it is not a flag.
function flagScore(parts) {
  const weights = { crescent: 0.27, sep: 0.23, bright: 0.22, geom: 0.12, alt: 0.10, dark: 0.06 }
  let ln = 0
  for (const [k, w] of Object.entries(weights)) ln += w * Math.log(Math.max(0.02, parts[k]))
  return 100 * Math.exp(ln)
}

export function scoreParts({ fraction, sep, mag, geomDelta, minAlt, sunAlt }) {
  return {
    crescent: gauss(fraction, 0.18, 0.13),
    sep: gauss(sep, 2.5, 4.0),
    bright: clamp01(0.15 + 0.85 * (1.6 - mag) / 5.1),
    geom: ((1 + Math.cos(geomDelta)) / 2) ** 1.3,
    alt: 0.25 + 0.75 * smooth(minAlt, 3, 25),
    dark: 0.45 + 0.55 * smooth(-sunAlt, 5, 12),
  }
}

// ---------- the scanner ----------
// Walks time in 10-minute steps looking for moments when a crescent Moon and a
// bright companion are both up in a dark-enough sky, close together. Qualifying
// samples cluster into per-body "events"; each event keeps its best moment.
export function createScan(observer, startDate, endDate, opts = {}) {
  const stepMs = (opts.stepMinutes ?? 10) * 60 * 1000
  const keepScore = opts.keepScore ?? 25
  const maxSep = opts.maxSep ?? 14
  const maxFraction = opts.maxFraction ?? 0.45

  const candidates = [
    ...PLANETS.map((p) => ({ kind: 'planet', name: p })),
    ...STARS.filter((s) => s.mag <= 1.4).map((s) => ({ kind: 'star', name: s.name, star: s })),
  ]

  const totalMs = endDate.getTime() - startDate.getTime()
  const events = []
  const open = new Map()     // body name -> accumulating event
  const skipUntil = new Map() // body name -> timestamp; far bodies re-checked later
  let t = startDate.getTime()

  const closeEvent = (acc) => {
    if (acc.best.score >= keepScore) events.push(acc.best)
  }

  const finish = () => {
    for (const acc of open.values()) closeEvent(acc)
    open.clear()
  }

  // Process one day per call; returns overall progress in [0, 1].
  const step = () => {
    if (t >= endDate.getTime()) { finish(); return 1 }
    const dayEnd = Math.min(t + 24 * 3600 * 1000, endDate.getTime())

    // Cheap day gate: no crescent anywhere near this day -> skip it whole.
    const fracNow = AE.Illumination(AE.Body.Moon, new Date(t)).phase_fraction
    if (fracNow > 0.60) { t = dayEnd; return (t - startDate.getTime()) / totalMs }

    for (; t < dayEnd; t += stepMs) {
      const date = new Date(t)

      const sun = bodyState('Sun', date, observer)
      if (sun.hor.altitude > -5) continue // sky too bright for the scene

      const mi = moonInfo(date)
      if (mi.fraction > maxFraction || mi.fraction < 0.01) continue

      const moon = bodyState('Moon', date, observer)
      if (moon.hor.altitude < 3) continue

      const project = screenFrame(moon.hor.azimuth, moon.hor.altitude)
      const sunDir = project(sun.hor.azimuth, sun.hor.altitude)
      const sunAngle = Math.atan2(sunDir.y, sunDir.x)
      const openingAngle = sunAngle + Math.PI // crescent opens away from the Sun

      for (const cand of candidates) {
        const su = skipUntil.get(cand.name)
        if (su && t < su) continue

        const st = cand.kind === 'planet'
          ? bodyState(cand.name, date, observer)
          : starState(cand.star, date, observer)
        const sep = sepDeg(moon.eq, st.eq)

        if (sep > maxSep) {
          // Moon closes on a target at ~1.2 deg/hour worst case (motion + parallax).
          const hours = (sep - maxSep) / 1.2
          if (hours > 1) skipUntil.set(cand.name, t + hours * 3600 * 1000)
          continue
        }
        if (st.hor.altitude < 2) continue

        const mag = cand.kind === 'planet'
          ? AE.Illumination(AE.Body[cand.name], date).mag
          : cand.star.mag
        const compDir = project(st.hor.azimuth, st.hor.altitude)
        const compAngle = Math.atan2(compDir.y, compDir.x)
        const geomDelta = angDiff(compAngle, openingAngle)

        const parts = scoreParts({
          fraction: mi.fraction, sep, mag, geomDelta,
          minAlt: Math.min(moon.hor.altitude, st.hor.altitude),
          sunAlt: sun.hor.altitude,
        })
        const score = flagScore(parts)

        const sample = {
          time: date, body: cand.name, kind: cand.kind, mag, sep,
          moonFraction: mi.fraction, waxing: mi.waxing,
          moonAlt: moon.hor.altitude, moonAz: moon.hor.azimuth,
          compAlt: st.hor.altitude, compAz: st.hor.azimuth,
          sunAlt: sun.hor.altitude,
          sunAngle, compAngle, geomDelta,
          score, parts,
          apparition: mi.waxing ? 'evening' : 'dawn',
        }

        const acc = open.get(cand.name)
        if (acc && t - acc.lastT <= 45 * 60 * 1000) {
          acc.lastT = t
          acc.best.windowEnd = date
          if (score > acc.best.score) {
            sample.windowStart = acc.best.windowStart
            sample.windowEnd = date
            acc.best = sample
          }
        } else {
          if (acc) closeEvent(acc)
          sample.windowStart = date
          sample.windowEnd = date
          open.set(cand.name, { lastT: t, best: sample })
        }
      }
    }

    // Close events that ended before this day boundary.
    for (const [name, acc] of open) {
      if (t - acc.lastT > 45 * 60 * 1000) { closeEvent(acc); open.delete(name) }
    }

    if (t >= endDate.getTime()) { finish(); return 1 }
    return (t - startDate.getTime()) / totalMs
  }

  return { step, events }
}

export function runScanSync(observer, startDate, endDate, opts) {
  const scan = createScan(observer, startDate, endDate, opts)
  while (scan.step() < 1) { /* run to completion */ }
  return scan.events
}

// ---------- "sky right now" ordered brightness list ----------
export function skySnapshot(observer, date) {
  const rows = []

  const mi = moonInfo(date)
  const moon = bodyState('Moon', date, observer)
  rows.push({
    name: 'Moon', kind: 'moon', mag: mi.mag,
    alt: moon.hor.altitude, az: moon.hor.azimuth,
    note: `${Math.round(mi.fraction * 100)}% · ${phaseName(mi.fraction, mi.waxing)}`,
  })

  for (const p of PLANETS) {
    const st = bodyState(p, date, observer)
    const ill = AE.Illumination(AE.Body[p], date)
    const row = { name: p, kind: 'planet', mag: ill.mag, alt: st.hor.altitude, az: st.hor.azimuth, note: '' }
    if (st.hor.altitude <= 0) {
      const rise = AE.SearchRiseSet(AE.Body[p], observer, +1, date, 2)
      row.nextRise = rise ? rise.date : null
    }
    rows.push(row)
  }

  for (const s of STARS) {
    const st = starState(s, date, observer)
    rows.push({ name: s.name, kind: 'star', mag: s.mag, alt: st.hor.altitude, az: st.hor.azimuth, note: '' })
  }

  const up = rows.filter((r) => r.alt > 0).sort((a, b) => a.mag - b.mag)
  const down = rows.filter((r) => r.alt <= 0 && (r.kind === 'planet' || r.kind === 'moon'))
  return { up, down }
}

export function nightWindow(observer, aroundDate) {
  const sunset = AE.SearchRiseSet(AE.Body.Sun, observer, -1, aroundDate, 2)
  const sunrise = sunset ? AE.SearchRiseSet(AE.Body.Sun, observer, +1, sunset.date, 2) : null
  if (!sunset || !sunrise) {
    const s = new Date(aroundDate); s.setHours(18, 0, 0, 0)
    const e = new Date(s.getTime() + 12 * 3600 * 1000)
    return { sunset: s, sunrise: e }
  }
  return { sunset: sunset.date, sunrise: sunrise.date }
}

// Screen-space direction of the Moon's bright limb (radians, 0 = right,
// counterclockwise positive with y up) as seen by this observer right now.
export function brightLimbAngle(observer, date) {
  const moon = bodyState('Moon', date, observer)
  const sun = bodyState('Sun', date, observer)
  const project = screenFrame(moon.hor.azimuth, moon.hor.altitude)
  const d = project(sun.hor.azimuth, sun.hor.altitude)
  return Math.atan2(d.y, d.x)
}

export function moonPhaseCalendar(date) {
  const next = (angle) => AE.SearchMoonPhase(angle, date, 40)?.date ?? null
  return { newMoon: next(0), firstQuarter: next(90), fullMoon: next(180), lastQuarter: next(270) }
}

// Direct probe used by the CLI to explain a specific night regardless of score.
export function probeNight(observer, date) {
  const mi = moonInfo(date)
  const moon = bodyState('Moon', date, observer)
  const sun = bodyState('Sun', date, observer)
  const out = {
    moonFraction: mi.fraction, waxing: mi.waxing,
    moonAlt: moon.hor.altitude, moonAz: moon.hor.azimuth, sunAlt: sun.hor.altitude,
    companions: [],
  }
  for (const p of PLANETS) {
    const st = bodyState(p, date, observer)
    out.companions.push({
      name: p, sep: sepDeg(moon.eq, st.eq), alt: st.hor.altitude, az: st.hor.azimuth,
      mag: AE.Illumination(AE.Body[p], date).mag,
    })
  }
  for (const s of STARS) {
    const st = starState(s, date, observer)
    const sep = sepDeg(moon.eq, st.eq)
    if (sep < 20) out.companions.push({ name: s.name, sep, alt: st.hor.altitude, az: st.hor.azimuth, mag: s.mag })
  }
  out.companions.sort((a, b) => a.sep - b.sep)
  return out
}
