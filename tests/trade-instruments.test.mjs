import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { runInNewContext } from "node:vm"
import { webcrypto } from "node:crypto"
import ts from "typescript"

const signal = (initial) => {
  let value = initial
  const getter = () => value
  getter.set = (next) => { value = next }
  getter.update = (fn) => { value = fn(value) }
  return getter
}
async function load(path, require) {
  const source = await readFile(new URL(path, import.meta.url), "utf8")
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true },
  })
  const exports = {}
  runInNewContext(outputText, { exports, require, structuredClone, crypto: webcrypto })
  return exports
}
const data = await load("../src/app/core/models/data.ts", () => ({}))
const core = {
  Injectable: () => (type) => type,
  Component: () => (type) => type,
  signal,
  inject: () => ({}),
}
const { default: Store } = await load("../src/app/core/state/portfolio.store.ts", (name) => {
  if (name === "@angular/core") return core
  if (name === "../models/data") return data
  return {}
})
const store = new Store({})
store.session.set({ role: "client", username: "test" })
store.clients.set([{ username: "test", cash: 10000 }])
store.positions.set([])
store.orders.set([])
store.transactions.set([])
const instrument = { ticker: "CAT", displayName: "Caterpillar", assetType: "STOCK", bidPrice: 200, askPrice: 202 }
assert.equal(store.assets.some((asset) => asset.symbol === "CAT"), false)
store.instruments.set([instrument])
store.selectedInstrument.set(instrument)
store.selectedInstrument.set({ ...instrument, bidPrice: null, askPrice: null })

let callback
let routeSymbol = "CAT"
const params = { get: () => routeSymbol }
const route = { paramMap: { pipe: () => ({ subscribe: (fn) => { callback = fn } }) }, snapshot: { queryParamMap: { get: () => "Buy" } } }
const router = { navigate: () => {} }
const routerTypes = { ActivatedRoute: {}, Router: {} }
const loaded = []
store.loadInstrument = (ticker) => loaded.push(ticker)
const { default: TradePage } = await load("../src/app/features/markets/pages/trade.page.ts", (name) => {
  if (name === "@angular/core") return { ...core, inject: (token) => token === Store ? store : token === routerTypes.ActivatedRoute ? route : router }
  if (name === "@angular/router") return routerTypes
  if (name === "@angular/core/rxjs-interop") return { toSignal: () => () => params, takeUntilDestroyed: () => ({}) }
  if (name === "../../../core/state/portfolio.store") return { default: Store }
  return {}
})
const page = new TradePage()
callback(params)
assert.equal(loaded.at(-1), "CAT")
assert.equal(page.asset.price, null)
page.check()
assert.match(page.error, /No valid market price/)
store.selectedInstrument.set(instrument)
assert.equal(page.asset.name, "Caterpillar")
page.quantity = 1
page.check()
assert.equal(page.review, true)
routeSymbol = " btc/usd "
callback(params)
assert.equal(loaded.at(-1), "BTC-USD")
assert.equal(page.review, false)
assert.equal(page.asset, null, "Never display a stale instrument for a different route")
store.selectedInstrument.set({ ticker: "BTC-USD", assetType: "CRYPTO", displayName: null, bidPrice: null, askPrice: 100 })
assert.equal(page.asset.price, 100)
page.quantity = 0.1
page.check()
assert.equal(page.review, true)
console.log("Trade page backend asset lookup, missing prices, route changes and review checks passed")
