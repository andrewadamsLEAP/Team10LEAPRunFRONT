import { Component } from "@angular/core"
import AnalyticsWorkspace from "../../analytics/analytics-workspace.component"

@Component({
  selector: "app-analytics",
  standalone: true,
  imports: [AnalyticsWorkspace],
  template: `<app-analytics-workspace audience="employee" />`,
})
export default class Analytics {}
