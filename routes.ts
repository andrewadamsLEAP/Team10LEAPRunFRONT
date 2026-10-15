import { inject } from "@angular/core"
import { CanActivateFn, Router, Routes } from "@angular/router"
import Store from "./store"
import Auth from "./auth"
import Shell from "./shell"
import Dashboard from "./dashboard"
import Market from "./market"
import Activity from "./activity"
import Accounts from "./accounts"
import Analytics from "./analytics"

const roleGuard: CanActivateFn = (route) => {
  const store = inject(Store)
  const router = inject(Router)
  const session = store.session()
  if (!session) return router.createUrlTree(["/login"])
  const role = [...route.pathFromRoot]
    .reverse()
    .find((node) => node.data["role"])?.data["role"]
  return (
    session.role === role ||
    router.createUrlTree([
      session.role,
      session.role === "client" ? "home" : "orders",
    ])
  )
}
const employeeChildren: Routes = [
  { path: "orders", component: Activity, data: { page: "orders" } },
  { path: "transactions", component: Activity, data: { page: "transactions" } },
  { path: "clients", component: Accounts },
  { path: "analytics", component: Analytics },
  { path: "", redirectTo: "orders", pathMatch: "full" },
]
export const routes: Routes = [
  { path: "login", component: Auth },
  {
    path: "client",
    component: Shell,
    canActivate: [roleGuard],
    canActivateChild: [roleGuard],
    data: { role: "client" },
    children: [
      { path: "home", component: Dashboard },
      { path: "analytics", component: Dashboard, data: { analytics: true } },
      { path: "markets", component: Market },
      { path: "ticker/:symbol", component: Market },
      { path: "trade/:symbol", component: Market, data: { trade: true } },
      ...["orders", "transactions", "holdings"].map((page) => ({
        path: page,
        component: Activity,
        data: { page },
      })),
      { path: "", redirectTo: "home", pathMatch: "full" },
    ],
  },
  {
    path: "reporter",
    component: Shell,
    canActivate: [roleGuard],
    canActivateChild: [roleGuard],
    data: { role: "reporter" },
    children: [...employeeChildren],
  },
  {
    path: "admin",
    component: Shell,
    canActivate: [roleGuard],
    canActivateChild: [roleGuard],
    data: { role: "admin" },
    children: [
      { path: "reporters", component: Accounts, data: { reporters: true } },
      ...employeeChildren,
    ],
  },
  { path: "**", redirectTo: "login" },
]
