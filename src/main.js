import './style.css'
import {
  makeObserver, createScan, skySnapshot, nightWindow, moonInfo, moonPhaseCalendar,
  phaseName, compass, brightLimbAngle,
} from './astro.js'
import { renderScene, renderMiniMoon } from './scene.js'

const $ = (sel) => document.querySelector(sel)

const PRESETS = [
  { name: 'Auckland', lat: -36.8485, lon: 174.7633, tz: 'Pacific/Auckland' },
  { name: 'Wellington', lat: -41.2866, lon: 174.7756, tz: 'Pacific/Auckland' },
  { name: 'Istanbul', lat: 41.0082, lon: 28.9784, tz: 'Europe/Istanbul' },
  { name: 'Ankara', lat: 39.9334, lon: 32.8597, tz: 'Europe/Istanbul' },
  { name: 'Sydney', lat: -33.8688, lon: 151.2093, tz: 'Australia/Sydney' },
  { name: 'London', lat: 51.5074, lon: -0.1278, tz: 'Europe/London' },
]

const state = {
  lat: PRESETS[0].lat,
  lon: PRESETS[0].lon,
  tz: PRESETS[0].tz,
  months: 12,
  minScore: 40,
  sort: 'date',
  events: [],
  scanning: false,
  snapshotDate: new Date(),
}

// ---------- time formatting in the observing location's zone ----------
const fmt = (date, opts) =>
  new Intl.DateTimeFormat('en-NZ', { timeZone: state.tz, ...opts }).format(date)
const fmtDate = (d) => fmt(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const fmtTime = (d) => fmt(d, { hour: '2-digit', minute: '2-digit', hour12: false })

function relativeNight(d) {
  const days = Math.round((stripTime(d) - stripTime(new Date())) / 86400000)
  if (days === 0) return 'tonight'
  if (days === -1) return 'last night'
  if (days === 1) return 'tomorrow night'
  return days < 0 ? `${-days} nights ago` : `in ${days} nights`
}
const stripTime = (d) => { const x = new Date(d); x.setHours(12, 0, 0, 0); return x.getTime() }

// ---------- scan ----------
function startScan() {
  if (state.scanning) return
  state.scanning = true
  state.events = []
  $('#scan-btn').disabled = true
  $('#progress-wrap').hidden = false

  const observer = makeObserver(state.lat, state.lon, 30)
  const start = new Date(Date.now() - 7 * 86400000) // include last week: verify what you saw
  const end = new Date(Date.now() + state.months * 30.44 * 86400000)
  const scan = createScan(observer, start, end)

  const pump = () => {
    let p = 0
    const budget = performance.now() + 30 // keep the UI at ~30fps while scanning
    while (performance.now() < budget) { p = scan.step(); if (p >= 1) break }
    $('#progress-bar').style.width = `${Math.round(p * 100)}%`
    $('#progress-text').textContent = `Scanning the sky… ${Math.round(p * 100)}%`
    if (p < 1) { setTimeout(pump, 0) } else {
      state.events = scan.events
      state.scanning = false
      $('#scan-btn').disabled = false
      $('#progress-wrap').hidden = true
      renderResults()
    }
  }
  pump()
}

// ---------- results ----------
const grade = (s) => s >= 78 ? ['textbook ay-yıldız', 'g4'] : s >= 62 ? ['excellent', 'g3'] : s >= 48 ? ['good', 'g2'] : ['loose match', 'g1']

function renderResults() {
  const list = state.events
    .filter((e) => e.score >= state.minScore)
    .sort((a, b) => state.sort === 'score' ? b.score - a.score : a.time - b.time)

  $('#result-count').textContent = state.events.length
    ? `${list.length} scene${list.length === 1 ? '' : 's'} found (of ${state.events.length} candidates)`
    : ''

  const el = $('#results')
  if (!list.length) {
    el.innerHTML = `<p class="empty">No scenes above the score threshold. Lower the minimum score or widen the search range.</p>`
    return
  }

  el.innerHTML = list.map((ev) => {
    const [label, cls] = grade(ev.score)
    const past = ev.time < Date.now()
    const geomOk = ev.parts.geom > 0.55
    return `
    <article class="card ${past ? 'past' : ''}">
      <div class="scene">${renderScene(ev)}</div>
      <div class="card-body">
        <div class="card-top">
          <span class="badge ${cls}">${Math.round(ev.score)} · ${label}</span>
          ${past ? `<span class="badge past-badge">past</span>` : ''}
        </div>
        <h3>Moon × ${ev.body}</h3>
        <p class="when">${fmtDate(ev.time)} · best ${fmtTime(ev.time)} <span class="dim">(${relativeNight(ev.time)}, ${ev.apparition} sky)</span></p>
        <p class="details">
          ${Math.round(ev.moonFraction * 100)}% crescent · ${ev.sep.toFixed(1)}° apart ·
          ${ev.body} mag ${ev.mag.toFixed(1)} ${geomOk ? '· star off the crescent’s opening ✓' : ''}
        </p>
        <p class="details dim">
          Look ${compass(ev.moonAz)} (az ${Math.round(ev.moonAz)}°), ${Math.round(ev.moonAlt)}° above the horizon ·
          window ${fmtTime(ev.windowStart)}–${fmtTime(ev.windowEnd)}
        </p>
      </div>
    </article>`
  }).join('')
}

// ---------- tonight panel ----------
let night = null

function refreshNight() {
  const observer = makeObserver(state.lat, state.lon, 30)
  const anchor = new Date($('#night-date').value + 'T12:00:00')
  night = nightWindow(observer, anchor)
  const slider = $('#time-slider')
  slider.min = night.sunset.getTime() - 45 * 60000
  slider.max = night.sunrise.getTime() + 45 * 60000
  const now = Date.now()
  slider.value = now > +slider.min && now < +slider.max
    ? now
    : night.sunset.getTime() + 90 * 60000
  renderSnapshot()
}

function renderSnapshot() {
  const observer = makeObserver(state.lat, state.lon, 30)
  const t = new Date(Number($('#time-slider').value))
  state.snapshotDate = t
  $('#time-readout').textContent = `${fmtTime(t)} (${state.tz})`
  $('#sun-note').textContent = `sunset ${fmtTime(night.sunset)} · sunrise ${fmtTime(night.sunrise)}`

  const { up, down } = skySnapshot(observer, t)

  $('#sky-table').innerHTML = `
    <tr><th>#</th><th>Object</th><th>Mag</th><th>Alt</th><th>Direction</th><th></th></tr>
    ${up.map((r, i) => `
      <tr class="k-${r.kind}">
        <td>${i + 1}</td>
        <td>${r.name} <span class="chip">${r.kind}</span></td>
        <td>${r.mag.toFixed(1)}</td>
        <td>${Math.round(r.alt)}°</td>
        <td>${compass(r.az)} <span class="dim">${Math.round(r.az)}°</span></td>
        <td class="dim">${r.note}</td>
      </tr>`).join('')}
    ${down.length ? `<tr class="below-head"><td colspan="6">below the horizon</td></tr>` : ''}
    ${down.map((r) => `
      <tr class="below">
        <td></td><td>${r.name}</td><td>${r.mag.toFixed(1)}</td>
        <td colspan="3" class="dim">${r.nextRise ? `rises ${fmtTime(r.nextRise)}` : 'not up'}</td>
      </tr>`).join('')}
  `

  const mi = moonInfo(t)
  const cal = moonPhaseCalendar(t)
  $('#moon-widget').innerHTML = `
    ${renderMiniMoon(mi.fraction, brightLimbAngle(observer, t))}
    <div>
      <strong>${phaseName(mi.fraction, mi.waxing)}</strong>
      <span class="dim">${Math.round(mi.fraction * 100)}% lit · ${mi.waxing ? 'waxing' : 'waning'}</span>
      <span class="dim">new ${cal.newMoon ? fmt(cal.newMoon, { day: 'numeric', month: 'short' }) : '—'} ·
      full ${cal.fullMoon ? fmt(cal.fullMoon, { day: 'numeric', month: 'short' }) : '—'}</span>
    </div>`
}

// ---------- wiring ----------
function applyLocation(lat, lon, tz) {
  state.lat = lat; state.lon = lon
  if (tz) state.tz = tz
  $('#lat').value = lat.toFixed(4)
  $('#lon').value = lon.toFixed(4)
  $('#tz-note').textContent = `times shown in ${state.tz}`
}

function init() {
  const presetSel = $('#preset')
  presetSel.innerHTML = PRESETS.map((p, i) => `<option value="${i}">${p.name}</option>`).join('')
    + `<option value="custom">Custom…</option>`
  presetSel.onchange = () => {
    const p = PRESETS[Number(presetSel.value)]
    if (p) { applyLocation(p.lat, p.lon, p.tz); startScan(); refreshNight() }
  }

  $('#lat').onchange = $('#lon').onchange = () => {
    presetSel.value = 'custom'
    applyLocation(parseFloat($('#lat').value), parseFloat($('#lon').value),
      Intl.DateTimeFormat().resolvedOptions().timeZone)
    startScan(); refreshNight()
  }

  $('#geo-btn').onclick = () => {
    navigator.geolocation?.getCurrentPosition((pos) => {
      presetSel.value = 'custom'
      applyLocation(pos.coords.latitude, pos.coords.longitude,
        Intl.DateTimeFormat().resolvedOptions().timeZone)
      startScan(); refreshNight()
    })
  }

  $('#months').onchange = (e) => { state.months = Number(e.target.value); startScan() }
  $('#scan-btn').onclick = startScan

  $('#min-score').oninput = (e) => {
    state.minScore = Number(e.target.value)
    $('#min-score-val').textContent = state.minScore
    renderResults()
  }
  $('#sort').onchange = (e) => { state.sort = e.target.value; renderResults() }

  const today = new Date()
  $('#night-date').value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  $('#night-date').onchange = refreshNight
  $('#time-slider').oninput = renderSnapshot

  applyLocation(state.lat, state.lon, state.tz)
  refreshNight()
  startScan()
}

init()
