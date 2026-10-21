import { Injectable, signal, computed } from '@angular/core'
import { Role } from '../models/data'

const ACCESS_TOKEN_KEY = 'v_access_token'
const REFRESH_TOKEN_KEY = 'v_refresh_token'

const clearTokensAfterReload = () => {
    if (typeof window === 'undefined') return

    const navigation = performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined
    const isReload = navigation?.type === 'reload' || performance.navigation.type === 1
    if (!isReload) return

    sessionStorage.removeItem(ACCESS_TOKEN_KEY)
    sessionStorage.removeItem(REFRESH_TOKEN_KEY)
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
}

clearTokensAfterReload()

// token from nestjs
export interface DecodedToken {
  sub: string          // (client_id or employee_id)
  username: string     
  jti: string          // Unique JWT ID (UUID) for token-level revocation
  sid: string          // Session ID (UUID) for session-level revocation
  token_use: 'access' | 'refresh' // type of token
  actorType: 'client' | 'employee'
  role: 'CLIENT' | 'EMPLOYEE_REPORTER' | 'EMPLOYEE_ADMIN' // Assigned role
  iat: number          // Issued-at timestamp in seconds
  exp: number          // Expiration timestamp in seconds
}

@Injectable({ providedIn: 'root' })
export class TokenStore {
    private getStorage(key: string): string | null {
        return typeof window !== 'undefined' ? sessionStorage.getItem(key) : null
    }

    private setStorage(key: string, val: string) {
        if (typeof window !== 'undefined') {
            sessionStorage.setItem(key, val)
            localStorage.removeItem(key)
        }
    }

    // Set up signals for tokens
    readonly accessToken = signal<string | null>(this.getStorage(ACCESS_TOKEN_KEY))
    readonly refreshToken = signal<string | null>(this.getStorage(REFRESH_TOKEN_KEY))

    // Automatically re-grabs when accessToken() changes
    readonly currentUser = computed<DecodedToken | null>(() => {
        const token = this.accessToken()
        if (!token) return null

        try {
            // decodes middle payload chunk (header, payload, signature)
            const payloadBase64 = token.split('.')[1]
            return JSON.parse(atob(payloadBase64)) as DecodedToken
        } catch {
            return null
        }
    })

    // Grab the user's role
    readonly userRole = computed<Role>(() => {
        const user = this.currentUser()

        // least privileged user based access
        if (!user) return 'client'
        const roleStr = (user.role || '').toLowerCase()
        if (roleStr.includes('admin')) return 'admin'
        if (roleStr.includes('reporter')) return 'reporter'
        return 'client'
    })

    // check if the token is there and not expired
    readonly isAuthenticated = computed(() => {
        const user = this.currentUser()
        if (!user) return false

        // multiply for miliseconds
        return user.exp * 1000 > Date.now()
    })

    setTokens(accessToken: string, refreshToken: string) {
        this.setStorage(ACCESS_TOKEN_KEY, accessToken)
        this.setStorage(REFRESH_TOKEN_KEY, refreshToken)
        this.accessToken.set(accessToken)
        this.refreshToken.set(refreshToken)
    }

    clear() {
        if (typeof window !== 'undefined') {
            sessionStorage.removeItem(ACCESS_TOKEN_KEY)
            sessionStorage.removeItem(REFRESH_TOKEN_KEY)
            localStorage.removeItem(ACCESS_TOKEN_KEY)
            localStorage.removeItem(REFRESH_TOKEN_KEY)
        }
        this.accessToken.set(null)
        this.refreshToken.set(null)
    }
}