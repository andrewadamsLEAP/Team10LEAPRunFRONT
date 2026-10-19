import { Component, inject } from "@angular/core"
import { RouterLink } from "@angular/router"
import Store from "../../../core/state/portfolio.store"

@Component({
  selector: "app-account-directory-page",
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page-wrap"><div class="page-intro"><div><span class="eyebrow">All-client reporting</span><h1>Client accounts</h1><p>Read-only client directory.</p></div></div>
      <section class="surface data-surface"><div class="data-table accounts-table"><div class="data-row data-head"><span>Username</span><span>Full name</span><span>Email</span></div>
        @for (a of store.clients(); track a.id) { <a class="data-row account-client-link" [routerLink]="['/', store.session()?.role, 'clients', a.username, 'transactions']"><strong>{{ a.username }}</strong><span>{{ a.fullName || a.username }}</span><span>{{ a.email || '—' }}</span></a> } @empty { <p class="empty-state">No accounts yet.</p> }
      </div></section>
    </div>`,
})
export default class AccountDirectoryPage {
  store = inject(Store)
}
