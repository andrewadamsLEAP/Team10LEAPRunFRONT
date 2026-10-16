import { Component, inject } from "@angular/core"
import { CurrencyPipe } from "@angular/common"
import { FormsModule } from "@angular/forms"
import Store from "../../../core/state/portfolio.store"

@Component({
  selector: "app-transactions-page",
  standalone: true,
  imports: [CurrencyPipe, FormsModule],
  template: `
    <div class="page-wrap"><div class="page-intro"><div><span class="eyebrow">{{ client ? 'Your account' : 'All-client reporting' }}</span><h1>Transactions</h1><p>{{ client ? 'Manage your portfolio activity in USD.' : 'Review activity across client accounts.' }}</p></div>@if (client) { <div class="cash-badge"><span>Buying power</span><strong>{{ store.cash | currency:'USD' }}</strong></div> }</div>
      <section class="surface data-surface">
        @if (client) {
          <form class="funds-panel" (ngSubmit)="funds()"><div class="fund-tabs"><button type="button" [class.active]="fundType === 'Deposit'" (click)="fundType = 'Deposit'">Deposit</button><button type="button" [class.active]="fundType === 'Withdrawal'" (click)="fundType = 'Withdrawal'">Withdraw</button></div><label class="fund-input">$<input name="amount" type="number" min="0.01" step="0.01" [(ngModel)]="amount" aria-label="Amount in USD" required><button class="primary-button">{{ fundType }}</button></label></form>
          @if (message) { <p class="empty-state" role="status">{{ message }}</p> }
        }
        <div class="data-table transaction-table" [class.employee-transactions]="!client"><div class="data-row data-head"><span>Transaction ID</span>@if (!client) { <span>Client</span> }<span>Type</span><span>Amount</span>@if (client) { <span>Status</span> }<span>Date &amp; time</span></div>
          @for (t of transactions; track t.id) { <div class="data-row"><strong>{{ t.id }}</strong>@if (!client) { <span>{{ t.client }}</span> }<span>{{ t.type }}</span><strong [class]="t.amount >= 0 ? 'positive' : 'negative'">{{ t.amount | currency:'USD' }}</strong>@if (client) { <span [class]="'status ' + t.status.toLowerCase()">{{ t.status }}</span> }<span>{{ t.date }}</span></div> } @empty { <p class="empty-state">No transactions yet.</p> }
        </div>
      </section>
    </div>`,
})
export default class TransactionsPage {
  store = inject(Store)
  get client() {
    return this.store.session()?.role === "client"
  }
  get transactions() {
    return this.client ? this.store.clientTransactions : this.store.transactions()
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
}
