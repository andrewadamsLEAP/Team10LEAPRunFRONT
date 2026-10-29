import type { AnalyticsValue, TrendMetric } from "./analytics-api.service"

type Row = { [key: string]: AnalyticsValue }
export type ReportMetric = { label: string; value: number | null; format: "number" | "money" | "percent" }
export type ReportChart = { kind: "bars" | "line" | "pie"; labels: string[]; values: (number | null)[]; format: ReportMetric['format']; timeBased?: boolean }
export type ReportPresentation = {
  metrics: ReportMetric[]
  chart: ReportChart | null
  table: AnalyticsValue
  notes: string[]
  emptyMessage: string
}
const object = (value: AnalyticsValue): Row => value !== null && typeof value === "object" && !Array.isArray(value) ? value : {}
const rows = (value: AnalyticsValue | undefined): Row[] => Array.isArray(value) ? value.map(object) : []
const number = (value: AnalyticsValue | undefined): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}
const text = (value: AnalyticsValue | undefined) => typeof value === "string" ? value : ""
const list = (value: AnalyticsValue | undefined) => Array.isArray(value) ? value.map(String).join(", ") : ""

export function presentAnalytics(id: string, data: AnalyticsValue, metric: TrendMetric = "total_volume"): ReportPresentation {
  const view: ReportPresentation = { metrics: [], chart: null, table: data, notes: [], emptyMessage: "" }
  const record = object(data)
  const add = (label: string, value: AnalyticsValue | undefined, format: ReportMetric['format'] = "number") => {
    view.metrics.push({ label, value: number(value), format })
  }
  const note = (value: AnalyticsValue | undefined) => { const message = text(value); if (message) view.notes.push(message) }
  if (id === "gainers") {
    const ranked = rows(record['holdings']).filter((holding) => number(holding['unrealized_gain']) !== null)
      .sort((left, right) => number(right['unrealized_gain'])! - number(left['unrealized_gain'])! || text(left['ticker']).localeCompare(text(right['ticker'])))
      .slice(0, 5)
    view.table = ranked
    if (!ranked.length) view.emptyMessage = list(record['excluded_tickers'])
      ? "Holdings cannot be ranked because warehouse price or fulfilled-order cost history is incomplete."
      : "The warehouse returned no rankable holdings for this account. If you own positions, check that holdings and fulfilled-order history have been synchronized by ETL."
    if (list(record['excluded_tickers'])) view.notes.push(`Excluded tickers: ${list(record['excluded_tickers'])}. Missing prices or incomplete cost history must be fixed in the warehouse.`)
    note(record['profit_method'])
  } else if (id === "allocation" || id === "allocation-chart") {
    const allocation = rows(record['allocation'])
    view.table = id === "allocation" ? allocation : null
    if (id === "allocation") add("Priced holdings market value", record['total_market_value'], "money")
    const priced = allocation.filter((row) => (number(row['market_value']) ?? 0) > 0)
    if (id === "allocation-chart" && priced.length) view.chart = {
      kind: "pie", labels: allocation.map((row) => text(row['category'])),
      values: allocation.map((row) => Math.max(0, number(row['market_value']) ?? 0)), format: "money",
    }
    if (!priced.length) view.emptyMessage = "No priced holdings were returned by the warehouse. Check holdings synchronization and latest quotes; cash is not included in allocation."
    if (list(record['unpriced_tickers'])) view.notes.push(`Unpriced holdings excluded: ${list(record['unpriced_tickers'])}.`)
    note(record['valuation'])
  } else if (id === "order-status" || id === "orders-chart") {
    const statuses = rows(data)
    if (!statuses.length) view.emptyMessage = "No order-status rows were returned for this account or period. Check the selected period and warehouse client synchronization."
    else {
      const counts = ['fulfilled_orders', 'pending_orders', 'cancelled_orders'].map((key) => statuses.reduce((sum, row) => sum + (number(row[key]) ?? 0), 0))
      view.chart = { kind: "bars", labels: ['Fulfilled', 'Pending', 'Cancelled'], values: counts, format: "number" }
      if (id === "order-status") {
        add("Total orders", counts.reduce((sum, count) => sum + count, 0))
        add("Fulfilled", counts[0]); add("Pending", counts[1]); add("Cancelled", counts[2])
      }
      if (counts.every((count) => count === 0)) view.emptyMessage = "The warehouse reports zero orders in this period. Try a wider period; recent operational orders appear only after ETL has synchronized them."
    }
    if (id === "orders-chart") view.table = null
  } else if (id === "overview") {
    for (const [label, key] of [['Clients', 'total_clients'], ['Trades · all time', 'total_trades'], ['Active clients · selected days', 'active_clients'], ['Inactive clients · selected days', 'inactive_clients']]) add(label, record[key])
    add("Trading volume · all time", record['total_volume'], "money")
    add("Average trade value · all time", record['avg_trade_value'], "money")
    add("Active client percentage · selected days", record['active_clients_percentage'], "percent")
    view.table = rows(record['top_active_clients'])
    if (!rows(record['top_active_clients']).length) view.emptyMessage = "No active clients in this period. All-time KPI totals above may still contain historical activity."
  } else if (id === "volume") {
    add("Orders", record['total_orders']); add("Quantity", record['total_quantity'])
    add("Trading volume", record['total_trading_volume'], "money")
    add("Buy volume", record['buy_volume'], "money"); add("Sell volume", record['sell_volume'], "money")
    view.table = null
    if (number(record['total_orders']) === 0) view.emptyMessage = "No matching orders. Trading volume defaults to fulfilled orders; check status, date, ticker, and client filters."
  } else if (id === "trends-chart" || id === "trends") {
    const trends = rows(data)
    const valid = trends.filter((row) => number(row[metric]) !== null)
    if (id === "trends-chart") {
      view.table = null
      if (valid.length) view.chart = { kind: "line", labels: valid.map((row) => text(row['period'])), values: valid.map((row) => number(row[metric])!), format: metric.includes('volume') || metric === 'avg_trade_value' ? "money" : "number", timeBased: true }
    }
    if (!trends.length) view.emptyMessage = "No trading activity in the selected date range. Choose a wider period or dates covered by the warehouse; the frontend does not substitute another period automatically."
  } else if (id === "most-active") {
    const ranked = rows(data).filter((row) => number(row['trade_count']) !== null)
      .sort((left, right) => number(right['trade_count'])! - number(left['trade_count'])! || text(left['ticker']).localeCompare(text(right['ticker'])))
    view.table = ranked.slice(0, 1)
    if (ranked.length && (number(ranked[0]['trade_count']) ?? 0) > 0) {
      add("Trades", ranked[0]['trade_count'])
      add("Trading volume", ranked[0]['total_volume'], "money")
      view.notes.push(`Most active instrument by order count: ${text(ranked[0]['ticker'])}. Ties are ordered by ticker.`)
    } else view.emptyMessage = "No active instruments match the selected client, instrument, period, and order-status filters."
  } else if (id === "activity") {
    const activity = rows(data)
    const periods = new Map<string, { clients: Set<string>; trades: number; volume: number }>()
    for (const row of activity) {
      const period = text(row['period'])
      const point = periods.get(period) ?? { clients: new Set<string>(), trades: 0, volume: 0 }
      if (row['client_id'] !== null && row['client_id'] !== undefined) point.clients.add(String(row['client_id']))
      point.trades += number(row['trade_count']) ?? 0
      point.volume += number(row['total_volume']) ?? 0
      periods.set(period, point)
    }
    const sorted = [...periods].sort(([a], [b]) => a.localeCompare(b))
    if (sorted.length) {
      view.chart = { kind: "line", labels: sorted.map(([period]) => period), values: sorted.map(([, point]) => point.clients.size), format: "number", timeBased: true }
      add("Distinct active clients", new Set(activity.map((row) => String(row['client_id']))).size)
      add("Orders across periods", sorted.reduce((sum, [, point]) => sum + point.trades, 0))
      view.notes.push("Chart shows distinct active clients per period; table retains each client's activity. Only applied filters are included.")
    } else view.emptyMessage = "No client activity matches the applied filters."
  } else if (id === "orders") {
    const total = record['total_orders'] ?? record['total']
    add("Matching orders", total)
    view.table = Array.isArray(data) ? data : rows(record['orders'])
    if (!rows(view.table).length) view.emptyMessage = (number(total) ?? 0) > 0 ? "No rows on this page. Return to the previous page." : "No orders match the applied filters in the warehouse."
  } else if (id === "transactions" && Array.isArray(data) && !data.length) {
    view.emptyMessage = "No transactions were returned for this signed-in client. Check warehouse transaction synchronization if you have completed trades."
  } else if (Array.isArray(data) && !data.length) {
    view.emptyMessage = "The warehouse returned an empty result for these filters. Check the date range and ETL freshness."
  }
  return view
}