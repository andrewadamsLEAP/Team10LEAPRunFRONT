import { Component, inject } from "@angular/core"
import { CurrencyPipe } from "@angular/common"
import { FormsModule } from "@angular/forms"
import { RouterLink } from "@angular/router"
import Store from "../../../core/state/portfolio.store"

@Component({
  selector: "app-market-list-page",
  standalone: true,
  imports: [CurrencyPipe, FormsModule, RouterLink],
  template: `
    <div class="page-wrap"><div class="page-intro"><div><span class="eyebrow">Asset discovery</span><h1>Explore markets</h1><p>Stocks, crypto, and forex. All in USD.</p></div></div>
    <section class="surface"><div class="funds-panel"><label class="fund-input"><input [(ngModel)]="query" aria-label="Search assets" placeholder="Search name or symbol"></label><div class="fund-tabs">@for (k of kinds; track k) { <button [class.active]="kind === k" (click)="kind = k">{{ k }}</button> }</div></div>
      <div class="ticker-table">@for (a of filtered; track a.symbol) { <a class="ticker-row" [routerLink]="['/client/ticker', a.symbol]"><span class="ticker-name"><i>{{ a.symbol[0] }}</i><b>{{ a.symbol }}<small>{{ a.name }}</small></b></span><span>{{ a.kind }}</span><strong>{{ a.price | currency:'USD':'symbol':(a.kind === 'Forex' ? '1.4-4' : '1.2-2') }}</strong><span [class]="a.change >= 0 ? 'positive' : 'negative'">{{ a.change }}%</span><span>{{ a.volume }}</span><span>›</span></a> } @empty { <p class="empty-state">No matching assets.</p> }</div>
    </section></div>`,
})
export default class MarketListPage {
  store = inject(Store)
  query = ""
  kind = "All"
  kinds = ["All", "Stock", "Crypto", "Forex"]
  get filtered() {
    return this.store.assets.filter(
      (a) =>
        (this.kind === "All" || a.kind === this.kind) &&
        `${a.symbol} ${a.name}`
          .toLowerCase()
          .includes(this.query.toLowerCase()),
    )
  }
}
