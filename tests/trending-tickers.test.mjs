import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { runInNewContext } from "node:vm"
import ts from "typescript"

const source = await readFile(new URL("../src/app/features/dashboard/pages/dashboard.page.ts", import.meta.url), "utf8")
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true },
})
let instruments = []
let loading = false
let loads = 0
const store = {
  instruments: () => instruments,
  instrumentLoading: () => loading,
  loadInstruments: () => { loads++ },
}
const exports = {}
runInNewContext(outputText, {
  exports,
  require: (name) => name === "@angular/core"
    ? { Component: () => (type) => type, computed: (fn) => fn, inject: () => store }
    : {},
})
const page = new exports.default()
assert.equal(loads, 1)
loading = true
new exports.default()
assert.equal(loads, 1, "Do not duplicate an in-flight instruments request")
const point = (ticker, changePercent) => ({ ticker, changePercent })
instruments = [
  point("UP", 5), point("DOWN", -8), point("BBB", 3), point("AAA", -3),
  point("ZERO", 0), point("SMALL", 1), point("EXTRA", 0.5),
  point("MOVE6", -6), point("MOVE7", 7), point("MOVE9", -9), point("MOVE10", 10),
  point("NULL", null), point("NAN", NaN), point("INFINITE", Infinity),
]
const original = [...instruments]
assert.deepEqual(Array.from(page.trending(), (a) => a.ticker), ["MOVE10", "MOVE9", "DOWN", "MOVE7", "MOVE6", "UP", "AAA", "BBB", "SMALL", "EXTRA"])
assert.deepEqual(instruments, original, "Ranking must not mutate the shared list")
assert.equal(page.currentPrice({ bidPrice: 100, askPrice: 102 }), 101)
assert.equal(page.currentPrice({ bidPrice: null, askPrice: 102 }), 102)
assert.equal(page.currentPrice({ bidPrice: 100, askPrice: null }), 100)
assert.equal(page.currentPrice({ bidPrice: null, askPrice: null }), null)
instruments = [point("ZERO", 0)]
assert.equal(page.trending()[0].changePercent, 0)
instruments = [point("NULL", null)]
assert.equal(page.trending().length, 0)
console.log("Trending ranking, ties, limits, invalid values, loading and price formatting inputs passed")
