import { Component, inject, OnInit, signal } from "@angular/core"
import { CurrencyPipe } from "@angular/common"
import { HttpClient } from "@angular/common/http"
import { FormsModule } from "@angular/forms"
import { ActivatedRoute, RouterLink } from "@angular/router"
import Store from "../../../core/state/portfolio.store"
import { Account } from "../../../core/models/data"
import { BASE_PATH } from "../../../core/api/auth"

type ReporterApiRecord = {
  employeeId?: number | string
  username?: string
  email?: string
  firstName?: string
  lastName?: string
  role?: string
}

type ReporterApiResponse =
  | ReporterApiRecord[]
  | {
      data?: ReporterApiRecord[]
      reporters?: ReporterApiRecord[]
      content?: ReporterApiRecord[]
    }

@Component({
  selector: "app-account-management-page",
  standalone: true,
  imports: [CurrencyPipe, FormsModule, RouterLink],
  template: `
    <div class="page-wrap"><div class="page-intro"><div><span class="eyebrow">Account management</span><h1>{{ reporters ? 'Reporter accounts' : 'Client accounts' }}</h1><p>{{ reporters ? 'Reporter account directory.' : 'Create, edit, and manage account access.' }}</p></div>@if (!reporters) { <button class="primary-button" (click)="create()">Add account</button> }</div>
      <section class="surface data-surface"><div class="data-table accounts-table admin" [class.reporter-accounts]="reporters"><div class="data-row data-head"><span>Username</span><span>Full name</span><span>Email</span>@if (reporters) { <span>Role</span> } @else { <span>Cash</span><span>Actions</span> }</div>
        @if (reporters && loading()) { <p class="empty-state" role="status">Loading reporter accounts…</p> }
        @else if (reporters && loadError()) { <p class="empty-state" role="alert">{{ loadError() }}</p> }
        @else { @for (a of accounts; track a.id) { <div class="data-row">@if (reporters) { <strong>{{ a.username }}</strong><span>{{ a.fullName || a.username }}</span> } @else { <a class="account-client-link" [routerLink]="['/admin/clients', a.username, 'transactions']"><strong>{{ a.username }}</strong></a><a class="account-client-link" [routerLink]="['/admin/clients', a.username, 'transactions']">{{ a.fullName || a.username }}</a> }<span>{{ a.email || '—' }}</span>@if (reporters) { <span>{{ a.role || '—' }}</span> } @else { <span>{{ a.cash | currency:'USD' }}</span><div class="row-actions"><button (click)="edit(a)">Edit</button><button class="danger" (click)="remove(a)">Delete</button></div> }</div> } @empty { <p class="empty-state">No accounts yet.</p> } }
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
export default class AccountManagementPage implements OnInit {
  store = inject(Store)
  route = inject(ActivatedRoute)
  http = inject(HttpClient)
  apiBasePath = inject(BASE_PATH)
  loading = signal(false)
  loadError = signal("")

  ngOnInit() {
    if (!this.reporters) return

    this.loading.set(true)
    this.loadError.set("")
    this.http
      .get<ReporterApiResponse>(
        `${this.apiBasePath}/v1/employees/admin/reporters`,
        { timeout: 15000 },
      )
      .subscribe({
        next: (response) => {
          try {
            const records = this.reporterRecords(response)
            this.store.reporters.set(records.map((record, index) => this.toAccount(record, index)))
          } catch (error) {
            this.loadError.set((error as Error).message)
          } finally {
            this.loading.set(false)
          }
        },
        error: (error: { error?: { message?: string }; message?: string }) => {
          this.loadError.set(
            error.error?.message ||
              error.message ||
              "Unable to load reporter accounts. Check that the Spring Boot API is running and reachable.",
          )
          this.loading.set(false)
        },
      })
  }

  private reporterRecords(response: ReporterApiResponse): ReporterApiRecord[] {
    if (Array.isArray(response)) return response
    const records = response.data ?? response.reporters ?? response.content
    if (records) return records
    throw new Error("The reporter accounts response has an unexpected format.")
  }

  private toAccount(record: ReporterApiRecord, index: number): Account {
    const username = record.username ?? ""
    const fullName = [record.firstName, record.lastName]
      .filter(Boolean)
      .join(" ")
    const numericId = Number(record.employeeId)

    return {
      id: Number.isFinite(numericId) ? numericId : index + 1,
      username,
      fullName: fullName || username,
      email: record.email ?? "",
      cash: 0,
      role: record.role,
    }
  }

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
