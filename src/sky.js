// Sky view: full-horizon trajectory chart for one night. Paths are computed
// once per night/location; the time slider only moves the markers.
import './style.css'
import {
  makeObserver, nightWindow, moonInfo, brightLimbAngle, bodyAltAz, starAltAz,
  sepAltAz, compass, PLANETS, STARS,
} from './astro.js'
import { crescentPath } from './scene.js'
import { PRESETS, loadPrefs, savePrefs } from './prefs.js'

const $ = (sel) => document.querySelector(sel)

const saved = loadPrefs()
const state = {
  lat: saved?.lat ?? PRESETS[0].lat,
  lon: saved?.lon ?? PRESETS[0].lon,
  tz: saved?.tz ?? PRESETS[0].tz,
  showStars: true,
  night: null,   // {sunset, sunrise}
  tracks: null,  // [{name, kind, mag, pts: [{t, az, alt}]}]
  playing: null,
}

const CHART_STARS = STARS.filter((s) => s.mag <= 0.9)
const STEP_MS = 10 * 60 * 1000

const fmtTime = (d) => new Intl.DateTimeFormat('en-NZ', {
  timeZone: state.tz, hour: '2-digit', minute: '2-digit', hour12: false,
}).format(d)

// ---------- geometry of the chart ----------
const W = 1040, H = 470, PAD = { l: 44, r: 16, t: 18, b: 34 }
const ALT_MAX = 88
const xOf = (az) => PAD.l + (az / 360) * (W - PAD.l - PAD.r)
const yOf = (alt) => {
  const h = H - PAD.t - PAD.b
  return PAD.t + (1 - Math.max(0, Math.min(ALT_MAX, alt)) / ALT_MAX) * h
}
const yHorizon = yOf(0)

// ---------- data ----------
function targets() {
  const list = [
    { name: 'Sun', kind: 'sun', mag: -26.7, get: (d, o) => bodyAltAz('Sun', d, o) },
    { name: 'Moon', kind: 'moon', mag: -10, get: (d, o) => bodyAltAz('Moon', d, o) },
    ...PLANETS.map((p) => ({ name: p, kind: 'planet', mag: 0, get: (d, o) => bodyAltAz(p, d, o) })),
  ]
  if (state.showStars) {
    list.push(...CHART_STARS.map((s) => ({ name: s.name, kind: 'star', mag: s.mag, get: (d, o) => starAltAz(s, d, o) })))
  }
  return list
}

function computeNight() {
  const observer = makeObserver(state.lat, state.lon, 30)
  const anchor = new Date($('#night-date').value + 'T12:00:00')
  state.night = nightWindow(observer, anchor)
  const t0 = state.night.sunset.getTime() - 60 * 60000
  const t1 = state.night.sunrise.getTime() + 60 * 60000

  state.tracks = targets().map((tg) => {
    const pts = []
    for (let t = t0; t <= t1; t += STEP_MS) {
      const { az, alt } = tg.get(new Date(t), observer)
      pts.push({ t, az, alt })
    }
    return { ...tg, pts }
  })

  const slider = $('#time-slider')
  slider.min = t0
  slider.max = t1
  const now = Date.now()
  slider.value = now > t0 && now < t1 ? now : state.night.sunset.getTime() + 90 * 60000
  $('#sun-note').textContent = `· sunset ${fmtTime(state.night.sunset)} · sunrise ${fmtTime(state.night.sunrise)}`
}

// ---------- static layer (grid + trails) ----------
function trailPath(pts) {
  // Split the polyline where azimuth wraps 360→0 or the object is far below horizon.
  let d = '', pen = false
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    if (p.alt < -6) { pen = false; continue }
    const wrap = i > 0 && Math.abs(p.az - pts[i - 1].az) > 180
    d += `${pen && !wrap ? 'L' : 'M'}${xOf(p.az).toFixed(1)},${yOf(p.alt).toFixed(1)}`
    pen = true
  }
  return d
}

function renderChart() {
  const ticks = []
  for (let az = 0; az <= 360; az += 45) {
    ticks.push(`<line x1="${xOf(az)}" y1="${PAD.t}" x2="${xOf(az)}" y2="${yHorizon}" class="grid-v"/>
      <text x="${xOf(az)}" y="${H - 12}" text-anchor="middle" class="axis">${az === 360 ? 'N' : compass(az)}</text>`)
  }
  const altLines = [20, 40, 60, 80].map((a) =>
    `<line x1="${PAD.l}" y1="${yOf(a)}" x2="${W - PAD.r}" y2="${yOf(a)}" class="grid-h"/>
     <text x="${PAD.l - 6}" y="${yOf(a) + 4}" text-anchor="end" class="axis">${a}°</text>`)

  const trails = state.tracks.map((tr) =>
    `<path d="${trailPath(tr.pts)}" class="trail trail-${tr.kind}" data-name="${tr.name}"/>`)

  $('#chart').innerHTML = `
  <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" id="sky-svg">
    <rect id="sky-bg" x="0" y="0" width="${W}" height="${yHorizon}" fill="#0a0f1f"/>
    <rect x="0" y="${yHorizon}" width="${W}" height="${H - yHorizon}" fill="#0d1119"/>
    ${altLines.join('')}
    ${ticks.join('')}
    <line x1="${PAD.l}" y1="${yHorizon}" x2="${W - PAD.r}" y2="${yHorizon}" class="horizon"/>
    <text x="${W - PAD.r}" y="${yHorizon + 14}" text-anchor="end" class="axis">horizon</text>
    <g id="trails">${trails.join('')}</g>
    <line id="pair-line" class="pair-line" visibility="hidden"/>
    <g id="markers"></g>
  </svg>`
  renderMarkers()
}

// ---------- dynamic layer (markers at the scrubbed time) ----------
function skyTint(sunAlt) {
  if (sunAlt > -6) return '#25355c'
  if (sunAlt > -12) return '#141f3a'
  if (sunAlt > -18) return '#0d142a'
  return '#0a0f1f'
}

function renderMarkers() {
  const observer = makeObserver(state.lat, state.lon, 30)
  const t = new Date(Number($('#time-slider').value))
  $('#time-readout').textContent = fmtTime(t)

  const els = []
  let moonPos = null, sunAlt = -30
  const positions = []

  for (const tr of state.tracks) {
    const { az, alt } = tr.get(t, observer)
    if (tr.kind === 'sun') sunAlt = alt
    if (alt < -2 && tr.kind !== 'sun') continue
    const x = xOf(az), y = yOf(alt)
    positions.push({ name: tr.name, kind: tr.kind, az, alt, x, y })

    if (tr.kind === 'moon') {
      moonPos = { az, alt, x, y }
      const mi = moonInfo(t)
      const limb = brightLimbAngle(observer, t)
      const rot = Math.atan2(-Math.sin(limb), Math.cos(limb)) * 180 / Math.PI
      els.push(`<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
        <circle r="11" fill="#20293e"/>
        <g transform="rotate(${rot.toFixed(1)})"><path d="${crescentPath(11, Math.max(0.015, mi.fraction))}" fill="#f2ead6"/></g>
        <text x="0" y="-16" text-anchor="middle" class="marker-label moon-label">Moon ${Math.round(mi.fraction * 100)}%</text>
      </g>`)
    } else if (alt >= -0.5) {
      const r = tr.kind === 'sun' ? 9 : tr.kind === 'planet' ? 4.5 : 3
      els.push(`<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
        <circle r="${r}" class="dot dot-${tr.kind}"/>
        <text x="0" y="${-r - 5}" text-anchor="middle" class="marker-label">${tr.name}</text>
      </g>`)
    }
  }

  $('#sky-bg').setAttribute('fill', skyTint(sunAlt))
  $('#markers').innerHTML = els.join('')

  // Flag-pairing hint: Moon within 15° of a bright companion.
  const line = $('#pair-line'), note = $('#pair-note')
  let best = null
  if (moonPos && moonPos.alt > 0) {
    for (const p of positions) {
      if (p.kind !== 'planet' && p.kind !== 'star') continue
      if (p.alt <= 0) continue
      const sep = sepAltAz(moonPos, p)
      if (sep < 15 && (!best || sep < best.sep)) best = { ...p, sep }
    }
  }
  if (best) {
    line.setAttribute('x1', moonPos.x); line.setAttribute('y1', moonPos.y)
    line.setAttribute('x2', best.x); line.setAttribute('y2', best.y)
    line.setAttribute('visibility', 'visible')
    note.textContent = `☾★ Moon–${best.name}: ${best.sep.toFixed(1)}° apart, ${compass(moonPos.az)}, Moon ${Math.round(moonPos.alt)}° up — a flag pairing right now`
  } else {
    line.setAttribute('visibility', 'hidden')
    note.textContent = ''
  }
}

// ---------- play ----------
function togglePlay() {
  const btn = $('#play-btn'), slider = $('#time-slider')
  if (state.playing) { clearInterval(state.playing); state.playing = null; btn.textContent = '▶'; return }
  btn.textContent = '⏸'
  if (Number(slider.value) >= Number(slider.max) - Number(slider.step)) slider.value = slider.min
  state.playing = setInterval(() => {
    const next = Number(slider.value) + Number(slider.step)
    if (next > Number(slider.max)) { togglePlay(); return }
    slider.value = next
    renderMarkers()
  }, 60)
}

// ---------- wiring ----------
function applyLocation(lat, lon, tz) {
  state.lat = lat; state.lon = lon
  if (tz) state.tz = tz
  $('#lat').value = lat.toFixed(4)
  $('#lon').value = lon.toFixed(4)
  savePrefs({ lat: state.lat, lon: state.lon, tz: state.tz })
}

function rebuild() { computeNight(); renderChart() }

function init() {
  const presetSel = $('#preset')
  presetSel.innerHTML = PRESETS.map((p, i) => `<option value="${i}">${p.name}</option>`).join('')
    + `<option value="custom">Custom…</option>`
  const savedIdx = PRESETS.findIndex((p) => Math.abs(p.lat - state.lat) < 1e-6 && Math.abs(p.lon - state.lon) < 1e-6)
  presetSel.value = savedIdx >= 0 ? String(savedIdx) : 'custom'

  presetSel.onchange = () => {
    const p = PRESETS[Number(presetSel.value)]
    if (p) { applyLocation(p.lat, p.lon, p.tz); rebuild() }
  }
  $('#lat').onchange = $('#lon').onchange = () => {
    presetSel.value = 'custom'
    applyLocation(parseFloat($('#lat').value), parseFloat($('#lon').value),
      Intl.DateTimeFormat().resolvedOptions().timeZone)
    rebuild()
  }

  const today = new Date()
  $('#night-date').value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  $('#night-date').onchange = rebuild
  $('#show-stars').onchange = (e) => { state.showStars = e.target.checked; rebuild() }
  $('#time-slider').oninput = renderMarkers
  $('#play-btn').onclick = togglePlay

  applyLocation(state.lat, state.lon, state.tz)
  rebuild()
}

init()
