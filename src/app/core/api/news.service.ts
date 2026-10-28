import { HttpClient, HttpErrorResponse } from "@angular/common/http"
import { inject, Injectable } from "@angular/core"
import { map } from "rxjs"
import { BASE_PATH } from "./auth/variables"
import { parseNewsResponse } from "./news-response"

@Injectable({ providedIn: "root" })
export class NewsService {
  private readonly http = inject(HttpClient)
  private readonly basePath = inject(BASE_PATH)

  getNews(page = 1, symbols = "") {
    const params: Record<string, string> = { limit: "25", page: String(page), language: "en" }
    const tickers = [...new Set(symbols.split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))]
    if (tickers.length) params["symbols"] = tickers.join(",")
    // HttpClient uses the application's JWT interceptor, including its 401 handling.
    return this.http.get<unknown>(`${this.basePath}/v1/news`, { params, timeout: 15_000 })
      .pipe(map((response) => parseNewsResponse(response, page, 25)))
  }
}

export function newsErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) return "Your session has expired. Sign in to read market news."
    if (error.status === 403) return "Your account is not authorized to read market news."
    if (error.status === 429) return "Market news is temporarily rate limited. Please try again shortly."
    return "Unable to load market news. Please try again."
  }
  return error instanceof Error ? error.message : "Unable to load market news. Please try again."
}
