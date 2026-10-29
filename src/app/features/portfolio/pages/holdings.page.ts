import { Component, inject } from "@angular/core"
import { CurrencyPipe, DecimalPipe } from "@angular/common"
import { RouterLink } from "@angular/router"
import Store, { Position } from "../../../core/state/portfolio.store"
import { TableSort, SortColumn } from "../../../shared/sorting/table-sort"

@Component({
  selector: "app-holdings-page",
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, RouterLink, TableSort, SortColumn],
  template: `
    <div class="page-wrap"><div class="page-intro"><div><span class="eyebrow">Your account</span><h1>Your holdings</h1><p>Manage your portfolio activity in USD.</p></div><div class="cash-badge"><span>Buying power</span><strong>{{ store.cash | currency:'USD' }}</strong></div></div>
      <section class="surface data-surface"><div class="data-table holdings-table" appSortTable #sort="appSortTable"><div class="data-row data-head"><span appSortColumn="symbol" sortLabel="Asset">Asset</span><span appSortColumn="quantity" sortLabel="Quantity">Quantity</span><span appSortColumn="average" sortLabel="Average price">Average price</span><span appSortColumn="value" sortLabel="Market value">Market value</span><span appSortColumn="return" sortLabel="Return">Return</span><span appSortColumn="allocation" sortLabel="Allocation">Allocation</span></div>
        @for (p of sort.rows(store.holdings, sortValues); track p.symbol) {
          @let marketValue = value(p.symbol, p.quantity);
          @let totalInvested = store.invested;
          <a class="data-row" [routerLink]="['/client/ticker', p.symbol]"><strong>{{ p.symbol }}</strong><span>{{ p.quantity | number:'1.0-6' }}</span><span>{{ p.average | currency:'USD':'symbol':'1.2-4' }}</span><strong [class.price-flash]="store.priceChanged(p.symbol)">{{ marketValue === null ? '—' : (marketValue | currency:'USD') }}</strong><span [class]="marketValue !== null && marketValue >= p.average * p.quantity ? 'positive' : 'negative'">{{ marketValue === null ? '—' : (marketValue - p.average * p.quantity | currency:'USD') }}</span><span>{{ marketValue !== null && totalInvested !== null && totalInvested > 0 ? ((marketValue / totalInvested * 100 | number:'1.1-1') + '%') : '—' }}</span></a>
        } @empty { <p class="empty-state">You don't have any holdings yet. <a routerLink="/client/markets">Explore markets</a></p> }
      </div></section>
    </div>`,
})
export default class HoldingsPage {
  store = inject(Store)
  readonly sortValues = {
    value: (position: Position) => this.value(position.symbol, position.quantity),
    return: (position: Position) => {
      const value = this.value(position.symbol, position.quantity)
      return value === null ? null : value - position.average * position.quantity
    },
    allocation: (position: Position) => {
      const value = this.value(position.symbol, position.quantity)
      const total = this.store.invested
      return value !== null && total !== null && total > 0 ? value / total : null
    },
  }
  value(symbol: string, quantity: number) {
    return this.store.holdingValue(symbol, quantity)
  }
}
