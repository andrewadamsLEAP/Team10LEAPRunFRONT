import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Transaction {
  id?: number | string;
  type?: string;
  amount?: number;
  clientId?: number | string;
  createdAt?: string;
  status?: string;
  [key: string]: unknown;
}

const TRADING_API = '/api/v1/trading';

@Injectable({ providedIn: 'root' })
export class TransactionsService {
  private readonly http = inject(HttpClient);

  getTransactions(clientId: string | number): Observable<Transaction[]> {
    return this.http.get<Transaction[]>(`${TRADING_API}/transactions`, {
      params: this.clientParams(clientId)
    });
  }

  deposit(clientId: string | number, amount: number): Observable<Transaction> {
    return this.http.post<Transaction>(`${TRADING_API}/transactions/deposit`, null, {
      params: this.transactionParams(clientId, amount)
    });
  }

  withdraw(clientId: string | number, amount: number): Observable<Transaction> {
    return this.http.post<Transaction>(`${TRADING_API}/transactions/withdrawl`, null, {
      params: this.transactionParams(clientId, amount)
    });
  }

  purchase(clientId: string | number, amount: number): Observable<Transaction> {
    return this.http.post<Transaction>(`${TRADING_API}/transactions/purchase`, null, {
      params: this.transactionParams(clientId, amount)
    });
  }

  private clientParams(clientId: string | number): HttpParams {
    return new HttpParams().set('clientId', clientId);
  }

  private transactionParams(clientId: string | number, amount: number): HttpParams {
    return this.clientParams(clientId).set('amount', amount);
  }
}