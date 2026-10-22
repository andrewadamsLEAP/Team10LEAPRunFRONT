import { Component, inject, OnInit, signal } from "@angular/core"
import { HttpClient } from "@angular/common/http"
import { RouterLink } from "@angular/router"
import Store from "../../../core/state/portfolio.store"
import { Account } from "../../../core/models/data"
import { BASE_PATH } from "../../../core/api/auth"

type ReporterClientRecord = {
  clientId: number | string
  username: string
  email: string
}

@Component({
  selector: "app-account-directory-page",
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page-wrap"><div class="page-intro"><div><span class="eyebrow">All-client reporting</span><h1>Client accounts</h1><p>Read-only client directory.</p></div></div>
      <section class="surface data-surface"><div class="data-table accounts-table"><div class="data-row data-head"><span>Client ID</span><span>Username</span><span>Email</span></div>
        @if (loading()) { <p class="empty-state" role="status">Loading client accounts…</p> }
        @else if (loadError()) { <p class="empty-state" role="alert">{{ loadError() }}</p> }
        @else { @for (a of store.clients(); track a.id) { <a class="data-row account-client-link" [routerLink]="['/', store.session()?.role, 'clients', a.username, 'transactions']"><strong>{{ a.id }}</strong><span>{{ a.username }}</span><span>{{ a.email || '—' }}</span></a> } @empty { <p class="empty-state">No accounts yet.</p> } }
      </div></section>
    </div>`,
})
export default class AccountDirectoryPage implements OnInit {
  store = inject(Store)
  private http = inject(HttpClient)
  private apiBasePath = inject(BASE_PATH)
  loading = signal(false)
  loadError = signal("")

  ngOnInit() {
    if (this.store.session()?.role !== "reporter") return

    this.loading.set(true)
    this.http
      .get<ReporterClientRecord[]>(`${this.apiBasePath}/v1/employees/reporter`, {
        timeout: 15000,
      })
      .subscribe({
        next: (records) => {
          const accounts: Account[] = records.map((record) => ({
            id: Number(record.clientId),
            username: record.username,
            email: record.email,
            fullName: record.username,
            cash: 0,
          }))
          this.store.clients.set(accounts)
          this.loading.set(false)
        },
        error: (error: { error?: { message?: string }; message?: string }) => {
          this.loadError.set(
            error.error?.message ||
              error.message ||
              "Unable to load client accounts from the backend.",
          )
          this.loading.set(false)
        },
      })
  }
}
