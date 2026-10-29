import { ApplicationConfig, provideZonelessChangeDetection } from "@angular/core"
import { provideHttpClient, withInterceptors } from "@angular/common/http"
import { provideRouter } from "@angular/router"
import { routes } from "./app.routes"
import { authInterceptor } from "./core/auth/auth.interceptor"
import { BASE_PATH } from "./core/api/auth"
import { API_V1_BASE_PATH } from "./core/api/api-endpoints"

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: BASE_PATH, useValue: API_V1_BASE_PATH },
  ],
}