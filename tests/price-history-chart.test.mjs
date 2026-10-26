import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { runInNewContext } from "node:vm"
import ts from "typescript"

// Exercise chart geometry independently of Angular's browser injection context.
const source = await readFile(new URL("../src/app/shared/charts/price-history-chart.component.ts", import.meta.url), "utf8")
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true },
})
const signal = (initial) => {
  let value = initial
  const getter = () => value
  getter.set = (next) => { value = next }
  return getter
}
const input = Object.assign(signal, { required: () => signal("AAPL") })
const exports = {}
runInNewContext(outputText, {
  exports,
  require: (name) => {
    if (name === "@angular/core") return { Component: () => (type) => type, computed: (fn) => fn, inject: () => ({}), input, signal }
    if (name === "@angular/core/rxjs-interop") return { toObservable: () => ({ pipe: () => ({}) }), toSignal: (_, options) => signal(options.initialValue) }
    if (name === "rxjs") return { switchMap: () => ({}) }
    return {}
  },
})
const chart = new exports.default()
const start = Date.parse("2026-10-21T00:00:00Z")
chart.period = signal("1D")
chart.range = () => ({ from: new Date(start), to: new Date(start + 86400000) })
const point = (minutes, price) => ({ ticker: "AAPL", price, timestamp: new Date(start + minutes * 60000).toISOString() })
chart.state.set({ loading: false, error: null, points: [point(60, 100), point(61, 110), point(120, 105)] })
assert.ok(Math.abs(chart.coordinates()[0].x - (65 + 625 / 24)) < 1e-9)
assert.equal(chart.coordinates()[0].y, 170)
assert.equal(chart.coordinates()[1].y, 30)
assert.equal((chart.line().match(/M/g) ?? []).length, 1)
assert.equal((chart.line().match(/L/g) ?? []).length, 2)
chart.hoverTime.set(start + 90 * 60000)
assert.equal(chart.selected().price, 110)
chart.hoverTime.set(start + 59 * 60000)
assert.equal(chart.selected(), null)
chart.hoverTime.set(start + 121 * 60000)
assert.equal(chart.selected(), null)
chart.hoverTime.set(start + 61 * 60000)
assert.equal(chart.selected().price, 110)
chart.state.set({ loading: false, error: null, points: [point(60, 100)] })
assert.equal(chart.coordinates()[0].y, 100)
assert.equal(chart.line(), `M${chart.coordinates()[0].x},100l0,0`)
chart.state.set({ loading: false, error: null, points: [] })
assert.equal(chart.line(), "")
assert.equal(chart.selected(), null)
for (const [period, seconds] of [["1D", 60], ["1W", 900], ["1M", 3600], ["1Y", 86400]]) {
  chart.period.set(period)
  assert.equal(chart.bucketSeconds(), seconds)
}
console.log("Price history chart geometry, connected gaps, blank boundaries, selection, empty/flat data and periods passed")
