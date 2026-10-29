import assert from "node:assert/strict"
import { mkdtemp, readFile, writeFile, symlink, rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import ts from "typescript"
import "@angular/compiler"
import { DatePipe } from "@angular/common"
import { signal } from "@angular/core"
import { of } from "rxjs"

const backendTransactions = [
  {
    transactionId: 1,
    clientId: 47,
    type: "DEPOSIT",
    amount: 1000,
    timestamp: "2026-10-22T14:30:00Z",
  },
]
const backendHoldings = [
  { clientId: 47, ticker: "AAPL", quantity: 36 },
  { clientId: 47, ticker: "MSFT", quantity: 12 },
]
const backendInstruments = [
  {
    ticker: "AAPL",
    asset_type: "STOCK",
    displayName: "Apple Inc.",
    previousClose: 249,
    open: 249.5,
    volume: 100,
    averageVolume: 100,
    bidPrice: 250.1,
    askPrice: 250.25,
    bidSize: 100,
    askSize: 100,
    quoteTimestamp: "2026-10-22T14:30:00Z",
    recordedAt: "2026-10-22T14:30:02Z",
    changePercent: 0.5,
  },
]

class FakeHttpClient {
  requests = []

  get(url) {
    this.requests.push({ method: "GET", url })
    const path = new URL(url, "http://localhost").pathname
    if (path.endsWith("/api/v1/trading/market-data/prices")) return of(backendMarketPrices)
    if (path.endsWith("/api/v1/holdings")) return of(backendHoldings)
    if (url.includes("/api/v1/holdings/quantity")) return of({ quantity: 36 })
    if (url.includes("/api/v1/holdings/AAPL")) return of(backendHoldings[0])
    return of(backendTransactions)
  }

  post(url) {
    this.requests.push({ method: "POST", url })
    const amount = Number(new URL(url, "http://localhost").searchParams.get("amount"))
    return of({
      transactionId: this.requests.length,
      clientId: 47,
      type: url.includes("withdrawal") ? "WITHDRAWAL" : "DEPOSIT",
      amount,
      timestamp: "2026-10-22T15:00:00Z",
    })
  }
}

class FakeMarketDataService {
  getInstruments() {
    return of(backendInstruments)
  }

  getInstrument() {
    return of(null)
  }
}

// Compile the service for Node without changing the Angular application build.
const temporary = await mkdtemp(join(process.cwd(), ".veridian-test-"))
try {
  await symlink(
    fileURLToPath(new URL("../../node_modules", import.meta.url)),
    join(temporary, "node_modules"),
  )
  for (const name of ["data", "api-endpoints", "store"]) {
    const sourcePath = {
      data: "../src/app/core/models/data.ts",
      "api-endpoints": "../src/app/core/api/api-endpoints.ts",
      store: "../src/app/core/state/portfolio.store.ts",
    }[name]
    const source = await readFile(
      new URL(sourcePath, import.meta.url),
      "utf8",
    )
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
        experimentalDecorators: true,
      },
    })
    const output = name === "store"
      ? outputText
          .replaceAll('"../models/data"', '"./data.mjs"')
          .replaceAll('"../api/api-endpoints"', '"./api-endpoints.mjs"')
      : outputText
    await writeFile(join(temporary, `${name}.mjs`), output)
  }
  const { default: Store } = await import(
    pathToFileURL(join(temporary, "store.mjs"))
  )
  const http = new FakeHttpClient()
  const store = new Store(http, new FakeMarketDataService())
  store.login("client", "newclient")
  assert.equal(store.cash, 0)
  assert.equal(store.name, "newclient")
  assert.equal(store.holdings.length, 0)
  assert.equal(store.clientOrders.length, 0)
  assert.equal(store.clientTransactions.length, 0)
  assert.throws(() => store.trade("NVDA", "Buy", 1), /buying power/)
  assert.throws(() => store.trade("NVDA", "Sell", 1), /holdings/)
  store.funds("Deposit", 1000).subscribe()
  store.trade("NVDA", "Buy", 2)
  assert.equal(store.cash, 714.76)
  assert.equal(store.holdings[0].quantity, 2)
  assert.equal(store.clientOrders[0].client, "newclient")
  assert.equal(store.clientOrders[0].status, "Fulfilled")
  assert.match(store.clientOrders[0].date, /[A-Za-z]+ \d{1,2}, \d{4}.*[AP]M/)
  assert.match(store.clientTransactions[0].date, /[AP]M/)
  assert.throws(() => store.trade("NVDA", "Buy", 0.5), /whole shares/)
  assert.throws(() => store.funds("Withdrawal", 10000), /available balance/)
  assert.throws(() => store.funds("Deposit", NaN), /positive amount/)
  assert.throws(() => store.funds("Deposit", 3000001), /3,000,000/)
  store.trade("NVDA", "Sell", 1)
  assert.equal(store.holdings[0].quantity, 1)
  store.login("client", "jordanlee")
  assert.equal(store.name, "Jordan Lee")
  assert.equal(store.cash, 18420.12)
  assert.equal(
    store.clientOrders.some((o) => o.client !== "jordanlee"),
    false,
  )
  store.login("client", "another")
  assert.equal(store.cash, 0)
  assert.equal(store.holdings.length, 0)
  store.login("client", "newclient")
  assert.equal(store.holdings[0].quantity, 1)
  store.loadClientTransactions()
  assert.equal(store.cash, 1000)
  assert.ok(http.requests.at(-1).url.endsWith("/api/v1/trading/transactions"))
  assert.equal(
    http.requests.some((request) => request.url.includes("amount=1000")),
    true,
  )
  store.loadHoldings()
  assert.deepEqual(
    store.holdings.map(({ symbol, quantity }) => ({ symbol, quantity })),
    [
      { symbol: "AAPL", quantity: 36 },
      { symbol: "MSFT", quantity: 12 },
    ],
  )
  assert.equal((await store.getHolding("AAPL").toPromise()).quantity, 36)
  assert.equal((await store.getHoldingQuantity("AAPL").toPromise()).quantity, 36)
  store.loadInstruments()
  assert.equal(store.instruments()[0].askPrice, 250.25)
  store.login("reporter", "rpatel")
  assert.equal(store.name, "Rina Patel")
  assert.throws(
    () => store.saveAccount("clients", store.clients()[0]),
    /Administrator/,
  )
  store.login("admin", "admin")
  store.saveAccount("clients", {
    id: 99,
    username: "managed",
    email: "m@example.com",
    fullName: "Managed Client",
    cash: 0,
    status: "Active",
  })
  assert.equal(
    store.clients().find((a) => a.id === 99).fullName,
    "Managed Client",
  )
  assert.throws(
    () => store.saveAccount("clients", { ...store.clients()[0], id: 100 }),
    /already exists/,
  )
  const transactionSource = await readFile(
    new URL("../src/app/features/transactions/pages/transactions.page.ts", import.meta.url),
    "utf8",
  )
  assert.match(transactionSource, /\{\{ formatTimestamp\(t\.date\) \}\}/)
  assert.doesNotMatch(transactionSource, /admin\s*\?\s*formatTimestamp/)
  const transactionModule = ts.transpileModule(
    transactionSource.slice(transactionSource.indexOf("export default class")).replace("export default ", ""),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } },
  )
  const TransactionsPage = new Function(
    "inject", "Store", "HttpClient", "BASE_PATH", "signal", "DatePipe",
    `${transactionModule.outputText}\nreturn TransactionsPage`,
  )(() => ({}), "store", "http", "base", signal, DatePipe)
  const transactionPage = new TransactionsPage()
  for (const role of ["client", "reporter", "admin"]) {
    transactionPage.store = { session: () => ({ role }) }
    for (const value of ["2026-10-22T21:50:00.58554Z", "2026-10-22T21:50:00+05:30"]) {
      assert.equal(transactionPage.formatTimestamp(value), new DatePipe("en-US").transform(new Date(value), "medium"))
      assert.match(transactionPage.formatTimestamp(value), /[AP]M/)
    }
    assert.equal(
      transactionPage.formatTimestamp("2026-10-22 13:13:45"),
      new DatePipe("en-US").transform(new Date("2026-10-22T13:13:45"), "medium"),
    )
    for (const value of ["", "—", "not-a-date"]) assert.equal(transactionPage.formatTimestamp(value), value)
  }
  const themeSource = await readFile(new URL("../src/styles/_theme.css", import.meta.url), "utf8")
  assert.match(themeSource, /:root\[data-theme="dark"\] \.side-tag\.sell,[^{]+\{\s*background-color: #42282c;\s*color: #e89aa0;/)
  console.log(
    "Passed: client isolation, identity, cash validation, trading, timestamps, and admin mutation restrictions.",
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}
