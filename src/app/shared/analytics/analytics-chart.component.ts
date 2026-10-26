import { Component, computed, input } from "@angular/core"
import type { ReportChart } from "../../core/api/analytics-presentation"

@Component({
  selector: "app-analytics-chart",
  standalone: true,
  host: { "[class.portfolio-theme]": "appearance() === 'portfolio'" },
  template: `
    <figure>
      @if (chart().kind === 'pie') {
        <div class="pie-layout">
          <div class="pie" [style.background]="pieBackground()" role="img" [attr.aria-label]="pieDescription()"></div>
          <ul class="legend">@for (slice of slices(); track $index) {
            <li><span class="swatch" [style.background]="slice.color"></span><span>{{ slice.label }}</span>
              <strong>{{ slice.percent.toFixed(2) }}%</strong><span>{{ format(slice.value) }}</span></li>
          }</ul>
        </div>
      } @else if (chart().kind === 'bars') {
        @for (point of points(); track $index) {
          <div class="bar-label"><span>{{ point.label }}</span><strong>{{ format(point.value) }}</strong></div>
          <div class="bar-track" role="img" [attr.aria-label]="point.label + ': ' + format(point.value)">
            <div class="bar-fill" [style.width.%]="point.fraction * 100"></div>
          </div>
        }
      } @else {
        <svg viewBox="0 0 700 230" role="img" [attr.aria-label]="description()" preserveAspectRatio="xMidYMid meet">
          <path d="M30 20H680M30 80H680M30 140H680M30 200H680" class="grid" />
          @if (appearance() === 'portfolio' && points().length > 1) {
            <polygon [attr.points]="area()" class="area" />
          }
          <polyline [attr.points]="line()" fill="none" class="line" />
          @for (point of points(); track $index) {
            <circle [attr.cx]="point.x" [attr.cy]="point.y" r="4"><title>{{ point.label }}: {{ format(point.value) }}</title></circle>
          }
        </svg>
        <figcaption><span>{{ axisLabel(chart().labels[0]) }}</span><span>{{ axisLabel(chart().labels[chart().labels.length - 1]) }}</span></figcaption>
        <details><summary>View chart values</summary><table><thead><tr><th>Time / period</th><th>Value</th></tr></thead>
          <tbody>@for (point of points(); track $index) { <tr><td>{{ point.label }}</td><td>{{ format(point.value) }}</td></tr> }</tbody></table></details>
      }
    </figure>
  `,
  styles: [`
    figure { margin: 0; padding: 20px; } svg { display: block; width: 100%; min-height: 140px; }
    .grid { stroke: #dce7e0; stroke-dasharray: 4 5; } .line { stroke: #16835e; stroke-width: 3; }
    circle { fill: white; stroke: #16835e; stroke-width: 2; }
    .bar-label, figcaption { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; color: #526c5e; }
    .bar-label { text-transform: capitalize; margin: 10px 0 6px; }
    .bar-track { height: 13px; border-radius: 8px; background: #edf4ef; overflow: hidden; }
    .bar-fill { height: 100%; background: #16835e; border-radius: inherit; }
    figcaption { margin-top: 10px; font-size: 10px; }
    .pie-layout { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 24px; }
    .pie { width: min(230px, 100%); aspect-ratio: 1; border-radius: 50%; flex-shrink: 0; }
    .legend { list-style: none; margin: 0; padding: 0; flex: 1 1 180px; }
    .legend li { display: grid; grid-template-columns: 12px 1fr auto; gap: 8px; padding: 10px 0; font-size: 12px; text-transform: capitalize; }
    .legend li > span:last-child { grid-column: 2 / -1; color: #617269; }
    .swatch { width: 12px; height: 12px; border-radius: 3px; }
    details { font-size: 11px; margin-top: 12px; max-height: 240px; overflow: auto; } summary { cursor: pointer; color: #526c5e; }
    table { width: 100%; border-collapse: collapse; } th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e3ece6; }
    .area { fill: #b0f2cb; opacity: .1; }
    :host(.portfolio-theme) { display: block; min-width: 0; }
    :host(.portfolio-theme) figure { padding: 16px 0 0; }
    :host(.portfolio-theme) svg { min-height: 160px; }
    :host(.portfolio-theme) .grid { stroke: #d4efdf18; stroke-dasharray: 3 7; }
    :host(.portfolio-theme) .line { stroke: #b8f5cd; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
    :host(.portfolio-theme) circle { fill: #164e37; stroke: #c7ffdd; stroke-width: 2; }
    :host(.portfolio-theme) figcaption { padding: 0 10px; color: #b0d4bf; font-size: 10px; }
    :host(.portfolio-theme) details { margin: 12px 10px 0; color: #d2ecdd; }
    :host(.portfolio-theme) summary { color: #b0d4bf; font-size: 10px; }
    :host(.portfolio-theme) th, :host(.portfolio-theme) td { color: #d2ecdd; border-color: #d4efdf20; }
  `],
})
export default class AnalyticsChart {
  chart = input.required<ReportChart>()
  description = input.required<string>()
  appearance = input<"default" | "portfolio">("default")
  readonly slices = computed(() => {
    const total = this.chart().values.reduce((sum, value) => sum + Math.max(0, value), 0)
    const colors = ["#16835e", "#477bc5", "#e3a126", "#9173bd", "#d57563"]
    let start = 0
    return this.chart().values.map((value, index) => {
      const percent = total ? Math.max(0, value) / total * 100 : 0
      const slice = { label: this.chart().labels[index], value, percent, start, end: start + percent, color: colors[index % colors.length] }
      start += percent
      return slice
    })
  })
  readonly pieBackground = computed(() => `conic-gradient(${this.slices().map((slice) => `${slice.color} ${slice.start}% ${slice.end}%`).join(", ")})`)
  readonly pieDescription = computed(() => `${this.description()}: ${this.slices().map((slice) => `${slice.label} ${slice.percent.toFixed(2)}%`).join(", ")}`)
  readonly points = computed(() => {
    const chart = this.chart()
    const max = Math.max(...chart.values, 1)
    const min = Math.min(...chart.values, 0)
    const timestamps = chart.labels.map(Date.parse)
    const useTime = chart.timeBased && timestamps.every(Number.isFinite)
    const start = Math.min(...timestamps)
    const end = Math.max(...timestamps)
    return chart.values.map((value, index) => ({
      label: chart.labels[index], value, fraction: Math.max(0, value) / max,
      x: chart.values.length === 1 || (useTime && end === start) ? 355
        : 30 + (useTime ? (timestamps[index] - start) / (end - start) : index / (chart.values.length - 1)) * 650,
      y: 200 - (value - min) / (max - min) * 180,
    }))
  })
  readonly line = computed(() => this.points().map((point) => `${point.x},${point.y}`).join(" "))
  readonly area = computed(() => {
    const points = this.points()
    return points.length > 1 ? `${points[0].x},200 ${this.line()} ${points[points.length - 1].x},200` : ""
  })
  axisLabel(value: string | undefined) {
    if (!value) return ""
    const date = new Date(value)
    if (this.appearance() !== "portfolio" || !Number.isFinite(date.getTime())) return value
    const first = new Date(this.chart().labels[0])
    const last = new Date(this.chart().labels[this.chart().labels.length - 1])
    return first.toDateString() === last.toDateString()
      ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
      : date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  }
  format(value: number) {
    return this.chart().format === "money"
      ? value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 })
      : value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
}