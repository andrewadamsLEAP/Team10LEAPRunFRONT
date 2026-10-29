import { Injectable, inject } from "@angular/core"
import { HttpClient, HttpParams } from "@angular/common/http"
import { map, Observable, throwError } from "rxjs"
import { TokenStore } from "../auth/token-store.service"
import { ANALYTICS_BASE_PATH } from "./api-endpoints"

export type AnalyticsValue = string | number | boolean | null | AnalyticsValue[] | { [key: string]: AnalyticsValue }
export type AnalyticsEnvelope = { status: string; client_id?: number; data: AnalyticsValue }
export type Granularity = "daily" | "weekly" | "monthly"
export type TrendMetric = "trade_count" | "total_volume" | "avg_trade_value" | "active_clients" | "instruments_traded"
export type InstrumentSort = "trade_count" | "total_volume" | "total_quantity"
export type OrderStatus = "FULFILLED" | "PENDING" | "CANCELLED" | "CANCELED"
export type ReportFilters = {
  days: number
  ticker?: string
  client_id?: number
  start_date?: string
  end_date?: string
  order_status?: OrderStatus
}

// pandas legacy endpoints return df.to_json() inside the JSON envelope.
export function normalizeAnalyticsData(value: AnalyticsValue): AnalyticsValue {
  if (typeof value === "string" && /^[\[{]/.test(value.trim())) {
    try { return JSON.parse(value) as AnalyticsValue }
    catch { throw new Error("Analytics returned malformed JSON in its data field.") }
  }
  return value
}

// Defense in depth for callers. Server-side authorization is still mandatory:
// decoded JWT claims and Angular routing cannot secure an unauthenticated API.
export function analyticsScopeAllowed(user: { sub: string; actorType: string; role: string } | null, path: string, query: object): boolean {
  if (user?.actorType === "employee") return ["EMPLOYEE_ADMIN", "EMPLOYEE_REPORTER"].includes(user.role)
  const id = Number(user?.sub)
  if (user?.actorType !== "client" || !Number.isSafeInteger(id) || id <= 0) return false
  if (path === "/api/analytics/order-status") return Number((query as { client_id?: number }).client_id) === id
  return path === `/analytics/transactions/${id}` || [
    `/api/analytics/clients/${id}/holdings/top-gainers`, `/api/analytics/clients/${id}/allocation`,
    `/api/analytics/clients/${id}/allocation/graph`, `/api/analytics/clients/${id}/order-status/graph`,
  ].includes(path)
}

export function analyticsParams(query: object): HttpParams {
  let params = new HttpParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params = params.set(key, String(value))
  }
  return params
}

@Injectable({ providedIn: "root" })
export class AnalyticsApiService {
  private readonly http = inject(HttpClient)
  private readonly tokens = inject(TokenStore)
  private readonly base = ANALYTICS_BASE_PATH

  getOverview(days: number) { return this.json("/api/analytics/", { days }) }
  getInstruments(filters: ReportFilters, sort_by: InstrumentSort, limit: number) {
    return this.json("/api/analytics/by-instrument", { ...filters, sort_by, limit })
  }
  getTrends(filters: ReportFilters, granularity: Granularity) {
    return this.json("/api/analytics/trends", { ...filters, granularity })
  }
  getTrendGraph(filters: ReportFilters, granularity: Granularity, metric: TrendMetric) {
    return this.png("/api/analytics/trends/graph", { ...filters, granularity, metric })
  }
  getClientSegments(days: number) { return this.json("/api/analytics/by-client", { days }) }
  getOrderStatus(days: number) { return this.json("/api/analytics/order-status", { days }) }
  getInstrumentDetails(ticker: string, days: number) {
    return this.json(`/api/analytics/instrument/${encodeURIComponent(ticker)}`, { days })
  }
  getOrders(filters: ReportFilters, limit: number, offset: number) {
    return this.json("/api/analytics/orders", { ...filters, limit, offset })
  }
  getTradingVolume(filters: ReportFilters) { return this.json("/api/analytics/trading-volume", filters) }
  getClientActivity(filters: ReportFilters, granularity: Granularity) {
    return this.json("/api/analytics/client-activity", { ...filters, granularity })
  }
  getInstrumentCatalogue() { return this.json("/analytics/instruments/") }
  getStockStatistics(ticker: string) { return this.json(`/stock_statistics/${encodeURIComponent(ticker)}`) }

  getClientTopGainers() {
    return this.clientRequest((id) => this.json(`/api/analytics/clients/${id}/holdings/top-gainers`))
  }
  getClientAllocation() {
    return this.clientRequest((id) => this.json(`/api/analytics/clients/${id}/allocation`))
  }
  getClientTransactions() {
    return this.clientRequest((id) => this.json(`/analytics/transactions/${id}`))
  }
  getClientOrderStatus(days: number) {
    return this.clientRequest((id) => this.json("/api/analytics/order-status", { days, client_id: id }))
  }
  getClientGraph(kind: "allocation" | "order-status", days: number) {
    return this.clientRequest((id) => this.png(`/api/analytics/clients/${id}/${kind}/graph`, kind === "order-status" ? { days } : {}))
  }

  private json(path: string, query: object = {}): Observable<AnalyticsValue> {
    if (!analyticsScopeAllowed(this.tokens.currentUser(), path, query)) {
      return throwError(() => new Error("This analytics report is not permitted for the signed-in account."))
    }
    const user = this.tokens.currentUser()
    const expectedClientId = user?.actorType === "client" ? Number(user.sub) : null
    return this.http.get<AnalyticsEnvelope>(`${this.base}${path}`, {
      params: analyticsParams(query), timeout: 20000,
    }).pipe(map((response) => {
      if (response.status !== "success" || response.data === undefined) throw new Error("Invalid analytics response.")
      if (response.data === null) throw new Error("Python returned an unavailable report (null data). Check warehouse connectivity and the Python query logs; this is not an empty result.")
      const data = normalizeAnalyticsData(response.data)
      if (expectedClientId !== null) {
        if (response.client_id !== undefined && Number(response.client_id) !== expectedClientId) {
          throw new Error("Analytics response belongs to another client and was not displayed.")
        }
        if (Array.isArray(data) && data.some((row) => row !== null && typeof row === "object" && !Array.isArray(row)
          && row['client_id'] !== undefined && Number(row['client_id']) !== expectedClientId)) {
          throw new Error("Analytics returned another client's rows and they were not displayed.")
        }
      }
      return data
    }))
  }

  private png(path: string, query: object): Observable<Blob> {
    if (!analyticsScopeAllowed(this.tokens.currentUser(), path, query)) {
      return throwError(() => new Error("This analytics report is not permitted for the signed-in account."))
    }
    return this.http.get(`${this.base}${path}`, {
      params: analyticsParams(query), responseType: "blob", timeout: 20000,
    })
  }

  private clientRequest<T>(request: (id: number) => Observable<T>): Observable<T> {
    const user = this.tokens.currentUser()
    const id = Number(user?.sub)
    if (user?.actorType !== "client" || !Number.isSafeInteger(id) || id <= 0) {
      return throwError(() => new Error("A valid signed-in client account is required."))
    }
    return request(id)
  }
}