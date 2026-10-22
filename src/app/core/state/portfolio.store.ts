import { HttpClient } from "@angular/common/http"
import { Injectable, signal } from "@angular/core"
import { EMPTY, Subscription, interval, map, startWith, switchMap, tap, catchError } from "rxjs"
import {
  Account,
  Asset,
  Role,
  Side,
  Transaction,
  assets,
  initialClients,
  initialOrders,
  initialReporters,
  initialTransactions,
} from "../models/data"

export type Position = {
  client: string
  symbol: string
  quantity: number
  average: number
}
type Session = {
  role: Role
  username: string
}
type BackendTransaction = {
  transactionId: number
  clientId: number
  type: "DEPOSIT" | "WITHDRAWAL" | "PURCHASE"
  amount: number
  timestamp: string
}
export type Holding = {
  clientId: number
  ticker: string
  quantity: number
}
export type QuantityResponse = {
  quantity: number
}
export type MarketPrice = {
  ticker: string
  ask_price: number | null
  ask_size: number | null
  ask_exchange: string | null
  bid_price: number | null
  bid_size: number | null
  bid_exchange: string | null
  tape: string | null
  quote_timestamp: string | null
  recorded_at: string
  asset_type?: "STOCK" | "CRYPTO" | "FOREX"
}
export type RefreshStatus = {
  lastStartedAt: string | null
  lastCompletedAt: string | null
  lastFailure: string | null
  successfulTickerCount: number
  failedTickerCount: number
}
export const timestamp = () =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date())

@Injectable({ providedIn: "root" })
export default class Store {
  constructor(private readonly http: HttpClient) {}
  private marketPolling?: Subscription
  private readonly assetsState = signal(structuredClone(assets))
  get assets() {
    return this.assetsState()
  }
  session = signal<Session | null>(null)
  clients = signal(structuredClone(initialClients))
  reporters = signal(structuredClone(initialReporters))
  orders = signal(structuredClone(initialOrders))
  transactions = signal(structuredClone(initialTransactions))
  private clientTransactionsLoaded = signal(false)
  positions = signal<Position[]>([
    { client: "jordanlee", symbol: "NVDA", quantity: 48, average: 118.24 },
    {
      client: "jordanlee",
      symbol: "BTC/USD",
      quantity: 0.124,
      average: 91842.1,
    },
    { client: "jordanlee", symbol: "AAPL", quantity: 36, average: 218.42 },
    { client: "jordanlee", symbol: "MSFT", quantity: 18, average: 412.18 },
  ])
  get account() {
    return this.clients().find((a) => a.username === this.session()?.username)
  }
  get name() {
    const session = this.session()
    const records =
      session?.role === "reporter" ? this.reporters() : this.clients()
    return (
      records.find((a) => a.username === session?.username)?.fullName ||
      session?.username ||
      ""
    )
  }
  get cash() {
    if (this.session()?.role === "client" && this.clientTransactionsLoaded()) {
      return this.clientTransactions.reduce(
        (balance, transaction) => balance + transaction.amount,
        0,
      )
    }
    return this.account?.cash ?? 0
  }
  get holdings() {
    return this.positions().filter(
      (p) => p.client === this.session()?.username && p.quantity > 0,
    )
  }
  get clientOrders() {
    return this.orders().filter((o) => o.client === this.session()?.username)
  }
  get clientTransactions() {
    return this.transactions().filter(
      (t) => t.client === this.session()?.username,
    )
  }
  get invested() {
    return this.holdings.reduce(
      (sum, p) =>
        sum +
        p.quantity * this.assets.find((a) => a.symbol === p.symbol)!.price,
      0,
    )
  }
  loadMarketData() {
    this.http
      .get<MarketPrice[]>("/api/v1/trading/market-data/prices")
      .subscribe((records) => this.applyMarketPrices(records))
  }
  startMarketDataPolling() {
    if (this.marketPolling) return
    this.marketPolling = interval(5_000)
      .pipe(
        startWith(0),
        switchMap(() =>
          this.http
            .get<MarketPrice[]>("/api/v1/trading/market-data/prices")
            .pipe(catchError(() => EMPTY)),
        ),
      )
      .subscribe((records) => this.applyMarketPrices(records))
  }
  getLatestPrice(ticker: string) {
    return this.http.get<MarketPrice[]>(
      `/api/v1/trading/market-data/prices/${encodeURIComponent(this.backendTicker(ticker))}`,
    )
  }
  getPriceHistory(ticker: string, from?: string, to?: string) {
    const url = `/api/v1/trading/market-data/prices/${encodeURIComponent(this.backendTicker(ticker))}/history`
    const params = from && to
      ? `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      : ""
    return this.http.get<MarketPrice[]>(`${url}${params}`)
  }
  getMarketTickers() {
    return this.http.get<string[]>("/api/v1/trading/market-data/tickers")
  }
  getRefreshStatus() {
    return this.http.get<RefreshStatus>("/api/v1/trading/market-data/refresh/status")
  }
  refreshMarketData() {
    return this.http
      .get<MarketPrice[]>("/api/v1/trading/market-data/refresh")
      .pipe(tap((records) => this.applyMarketPrices(records)))
  }
  private applyMarketPrices(records: MarketPrice[]) {
    const prices = new Map(records.map((record) => [this.displayTicker(record.ticker), record]))
    this.assetsState.update((current) => current.map((asset) => {
      const quote = prices.get(asset.symbol)
      if (!quote) return asset
      const price = quote.ask_price ?? quote.bid_price
      return price == null ? asset : { ...asset, price, volume: String(quote.ask_size ?? quote.bid_size ?? asset.volume) }
    }))
  }
  private displayTicker(ticker: string) {
    return ticker.replace("-", "/")
  }
  private backendTicker(ticker: string) {
    return ticker.replace("/", "-")
  }
  loadHoldings() {
    this.http.get<Holding[]>("/api/v1/holdings").subscribe((records) => {
      const client = this.session()?.username ?? ""
      this.positions.set(records.map((record) => this.toPosition(record, client)))
    })
  }
  getHolding(ticker: string) {
    return this.http.get<Holding>(`/api/v1/holdings/${encodeURIComponent(ticker)}`)
  }
  getHoldingQuantity(ticker: string) {
    return this.http.get<QuantityResponse>(
      `/api/v1/holdings/quantity?ticker=${encodeURIComponent(ticker)}`,
    )
  }
  loadClientTransactions() {
    this.http
      .get<BackendTransaction[]>("/api/v1/trading/transactions")
      .subscribe((records) => {
        const client = this.session()?.username ?? ""
        this.transactions.set(records.map((record) => this.toTransaction(record, client)))
        this.clientTransactionsLoaded.set(true)
      })
  }
  funds(type: "Deposit" | "Withdrawal", amount: number) {
    if (this.session()?.role !== "client")
      throw new Error("Client access required.")
    if (!Number.isFinite(amount) || amount <= 0 || amount > 3_000_000)
      throw new Error("Enter a positive amount no more than $3,000,000.")
    if (type === "Withdrawal" && amount > this.cash)
      throw new Error("Enter a positive amount within your available balance.")

    const endpoint = type === "Deposit" ? "deposit" : "withdrawal"
    return this.http
      .post<BackendTransaction>(
        `/api/v1/trading/transactions/${endpoint}?amount=${encodeURIComponent(amount)}`,
        null,
      )
      .pipe(
        map((record) => this.toTransaction(record, this.session()!.username)),
        tap((transaction) => {
          this.updateCash(transaction.amount)
          this.transactions.update((items) => [transaction, ...items])
        }),
      )
  }
  private toTransaction(record: BackendTransaction, client: string): Transaction {
    const type = record.type === "DEPOSIT"
      ? "Deposit"
      : record.type === "WITHDRAWAL"
        ? "Withdrawal"
        : "Trade"
    return {
      id: String(record.transactionId),
      client,
      type,
      amount:
        type === "Withdrawal" || record.type === "PURCHASE"
          ? -record.amount
          : record.amount,
      date: record.timestamp,
      status: "Complete" as const,
    }
  }
  private toPosition(record: Holding, client: string): Position {
    return {
      client,
      symbol: record.ticker,
      quantity: record.quantity,
      average: this.assets.find((asset) => asset.symbol === record.ticker)?.price ?? 0,
    }
  }
  login(role: Role, rawUsername: string, email = "", fullName = "") {
    const username = rawUsername.trim().toLowerCase()
    const list = role === "client" ? this.clients() : this.reporters()
    /*
    if (
      role !== "admin" &&
      list.some((a) => a.username === username && a.status === "Suspended")
    ) {
      throw new Error("This account is suspended. Contact your administrator.")
    }
      */
    if (
      role === "client" &&
      !this.clients().some((a) => a.username === username)
    ) {
      this.clients.update((items) => [
        ...items,
        {
          id: Date.now(),
          username,
          email,
          fullName,
          cash: 0,
          status: "Active",
        },
      ])
    }
    this.session.set({ role, username })
  }
  private updateCash(delta: number) {
    this.clients.update((items) =>
      items.map((a) =>
        a.username === this.session()?.username
          ? { ...a, cash: a.cash + delta }
          : a,
      ),
    )
  }
  trade(symbol: string, side: Side, quantity: number) {
    if (this.session()?.role !== "client")
      throw new Error("Client access required.")
    const asset = this.assets.find((a) => a.symbol === symbol)!
    const position = this.holdings.find((p) => p.symbol === symbol)
    const total = asset.price * quantity
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      (asset.kind === "Stock" && !Number.isInteger(quantity))
    )
      throw new Error("Enter a valid quantity. Stocks require whole shares.")
    if (side === "Buy" && total > this.cash)
      throw new Error("Insufficient buying power.")
    if (side === "Sell" && quantity > (position?.quantity ?? 0))
      throw new Error("Insufficient holdings.")
    const client = this.session()!.username
    this.positions.update((items) => {
      const existing = items.find(
        (p) => p.client === client && p.symbol === symbol,
      )
      if (!existing)
        return [...items, { client, symbol, quantity, average: asset.price }]
      return items.map((p) =>
        p !== existing
          ? p
          : {
              ...p,
              quantity: p.quantity + (side === "Buy" ? quantity : -quantity),
              average:
                side === "Buy"
                  ? (p.average * p.quantity + total) / (p.quantity + quantity)
                  : p.average,
            },
      )
    })
    this.updateCash(side === "Buy" ? -total : total)
    const date = timestamp()
    this.orders.update((items) => [
      {
        id: `ORD-${crypto.randomUUID()}`,
        client,
        ticker: symbol,
        type: side,
        status: "Fulfilled",
        price: asset.price,
        quantity,
        date,
      },
      ...items,
    ])
    this.transactions.update((items) => [
      {
        id: `TRX-${crypto.randomUUID()}`,
        client,
        type: "Trade",
        amount: side === "Buy" ? -total : total,
        status: "Complete",
        date,
      },
      ...items,
    ])
  }
  saveAccount(role: "clients" | "reporters", account: Account) {
    if (this.session()?.role !== "admin")
      throw new Error("Administrator access required.")
    const records = this[role]
    if (
      records().some(
        (a) => a.username === account.username && a.id !== account.id,
      )
    )
      throw new Error("Username already exists.")
    records.update((items) =>
      items.some((a) => a.id === account.id)
        ? items.map((a) => (a.id === account.id ? account : a))
        : [...items, account],
    )
  }
}
