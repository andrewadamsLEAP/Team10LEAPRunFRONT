import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { signal } from "@angular/core"
import ts from "typescript"

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")
const source = await read("src/app/shared/sorting/table-sort.ts")
const compile = (source) => ts.transpileModule(source.replaceAll("export ", ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText
const helpers = source.slice(source.indexOf("const collator"), source.indexOf("@Directive"))
const tableClass = source.slice(source.indexOf("export class TableSort"), source.lastIndexOf("@Directive"))
const TableSort = new Function("signal", `${compile(helpers + tableClass)}\nreturn TableSort`)(signal)
const sort = new TableSort()
const records = [
  { id: "10", amount: 2.11, date: "2026-10-28T09:00:00Z", name: "Beta" },
  { id: "2", amount: -50, date: "2026-10-27 12:00:00", name: "alpha" },
  { id: "100", amount: 2.5, date: "2026-10-26T14:00:00Z", name: "Alpha" },
]
const ids = (rows) => rows.map((row) => row.id)
const original = structuredClone(records)
assert.deepEqual(sort.rows(records), records)
sort.toggle("id")
assert.deepEqual(ids(sort.rows(records)), ["2", "10", "100"])
sort.toggle("id")
assert.deepEqual(ids(sort.rows(records)), ["100", "10", "2"])
sort.toggle("id")
assert.deepEqual(sort.rows(records), records, "Third click restores the supplied original order")
assert.deepEqual(records, original, "Never mutate application data")
sort.toggle("amount")
assert.deepEqual(ids(sort.rows(records)), ["2", "10", "100"])
sort.toggle("name")
assert.deepEqual(ids(sort.rows(records)), ["2", "100", "10"], "Text ties are stable and case-insensitive")
sort.toggle("date", "date")
assert.equal(sort.rows(records)[0].id, "100")
sort.toggle("date", "date")
assert.equal(sort.rows(records)[0].id, "10")
sort.toggle("amount")
assert.deepEqual(sort.rows([{ amount: "2.5" }, { amount: "-5" }, { amount: "2.11" }]).map((row) => row.amount), ["-5", "2.11", "2.5"])
for (const missing of [null, undefined, "", NaN, Infinity, "—"]) {
  const rows = [{ amount: missing }, { amount: 2 }, { amount: 1 }]
  const table = new TableSort()
  table.toggle("amount")
  assert.equal(table.rows(rows).at(-1).amount, missing)
  table.toggle("amount")
  assert.equal(table.rows(rows).at(-1).amount, missing)
}
const computed = new TableSort()
computed.toggle("value")
const positions = [{ id: 1, price: 20, quantity: 2 }, { id: 2, price: 10, quantity: 10 }]
assert.deepEqual(ids(computed.rows(positions, { value: (row) => row.price * row.quantity })), [1, 2])
positions[0].price = 100
assert.deepEqual(ids(computed.rows(positions, { value: (row) => row.price * row.quantity })), [2, 1], "Sorting follows live values")
computed.toggle("value")
computed.toggle("value")
assert.deepEqual(ids(computed.rows([...positions].reverse())), [2, 1], "Reset uses latest API/default order")
assert.equal(new TableSort().state(), null, "Each table has independent state")
const dynamicColumns = new TableSort()
dynamicColumns.toggle("constructor")
assert.deepEqual(dynamicColumns.rows([{ constructor: "Z" }, { constructor: "A" }]).map((row) => row.constructor), ["A", "Z"])

const columnClass = source.slice(source.indexOf("export class SortColumn"))
const SortColumn = new Function("inject", "TableSort", "input", `${compile(columnClass)}\nreturn SortColumn`)(
  () => sort, TableSort, Object.assign(signal, { required: () => signal("") }),
)
const header = new SortColumn()
header.appSortColumn.set("id")
header.sortLabel.set("Order ID")
sort.state.set(null)
assert.equal(header.direction(), "none")
assert.match(header.hint(), /ascending/)
let prevented = false
header.onKeydown({ key: "Enter", preventDefault: () => { prevented = true } })
assert.equal(prevented, true)
assert.equal(header.direction(), "ascending")
assert.match(header.hint(), /descending/)
header.onKeydown({ key: " ", preventDefault: () => {} })
assert.equal(header.direction(), "descending")
assert.match(header.hint(), /original/)
header.activate()
assert.equal(header.direction(), "none")
header.onKeydown({ key: "Tab", preventDefault: () => assert.fail("Do not intercept Tab") })
assert.equal(header.direction(), "none")

for (const path of [
  "features/orders/pages/orders.page.html",
  "features/transactions/pages/transactions.page.ts",
  "features/transactions/pages/client-transaction-history.page.ts",
  "features/accounts/pages/account-directory.page.ts",
  "features/accounts/pages/account-management.page.ts",
  "features/portfolio/pages/holdings.page.ts",
  "features/markets/pages/market-list.page.ts",
  "features/dashboard/pages/dashboard.page.ts",
  "shared/analytics/analytics-value.component.ts",
  "shared/analytics/analytics-chart.component.ts",
]) {
  const page = await read(`src/app/${path}`)
  assert.match(page, /appSortTable/, path)
  assert.match(page, /appSortColumn/, path)
  assert.match(page, /\.rows\(/, path)
}
console.log("Table sorting tests passed: three-state cycle, numeric IDs/decimals, dates, missing values, stable ties, live data, independent tables, and keyboard headers.")
