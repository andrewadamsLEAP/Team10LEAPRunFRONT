import { Injectable, inject } from "@angular/core"
import { HttpClient } from "@angular/common/http"
import { Observable } from "rxjs"
import { BASE_PATH } from "./auth"

export type PlaceOrderRequest = {
  ticker: string
  quantity: number
}

export type ClientOrderRecord = {
  orderId?: string | number
  order_id?: string | number
  ticker?: string
  orderType?: string
  order_type?: string
  orderStatus?: string
  order_status?: string
  status?: string
  quantity?: number
  price?: number
  orderDate?: string
  order_date?: string
  createdAt?: string
}

@Injectable({ providedIn: "root" })
export class OrdersApiService {
  private readonly http = inject(HttpClient)
  private readonly basePath = inject(BASE_PATH)

  placeBuyOrder(request: PlaceOrderRequest): Observable<unknown> {
    return this.http.post<unknown>(
      `${this.basePath}/v1/orders/buy`,
      request,
      { timeout: 15000 },
    )
  }

  placeSellOrder(request: PlaceOrderRequest): Observable<unknown> {
    return this.http.post<unknown>(
      `${this.basePath}/v1/orders/sell`,
      request,
      { timeout: 15000 },
    )
  }

  getClientFulfilledOrders(): Observable<ClientOrderRecord[]> {
    return this.http.get<ClientOrderRecord[]>(
      `${this.basePath}/v1/orders/client/fulfilled`,
      { timeout: 15000 },
    )
  }

  getAllClientOrders(clientId: number): Observable<ClientOrderRecord[]> {
    return this.http.get<ClientOrderRecord[]>(
      `${this.basePath}/v1/orders/client/all/${clientId}`,
      { timeout: 15000 },
    )
  }

  getClientCancelledOrders(): Observable<ClientOrderRecord[]> {
    return this.http.get<ClientOrderRecord[]>(
      `${this.basePath}/v1/orders/client/cancelled`,
      { timeout: 15000 },
    )
  }
}
