import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { signal } from "@angular/core"
import { EMPTY, catchError, exhaustMap, firstValueFrom, forkJoin, interval, map, of, startWith, switchMap, timeout } from "rxjs"
import { TestScheduler } from "rxjs/testing"
import ts from "typescript"

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText
const source = await read("src/app/core/state/portfolio.store.ts")
const polling = source.slice(source.indexOf("  startMarketDataPolling()"), source.indexOf("  priceChanged("))
const Poller = new Function(
  "interval", "startWith", "exhaustMap", "timeout", "catchError", "EMPTY",
  `${compile(`class Poller { ${polling} }`)}\nreturn Poller`,
)(interval, startWith, exhaustMap, timeout, catchError, EMPTY)

function setup(getInstruments) {
  const poller = new Poller()
  poller.marketDataService = { getInstruments }
  poller.instruments = signal([])
  poller.instrumentLoading = signal(true)
  poller.instrumentError = signal(null)
  poller.applyInstrumentPrices = () => {}
  return poller
}
const quote = (price) => [{ ticker: "AAPL", bidPrice: price, askPrice: price + 1 }]

// A batch slower than the polling interval must complete, not restart forever.
new TestScheduler(() => {}).run(({ cold }) => {
  let requests = 0
  const poller = setup(() => {
    requests++
    return cold("6000ms (a|)", { a: quote(requests * 100) })
  })
  poller.startMarketDataPolling()
  poller.startMarketDataPolling()
  cold("6001ms a").subscribe(() => {
    assert.equal(requests, 1, "Do not overlap or duplicate polling")
    assert.equal(poller.instruments()[0].bidPrice, 100)
    assert.equal(poller.instrumentLoading(), false)
  })
  cold("16001ms a").subscribe(() => {
    assert.equal(poller.instruments()[0].bidPrice, 200)
    assert.equal(requests, 2)
    poller.marketPolling.unsubscribe()
  })
})

new TestScheduler(() => {}).run(({ cold }) => {
  let requests = 0
  const poller = setup(() => ++requests === 1
    ? cold("1ms #")
    : cold("1ms (a|)", { a: quote(200) }))
  poller.instruments.set(quote(100))
  poller.startMarketDataPolling()
  cold("2ms a").subscribe(() => {
    assert.match(poller.instrumentError(), /out of date/)
    assert.equal(poller.instruments()[0].bidPrice, 100, "Retain prior quotes on error")
  })
  cold("5002ms a").subscribe(() => {
    assert.equal(poller.instrumentError(), null)
    assert.equal(poller.instruments()[0].bidPrice, 200)
    poller.marketPolling.unsubscribe()
  })
})

new TestScheduler(() => {}).run(({ cold }) => {
  let requests = 0
  const poller = setup(() => ++requests === 1
    ? cold("-")
    : cold("1ms (a|)", { a: quote(300) }))
  poller.startMarketDataPolling()
  cold("15001ms a").subscribe(() => assert.match(poller.instrumentError(), /retrying automatically/))
  cold("20002ms a").subscribe(() => {
    assert.equal(poller.instruments()[0].bidPrice, 300, "Polling must recover from a timed-out batch")
    poller.marketPolling.unsubscribe()
  })
})

const serviceSource = await read("src/app/core/api/market-data.service.ts")
let tickers = []
const Service = new Function("inject", "HttpClient", "BASE_PATH", "forkJoin", "map", "of", "switchMap", "dailyChangePercent",
  `${compile(serviceSource.slice(serviceSource.indexOf("export class")).replace("export ", ""))}\nreturn MarketDataService`,
)(() => null, "http", "base", forkJoin, map, of, switchMap, (instrument) => dailyChangePercent(instrument))
const service = new Service()
service.getTickers = () => of(tickers)
service.getInstrument = (ticker) => of({ ticker })
assert.deepEqual(await firstValueFrom(service.getInstruments()), [])
tickers = ["AAPL", "MSFT"]
assert.deepEqual(await firstValueFrom(service.getInstruments()), [{ ticker: "AAPL" }, { ticker: "MSFT" }])
console.log("Market refresh tests passed: slow batches, failures, timeout recovery, duplicate start, and empty catalogue.")

const priceSource = await read("src/app/core/models/market-price.ts")
const { marketPrice, dailyChangePercent } = new Function(
  `${compile(priceSource.slice(priceSource.indexOf("export function")).replaceAll("export ", ""))}\nreturn { marketPrice, dailyChangePercent }`,
)()
const forex = { bidPrice: 0.6599, askPrice: 0.6601, previousClose: 0.658 }
assert.equal(marketPrice(forex), 0.66)
assert.ok(Math.abs(dailyChangePercent(forex) - 0.303951367781155) < 0.000001)
assert.equal(dailyChangePercent({ bidPrice: 98, askPrice: 100, previousClose: 100 }), -1)
assert.equal(dailyChangePercent({ bidPrice: 100, askPrice: 100, previousClose: 100 }), 0)
assert.equal(dailyChangePercent({ bidPrice: 200, askPrice: 200, previousClose: 100 }), 100, "Do not clamp legitimate moves")
for (const close of [null, undefined, 0, -1, NaN, Infinity]) {
  assert.equal(dailyChangePercent({ ...forex, previousClose: close }), null)
}
assert.equal(marketPrice({ bidPrice: 0, askPrice: 0.66 }), 0.66)
assert.equal(marketPrice({ bidPrice: null, askPrice: null }), null)
assert.equal(dailyChangePercent({ bidPrice: null, askPrice: null, previousClose: 1 }), null)
assert.equal(dailyChangePercent({ bidPrice: NaN, askPrice: Infinity, previousClose: 1 }), null)
service.toInstrument = Service.prototype.toInstrument
const normalized = service.toInstrument({ ...forex, changePercent: -48.67 })
assert.equal(normalized.changePercent, dailyChangePercent(forex), "Ignore inconsistent backend percentage")
console.log("Daily percentage tests passed: forex precision, midpoint, gains/losses, missing baselines, and backend override.")

const requested = []
let latestQuotes = [
  { ticker: "AUD-USD", bid_price: 0.65, ask_price: 0.6502, recorded_at: "2026-01-01T10:00:00Z", quote_timestamp: "2026-01-01T10:00:00Z" },
  { ticker: "AUD-USD", bid_price: 0.66, ask_price: 0.6602, recorded_at: "2026-01-01T10:00:05Z", quote_timestamp: "2026-01-01T10:00:05Z" },
  { ticker: "OTHER", bid_price: 999, ask_price: 999, recorded_at: "2026-01-01T10:01:00Z" },
]
const liveService = new Service()
liveService.apiBasePath = "/api"
liveService.http = { get: (url) => {
  requested.push(url)
  return of(url.includes("/instruments/")
    ? { ticker: "AUD-USD", displayName: "Australian Dollar", ...forex, bidPrice: 1, askPrice: 1, volume: 100 }
    : latestQuotes)
} }
const initial = await firstValueFrom(liveService.getInstrument("AUD/USD"))
assert.equal(initial.bidPrice, 0.66)
assert.equal(initial.askPrice, 0.6602)
assert.equal(initial.volume, 100)
assert.equal(initial.displayName, "Australian Dollar")
assert.equal(initial.changePercent, dailyChangePercent(initial))
assert.deepEqual(requested, [
  "/api/v1/trading/market-data/instruments/AUD-USD",
  "/api/v1/trading/market-data/prices/AUD-USD",
])
latestQuotes = [{ ...latestQuotes[1], bid_price: 0.661, ask_price: 0.6612 }]
const updated = await firstValueFrom(liveService.getInstrument("AUD-USD"))
assert.equal(updated.bidPrice, 0.661, "New latest quotes must replace stagnant metadata prices")
assert.notEqual(updated.changePercent, initial.changePercent)
latestQuotes = []
await assert.rejects(firstValueFrom(liveService.getInstrument("AUD-USD")), /No latest quote/)
console.log("Markets latest-price integration tests passed: refreshed quotes, matching ticker, timestamps, statistics, and daily change.")
