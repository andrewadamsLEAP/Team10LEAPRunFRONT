import { Component, inject } from "@angular/core"
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from "@angular/router"
import Store from "./store"
import Brand from "./brand"

@Component({
  selector: "app-shell",
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Brand],
  template: `
    @if (store.session()?.role === 'client') {
      <div class="client-app"><header class="client-header"><app-brand/>
        <button class="menu-button" aria-label="Toggle navigation" (click)="menu = !menu">≡</button>
        <nav class="client-nav" [class.open]="menu">@for (page of clientPages; track page[0]) { <a [routerLink]="['/client', page[0]]" routerLinkActive="active" (click)="menu = false">{{ page[1] }}</a> }</nav>
        <div class="client-account"><span class="user-avatar">{{ store.name.slice(0,2).toUpperCase() }}</span><span>{{ store.name }}</span><button (click)="logout()">Sign out</button></div>
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
  logout() {
    this.store.session.set(null)
    void this.router.navigate(["/login"])
  }
}
