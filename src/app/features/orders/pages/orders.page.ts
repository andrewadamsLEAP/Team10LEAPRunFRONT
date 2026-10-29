import { Component, inject, OnInit, signal } from "@angular/core"
import { CurrencyPipe, DatePipe, DecimalPipe } from "@angular/common"
import { HttpClient } from "@angular/common/http"
import { RouterLink } from "@angular/router"
import Store from "../../../core/state/portfolio.store"
import { BASE_PATH } from "../../../core/api/auth"
import { ClientOrderRecord, OrdersApiService } from "../../../core/api/orders-api.service"
import { TokenStore } from "../../../core/auth/token-store.service"
import { TableSort, SortColumn } from "../../../shared/sorting/table-sort"

type AdminOrderRecord = ClientOrderRecord & {
  order_id?: string | number
  orderId?: string | number
  clientId?: string | number
  client_id?: string | number
  ticker?: string
  order_type?: string
  orderType?: string
  order_status?: string
  orderStatus?: string
  status?: string
  quantity?: number
  price?: number
  order_date?: string
  orderDate?: string
  createdAt?: string
}

type OrderRow = {
  id: string
  client: string
  ticker: string
  type: string
  status: string
  price: number
  quantity: number
  date: string
}

@Component({
  selector: "app-orders-page",
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, RouterLink, TableSort, SortColumn],
  templateUrl: "./orders.page.html",
  styleUrl: "./orders.page.scss",
})
export default class OrdersPage implements OnInit {
  store = inject(Store)
  http = inject(HttpClient)
  apiBasePath = inject(BASE_PATH)
  adminOrders = signal<OrderRow[]>([])
  clientOrders = signal<OrderRow[]>([])
  loading = signal(false)
  loadError = signal("")
  tokenStore = inject(TokenStore)

  ngOnInit() {
    if (!this.employee) {
      this.loadClientOrders()
      return
    }

    this.loading.set(true)
    this.http
      .get<AdminOrderRecord[]>(`${this.apiBasePath}/v1/orders/employee/all`, {
        timeout: 15000,
      })
      .subscribe({
        next: (records) => {
          this.adminOrders.set(records.map((record) => ({
            id: String(record.orderId ?? record.order_id ?? "—"),
            client: String(record.clientId ?? record.client_id ?? "—"),
            ticker: record.ticker ?? "—",
            type: record.orderType ?? record.order_type ?? "—",
            status: record.status ?? record.orderStatus ?? record.order_status ?? "—",
            quantity: Number(record.quantity ?? 0),
            price: Number(record.price ?? 0),
            date: record.createdAt ?? record.orderDate ?? record.order_date ?? "—",
          })))
          this.loading.set(false)
        },
        error: (error: { error?: { message?: string }; message?: string }) => {
          this.loadError.set(
            error.error?.message ||
              error.message ||
              "Unable to load orders from the backend.",
          )
          this.loading.set(false)
        },
      })
  }

  private readonly ordersApi = inject(OrdersApiService)

  private loadClientOrders() {
    const clientId = Number(this.tokenStore.currentUser()?.sub)
    if (!Number.isSafeInteger(clientId) || clientId <= 0) {
      this.loadError.set("Unable to identify the logged-in client.")
      return
    }

    this.loading.set(true)
    this.ordersApi.getAllClientOrders(clientId).subscribe({
      next: (records) => {
        this.clientOrders.set(
          records
            .map((record) => this.toOrderRow(record))
            .sort((left, right) => right.date.localeCompare(left.date)),
        )
        this.loading.set(false)
      },
      error: (error: { error?: { message?: string }; message?: string }) => {
        this.loadError.set(
          error.error?.message || error.message || "Unable to load your orders from the backend.",
        )
        this.loading.set(false)
      },
    })
  }

  private toOrderRow(record: ClientOrderRecord): OrderRow {
    return {
      id: String(record.orderId ?? record.order_id ?? "—"),
      client: "",
      ticker: record.ticker ?? "—",
      type: record.orderType ?? record.order_type ?? "—",
      status: record.status ?? record.orderStatus ?? record.order_status ?? "—",
      quantity: Number(record.quantity ?? 0),
      price: Number(record.price ?? 0),
      date: record.createdAt ?? record.orderDate ?? record.order_date ?? "—",
    }
  }

  get client() {
    return this.store.session()?.role === "client"
  }
  get admin() {
    return this.store.session()?.role === "admin"
  }
  get employee() {
    const role = this.store.session()?.role
    return role === "admin" || role === "reporter"
  }
  get orders() {
    if (this.employee) return this.adminOrders()
    return this.client ? this.clientOrders() : this.store.orders()
  }

  formatOrderDate(value: string) {
    if (!value || value === "—") return value
    const normalized = value.replace(
      /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?!Z|[+-]\d{2}:?\d{2})$/,
      "$1T$2",
    )
    const date = new Date(normalized)
    if (Number.isNaN(date.getTime())) return value
    return new DatePipe("en-US").transform(date, "medium") ?? value
  }
}
