import { Component, DestroyRef, inject } from "@angular/core"
import { CurrencyPipe } from "@angular/common"
import { FormsModule } from "@angular/forms"
import { ActivatedRoute, Router } from "@angular/router"
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop"
import Store from "../../../core/state/portfolio.store"
import { Side } from "../../../core/models/data"

@Component({
  selector: "app-trade-page",
  standalone: true,
  imports: [CurrencyPipe, FormsModule],
  template: `
    @if (store.instrumentLoading()) { <p class="empty-state" role="status">Loading instrument...</p> }
    @else if (store.instrumentError(); as message) { <p class="empty-state" role="alert">{{ message }}</p> }
    @else if (asset; as a) {
      <div class="narrow-page"><button class="back-button" (click)="back()">‹ Back</button><section class="surface trade-card"><div class="trade-card-title"><i class="large-symbol">{{ a.symbol[0] }}</i><div><span>{{ review ? 'Review order' : 'Place an order' }}</span><h1>{{ a.symbol }}</h1><p>{{ a.name }}</p></div></div>
        @if (!review) { <div class="side-switch"><button [class.active]="side === 'Buy'" class="buy" (click)="side = 'Buy'">Buy</button><button [class.active]="side === 'Sell'" class="sell" (click)="side = 'Sell'">Sell</button></div> }
        <label class="form-field"><span>Order type</span><div class="quantity-input static-field">Market</div></label>
        <label class="form-field"><span>Quantity</span><div class="quantity-input"><input type="number" min="0" [step]="a.kind === 'Stock' ? 1 : 0.000001" [(ngModel)]="quantity" [readonly]="review" aria-label="Order quantity"></div></label>
        <div class="order-details"><div><span>Side</span><strong>{{ side }}</strong></div><div><span>Market price</span><strong>{{ a.price === null ? '—' : (a.price | currency:'USD':'symbol':'1.2-4') }}</strong></div><div><span>Commission</span><strong>{{ 0 | currency:'USD' }}</strong></div><div><span>Buying power</span><strong>{{ store.cash | currency:'USD' }}</strong></div><div><span>Estimated total</span><strong>{{ a.price === null ? '—' : (quantity * a.price | currency:'USD') }}</strong></div></div>
        @if (error) { <div class="form-error" role="alert">{{ error }}</div> }
        @if (a.price === null) { <div class="form-error" role="alert">No valid market price is available. Please try again later.</div> }
        <button class="primary-button full-button" [disabled]="a.price === null" (click)="review ? confirm() : check()">{{ review ? 'Confirm ' + side.toLowerCase() : 'Review order' }}</button>
      </section></div>
    } @else { <p class="empty-state">Asset not found.</p> }`,
})
export default class TradePage {
  store = inject(Store)
  router = inject(Router)
  route = inject(ActivatedRoute)
  params = toSignal(this.route.paramMap)
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((params) => {
      this.review = false
      this.error = ""
      const symbol = params.get("symbol")
      if (symbol) this.store.loadInstrument(symbol.trim().replaceAll("/", "-").toUpperCase())
    })
  }
  get symbol() {
    return this.params()?.get("symbol")?.trim().replaceAll("/", "-").toUpperCase()
  }
  get asset() {
    const instrument = this.store.selectedInstrument()
    if (!instrument || instrument.ticker !== this.symbol) return null
    const price = instrument.bidPrice ?? instrument.askPrice
    return {
      symbol: instrument.ticker,
      name: instrument.displayName || "—",
      kind: instrument.assetType === "STOCK" ? "Stock" : instrument.assetType === "CRYPTO" ? "Crypto" : "Forex",
      price: price !== null && Number.isFinite(price) && price > 0 ? price : null,
    }
  }
  side: Side =
    this.route.snapshot.queryParamMap.get("side") === "Sell" ? "Sell" : "Buy"
  quantity = 1
  review = false
  error = ""
  back() {
    if (this.review) this.review = false
    else void this.router.navigate(["/client/ticker", this.symbol])
  }
  check() {
    this.error = ""
    const asset = this.asset
    if (!asset || asset.price === null) {
      this.error = "No valid market price is available."
      return
    }
    if (
      !Number.isFinite(this.quantity) ||
      this.quantity <= 0 ||
      (this.asset?.kind === "Stock" && !Number.isInteger(this.quantity))
    )
      this.error = "Enter a valid quantity. Stocks require whole shares."
    else if (
      this.side === "Buy" &&
      this.quantity * asset.price > this.store.cash
    )
      this.error = "Insufficient buying power."
    else if (
      this.side === "Sell" &&
      this.quantity >
        (this.store.holdings.find((p) => p.symbol === this.symbol)?.quantity ??
          0)
    )
      this.error = "Insufficient holdings."
    else this.review = true
  }
  confirm() {
    try {
      this.store.trade(this.symbol!, this.side, this.quantity)
      void this.router.navigate(["/client/orders"])
    } catch (error) {
      this.error = (error as Error).message
    }
  }
}
