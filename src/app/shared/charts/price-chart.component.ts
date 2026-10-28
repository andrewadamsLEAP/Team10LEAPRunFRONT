import { Component, Input, OnChanges, OnDestroy, SimpleChanges, inject } from "@angular/core"
import { MarketDataService } from "../../core/api/market-data.service"
import { EMPTY, Subscription, catchError, switchMap, timer } from "rxjs"

type ChartPoint = { timestamp: string; price: number }

@Component({
  selector: "app-chart",
  standalone: true,
  template: `<div class="price-chart"><svg viewBox="0 0 700 200" preserveAspectRatio="none" role="img" [attr.aria-label]="ticker ? ticker + ' price history' : 'Price history'">
    <path class="grid-line" d="M0 40H700M0 100H700M0 160H700"/>
    <polyline [attr.points]="flat ? '0,120 700,120' : points" fill="none" stroke="currentColor" stroke-width="2.5" class="positive"/>
  </svg></div>`,
})
export default class Chart implements OnChanges, OnDestroy {
  private readonly marketData = inject(MarketDataService)
  private historyRequest?: Subscription
  private liveUpdates?: Subscription
  private history: ChartPoint[] = []
  @Input() flat = false
  @Input() period = "1M"
  @Input() ticker = ""
  @Input() points = "0,120 700,120"

  ngOnChanges(changes: SimpleChanges) {
    if ((changes["ticker"] || changes["period"]) && this.ticker) {
      this.loadHistory()
    }
  }

  ngOnDestroy() {
    this.historyRequest?.unsubscribe()
    this.liveUpdates?.unsubscribe()
  }

  private loadHistory() {
    this.historyRequest?.unsubscribe()
    this.liveUpdates?.unsubscribe()
    this.history = []
    this.points = "0,120 700,120"
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
          this.updatePoints()
          this.startLiveUpdates()
        },
        error: () => {
          this.startLiveUpdates()
        },
      })
  }

  private startLiveUpdates() {
    this.liveUpdates?.unsubscribe()
    this.liveUpdates = timer(0, 5_000)
      .pipe(
        switchMap(() =>
          this.marketData
            .getLatestPrice(this.ticker.replace("/", "-"))
            .pipe(catchError(() => EMPTY)),
        ),
      )
      .subscribe((records) => {
        for (const record of records) {
          const price = record.ask_price ?? record.bid_price
          if (price == null || !Number.isFinite(price)) continue
          const point = {
            timestamp: record.recorded_at || record.quote_timestamp || "",
            price,
          }
          const last = this.history[this.history.length - 1]
          if (!last || last.timestamp !== point.timestamp || last.price !== point.price) {
            this.history.push(point)
            this.updatePoints()
          }
        }
      })
  }

  private updatePoints() {
    this.points = this.toPoints(this.history.map((point) => point.price))
  }

  private toPoints(prices: number[]) {
    if (!prices.length) return "0,120 700,120"
    if (prices.length === 1) return "0,100 700,100"
    const smoothed = prices.map((_, index) => {
      const start = Math.max(0, index - 1)
      const end = Math.min(prices.length, index + 2)
      const window = prices.slice(start, end)
      return window.reduce((sum, price) => sum + price, 0) / window.length
    })
    const minimum = Math.min(...smoothed)
    const maximum = Math.max(...smoothed)
    const range = maximum - minimum || 1
    return smoothed
      .map((price, index) => {
        const x = (index / (prices.length - 1)) * 700
        const y = 175 - ((price - minimum) / range) * 150
        return `${x},${y}`
      })
      .join(" ")
  }
}
