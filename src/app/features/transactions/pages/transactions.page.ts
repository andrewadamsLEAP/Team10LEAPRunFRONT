import { Component, inject, OnInit, signal } from "@angular/core"
import { CurrencyPipe, DatePipe } from "@angular/common"
import { HttpClient } from "@angular/common/http"
import { FormsModule } from "@angular/forms"
import Store from "../../../core/state/portfolio.store"
import { BASE_PATH } from "../../../core/api/auth"

type AdminTransactionRecord = {
  transactionId?: number | string | null
  transaction_id?: number | string | null
  clientId?: number | string | null
  client_id?: number | string | null
  type: string
  amount: number
  timestamp: string
}

type TransactionRow = {
  id: string
  client: string
  type: string
  amount: number
  date: string
  status?: string
}

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
          @if (employee && loading()) { <p class="empty-state" role="status">Loading transactions…</p> }
          @else if (employee && loadError()) { <p class="empty-state" role="alert">{{ loadError() }}</p> }
          @else { @for (t of transactions; track t.id) { <div class="data-row"><strong>{{ t.id }}</strong>@if (!client) { <span>{{ t.client }}</span> }<span>{{ t.type }}</span><strong [class]="t.amount >= 0 ? 'positive' : 'negative'">{{ t.amount | currency:'USD' }}</strong>@if (client) { <span [class]="'status ' + (t.status || '').toLowerCase()">{{ t.status }}</span> }<span>{{ admin ? formatTimestamp(t.date) : t.date }}</span></div> } @empty { <p class="empty-state">No transactions yet.</p> } }
        </div>
      </section>
    </div>`,
})
export default class TransactionsPage implements OnInit {
  store = inject(Store)
  private http = inject(HttpClient)
  private apiBasePath = inject(BASE_PATH)
  private adminTransactions = signal<TransactionRow[]>([])
  loading = signal(false)
  loadError = signal("")

  ngOnInit() {
    if (!this.employee) return

    this.loading.set(true)
    this.http
      .get<AdminTransactionRecord[]>(
        `${this.apiBasePath}/v1/trading/employee/transactions`,
        { timeout: 15000 },
      )
      .subscribe({
        next: (records) => {
          this.adminTransactions.set(records.map((record) => ({
            id: String(record.transactionId ?? record.transaction_id ?? "—"),
            client: String(record.clientId ?? record.client_id ?? "—"),
            type: record.type,
            amount: Number(record.amount),
            date: record.timestamp,
          })))
          this.loading.set(false)
        },
        error: (error: { error?: { message?: string }; message?: string }) => {
          this.loadError.set(
            error.error?.message ||
              error.message ||
              "Unable to load transactions from the backend.",
          )
          this.loading.set(false)
        },
      })
  }

  get client() {
    return this.store.session()?.role === "client"
  }
  get admin() {
    return this.store.session()?.role === "admin"
  }
  get employee() {
    const role = this.store.session()?.role
    return role === "admin" || role === "reporter"
  }
  get transactions() {
    if (this.employee) return this.adminTransactions()
    return this.client ? this.store.clientTransactions : this.store.transactions()
  }

  formatTimestamp(value: string) {
    return new DatePipe("en-US").transform(value, "medium") ?? value
  }
  fundType: "Deposit" | "Withdrawal" = "Deposit"
  amount = 0
  message = ""
  funds() {
    try {
      this.store.funds(this.fundType, this.amount).subscribe({
        next: () => {
          this.message = `${this.fundType} completed successfully.`
          this.amount = 0
        },
        error: (error: { error?: { detail?: string; message?: string }; message?: string }) => {
          this.message =
            error.error?.detail ||
            error.error?.message ||
            error.message ||
            `${this.fundType} failed.`
        },
      })
    } catch (error) {
      this.message = (error as Error).message
    }
  }
}
