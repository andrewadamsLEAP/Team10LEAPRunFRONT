import { Routes } from "@angular/router"
import { authPageGuard, roleGuard } from "./core/auth/role.guard"

const loadAuth = () =>
  import("./features/auth/pages/login.page").then((m) => m.default)
const loadShell = () =>
  import("./features/workspace/layout/workspace-shell.component").then(
    (m) => m.default,
  )
const loadDashboard = () =>
  import("./features/dashboard/pages/dashboard.page").then((m) => m.default)
const loadNewsPage = () =>
  import("./features/news/pages/news.page").then((m) => m.default)
const loadClientAnalyticsPage = () =>
  import("./features/dashboard/pages/client-analytics.page").then(
    (m) => m.default,
  )
const loadMarketListPage = () =>
  import("./features/markets/pages/market-list.page").then((m) => m.default)
const loadTickerDetailPage = () =>
  import("./features/markets/pages/ticker-detail.page").then((m) => m.default)
const loadTradePage = () =>
  import("./features/markets/pages/trade.page").then((m) => m.default)
const loadOrdersPage = () =>
  import("./features/orders/pages/orders.page").then((m) => m.default)
const loadTransactionsPage = () =>
  import("./features/transactions/pages/transactions.page").then(
    (m) => m.default,
  )
const loadClientTransactionHistoryPage = () =>
  import("./features/transactions/pages/client-transaction-history.page").then(
    (m) => m.default,
  )
const loadHoldingsPage = () =>
  import("./features/portfolio/pages/holdings.page").then((m) => m.default)
const loadAccountDirectoryPage = () =>
  import("./features/accounts/pages/account-directory.page").then(
    (m) => m.default,
  )
const loadAccountManagementPage = () =>
  import("./features/accounts/pages/account-management.page").then(
    (m) => m.default,
  )
const loadAnalytics = () =>
  import(
    "./features/platform-analytics/pages/platform-analytics.page"
  ).then((m) => m.default)
const loadProfilePage = () =>
  import("./features/profile/profile.page").then((m) => m.default)

const employeeChildren: Routes = [
  { path: "orders", loadComponent: loadOrdersPage },
  {
    path: "transactions",
    loadComponent: loadTransactionsPage,
  },
  { path: "clients/:username/transactions", loadComponent: loadClientTransactionHistoryPage },
  { path: "clients", loadComponent: loadAccountDirectoryPage },
  { path: "analytics", loadComponent: loadAnalytics },
  { path: "", redirectTo: "orders", pathMatch: "full" },
]
const adminChildren: Routes = [
  { path: "orders", loadComponent: loadOrdersPage },
  { path: "transactions", loadComponent: loadTransactionsPage },
  { path: "clients/:username/transactions", loadComponent: loadClientTransactionHistoryPage },
  { path: "clients", loadComponent: loadAccountManagementPage },
  { path: "analytics", loadComponent: loadAnalytics },
  { path: "reporters", loadComponent: loadAccountManagementPage, data: { reporters: true } },
  { path: "", redirectTo: "orders", pathMatch: "full" },
]
export const routes: Routes = [
  { path: "login", loadComponent: loadAuth, canActivate: [authPageGuard] },
  { path: "signup", loadComponent: loadAuth, canActivate: [authPageGuard] },
  {
    path: "client",
    loadComponent: loadShell,
    canActivate: [roleGuard],
    canActivateChild: [roleGuard],
    data: { role: "client" },
    children: [
      { path: "home", loadComponent: loadDashboard },
      { path: "news", loadComponent: loadNewsPage },
      { path: "account", loadComponent: loadProfilePage },
      {
        path: "analytics",
        loadComponent: loadClientAnalyticsPage,
      },
      { path: "markets", loadComponent: loadMarketListPage },
      { path: "ticker/:symbol", loadComponent: loadTickerDetailPage },
      { path: "trade/:symbol", loadComponent: loadTradePage },
      ...["orders", "transactions", "holdings"].map((page) => ({
        path: page,
        loadComponent:
          page === "orders"
            ? loadOrdersPage
            : page === "transactions"
              ? loadTransactionsPage
              : loadHoldingsPage,
      })),
      { path: "", redirectTo: "home", pathMatch: "full" },
    ],
  },
  {
    path: "reporter",
    loadComponent: loadShell,
    canActivate: [roleGuard],
    canActivateChild: [roleGuard],
    data: { role: "reporter" },
    children: [...employeeChildren],
  },
  {
    path: "admin",
    loadComponent: loadShell,
    canActivate: [roleGuard],
    canActivateChild: [roleGuard],
    data: { role: "admin" },
    children: adminChildren,
  },
  { path: "**", redirectTo: "login" },
]
