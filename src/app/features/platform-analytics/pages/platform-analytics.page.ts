import { Component, inject, OnInit, signal } from "@angular/core"
import { CurrencyPipe } from "@angular/common"
import { forkJoin } from "rxjs"
import Store from "../../../core/state/portfolio.store"
import {
  PlatformAnalyticsService,
  type PlatformAnalytics,
  type ClientOrderStatus,
  type PlatformTrend,
} from "../../../core/api/auth/api/platform-analytics.service"

@Component({
  selector: "app-analytics",
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: "./platform-analytics.page.html",
  styleUrls: ["./platform-analytics.page.scss"],
})
export default class Analytics implements OnInit {
  private readonly analyticsApi = inject(PlatformAnalyticsService)
  store = inject(Store)
  analytics = signal<PlatformAnalytics | null>(null)
  trends = signal<PlatformTrend[]>([])
  orderStatuses = signal<ClientOrderStatus[]>([])
  loading = signal(false)
  error = signal("")

  ngOnInit() {
    this.loading.set(true)
    forkJoin({
      analytics: this.analyticsApi.getAnalytics(),
      trends: this.analyticsApi.getTrends(),
      orderStatuses: this.analyticsApi.getOrderStatus(),
    }).subscribe({
      next: ({ analytics, trends, orderStatuses }) => {
        this.analytics.set(analytics)
        this.trends.set(trends)
        this.orderStatuses.set(orderStatuses)
        this.loading.set(false)
      },
      error: (error: { error?: { message?: string }; message?: string }) => {
        this.error.set(error.error?.message || error.message || "Unable to load platform analytics.")
        this.loading.set(false)
      },
    })
  }

  get trendChartPoints() {
    const values = this.trends().map((trend) => trend.total_volume)
    const max = Math.max(...values, 1)
    const lastIndex = Math.max(values.length - 1, 1)
    return this.trends().map((trend, index) => ({
      period: trend.period,
      volume: trend.total_volume,
      x: (index / lastIndex) * 700,
      y: 210 - (trend.total_volume / max) * 180,
    }))
  }

  get trendPoints() {
    return this.trendChartPoints.map((point) => `${point.x},${point.y}`).join(" ")
  }

  get orderBreakdown() {
    return [
      { label: "Fulfilled", value: this.orderStatuses().reduce((sum, item) => sum + item.fulfilled_orders, 0) },
      { label: "Pending", value: this.orderStatuses().reduce((sum, item) => sum + item.pending_orders, 0) },
      { label: "Cancelled", value: this.orderStatuses().reduce((sum, item) => sum + item.cancelled_orders, 0) },
    ]
  }

  get orderTotal() {
    return this.orderBreakdown.reduce((sum, item) => sum + item.value, 0)
  }

  get topActiveClients() {
    return this.analytics()?.top_active_clients.slice(0, 3) ?? []
  }

  get cash() {
    return this.store.clients().reduce((sum, a) => sum + a.cash, 0)
  }
  get volume() {
    return this.store
      .orders()
      .filter((o) => o.status === "Fulfilled")
      .reduce((sum, o) => sum + o.price * o.quantity, 0)
  }
}
