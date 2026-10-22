import { inject } from "@angular/core"
import { CanActivateFn, Router } from "@angular/router"
import Store from "../state/portfolio.store"
import { TokenStore } from "./token-store.service"

const restoreSession = (store: Store, tokenStore: TokenStore) => {
  const user = tokenStore.currentUser()
  if (!store.session() && user && tokenStore.isAuthenticated()) {
    store.session.set({ role: tokenStore.userRole(), username: user.username })
    if (tokenStore.userRole() === "client") {
      store.loadHoldings()
      store.loadClientTransactions()
    }
  }
  return user && tokenStore.isAuthenticated()
}

export const roleGuard: CanActivateFn = (route) => {
  const store = inject(Store)
  const tokenStore = inject(TokenStore)
  const router = inject(Router)
  const authenticated = restoreSession(store, tokenStore)
  const session = store.session()
  if (!authenticated || !session) return router.createUrlTree(["/login"])
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

export const authPageGuard: CanActivateFn = () => {
  const store = inject(Store)
  const tokenStore = inject(TokenStore)
  const router = inject(Router)
  if (restoreSession(store, tokenStore)) {
    const role = store.session()!.role
    return router.createUrlTree([
      role,
      role === "client" ? "home" : "orders",
    ])
  }
  return true
}
