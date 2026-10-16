import { Component, inject } from "@angular/core"
import { CurrencyPipe } from "@angular/common"
import Store from "../../../core/state/portfolio.store"
import Chart from "../../../shared/charts/price-chart.component"

@Component({
  selector: "app-analytics",
  standalone: true,
  imports: [CurrencyPipe, Chart],
  template: `<div class="page-wrap"><div class="page-intro"><div><span class="eyebrow">All-client insights</span><h1>Platform analytics</h1><p>Account and trading activity across the platform.</p></div></div>
    <div class="stats-grid"><section class="stat-card"><span>Client accounts</span><strong>{{ store.clients().length }}</strong></section><section class="stat-card"><span>Client cash</span><strong>{{ cash | currency:'USD' }}</strong></section><section class="stat-card"><span>Total orders</span><strong>{{ store.orders().length }}</strong></section><section class="stat-card"><span>Trading volume</span><strong>{{ volume | currency:'USD' }}</strong></section></div>
    <div class="analytics-grid"><section class="surface analytics-chart"><div class="section-title"><div><span class="eyebrow">Activity</span><h2>Trading overview</h2></div></div><app-chart/></section><section class="surface activity-breakdown"><div class="section-title"><h2>Order breakdown</h2></div>@for (status of statuses; track status) { <div class="breakdown"><div><span>{{ status }}</span><strong>{{ count(status) }}</strong></div><i><b [style.width.%]="store.orders().length ? count(status) / store.orders().length * 100 : 0"></b></i></div> }</section></div>
    </div>`,
})
export default class Analytics {
  store = inject(Store)
  statuses = ["Fulfilled", "Pending", "Cancelled"]
  get cash() {
    return this.store.clients().reduce((sum, a) => sum + a.cash, 0)
  }
  get volume() {
    return this.store
      .orders()
      .filter((o) => o.status === "Fulfilled")
      .reduce((sum, o) => sum + o.price * o.quantity, 0)
  }
  count(status: string) {
    return this.store.orders().filter((o) => o.status === status).length
  }
}
