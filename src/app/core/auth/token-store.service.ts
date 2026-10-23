import { Injectable, signal, computed } from '@angular/core'
import { Role } from '../models/data'

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
    private readonly ACCESS_TOKEN_KEY = 'v_access_token'
    private readonly REFRESH_TOKEN_KEY = 'v_refresh_token'
    private readonly ACCESS_EXPIRY_KEY = 'v_access_token_expires_at'
    private readonly REFRESH_EXPIRY_KEY = 'v_refresh_token_expires_at'

    private getStorage(key: string): string | null {
        return typeof window !== 'undefined' ? sessionStorage.getItem(key) : null
    }

    private setStorage(key: string, val: string) {
        if (typeof window !== 'undefined') sessionStorage.setItem(key, val)
    }

    // Set up signals for tokens
    readonly accessToken = signal<string | null>(this.getStorage(this.ACCESS_TOKEN_KEY))
    readonly refreshToken = signal<string | null>(this.getStorage(this.REFRESH_TOKEN_KEY))
    readonly accessTokenExpiresAt = signal<number | null>(
        this.readExpiry(this.ACCESS_EXPIRY_KEY) ?? this.tokenExpiry(this.getStorage(this.ACCESS_TOKEN_KEY)),
    )
    readonly refreshTokenExpiresAt = signal<number | null>(
        this.readExpiry(this.REFRESH_EXPIRY_KEY) ?? this.tokenExpiry(this.getStorage(this.REFRESH_TOKEN_KEY)),
    )
    private readonly clock = signal(Math.floor(Date.now() / 1000))
    readonly accessSecondsRemaining = computed(() => this.secondsRemaining(this.accessTokenExpiresAt()))
    readonly refreshSecondsRemaining = computed(() => this.secondsRemaining(this.refreshTokenExpiresAt()))

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

    constructor() {
        if (typeof window !== 'undefined') {
            window.setInterval(() => this.clock.set(Math.floor(Date.now() / 1000)), 1000)
        }
    }

    setTokens(
        accessToken: string,
        refreshToken: string,
        accessTokenExpiresAt?: number | string | null,
        refreshTokenExpiresAt?: number | string | null,
    ) {
        this.setStorage(this.ACCESS_TOKEN_KEY, accessToken)
        this.setStorage(this.REFRESH_TOKEN_KEY, refreshToken)
        this.accessToken.set(accessToken)
        this.refreshToken.set(refreshToken)
        this.setExpiry(this.ACCESS_EXPIRY_KEY, this.accessTokenExpiresAt, accessTokenExpiresAt, accessToken)
        this.setExpiry(this.REFRESH_EXPIRY_KEY, this.refreshTokenExpiresAt, refreshTokenExpiresAt, refreshToken)
    }

    clear() {
        if (typeof window !== 'undefined') {
            sessionStorage.removeItem(this.ACCESS_TOKEN_KEY)
            sessionStorage.removeItem(this.REFRESH_TOKEN_KEY)
            sessionStorage.removeItem(this.ACCESS_EXPIRY_KEY)
            sessionStorage.removeItem(this.REFRESH_EXPIRY_KEY)
        }
        this.accessToken.set(null)
        this.refreshToken.set(null)
        this.accessTokenExpiresAt.set(null)
        this.refreshTokenExpiresAt.set(null)
    }

    private readExpiry(key: string): number | null {
        const expiry = Number(this.getStorage(key))
        return Number.isFinite(expiry) && expiry > 0 ? expiry : null
    }

    private setExpiry(
        key: string,
        state: ReturnType<typeof signal<number | null>>,
        providedExpiry: number | string | null | undefined,
        token: string,
    ) {
        const parsedExpiry = providedExpiry === null || providedExpiry === undefined
            ? null
            : Number(providedExpiry)
        const expiry = parsedExpiry !== null && Number.isFinite(parsedExpiry) && parsedExpiry > 0
            ? parsedExpiry
            : this.tokenExpiry(token)

        if (expiry === null) {
            if (typeof window !== 'undefined') sessionStorage.removeItem(key)
        } else {
            this.setStorage(key, String(expiry))
        }
        state.set(expiry)
    }

    private tokenExpiry(token: string | null): number | null {
        if (!token) return null
        try {
            const payload = JSON.parse(atob(token.split('.')[1])) as { exp?: number }
            return typeof payload.exp === 'number' ? payload.exp : null
        } catch {
            return null
        }
    }

    private secondsRemaining(expiry: number | null): number | null {
        return expiry === null ? null : Math.max(0, expiry - this.clock())
    }
}