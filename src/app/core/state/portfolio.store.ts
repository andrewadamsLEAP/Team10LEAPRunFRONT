import { HttpClient } from "@angular/common/http"
import { inject, Injectable, signal } from "@angular/core"
import { map, tap } from "rxjs"
import { EMPTY, Subscription, catchError, exhaustMap, interval, startWith, timeout } from "rxjs"
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
  Instrument,
} from "../models/data"
import { MarketDataService } from "../api/market-data.service"

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
export type ClientProfile = {
  clientId: number
  email: string | null
  username: string | null
  firstName: string | null
  lastName: string | null
  cashAmount: number
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
  constructor(
    private readonly http: HttpClient,
    private readonly marketDataService: MarketDataService,
  ) {}
  private marketPolling?: Subscription
  private readonly assetsState = signal(structuredClone(assets))
  private readonly priceFlashState = signal<Record<string, boolean>>({})
  get assets() {
    return this.assetsState()
  }
  readonly instruments = signal<Instrument[]>([])
  readonly instrumentLoading = signal(false)
  readonly instrumentError = signal<string | null>(null)
  readonly selectedInstrument = signal<Instrument | null>(null)
  session = signal<Session | null>(null)
  clientProfile = signal<ClientProfile | null>(null)
  clients = signal(structuredClone(initialClients))
  reporters = signal(structuredClone(initialReporters))
  orders = signal(structuredClone(initialOrders))
  transactions = signal(structuredClone(initialTransactions))
  private clientTransactionsLoaded = signal(false)
  positions = signal<Position[]>([
    { client: "jordanlee", symbol: "NVDA", quantity: 48, average: 118.24 },
    {
      client: "jordanlee",
      symbol: "BTC-USD",
      quantity: 0.124,
      average: 91842.1,
    },
    { client: "jordanlee", symbol: "AAPL", quantity: 36, average: 218.42 },
    { client: "jordanlee", symbol: "MSFT", quantity: 18, average: 412.18 },
  ])
  get account() {
    return this.clients().find((a) => a.username === this.session()?.username)
  }
  setClientProfile(profile: ClientProfile) {
    this.clientProfile.set(profile)
  }
  clearClientProfile() {
    this.clientProfile.set(null)
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
    const values = this.holdings.map((position) => this.holdingValue(position.symbol, position.quantity))
    return values.some((value) => value === null) ? null : values.reduce<number>((sum, value) => sum + value!, 0)
  }
  holdingValue(symbol: string, quantity: number): number | null {
    const instrument = this.instruments().find((item) => this.canonicalTicker(item.ticker) === this.canonicalTicker(symbol))
    const price = instrument?.bidPrice ?? instrument?.askPrice
    return price == null || !Number.isFinite(price) || price < 0 || !Number.isFinite(quantity) ? null : price * quantity
  }
  private canonicalTicker(ticker: string) {
    return ticker.trim().replaceAll("/", "-").toUpperCase()
  }
  loadInstruments() {
    this.instrumentLoading.set(true)
    this.instrumentError.set(null)
    this.marketDataService.getInstruments().pipe(timeout(15_000)).subscribe({
      next: (instruments) => {
        this.applyInstrumentPrices(instruments)
        this.instruments.set(instruments)
        this.instrumentLoading.set(false)
      },
      error: () => {
        this.instrumentError.set("Unable to load market instruments.")
        this.instrumentLoading.set(false)
      },
    })
  }
  startMarketDataPolling() {
    if (this.marketPolling) return
    this.marketPolling = interval(5_000)
      .pipe(
        startWith(0),
        exhaustMap(() =>
          this.marketDataService
            .getInstruments()
            .pipe(
              timeout(15_000),
              catchError(() => {
                this.instrumentError.set("Unable to refresh market prices. Displayed quotes may be out of date; retrying automatically.")
                this.instrumentLoading.set(false)
                return EMPTY
              }),
            ),
        ),
      )
      .subscribe((instruments) => {
        this.applyInstrumentPrices(instruments)
        this.instruments.set(instruments)
        this.instrumentError.set(null)
        this.instrumentLoading.set(false)
      })
  }
  priceChanged(symbol: string) {
    return this.priceFlashState()[this.canonicalTicker(symbol)] ?? false
  }
  private applyInstrumentPrices(instruments: Instrument[]) {
    const nextPrices = new Map(
      instruments.map((instrument) => [
        this.canonicalTicker(instrument.ticker),
        instrument.bidPrice ?? instrument.askPrice,
      ]),
    )
    const currentPrices = new Map(this.instruments().map((instrument) => [this.canonicalTicker(instrument.ticker), instrument.bidPrice ?? instrument.askPrice]))
    const changed: Record<string, boolean> = {}
    for (const [symbol, price] of nextPrices) {
      if (price != null && currentPrices.has(symbol) && currentPrices.get(symbol) !== price) {
        changed[symbol] = true
        setTimeout(() => {
          this.priceFlashState.update((flashes) => ({ ...flashes, [symbol]: false }))
        }, 900)
      }
    }
    this.priceFlashState.update((flashes) => ({ ...flashes, ...changed }))
    this.assetsState.update((current) => current.map((asset) => {
      const price = nextPrices.get(this.canonicalTicker(asset.symbol))
      return price == null ? asset : { ...asset, price }
    }))
  }
  loadInstrument(ticker: string) {
    this.instrumentLoading.set(true)
    this.instrumentError.set(null)
    this.marketDataService.getInstrument(ticker).subscribe({
      next: (instrument) => {
        this.selectedInstrument.set(instrument)
        this.instrumentLoading.set(false)
      },
      error: () => {
        this.selectedInstrument.set(null)
        this.instrumentError.set("Unable to load this instrument.")
        this.instrumentLoading.set(false)
      },
    })
  }
  loadHoldings() {
    this.refreshHoldings().subscribe({ error: () => undefined })
  }
  refreshHoldings() {
    const client = this.session()?.username
    return this.http.get<Holding[]>("/api/v1/holdings").pipe(tap((records) => {
      if (!client || this.session()?.username !== client) return
      this.positions.set(records.map((record) => this.toPosition(record, client)))
    }))
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
    this.clearClientProfile()
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
  updateProfile(input: { username: string; firstName: string; lastName: string }) {
    const current = this.session()
    if (!current || current.role !== "client") throw new Error("Client access required.")
    const username = input.username.trim().toLowerCase()
    if (!username) throw new Error("Username is required.")
    if (this.clients().some((account) =>
      account.username === username && account.username !== current.username
    )) {
      throw new Error("Username already exists.")
    }
    this.clients.update((items) =>
      items.map((account) =>
        account.username !== current.username
          ? account
          : {
              ...account,
              username,
              fullName: `${input.firstName.trim()} ${input.lastName.trim()}`.trim(),
            },
      ),
    )
    this.session.set({ ...current, username })
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
