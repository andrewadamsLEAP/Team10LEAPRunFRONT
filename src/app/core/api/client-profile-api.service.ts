import { Injectable, inject } from "@angular/core"
import { HttpClient } from "@angular/common/http"
import { Observable } from "rxjs"
import { BASE_PATH } from "./auth"

export type ClientProfile = {
  clientId: number
  email: string
  username: string
  firstName: string
  lastName: string
  cashAmount?: number | string
  cash_amount?: number | string
  cash?: number | string
}

@Injectable({ providedIn: "root" })
export class ClientProfileApiService {
  private readonly http = inject(HttpClient)
  private readonly basePath = inject(BASE_PATH)

  getProfile(): Observable<ClientProfile> {
    return this.http.get<ClientProfile>(
      `${this.basePath}/v1/clients/profile`,
    )
  }
}
