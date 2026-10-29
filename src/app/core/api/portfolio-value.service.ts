import { Injectable, inject } from "@angular/core"
import { HttpClient } from "@angular/common/http"
import { forkJoin, from, map, mergeMap, Observable, of, switchMap, timeout, toArray } from "rxjs"
import { ClientProfileApiService } from "./client-profile-api.service"
import { MarketDataService, type LatestMarketPrice } from "./market-data.service"
import { TokenStore } from "../auth/token-store.service"

export const portfolioPeriods = ["1D", "1W", "1M", "1Y"] as const
export type PortfolioPeriod = typeof portfolioPeriods[number]
export type PortfolioObservation = { timestamp: string; cash: number; invested: number; total: number; positions: number; oldestQuote: string | null }
type Holding = { clientId: number; ticker: string; quantity: number }
export type PortfolioHistoryPoint = {
  timestamp: string
  cash: number | null
  invested: number | null
  total: number | null
  complete: boolean
  missingPrices?: unknown
}
export type PortfolioHistory = {
  currency: string
  points: PortfolioHistoryPoint[]
  coverage: unknown
  missingPrices?: unknown
}

export function hasMissingPrices(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0
  if (value && typeof value === "object") return Object.keys(value).length > 0
  return typeof value === "number" ? value > 0 : Boolean(value)
}

export function portfolioHistorySeries(points: PortfolioHistoryPoint[], period: PortfolioPeriod, to: number) {
  const range = portfolioRange(period, to)
  const unique = new Map<number, PortfolioHistoryPoint>()
  for (const point of points) {
    const timestamp = Date.parse(point.timestamp)
    if (Number.isFinite(timestamp) && timestamp >= range.from && timestamp <= range.to) unique.set(timestamp, point)
  }
  return [...unique.entries()].sort(([left], [right]) => left - right).map(([, point]) => ({
    timestamp: point.timestamp,
    invested: point.complete === true && !hasMissingPrices(point.missingPrices)
      && typeof point.invested === "number" && Number.isFinite(point.invested) ? point.invested : null,
  }))
}

export function portfolioRange(period: PortfolioPeriod, to: number): { from: number; to: number } {
  return { from: to - ({ "1D": 1, "1W": 7, "1M": 30, "1Y": 365 }[period]) * 86400000, to }
}

export function portfolioSeries(points: PortfolioObservation[], period: PortfolioPeriod, to: number) {
  const range = portfolioRange(period, to)
  return points.filter((point) => {
    const timestamp = Date.parse(point.timestamp)
    return Number.isFinite(timestamp) && timestamp >= range.from && timestamp <= range.to && Number.isFinite(point.total)
  }).sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp))
}

export function quoteValue(records: LatestMarketPrice[], ticker: string, now: number) {
  const canonical = (value: string) => value.trim().replaceAll("/", "-").toUpperCase()
  const quotes = records.filter((row) => canonical(row.ticker) === canonical(ticker)
    && Number.isFinite(Date.parse(row.recorded_at)) && Date.parse(row.recorded_at) <= now)
    .sort((left, right) => Date.parse(right.recorded_at) - Date.parse(left.recorded_at))
  const latest = quotes[0]
  const price = latest?.bid_price ?? latest?.ask_price
  if (price === null || price === undefined || !Number.isFinite(Number(price)) || Number(price) < 0) {
    throw new Error(`No usable latest quote for ${ticker}. Total value is unavailable, not cash-only.`)
  }
  return { price: Number(price), timestamp: latest.recorded_at }
}

@Injectable({ providedIn: "root" })
export class PortfolioValueService {
  private readonly http = inject(HttpClient)
  private readonly profile = inject(ClientProfileApiService)
  private readonly market = inject(MarketDataService)
  private readonly tokens = inject(TokenStore)

  history(period: PortfolioPeriod, to = Date.now()): Observable<PortfolioHistory> {
    const user = this.tokens.currentUser()
    const clientId = Number(user?.sub)
    if (user?.actorType !== "client" || !Number.isSafeInteger(clientId) || clientId <= 0) {
      throw new Error("A signed-in client is required to view portfolio history.")
    }
    const range = portfolioRange(period, to)
    return this.http.get<PortfolioHistory>("/api/v1/portfolio/history", {
      params: { from: new Date(range.from).toISOString(), to: new Date(range.to).toISOString() },
    }).pipe(timeout({ first: 20000 }), map((history) => {
      if (history.currency !== "USD" || !Array.isArray(history.points)) {
        throw new Error("The portfolio history API returned an unsupported response.")
      }
      return history
    }))
  }

  observe(): Observable<PortfolioObservation> {
    const user = this.tokens.currentUser()
    const clientId = Number(user?.sub)
    if (user?.actorType !== "client" || !Number.isSafeInteger(clientId) || clientId <= 0) {
      throw new Error("A signed-in client is required to view portfolio value.")
    }
    return forkJoin({
      profile: this.profile.getProfile(),
      holdings: this.http.get<Holding[]>("/api/v1/holdings"),
    }).pipe(
      switchMap(({ profile, holdings }) => {
        if (Number(profile.clientId) !== clientId || !Array.isArray(holdings)
          || holdings.some((holding) => Number(holding.clientId) !== clientId)) {
          throw new Error("Portfolio response does not belong to the signed-in client.")
        }
        const cashValue = profile.cashAmount ?? profile.cash_amount ?? profile.cash
        if (cashValue === undefined || cashValue === null || String(cashValue).trim() === "" || !Number.isFinite(Number(cashValue))) {
          throw new Error("The account API did not supply a valid cash balance.")
        }
        if (holdings.some((holding) => !Number.isFinite(Number(holding.quantity)) || Number(holding.quantity) < 0 || !holding.ticker)) {
          throw new Error("The account API returned invalid holdings.")
        }
        const positions = holdings.filter((holding) => Number(holding.quantity) > 0)
        const marks = positions.length ? from(positions).pipe(
          mergeMap((holding) => this.market.getLatestPrice(holding.ticker).pipe(map((prices) => {
            const quote = quoteValue(prices, holding.ticker, Date.now())
            return { value: Number(holding.quantity) * quote.price, timestamp: quote.timestamp }
          })), 4), toArray(),
        ) : of([])
        return marks.pipe(map((values) => {
          const invested = values.reduce((sum, mark) => sum + mark.value, 0)
          const cash = Number(cashValue)
          const total = cash + invested
          if (!Number.isFinite(total)) throw new Error("Portfolio total is not a finite value.")
          return { timestamp: new Date().toISOString(), cash, invested, total, positions: positions.length,
            oldestQuote: values.length ? values.map((mark) => mark.timestamp).sort((a, b) => Date.parse(a) - Date.parse(b))[0] : null }
        }))
      }),
      timeout({ first: 20000 }),
    )
  }
}