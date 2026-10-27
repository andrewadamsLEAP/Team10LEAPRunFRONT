import { Component, computed, effect, input, output, signal } from "@angular/core"
import type { ReportResult } from "../../core/api/analytics-report-state"
import { presentAnalytics, type ReportMetric } from "../../core/api/analytics-presentation"
import AnalyticsValueComponent from "./analytics-value.component"
import AnalyticsChart from "./analytics-chart.component"

@Component({
  selector: "app-analytics-card",
  standalone: true,
  imports: [AnalyticsValueComponent, AnalyticsChart],
  template: `
    <section [attr.aria-busy]="report().loading">
      <header><h2>{{ report().title }}</h2><p>{{ report().description }}</p></header>
      @if (report().loading) { <p class="status" role="status">Loading report…</p> }
      @else if (report().error) {
        <p class="error" role="alert">{{ report().error }}</p>
        <button type="button" (click)="retry.emit(report().id)">Retry report</button>
      }
      @else if (url()) {
        <img [src]="url()" [alt]="report().title" (error)="imageError.set(true)" />
        @if (imageError()) { <p class="error" role="alert">The chart image could not be displayed. Try refreshing the report.</p> }
      }
      @else if (report().data !== null) {
        @if (view().metrics.length) {
          <dl class="metrics">@for (metric of view().metrics; track metric.label) {
            <div><dt>{{ metric.label }}</dt><dd>{{ formatMetric(metric) }}</dd></div>
          }</dl>
        }
        @if (view().emptyMessage) { <p class="status" role="status">{{ view().emptyMessage }}</p> }
        @if (view().chart; as chart) { <app-analytics-chart [chart]="chart" [description]="report().title" /> }
        @if (hasTable()) { <app-analytics-value [value]="view().table" /> }
        @for (note of view().notes; track note) { <p class="note">{{ note }}</p> }
      }
      @else { <p class="status">No data available.</p> }
    </section>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    section { height: 100%; background: white; border: 1px solid var(--line, #dde6e1); border-radius: 12px; overflow: hidden; }
    header { padding: 18px 20px; border-bottom: 1px solid #e3ece6; }
    h2 { margin: 0 0 6px; font-size: 16px; color: #193b2d; }
    header p, .status, .error { margin: 0; font-size: 12px; line-height: 1.6; color: #617269; }
    .status, .error { padding: 20px; } .error { color: #b42318; background: #fff8f6; }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; padding: 20px; margin: 0; background: #f6faf7; }
    dt { font-size: 11px; color: #617269; margin-bottom: 7px; } dd { font-size: 20px; margin: 0; font-weight: 600; color: #193b2d; }
    .note { padding: 8px 20px; font-size: 11px; line-height: 1.6; color: #617269; overflow-wrap: anywhere; }
    button { margin: 0 20px 20px; padding: 9px 14px; background: #16835e; color: white; border: 0; border-radius: 6px; cursor: pointer; }
    img { display: block; width: 100%; max-height: 430px; object-fit: contain; }
    :host-context(html[data-theme="dark"]) section { background: #18221d; border-color: #2b3a32; }
    :host-context(html[data-theme="dark"]) header { border-color: #2b3a32; }
    :host-context(html[data-theme="dark"]) h2,
    :host-context(html[data-theme="dark"]) dd { color: #e2ebe5; }
    :host-context(html[data-theme="dark"]) header p,
    :host-context(html[data-theme="dark"]) .status,
    :host-context(html[data-theme="dark"]) dt,
    :host-context(html[data-theme="dark"]) .note { color: #a4b2a9; }
    :host-context(html[data-theme="dark"]) .metrics { background: #141d18; }
    :host-context(html[data-theme="dark"]) .error { background: #352326; color: #f0a3a6; }
  `],
})
export default class AnalyticsCard {
  report = input.required<ReportResult>()
  retry = output<string>()
  readonly url = signal("")
  readonly imageError = signal(false)
  readonly view = computed(() => presentAnalytics(this.report().id, this.report().data, this.report().metric))
  readonly hasTable = computed(() => {
    const table = this.view().table
    return table !== null && (!Array.isArray(table) || table.length > 0)
  })
  formatMetric(metric: ReportMetric) {
    if (metric.value === null) return "Unavailable"
    const formatted = metric.value.toLocaleString(undefined, metric.format === "money"
      ? { style: "currency", currency: "USD", maximumFractionDigits: 2 }
      : { maximumFractionDigits: 2 })
    return metric.format === "percent" ? `${formatted}%` : formatted
  }
  constructor() {
    effect((onCleanup) => {
      const image = this.report().image
      this.imageError.set(false)
      if (!image) { this.url.set(""); return }
      const url = URL.createObjectURL(image)
      this.url.set(url)
      onCleanup(() => URL.revokeObjectURL(url))
    })
  }
}