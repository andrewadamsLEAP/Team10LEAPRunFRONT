import { Component, provideZonelessChangeDetection } from "@angular/core"
import { bootstrapApplication } from "@angular/platform-browser"
import { provideRouter, RouterOutlet, withHashLocation } from "@angular/router"
import { provideHttpClient, withInterceptors } from "@angular/common/http"
import { routes } from "./app/app.routes"
import { authInterceptor } from "./app/core/auth/auth.interceptor"
import { BASE_PATH } from "./app/core/api/auth"


@Component({
  selector: "app-root",
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet/>`,
})
export default class App {}

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