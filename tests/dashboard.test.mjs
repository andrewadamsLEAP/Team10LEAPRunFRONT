import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { computed, signal } from "@angular/core"
import { of, Subject, throwError } from "rxjs"
import ts from "typescript"

const source = await readFile(
  new URL("../src/app/features/dashboard/pages/dashboard.page.ts", import.meta.url),
  "utf8",
)
// Exercise the component logic without bootstrapping the browser/template.
const { outputText } = ts.transpileModule(
  source.slice(source.indexOf("export default class")).replace("export default ", ""),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } },
)

function dashboard(records, subject = "47") {
  const requestedIds = []
  const providers = {
    store: { instruments: () => [], instrumentLoading: () => false, loadInstruments: () => {} },
    token: { currentUser: () => subject == null ? null : { sub: subject } },
    orders: {
      getAllClientOrders: (id) => {
        requestedIds.push(id)
        return Array.isArray(records) ? of(records) : records
      },
    },
  }
  const Page = new Function(
    "inject", "signal", "computed", "Store", "OrdersApiService", "TokenStore",
    `${outputText}\nreturn DashboardPage`,
  )((token) => providers[token], signal, computed, "store", "orders", "token")
  const page = new Page()
  page.ngOnInit()
  return { page, requestedIds }
}

const records = [2, 6, 1, 4, 3, 7, 5].map((day) => ({
  orderId: day,
  ticker: "AAPL",
  orderType: "Buy",
  status: "Fulfilled",
  createdAt: `2026-10-${String(day).padStart(2, "0")}T12:00:00Z`,
}))
records[5].createdAt = "2026-10-07T12:00:00.395244Z"
const { page, requestedIds } = dashboard(records)
assert.deepEqual(requestedIds, [47])
assert.deepEqual(page.recentOrders().map((order) => order.id), ["7", "6", "5", "4", "3"])
assert.ok(page.recentOrders()[0].date instanceof Date)
assert.equal(page.recentOrders()[0].date.getMilliseconds(), 395)
assert.deepEqual(records.map((record) => record.orderId), [2, 6, 1, 4, 3, 7, 5])
for (const count of [0, 1, 3, 5]) {
  assert.equal(dashboard(records.slice(0, count)).page.recentOrders().length, count)
}

const aliases = dashboard([
  { order_id: 1, order_type: "Sell", order_status: "Cancelled", order_date: "2026-10-01 12:00:00", ticker: "MSFT" },
  { orderId: 2, orderType: "Buy", orderStatus: "Pending", orderDate: "2026-10-02T12:00:00Z" },
  { orderId: 3, createdAt: "invalid" },
]).page.recentOrders()
assert.deepEqual(aliases.map((order) => order.id), ["2", "1", "3"])
assert.equal(aliases[1].type, "Sell")
assert.equal(aliases[1].status, "Cancelled")
assert.equal(aliases[1].ticker, "MSFT")
assert.ok(aliases[0].date instanceof Date)
assert.equal(aliases[2].date, null)

for (const subject of [null, "invalid", "0", "-1", "1.5"]) {
  const result = dashboard([], subject)
  assert.deepEqual(result.requestedIds, [])
  assert.ok(result.page.ordersError())
}
const pending = new Subject()
const loading = dashboard(pending).page
assert.equal(loading.ordersLoading(), true)
pending.next(records)
assert.equal(loading.ordersLoading(), false)
pending.complete()
const failed = dashboard(throwError(() => new Error("Unavailable"))).page
assert.equal(failed.ordersLoading(), false)
assert.equal(failed.ordersError(), "Unable to load recent orders.")
assert.deepEqual(failed.recentOrders(), [])
console.log("Dashboard recent orders tests passed.")