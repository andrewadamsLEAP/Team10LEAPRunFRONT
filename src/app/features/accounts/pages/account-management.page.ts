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

type ClientAdminRecord = {
  clientId: number | string
  username: string
  firstName: string
  lastName: string
  cashAmount: number
  email?: string | null
  status?: "Active" | "Suspended"
}

type AccountDraft = Account & {
  firstName: string
  lastName: string
  password: string
  role: string
}

@Component({
  selector: "app-account-management-page",
  standalone: true,
  imports: [CurrencyPipe, FormsModule, RouterLink],
  template: `
    <div class="page-wrap"><div class="page-intro"><div><span class="eyebrow">Account management</span><h1>{{ reporters ? 'Reporter accounts' : 'Client accounts' }}</h1><p>{{ reporters ? 'Reporter account directory.' : 'Create, edit, and manage account access.' }}</p></div>@if (reporters) { <button class="primary-button" (click)="create()">Add account</button> }</div>
      <section class="surface data-surface"><div class="data-table accounts-table admin" [class.reporter-accounts]="reporters"><div class="data-row data-head"><span>Username</span>@if (reporters) { <span>Full name</span><span>Email</span><span>Role</span> } @else { <span>First name</span><span>Last name</span><span>Cash</span><span>Actions</span> }</div>
        @if (loading()) { <p class="empty-state" role="status">Loading {{ reporters ? 'reporter' : 'client' }} accounts…</p> }
        @else if (loadError()) { <p class="empty-state" role="alert">{{ loadError() }}</p> }
        @else { @for (a of accounts; track a.id) { <div class="data-row">@if (reporters) { <strong>{{ a.username }}</strong><span>{{ a.fullName || a.username }}</span><span>{{ a.email || '—' }}</span><span>{{ a.role || '—' }}</span> } @else { <a class="account-client-link" [routerLink]="['/admin/clients', a.username, 'transactions']"><strong>{{ a.username }}</strong></a><a class="account-client-link" [routerLink]="['/admin/clients', a.username, 'transactions']">{{ a.firstName || '—' }}</a><a class="account-client-link" [routerLink]="['/admin/clients', a.username, 'transactions']">{{ a.lastName || '—' }}</a><span>{{ a.cash | currency:'USD' }}</span><div class="row-actions"><button (click)="edit(a)">Edit</button><button type="button" [class.suspend-action]="a.status !== 'Suspended'" [class.activate-action]="a.status === 'Suspended'" (click)="toggleStatus(a)">{{ a.status === 'Suspended' ? 'Activate' : 'Suspend' }}</button></div> }</div> } @empty { <p class="empty-state">No accounts yet.</p> } }
      </div></section>
    </div>
    @if (draft; as d) {
      <div class="modal-backdrop"><form class="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title" (ngSubmit)="save()"><div class="modal-heading"><div><span class="eyebrow">Account details</span><h2 id="account-title">{{ editing ? 'Edit account' : 'Create account' }}</h2></div><button type="button" aria-label="Close dialog" (click)="draft = null">×</button></div>
        <label><span>Username</span><input name="username" [(ngModel)]="d.username" required [readonly]="editing"></label>
        @if (reporters) {
          <label><span>First name</span><input name="firstName" [(ngModel)]="d.firstName" required></label>
          <label><span>Last name</span><input name="lastName" [(ngModel)]="d.lastName" required></label>
          <label><span>Password</span><input name="password" [(ngModel)]="d.password" type="password" autocomplete="new-password" required minlength="8"></label>
          <label><span>Role</span><select name="role" [(ngModel)]="d.role" disabled><option value="reporter">Reporter</option></select></label>
        } @else {
          <label><span>First name</span><input name="firstName" [(ngModel)]="d.firstName"></label>
          <label><span>Last name</span><input name="lastName" [(ngModel)]="d.lastName"></label>
        }
        <label><span>Email</span><input name="email" type="email" [(ngModel)]="d.email" required></label>
        @if (error) { <div class="form-error" role="alert">{{ error }}</div> }
        <div class="modal-actions"><button type="button" class="secondary-button" [disabled]="saving()" (click)="draft = null">Cancel</button><button class="primary-button" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save account' }}</button></div>
      </form></div>
    }
  `,
})
export default class AccountManagementPage implements OnInit {
  store = inject(Store)
  route = inject(ActivatedRoute)
  http = inject(HttpClient)
  apiBasePath = inject(BASE_PATH)
  loading = signal(false)
  saving = signal(false)
  loadError = signal("")

  ngOnInit() {
    this.loading.set(true)
    this.loadError.set("")
    if (this.reporters) {
      this.loadReporterAccounts()
      return
    }

    this.http
      .get<ClientAdminRecord[]>(`${this.apiBasePath}/v1/employees/admin`, {
        timeout: 15000,
      })
      .subscribe({
        next: (records) => {
          this.store.clients.set(records.map((record) => ({
            id: Number(record.clientId),
            username: record.username,
            fullName: [record.firstName, record.lastName].filter(Boolean).join(" "),
            firstName: record.firstName,
            lastName: record.lastName,
            email: record.email ?? "",
            cash: Number(record.cashAmount),
            status: record.status ?? "Active",
          })))
          this.loading.set(false)
        },
        error: (error: { error?: { message?: string }; message?: string }) => {
          this.setLoadError(error, "client")
        },
      })
  }

  private loadReporterAccounts() {
    this.loading.set(true)
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
          this.setLoadError(error, "reporter")
        },
      })
  }

  private setLoadError(
    error: { error?: { message?: string }; message?: string },
    accountType: "client" | "reporter",
  ) {
    this.loadError.set(
      error.error?.message ||
        error.message ||
        `Unable to load ${accountType} accounts. Check that the Spring Boot API is running and reachable.`,
    )
    this.loading.set(false)
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
  draft: AccountDraft | null = null
  editing = false
  error = ""
  create() {
    this.editing = false
    this.error = ""
    this.draft = {
      id: Date.now(),
      username: "",
      fullName: "",
      firstName: "",
      lastName: "",
      email: "",
      cash: 0,
      password: "",
      role: this.reporters ? "reporter" : "client",
     // status: "Active",
    }
  }
  edit(a: Account) {
    this.editing = true
    this.error = ""
    this.draft = { ...a, firstName: a.firstName ?? "", lastName: a.lastName ?? "", password: "", role: a.role ?? "client" }
  }
  toggleStatus(a: Account) {
    this.store[this.key].update((items) =>
      items.map((item) => item.id === a.id
        ? { ...item, status: item.status === "Suspended" ? "Active" : "Suspended" }
        : item),
    )
  }
  save() {
    try {
      const account = this.draft!
      account.username = account.username.trim().toLowerCase()
      if (!this.reporters) {
        account.firstName = account.firstName.trim()
        account.lastName = account.lastName.trim()
        account.fullName = [account.firstName, account.lastName].filter(Boolean).join(" ")
      }
      if (!account.username || !account.email.includes("@"))
        throw new Error("Enter a username and valid email.")

      if (this.reporters && !this.editing) {
        if (!account.firstName.trim() || !account.lastName.trim() || account.password.length < 8)
          throw new Error("Enter first name, last name, and a password of at least 8 characters.")

        this.http
          .post(`${this.apiBasePath}/auth/employees/reporter`, {
            email: account.email.trim(),
            username: account.username,
            password: account.password,
            first_name: account.firstName.trim(),
            last_name: account.lastName.trim(),
          })
          .subscribe({
            next: () => {
              this.draft = null
              this.loadReporterAccounts()
            },
            error: (error: { error?: { message?: string }; message?: string }) => {
              this.error = error.error?.message || error.message || "Unable to create reporter account."
            },
          })
        return
      }

      if (!this.reporters && this.editing) {
        this.saving.set(true)
        this.error = ""
        this.http.patch(
          `${this.apiBasePath}/v1/employees/admin/update/${account.id}`,
          {
            username: account.username,
            firstName: account.firstName,
            lastName: account.lastName,
            email: account.email.trim(),
          },
          { timeout: 15000 },
        ).subscribe({
          next: () => {
            this.store.saveAccount(this.key, { ...account })
            this.saving.set(false)
            this.draft = null
          },
          error: (error: { error?: { message?: string }; message?: string }) => {
            this.saving.set(false)
            this.error = error.error?.message || error.message || "Unable to update client account."
          },
        })
        return
      }

      this.store.saveAccount(this.key, { ...account })
      this.draft = null
    } catch (error) {
      this.error = (error as Error).message
    }
  }
}
