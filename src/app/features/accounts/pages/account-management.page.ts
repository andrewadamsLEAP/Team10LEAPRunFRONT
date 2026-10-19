import { Component, inject } from "@angular/core"
import { CurrencyPipe } from "@angular/common"
import { FormsModule } from "@angular/forms"
import { ActivatedRoute, RouterLink } from "@angular/router"
import Store from "../../../core/state/portfolio.store"
import { Account } from "../../../core/models/data"

@Component({
  selector: "app-account-management-page",
  standalone: true,
  imports: [CurrencyPipe, FormsModule, RouterLink],
  template: `
    <div class="page-wrap"><div class="page-intro"><div><span class="eyebrow">Account management</span><h1>{{ reporters ? 'Reporter accounts' : 'Client accounts' }}</h1><p>Create, edit, and manage account access.</p></div><button class="primary-button" (click)="create()">Add account</button></div>
      <section class="surface data-surface"><div class="data-table accounts-table admin"><div class="data-row data-head"><span>Username</span><span>Full name</span><span>Email</span><span>Cash</span><span>Actions</span></div>
        @for (a of accounts; track a.id) { <div class="data-row">@if (isReporterAccount(a)) { <strong>{{ a.username }}</strong><span>{{ a.fullName || a.username }}</span> } @else { <a class="account-client-link" [routerLink]="['/admin/clients', a.username, 'transactions']"><strong>{{ a.username }}</strong></a><a class="account-client-link" [routerLink]="['/admin/clients', a.username, 'transactions']">{{ a.fullName || a.username }}</a> }<span>{{ a.email || '—' }}</span><span>{{ a.cash | currency:'USD' }}</span><div class="row-actions"><button (click)="edit(a)">Edit</button><button class="danger" (click)="remove(a)">Delete</button></div></div> } @empty { <p class="empty-state">No accounts yet.</p> }
      </div></section>
    </div>
    @if (draft; as d) {
      <div class="modal-backdrop"><form class="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title" (ngSubmit)="save()"><div class="modal-heading"><div><span class="eyebrow">Account details</span><h2 id="account-title">{{ editing ? 'Edit account' : 'Create account' }}</h2></div><button type="button" aria-label="Close dialog" (click)="draft = null">×</button></div>
        <label><span>Username</span><input name="username" [(ngModel)]="d.username" required [readonly]="editing"></label><label><span>Full name</span><input name="fullName" [(ngModel)]="d.fullName"></label><label><span>Email</span><input name="email" type="email" [(ngModel)]="d.email" required></label>
        @if (error) { <div class="form-error" role="alert">{{ error }}</div> }
        <div class="modal-actions"><button type="button" class="secondary-button" (click)="draft = null">Cancel</button><button class="primary-button">Save account</button></div>
      </form></div>
    }
    @if (deleting; as a) { <div class="modal-backdrop"><section class="account-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title"><h2 id="delete-title">Delete {{ a.username }}?</h2><p>This removes account access. Historical reporting is retained.</p><div class="modal-actions"><button class="secondary-button" (click)="deleting = null">Cancel</button><button class="primary-button" (click)="confirmDelete()">Delete account</button></div></section></div> }
  `,
})
export default class AccountManagementPage {
  store = inject(Store)
  route = inject(ActivatedRoute)
  get reporters() {
    return this.route.snapshot.data["reporters"] === true
  }
  get key(): "clients" | "reporters" {
    return this.reporters ? "reporters" : "clients"
  }
  get accounts() {
    return this.store[this.key]()
  }
  isReporterAccount(account: Account) {
    return this.store.reporters().some((reporter) => reporter.username === account.username)
  }
  draft: Account | null = null
  deleting: Account | null = null
  editing = false
  error = ""
  create() {
    this.editing = false
    this.error = ""
    this.draft = {
      id: Date.now(),
      username: "",
      fullName: "",
      email: "",
      cash: 0,
     // status: "Active",
    }
  }
  edit(a: Account) {
    this.editing = true
    this.error = ""
    this.draft = { ...a }
  }
  remove(a: Account) {
    this.deleting = a
  }
  confirmDelete() {
    if (!this.deleting) return
    this.store[this.key].update((items) =>
      items.filter((a) => a.id !== this.deleting!.id),
    )
    this.deleting = null
  }
  save() {
    try {
      const account = this.draft!
      account.username = account.username.trim().toLowerCase()
      if (!account.username || !account.email.includes("@"))
        throw new Error("Enter a username and valid email.")
      this.store.saveAccount(this.key, { ...account })
      this.draft = null
    } catch (error) {
      this.error = (error as Error).message
    }
  }
}
