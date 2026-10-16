import { Component, inject } from "@angular/core"
import { CurrencyPipe, DecimalPipe } from "@angular/common"
import { RouterLink } from "@angular/router"
import Store from "../../../core/state/portfolio.store"

@Component({
  selector: "app-holdings-page",
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, RouterLink],
  template: `
    <div class="page-wrap"><div class="page-intro"><div><span class="eyebrow">Your account</span><h1>Your holdings</h1><p>Manage your portfolio activity in USD.</p></div><div class="cash-badge"><span>Buying power</span><strong>{{ store.cash | currency:'USD' }}</strong></div></div>
      <section class="surface data-surface"><div class="data-table holdings-table"><div class="data-row data-head"><span>Asset</span><span>Quantity</span><span>Average price</span><span>Market value</span><span>Return</span><span>Allocation</span></div>
        @for (p of store.holdings; track p.symbol) { <a class="data-row" [routerLink]="['/client/ticker', p.symbol]"><strong>{{ p.symbol }}</strong><span>{{ p.quantity | number:'1.0-6' }}</span><span>{{ p.average | currency:'USD':'symbol':'1.2-4' }}</span><strong>{{ value(p.symbol, p.quantity) | currency:'USD' }}</strong><span [class]="value(p.symbol,p.quantity) >= p.average * p.quantity ? 'positive' : 'negative'">{{ value(p.symbol,p.quantity) - p.average * p.quantity | currency:'USD' }}</span><span>{{ value(p.symbol,p.quantity) / store.invested * 100 | number:'1.1-1' }}%</span></a> } @empty { <p class="empty-state">You don't have any holdings yet. <a routerLink="/client/markets">Explore markets</a></p> }
      </div></section>
    </div>`,
})
export default class HoldingsPage {
  store = inject(Store)
  value(symbol: string, quantity: number) {
    return this.store.assets.find((a) => a.symbol === symbol)!.price * quantity
  }
}
