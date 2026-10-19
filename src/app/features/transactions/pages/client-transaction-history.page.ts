import { CurrencyPipe } from "@angular/common"
import { Component, inject } from "@angular/core"
import { ActivatedRoute, RouterLink } from "@angular/router"
import Store from "../../../core/state/portfolio.store"

@Component({
  selector: "app-client-transaction-history-page",
  standalone: true,
  imports: [CurrencyPipe, RouterLink],
  template: `
    <div class="page-wrap"><a class="back-button" [routerLink]="['/', role, 'clients']">‹ Client accounts</a>
      @if (account; as client) {
        <div class="page-intro"><div><span class="eyebrow">Client transaction history</span><h1>{{ client.fullName || client.username }}</h1><p>{{ client.username }} · {{ client.email || 'No email provided' }}</p></div></div>
        <section class="surface data-surface"><div class="data-table transaction-table employee-transactions"><div class="data-row data-head"><span>Transaction ID</span><span>Type</span><span>Amount</span><span>Status</span><span>Date &amp; time</span></div>
          @for (transaction of transactions; track transaction.id) { <div class="data-row"><strong>{{ transaction.id }}</strong><span>{{ transaction.type }}</span><strong [class]="transaction.amount >= 0 ? 'positive' : 'negative'">{{ transaction.amount | currency:'USD' }}</strong><span [class]="'status ' + transaction.status.toLowerCase()">{{ transaction.status }}</span><span>{{ transaction.date }}</span></div> } @empty { <p class="empty-state">No transactions for this client yet.</p> }
        </div></section>
      } @else {
        <section class="surface"><p class="empty-state">Client not found. <a [routerLink]="['/', role, 'clients']">Return to client accounts</a></p></section>
      }
    </div>`,
})
export default class ClientTransactionHistoryPage {
  private route = inject(ActivatedRoute)
  private store = inject(Store)

  get role() {
    return this.store.session()?.role ?? "reporter"
  }

  get account() {
    const username = this.route.snapshot.paramMap.get("username")
    return this.store.clients().find((client) => client.username === username)
  }

  get transactions() {
    const username = this.route.snapshot.paramMap.get("username")
    return this.store.transactions().filter((transaction) => transaction.client === username)
  }
}
