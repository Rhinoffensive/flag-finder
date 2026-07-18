// SVG rendering of a flag scene as the observer will actually see it:
// crescent tilt from the Sun's sky direction, companion at its true position
// angle and separation. The Moon disk is enlarged (noted on the card) —
// at true scale a 0.5-degree Moon would be a dot.
import { compass } from './astro.js'

let uid = 0

// Lit-crescent path with the bright limb toward +x, disk radius R at origin.
// f is the illuminated fraction; the terminator projects as a half-ellipse.
export function crescentPath(R, f) {
  const rx = Math.max(0.6, R * Math.abs(2 * f - 1))
  const sweep = f < 0.5 ? 0 : 1 // crescent: terminator bulges toward the lit limb
  return `M 0 ${-R} A ${R} ${R} 0 0 1 0 ${R} A ${rx} ${R} 0 0 ${sweep} 0 ${-R} Z`
}

const svgAngle = (angleRad) => Math.atan2(-Math.sin(angleRad), Math.cos(angleRad)) * 180 / Math.PI

// Deterministic tiny PRNG so each card gets a stable background starfield.
function seeded(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5
    return ((h >>> 0) % 10000) / 10000
  }
}

export function renderScene(ev, size = 280) {
  uid++
  const W = size, H = Math.round(size * 0.78)
  const sep = ev.sep

  // Place Moon and companion along the true direction, then shift the pair
  // into a safe area so nothing clips the frame or the caption strip.
  const dir = { x: Math.cos(ev.compAngle), y: -Math.sin(ev.compAngle) } // SVG y-down
  const safe = { left: 40, right: 40, top: 44, bottom: 42 }
  const spanX = (W - safe.left - safe.right) / Math.max(0.18, Math.abs(dir.x))
  const spanY = (H - safe.top - safe.bottom) / Math.max(0.18, Math.abs(dir.y))
  const pxPerDeg = Math.min(30, spanX / Math.max(1.6, sep), spanY / Math.max(1.6, sep))
  const sepPx = sep * pxPerDeg

  // Enlarged Moon, but never so large it swallows the companion.
  const trueMoonR = pxPerDeg * 0.26
  const moonR = Math.max(11, Math.min(26, trueMoonR * 3.2, sepPx * 0.42))
  const enlarge = Math.max(1, moonR / trueMoonR)

  let cx = W / 2 - dir.x * sepPx / 2
  let cy = (safe.top + H - safe.bottom) / 2 - dir.y * sepPx / 2
  let px = cx + dir.x * sepPx
  let py = cy + dir.y * sepPx
  const minX = Math.min(cx - moonR, px - 26), maxX = Math.max(cx + moonR, px + 26)
  const minY = Math.min(cy - moonR, py - 34), maxY = Math.max(cy + moonR, py + 22)
  const dx = minX < 8 ? 8 - minX : maxX > W - 8 ? W - 8 - maxX : 0
  const dy = minY < 8 ? 8 - minY : maxY > H - 30 ? H - 30 - maxY : 0
  cx += dx; px += dx; cy += dy; py += dy

  const rot = svgAngle(ev.sunAngle)
  const glowR = Math.max(3, Math.min(8.5, 3 + (0.4 - ev.mag) * 1.05))

  const rnd = seeded(ev.body + ev.time.toISOString())
  let stars = ''
  for (let i = 0; i < 26; i++) {
    const sx = rnd() * W, sy = rnd() * H, r = 0.4 + rnd() * 0.9
    stars += `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${r.toFixed(2)}" fill="#8fa3c8" opacity="${(0.25 + rnd() * 0.5).toFixed(2)}"/>`
  }

  // Horizon glow strip if the Moon is low enough that ground would be in frame.
  const horizonY = cy + ev.moonAlt * pxPerDeg
  const horizon = horizonY < H + 30
    ? `<rect x="0" y="${Math.min(H - 6, horizonY).toFixed(1)}" width="${W}" height="${H}" fill="url(#ground${uid})" />`
    : ''

  const spikes = [0, 45, 90, 135].map((a) =>
    `<line x1="${-glowR * 2.6}" y1="0" x2="${glowR * 2.6}" y2="0" transform="rotate(${a})" stroke="#fff" stroke-width="0.7" opacity="0.75"/>`
  ).join('')

  return `
<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img"
     aria-label="Sky preview: crescent Moon and ${ev.body}">
  <defs>
    <radialGradient id="sky${uid}" cx="50%" cy="110%" r="130%">
      <stop offset="0%" stop-color="#16203c"/><stop offset="55%" stop-color="#0b1226"/><stop offset="100%" stop-color="#060a18"/>
    </radialGradient>
    <radialGradient id="pg${uid}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff"/><stop offset="45%" stop-color="#fdf6d8"/><stop offset="100%" stop-color="rgba(253,246,216,0)"/>
    </radialGradient>
    <linearGradient id="ground${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a2030"/><stop offset="100%" stop-color="#05070d"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky${uid})"/>
  ${stars}
  ${horizon}
  <g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${rot.toFixed(1)})">
    <circle r="${moonR.toFixed(1)}" fill="#232b3f"/>
    <path d="${crescentPath(moonR, ev.moonFraction)}" fill="#f2ead6"/>
  </g>
  <g transform="translate(${px.toFixed(1)} ${py.toFixed(1)})">
    <circle r="${(glowR * 2.4).toFixed(1)}" fill="url(#pg${uid})" opacity="0.9"/>
    <circle r="${(glowR * 0.55).toFixed(1)}" fill="#ffffff"/>
    ${spikes}
  </g>
  <text x="${(px + 2).toFixed(1)}" y="${(py - glowR * 2.8).toFixed(1)}" class="scene-label" text-anchor="middle">${ev.body}</text>
  <g class="scene-caption">
    <text x="10" y="${H - 10}">${ev.sep.toFixed(1)}° apart · Moon ×${enlarge.toFixed(0)}</text>
    <text x="${W - 10}" y="${H - 10}" text-anchor="end">${compassLabel(ev)}</text>
  </g>
</svg>`
}

const compassLabel = (ev) => `look ${compass(ev.moonAz)} · ${Math.round(ev.moonAlt)}° up`

// Mini crescent used by the moon-phase panel (bright limb toward `angleRad`).
export function renderMiniMoon(fraction, angleRad = Math.PI, size = 64) {
  const R = size * 0.42
  return `
<svg viewBox="${-size / 2} ${-size / 2} ${size} ${size}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <circle r="${R}" fill="#232b3f"/>
  <g transform="rotate(${svgAngle(angleRad).toFixed(1)})">
    <path d="${crescentPath(R, Math.max(0.012, fraction))}" fill="#f2ead6"/>
  </g>
</svg>`
}
