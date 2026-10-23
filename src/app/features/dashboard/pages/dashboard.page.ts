import { Component, computed, inject } from "@angular/core"
import { CurrencyPipe, DecimalPipe } from "@angular/common"
import { RouterLink } from "@angular/router"
import Store from "../../../core/state/portfolio.store"
import Chart from "../../../shared/charts/price-chart.component"
import { Instrument } from "../../../core/models/data"

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
      <div class="content-grid"><section class="surface"><div class="section-title"><div><span class="eyebrow">Top 10 by daily % change</span><h2>Trending tickers</h2></div><a routerLink="/client/markets">Explore markets</a></div>
        @if (store.instrumentLoading()) { <p class="empty-state" role="status">Loading trending tickers...</p> }
        @else if (store.instrumentError(); as error) { <p class="empty-state" role="alert">{{ error }} <button class="secondary-button" (click)="store.loadInstruments()">Retry</button></p> }
        @else {
        <div class="ticker-table"><div class="ticker-row ticker-head"><span>Asset</span><span>Market</span><span>Price</span><span>Today</span><span>Volume</span><span></span></div>
          @for (a of trending(); track a.ticker) { <a class="ticker-row" [routerLink]="['/client/ticker', a.ticker]"><span class="ticker-name"><i>{{ a.ticker[0] }}</i><b>{{ a.ticker }}<small>{{ a.displayName || '—' }}</small></b></span><span>{{ a.assetType === 'STOCK' ? 'Stock' : a.assetType === 'CRYPTO' ? 'Crypto' : 'Forex' }}</span><strong>{{ currentPrice(a) | currency:'USD':'symbol':(a.assetType === 'FOREX' ? '1.4-4' : '1.2-2') }}</strong><span [class]="a.changePercent! >= 0 ? 'positive' : 'negative'">{{ a.changePercent! > 0 ? '+' : '' }}{{ a.changePercent | number:'1.2-2' }}%</span><span>{{ a.volume == null ? '—' : (a.volume | number:'1.0-0') }}</span><span>›</span></a> } @empty { <p class="empty-state">No daily price changes available yet.</p> }
        </div>
        }
      </section><aside class="home-sidebar"><section class="surface"><div class="section-title small"><div><span class="eyebrow">Portfolio</span><h2>Top holdings</h2></div><a routerLink="/client/holdings">View all</a></div>
        @for (p of store.holdings.slice(0,3); track p.symbol) { <a class="mini-list-row" [routerLink]="['/client/ticker', p.symbol]"><i>{{ p.symbol[0] }}</i><span><b>{{ p.symbol }}</b><small>{{ p.quantity | number:'1.0-6' }} units</small></span><em>{{ positionValue(p.symbol, p.quantity) | currency:'USD' }}</em></a> } @empty { <p class="empty-state">No holdings yet. Explore markets to get started.</p> }
      </section><section class="surface"><div class="section-title small"><div><span class="eyebrow">Activity</span><h2>Recent orders</h2></div></div>
        @for (o of store.clientOrders.slice(0,3); track o.id) { <div class="order-mini"><span><b>{{ o.type }} {{ o.ticker }}</b><small>{{ o.date }}</small></span><em [class]="'status ' + o.status.toLowerCase()">{{ o.status }}</em></div> } @empty { <p class="empty-state">No orders yet.</p> }
      </section></aside></div>
    </div>`,
})
export default class DashboardPage {
  store = inject(Store)
  periods = ["1D", "1W", "1M", "1Y"]
  period = "1M"
  readonly trending = computed(() => this.store.instruments()
    .filter((instrument): instrument is Instrument & { changePercent: number } =>
      instrument.changePercent !== null && Number.isFinite(instrument.changePercent))
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent) || a.ticker.localeCompare(b.ticker))
    .slice(0, 10))
  constructor() {
    if (!this.store.instrumentLoading()) this.store.loadInstruments()
  }
  currentPrice(instrument: Instrument) {
    if (instrument.bidPrice !== null && instrument.askPrice !== null) {
      return (instrument.bidPrice + instrument.askPrice) / 2
    }
    return instrument.bidPrice ?? instrument.askPrice
  }
  positionValue(symbol: string, quantity: number) {
    return this.store.assets.find((a) => a.symbol === symbol)!.price * quantity
  }
}
