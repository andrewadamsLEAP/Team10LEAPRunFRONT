import { Component, Input } from "@angular/core"

@Component({
  selector: "app-chart",
  standalone: true,
  template: `<div class="price-chart"><svg viewBox="0 0 700 200" preserveAspectRatio="none" role="img" aria-label="Illustrative price history">
    <path class="grid-line" d="M0 40H700M0 100H700M0 160H700"/>
    <polyline [attr.points]="flat ? '0,120 700,120' : points" fill="none" stroke="currentColor" stroke-width="2.5" class="positive"/>
  </svg></div>`,
})
export default class Chart {
  @Input() flat = false
  @Input() period = "1M"
  get points() {
    const scale =
      this.period === "1D"
        ? 0.4
        : this.period === "1W"
          ? 0.7
          : this.period === "1Y"
            ? 1.1
            : 1
    return Array.from({ length: 25 }, (_, i) => {
      const y = 170 - i * 5.7 * scale + Math.sin(i * 2.2) * (7 + scale * 4)
      return `${(i / 24) * 700},${y}`
    }).join(" ")
  }
}
