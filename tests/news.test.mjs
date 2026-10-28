import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { computed, signal } from "@angular/core"
import "@angular/compiler"
import { HttpErrorResponse } from "@angular/common/http"
import { of, Subject, throwError } from "rxjs"
import ts from "typescript"

const root = new URL("../src/app/", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText
const modelSource = await read("core/api/news-response.ts")
const parseNewsResponse = new Function(
  `${compile(modelSource.replaceAll("export ", ""))}\nreturn parseNewsResponse`,
)()
const item = (uuid = "1", published_at = "2026-10-27T18:00:00Z") => ({
  uuid, published_at, title: "Stocks advance", description: "Market description.",
  snippet: "Fallback snippet.", source: "example.com", entities: [{ symbol: "AAPL" }, { name: "Apple" }],
  url: "https://example.com/article", image_url: "https://example.com/image.jpg",
})
const response = (data, meta = {}) => ({ data, meta: { found: 30, returned: data.length, limit: 25, ...meta } })
const page = parseNewsResponse(response([item(), item("2", "2026-10-27T19:00:00Z"), item()]), 1, 25)
assert.deepEqual(page.articles.map((article) => article.id), ["2", "1"])
assert.equal(page.hasNext, true)
assert.equal(page.articles[0].headline, "Stocks advance")
assert.equal(page.articles[0].summary, "Market description.")
assert.equal(page.articles[0].source, "example.com")
assert.equal(page.articles[0].publishedAt, Date.parse("2026-10-27T19:00:00Z"))
assert.deepEqual(page.articles[0].entities, ["AAPL", "Apple"])
assert.equal(page.articles[0].image, "https://example.com/image.jpg")
assert.equal(page.articles[0].url, "https://example.com/article")
const fallback = parseNewsResponse(response([{
  ...item(), description: "", published_at: "invalid", url: "javascript:alert(1)",
  image_url: "https://user:password@example.com/image", entities: [{ symbol: "AAPL" }, { symbol: "AAPL" }, null],
}]), 1, 25).articles[0]
assert.equal(fallback.summary, "Fallback snippet.")
assert.equal(fallback.publishedAt, null)
assert.equal(fallback.url, null)
assert.equal(fallback.image, null)
assert.deepEqual(fallback.entities, ["AAPL"])
assert.equal(parseNewsResponse(response([], { found: 0 }), 1, 25).hasNext, false)
assert.equal(parseNewsResponse(response([item()], { found: 26 }), 2, 25).hasNext, false)
assert.equal(parseNewsResponse(response([item()], { found: 4, limit: 3 }), 1, 25).hasNext, true)
assert.deepEqual(parseNewsResponse({ data: [] }, 1, 25), { articles: [], page: 1, hasNext: false })
assert.equal(parseNewsResponse({ data: [item()] }, 1, 25).articles.length, 1)
assert.equal(parseNewsResponse({ data: Array.from({ length: 25 }, (_, i) => item(String(i))) }, 1, 25).hasNext, true)
assert.deepEqual(parseNewsResponse({ data: response([item()]) }, 1, 25), parseNewsResponse(response([item()]), 1, 25))
assert.throws(() => parseNewsResponse({ error: "Provider unavailable" }, 1, 25), /article list/)
assert.throws(() => parseNewsResponse({ data: null }, 1, 25), /article list/)
assert.throws(() => parseNewsResponse({ data: [], meta: "invalid" }, 1, 25), /metadata/)
assert.throws(() => parseNewsResponse(response([{}]), 1, 25), /ID or title/)

const serviceSource = await read("core/api/news.service.ts")
const serviceBody = serviceSource.slice(serviceSource.indexOf("export class")).replaceAll("export ", "")
const calls = []
let activeResponse = of(response([item()]))
const { NewsService, newsErrorMessage } = new Function(
  "inject", "HttpClient", "BASE_PATH", "map", "parseNewsResponse", "HttpErrorResponse",
  `${compile(serviceBody)}\nreturn { NewsService, newsErrorMessage }`,
)((key) => key === "http" ? { get: (url, options) => {
  calls.push({ url, options })
  return activeResponse
} } : "/api", "http", "base", (await import("rxjs")).map, parseNewsResponse, HttpErrorResponse)
const service = new NewsService()
let result
service.getNews().subscribe((value) => { result = value })
assert.equal(calls[0].url, "/api/v1/news")
assert.deepEqual(calls[0].options.params, { limit: "25", page: "1", language: "en" })
assert.equal(calls[0].options.timeout, 15000)
assert.equal(result.articles.length, 1)
service.getNews(2, " aapl, msft,AAPL, ").subscribe()
assert.deepEqual(calls[1].options.params, { limit: "25", page: "2", language: "en", symbols: "AAPL,MSFT" })
assert.equal(calls[1].options.context, undefined, "News must not opt out of the existing JWT interceptor")
for (const status of [401, 403, 429, 500, 0]) {
  assert.ok(newsErrorMessage(new HttpErrorResponse({ status })))
}
activeResponse = of({})
let parsingError
service.getNews().subscribe({ error: (error) => { parsingError = error } })
assert.match(parsingError.message, /article list/)

const feedSource = await read("features/news/news-feed.component.ts")
const feedClass = compile(feedSource.slice(feedSource.indexOf("export default class")).replace("export default ", ""))
function feedHarness() {
  const callbacks = []
  const cleanups = []
  let response = new Subject()
  const requests = []
  const Feed = new Function("inject", "NewsService", "signal", "computed", "input", "effect", "newsErrorMessage",
    `${feedClass}\nreturn NewsFeedComponent`,
  )(() => ({ getNews: (page, symbols) => {
    requests.push({ page, symbols })
    return response
  } }), "news", signal, computed, signal, (callback) => callbacks.push(callback), newsErrorMessage)
  const feed = new Feed()
  const run = () => {
    cleanups[1]?.()
    callbacks[1]((cleanup) => { cleanups[1] = cleanup })
  }
  callbacks[0]()
  run()
  return { feed, requests, run, callbacks, get response() { return response }, setResponse: (value) => { response = value }, destroy: () => cleanups[1]?.() }
}
const test = feedHarness()
assert.equal(test.feed.loading(), true)
test.response.next(page)
assert.equal(test.feed.loading(), false)
assert.equal(test.feed.articles().length, 2)
test.feed.preview.set(true)
test.feed.result.set({ ...page, articles: Array.from({ length: 10 }, (_, index) => ({ ...page.articles[0], id: String(index) })) })
assert.equal(test.feed.articles().length, 3)
test.feed.goToPage(2)
test.setResponse(throwError(() => new HttpErrorResponse({ status: 500 })))
test.run()
assert.equal(test.requests.at(-1).page, 2)
assert.equal(test.feed.loading(), false)
assert.match(test.feed.error(), /Unable to load/)
test.setResponse(of({ articles: [], page: 2, hasNext: false }))
test.feed.reload()
test.run()
assert.equal(test.feed.error(), "")
assert.deepEqual(test.feed.articles(), [])
const pending = new Subject()
test.setResponse(pending)
test.run()
assert.equal(pending.observed, true)
test.destroy()
assert.equal(pending.observed, false)
test.feed.symbols.set("MSFT")
test.callbacks[0]()
assert.equal(test.feed.requestedPage(), 1)
assert.match(feedSource, /Previous/)
assert.match(feedSource, /Next/)
assert.match(feedSource, /No market news found/)
assert.match(feedSource, /target="_blank" rel="noopener noreferrer"/)
assert.match(feedSource, /class="news-image"/)
assert.ok(!serviceSource.includes("/stream"))
console.log("Marketaux news response, API parameters, pagination, loading, retry, and cleanup tests passed.")
