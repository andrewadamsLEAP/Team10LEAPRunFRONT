import { Directive, inject, input, signal } from "@angular/core"

export type SortKind = "auto" | "date"
export type SortDirection = "ascending" | "descending"
type SortState = { column: string; direction: SortDirection; kind: SortKind }
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })

function sortableValue(value: unknown, kind: SortKind): string | number | null {
  if (value === null || value === undefined || value === "" || value === "—") return null
  if (kind === "date") {
    const time = value instanceof Date ? value.getTime() : Date.parse(String(value).replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T"))
    return Number.isFinite(time) ? time : null
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "boolean") return Number(value)
  if (typeof value === "string" && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) {
    const number = Number(value)
    return Number.isFinite(number) ? number : null
  }
  return typeof value === "string" ? value : null
}

@Directive({ selector: "[appSortTable]", standalone: true, exportAs: "appSortTable" })
export class TableSort {
  readonly state = signal<SortState | null>(null)

  toggle(column: string, kind: SortKind = "auto") {
    const current = this.state()
    this.state.set(current?.column !== column ? { column, kind, direction: "ascending" }
      : current.direction === "ascending" ? { column, kind, direction: "descending" } : null)
  }

  rows<T>(rows: readonly T[], accessors: Record<string, (row: T) => unknown> = {}): T[] {
    const state = this.state()
    if (!state) return [...rows]
    const value = (row: T) => {
      const raw = Object.hasOwn(accessors, state.column) ? accessors[state.column](row)
        : row !== null && typeof row === "object" ? Reflect.get(row, state.column) : null
      return sortableValue(raw, state.kind)
    }
    return rows.map((row, index) => ({ row, index, value: value(row) })).sort((left, right) => {
      // Missing data stays last in both directions; equal values retain source order.
      if (left.value === null) return right.value === null ? left.index - right.index : 1
      if (right.value === null) return -1
      const comparison = typeof left.value === "number" && typeof right.value === "number"
        ? left.value - right.value : collator.compare(String(left.value), String(right.value))
      return (state.direction === "ascending" ? comparison : -comparison) || left.index - right.index
    }).map(({ row }) => row)
  }
}

@Directive({
  selector: "[appSortColumn]",
  standalone: true,
  host: {
    class: "sortable-column",
    role: "columnheader",
    tabindex: "0",
    "[attr.aria-sort]": "direction()",
    "[attr.title]": "hint()",
    "[attr.aria-label]": "hint()",
    "(click)": "activate()",
    "(keydown)": "onKeydown($event)",
  },
})
export class SortColumn {
  private readonly table = inject(TableSort)
  readonly appSortColumn = input.required<string>()
  readonly sortKind = input<SortKind>("auto")
  readonly sortLabel = input.required<string>()
  direction() {
    const state = this.table.state()
    return state?.column === this.appSortColumn() ? state.direction : "none"
  }
  hint() {
    const next = this.direction() === "none" ? "sort ascending" : this.direction() === "ascending" ? "sort descending" : "restore original order"
    return `${this.sortLabel()}: ${next}`
  }
  activate() { this.table.toggle(this.appSortColumn(), this.sortKind()) }
  onKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      this.activate()
    }
  }
}
