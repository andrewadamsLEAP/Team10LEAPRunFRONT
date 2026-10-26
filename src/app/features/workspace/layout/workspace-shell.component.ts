import { Component, OnDestroy, inject, signal } from "@angular/core"
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
import { catchError, EMPTY, exhaustMap, Subscription, timer } from "rxjs"

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
        <div class="token-countdowns" aria-label="Session refresh countdown"><span><small>Refresh</small><strong>{{ refreshPromptOpen() ? 'Now' : formatExpiry(tokenStore.accessSecondsRemaining()) }}</strong></span></div>
        <div class="client-account"><a class="user-avatar" routerLink="/client/account" aria-label="Open account">{{ store.name.slice(0,2).toUpperCase() }}</a><a routerLink="/client/account">{{ store.name }}</a><button (click)="logout()">Sign out</button></div>
      </header><router-outlet/></div>
    } @else {
      <div class="employee-shell"><aside class="employee-sidebar"><app-brand/><div class="workspace-label"><span>Workspace</span><b>{{ store.session()?.role }}</b></div>
        <nav>@for (page of employeePages; track page[0]) { <a [routerLink]="['/', store.session()?.role, page[0]]" routerLinkActive="active" [attr.title]="page[1]">{{ page[1] }}</a> }
        @if (store.session()?.role === 'admin') { <a routerLink="/admin/reporters" routerLinkActive="active">Reporter accounts</a> }</nav>
        <div class="employee-user"><span>{{ store.name }}</span><button (click)="logout()">Sign out</button></div>
      </aside><div class="employee-main"><header><div><span>Veridian workspace</span><strong>Welcome, {{ store.name }}</strong></div><div class="employee-header-tools"><div class="token-countdowns" aria-label="Session refresh countdown"><span><small>Refresh</small><strong>{{ refreshPromptOpen() ? 'Now' : formatExpiry(tokenStore.accessSecondsRemaining()) }}</strong></span></div><div class="employee-status"><i></i>USD</div></div></header><router-outlet/></div></div>
    }
    @if (refreshPromptOpen()) {
      <div class="modal-backdrop session-expiry-backdrop">
        <section class="session-expiry-modal" role="alertdialog" aria-modal="true" aria-labelledby="session-expiry-title" aria-describedby="session-expiry-message">
          <span class="eyebrow">Session refresh required</span>
          <h2 id="session-expiry-title">Keep your session active?</h2>
          <p id="session-expiry-message">Your access token has expired. Refresh your session within {{ promptSecondsRemaining() }} seconds or you will be signed out.</p>
          @if (refreshError()) { <p class="session-refresh-error" role="alert">{{ refreshError() }}</p> }
          <button class="primary-button" type="button" [disabled]="refreshing()" (click)="refreshSession()">{{ refreshing() ? 'Refreshing…' : 'Refresh session' }}</button>
        </section>
      </div>
    }`,
})
export default class Shell implements OnDestroy {
  store = inject(Store)
  router = inject(Router)
  tokenStore = inject(TokenStore)
  http = inject(HttpClient)
  apiBasePath = inject(BASE_PATH)
  refreshPromptOpen = signal(false)
  promptSecondsRemaining = signal(60)
  refreshing = signal(false)
  refreshError = signal("")
  private promptInterval: number | null = null
  private expiryWatch: number | null = null
  private logoutPending = false
  private holdingsPolling?: Subscription
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
    if (typeof window !== "undefined") {
      this.expiryWatch = window.setInterval(() => {
        if (
          this.store.session() &&
          this.tokenStore.accessToken() &&
          this.tokenStore.accessSecondsRemaining() === 0
        ) {
          if ((this.tokenStore.refreshSecondsRemaining() ?? 0) <= 0) {
            this.logout()
          } else {
            this.startRefreshPrompt()
          }
        }
      }, 250)
    }
    if (this.store.session()?.role === "client") {
      this.store.loadInstruments()
      this.holdingsPolling = timer(0, 5000).pipe(
        exhaustMap(() => this.store.refreshHoldings().pipe(catchError(() => EMPTY))),
      ).subscribe()
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
  ngOnDestroy() {
    this.holdingsPolling?.unsubscribe()
    if (this.expiryWatch !== null) window.clearInterval(this.expiryWatch)
    if (this.promptInterval !== null) window.clearInterval(this.promptInterval)
  }
  displayKind(assetType: "STOCK" | "CRYPTO" | "FOREX") {
    return assetType[0] + assetType.slice(1).toLowerCase()
  }
  clearTickerSearch() {
    this.tickerQuery = ""
  }
  formatExpiry(seconds: number | null) {
    if (seconds === null) return "—"
    if (seconds <= 0) return "Expired"

    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const remainder = seconds % 60
    const time = [hours, minutes, remainder]
      .map((part) => String(part).padStart(2, "0"))
      .join(":")
    return days > 0 ? `${days}d ${time}` : time
  }
  private startRefreshPrompt() {
    if (this.refreshPromptOpen()) return
    this.refreshPromptOpen.set(true)
    this.promptSecondsRemaining.set(60)
    this.refreshError.set("")
    this.promptInterval = window.setInterval(() => {
      const remaining = this.promptSecondsRemaining() - 1
      this.promptSecondsRemaining.set(remaining)
      if (remaining <= 0) this.logout()
    }, 1000)
  }

  refreshSession() {
    const refreshToken = this.tokenStore.refreshToken()
    if (!refreshToken || this.refreshing()) {
      if (!refreshToken) this.finalizeLogout()
      return
    }

    this.refreshing.set(true)
    this.refreshError.set("")
    this.http.post<any>(`${this.apiBasePath}/auth/refresh`, {
      refresh_token: refreshToken,
    }).subscribe({
      next: (response) => {
        this.tokenStore.setTokens(
          response.access_token,
          response.refresh_token,
          response.access_token_expires_at,
          response.refresh_token_expires_at,
        )
        this.refreshing.set(false)
        this.refreshPromptOpen.set(false)
        this.refreshError.set("")
        if (this.promptInterval !== null) {
          window.clearInterval(this.promptInterval)
          this.promptInterval = null
        }
      },
      error: (error: { error?: { message?: string }; message?: string }) => {
        this.refreshing.set(false)
        this.refreshError.set(
          error.error?.message || error.message || "Session refresh failed. Try again before the countdown ends.",
        )
      },
    })
  }
  logout() {
    if (this.logoutPending) return
    this.logoutPending = true
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
    this.holdingsPolling?.unsubscribe()
    if (this.promptInterval !== null) {
      window.clearInterval(this.promptInterval)
      this.promptInterval = null
    }
    if (this.expiryWatch !== null) {
      window.clearInterval(this.expiryWatch)
      this.expiryWatch = null
    }
    this.refreshPromptOpen.set(false)
    this.refreshing.set(false)
    this.tokenStore.clear()
    this.store.clearClientProfile()
    this.store.session.set(null)
    void this.router.navigate(["/login"])
  }
}