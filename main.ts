import { Component, provideZonelessChangeDetection } from "@angular/core"
import { bootstrapApplication } from "@angular/platform-browser"
import { provideRouter, RouterOutlet, withHashLocation } from "@angular/router"
import { routes } from "./routes"

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
  ],
}).catch(console.error)
