import { Component, inject, signal } from "@angular/core"
import { HttpClient } from "@angular/common/http"
// Import ReactiveFormsModule and form building tools
import { ReactiveFormsModule, FormBuilder, Validators } from "@angular/forms"
import { Router } from "@angular/router"
import Store from "../../../core/state/portfolio.store"
import { TokenStore } from "../../../core/auth/token-store.service"
import { ThemeService } from "../../../core/theme/theme.service"
import { Role } from "../../../core/models/data"
import Brand from "../../../shared/brand/brand.component"
import Chart from "../../../shared/charts/price-chart.component"

import { BASE_PATH } from "../../../core/api/auth"

@Component({
  selector: "app-auth",
  standalone: true,
  imports: [ReactiveFormsModule, Brand, Chart],
  template: `
    <div class="auth-page">
      <section class="auth-brand-panel">
        <app-brand/>
        <div class="auth-message">
          <h1>Simplified investing for stocks, crypto, and forex.</h1>
          <p>Follow markets, check your portfolio, and manage trades from one workspace.</p>
        </div>
        <div class="auth-market-card">
          <div><span>Market pulse</span><b>USD markets</b></div>
          <div class="pulse-stats">
            <span>S&amp;P 500 <em>+0.82%</em></span>
            <span>BTC-USD <em>+2.64%</em></span>
            <span>EUR-USD <em>+0.28%</em></span>
          </div>
          <app-chart ticker="AAPL" period="1D"/>
          <ul class="login-tickers" aria-label="Featured companies">
            <li><img src="assets/tickers/apple.png" alt="Apple" width="32" height="32"><span>AAPL</span></li>
            <li><img src="assets/tickers/amazon.png" alt="Amazon" width="32" height="32"><span>AMZN</span></li>
            <li><img src="assets/tickers/google.png" alt="Google" width="32" height="32"><span>GOOGL</span></li>
            <li><img src="assets/tickers/microsoft.png" alt="Microsoft" width="32" height="32"><span>MSFT</span></li>
          </ul>
        </div>
      </section>
      <section class="auth-form-panel">
        <button class="theme-toggle auth-theme-toggle" type="button" [attr.aria-label]="theme.isDark() ? 'Switch to light mode' : 'Switch to dark mode'" [attr.title]="theme.isDark() ? 'Switch to light mode' : 'Switch to dark mode'" (click)="theme.toggle()"><span aria-hidden="true">{{ theme.isDark() ? '☀' : '☾' }}</span></button>
        <div class="mobile-brand"><app-brand/></div>
        <form class="auth-card" [formGroup]="authForm" (ngSubmit)="submit()">
          <span class="eyebrow">{{ signup() ? 'Create your account' : 'Welcome back' }}</span>
          <h2>{{ signup() ? 'Start investing today' : 'Sign in to Veridian' }}</h2>
          <p>Enter your details to access your workspace.</p>
          @if (!signup()) {
            <div class="role-picker">
              @for (r of roles; track r) {
                <button type="button" [class.active]="selectedRole() === r" (click)="selectedRole.set(r)">{{ r }}</button>
              }
            </div>
          }
          @if (signup()) {
            <div class="auth-name-fields">
              <label><span>First name</span><input formControlName="firstName" autocomplete="given-name"></label>
              <label><span>Last name</span><input formControlName="lastName" autocomplete="family-name"></label>
            </div>
            <label><span>Email address</span><input formControlName="email" type="email" autocomplete="email"></label>
          }
          <label><span>Username</span><input formControlName="username" autocomplete="username" placeholder="Enter your username"></label>
          <label><span>Password</span><input formControlName="password" type="password" [placeholder]="signup() ? 'At least 12 characters' : 'Enter your password'"></label>
          @if (error()) { <div class="form-error" role="alert">{{ error() }}</div> }
          <button class="primary-button auth-submit" [disabled]="loading()">{{ loading() ? 'Connecting...' : (signup() ? 'Create account' : 'Sign in') }}</button>
          <div class="auth-switch">
            {{ signup() ? 'Already have an account? ' : 'New to Veridian? ' }}
            <button type="button" (click)="toggleMode()">{{ signup() ? 'Sign in' : 'Create an account' }}</button>
          </div>
        </form>
      </section>
    </div>
  `
})
export default class Auth {
  // Dependency injection
  private readonly fb = inject(FormBuilder)
  private readonly http = inject(HttpClient)
  private readonly apiBasePath = inject(BASE_PATH)
  private readonly router = inject(Router)
  private readonly tokenStore = inject(TokenStore)
  readonly theme = inject(ThemeService)
  private readonly store = inject(Store)

  roles: Role[] = ["client", "reporter", "admin"]
  selectedRole = signal<Role>("client")
  signup = signal(this.router.url === "/signup")
  loading = signal(false)
  error = signal("")

  // Define the reactive form structure with initial validation rules
  authForm = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50)]],
    password: ['', [Validators.required, Validators.minLength(4)]],
    email: ['', [Validators.email]],
    firstName: [''],
    lastName: [''],
  })

  constructor() {
    this.updateModeValidators()
  }

  // Dynamically swap password & email rules when toggling between sign-in and sign-up
  toggleMode() {
    this.signup.update((v: boolean) => !v)
    this.error.set("")
    void this.router.navigate([this.signup() ? "/signup" : "/login"])
    this.updateModeValidators()
  }

  private updateModeValidators() {
    const passCtrl = this.authForm.get('password')
    const emailCtrl = this.authForm.get('email')

    if (this.signup()) {
      passCtrl?.setValidators([Validators.required, Validators.minLength(12)])
      emailCtrl?.setValidators([Validators.required, Validators.email])
    } else {
      passCtrl?.setValidators([Validators.required, Validators.minLength(4)])
      emailCtrl?.clearValidators()
    }
    passCtrl?.updateValueAndValidity()
    emailCtrl?.updateValueAndValidity()
  }

  submit() {
    if (this.authForm.invalid) {
      this.error.set("Please provide valid form inputs.")
      return
    }

    const { username, password, email, firstName, lastName } = this.authForm.getRawValue()
    this.loading.set(true)
    this.error.set("")

    if (this.signup()) {
      // Call the generated NestJS signup API that returns RxJS Observable
      // observable is basically a better promise for FE since it's a stream of events
      // and can factor in user edge cases like exiting off mid sign in or smthn
      this.http.post(`${this.apiBasePath}/auth/signup`, {
        email: email!,
        username: username!,
        password: password!,
        first_name: firstName || undefined,
        last_name: lastName || undefined,
      }).subscribe({
        next: () => {
          //login if its chill
          this.executeLogin(username!, password!, 'client')
        },
        error: (err: any) => {
          this.loading.set(false)
          // display err msg
          this.error.set(err.error?.message || "Registration failed. Username or email may already be taken.")
        }
      })
    } else {
      this.executeLogin(username!, password!, this.selectedRole())
    }
  }

  private executeLogin(identifier: string, pass: string, role: Role) {
    // Determine whether to call client login or employee login based on role picker
    const endpoint = role === 'client' ? '/auth/login' : '/auth/employee/login'
    const loginObs = this.http.post<any>(`${this.apiBasePath}${endpoint}`, {
      username: identifier,
      password: pass,
    })

    loginObs.subscribe({
      next: (res: any) => {
        this.loading.set(false)
        
        // Saving jwt tokens in token store
        this.tokenStore.setTokens(
          res.access_token,
          res.refresh_token,
          res.access_token_expires_at,
          res.refresh_token_expires_at,
        )

        // Sync session in portfolio.store.ts
        const resolvedRole = this.tokenStore.userRole()
        this.store.clearClientProfile()
        this.store.session.set({ role: resolvedRole, username: identifier })
        if (resolvedRole === "client") {
          this.store.loadHoldings()
          this.store.loadClientTransactions()
        }
        this.store.startMarketDataPolling()

        // Navigate to user's dashboard
        void this.router.navigate([resolvedRole, resolvedRole === 'client' ? 'home' : 'orders'])
      },
      error: (err: any) => {
        this.loading.set(false)
        this.error.set(err.error?.message || "Invalid credentials or account is already active in another session.")
      }
    })
  }
}