import { Component, inject } from "@angular/core"
import { FormsModule } from "@angular/forms"
import { Router } from "@angular/router"
import Store from "./store"
import { Role } from "./data"
import Brand from "./brand"
import Chart from "./chart"

@Component({
  selector: "app-auth",
  standalone: true,
  imports: [FormsModule, Brand, Chart],
  template: `
    <div class="auth-page">
      <section class="auth-brand-panel"><app-brand/>
        <div class="auth-message"><span class="eyebrow">One platform. Every market.</span><h1>Invest with clarity.<br>Move with confidence.</h1><p>Track markets, manage your portfolio, and trade stocks, crypto, and forex from one workspace.</p></div>
        <div class="auth-market-card"><div><span>Market pulse</span><b>USD markets</b></div><div class="pulse-stats"><span>S&amp;P 500 <em>+0.82%</em></span><span>BTC/USD <em>+2.64%</em></span><span>EUR/USD <em>+0.28%</em></span></div><app-chart/></div>
      </section>
      <section class="auth-form-panel"><div class="mobile-brand"><app-brand/></div>
        <form class="auth-card" (ngSubmit)="submit()">
          <span class="eyebrow">{{ signup ? 'Create your account' : 'Welcome back' }}</span>
          <h2>{{ signup ? 'Start investing today' : 'Sign in to Veridian' }}</h2><p>Enter your details to access your workspace.</p>
          @if (!signup) { <div class="role-picker">@for (r of roles; track r) { <button type="button" [class.active]="role === r" (click)="role = r">{{ r }}</button> }</div> }
          @if (signup) { <label><span>Full name</span><input name="fullName" [(ngModel)]="fullName" autocomplete="name"></label><label><span>Email address</span><input name="email" type="email" [(ngModel)]="email" required autocomplete="email"></label> }
          <label><span>Username</span><input name="username" [(ngModel)]="username" required autocomplete="username" placeholder="Enter your username"></label>
          <label><span>Password</span><input name="password" [(ngModel)]="password" type="password" required minlength="4" [attr.autocomplete]="signup ? 'new-password' : 'current-password'" placeholder="At least 4 characters"></label>
          @if (error) { <div class="form-error" role="alert">{{ error }}</div> }
          <button class="primary-button auth-submit">{{ signup ? 'Create account' : 'Sign in' }}</button>
          <div class="auth-switch">{{ signup ? 'Already have an account? ' : 'New to Veridian? ' }}<button type="button" (click)="signup = !signup; error = ''">{{ signup ? 'Sign in' : 'Create an account' }}</button></div>
        </form>
      </section>
    </div>`,
})
export default class Auth {
  store = inject(Store)
  router = inject(Router)
  roles: Role[] = ["client", "reporter", "admin"]
  role: Role = "client"
  signup = false
  username = ""
  password = ""
  email = ""
  fullName = ""
  error = ""
  submit() {
    try {
      if (!this.username.trim() || this.password.length < 4)
        throw new Error(
          "Enter a username and a password of at least 4 characters.",
        )
      if (
        this.signup &&
        this.store
          .clients()
          .some((a) => a.username === this.username.trim().toLowerCase())
      )
        throw new Error("Username already exists.")
      const role = this.signup ? "client" : this.role
      this.store.login(role, this.username, this.email, this.fullName.trim())
      void this.router.navigate([role, role === "client" ? "home" : "orders"])
    } catch (error) {
      this.error = (error as Error).message
    }
  }
}
