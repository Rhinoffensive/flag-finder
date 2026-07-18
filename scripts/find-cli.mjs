// CLI runner: scan for flag scenes and explain a specific night.
// Usage: node scripts/find-cli.mjs [--lat -36.8485] [--lon 174.7633] \
//          [--from 2026-07-10] [--days 30] [--probe 2026-07-17T18:30+12:00] [--tz Pacific/Auckland]
import { makeObserver, runScanSync, probeNight, moonInfo, phaseName, compass } from '../src/astro.js'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]])
    return acc
  }, [])
)

const lat = parseFloat(args.lat ?? '-36.8485')
const lon = parseFloat(args.lon ?? '174.7633')
const tz = args.tz ?? 'Pacific/Auckland'
const from = args.from ? new Date(args.from) : new Date()
const days = parseInt(args.days ?? '30', 10)

const observer = makeObserver(lat, lon, 30)
const fmt = (d, o = {}) => new Intl.DateTimeFormat('en-NZ', {
  timeZone: tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, ...o,
}).format(d)

if (args.probe) {
  const d = new Date(args.probe)
  console.log(`\nProbe ${d.toISOString()} (${fmt(d)} ${tz}) at ${lat}, ${lon}`)
  const p = probeNight(observer, d)
  const mi = moonInfo(d)
  console.log(`Moon: ${(p.moonFraction * 100).toFixed(1)}% ${phaseName(p.moonFraction, p.waxing)}, alt ${p.moonAlt.toFixed(1)}°, az ${p.moonAz.toFixed(1)}° (${compass(p.moonAz)}), sun alt ${p.sunAlt.toFixed(1)}°, moon mag ${mi.mag.toFixed(1)}`)
  console.log('Companions by separation:')
  for (const c of p.companions.slice(0, 8)) {
    console.log(`  ${c.name.padEnd(16)} sep ${c.sep.toFixed(2).padStart(6)}°  alt ${c.alt.toFixed(1).padStart(6)}°  az ${c.az.toFixed(0).padStart(4)}° (${compass(c.az)})  mag ${c.mag.toFixed(1)}`)
  }
}

console.log(`\nScanning ${days} days from ${from.toDateString()} at ${lat}, ${lon}…`)
const t0 = Date.now()
const events = runScanSync(observer, from, new Date(from.getTime() + days * 86400000))
console.log(`${events.length} events in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`)

events.sort((a, b) => a.time - b.time)
for (const e of events) {
  console.log(
    `${fmt(e.time).padEnd(20)} Moon×${e.body.padEnd(10)} score ${String(Math.round(e.score)).padStart(3)}  ` +
    `sep ${e.sep.toFixed(1).padStart(5)}°  crescent ${(e.moonFraction * 100).toFixed(0).padStart(2)}%  ` +
    `mag ${e.mag.toFixed(1).padStart(5)}  alt ${e.moonAlt.toFixed(0).padStart(3)}°  ${compass(e.moonAz).padEnd(3)}  ${e.apparition}`
  )
}
