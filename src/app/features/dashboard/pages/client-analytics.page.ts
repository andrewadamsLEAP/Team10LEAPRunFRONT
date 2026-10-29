import { Component } from "@angular/core"
import AnalyticsWorkspace from "../../analytics/analytics-workspace.component"

@Component({
  selector: "app-client-analytics-page",
  standalone: true,
  imports: [AnalyticsWorkspace],
  template: `<app-analytics-workspace audience="client" />`,
})
export default class ClientAnalyticsPage {}
