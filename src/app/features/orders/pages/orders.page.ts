import { Component, inject } from "@angular/core"
import { CurrencyPipe, DecimalPipe } from "@angular/common"
import { RouterLink } from "@angular/router"
import Store from "../../../core/state/portfolio.store"

@Component({
  selector: "app-orders-page",
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, RouterLink],
  template: `
    <div class="page-wrap"><div class="page-intro"><div><span class="eyebrow">{{ client ? 'Your account' : 'All-client reporting' }}</span><h1>Orders</h1><p>{{ client ? 'Manage your portfolio activity in USD.' : 'Review activity across client accounts.' }}</p></div>@if (client) { <div class="cash-badge"><span>Buying power</span><strong>{{ store.cash | currency:'USD' }}</strong></div> }</div>
      <section class="surface data-surface"><div class="data-table order-table" [class.with-client]="!client"><div class="data-row data-head"><span>Order ID</span>@if (!client) { <span>Client</span> }<span>Asset</span><span>Side</span><span>Status</span><span>Price</span><span>Quantity</span><span>Date &amp; time</span></div>
        @for (o of orders; track o.id) { <div class="data-row"><strong>{{ o.id }}</strong>@if (!client) { <span>{{ o.client }}</span> }<a [routerLink]="client ? ['/client/ticker', o.ticker] : null">{{ o.ticker }}</a><span [class]="'side-tag ' + o.type.toLowerCase()">{{ o.type }}</span><span [class]="'status ' + o.status.toLowerCase()">{{ o.status }}</span><span>{{ o.price | currency:'USD':'symbol':'1.2-4' }}</span><span>{{ o.quantity | number:'1.0-6' }}</span><span>{{ o.date }}</span></div> } @empty { <p class="empty-state">No orders yet.</p> }
      </div></section>
    </div>`,
})
export default class OrdersPage {
  store = inject(Store)
  get client() {
    return this.store.session()?.role === "client"
  }
  get orders() {
    return this.client ? this.store.clientOrders : this.store.orders()
  }
}
