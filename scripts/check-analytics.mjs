// Read-only diagnostics for a trusted local development analytics service.
// Never fetches client reports, order records, environment files, or credentials.
const base = (process.env.ANALYTICS_BASE_URL || "http://localhost:5000").replace(/\/$/, "")
const paths = [
  "/analytics/instruments/", "/analytics/transactions/{client_id}", "/stock_statistics/{ticker}",
  "/api/analytics/", "/api/analytics/by-instrument", "/api/analytics/trends", "/api/analytics/trends/graph",
  "/api/analytics/by-client", "/api/analytics/order-status", "/api/analytics/instrument/{ticker}",
  "/api/analytics/clients/{client_id}/holdings/top-gainers", "/api/analytics/clients/{client_id}/allocation",
  "/api/analytics/clients/{client_id}/allocation/graph", "/api/analytics/clients/{client_id}/order-status/graph",
  "/api/analytics/orders", "/api/analytics/trading-volume", "/api/analytics/client-activity",
]
async function json(path, timeoutMs) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}
try {
  const spec = await json("/openapi.json", 5000)
  const missing = paths.filter((path) => !spec.paths?.[path]?.get)
  if (missing.length) throw new Error(`Missing routes: ${missing.join(", ")}`)
  console.log(`PASS: all ${paths.length} expected Python analytics GET routes are published.`)
  if (!process.argv.includes("--contracts-only")) {
    const start = Date.now()
    const overview = await json("/api/analytics/?days=3650", 15000)
    if (overview.status !== "success" || !overview.data || typeof overview.data !== "object") {
      throw new Error("Overview did not return a valid success envelope.")
    }
    const totals = Object.fromEntries(['total_clients', 'total_trades', 'total_volume', 'active_clients'].map((key) => [key, overview.data[key] ?? null]))
    console.log(`PASS: warehouse overview returned in ${Date.now() - start}ms.`)
    console.log(`Aggregate totals only: ${JSON.stringify(totals)}`)
    console.log("This verifies aggregate access, not client identity, holdings correctness, or ETL freshness.")
  }
} catch (error) {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    console.error("FAIL: analytics exceeded its deadline. OpenAPI availability does not prove warehouse readiness. Check database connectivity, locks, query deadlines, and ETL logs.")
  } else {
    console.error(`FAIL: ${error.message}`)
  }
  process.exitCode = 1
}