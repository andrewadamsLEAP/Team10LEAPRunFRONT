export interface NewsArticle {
  id: string
  headline: string
  summary: string
  source: string
  publishedAt: number | null
  entities: string[]
  image: string | null
  url: string | null
}

export interface NewsPage {
  articles: NewsArticle[]
  page: number
  hasNext: boolean
}

function webUrl(value: unknown): string | null {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return null
  const url = new URL(value)
  return url.username || url.password ? null : url.href
}

export function parseNewsResponse(value: unknown, page: number, limit: number): NewsPage {
  if (!value || typeof value !== "object") throw new Error("Invalid news response.")
  let response = value as Record<string, unknown>
  // Some backend controllers wrap the provider response in a data envelope.
  if (response["data"] && typeof response["data"] === "object" && !Array.isArray(response["data"])) {
    response = response["data"] as Record<string, unknown>
  }
  if (!Array.isArray(response["data"])) {
    throw new Error("The news endpoint did not return an article list. Please retry or check the backend response.")
  }
  const articles = response["data"].map((value: unknown): NewsArticle => {
    if (!value || typeof value !== "object") throw new Error("Invalid news article.")
    const item = value as Record<string, unknown>
    if (typeof item["uuid"] !== "string" || !item["uuid"] || typeof item["title"] !== "string") {
      throw new Error("News article is missing its ID or title.")
    }
    const publishedAt = typeof item["published_at"] === "string" ? Date.parse(item["published_at"]) : NaN
    const entities = Array.isArray(item["entities"]) ? item["entities"] : []
    return {
      id: item["uuid"],
      headline: item["title"],
      summary: typeof item["description"] === "string" && item["description"].trim()
        ? item["description"] : typeof item["snippet"] === "string" ? item["snippet"] : "",
      source: typeof item["source"] === "string" ? item["source"] : "",
      publishedAt: Number.isFinite(publishedAt) ? publishedAt : null,
      entities: [...new Set(entities.flatMap((entity: unknown) => {
        if (!entity || typeof entity !== "object") return []
        const record = entity as Record<string, unknown>
        const symbol = typeof record["symbol"] === "string" ? record["symbol"].trim() : ""
        const name = typeof record["name"] === "string" ? record["name"].trim() : ""
        return symbol || name ? [symbol || name] : []
      }))],
      image: webUrl(item["image_url"]),
      url: webUrl(item["url"]),
    }
  })
  const metadata = response["meta"]
  if (metadata != null && (typeof metadata !== "object" || Array.isArray(metadata))) {
    throw new Error("The news endpoint returned invalid pagination metadata.")
  }
  const meta: Record<string, unknown> = metadata == null ? {} : metadata as Record<string, unknown>
  const returned = typeof meta["returned"] === "number" ? meta["returned"] : articles.length
  const pageSize = typeof meta["limit"] === "number" && meta["limit"] > 0 ? meta["limit"] : limit
  const found = typeof meta["found"] === "number" && meta["found"] >= 0 ? meta["found"] : null
  return {
    articles: [...new Map(articles.map((article) => [article.id, article])).values()]
      .sort((left, right) => (right.publishedAt ?? 0) - (left.publishedAt ?? 0)),
    page,
    hasNext: returned > 0 && (found !== null ? (page - 1) * pageSize + returned < found : returned >= pageSize),
  }
}
