import { Component, input } from "@angular/core"
import type { AnalyticsValue } from "../../core/api/analytics-api.service"

@Component({
  selector: "app-analytics-value",
  standalone: true,
  template: `
    @if (rows(); as records) {
      @if (records.length) {
        <div class="table-scroll" tabindex="0" role="region" aria-label="Analytics report data">
          <table><thead><tr>@for (key of columns(records); track key) { <th>{{ label(key) }}</th> }</tr></thead>
            <tbody>@for (row of records; track $index) { <tr>@for (key of columns(records); track key) {
              <td>@if (isNested(row[key])) { <app-analytics-value [value]="row[key]" /> }
                @else { {{ display(row[key], key) }} }</td>
            }</tr> }</tbody>
          </table>
        </div>
      } @else { <p class="empty">None reported.</p> }
    } @else if (isNested(value())) {
      <dl>@for (entry of entries(); track entry[0]) {
        <div><dt>{{ label(entry[0]) }}</dt><dd>
          @if (isNested(entry[1])) { <app-analytics-value [value]="entry[1]" /> }
          @else { {{ display(entry[1], entry[0]) }} }
        </dd></div>
      } @empty { <p class="empty">No data for these filters.</p> }</dl>
    } @else { <span>{{ display(value()) }}</span> }
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .table-scroll { overflow-x: auto; max-height: 480px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #e3ece6; vertical-align: top; }
    th { background: #f4f9f6; color: #526c5e; white-space: nowrap; position: sticky; top: 0; }
    td { max-width: 400px; overflow-wrap: anywhere; }
    dl { display: flex; flex-wrap: wrap; gap: 16px; margin: 0; padding: 16px; }
    dl > div { flex: 1 1 200px; min-width: 0; }
    dt { font-size: 11px; color: #617269; margin-bottom: 6px; }
    dd { margin: 0; font-size: 14px; font-weight: 600; line-height: 1.6; overflow-wrap: anywhere; }
    .empty { padding: 16px; font-size: 12px; color: #617269; }
  `],
})
export default class AnalyticsValueComponent {
  value = input<AnalyticsValue>(null)
  label(key: string) { return key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) }
  isNested(value: AnalyticsValue | undefined) { return value !== null && typeof value === "object" }
  display(value: AnalyticsValue | undefined, key = ""): string {
    if (value === null || value === undefined) return "—"
    if (typeof value === "boolean") return value ? "Yes" : "No"
    if (typeof value === "number") {
      if (/percentage|percent$/.test(key)) return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
      if (/price|market_value|gain$|cost$|amount|volume|open$|close$|day_low|day_high/.test(key)) {
        return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 })
      }
      return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
    }
    return String(value)
  }
  rows(): Record<string, AnalyticsValue>[] | null {
    const value = this.value()
    return Array.isArray(value) ? value.map((item) =>
      item !== null && typeof item === "object" && !Array.isArray(item) ? item : { value: item },
    ) : null
  }
  columns(rows: Record<string, AnalyticsValue>[]) { return [...new Set(rows.flatMap((row) => Object.keys(row)))] }
  entries(): [string, AnalyticsValue][] {
    const value = this.value()
    return value !== null && typeof value === "object" ? Object.entries(value) : []
  }
}