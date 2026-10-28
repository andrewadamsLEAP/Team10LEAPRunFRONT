import { Component, DestroyRef, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { bootstrapApplication } from "@angular/platform-browser"
import { NavigationEnd, Router, RouterOutlet } from "@angular/router"
import { filter } from "rxjs"
import { appConfig } from "./app/app.config"
import ChatbertComponent from "./app/shared/chatbert/chatbert.component"
import { ThemeService } from "./app/core/theme/theme.service"


@Component({
  selector: "app-root",
  standalone: true,
  imports: [RouterOutlet, ChatbertComponent],
  template: `<router-outlet/>@if (showChatbert()) { <app-chatbert/> }`,
})
export default class App {
  private readonly theme = inject(ThemeService)
  private readonly router = inject(Router)
  private readonly destroyRef = inject(DestroyRef)
  private readonly currentUrl = signal(this.router.url)

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => this.currentUrl.set(event.urlAfterRedirects))
  }

  showChatbert() {
    const path = this.currentUrl().split(/[?#]/, 1)[0]
    return path === "/login" || path === "/signup" || path.startsWith("/client/") || path === "/client"
  }
}

bootstrapApplication(App, appConfig).catch(console.error)