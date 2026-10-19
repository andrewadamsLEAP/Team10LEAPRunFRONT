import { Component, inject, signal } from "@angular/core"
// Import ReactiveFormsModule and form building tools
import { ReactiveFormsModule, FormBuilder, Validators } from "@angular/forms"
import { Router } from "@angular/router"
import Store from "../../../core/state/portfolio.store"
import { TokenStore } from "../../../core/auth/token-store.service"
import { Role } from "../../../core/models/data"
import Brand from "../../../shared/brand/brand.component"
import Chart from "../../../shared/charts/price-chart.component"

// the generated auth service
import { AuthService as GeneratedAuthApi } from "../../../core/api/auth"

@Component({
  selector: "app-auth",
  standalone: true,
  imports: [ReactiveFormsModule, Brand, Chart],
  template: `
    <form class="auth-card" [formGroup]="authForm" (ngSubmit)="submit()">
      <!-- Toggle mode between login and signup -->
      <span class="eyebrow">{{ signup() ? 'Create your account' : 'Welcome back' }}</span>
      <h2>{{ signup() ? 'Start investing today' : 'Sign in to Veridian' }}</h2>

      <!-- Role selector buttons -->
      @if (!signup()) {
        <div class="role-picker">
          @for (r of roles; track r) {
            <button type="button" [class.active]="selectedRole() === r" (click)="selectedRole.set(r)">
              {{ r }}
            </button>
          }
        </div>
      }

      <!-- Signup inputs -->
      @if (signup()) {
        <div style="display: flex; gap: 8px;">
          <label style="flex: 1;">
            <span>First name</span>
            <input formControlName="firstName" autocomplete="given-name">
          </label>
          <label style="flex: 1;">
            <span>Last name</span>
            <input formControlName="lastName" autocomplete="family-name">
          </label>
        </div>
        <label>
          <span>Email address</span>
          <input formControlName="email" type="email" autocomplete="email">
        </label>
      }

      <label>
        <span>Username</span>
        <input formControlName="username" autocomplete="username" placeholder="3–50 characters">
      </label>

      <label>
        <span>Password</span>
        <input formControlName="password" type="password" [placeholder]="signup() ? 'At least 12 characters' : 'Enter your password'">
      </label>

      @if (error()) {
        <div class="form-error" role="alert">{{ error() }}</div>
      }

      <button class="primary-button auth-submit" [disabled]="loading()">
        {{ loading() ? 'Connecting...' : (signup() ? 'Create account' : 'Sign in') }}
      </button>

      <div class="auth-switch">
        {{ signup() ? 'Already have an account? ' : 'New to Veridian? ' }}
        <button type="button" (click)="toggleMode()">
          {{ signup() ? 'Sign in' : 'Create an account' }}
        </button>
      </div>
    </form>
  `
})
export default class Auth {
  // Dependency injection
  private readonly fb = inject(FormBuilder)
  private readonly router = inject(Router)
  private readonly authApi = inject(GeneratedAuthApi)
  private readonly tokenStore = inject(TokenStore)
  private readonly store = inject(Store)

  roles: Role[] = ["client", "reporter", "admin"]
  selectedRole = signal<Role>("client")
  signup = signal(false)
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

  // Dynamically swap password & email rules when toggling between sign-in and sign-up
  toggleMode() {
    this.signup.update((v: boolean) => !v)
    this.error.set("")
    const passCtrl = this.authForm.get('password')
    const emailCtrl = this.authForm.get('email')

    if (this.signup()) {
      // NestJS auth controller strictly requires >= 12 chars for sign-up!
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
      this.authApi.authControllerSignup().subscribe({
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
    const loginObs = role === 'client'
      ? this.authApi.authControllerLogin()
      : this.authApi.authControllerEmployeeLogin()

    loginObs.subscribe({
      next: (res: any) => {
        this.loading.set(false)
        
        // Saving jwt tokens in token store
        this.tokenStore.setTokens(res.access_token, res.refresh_token)

        // Sync session in portfolio.store.ts
        const resolvedRole = this.tokenStore.userRole()
        this.store.session.set({ role: resolvedRole, username: identifier })

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