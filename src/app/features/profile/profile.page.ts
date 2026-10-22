import { CurrencyPipe } from "@angular/common"
import { HttpClient, HttpErrorResponse } from "@angular/common/http"
import { Component, inject } from "@angular/core"
import { FormsModule } from "@angular/forms"
import { BASE_PATH } from "../../core/api/auth"
import { TokenStore } from "../../core/auth/token-store.service"
import Store, { ClientProfile } from "../../core/state/portfolio.store"

@Component({
  selector: "app-profile",
  standalone: true,
  imports: [CurrencyPipe, FormsModule],
  template: `
    <div class="page-wrap">
      <div class="page-intro profile-intro">
        <div>
          <span class="eyebrow">Your profile</span>
          <h1>My account</h1>
          <p>Keep your personal details up to date.</p>
        </div>
      </div>
      <section class="surface profile-surface">
        <div class="profile-heading">
          <div class="profile-avatar" aria-hidden="true">{{ initials }}</div>
          <div>
            <span class="eyebrow">Account settings</span>
            <h2>Personal details</h2>
            <p>These details are used across your Veridian account.</p>
          </div>
        </div>
        <div class="profile-readonly" aria-label="Account information">
          <div class="profile-readonly-item">
            <span>Email</span>
            <strong>{{ profileDetails?.email || '—' }}</strong>
          </div>
          <div class="profile-readonly-item">
            <span>Cash balance</span>
            <strong>{{ profileDetails?.cashAmount ?? 0 | currency: 'USD' }}</strong>
          </div>
        </div>
        <form class="profile-form" (ngSubmit)="save()" (input)="saved = false; error = ''">
          <div class="profile-fields">
            <label>
              <span>Username</span>
              <input name="username" [(ngModel)]="username" autocomplete="username" aria-describedby="username-help">
              <small id="username-help">Usernames are saved in lowercase.</small>
            </label>
            <label>
              <span>First name</span>
              <input name="firstName" [(ngModel)]="firstName" autocomplete="given-name">
            </label>
            <label>
              <span>Last name</span>
              <input name="lastName" [(ngModel)]="lastName" autocomplete="family-name">
            </label>
          </div>
          @if (error) { <div class="form-error" role="alert">{{ error }}</div> }
          @if (saved) { <p class="positive profile-status" role="status">Your account details have been updated.</p> }
          <div class="modal-actions">
            <button class="secondary-button" type="button" (click)="reset()">Cancel</button>
            <button class="primary-button" type="submit" [disabled]="saving">{{ saving ? 'Saving…' : 'Save changes' }}</button>
          </div>
        </form>
      </section>
    </div>
  `,
})
export default class Profile {
  private readonly http = inject(HttpClient)
  private readonly tokenStore = inject(TokenStore)
  private readonly apiBasePath = inject(BASE_PATH)
  readonly store = inject(Store)

  username = ""
  firstName = ""
  lastName = ""
  error = ""
  saved = false
  saving = false
  profileDetails: ClientProfile | null = null

  constructor() {
    this.reset()
    this.profileDetails = this.store.clientProfile() ?? this.profileFromStore()
    this.applyProfileFields(this.profileDetails)
    this.loadProfile()
  }

  get initials() {
    const name = `${this.firstName} ${this.lastName}`.trim() || this.username
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase()
  }

  reset() {
    const account = this.store.account
    const [first = "", ...rest] = (account?.fullName || "").trim().split(/\s+/)
    this.username = account?.username ?? ""
    this.firstName = first
    this.lastName = rest.join(" ")
    this.error = ""
    this.saved = false
  }

  private profileFromStore(): ClientProfile {
    const account = this.store.account
    const [firstName = "", ...lastNameParts] = (account?.fullName || "")
      .trim()
      .split(/\s+/)
    return {
      clientId: Number(this.tokenStore.currentUser()?.sub) || 0,
      email: account?.email ?? null,
      username: account?.username ?? null,
      firstName: account?.firstName || firstName || null,
      lastName: account?.lastName || lastNameParts.join(" ") || null,
      cashAmount: account?.cash ?? 0,
    }
  }

  private applyProfileFields(profile: ClientProfile) {
    this.username = profile.username ?? ""
    this.firstName = profile.firstName ?? ""
    this.lastName = profile.lastName ?? ""
  }

  private loadProfile() {
    const profileUrl = `${this.apiBasePath}/v1/clients/profile`
    this.http.get<ClientProfile>(profileUrl).subscribe({
      next: (profile) => {
        this.profileDetails = profile
        this.store.setClientProfile(profile)
        this.applyProfileFields(profile)
      },
      error: (error: HttpErrorResponse) => {
        this.error = this.messageFor(error)
      },
    })
  }

  save() {
    const username = this.username.trim().toLowerCase()
    const firstName = this.firstName.trim()
    const lastName = this.lastName.trim()
    const user = this.tokenStore.currentUser()
    const clientId = Number(user?.sub)

    this.error = ""
    this.saved = false
    if (!username && !firstName && !lastName) {
      this.error = "Enter a username, first name, or last name."
      return
    }
    if (!user || !Number.isSafeInteger(clientId) || clientId <= 0) {
      this.error = "Your session is missing a valid client account."
      return
    }

    this.saving = true
    const profileUrl = `${this.apiBasePath}/v1/clients/profile`
    this.http
      .patch<void>(profileUrl, {
        username: username || null,
        firstName: firstName || null,
        lastName: lastName || null,
      })
      .subscribe({
        next: () => {
          try {
            const currentProfile = this.profileDetails
            const currentUsername =
              username ||
              currentProfile?.username?.trim().toLowerCase() ||
              this.store.account?.username ||
              ""
            if (currentUsername) {
              this.store.updateProfile({
                username: currentUsername,
                firstName: firstName || this.firstName,
                lastName: lastName || this.lastName,
              })
            }
            const updatedProfile = currentProfile
              ? {
                  ...currentProfile,
                  username: currentUsername || currentProfile.username,
                  firstName: firstName || currentProfile.firstName,
                  lastName: lastName || currentProfile.lastName,
                }
              : currentProfile
            this.profileDetails = updatedProfile
            if (updatedProfile) {
              this.store.setClientProfile(updatedProfile)
            }
            this.saved = true
          } catch (error) {
            this.error = error instanceof Error ? error.message : "Unable to update your local account."
          } finally {
            this.saving = false
          }
        },
        error: (error: HttpErrorResponse) => {
          this.saving = false
          this.error = this.messageFor(error)
        },
      })
  }

  private messageFor(error: HttpErrorResponse) {
    const message = error.error?.message
    if (Array.isArray(message)) return message.join(" ")
    if (typeof message === "string" && message.trim()) return message
    if (error.status === 0) return "The account service could not be reached. Try again."
    return "Unable to update your account. Check your details and try again."
  }
}
