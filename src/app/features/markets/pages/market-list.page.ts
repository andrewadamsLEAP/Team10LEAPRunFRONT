import { Component, inject } from "@angular/core"
import { CurrencyPipe } from "@angular/common"
import { FormsModule } from "@angular/forms"
import { RouterLink } from "@angular/router"
import Store from "../../../core/state/portfolio.store"
import { Instrument } from "../../../core/models/data"
import { marketPrice } from "../../../core/models/market-price"

@Component({
  selector: "app-market-list-page",
  standalone: true,
  imports: [CurrencyPipe, FormsModule, RouterLink],
  template: `
    <div class="page-wrap"><div class="page-intro"><div><span class="eyebrow">Asset discovery</span><h1>Explore markets</h1><p>Stocks, crypto, and forex. All in USD.</p></div></div>
    <section class="surface"><div class="funds-panel"><label class="ticker-page-search"><input [(ngModel)]="query" aria-label="Search assets" placeholder="Search name or symbol"><span aria-hidden="true">⌕</span></label><div class="fund-tabs">@for (k of kinds; track k) { <button [class.active]="kind === k" (click)="kind = k">{{ k }}</button> }</div></div>
      @if (store.instrumentLoading()) { <p class="empty-state">Loading instruments...</p> }
      @if (store.instrumentError(); as error) { <p class="empty-state" role="alert">{{ error }} <button type="button" class="secondary-button" [disabled]="store.instrumentLoading()" (click)="store.loadInstruments()">Retry now</button></p> }
      <div class="ticker-table">
        <div class="ticker-row ticker-head" aria-hidden="true"><span>Instrument</span><span>Type</span><span>Price</span><span>Change</span><span>Volume</span><span>Avg Vol (30D)</span><span></span></div>
        @for (a of filtered; track a.ticker) { <a class="ticker-row" [routerLink]="['/client/ticker', a.ticker]"><span class="ticker-name"><i>{{ a.ticker[0] }}</i><b><span>{{ a.ticker }}</span><small>{{ a.displayName || '—' }}</small></b></span><span>{{ displayKind(a.assetType) }}</span><strong>{{ currentPrice(a) | currency:'USD':'symbol':(a.assetType === 'FOREX' ? '1.4-4' : '1.2-2') }}</strong><span [class]="(a.changePercent ?? 0) >= 0 ? 'positive' : 'negative'">{{ formatChange(a.changePercent) }}</span><span>{{ formatVolume(a.volume) }}</span><span>{{ formatVolume(a.averageVolume) }}</span><span>›</span></a> } @empty { @if (!store.instrumentLoading()) { <p class="empty-state">No matching instruments.</p> } }
      </div>
    </section></div>`,
})
export default class MarketListPage {
  store = inject(Store)
  query = ""
  kind = "All"
  kinds = ["All", "Stock", "Crypto", "Forex"]
  constructor() {
    this.store.loadInstruments()
  }
  get filtered() {
    return this.store.instruments().filter(
      (a) =>
        (this.kind === "All" || this.displayKind(a.assetType) === this.kind) &&
        [a.ticker, a.displayName]
            .some((value) =>
              (value ?? "").toLowerCase().includes(this.query.trim().toLowerCase()),
            ),
    )
  }
  displayKind(assetType: "STOCK" | "CRYPTO" | "FOREX") {
    return assetType[0] + assetType.slice(1).toLowerCase()
  }
  currentPrice(instrument: Instrument) {
    return marketPrice(instrument)
  }
  formatChange(change: number | null) {
    if (change === null) return "—"
    return `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`
  }
  formatVolume(volume: number | null) {
    if (volume === null || !Number.isFinite(volume)) return "—"
    if (Math.abs(volume) >= 1_000_000_000) return `${(volume / 1_000_000_000).toFixed(3)}B`
    if (Math.abs(volume) >= 1_000_000) return `${(volume / 1_000_000).toFixed(3)}M`
    if (Math.abs(volume) >= 1_000) return `${(volume / 1_000).toFixed(3)}K`
    return volume.toLocaleString("en-US")
  }
}
