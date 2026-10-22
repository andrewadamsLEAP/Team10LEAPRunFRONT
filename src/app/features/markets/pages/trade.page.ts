import { Component, DestroyRef, inject, OnInit, signal } from "@angular/core"
import { CurrencyPipe } from "@angular/common"
import { FormsModule } from "@angular/forms"
import { ActivatedRoute, Router } from "@angular/router"
import { toSignal } from "@angular/core/rxjs-interop"
import Store from "../../../core/state/portfolio.store"
import { Side } from "../../../core/models/data"
import { OrdersApiService } from "../../../core/api/orders-api.service"
import { ClientProfileApiService } from "../../../core/api/client-profile-api.service"
import { MarketDataService } from "../../../core/api/market-data.service"
import { Instrument } from "../../../core/models/data"
import { interval, startWith, switchMap } from "rxjs"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"

@Component({
  selector: "app-trade-page",
  standalone: true,
  imports: [CurrencyPipe, FormsModule],
  templateUrl: "./trade.page.html",
  styleUrl: "./trade.page.scss",
})
export default class TradePage implements OnInit {
  store = inject(Store)
  ordersApi = inject(OrdersApiService)
  clientProfileApi = inject(ClientProfileApiService)
  marketDataApi = inject(MarketDataService)
  destroyRef = inject(DestroyRef)
  router = inject(Router)
  route = inject(ActivatedRoute)
  params = toSignal(this.route.paramMap)
  get symbol() {
    return this.params()?.get("symbol")
  }
  get asset() {
    return this.store.assets.find((a) => a.symbol === this.symbol)
  }
  displayName(symbol: string, fallback: string) {
    const normalizedSymbol = symbol.replace("/", "-").toLowerCase()
    return (
      this.store.instruments().find(
        (instrument) => instrument.ticker.toLowerCase() === normalizedSymbol,
      )?.displayName || fallback
    )
  }
  side: Side =
    this.route.snapshot.queryParamMap.get("side") === "Sell" ? "Sell" : "Buy"
  quantity = 1
  review = false
  loading = signal(false)
  profileLoading = signal(true)
  cashAmount = signal<number | null>(null)
  liveInstrument = signal<Instrument | null>(null)
  error = signal("")
  marketPrice() {
    const instrument = this.liveInstrument()
    return this.side === "Buy"
      ? instrument?.askPrice ?? null
      : instrument?.bidPrice ?? null
  }
  estimatedTotal() {
    const price = this.marketPrice()
    return price === null ? null : price * this.quantity
  }
  ngOnInit() {
    const ticker = this.symbol?.replaceAll("/", "-")
    if (ticker) {
      interval(10000)
        .pipe(
          startWith(0),
          switchMap(() => this.marketDataApi.getInstrument(ticker)),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe({
          next: (instrument) => this.liveInstrument.set(instrument),
          error: () => this.error.set("Unable to load the current market price."),
        })
    }

    interval(10000)
      .pipe(
        startWith(0),
        switchMap(() => this.clientProfileApi.getProfile()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
      next: (profile) => {
        const amount = profile.cashAmount ?? profile.cash_amount ?? profile.cash
        const parsedAmount = Number(amount)
        this.cashAmount.set(Number.isFinite(parsedAmount) ? parsedAmount : null)
        this.profileLoading.set(false)
        if (this.cashAmount() === null) this.error.set("Buying power is unavailable.")
      },
      error: () => {
        this.profileLoading.set(false)
        this.error.set("Unable to load your buying power.")
      },
      })
  }
  back() {
    if (this.review) this.review = false
    else void this.router.navigate(["/client/ticker", this.symbol])
  }
  check() {
    this.error.set("")
    if (this.profileLoading() || this.cashAmount() === null) {
      this.error.set("Buying power is still loading. Please try again.")
      return
    }
    if (this.marketPrice() === null) {
      this.error.set("Current market price is unavailable. Please try again.")
      return
    }
    if (
      !Number.isFinite(this.quantity) ||
      this.quantity <= 0 ||
      !Number.isInteger(this.quantity)
    )
      this.error.set("Enter a valid whole-number quantity.")
    else if (
      this.side === "Buy" &&
      this.quantity * this.marketPrice()! > this.cashAmount()!
    )
      this.error.set("Insufficient buying power.")
    else if (
      this.side === "Sell" &&
      this.quantity >
        (this.store.holdings.find((p) => p.symbol === this.symbol)?.quantity ??
          0)
    )
      this.error.set("Insufficient holdings.")
    else this.review = true
  }
  confirm() {
    if (this.loading() || !this.symbol) return

    this.error.set("")
    this.loading.set(true)
    const ticker = this.symbol.replaceAll("/", "-")
    const request = {
      ticker,
      quantity: this.quantity,
    }
    const orderRequest =
      this.side === "Buy"
        ? this.ordersApi.placeBuyOrder(request)
        : this.ordersApi.placeSellOrder(request)

    orderRequest.subscribe({
      next: () => {
        this.loading.set(false)
        void this.router.navigate(["/client/orders"])
      },
      error: (error: {
        error?: {
          message?: string
          detail?: string
          error?: string
          errors?: Array<{ defaultMessage?: string; message?: string }>
        } | string
        status?: number
        message?: string
      }) => {
        this.loading.set(false)
        const response = error.error
        const validationMessage =
          typeof response === "object" && response?.errors?.[0]
            ? response.errors[0].defaultMessage || response.errors[0].message
            : undefined
        this.error.set(
          (typeof response === "string" ? response : undefined) ||
          (typeof response === "object" ? response?.message : undefined) ||
          (typeof response === "object" ? response?.detail : undefined) ||
          (typeof response === "object" ? response?.error : undefined) ||
          validationMessage ||
          (error.status === 400
            ? `The backend rejected this ${this.side.toLowerCase()} order for ${ticker} (${this.quantity}). Check market data, market hours, cash, and holdings.`
            : error.status === 0
              ? "The order request timed out. It may already be pending on the server. Check your orders before submitting again."
            : error.message) ||
            `Unable to place ${this.side.toLowerCase()} order for ${ticker} (${this.quantity}).`,
          )
      },
    })
  }
}
