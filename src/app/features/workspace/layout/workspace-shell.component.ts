import { DOCUMENT } from "@angular/common"
import { Component, inject, OnInit, signal } from "@angular/core"
import { HttpClient } from "@angular/common/http"
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from "@angular/router"
import Store from "../../../core/state/portfolio.store"
import Brand from "../../../shared/brand/brand.component"
import { TokenStore } from "../../../core/auth/token-store.service"
import { BASE_PATH } from "../../../core/api/auth"

@Component({
  selector: "app-shell",
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Brand],
  template: `
    @if (store.session()?.role === 'client') {
      <div class="client-app"><header class="client-header"><app-brand/>
        <button class="menu-button" aria-label="Toggle navigation" (click)="menu = !menu">≡</button>
        <nav class="client-nav" [class.open]="menu">@for (page of clientPages; track page[0]) { <a [routerLink]="['/client', page[0]]" routerLinkActive="active" (click)="menu = false">{{ page[1] }}</a> }</nav>
        <div class="client-account"><button class="theme-toggle" type="button" (click)="toggleTheme()" [attr.aria-pressed]="darkMode()" [attr.aria-label]="darkMode() ? 'Switch to light mode' : 'Switch to dark mode'"><span aria-hidden="true">{{ darkMode() ? '☀' : '☾' }}</span><span>{{ darkMode() ? 'Light' : 'Dark' }} mode</span></button><span class="user-avatar">{{ store.name.slice(0,2).toUpperCase() }}</span><span>{{ store.name }}</span><button (click)="logout()">Sign out</button></div>
      </header><router-outlet/></div>
    } @else {
      <div class="employee-shell"><aside class="employee-sidebar"><app-brand/><div class="workspace-label"><span>Workspace</span><b>{{ store.session()?.role }}</b></div>
        <nav>@for (page of employeePages; track page[0]) { <a [routerLink]="['/', store.session()?.role, page[0]]" routerLinkActive="active" [attr.title]="page[1]">{{ page[1] }}</a> }
        @if (store.session()?.role === 'admin') { <a routerLink="/admin/reporters" routerLinkActive="active">Reporter accounts</a> }</nav>
        <div class="employee-user"><span>{{ store.name }}</span><button (click)="logout()">Sign out</button></div>
      </aside><div class="employee-main"><header><div><span>Veridian workspace</span><strong>Welcome, {{ store.name }}</strong></div><div class="employee-header-actions"><button class="theme-toggle" type="button" (click)="toggleTheme()" [attr.aria-pressed]="darkMode()" [attr.aria-label]="darkMode() ? 'Switch to light mode' : 'Switch to dark mode'"><span aria-hidden="true">{{ darkMode() ? '☀' : '☾' }}</span><span>{{ darkMode() ? 'Light' : 'Dark' }} mode</span></button><div class="employee-status"><i></i>USD</div></div></header><router-outlet/></div></div>
    }`,
})
export default class Shell implements OnInit {
  store = inject(Store)
  private document = inject(DOCUMENT)
  router = inject(Router)
  tokenStore = inject(TokenStore)
  http = inject(HttpClient)
  apiBasePath = inject(BASE_PATH)
  darkMode = signal(false)
  menu = false
  clientPages = [
    ["home", "Overview"],
    ["markets", "Markets"],
    ["holdings", "Holdings"],
    ["orders", "Orders"],
    ["transactions", "Transactions"],
    ["analytics", "Analytics"],
  ]
  employeePages = [
    ["orders", "All orders"],
    ["transactions", "Transactions"],
    ["clients", "Client accounts"],
    ["analytics", "Analytics"],
  ]

  ngOnInit() {
    const savedTheme = localStorage.getItem("veridian-theme")
    this.setDarkMode(savedTheme === "dark", false)
  }

  toggleTheme() {
    this.setDarkMode(!this.darkMode())
  }

  private setDarkMode(enabled: boolean, persist = true) {
    this.darkMode.set(enabled)
    this.document.documentElement.dataset["theme"] = enabled ? "dark" : "light"
    if (persist) localStorage.setItem("veridian-theme", enabled ? "dark" : "light")
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
    this.store.session.set(null)
    void this.router.navigate(["/login"])
  }
}