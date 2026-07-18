// Location preferences shared between the scene-finder and sky-view pages.
const KEY = 'ayyildiz-prefs'

export function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? null } catch { return null }
}

export function savePrefs(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* private mode */ }
}

export const PRESETS = [
  { name: 'Auckland', lat: -36.8485, lon: 174.7633, tz: 'Pacific/Auckland' },
  { name: 'Wellington', lat: -41.2866, lon: 174.7756, tz: 'Pacific/Auckland' },
  { name: 'Istanbul', lat: 41.0082, lon: 28.9784, tz: 'Europe/Istanbul' },
  { name: 'Ankara', lat: 39.9334, lon: 32.8597, tz: 'Europe/Istanbul' },
  { name: 'Sydney', lat: -33.8688, lon: 151.2093, tz: 'Australia/Sydney' },
  { name: 'London', lat: 51.5074, lon: -0.1278, tz: 'Europe/London' },
]
