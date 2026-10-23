import { inject, Injectable } from "@angular/core"
import { HttpClient } from "@angular/common/http"
import { BASE_PATH } from "./auth"
import { Instrument } from "../models/data"
import { forkJoin, map, Observable, switchMap } from "rxjs"

export type PriceHistoryPoint = {
  ticker: string
  price: number
  timestamp: string
}

type BackendInstrument = {
  ticker: string
  displayName: string | null
  assetType: "STOCK" | "CRYPTO" | "FOREX"
  previousClose: number
  open: number
  volume: number
  averageVolume: number
  bidPrice: number | null
  askPrice: number | null
  bidSize: number | null
  askSize: number | null
  quoteTimestamp: string | null
  recordedAt: string | null
  changePercent: number | null
}
export type MarketPriceHistory = {
  ticker: string
  ask_price: number | null
  bid_price: number | null
  quote_timestamp: string | null
  recorded_at: string
}
export type LatestMarketPrice = {
  ticker: string
  ask_price: number | null
  bid_price: number | null
  quote_timestamp: string | null
  recorded_at: string
}

@Injectable({ providedIn: "root" })
export class MarketDataService {
  private readonly http = inject(HttpClient)
  private readonly apiBasePath = inject(BASE_PATH)

  getTickers(): Observable<string[]> {
    return this.http.get<string[]>(
      `${this.apiBasePath}/v1/trading/market-data/tickers`,
    )
  }

  getInstrument(ticker: string): Observable<Instrument> {
    return this.http
      .get<BackendInstrument>(
        `${this.apiBasePath}/v1/trading/market-data/instruments/${this.tickerPath(ticker)}`,
      )
      .pipe(map((instrument) => this.toInstrument(instrument)))
  }

  getInstruments(): Observable<Instrument[]> {
    return this.getTickers().pipe(
      switchMap((tickers) =>
        forkJoin(tickers.map((ticker) => this.getInstrument(ticker))),
      ),
    )
  }

  getPriceHistory(ticker: string, from: Date, to: Date): Observable<PriceHistoryPoint[]> {
    return this.http.get<PriceHistoryPoint[]>(
      `${this.apiBasePath}/v1/trading/market-data/prices/${this.tickerPath(ticker)}/chart-history`,
      { params: { from: from.toISOString(), to: to.toISOString() } },
    )
  }

  private tickerPath(ticker: string): string {
    return encodeURIComponent(ticker.trim().replaceAll("/", "-").toUpperCase())
  }

  getLatestPrice(ticker: string): Observable<LatestMarketPrice[]> {
    return this.http.get<LatestMarketPrice[]>(
      `${this.apiBasePath}/v1/trading/market-data/prices/${this.tickerPath(ticker)}`,
    )
  }

  private toInstrument(instrument: BackendInstrument): Instrument {
    return instrument
  }
}
