import {
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn,
} from "@angular/common/http"
import { inject } from "@angular/core"
import { Router } from "@angular/router"
import { catchError, throwError } from "rxjs"
import { TokenStore } from "./token-store.service"

const isAuthRequest = (url: string) =>
  /\/auth\/(login|signup|refresh|employee\/login)$/.test(url)

export const SKIP_AUTH = new HttpContextToken<boolean>(() => false)

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenStore = inject(TokenStore)
  const router = inject(Router)
  const authRequest = isAuthRequest(req.url)
  const skipAuth = req.context.get(SKIP_AUTH)
  const token = tokenStore.accessToken()

  const authenticatedRequest =
    token && !authRequest && !skipAuth
      ? req.clone({
          setHeaders: {
            Authorization: `Bearer ${token}`,
          },
        })
      : req

  return next(authenticatedRequest).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !authRequest && !skipAuth) {
        tokenStore.clear()
        void router.navigate(["/login"])
      }
      return throwError(() => error)
    }),
  )
}
