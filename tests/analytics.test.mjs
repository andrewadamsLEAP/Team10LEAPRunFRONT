import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import "@angular/compiler"
import { signal, computed } from "@angular/core"
import { HttpParams } from "@angular/common/http"
import { catchError, defaultIfEmpty, EMPTY, firstValueFrom, from, map, merge, mergeMap, of, shareReplay, Subject, switchMap, throwError, timeout, toArray } from "rxjs"
import { TestScheduler } from "rxjs/testing"
import ts from "typescript"

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")
function compile(source, names, dependencies) {
	const { outputText } = ts.transpileModule(source.replace(/export (default )?/g, ""), {
		compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
	})
	return new Function(...Object.keys(dependencies), `${outputText}\nreturn { ${names.join(",")} }`)(...Object.values(dependencies))
}

const source = await read("src/app/core/api/analytics-api.service.ts")
const { analyticsParams, normalizeAnalyticsData, analyticsScopeAllowed } = compile(source.slice(source.indexOf("export function normalizeAnalyticsData"), source.indexOf("@Injectable")),
	["analyticsParams", "normalizeAnalyticsData", "analyticsScopeAllowed"], { HttpParams })
assert.deepEqual(normalizeAnalyticsData('[{"transaction_id":12,"first_name":"Demo","amount":125.5}]'), [{ transaction_id: 12, first_name: "Demo", amount: 125.5 }])
assert.deepEqual(normalizeAnalyticsData('[{"ticker":"DEMO","asset_type":"STOCK"}]'), [{ ticker: "DEMO", asset_type: "STOCK" }])
assert.deepEqual(normalizeAnalyticsData('[]'), [])
assert.equal(normalizeAnalyticsData(null), null)
assert.throws(() => normalizeAnalyticsData('[broken'), /malformed JSON/)
assert.equal(analyticsParams({ days: 30, ticker: "", client_id: undefined, offset: 0 }).toString(), "days=30&offset=0")
let user = { sub: "47", actorType: "client", role: "CLIENT" }
let response = { status: "success", data: [] }
const calls = []
const providers = {
	http: { get: (url, options) => { calls.push({ url, options }); return of(response) } },
	token: { currentUser: () => user },
}
const { AnalyticsApiService } = compile(source.slice(source.indexOf("export class AnalyticsApiService")),
	["AnalyticsApiService"], {
		inject: (key) => providers[key], HttpClient: "http", TokenStore: "token", analyticsParams, normalizeAnalyticsData, analyticsScopeAllowed, map, throwError,
	})
const api = new AnalyticsApiService()
const filters = { days: 30, ticker: "AAPL", client_id: 47, start_date: "2026-10-01", end_date: "2026-10-23", order_status: "FULFILLED" }
for (const [method, args, path, params, blob] of [
	["getOverview", [90], "/api/analytics/", { days: 90 }],
	["getInstruments", [filters, "trade_count", 10], "/api/analytics/by-instrument", { ...filters, sort_by: "trade_count", limit: 10 }],
	["getTrends", [filters, "weekly"], "/api/analytics/trends", { ...filters, granularity: "weekly" }],
	["getTrendGraph", [filters, "monthly", "active_clients"], "/api/analytics/trends/graph", { ...filters, granularity: "monthly", metric: "active_clients" }, true],
	["getClientSegments", [7], "/api/analytics/by-client", { days: 7 }],
	["getOrderStatus", [365], "/api/analytics/order-status", { days: 365 }],
	["getInstrumentDetails", ["BRK/B", 90], "/api/analytics/instrument/BRK%2FB", { days: 90 }],
	["getOrders", [filters, 50, 100], "/api/analytics/orders", { ...filters, limit: 50, offset: 100 }],
	["getTradingVolume", [filters], "/api/analytics/trading-volume", filters],
	["getClientActivity", [filters, "daily"], "/api/analytics/client-activity", { ...filters, granularity: "daily" }],
	["getInstrumentCatalogue", [], "/analytics/instruments/", {}],
	["getStockStatistics", ["BRK/B"], "/stock_statistics/BRK%2FB", {}],
	["getClientTopGainers", [], "/api/analytics/clients/47/holdings/top-gainers", {}],
	["getClientAllocation", [], "/api/analytics/clients/47/allocation", {}],
	["getClientTransactions", [], "/analytics/transactions/47", {}],
	["getClientOrderStatus", [30], "/api/analytics/order-status", { days: 30, client_id: 47 }],
	["getClientGraph", ["allocation", 30], "/api/analytics/clients/47/allocation/graph", {}, true],
	["getClientGraph", ["order-status", 30], "/api/analytics/clients/47/order-status/graph", { days: 30 }, true],
]) {
	user = method.startsWith("getClient") && !['getClientSegments', 'getClientActivity'].includes(method)
		? { sub: "47", actorType: "client", role: "CLIENT" }
		: { sub: "9", actorType: "employee", role: "EMPLOYEE_REPORTER" }
	await firstValueFrom(api[method](...args))
	const call = calls.at(-1)
	assert.equal(call.url, `/analytics-api${path}`)
	assert.deepEqual(call.options.params.keys().sort(), Object.keys(params).sort())
	for (const [key, value] of Object.entries(params)) assert.equal(call.options.params.get(key), String(value))
	assert.equal(call.options.responseType, blob ? "blob" : undefined)
	assert.equal(call.options.timeout, 20000)
}
for (const invalid of [null, { sub: "bad", actorType: "client" }, { sub: "0", actorType: "client" },
	{ sub: "1.2", actorType: "client" }, { sub: "9007199254740992", actorType: "client" }, { sub: "47", actorType: "employee" }]) {
	user = invalid
	const count = calls.length
	for (const request of [api.getClientAllocation(), api.getClientTopGainers(), api.getClientOrderStatus(30), api.getClientGraph("allocation", 30), api.getClientTransactions()]) {
		await assert.rejects(firstValueFrom(request), /signed-in client/)
	}
	assert.equal(calls.length, count, "Invalid identity must not issue requests")
}
response = { status: "success", data: { total_volume: 123 } }
user = { sub: "9", actorType: "employee", role: "EMPLOYEE_ADMIN" }
assert.deepEqual(await firstValueFrom(api.getOverview(30)), response.data)
response = { status: "success", data: '[{"transaction_id":12,"first_name":"Demo","amount":125.5}]' }
user = { sub: "47", actorType: "client" }
assert.equal((await firstValueFrom(api.getClientTransactions()))[0].amount, 125.5)
response = { status: "error" }
user = { sub: "9", actorType: "employee", role: "EMPLOYEE_REPORTER" }
await assert.rejects(firstValueFrom(api.getOverview(30)), /Invalid analytics response/)
response = { status: "success", data: null }
await assert.rejects(firstValueFrom(api.getOverview(30)), /unavailable report/)
for (const role of ['EMPLOYEE_REPORTER', 'EMPLOYEE_ADMIN']) {
	user = { sub: '9', actorType: 'employee', role }
	response = { status: 'success', data: [] }
	await firstValueFrom(api.getOrders(filters, 50, 0))
	await firstValueFrom(api.getClientActivity(filters, 'weekly'))
}
user = { sub: '47', actorType: 'client', role: 'CLIENT' }
const beforeForbidden = calls.length
for (const request of [api.getOverview(30), api.getOrders(filters, 50, 0), api.getOrderStatus(30), api.getClientActivity(filters, 'daily')]) {
	await assert.rejects(firstValueFrom(request), /not permitted/)
}
assert.equal(calls.length, beforeForbidden)
assert.equal(analyticsScopeAllowed(user, '/api/analytics/clients/48/allocation', {}), false)
assert.equal(analyticsScopeAllowed(user, '/api/analytics/order-status', {client_id:48}), false)
assert.equal(analyticsScopeAllowed(user, '/api/analytics/order-status', {}), false)
assert.equal(analyticsScopeAllowed({sub:'9',actorType:'employee',role:'CLIENT'}, '/api/analytics/orders', {}), false)
response = {status:'success', client_id:48, data:{allocation:[]}}
await assert.rejects(firstValueFrom(api.getClientAllocation()), /another client/)
response = {status:'success', data:[{client_id:48, fulfilled_orders:3}]}
await assert.rejects(firstValueFrom(api.getClientOrderStatus(30)), /another client's rows/)

const state = await read("src/app/core/api/analytics-report-state.ts")
const { loadReport, analyticsError, orderPageInfo } = compile(state.slice(state.indexOf("export function analyticsError")),
	["loadReport", "analyticsError", "orderPageInfo"], { catchError, defaultIfEmpty, from, map, of, switchMap, timeout })
const descriptor = { id: "a", title: "Test", description: "Test report" }
const results = await firstValueFrom(merge(
	loadReport({ ...descriptor, request: of([1]) }),
	loadReport({ ...descriptor, id: "b", request: throwError(() => ({ status: 403 })) }),
).pipe(toArray()))
assert.deepEqual(results[0].data, [1])
assert.match(results[1].error, /permission/)
const chart = new Blob(["png"], { type: "image/png" })
assert.equal((await firstValueFrom(loadReport({ ...descriptor, request: of(chart) }))).image, chart)
const pngError = await firstValueFrom(loadReport({ ...descriptor, request: throwError(() => ({
	status: 404, error: new Blob([JSON.stringify({ detail: "Client not found" })]),
})) }))
assert.equal(pngError.error, "Client not found")
assert.match(analyticsError({ status: 404, error: { detail: "Not Found" } }), /5000/)
assert.match(analyticsError({ status: 0 }), /5000/)
assert.match(analyticsError({ name: "TimeoutError" }), /warehouse did not respond/)
assert.match(analyticsError({ status: 0, error: { name: "TimeoutError" } }), /warehouse did not respond/)
assert.match(analyticsError({ status: 503 }), /warehouse is unavailable/)
assert.equal(analyticsError({ error: { detail: [{ msg: "Bad date" }] } }), "Bad date")
assert.deepEqual(orderPageInfo({ total: 125, orders: [1, 2] }), { count: 2, total: 125 })
assert.deepEqual(orderPageInfo({ total_orders: 125, orders: [1, 2], limit: 50, offset: 0 }), { count: 2, total: 125 })
assert.deepEqual(orderPageInfo([1]), { count: 1, total: null })
assert.match((await firstValueFrom(loadReport({ ...descriptor, request: EMPTY }))).error, /without returning a response/)
new TestScheduler((actual, expected) => assert.deepEqual(actual, expected)).run(({ cold, expectObservable }) => {
	expectObservable(loadReport({ ...descriptor, request: cold('-') }).pipe(map((report) => report.error.includes('20 seconds'))))
		.toBe('20000ms (a|)', { a: true })
})

const presentationSource = await read('src/app/core/api/analytics-presentation.ts')
const { presentAnalytics } = compile(presentationSource.slice(presentationSource.indexOf('const object')),
	['presentAnalytics'], {})
const allocationFixture = { total_market_value: 2500, allocation: [
	{ category: 'stock', market_value: 1500, percentage: 60 },
	{ category: 'bitcoin', market_value: 1000, percentage: 40 },
	{ category: 'other', market_value: 0, percentage: 0 },
], unpriced_tickers: ['UNPRICED'], valuation: 'latest bid with ask fallback' }
const allocationView = presentAnalytics('allocation', allocationFixture)
assert.equal(allocationView.metrics[0].value, 2500)
assert.equal(allocationView.table.length, 3)
assert.match(allocationView.notes[0], /UNPRICED/)
assert.deepEqual(presentAnalytics('allocation-chart', allocationFixture).chart.values, [1500, 1000, 0])
assert.equal(presentAnalytics('allocation-chart', allocationFixture).chart.kind, 'pie')
assert.match(presentAnalytics('allocation-chart', { total_market_value: 0, allocation: [] }).emptyMessage, /No priced holdings/)
const gainersView = presentAnalytics('gainers', { holdings: [{ ticker: 'DEMO', unrealized_gain: 123.5 }], excluded_tickers: [] })
assert.equal(gainersView.table[0].unrealized_gain, 123.5)
assert.equal(gainersView.emptyMessage, '')
const profits = [10, 50, -1, 20, 5, 100, null].map((gain,index)=>({ticker:`T${index}`,unrealized_gain:gain}))
assert.deepEqual(presentAnalytics('gainers',{holdings:profits,excluded_tickers:[]}).table.map(row=>row.unrealized_gain), [100,50,20,10,5])
assert.match(presentAnalytics('gainers', { holdings: [], excluded_tickers: ['DEMO'] }).emptyMessage, /cost history is incomplete/)
const statuses = [{ client_id: 47, total_orders: 6, fulfilled_orders: 3, pending_orders: 2, cancelled_orders: 1 }]
assert.deepEqual(presentAnalytics('orders-chart', statuses).chart.values, [3, 2, 1])
assert.equal(presentAnalytics('order-status', statuses).metrics[0].value, 6)
assert.match(presentAnalytics('orders-chart', [{ fulfilled_orders: 0, pending_orders: 0, cancelled_orders: 0 }]).emptyMessage, /zero orders/)
assert.deepEqual(presentAnalytics('trends-chart', [{ period: '2026-10-01', total_volume: 1200, active_clients: 2 }], 'active_clients').chart.values, [2])
assert.match(presentAnalytics('trends', []).emptyMessage, /date range/)
assert.equal(presentAnalytics('volume', { total_orders: 3, total_trading_volume: 5000 }).metrics[2].value, 5000)
assert.equal(presentAnalytics('overview', { total_volume: 5000 }).metrics.find((metric) => metric.label === 'Clients').value, null, 'Missing warehouse values are not fabricated as zeros')
assert.equal(presentAnalytics('orders', { total_orders: 1, orders: [{ order_id: 123 }] }).table[0].order_id, 123)
const clientActivity = [
	{period:'2026-10-01',client_id:47,trade_count:2,total_volume:200},
	{period:'2026-10-01',client_id:48,trade_count:3,total_volume:300},
	{period:'2026-10-02',client_id:47,trade_count:1,total_volume:100},
]
assert.deepEqual(presentAnalytics('activity',clientActivity).chart.values,[2,1])
assert.equal(presentAnalytics('activity',clientActivity).metrics[0].value,2)
assert.equal(presentAnalytics('activity',clientActivity).metrics[1].value,6)
assert.equal(presentAnalytics('most-active',[{ticker:'B',trade_count:5},{ticker:'A',trade_count:10}]).table[0].ticker,'A')

const workspaceSource = await read("src/app/features/analytics/analytics-workspace.component.ts")
function workspace(audience, asynchronous = false) {
	const requests = []
	const streams = []
	const api = new Proxy({}, { get: (_, method) => (...args) => {
		requests.push({ method, args })
		if (asynchronous) { const stream = new Subject(); streams.push(stream); return stream }
		return of(method === "getOrders" ? { total_orders: 125, orders: [] } : [])
	} })
	const { AnalyticsWorkspace } = compile(workspaceSource.slice(workspaceSource.indexOf("export default class")), ["AnalyticsWorkspace"], {
		inject: (key) => key === "api" ? api : {}, AnalyticsApiService: "api", DestroyRef: "destroy", signal, computed,
		input: { required: () => () => audience }, Subject, switchMap, merge, from, mergeMap, shareReplay, loadReport, orderPageInfo,
		takeUntilDestroyed: () => (source) => source,
	})
	const page = new AnalyticsWorkspace()
	page.ngOnInit()
	return { page, requests, streams }
}
const client = workspace("client")
assert.equal(client.page.reports().length, 5)
assert.ok(!client.page.reports().some(report=>report.id==='transactions'))
assert.ok(!client.requests.some(({method})=>method==='getClientTransactions'),'Analytics must not fetch transaction history; it belongs on the Transactions tab')
assert.equal(client.page.loading(), false)
assert.equal(client.page.orderReport(), null)
assert.ok(client.requests.every(({ method }) => method.startsWith("getClient")), "Client page must not call employee reports")
client.page.ticker = "MSFT"
client.page.clientId = 999
client.page.refresh()
assert.deepEqual(client.page.appliedFilters(), { days: 30 }, "Client filters cannot select another client")
const { page, requests } = workspace("employee")
assert.equal(page.reports().length, 6)
assert.equal(page.reports().find(report=>report.id==='trends-chart').title,'Total orders over time')
assert.equal(page.loading(), false)
assert.equal(page.canNextPage(), true)
page.changePage(1)
assert.equal(page.offset(), 50)
page.changePage(1)
assert.equal(page.canNextPage(), false)
page.changePage(1)
assert.equal(page.offset(), 100)
page.ticker = "MSFT"
page.limit = 25
page.changePage(-1)
assert.equal(requests.at(-1).args[0].ticker, undefined, "Pagination must use applied, not unsaved filters")
assert.equal(requests.at(-1).args[1], 50, "Pagination must retain applied page size")
page.refresh()
assert.equal(page.offset(), 0)
assert.equal(page.pageSize(), 25)
assert.equal(page.reports().length, 6)
assert.ok(requests.filter(({method})=>method==='getInstruments').some(({args})=>args[0].ticker==='MSFT' && args[1]==='trade_count' && args[2]===1))
page.clientId = 47
page.startDate = '2026-10-01'
page.endDate = '2026-10-23'
page.days = 90
page.orderStatus = 'PENDING'
const filteredStart = requests.length
page.refresh()
for (const { method, args } of requests.slice(filteredStart)) {
	assert.ok(['getTradingVolume','getTrends','getInstruments','getClientActivity','getOrders'].includes(method),'Employee cards must all support every shared filter')
	assert.deepEqual(args[0],{days:90,ticker:'MSFT',client_id:47,start_date:'2026-10-01',end_date:'2026-10-23',order_status:'PENDING'})
}
for (const [key, value] of [["days", 0], ["days", 3651], ["clientId", -1], ["clientId", 1.5], ["instrumentLimit", 1001], ["limit", 501]]) {
	const previous = page[key]
	page[key] = value
	const count = requests.length
	page.refresh()
	assert.ok(page.validationError())
	assert.equal(requests.length, count)
	page[key] = previous
}
page.startDate = "2026-10-23"
page.endDate = "2026-10-01"
page.refresh()
assert.match(page.validationError(), /Start date/)
const pending = workspace("client", true)
assert.equal(pending.page.loading(), true)
pending.page.refresh()
assert.ok(pending.streams.slice(0, 3).every((stream) => stream.observers.length === 0))
assert.equal(pending.streams.slice(3).filter((stream) => stream.observers.length > 0).length, 2, 'Start at most two report sources concurrently')
pending.streams[5].error({ status: 403 })
for (const stream of [pending.streams[3], pending.streams[4]]) { stream.next([]); stream.complete() }
assert.equal(pending.page.loading(), false)
assert.match(pending.page.reports()[0].error, /permission/)
assert.equal(pending.page.reports()[1].error, "")
assert.equal(pending.streams.length, 6, 'Only three distinct sources per client refresh, charts share JSON and no transaction request is issued')
pending.page.retryReport('gainers')
assert.equal(pending.page.reports()[0].loading, false, 'A synchronously failing retry must not remain loading')
assert.match(pending.page.reports()[0].error, /permission/)

const proxy = await read("proxy.conf.cjs")
assert.match(proxy, /context: \["\/analytics-api"\],\s+target: "http:\/\/localhost:5000"/)
assert.match(proxy, /"\^\/analytics-api": ""/)
console.log("Analytics tests passed: all Python paths, query params, identity scoping, reports, charts, validation, pagination, and refresh cancellation.")
