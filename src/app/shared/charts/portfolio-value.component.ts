import { Component, computed, effect, inject, signal } from "@angular/core"
import { CurrencyPipe, DatePipe } from "@angular/common"
import { catchError, defer, EMPTY, exhaustMap, map, merge, Subject, timer } from "rxjs"
import { PortfolioValueService, portfolioPeriods, portfolioHistorySeries, hasMissingPrices, type PortfolioHistory, type PortfolioObservation, type PortfolioPeriod } from "../../core/api/portfolio-value.service"
import { TokenStore } from "../../core/auth/token-store.service"
import AnalyticsChart from "../analytics/analytics-chart.component"
import type { ReportChart } from "../../core/api/analytics-presentation"

@Component({
  selector: "app-portfolio-value",
  standalone: true,
  imports: [CurrencyPipe, DatePipe, AnalyticsChart],
  template: `
    <section class="portfolio-value" aria-label="Holdings market value">
      <div class="portfolio-main">
        <div class="portfolio-heading">
          <span class="portfolio-eyebrow">Your portfolio</span>
          <span class="value-label">Holdings market value</span>
          <h2>{{ latest() ? (latest()!.invested | currency:'USD') : 'Unavailable' }}</h2>
          <span class="currency-label">USD <span aria-hidden="true">·</span> Investments, excluding cash</span>
          <div class="period-tabs" role="group" aria-label="Portfolio chart time range">
            @for (value of periods; track value) {
              <button type="button" [class.active]="period() === value" [attr.aria-pressed]="period() === value" (click)="selectPeriod(value)">{{ value }}</button>
            }
          </div>
        </div>
        <div class="portfolio-visual">
          <div class="chart-toolbar">
            <span class="observation-badge"><i aria-hidden="true"></i>{{ loading() ? 'Updating history' : 'Historical holdings value' }}</span>
            <button type="button" class="refresh" (click)="refresh()" [disabled]="loading()">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M16 6V2.5M16 6h-3.5M16 6a7 7 0 1 0 1 7" /></svg>
              Retry / refresh
            </button>
          </div>
          @if (chart(); as data) { <app-analytics-chart [chart]="data" appearance="portfolio" description="Historical holdings market value in USD, excluding cash" /> }
          @else {
            <div class="chart-placeholder" [attr.role]="loading() ? 'status' : null">
              <span class="placeholder-icon" aria-hidden="true">↗</span>
              <strong>{{ loading() ? 'Preparing your portfolio chart' : 'Your portfolio, at a glance' }}</strong>
              <span>{{ loading() ? 'Loading holdings history…' : historyError() ? 'History could not be loaded. Try again.' : history()?.points?.length ? 'No complete valuations in this time range.' : 'No holdings history in this time range.' }}</span>
            </div>
          }
          @if (loading() && history()) { <span class="update-status" role="status">Updating history…</span> }
        </div>
        <div class="portfolio-totals">
          <div><span>Buying power</span><strong>{{ latest() ? (latest()!.cash | currency:'USD') : '—' }}</strong><small>Available cash</small></div>
          <div><span>Invested</span><strong>{{ latest() ? (latest()!.invested | currency:'USD') : '—' }}</strong><small>Marked to market</small></div>
          <div><span>Positions</span><strong>{{ latest()?.positions ?? '—' }}</strong><small>Current holdings</small></div>
        </div>
      </div>
      @if (error()) { <p class="valuation-error" role="alert">{{ error() }}</p> }
      @if (historyError()) { <p class="valuation-error" role="alert">{{ historyError() }}</p> }
      @if (incomplete()) { <p class="valuation-error" role="status">Incomplete historical coverage. Missing or unverified valuations are shown as gaps.</p> }
      <footer class="portfolio-footer">
        <span class="coverage-label">{{ coverageLabel() }} <span aria-hidden="true">·</span> History refreshes every 30 seconds</span>
        @if (latest(); as value) { <span class="last-updated">Last updated {{ value.timestamp | date:'shortTime' }}</span> }
      </footer>
      <details class="valuation-details">
        <summary>About this valuation &amp; chart coverage</summary>
        <p>Historical holdings market value excludes cash and is reconstructed by the backend for the selected range.
          Current account figures update separately every 5 seconds using latest bid, with ask fallback.
          Changes in market value are not investment returns.</p>
        @if (latest(); as value) {
          <p>Last observed: {{ value.timestamp | date:'medium' }}.
            @if (value.oldestQuote) { Oldest quote used: {{ value.oldestQuote | date:'medium' }}. Market closures or stale quotes can affect valuation. }
          </p>
        }
      </details>
    </section>
  `,
  styleUrls: ["./portfolio-value.component.scss"],
})
export default class PortfolioValueComponent {
  private readonly api = inject(PortfolioValueService)
  private readonly tokens = inject(TokenStore)
  private readonly refreshes = new Subject<void>()
  readonly periods = portfolioPeriods
  readonly period = signal<PortfolioPeriod>("1M")
  readonly history = signal<PortfolioHistory | null>(null)
  readonly latest = signal<PortfolioObservation | null>(null)
  readonly loading = signal(false)
  readonly error = signal("")
  readonly historyError = signal("")
  readonly now = signal(Date.now())
  readonly historyPoints = computed(() => portfolioHistorySeries(this.history()?.points ?? [], this.period(), this.now()))
  readonly incomplete = computed(() => {
    const history = this.history()
    if (!history) return false
    const coverage = history.coverage
    const status = typeof coverage === "string" ? coverage : coverage && typeof coverage === "object" && "status" in coverage ? String(coverage.status) : ""
    return this.historyPoints().some((point) => point.invested === null) || hasMissingPrices(history.missingPrices)
      || /partial|incomplete|missing|unavailable/i.test(status)
      || Boolean(coverage && typeof coverage === "object" && "complete" in coverage && coverage.complete === false)
  })
  readonly coverageLabel = computed(() => {
    if (!this.history()) return "Historical coverage unavailable"
    if (this.incomplete()) return "Partial historical coverage"
    if (this.history()!.coverage == null) return "Historical coverage not supplied"
    return "Backend historical coverage"
  })
  readonly chart = computed<ReportChart | null>(() => {
    const points = this.historyPoints()
    return points.some((point) => point.invested !== null) ? { kind: "line", labels: points.map((point) => point.timestamp), values: points.map((point) => point.invested), format: "money", timeBased: true } : null
  })

  constructor() {
    effect((onCleanup) => {
      const user = this.tokens.currentUser()
      const period = this.period()
      this.history.set(null)
      this.historyError.set("")
      this.loading.set(false)
      if (user?.actorType !== "client") return
      const subscription = merge(timer(0, 30000), this.refreshes).pipe(
        exhaustMap(() => {
          this.loading.set(true)
          const to = Date.now()
          return defer(() => this.api.history(period, to)).pipe(map((history) => ({ history, to })), catchError((error: { status?: number; name?: string }) => {
            const reason = error.name === "TimeoutError" ? "request timed out"
              : error.status ? `HTTP ${error.status}` : "connection or response error"
            this.historyError.set(`Unable to load ${period} holdings history (${reason}). Retry when the backend is available.`)
            this.loading.set(false)
            return EMPTY
          }))
        }),
      ).subscribe(({ history, to }) => {
        this.now.set(to)
        this.history.set(history)
        this.historyError.set("")
        this.loading.set(false)
      })
      onCleanup(() => subscription.unsubscribe())
    })
    effect((onCleanup) => {
      const user = this.tokens.currentUser()
      this.latest.set(null)
      this.error.set("")
      if (user?.actorType !== "client") return
      const subscription = merge(timer(0, 5000), this.refreshes).pipe(
        exhaustMap(() => defer(() => this.api.observe()).pipe(catchError(() => {
          this.latest.set(null)
          this.error.set("Current holdings valuation is unavailable. Retrying automatically.")
          return EMPTY
        }))),
      ).subscribe((point) => {
        this.latest.set(point)
        this.error.set("")
      })
      onCleanup(() => subscription.unsubscribe())
    })
  }
  selectPeriod(period: PortfolioPeriod) { this.now.set(Date.now()); this.period.set(period) }
  refresh() { this.refreshes.next() }
}