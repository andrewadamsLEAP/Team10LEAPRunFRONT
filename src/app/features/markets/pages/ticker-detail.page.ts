import { Component, inject } from "@angular/core"
import { CurrencyPipe } from "@angular/common"
import { ActivatedRoute, Router, RouterLink } from "@angular/router"
import { toSignal } from "@angular/core/rxjs-interop"
import Store from "../../../core/state/portfolio.store"
import Chart from "../../../shared/charts/price-chart.component"
import { Side } from "../../../core/models/data"

@Component({
  selector: "app-ticker-detail-page",
  standalone: true,
  imports: [CurrencyPipe, RouterLink, Chart],
  template: `
    @if (asset; as a) {
      <div class="page-wrap"><a class="back-button" routerLink="/client/markets">‹ All markets</a><section class="ticker-hero"><div class="ticker-heading"><i class="large-symbol">{{ a.symbol[0] }}</i><div><span>{{ a.kind }}</span><h1>{{ a.symbol }}</h1><p>{{ a.name }}</p></div></div><div class="ticker-price"><span>Market price · USD</span><strong>{{ a.price | currency:'USD':'symbol':(a.kind === 'Forex' ? '1.4-4' : '1.2-2') }}</strong><em [class]="a.change >= 0 ? 'positive' : 'negative'">{{ a.change }}% today</em></div><div class="trade-actions"><button class="primary-button" (click)="start('Buy')">Buy {{ a.symbol }}</button><button class="secondary-button sell-button" (click)="start('Sell')">Sell {{ a.symbol }}</button></div></section>
        <div class="ticker-layout"><section class="surface chart-surface"><div class="chart-header"><div><span class="eyebrow">Market performance</span><h2>Price chart</h2></div><div class="period-tabs">@for (p of periods; track p) { <button [class.active]="period === p" (click)="period = p">{{ p }}</button> }</div></div><app-chart [period]="period"/></section><section class="surface market-stats"><div class="section-title"><h2>Market statistics</h2></div><dl><div><dt>Open</dt><dd>{{ a.open | currency:'USD':'symbol':'1.2-4' }}</dd></div><div><dt>Previous close</dt><dd>{{ a.previous | currency:'USD':'symbol':'1.2-4' }}</dd></div><div><dt>Day high</dt><dd>{{ a.high | currency:'USD':'symbol':'1.2-4' }}</dd></div><div><dt>Day low</dt><dd>{{ a.low | currency:'USD':'symbol':'1.2-4' }}</dd></div><div><dt>Volume</dt><dd>{{ a.volume }}</dd></div></dl></section></div>
      </div>
    } @else { <p class="empty-state">Asset not found. <a routerLink="/client/markets">Explore markets</a></p> }`,
})
export default class TickerDetailPage {
  store = inject(Store)
  router = inject(Router)
  route = inject(ActivatedRoute)
  params = toSignal(this.route.paramMap)
  periods = ["1D", "1W", "1M", "1Y"]
  period = "1M"
  get symbol() {
    return this.params()?.get("symbol")
  }
  get asset() {
    return this.store.assets.find((a) => a.symbol === this.symbol)
  }
  start(side: Side) {
    void this.router.navigate(["/client/trade", this.symbol], {
      queryParams: { side },
    })
  }
}
