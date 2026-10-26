import { Component, computed, effect, inject, signal } from "@angular/core"
import { CurrencyPipe, DatePipe } from "@angular/common"
import { catchError, defer, EMPTY, exhaustMap, merge, Subject, timer } from "rxjs"
import { PortfolioValueService, portfolioPeriods, portfolioSeries, type PortfolioObservation, type PortfolioPeriod } from "../../core/api/portfolio-value.service"
import { TokenStore } from "../../core/auth/token-store.service"
import AnalyticsChart from "../analytics/analytics-chart.component"
import type { ReportChart } from "../../core/api/analytics-presentation"

@Component({
  selector: "app-portfolio-value",
  standalone: true,
  imports: [CurrencyPipe, DatePipe, AnalyticsChart],
  template: `
    <section class="portfolio-value" aria-label="Total portfolio value">
      <div class="portfolio-main">
        <div class="portfolio-heading">
          <span class="portfolio-eyebrow">Your portfolio</span>
          <span class="value-label">Total portfolio value</span>
          <h2>{{ latest() ? (latest()!.total | currency:'USD') : 'Unavailable' }}</h2>
          <span class="currency-label">USD <span aria-hidden="true">·</span> Cash + investments</span>
          <div class="period-tabs" role="group" aria-label="Portfolio chart time range">
            @for (value of periods; track value) {
              <button type="button" [class.active]="period() === value" [attr.aria-pressed]="period() === value" (click)="selectPeriod(value)">{{ value }}</button>
            }
          </div>
        </div>
        <div class="portfolio-visual">
          <div class="chart-toolbar">
            <span class="observation-badge"><i aria-hidden="true"></i>{{ loading() ? 'Updating value' : 'Observed account value' }}</span>
            <button type="button" class="refresh" (click)="refresh()" [disabled]="loading()">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M16 6V2.5M16 6h-3.5M16 6a7 7 0 1 0 1 7" /></svg>
              Refresh value
            </button>
          </div>
          @if (chart(); as data) { <app-analytics-chart [chart]="data" appearance="portfolio" description="Observed total portfolio value in USD" /> }
          @else {
            <div class="chart-placeholder" [attr.role]="loading() ? 'status' : null">
              <span class="placeholder-icon" aria-hidden="true">↗</span>
              <strong>{{ loading() ? 'Preparing your portfolio chart' : 'Your portfolio, at a glance' }}</strong>
              <span>{{ loading() ? 'Fetching your account balance and latest quotes…' : 'No verified observations in this time range yet.' }}</span>
            </div>
          }
          @if (loading() && latest()) { <span class="update-status" role="status">Updating account value…</span> }
        </div>
        <div class="portfolio-totals">
          <div><span>Buying power</span><strong>{{ latest() ? (latest()!.cash | currency:'USD') : '—' }}</strong><small>Available cash</small></div>
          <div><span>Invested</span><strong>{{ latest() ? (latest()!.invested | currency:'USD') : '—' }}</strong><small>Marked to market</small></div>
          <div><span>Positions</span><strong>{{ latest()?.positions ?? '—' }}</strong><small>Current holdings</small></div>
        </div>
      </div>
      @if (error()) { <p class="valuation-error" role="alert">{{ error() }}</p> }
      <footer class="portfolio-footer">
        <span class="coverage-label">Observations from this visit <span aria-hidden="true">·</span> Updates every 30 seconds</span>
        @if (latest(); as value) { <span class="last-updated">Last updated {{ value.timestamp | date:'shortTime' }}</span> }
      </footer>
      <details class="valuation-details">
        <summary>About this valuation &amp; chart coverage</summary>
        <p>Current cash plus holdings at latest bid, with ask fallback. USD quote currency required.
          Real observations collected while this overview is open; not reconstructed historical account values.
          Time controls filter available observations. The backend does not provide portfolio-value history,
          so selecting a wider range cannot create older data.</p>
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
  readonly observations = signal<PortfolioObservation[]>([])
  readonly latest = computed(() => this.observations().at(-1) ?? null)
  readonly loading = signal(false)
  readonly error = signal("")
  readonly now = signal(Date.now())
  readonly chart = computed<ReportChart | null>(() => {
    const points = portfolioSeries(this.observations(), this.period(), this.now())
    return points.length ? { kind: "line", labels: points.map((point) => point.timestamp), values: points.map((point) => point.total), format: "money", timeBased: true } : null
  })

  constructor() {
    effect((onCleanup) => {
      const user = this.tokens.currentUser()
      this.observations.set([])
      this.error.set("")
      this.loading.set(false)
      if (user?.actorType !== "client") return
      const subscription = merge(timer(0, 30000), this.refreshes).pipe(
        exhaustMap(() => {
          this.loading.set(true)
          return defer(() => this.api.observe()).pipe(catchError((error: { name?: string; message?: string }) => {
            this.error.set(error.name === "TimeoutError" ? "Account valuation timed out. Refresh after the backend is available." : error.message || "Unable to load account valuation.")
            this.loading.set(false)
            return EMPTY
          }))
        }),
      ).subscribe((point) => {
        this.now.set(Date.parse(point.timestamp))
        this.observations.update((points) => [...points, point].slice(-2880))
        this.error.set("")
        this.loading.set(false)
      })
      onCleanup(() => subscription.unsubscribe())
    })
  }
  selectPeriod(period: PortfolioPeriod) { this.now.set(Date.now()); this.period.set(period) }
  refresh() { this.refreshes.next() }
}