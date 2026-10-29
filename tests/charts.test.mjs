import assert from "node:assert/strict"
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import ts from "typescript"
import "@angular/compiler"
import { createEnvironmentInjector, Injector, runInInjectionContext, SimpleChange } from "@angular/core"
import { of } from "rxjs"

const temporary = await mkdtemp(join(process.cwd(), ".veridian-test-"))
try {
  for (const name of ["chart-series", "price-chart.component"]) {
    const source = await readFile(new URL(`../src/app/shared/charts/${name}.ts`, import.meta.url), "utf8")
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, experimentalDecorators: true },
    })
    await writeFile(join(temporary, `${name}.mjs`), outputText
      .replaceAll('"./chart-series"', '"./chart-series.mjs"')
      .replaceAll('"../../core/api/market-data.service"', '"./api.mjs"'))
  }
  await writeFile(join(temporary, "api.mjs"), "export class MarketDataService {}")
  const { reduceChartSeries, chartCoordinates } = await import(pathToFileURL(join(temporary, "chart-series.mjs")))
  const now = Date.now()
  const samples = Array.from({ length: 10000 }, (_, index) => ({
    timestamp: new Date(now - (10000 - index) * 1000).toISOString(),
    price: 200 + Math.sin(index) + index / 10000,
  }))
  const reduced = reduceChartSeries(samples)
  assert.equal(reduced.length, 256)
  assert.deepEqual(reduced[0], samples[0])
  assert.deepEqual(reduced.at(-1), samples.at(-1))
  assert.equal(reduceChartSeries([...samples, samples.at(-1)]).length, 256)
  assert.equal(chartCoordinates(samples).split(" ").length, 256)
  assert.doesNotMatch(chartCoordinates(samples), /NaN|Infinity/)
  assert.equal(chartCoordinates([]), "")
  assert.doesNotMatch(chartCoordinates([samples[0], { ...samples[0] }]), /NaN|Infinity/)

  const { MarketDataService } = await import(pathToFileURL(join(temporary, "api.mjs")))
  const { default: Chart } = await import(pathToFileURL(join(temporary, "price-chart.component.mjs")))
  const calls = []
  const injector = createEnvironmentInjector([{ provide: MarketDataService, useValue: {
    getPriceHistory: (...args) => { calls.push(args); return of(samples) },
  } }], Injector.NULL)
  const chart = runInInjectionContext(injector, () => new Chart())
  chart.ticker = "AAPL"
  chart.ngOnChanges({ ticker: new SimpleChange("", "AAPL", true) })
  assert.equal(calls.length, 1, "History loads immediately")
  assert.ok(chart.points())
  assert.equal(chart.loading(), false)
  chart.livePrice = 205
  chart.liveTimestamp = new Date(now).toISOString()
  chart.ngOnChanges({ livePrice: new SimpleChange(null, 205, false) })
  assert.equal(calls.length, 1, "Live quote must not refetch history")
  assert.ok(chart.points().split(" ").length <= 256)
  chart.period = "1D"
  chart.ngOnChanges({ period: new SimpleChange("1M", "1D", false) })
  assert.equal(calls.length, 2, "Period changes fetch history once")
  assert.equal(calls[1][2].getTime() - calls[1][1].getTime(), 86400000)
  chart.ngOnDestroy()
  injector.destroy()
  console.log("Passed: chart 256-point reduction, smoothing, immediate loading, period selection, and HTTP-free live updates.")
} finally {
  await rm(temporary, { recursive: true, force: true })
}