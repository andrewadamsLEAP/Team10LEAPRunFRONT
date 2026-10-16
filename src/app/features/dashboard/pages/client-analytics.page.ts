import { Component, inject } from "@angular/core"
import { CurrencyPipe } from "@angular/common"
import Store from "../../../core/state/portfolio.store"
import Chart from "../../../shared/charts/price-chart.component"

@Component({
  selector: "app-client-analytics-page",
  standalone: true,
  imports: [CurrencyPipe, Chart],
  template: `
    <div class="page-wrap">
      <div class="page-intro"><div><span class="eyebrow">Portfolio insights</span><h1>Your analytics</h1><p>Here is what is happening with your portfolio today.</p></div></div>
      <section class="portfolio-hero"><div class="portfolio-copy"><span>Total portfolio value</span><h2>{{ store.cash + store.invested | currency:'USD' }}</h2><div class="gain">USD portfolio</div>
        <div class="period-tabs">@for (p of periods; track p) { <button [class.active]="period === p" (click)="period = p">{{ p }}</button> }</div>
      </div><app-chart [flat]="!store.holdings.length" [period]="period"/><div class="portfolio-stats"><div><span>Buying power</span><strong>{{ store.cash | currency:'USD' }}</strong></div><div><span>Invested</span><strong>{{ store.invested | currency:'USD' }}</strong></div><div><span>Positions</span><strong>{{ store.holdings.length }}</strong></div></div></section>
      <div class="stats-grid"><section class="stat-card"><span>Cash balance</span><strong>{{ store.cash | currency:'USD' }}</strong></section><section class="stat-card"><span>Market value</span><strong>{{ store.invested | currency:'USD' }}</strong></section><section class="stat-card"><span>Fulfilled orders</span><strong>{{ store.clientOrders.length }}</strong></section><section class="stat-card"><span>Unrealized return</span><strong>{{ returns | currency:'USD' }}</strong></section></div>
    </div>`,
})
export default class ClientAnalyticsPage {
  store = inject(Store)
  periods = ["1D", "1W", "1M", "1Y"]
  period = "1M"
  get returns() {
    return (
      this.store.invested -
      this.store.holdings.reduce((sum, p) => sum + p.average * p.quantity, 0)
    )
  }
}
