import { Component, inject } from "@angular/core"
import { CurrencyPipe, DecimalPipe } from "@angular/common"
import { FormsModule } from "@angular/forms"
import { ActivatedRoute, RouterLink } from "@angular/router"
import Store from "./store"

@Component({
  selector: "app-activity",
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, FormsModule, RouterLink],
  template: `
    <div class="page-wrap"><div class="page-intro"><div><span class="eyebrow">{{ client ? 'Your account' : 'All-client reporting' }}</span><h1>{{ page === 'holdings' ? 'Your holdings' : page === 'orders' ? 'Orders' : 'Transactions' }}</h1><p>{{ client ? 'Manage your portfolio activity in USD.' : 'Review activity across client accounts.' }}</p></div>@if (client) { <div class="cash-badge"><span>Buying power</span><strong>{{ store.cash | currency:'USD' }}</strong></div> }</div>
      <section class="surface data-surface">
      @if (page === 'transactions' && client) {
        <form class="funds-panel" (ngSubmit)="funds()"><div class="fund-tabs"><button type="button" [class.active]="fundType === 'Deposit'" (click)="fundType = 'Deposit'">Deposit</button><button type="button" [class.active]="fundType === 'Withdrawal'" (click)="fundType = 'Withdrawal'">Withdraw</button></div><label class="fund-input">$<input name="amount" type="number" min="0.01" step="0.01" [(ngModel)]="amount" aria-label="Amount in USD" required><button class="primary-button">{{ fundType }}</button></label></form>
        @if (message) { <p class="empty-state" role="status">{{ message }}</p> }
      }
      @if (page === 'orders') {
        <div class="data-table order-table" [class.with-client]="!client"><div class="data-row data-head"><span>Order ID</span>@if (!client) { <span>Client</span> }<span>Asset</span><span>Side</span><span>Status</span><span>Price</span><span>Quantity</span><span>Date &amp; time</span></div>
          @for (o of orders; track o.id) { <div class="data-row"><strong>{{ o.id }}</strong>@if (!client) { <span>{{ o.client }}</span> }<a [routerLink]="client ? ['/client/ticker', o.ticker] : null">{{ o.ticker }}</a><span [class]="'side-tag ' + o.type.toLowerCase()">{{ o.type }}</span><span [class]="'status ' + o.status.toLowerCase()">{{ o.status }}</span><span>{{ o.price | currency:'USD':'symbol':'1.2-4' }}</span><span>{{ o.quantity | number:'1.0-6' }}</span><span>{{ o.date }}</span></div> } @empty { <p class="empty-state">No orders yet.</p> }
        </div>
      } @else if (page === 'transactions') {
        <div class="data-table transaction-table" [class.employee-transactions]="!client"><div class="data-row data-head"><span>Transaction ID</span>@if (!client) { <span>Client</span> }<span>Type</span><span>Amount</span>@if (client) { <span>Status</span> }<span>Date &amp; time</span></div>
          @for (t of transactions; track t.id) { <div class="data-row"><strong>{{ t.id }}</strong>@if (!client) { <span>{{ t.client }}</span> }<span>{{ t.type }}</span><strong [class]="t.amount >= 0 ? 'positive' : 'negative'">{{ t.amount | currency:'USD' }}</strong>@if (client) { <span [class]="'status ' + t.status.toLowerCase()">{{ t.status }}</span> }<span>{{ t.date }}</span></div> } @empty { <p class="empty-state">No transactions yet.</p> }
        </div>
      } @else {
        <div class="data-table holdings-table"><div class="data-row data-head"><span>Asset</span><span>Quantity</span><span>Average price</span><span>Market value</span><span>Return</span><span>Allocation</span></div>
          @for (p of store.holdings; track p.symbol) { <a class="data-row" [routerLink]="['/client/ticker', p.symbol]"><strong>{{ p.symbol }}</strong><span>{{ p.quantity | number:'1.0-6' }}</span><span>{{ p.average | currency:'USD':'symbol':'1.2-4' }}</span><strong>{{ value(p.symbol, p.quantity) | currency:'USD' }}</strong><span [class]="value(p.symbol,p.quantity) >= p.average * p.quantity ? 'positive' : 'negative'">{{ value(p.symbol,p.quantity) - p.average * p.quantity | currency:'USD' }}</span><span>{{ value(p.symbol,p.quantity) / store.invested * 100 | number:'1.1-1' }}%</span></a> } @empty { <p class="empty-state">You don't have any holdings yet. <a routerLink="/client/markets">Explore markets</a></p> }
        </div>
      }
      </section>
    </div>`,
})
export default class Activity {
  store = inject(Store)
  route = inject(ActivatedRoute)
  get page() {
    return this.route.snapshot.data["page"] as string
  }
  get client() {
    return this.store.session()?.role === "client"
  }
  get orders() {
    return this.client ? this.store.clientOrders : this.store.orders()
  }
  get transactions() {
    return this.client
      ? this.store.clientTransactions
      : this.store.transactions()
  }
  fundType: "Deposit" | "Withdrawal" = "Deposit"
  amount = 0
  message = ""
  funds() {
    try {
      this.store.funds(this.fundType, this.amount)
      this.message = `${this.fundType} completed successfully.`
      this.amount = 0
    } catch (error) {
      this.message = (error as Error).message
    }
  }
  value(symbol: string, quantity: number) {
    return this.store.assets.find((a) => a.symbol === symbol)!.price * quantity
  }
}
