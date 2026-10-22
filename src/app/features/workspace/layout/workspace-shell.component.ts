import { Component, inject } from "@angular/core"
import { FormsModule } from "@angular/forms"
import { HttpClient } from "@angular/common/http"
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from "@angular/router"
import Store, { ClientProfile } from "../../../core/state/portfolio.store"
import Brand from "../../../shared/brand/brand.component"
import { TokenStore } from "../../../core/auth/token-store.service"
import { BASE_PATH } from "../../../core/api/auth"

@Component({
  selector: "app-shell",
  standalone: true,
  imports: [FormsModule, RouterOutlet, RouterLink, RouterLinkActive, Brand],
  template: `
    @if (store.session()?.role === 'client') {
      <div class="client-app"><header class="client-header"><app-brand/>
        <button class="menu-button" aria-label="Toggle navigation" (click)="menu = !menu">≡</button>
        <nav class="client-nav" [class.open]="menu">@for (page of clientPages; track page[0]) { <a [routerLink]="['/client', page[0]]" routerLinkActive="active" (click)="menu = false">{{ page[1] }}</a> }</nav>
        <label class="header-search"><input [(ngModel)]="tickerQuery" aria-label="Search ticker or name" placeholder="Search ticker or name" autocomplete="off"><span aria-hidden="true">⌕</span><div class="header-search-results" role="listbox">@if (tickerQuery.trim()) { @for (instrument of tickerMatches; track instrument.ticker) { <a [routerLink]="['/client/ticker', instrument.ticker]" (click)="clearTickerSearch()"><strong>{{ instrument.ticker }}</strong><span>{{ instrument.displayName || '—' }}</span></a> } @empty { <span class="header-search-empty">No matching instruments</span> } }</div></label>
        <div class="client-account"><a class="user-avatar" routerLink="/client/account" aria-label="Open account">{{ store.name.slice(0,2).toUpperCase() }}</a><a routerLink="/client/account">{{ store.name }}</a><button (click)="logout()">Sign out</button></div>
      </header><router-outlet/></div>
    } @else {
      <div class="employee-shell"><aside class="employee-sidebar"><app-brand/><div class="workspace-label"><span>Workspace</span><b>{{ store.session()?.role }}</b></div>
        <nav>@for (page of employeePages; track page[0]) { <a [routerLink]="['/', store.session()?.role, page[0]]" routerLinkActive="active" [attr.title]="page[1]">{{ page[1] }}</a> }
        @if (store.session()?.role === 'admin') { <a routerLink="/admin/reporters" routerLinkActive="active">Reporter accounts</a> }</nav>
        <div class="employee-user"><span>{{ store.name }}</span><button (click)="logout()">Sign out</button></div>
      </aside><div class="employee-main"><header><div><span>Veridian workspace</span><strong>Welcome, {{ store.name }}</strong></div><div class="employee-status"><i></i>USD</div></header><router-outlet/></div></div>
    }`,
})
export default class Shell {
  store = inject(Store)
  router = inject(Router)
  tokenStore = inject(TokenStore)
  http = inject(HttpClient)
  apiBasePath = inject(BASE_PATH)
  menu = false
  clientPages = [
    ["home", "Overview"],
    ["markets", "Markets"],
    ["holdings", "Holdings"],
    ["orders", "Orders"],
    ["transactions", "Transactions"],
    ["analytics", "Analytics"],
    ["account", "Account"],
  ]
  employeePages = [
    ["orders", "All orders"],
    ["transactions", "Transactions"],
    ["clients", "Client accounts"],
    ["analytics", "Analytics"],
  ]
  tickerQuery = ""
  constructor() {
    if (this.store.session()?.role === "client") {
      this.store.loadInstruments()
      if (!this.store.clientProfile()) {
        this.http
          .get<ClientProfile>(`${this.apiBasePath}/v1/clients/profile`)
          .subscribe({
            next: (profile) => this.store.setClientProfile(profile),
            error: () => undefined,
          })
      }
    }
  }
  get tickerMatches() {
    const query = this.tickerQuery.trim().toLowerCase()
    return this.store.instruments()
      .filter((instrument) =>
        [instrument.ticker, instrument.displayName]
          .some((value) => (value ?? "").toLowerCase().includes(query)),
      )
      .slice(0, 8)
  }
  displayKind(assetType: "STOCK" | "CRYPTO" | "FOREX") {
    return assetType[0] + assetType.slice(1).toLowerCase()
  }
  clearTickerSearch() {
    this.tickerQuery = ""
  }
  logout() {
    const refreshToken = this.tokenStore.refreshToken()
    if (refreshToken) {
      // Notify NestJS backend to blacklist access and refresh tokens
      this.http.post(`${this.apiBasePath}/auth/logout`, {
        refresh_token: refreshToken,
      }).subscribe({
        complete: () => this.finalizeLogout(),
        error: () => this.finalizeLogout(), // Clean up locally even if server fails
      })
    } else {
      this.finalizeLogout()
    }
  }

  private finalizeLogout() {
    this.tokenStore.clear()
    this.store.clearClientProfile()
    this.store.session.set(null)
    void this.router.navigate(["/login"])
  }
}