import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import ts from "typescript"

const source = await readFile(new URL("../src/app/shared/analytics/analytics-value.component.ts", import.meta.url), "utf8")
const { outputText } = ts.transpileModule(
  source.slice(source.indexOf("export default class")).replace("export default ", ""),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } },
)
const Component = new Function("input", `${outputText}\nreturn AnalyticsValueComponent`)((value) => () => value)
const component = new Component()
const originalTimezone = process.env.TZ
try {
  for (const timezone of ["UTC", "America/New_York", "Asia/Kolkata"]) {
    process.env.TZ = timezone
    const expected = new Date("2026-10-28T16:07:09.656Z").toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short",
    })
    for (const timestamp of [
      "2026-10-28 16:07:09.656048+00:00",
      "2026-10-28T16:07:09.656048Z",
      "2026-10-28T21:37:09.656048+05:30",
    ]) {
      assert.equal(component.display(timestamp, "price_timestamp"), expected)
      assert.equal(component.display(timestamp, "created_at"), expected)
      assert.equal(component.display(timestamp, "ticker"), timestamp)
    }
    assert.equal(component.display("2026-10-28", "period"), "2026-10-28")
    assert.equal(component.display("2026-10-28 16:07:09", "price_timestamp"), "2026-10-28 16:07:09")
    assert.equal(component.display(null, "price_timestamp"), "—")
    assert.equal(component.display("2026-99-28T16:07:09Z", "price_timestamp"), "Invalid timestamp")
    assert.equal(component.display(527.46, "current_price"), (527.46).toLocaleString(undefined, {
      style: "currency", currency: "USD", maximumFractionDigits: 2,
    }))
  }
} finally {
  if (originalTimezone === undefined) delete process.env.TZ
  else process.env.TZ = originalTimezone
}
console.log("Analytics value tests passed: warehouse timestamps, offsets, local timezones, missing/invalid dates, and unchanged prices.")
