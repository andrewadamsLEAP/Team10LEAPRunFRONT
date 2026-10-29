import { Injectable, inject } from "@angular/core"
import { HttpClient } from "@angular/common/http"
import { map, Observable } from "rxjs"
import { ANALYTICS_BASE_PATH } from "../../api-endpoints"

export type PlatformAnalytics = {
  total_clients: number
  total_trades: number
  active_clients: number
  total_volumes: number
  avg_trade_value: number
  active_clients_percentage: number
  inactive_clients: number
  top_active_clients: TopActiveClient[]
}

export type TopActiveClient = {
  client_id: number
  first_name: string
  last_name: string
  trade_count: number
  volume: number
}

export type PlatformTrend = {
  period: string
  trade_count: number
  total_volume: number
  avg_trade_value: number
  active_clients: number
  instruments_traded: number
}

export type ClientOrderStatus = {
  client_id: number
  first_name: string
  last_name: string
  total_orders: number
  fulfilled_orders: number
  pending_orders: number
  cancelled_orders: number
}

type PlatformAnalyticsResponse = {
  status: string
  data: Omit<PlatformAnalytics, "total_volumes"> & {
    total_volume: number
  }
  period_days: number
}

type PlatformTrendsResponse = {
  status: string
  data: PlatformTrend[]
  period_days: number
  granularity: string
}

type ClientOrderStatusResponse = {
  status: string
  data: ClientOrderStatus[]
  period_days: number
  client_id: number | null
}

@Injectable({ providedIn: "root" })
export class PlatformAnalyticsService {
  private readonly http = inject(HttpClient)

  getAnalytics(): Observable<PlatformAnalytics> {
    return this.http
      .get<PlatformAnalyticsResponse>(`${ANALYTICS_BASE_PATH}/api/analytics/`)
      .pipe(
        map(({ data }) => ({
          ...data,
          total_volumes: data.total_volume,
        })),
      )
  }

  getTrends(): Observable<PlatformTrend[]> {
    return this.http
      .get<PlatformTrendsResponse>(`${ANALYTICS_BASE_PATH}/api/analytics/trends`)
      .pipe(map(({ data }) => data))
  }

  getOrderStatus(): Observable<ClientOrderStatus[]> {
    return this.http
      .get<ClientOrderStatusResponse>(`${ANALYTICS_BASE_PATH}/api/analytics/order-status`)
      .pipe(map(({ data }) => data))
  }
}