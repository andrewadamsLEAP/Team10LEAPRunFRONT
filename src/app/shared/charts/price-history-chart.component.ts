import { Component, computed, inject, input, signal } from "@angular/core"
import { CurrencyPipe, DatePipe } from "@angular/common"
import { toObservable, toSignal } from "@angular/core/rxjs-interop"
import { catchError, map, of, startWith, switchMap } from "rxjs"
import { MarketDataService, PriceHistoryPoint } from "../../core/api/market-data.service"

type HistoryState = {
  loading: boolean
  error: string | null
  points: PriceHistoryPoint[]
}

const periodDays: Record<string, number> = {
  "1D": 1, "1W": 7, "1M": 30, "1Y": 365,
}

@Component({
  selector: "app-price-history-chart",
  standalone: true,
  imports: [CurrencyPipe, DatePipe],
  template: `
    <div class="history-readout" aria-live="polite">
      @if (selected(); as point) {
        <strong>{{ point.price | currency:'USD':'symbol':digits() }}</strong>
        <span>{{ point.timestamp | date:'medium' }}</span>
      }
    </div>
    @if (state().loading) {
      <p class="empty-state" role="status">Loading price history...</p>
    } @else if (state().error; as error) {
      <p class="empty-state" role="alert">{{ error }}</p>
    } @else if (!coordinates().length) {
      <p class="empty-state">No price history available for this period.</p>
    } @else {
      <div class="price-chart">
        <svg viewBox="0 0 700 200" preserveAspectRatio="none"
          role="img" [attr.aria-label]="ticker() + ' price history. Use arrow keys to explore prices.'"
          tabindex="0" (pointermove)="inspect($event)" (pointerleave)="hoverTime.set(null)"
          (keydown)="onKey($event)">
          <path class="grid-line" d="M65 30H690M65 100H690M65 170H690"/>
          <path [attr.d]="line()" fill="none" stroke="currentColor" stroke-linecap="round"
            stroke-width="2.5" vector-effect="non-scaling-stroke"
            [class]="falling() ? 'negative' : 'positive'"/>
          @if (selected(); as point) {
            <line [attr.x1]="point.x" [attr.x2]="point.x" y1="20" y2="180"
              stroke="#87938c" stroke-dasharray="3 3"/>
            <circle [attr.cx]="point.x" [attr.cy]="point.y" r="4"
              fill="currentColor" [class]="falling() ? 'negative' : 'positive'"/>
          }
        </svg>
        <div class="history-price-axis" aria-hidden="true">
          <span>{{ prices().max | currency:'USD':'symbol':digits() }}</span>
          <span>{{ (prices().min + prices().max) / 2 | currency:'USD':'symbol':digits() }}</span>
          <span>{{ prices().min | currency:'USD':'symbol':digits() }}</span>
        </div>
      </div>
      <div class="history-axis">
        <span>{{ range().from | date:'short' }}</span>
        <span>{{ range().to | date:'short' }}</span>
      </div>
      <p class="history-note">{{ period() === '1M' ? 'Historical prices shown as hourly averages.' : 'Historical prices for the selected period.' }} All times are displayed in your local timezone.</p>
    }
  `,
  styles: [`
    :host { display: block; }
    .history-readout { min-height: 40px; padding: 0 20px; display: flex; align-items: center; gap: 12px; font-size: 12px; }
    .history-readout span, .history-axis, .history-note { color: var(--muted); font-size: 10px; }
    .history-axis { display: flex; justify-content: space-between; gap: 12px; padding: 8px 20px; }
    .history-note { margin: 8px 20px; }
    svg { outline-offset: -2px; }
    .price-chart { position: relative; }
    .history-price-axis { position: absolute; left: 20px; top: 15%; bottom: 15%; display: flex; flex-direction: column; justify-content: space-between; color: var(--muted); font-size: 9px; pointer-events: none; }
  `],
})
export default class PriceHistoryChart {
  readonly ticker = input.required<string>()
  readonly period = input("1M")
  readonly digits = input("1.2-2")
  readonly bucketSeconds = computed(() => {
    const days = periodDays[this.period()]
    return days <= 1 ? 60 : days <= 7 ? 900 : days <= 30 ? 3600 : 86400
  })
  readonly bucketLabel = computed(() => {
    const seconds = this.bucketSeconds()
    return seconds === 60 ? "minute" : seconds === 900 ? "15 minutes" : seconds === 3600 ? "hour" : "day"
  })
  private readonly api = inject(MarketDataService)
  readonly hoverTime = signal<number | null>(null)
  readonly range = computed(() => {
    const days = periodDays[this.period()]
    const to = new Date()
    return { from: new Date(to.getTime() - days * 86_400_000), to }
  })
  private readonly request = computed(() => ({
    ticker: this.ticker(), period: this.period(), ...this.range(),
  }))
  readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ ticker, period, from, to }) => {
        this.hoverTime.set(null)
        const days = periodDays[period]
        if (!days) {
          return of<HistoryState>({ loading: false, error: "Unsupported chart period.", points: [] })
        }
        return this.api.getPriceHistory(ticker, from, to).pipe(
          map((points): HistoryState => {
            if (points.some((point) =>
              !Number.isFinite(point.price) || !Number.isFinite(Date.parse(point.timestamp)),
            )) {
              throw new Error("Invalid price history response")
            }
            return {
              loading: false, error: null,
              points: points
                .filter((point) => {
                  const time = Date.parse(point.timestamp)
                  return time >= from.getTime() && time <= to.getTime()
                })
                .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)),
            }
          }),
          catchError(() => of<HistoryState>({
            loading: false, error: "Unable to load price history. Try another period or reload the page.", points: [],
          })),
          startWith<HistoryState>({ loading: true, error: null, points: [] }),
        )
      }),
    ),
    { initialValue: { loading: true, error: null, points: [] } as HistoryState },
  )
  readonly prices = computed(() => {
    const points = this.state().points
    let min = points[0]?.price ?? 0
    let max = min
    for (const point of points) {
      min = Math.min(min, point.price)
      max = Math.max(max, point.price)
    }
    return { min, max }
  })
  readonly coordinates = computed(() => {
    const points = this.state().points
    const { min, max } = this.prices()
    const first = this.range().from.getTime()
    const duration = this.range().to.getTime() - first
    return points.map((point) => ({
      ...point,
      time: Date.parse(point.timestamp),
      x: duration ? 65 + ((Date.parse(point.timestamp) - first) / duration) * 625 : 377.5,
      y: max === min ? 100 : 170 - ((point.price - min) / (max - min)) * 140,
    }))
  })
  readonly line = computed(() => this.coordinates().map((point, index) => {
    return `${index ? "L" : "M"}${point.x},${point.y}${index ? "" : "l0,0"}`
  }).join(" "))
  readonly falling = computed(() => {
    const points = this.coordinates()
    return points.length > 1 && points[points.length - 1].price < points[0].price
  })
  readonly selected = computed(() => {
    const points = this.coordinates()
    const time = this.hoverTime()
    if (time === null) return points[points.length - 1] ?? null
    if (!points.length || time < points[0].time || time > points[points.length - 1].time) return null
    const nearest = points.reduce((nearest, point) =>
      Math.abs(point.time - time) < Math.abs(nearest.time - time) ? point : nearest,
    points[0])
    return nearest
  })
  inspect(event: PointerEvent) {
    if (!(event.currentTarget instanceof SVGSVGElement)) return
    const points = this.coordinates()
    if (!points.length) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, ((event.clientX - bounds.left) / bounds.width * 700 - 65) / 625))
    const { from, to } = this.range()
    this.hoverTime.set(from.getTime() + fraction * (to.getTime() - from.getTime()))
  }
  onKey(event: KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    const points = this.coordinates()
    const index = points.indexOf(this.selected()!)
    const next = Math.max(0, Math.min(points.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1)))
    if (points[next]) this.hoverTime.set(points[next].time)
  }
}
