import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http'
import { inject } from '@angular/core'
import { Router } from '@angular/router'
import { catchError, throwError } from 'rxjs'
import { TokenStore } from './token-store.service'

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const tokenStore = inject(TokenStore)
    const router = inject(Router)
    const token = tokenStore.accessToken()

    const isAuthEndpoint = req.url.includes('/auth/login') || req.url.includes('/auth/signup')

    // have to clone the auth request since HttpRequest obj = immutable
    let authReq = req 
    if (token && !isAuthEndpoint) {
        authReq = req.clone({
            setHeaders: {
                Authorization: `Bearer ${token}`,
            },
        })
    }

    // send request to handler 
    return next(authReq).pipe(
        catchError((error: HttpErrorResponse) => {
        // if token is expired or revoked
        if (error.status === 401 && !isAuthEndpoint) {
            tokenStore.clear()
            void router.navigate(['/login'])
        }
            return throwError(() => error)
        })
    )


}