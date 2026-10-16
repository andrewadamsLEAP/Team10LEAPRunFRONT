import { Component, inject } from "@angular/core"
import Store from "../../../core/state/portfolio.store"

@Component({
  selector: "app-account-directory-page",
  standalone: true,
  imports: [],
  template: `
    <div class="page-wrap"><div class="page-intro"><div><span class="eyebrow">All-client reporting</span><h1>Client accounts</h1><p>Read-only client directory.</p></div></div>
      <section class="surface data-surface"><div class="data-table accounts-table"><div class="data-row data-head"><span>Username</span><span>Full name</span><span>Status</span></div>
        @for (a of store.clients(); track a.id) { <div class="data-row"><strong>{{ a.username }}</strong><span>{{ a.fullName || a.username }}</span><span [class]="'status ' + a.status.toLowerCase()">{{ a.status }}</span></div> } @empty { <p class="empty-state">No accounts yet.</p> }
      </div></section>
    </div>`,
})
export default class AccountDirectoryPage {
  store = inject(Store)
}
