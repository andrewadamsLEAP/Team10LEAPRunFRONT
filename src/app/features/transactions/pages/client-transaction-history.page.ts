import { CurrencyPipe, DatePipe, DecimalPipe } from "@angular/common"
import { Component, inject, OnInit, signal } from "@angular/core"
import { HttpClient } from "@angular/common/http"
import { ActivatedRoute, RouterLink } from "@angular/router"
import Store from "../../../core/state/portfolio.store"
import { BASE_PATH } from "../../../core/api/auth"

type ClientOrderRecord = {
  orderId: number | string
  clientId: number | string
  clientUsername: string
  ticker: string
  quantity: number
  price: number
  orderType: string
  status: string
  createdAt: string
}

type ClientTransactionRecord = {
  transactionId: number | string
  clientId: number | string
  clientUsername: string
  type: string
  amount: number
  timestamp: string
}

@Component({
  selector: "app-client-order-history-page",
  standalone: true,
  imports: [CurrencyPipe, DatePipe, DecimalPipe, RouterLink],
  template: `
    <div class="page-wrap client-history-page"><a class="back-button" [routerLink]="['/', role, 'clients']">‹ Client accounts</a>
      @if (account; as client) {
        <div class="page-intro client-history-intro"><div><span class="eyebrow">Client activity</span><h1>{{ client.fullName || client.username }}</h1><p>{{ client.username }} · {{ client.email || 'No email provided' }}</p></div></div>
        @if (isEmployee) {
          <div class="client-history-sections">
            <section class="history-section">
              <header class="history-section-heading"><div><span class="eyebrow">Trading activity</span><h2>Order history</h2></div><span class="history-count">{{ clientOrders().length }} orders</span></header>
              <div class="surface history-table-card">
                @if (ordersLoading()) { <p class="history-state" role="status">Loading orders…</p> }
                @else if (ordersError()) { <p class="history-state error" role="alert">{{ ordersError() }}</p> }
                @else { <div class="history-table-scroll"><div class="data-table history-table history-orders-table"><div class="data-row data-head"><span>Order ID</span><span>Client</span><span>Ticker</span><span>Type</span><span>Status</span><span>Price</span><span>Quantity</span><span>Date &amp; time</span></div>
                  @for (order of clientOrders(); track order.orderId) { <div class="data-row"><strong>{{ order.orderId }}</strong><span>{{ order.clientUsername }}</span><span class="ticker-cell">{{ order.ticker }}</span><span>{{ order.orderType }}</span><span><i [class]="'history-status ' + order.status.toLowerCase()">{{ order.status }}</i></span><span>{{ order.price | currency:'USD':'symbol':'1.2-4' }}</span><span>{{ order.quantity | number:'1.0-6' }}</span><span>{{ order.createdAt | date:'medium' }}</span></div> } @empty { <p class="history-state" role="status">No orders for this client yet.</p> }
                </div></div> }
              </div>
            </section>
            @if (isAdmin) {
              <section class="history-section">
                <header class="history-section-heading"><div><span class="eyebrow">Account activity</span><h2>Transaction history</h2></div><span class="history-count">{{ clientTransactions().length }} transactions</span></header>
                <div class="surface history-table-card">
                  @if (transactionsLoading()) { <p class="history-state" role="status">Loading transactions…</p> }
                  @else if (transactionsError()) { <p class="history-state error" role="alert">{{ transactionsError() }}</p> }
                  @else { <div class="history-table-scroll"><div class="data-table history-table history-transactions-table"><div class="data-row data-head"><span>Transaction ID</span><span>Client</span><span>Type</span><span>Amount</span><span>Date &amp; time</span></div>
                    @for (transaction of clientTransactions(); track transaction.transactionId) { <div class="data-row"><strong>{{ transaction.transactionId }}</strong><span>{{ transaction.clientUsername }}</span><span>{{ transaction.type }}</span><strong [class]="transaction.amount >= 0 ? 'positive' : 'negative'">{{ transaction.amount | currency:'USD' }}</strong><span>{{ transaction.timestamp | date:'medium' }}</span></div> } @empty { <p class="history-state" role="status">No transactions for this client yet.</p> }
                  </div></div> }
                </div>
              </section>
            }
          </div>
        }
      } @else {
        <section class="surface"><p class="empty-state">Client not found. <a [routerLink]="['/', role, 'clients']">Return to client accounts</a></p></section>
      }
    </div>`,
})
export default class ClientTransactionHistoryPage implements OnInit {
  private route = inject(ActivatedRoute)
  private store = inject(Store)
  private http = inject(HttpClient)
  private apiBasePath = inject(BASE_PATH)
  private allClientOrders = signal<ClientOrderRecord[]>([])
  private allClientTransactions = signal<ClientTransactionRecord[]>([])
  ordersLoading = signal(false)
  ordersError = signal("")
  transactionsLoading = signal(false)
  transactionsError = signal("")

  ngOnInit() {
    const account = this.account
    if (!this.isEmployee || !account) return

    this.ordersLoading.set(true)
    this.http
      .get<ClientOrderRecord[]>(
        `${this.apiBasePath}/v1/orders/employee/all/${encodeURIComponent(String(account.id))}`,
        { timeout: 15000 },
      )
      .subscribe({
        next: (orders) => {
          const username = account.username.trim().toLowerCase()
          this.allClientOrders.set(
            orders.filter(
              (order) => order.clientUsername?.trim().toLowerCase() === username,
            ),
          )
          this.ordersLoading.set(false)
        },
        error: (error: { error?: { message?: string }; message?: string }) => {
          this.ordersError.set(
            error.error?.message ||
              error.message ||
              "Unable to load this client's orders.",
          )
          this.ordersLoading.set(false)
        },
      })

    if (this.isAdmin) {
      this.transactionsLoading.set(true)
      this.http
        .get<ClientTransactionRecord[]>(
          `${this.apiBasePath}/v1/trading/admin/transactions/${encodeURIComponent(String(account.id))}`,
          { timeout: 15000 },
        )
        .subscribe({
          next: (transactions) => {
            const username = account.username.trim().toLowerCase()
            this.allClientTransactions.set(
              transactions.filter(
                (transaction) =>
                  transaction.clientUsername?.trim().toLowerCase() === username,
              ),
            )
            this.transactionsLoading.set(false)
          },
          error: (error: { error?: { message?: string }; message?: string }) => {
            this.transactionsError.set(
              error.error?.message ||
                error.message ||
                "Unable to load this client's transactions.",
            )
            this.transactionsLoading.set(false)
          },
        })
    }
  }

  get isEmployee() {
    const currentRole = this.store.session()?.role
    return currentRole === "admin" || currentRole === "reporter"
  }

  get isAdmin() {
    return this.store.session()?.role === "admin"
  }

  get role() {
    return this.store.session()?.role ?? "reporter"
  }

  get account() {
    const username = this.route.snapshot.paramMap.get("username")
    return this.store.clients().find((client) => client.username === username)
  }

  clientOrders() {
    return this.allClientOrders()
  }

  clientTransactions() {
    return this.allClientTransactions()
  }
}
