import { Component, computed, DestroyRef, inject, input, OnInit, signal } from "@angular/core"
import { FormsModule } from "@angular/forms"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { from, merge, mergeMap, shareReplay, Subject, switchMap } from "rxjs"
import {
  AnalyticsApiService, type Granularity, type InstrumentSort, type OrderStatus,
  type ReportFilters, type TrendMetric,
} from "../../core/api/analytics-api.service"
import { loadReport, orderPageInfo, type ReportRequest, type ReportResult } from "../../core/api/analytics-report-state"
import AnalyticsCard from "../../shared/analytics/analytics-card.component"

@Component({
  selector: "app-analytics-workspace",
  standalone: true,
  imports: [FormsModule, AnalyticsCard],
  templateUrl: "./analytics-workspace.component.html",
  styleUrls: ["./analytics-workspace.component.scss"],
})
export default class AnalyticsWorkspace implements OnInit {
  audience = input.required<"client" | "employee">()
  private readonly api = inject(AnalyticsApiService)
  private readonly destroyRef = inject(DestroyRef)
  private readonly refreshRequests = new Subject<ReportRequest[]>()
  private readonly retryRequests = new Subject<ReportRequest>()
  private reportRequests = new Map<string, ReportRequest>()
  private readonly orderRequests = new Subject<ReportRequest>()
  readonly reports = signal<ReportResult[]>([])
  readonly orderReport = signal<ReportResult | null>(null)
  readonly loading = computed(() => this.reports().some((report) => report.loading))
  readonly validationError = signal("")
  readonly appliedFilters = signal<ReportFilters>({ days: 30 })
  readonly offset = signal(0)
  readonly pageSize = signal(50)
  readonly canNextPage = computed(() => {
    const report = this.orderReport()
    if (!report || report.loading || report.error) return false
    const { count, total } = orderPageInfo(report.data)
    return total !== null ? this.offset() + this.pageSize() < total : count === this.pageSize()
  })
  days = 30
  ticker = ""
  clientId: number | null = null
  startDate = ""
  endDate = ""
  orderStatus: OrderStatus | "" = ""
  granularity: Granularity = "daily"
  metric: TrendMetric = "trade_count"
  sortBy: InstrumentSort = "total_volume"
  instrumentLimit = 10
  limit = 50

  ngOnInit() {
    this.refreshRequests.pipe(
      // Do not open a connection for every card at once. Charts share their JSON
      // source with the table rather than re-running SQL through PNG endpoints.
      switchMap((requests) => merge(
        from(requests).pipe(mergeMap(loadReport, 2)),
        this.retryRequests.pipe(mergeMap(loadReport, 2)),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((result) => this.reports.update((reports) => reports.map((report) => report.id === result.id ? result : report)))
    this.orderRequests.pipe(
      switchMap(loadReport),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((report) => this.orderReport.set(report))
    this.refresh()
  }

  refresh() {
    this.validationError.set("")
    if (!Number.isInteger(this.days) || this.days < 1 || this.days > 3650) {
      this.validationError.set("Period must be a whole number from 1 to 3650 days."); return
    }
    if (this.audience() === "employee") {
      if (this.clientId !== null && (!Number.isSafeInteger(this.clientId) || this.clientId <= 0)) {
        this.validationError.set("Client ID must be a positive whole number."); return
      }
      if (this.startDate && this.endDate && this.startDate > this.endDate) {
        this.validationError.set("Start date must not be after end date."); return
      }
      if (this.endDate === "9999-12-31") { this.validationError.set("End date is too large."); return }
      if (this.ticker.trim().length > 40) { this.validationError.set("Ticker cannot exceed 40 characters."); return }
      if (!Number.isInteger(this.instrumentLimit) || this.instrumentLimit < 1 || this.instrumentLimit > 1000) {
        this.validationError.set("Instrument limit must be a whole number from 1 to 1000."); return
      }
      if (!Number.isInteger(this.limit) || this.limit < 1 || this.limit > 500) {
        this.validationError.set("Orders per page must be a whole number from 1 to 500."); return
      }
    }
    const filters: ReportFilters = this.audience() === "client" ? { days: this.days } : {
      days: this.days, ticker: this.ticker.trim() || undefined,
      client_id: this.clientId ?? undefined, start_date: this.startDate || undefined,
      end_date: this.endDate || undefined, order_status: this.orderStatus || undefined,
    }
    this.appliedFilters.set(filters)
    const requests = this.audience() === "client" ? this.clientReports(filters.days) : this.employeeReports(filters)
    this.reportRequests = new Map(requests.map((report) => [report.id, report]))
    this.reports.set(requests.map((report) => this.pending(report)))
    this.refreshRequests.next(requests)
    if (this.audience() === "employee") {
      this.offset.set(0)
      this.pageSize.set(this.limit)
      this.loadOrders()
    }
  }

  changePage(direction: -1 | 1) {
    if (this.orderReport()?.loading || (direction === 1 && !this.canNextPage())) return
    this.offset.update((offset) => Math.max(0, offset + direction * this.pageSize()))
    this.loadOrders()
  }

  retryReport(id: string) {
    if (id === "orders") { this.loadOrders(); return }
    const request = this.reportRequests.get(id)
    if (!request || this.reports().find((report) => report.id === id)?.loading) return
    this.reports.update((reports) => reports.map((report) => report.id === id ? this.pending(request) : report))
    this.retryRequests.next(request)
  }

  private loadOrders() {
    const report: ReportRequest = {
      id: "orders", title: "Filtered orders",
      description: "All applied filters. Results are paginated by the Python service.",
      request: this.api.getOrders(this.appliedFilters(), this.pageSize(), this.offset()),
    }
    this.orderReport.set(this.pending(report))
    this.orderRequests.next(report)
  }

  private pending(report: ReportRequest): ReportResult {
    return { id: report.id, title: report.title, description: report.description, metric: report.metric, loading: true, data: null, image: null, error: "" }
  }

  private clientReports(days: number): ReportRequest[] {
    const allocation = this.api.getClientAllocation().pipe(shareReplay({ bufferSize: 1, refCount: true }))
    const statuses = this.api.getClientOrderStatus(days).pipe(shareReplay({ bufferSize: 1, refCount: true }))
    return [
      { id: "gainers", title: "Top 5 holdings by profit", description: "Highest unrealized profit first (up to five). Missing price or cost-basis data is disclosed, not estimated.", request: this.api.getClientTopGainers() },
      { id: "allocation", title: "Portfolio allocation", description: "Current market value by category, including any unpriced ticker warnings.", request: allocation },
      { id: "allocation-chart", title: "Allocation percentages", description: "Stock, crypto, bitcoin, and other assets by priced market value. Bitcoin is not counted again as crypto; cash is excluded.", request: allocation },
      { id: "order-status", title: "Order status", description: `Your fulfilled, pending, and cancelled orders over the last ${days} days.`, request: statuses },
      { id: "orders-chart", title: "Order status chart", description: `Your order counts over the last ${days} days, from the same order-status response.`, request: statuses },
    ]
  }

  private employeeReports(filters: ReportFilters): ReportRequest[] {
    const trends = this.api.getTrends(filters, this.granularity).pipe(shareReplay({ bufferSize: 1, refCount: true }))
    return [
      { id: "volume", title: "Trading volume", description: "All applied filters. Defaults to fulfilled orders when no status is selected.", request: this.api.getTradingVolume(filters) },
      { id: "trends-chart", title: this.metric === "trade_count" ? "Total orders over time" : "Trading trend chart", metric: this.metric, description: `All applied filters · ${this.granularity} · ${this.metric.replace(/_/g, " ")} · same data as the trends table.`, request: trends },
      { id: "trends", title: "Trading trends", description: `All applied filters · ${this.granularity} grouping.`, request: trends },
      { id: "most-active", title: "Most active instrument", description: "All applied filters · highest order count; ties are ordered by ticker. Includes all statuses unless a status is selected.", request: this.api.getInstruments(filters, "trade_count", 1) },
      { id: "instruments", title: "Instrument rankings", description: `All applied filters · ranked by ${this.sortBy.replace(/_/g, " ")} · top ${this.instrumentLimit}.`, request: this.api.getInstruments(filters, this.sortBy, this.instrumentLimit) },
      { id: "activity", title: "Client activity trend", description: `All applied filters · ${this.granularity} distinct active-client counts; individual client activity remains in the table.`, request: this.api.getClientActivity(filters, this.granularity) },
    ]
  }
}