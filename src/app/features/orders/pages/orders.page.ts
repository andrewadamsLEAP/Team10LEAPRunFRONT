import { Component, inject, OnInit, signal } from "@angular/core"
import { CurrencyPipe, DatePipe, DecimalPipe } from "@angular/common"
import { HttpClient } from "@angular/common/http"
import { RouterLink } from "@angular/router"
import Store from "../../../core/state/portfolio.store"
import { BASE_PATH } from "../../../core/api/auth"

type AdminOrderRecord = {
  order_id?: string | number
  orderId?: string | number
  clientId?: string | number
  client_id?: string | number
  ticker?: string
  order_type?: string
  orderType?: string
  order_status?: string
  orderStatus?: string
  status?: string
  quantity?: number
  price?: number
  order_date?: string
  orderDate?: string
  createdAt?: string
}

type OrderRow = {
  id: string
  client: string
  ticker: string
  type: string
  status: string
  price: number
  quantity: number
  date: string
}

@Component({
  selector: "app-orders-page",
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, RouterLink],
  template: `
    <div class="page-wrap"><div class="page-intro"><div><span class="eyebrow">{{ client ? 'Your account' : 'All-client reporting' }}</span><h1>Orders</h1><p>{{ client ? 'Manage your portfolio activity in USD.' : 'Review activity across client accounts.' }}</p></div>@if (client) { <div class="cash-badge"><span>Buying power</span><strong>{{ store.cash | currency:'USD' }}</strong></div> }</div>
      <section class="surface data-surface"><div class="data-table order-table" [class.with-client]="!client"><div class="data-row data-head"><span>Order ID</span>@if (!client) { <span>Client</span> }<span>Ticker</span><span>Side</span><span>Status</span><span>Price</span><span>Quantity</span><span>Date &amp; time</span></div>
        @if (employee && loading()) { <p class="empty-state" role="status">Loading orders…</p> }
        @else if (employee && loadError()) { <p class="empty-state" role="alert">{{ loadError() }}</p> }
        @else { @for (o of orders; track o.id) { <div class="data-row"><strong>{{ o.id }}</strong>@if (!client) { <span>{{ o.client }}</span> }<a [routerLink]="client ? ['/client/ticker', o.ticker] : null">{{ o.ticker }}</a><span [class]="'side-tag ' + o.type.toLowerCase()">{{ o.type }}</span><span [class]="'status ' + o.status.toLowerCase()">{{ o.status }}</span><span>{{ o.price | currency:'USD':'symbol':'1.2-4' }}</span><span>{{ o.quantity | number:'1.0-6' }}</span><span>{{ formatOrderDate(o.date) }}</span></div> } @empty { <p class="empty-state">No orders yet.</p> } }
      </div></section>
    </div>`,
})
export default class OrdersPage implements OnInit {
  store = inject(Store)
  http = inject(HttpClient)
  apiBasePath = inject(BASE_PATH)
  adminOrders = signal<OrderRow[]>([])
  loading = signal(false)
  loadError = signal("")

  ngOnInit() {
    if (!this.employee) return

    this.loading.set(true)
    this.http
      .get<AdminOrderRecord[]>(`${this.apiBasePath}/v1/orders/employee/all`, {
        timeout: 15000,
      })
      .subscribe({
        next: (records) => {
          this.adminOrders.set(records.map((record) => ({
            id: String(record.orderId ?? record.order_id ?? "—"),
            client: String(record.clientId ?? record.client_id ?? "—"),
            ticker: record.ticker ?? "—",
            type: record.orderType ?? record.order_type ?? "—",
            status: record.status ?? record.orderStatus ?? record.order_status ?? "—",
            quantity: Number(record.quantity ?? 0),
            price: Number(record.price ?? 0),
            date: record.createdAt ?? record.orderDate ?? record.order_date ?? "—",
          })))
          this.loading.set(false)
        },
        error: (error: { error?: { message?: string }; message?: string }) => {
          this.loadError.set(
            error.error?.message ||
              error.message ||
              "Unable to load orders from the backend.",
          )
          this.loading.set(false)
        },
      })
  }

  get client() {
    return this.store.session()?.role === "client"
  }
  get admin() {
    return this.store.session()?.role === "admin"
  }
  get employee() {
    const role = this.store.session()?.role
    return role === "admin" || role === "reporter"
  }
  get orders() {
    if (this.employee) return this.adminOrders()
    return this.client ? this.store.clientOrders : this.store.orders()
  }

  formatOrderDate(value: string) {
    if (!value || value === "—") return value
    const normalized = value.replace(
      /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?!Z|[+-]\d{2}:?\d{2})$/,
      "$1T$2",
    )
    const date = new Date(normalized)
    if (Number.isNaN(date.getTime())) return value
    return new DatePipe("en-US").transform(date, "medium") ?? value
  }
}
