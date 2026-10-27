import { Injectable, signal } from "@angular/core"

@Injectable({ providedIn: "root" })
export class ThemeService {
  private readonly darkMode = signal(this.readPreference())
  readonly isDark = this.darkMode.asReadonly()

  constructor() {
    this.applyTheme()
  }

  toggle() {
    this.darkMode.update((enabled) => !enabled)
    this.applyTheme()
    try {
      window.localStorage.setItem("veridian-theme", this.darkMode() ? "dark" : "light")
    } catch {
      // The current session still changes theme when persistent storage is unavailable.
    }
  }

  private readPreference() {
    if (typeof window === "undefined") return false
    try {
      return window.localStorage.getItem("veridian-theme") === "dark"
    } catch {
      return false
    }
  }

  private applyTheme() {
    if (typeof document !== "undefined") {
      document.documentElement.dataset["theme"] = this.darkMode() ? "dark" : "light"
    }
  }
}