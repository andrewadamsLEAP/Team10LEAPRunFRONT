export type ChartSample = { timestamp: string; price: number }

/** Average interior buckets, retaining exact first/latest values. */
export function reduceChartSeries(samples: ChartSample[], limit = 256): ChartSample[] {
  const points = [...new Map(samples
    .filter((point) => Number.isFinite(point.price) && Number.isFinite(Date.parse(point.timestamp)))
    .map((point) => [Date.parse(point.timestamp), point])).values()]
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
  if (points.length <= limit) return points
  const interior = points.slice(1, -1)
  const buckets = Array.from({ length: limit - 2 }, (_, index) => {
    const start = Math.floor(index * interior.length / (limit - 2))
    const end = Math.floor((index + 1) * interior.length / (limit - 2))
    const bucket = interior.slice(start, end)
    return {
      timestamp: new Date(bucket.reduce((sum, point) => sum + Date.parse(point.timestamp), 0) / bucket.length).toISOString(),
      price: bucket.reduce((sum, point) => sum + point.price, 0) / bucket.length,
    }
  })
  return [points[0], ...buckets, points[points.length - 1]]
}

export function chartCoordinates(samples: ChartSample[]): string {
  const points = reduceChartSeries(samples)
  if (!points.length) return ""
  if (points.length === 1) return "15,100 685,100"
  const smoothed = points.map((point, index) => {
    if (!index || index === points.length - 1) return point.price
    const window = points.slice(Math.max(0, index - 2), index + 3)
    return window.reduce((sum, value) => sum + value.price, 0) / window.length
  })
  const minimum = Math.min(...smoothed)
  const maximum = Math.max(...smoothed)
  const padding = Math.max((maximum - minimum) * .15, Math.abs(maximum) * .0005, .000001)
  const first = Date.parse(points[0].timestamp)
  const duration = Date.parse(points[points.length - 1].timestamp) - first
  return points.map((point, index) => {
    const x = 15 + (Date.parse(point.timestamp) - first) / duration * 670
    const y = 175 - (smoothed[index] - minimum + padding) / (maximum - minimum + padding * 2) * 150
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(" ")
}