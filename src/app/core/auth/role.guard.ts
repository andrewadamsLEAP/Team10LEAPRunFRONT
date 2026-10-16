import { inject } from "@angular/core"
import { CanActivateFn, Router } from "@angular/router"
import Store from "../state/portfolio.store"

export const roleGuard: CanActivateFn = (route) => {
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
