import { inject } from "@angular/core"
import { CanActivateFn, Router } from "@angular/router"
import Store from "../state/portfolio.store"
import { TokenStore } from "./token-store.service"

export const roleGuard: CanActivateFn = (route) => {
  const store = inject(Store)
  const tokenStore = inject(TokenStore)
  const router = inject(Router)

  if (!tokenStore.isAuthenticated()) {
    tokenStore.clear()
    return router.createUrlTree(["/login"])
  }

  const tokenUser = tokenStore.currentUser()
  const session =
    store.session() ??
    (tokenUser
      ? {
          role: tokenStore.userRole(),
          username: tokenUser.username,
        }
      : null)

  if (session && !store.session()) {
    store.session.set(session)
  }

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
