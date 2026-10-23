import { Component, inject, OnInit, signal } from "@angular/core"
import { CurrencyPipe, DecimalPipe } from "@angular/common"
import { RouterLink } from "@angular/router"
import { OrdersApiService } from "../../../core/api/orders-api.service"
import { TokenStore } from "../../../core/auth/token-store.service"
import Store from "../../../core/state/portfolio.store"
import Chart from "../../../shared/charts/price-chart.component"

@Component({
  selector: "app-dashboard-page",
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, RouterLink, Chart],
  template: `
    <div class="page-wrap">
      <div class="page-intro"><div><span class="eyebrow">Client dashboard</span><h1>Good morning, {{ store.name }}</h1><p>Here is what is happening with your portfolio today.</p></div></div>
      <section class="portfolio-hero"><div class="portfolio-copy"><span>Total portfolio value</span><h2>{{ store.cash + store.invested | currency:'USD' }}</h2><div class="gain">USD portfolio</div>
        <div class="period-tabs">@for (p of periods; track p) { <button [class.active]="period === p" (click)="period = p">{{ p }}</button> }</div>
      </div><app-chart [flat]="!store.holdings.length" [period]="period"/><div class="portfolio-stats"><div><span>Buying power</span><strong>{{ store.cash | currency:'USD' }}</strong></div><div><span>Invested</span><strong>{{ store.invested | currency:'USD' }}</strong></div><div><span>Positions</span><strong>{{ store.holdings.length }}</strong></div></div></section>
      <div class="content-grid"><section class="surface"><div class="section-title"><div><span class="eyebrow">Discover assets</span><h2>Trending tickers</h2></div></div>
        <div class="ticker-table"><div class="ticker-row ticker-head"><span>Asset</span><span>Market</span><span>Price</span><span>Today</span><span>Volume</span><span></span></div>
          @for (a of store.assets; track a.symbol) { <a class="ticker-row" [routerLink]="['/client/ticker', a.symbol]"><span class="ticker-name"><i>{{ a.symbol[0] }}</i><b>{{ a.symbol }}<small>{{ displayName(a.symbol, a.name) }}</small></b></span><span>{{ a.kind }}</span><strong>{{ a.price | currency:'USD':'symbol':(a.kind === 'Forex' ? '1.4-4' : '1.2-2') }}</strong><span [class]="a.change >= 0 ? 'positive' : 'negative'">{{ a.change > 0 ? '+' : '' }}{{ a.change }}%</span><span>{{ a.volume }}</span><span>›</span></a> }
        </div>
      </section><aside class="home-sidebar"><section class="surface"><div class="section-title small"><div><span class="eyebrow">Portfolio</span><h2>Top holdings</h2></div><a routerLink="/client/holdings">View all</a></div>
        @for (p of store.holdings.slice(0,3); track p.symbol) { <a class="mini-list-row" [routerLink]="['/client/ticker', p.symbol]"><i>{{ p.symbol[0] }}</i><span><b>{{ p.symbol }}</b><small>{{ p.quantity | number:'1.0-6' }} units</small></span><em>{{ positionValue(p.symbol, p.quantity) | currency:'USD' }}</em></a> } @empty { <p class="empty-state">No holdings yet. Explore markets to get started.</p> }
      </section><section class="surface"><div class="section-title small"><div><span class="eyebrow">Activity</span><h2>Recent orders</h2></div></div>
        @if (ordersLoading()) { <p class="empty-state">Loading recent orders...</p> }
        @else if (ordersError()) { <p class="empty-state" role="alert">{{ ordersError() }}</p> }
        @else {
          @for (o of recentOrders(); track o.id) { <div class="order-mini"><span><b>{{ o.type }} {{ o.ticker }}</b><small>{{ o.date }}</small></span><em [class]="'status ' + o.status.toLowerCase()">{{ o.status }}</em></div> } @empty { <p class="empty-state">No orders yet.</p> }
        }
      </section></aside></div>
    </div>`,
})
export default class DashboardPage implements OnInit {
  store = inject(Store)
  private readonly ordersApi = inject(OrdersApiService)
  private readonly tokenStore = inject(TokenStore)
  readonly recentOrders = signal<{
    id: string
    type: string
    ticker: string
    date: string
    status: string
  }[]>([])
  readonly ordersLoading = signal(false)
  readonly ordersError = signal("")
  periods = ["1D", "1W", "1M", "1Y"]
  period = "1M"

  ngOnInit() {
    const clientId = Number(this.tokenStore.currentUser()?.sub)
    if (!Number.isSafeInteger(clientId) || clientId <= 0) {
      this.ordersError.set("Unable to identify the logged-in client.")
      return
    }

    this.ordersLoading.set(true)
    this.ordersApi.getAllClientOrders(clientId).subscribe({
      next: (records) => {
        this.recentOrders.set(
          records.map((record, index) => {
            const date = record.createdAt ?? record.orderDate ?? record.order_date ?? "—"
            const timestamp = Date.parse(date.replace(" ", "T"))
            return {
              id: String(record.orderId ?? record.order_id ?? index),
              type: record.orderType ?? record.order_type ?? "—",
              ticker: record.ticker ?? "—",
              status: record.status ?? record.orderStatus ?? record.order_status ?? "—",
              date,
              timestamp: Number.isNaN(timestamp) ? 0 : timestamp,
            }
          })
            .sort((left, right) => right.timestamp - left.timestamp)
            .slice(0, 5),
        )
        this.ordersLoading.set(false)
      },
      error: () => {
        this.ordersError.set("Unable to load recent orders.")
        this.ordersLoading.set(false)
      },
    })
  }

  displayName(symbol: string, fallback: string) {
    const normalizedSymbol = symbol.replace("/", "-").toLowerCase()
    return (
      this.store.instruments().find(
        (instrument) => instrument.ticker.toLowerCase() === normalizedSymbol,
      )?.displayName || fallback
    )
  }
  positionValue(symbol: string, quantity: number) {
    return this.store.assets.find((a) => a.symbol === symbol)!.price * quantity
  }
}
