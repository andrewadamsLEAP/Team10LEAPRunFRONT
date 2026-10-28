import { Component, Input, OnChanges, OnDestroy, SimpleChanges, inject, signal } from "@angular/core"
import { MarketDataService } from "../../core/api/market-data.service"
import { Subscription } from "rxjs"
import { chartCoordinates, reduceChartSeries } from "./chart-series"

type ChartPoint = { timestamp: string; price: number }

@Component({
  selector: "app-chart",
  standalone: true,
  template: `<div class="price-chart"><svg viewBox="0 0 700 200" preserveAspectRatio="none" role="img" [attr.aria-label]="ticker ? ticker + ' price history' : 'Price history'">
    <path class="grid-line" d="M0 40H700M0 100H700M0 160H700"/>
    <polyline [attr.points]="flat ? '0,120 700,120' : points()" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" class="positive"/>
    @if (loading()) { <text x="350" y="100" text-anchor="middle" fill="currentColor" font-size="13">Loading history…</text> }
    @else if (!points() && !flat) { <text x="350" y="100" text-anchor="middle" fill="currentColor" font-size="13">{{ error() || 'No price history available' }}</text> }
  </svg></div>`,
})
export default class Chart implements OnChanges, OnDestroy {
  private readonly marketData = inject(MarketDataService)
  private historyRequest?: Subscription
  private history: ChartPoint[] = []
  @Input() flat = false
  @Input() period = "1M"
  @Input() ticker = ""
  @Input() livePrice: number | null = null
  @Input() liveTimestamp: string | null = null
  readonly points = signal("")
  readonly loading = signal(false)
  readonly error = signal("")

  ngOnChanges(changes: SimpleChanges) {
    if (changes["ticker"] || changes["period"]) {
      this.loadHistory()
    } else if (changes["livePrice"] || changes["liveTimestamp"]) {
      this.appendLiveQuote()
    }
  }

  ngOnDestroy() {
    this.historyRequest?.unsubscribe()
  }

  private loadHistory() {
    this.historyRequest?.unsubscribe()
    this.history = []
    this.points.set("")
    this.error.set("")
    if (!this.ticker) {
      this.loading.set(false)
      return
    }
    this.loading.set(true)
    const to = new Date()
    const days = this.period === "1D" ? 1 : this.period === "1W" ? 7 : this.period === "1Y" ? 365 : 30
    const from = new Date(to)
    from.setUTCDate(from.getUTCDate() - days)
    this.historyRequest = this.marketData
      .getPriceHistory(
        this.ticker.replace("/", "-"),
        from,
        to,
      )
      .subscribe({
        next: (records) => {
          this.history = records
            .map((record) => ({
              timestamp: record.timestamp,
              price: record.price,
            }))
            .filter((point): point is ChartPoint =>
              point.price != null && Number.isFinite(point.price),
            )
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
          this.loading.set(false)
          this.appendLiveQuote()
        },
        error: () => {
          this.loading.set(false)
          this.error.set("History temporarily unavailable")
          this.appendLiveQuote()
        },
      })
  }

  private appendLiveQuote() {
    if (this.loading()) return
    const time = Date.parse(this.liveTimestamp ?? "")
    const last = this.history[this.history.length - 1]
    if (this.livePrice != null && Number.isFinite(this.livePrice) && Number.isFinite(time)
      && (!last || time >= Date.parse(last.timestamp))) {
      this.history.push({ timestamp: this.liveTimestamp!, price: this.livePrice })
    }
    const days = this.period === "1D" ? 1 : this.period === "1W" ? 7 : this.period === "1Y" ? 365 : 30
    const cutoff = Date.now() - days * 86_400_000
    this.history = reduceChartSeries(this.history.filter((point) => Date.parse(point.timestamp) >= cutoff))
    this.points.set(chartCoordinates(this.history))
  }
}
