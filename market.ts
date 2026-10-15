import { Component, inject } from "@angular/core"
import { CurrencyPipe } from "@angular/common"
import { FormsModule } from "@angular/forms"
import { ActivatedRoute, Router, RouterLink } from "@angular/router"
import { toSignal } from "@angular/core/rxjs-interop"
import Store from "./store"
import { Side } from "./data"
import Chart from "./chart"

@Component({
  selector: "app-market",
  standalone: true,
  imports: [CurrencyPipe, FormsModule, RouterLink, Chart],
  template: `
    @if (!symbol) {
      <div class="page-wrap"><div class="page-intro"><div><span class="eyebrow">Asset discovery</span><h1>Explore markets</h1><p>Stocks, crypto, and forex. All in USD.</p></div></div>
        <section class="surface"><div class="funds-panel"><label class="fund-input"><input [(ngModel)]="query" aria-label="Search assets" placeholder="Search name or symbol"></label><div class="fund-tabs">@for (k of kinds; track k) { <button [class.active]="kind === k" (click)="kind = k">{{ k }}</button> }</div></div>
        <div class="ticker-table">@for (a of filtered; track a.symbol) { <a class="ticker-row" [routerLink]="['/client/ticker', a.symbol]"><span class="ticker-name"><i>{{ a.symbol[0] }}</i><b>{{ a.symbol }}<small>{{ a.name }}</small></b></span><span>{{ a.kind }}</span><strong>{{ a.price | currency:'USD':'symbol':(a.kind === 'Forex' ? '1.4-4' : '1.2-2') }}</strong><span [class]="a.change >= 0 ? 'positive' : 'negative'">{{ a.change }}%</span><span>{{ a.volume }}</span><span>›</span></a> } @empty { <p class="empty-state">No matching assets.</p> }</div></section>
      </div>
    } @else if (asset; as a) {
      @if (!trading) {
        <div class="page-wrap"><a class="back-button" routerLink="/client/markets">‹ All markets</a><section class="ticker-hero"><div class="ticker-heading"><i class="large-symbol">{{ a.symbol[0] }}</i><div><span>{{ a.kind }}</span><h1>{{ a.symbol }}</h1><p>{{ a.name }}</p></div></div><div class="ticker-price"><span>Market price · USD</span><strong>{{ a.price | currency:'USD':'symbol':(a.kind === 'Forex' ? '1.4-4' : '1.2-2') }}</strong><em [class]="a.change >= 0 ? 'positive' : 'negative'">{{ a.change }}% today</em></div><div class="trade-actions"><button class="primary-button" (click)="start('Buy')">Buy {{ a.symbol }}</button><button class="secondary-button sell-button" (click)="start('Sell')">Sell {{ a.symbol }}</button></div></section>
          <div class="ticker-layout"><section class="surface chart-surface"><div class="chart-header"><div><span class="eyebrow">Market performance</span><h2>Price chart</h2></div><div class="period-tabs">@for (p of periods; track p) { <button [class.active]="period === p" (click)="period = p">{{ p }}</button> }</div></div><app-chart [period]="period"/></section><section class="surface market-stats"><div class="section-title"><h2>Market statistics</h2></div><dl><div><dt>Open</dt><dd>{{ a.open | currency:'USD':'symbol':'1.2-4' }}</dd></div><div><dt>Previous close</dt><dd>{{ a.previous | currency:'USD':'symbol':'1.2-4' }}</dd></div><div><dt>Day high</dt><dd>{{ a.high | currency:'USD':'symbol':'1.2-4' }}</dd></div><div><dt>Day low</dt><dd>{{ a.low | currency:'USD':'symbol':'1.2-4' }}</dd></div><div><dt>Volume</dt><dd>{{ a.volume }}</dd></div></dl></section></div>
        </div>
      } @else {
        <div class="narrow-page"><button class="back-button" (click)="back()">‹ Back</button><section class="surface trade-card"><div class="trade-card-title"><i class="large-symbol">{{ a.symbol[0] }}</i><div><span>{{ review ? 'Review order' : 'Place an order' }}</span><h1>{{ a.symbol }}</h1><p>{{ a.name }}</p></div></div>
          @if (!review) { <div class="side-switch"><button [class.active]="side === 'Buy'" class="buy" (click)="side = 'Buy'">Buy</button><button [class.active]="side === 'Sell'" class="sell" (click)="side = 'Sell'">Sell</button></div> }
          <label class="form-field"><span>Order type</span><div class="quantity-input static-field">Market</div></label>
          <label class="form-field"><span>Quantity</span><div class="quantity-input"><input type="number" min="0" [step]="a.kind === 'Stock' ? 1 : 0.000001" [(ngModel)]="quantity" [readonly]="review" aria-label="Order quantity"></div></label>
          <div class="order-details"><div><span>Side</span><strong>{{ side }}</strong></div><div><span>Market price</span><strong>{{ a.price | currency:'USD':'symbol':'1.2-4' }}</strong></div><div><span>Commission</span><strong>{{ 0 | currency:'USD' }}</strong></div><div><span>Buying power</span><strong>{{ store.cash | currency:'USD' }}</strong></div><div><span>Estimated total</span><strong>{{ quantity * a.price | currency:'USD' }}</strong></div></div>
          @if (error) { <div class="form-error" role="alert">{{ error }}</div> }
          <button class="primary-button full-button" (click)="review ? confirm() : check()">{{ review ? 'Confirm ' + side.toLowerCase() : 'Review order' }}</button>
        </section></div>
      }
    } @else { <p class="empty-state">Asset not found. <a routerLink="/client/markets">Explore markets</a></p> }`,
})
export default class Market {
  store = inject(Store)
  router = inject(Router)
  route = inject(ActivatedRoute)
  params = toSignal(this.route.paramMap)
  get symbol() {
    return this.params()?.get("symbol")
  }
  get asset() {
    return this.store.assets.find((a) => a.symbol === this.symbol)
  }
  get trading() {
    return this.route.snapshot.data["trade"] === true
  }
  query = ""
  kind = "All"
  kinds = ["All", "Stock", "Crypto", "Forex"]
  periods = ["1D", "1W", "1M", "1Y"]
  period = "1M"
  side: Side =
    this.route.snapshot.queryParamMap.get("side") === "Sell" ? "Sell" : "Buy"
  quantity = 1
  review = false
  error = ""
  get filtered() {
    return this.store.assets.filter(
      (a) =>
        (this.kind === "All" || a.kind === this.kind) &&
        `${a.symbol} ${a.name}`
          .toLowerCase()
          .includes(this.query.toLowerCase()),
    )
  }
  start(side: Side) {
    void this.router.navigate(["/client/trade", this.symbol], {
      queryParams: { side },
    })
  }
  back() {
    if (this.review) this.review = false
    else void this.router.navigate(["/client/ticker", this.symbol])
  }
  check() {
    this.error = ""
    if (
      !Number.isFinite(this.quantity) ||
      this.quantity <= 0 ||
      (this.asset?.kind === "Stock" && !Number.isInteger(this.quantity))
    )
      this.error = "Enter a valid quantity. Stocks require whole shares."
    else if (
      this.side === "Buy" &&
      this.quantity * this.asset!.price > this.store.cash
    )
      this.error = "Insufficient buying power."
    else if (
      this.side === "Sell" &&
      this.quantity >
        (this.store.holdings.find((p) => p.symbol === this.symbol)?.quantity ??
          0)
    )
      this.error = "Insufficient holdings."
    else this.review = true
  }
  confirm() {
    try {
      this.store.trade(this.symbol!, this.side, this.quantity)
      void this.router.navigate(["/client/orders"])
    } catch (error) {
      this.error = (error as Error).message
    }
  }
}
