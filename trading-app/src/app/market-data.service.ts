import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';

export interface MarketQuote {
  ticker?: string;
  symbol?: string;
  price?: number | string;
  currentPrice?: number | string;
  close?: number | string;
  change?: number | string;
  changePercent?: number | string;
  volume?: number | string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface PricePoint {
  timestamp?: string;
  time?: string;
  price?: number | string;
  close?: number | string;
  [key: string]: unknown;
}

export interface RefreshStatus {
  marketOpen?: boolean;
  lastRefresh?: string;
  [key: string]: unknown;
}

const MARKET_DATA_API = '/api/v1/trading/market-data';

@Injectable({ providedIn: 'root' })
export class MarketDataService {
  private readonly http = inject(HttpClient);

  getLatestPrices(): Observable<MarketQuote[]> {
    return this.http.get<MarketQuote[]>(`${MARKET_DATA_API}/prices`);
  }

  getLatestPricesPolling(intervalMs = 5000): Observable<MarketQuote[]> {
    return timer(0, intervalMs).pipe(
      switchMap(() => this.getLatestPrices())
    );
  }

  getTickers(): Observable<string[]> {
    return this.http.get<string[]>(`${MARKET_DATA_API}/tickers`);
  }

  getRefreshStatus(): Observable<RefreshStatus> {
    return this.http.get<RefreshStatus>(`${MARKET_DATA_API}/refresh/status`);
  }

  getPriceHistory(ticker: string, from?: string, to?: string): Observable<PricePoint[]> {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);

    return this.http.get<PricePoint[]>(
      `${MARKET_DATA_API}/prices/${encodeURIComponent(ticker)}/history`,
      { params }
    );
  }
}