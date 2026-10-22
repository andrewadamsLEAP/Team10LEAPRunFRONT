import { Component, inject } from "@angular/core"
import { CurrencyPipe, DecimalPipe } from "@angular/common"
import { ActivatedRoute, Router, RouterLink } from "@angular/router"
import { DestroyRef } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { toSignal } from "@angular/core/rxjs-interop"
import Store from "../../../core/state/portfolio.store"
import Chart from "../../../shared/charts/price-chart.component"
import { Instrument, Side } from "../../../core/models/data"

@Component({
  selector: "app-ticker-detail-page",
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, RouterLink, Chart],
  template: `
    @if (store.instrumentLoading()) { <p class="empty-state">Loading instrument...</p> } @else if (store.instrumentError(); as error) { <p class="empty-state">{{ error }}</p> } @else if (instrument; as a) {
      <div class="page-wrap"><a class="back-button" routerLink="/client/markets">‹ All markets</a><section class="ticker-hero"><div class="ticker-heading"><i class="large-symbol">{{ a.ticker[0] }}</i><div><span>{{ displayKind(a.assetType) }}</span><h1>{{ a.ticker }}</h1><p>{{ a.displayName || '—' }}</p></div></div><div class="ticker-price"><span>Market price · USD</span><strong>{{ currentPrice(a) | currency:'USD':'symbol':(a.assetType === 'FOREX' ? '1.4-4' : '1.2-2') }}</strong><em [class]="(a.changePercent ?? 0) >= 0 ? 'positive' : 'negative'">{{ a.changePercent == null ? '—' : (a.changePercent | number:'1.2-2') }}% today</em></div><div class="trade-actions"><button class="primary-button" (click)="start('Buy')">Buy {{ a.ticker }}</button><button class="secondary-button sell-button" (click)="start('Sell')">Sell {{ a.ticker }}</button></div></section>
        <div class="ticker-layout"><section class="surface chart-surface"><div class="chart-header"><div><span class="eyebrow">Market performance</span><h2>Price chart</h2></div><div class="period-tabs">@for (p of periods; track p) { <button [class.active]="period === p" (click)="period = p">{{ p }}</button> }</div></div><app-chart [period]="period"/></section><section class="surface market-stats"><div class="section-title"><h2>Market statistics</h2></div><dl><div><dt>Open</dt><dd>{{ a.open | number:'1.2-4' }}</dd></div><div><dt>Previous close</dt><dd>{{ a.previousClose | number:'1.2-4' }}</dd></div><div><dt>Volume</dt><dd>{{ a.volume | number:'1.0-0' }}</dd></div><div><dt>Average volume</dt><dd>{{ a.averageVolume | number:'1.0-0' }}</dd></div><div><dt>Bid</dt><dd>{{ a.bidPrice ?? '—' }}</dd></div><div><dt>Ask</dt><dd>{{ a.askPrice ?? '—' }}</dd></div></dl></section></div>
      </div>
    } @else { <p class="empty-state">Instrument not found. <a routerLink="/client/markets">Explore markets</a></p> }`,
})
export default class TickerDetailPage {
  store = inject(Store)
  router = inject(Router)
  route = inject(ActivatedRoute)
  destroyRef = inject(DestroyRef)
  params = toSignal(this.route.paramMap)
  periods = ["1D", "1W", "1M", "1Y"]
  period = "1M"
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const ticker = params.get("symbol")
      if (ticker) this.store.loadInstrument(ticker)
    })
  }
  get symbol() {
    return this.params()?.get("symbol")
  }
  get instrument() {
    return this.store.selectedInstrument()
  }
  displayKind(assetType: Instrument["assetType"]) {
    return assetType[0] + assetType.slice(1).toLowerCase()
  }
  currentPrice(instrument: Instrument) {
    return instrument.bidPrice ?? instrument.askPrice
  }
  start(side: Side) {
    void this.router.navigate(["/client/trade", this.symbol], {
      queryParams: { side },
    })
  }
}
