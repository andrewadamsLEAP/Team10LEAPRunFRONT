import { Component, DestroyRef, inject, provideZonelessChangeDetection, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { bootstrapApplication } from "@angular/platform-browser"
import { NavigationEnd, provideRouter, Router, RouterOutlet, withHashLocation } from "@angular/router"
import { provideHttpClient, withInterceptors } from "@angular/common/http"
import { filter, takeUntil } from "rxjs"
import { routes } from "./app/app.routes"
import { authInterceptor } from "./app/core/auth/auth.interceptor"
import { BASE_PATH } from "./app/core/api/auth"
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

bootstrapApplication(App, {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, withHashLocation()),
    provideHttpClient(
      withInterceptors([authInterceptor])
    ),
    { provide: BASE_PATH, useValue: '/api' },
  ],
}).catch(console.error)