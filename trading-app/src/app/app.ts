import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MarketDataService, MarketQuote, PricePoint } from './market-data.service';
import { Transaction, TransactionsService } from './transactions.service';

@Component({
  selector: 'app-root',
  imports: [DecimalPipe, FormsModule],
  templateUrl: './app.html'
})
export class App {
  private readonly transactionsService = inject(TransactionsService);
  private readonly marketDataService = inject(MarketDataService);
  protected readonly authenticated = signal(false);
  protected readonly mode = signal<'login' | 'signup'>('login');
  protected readonly selectedRole = signal<'client' | 'reporter' | 'admin'>('client');
  protected username = '';
  protected password = '';
  protected email = '';
  protected error = '';
  protected clientId = '';
  protected transactionAmount: number | null = null;
  protected transactions: Transaction[] = [];
  protected transactionMessage = '';
  protected transactionError = '';
  protected marketQuotes: MarketQuote[] = [];
  protected marketHistory: PricePoint[] = [];
  protected selectedTicker = '';
  protected marketDataError = '';
  protected marketDataUpdatedAt = '';

  protected submit(): void {
    const invalid = !this.username.trim() || this.password.length < 4 ||
      (this.mode() === 'signup' && !this.email.includes('@'));

    if (invalid) {
      this.error = 'Enter a valid username, email, and password of at least 4 characters.';
      return;
    }

    this.error = '';
    this.clientId = this.username.trim();
    this.authenticated.set(true);
    this.loadMarketData();
  }

  protected loadMarketData(): void {
    this.marketDataService.getLatestPricesPolling().subscribe({
      next: (quotes) => {
        this.marketQuotes = quotes;
        this.marketDataUpdatedAt = new Date().toLocaleTimeString();
        this.marketDataError = '';
      },
      error: () => this.marketDataError = 'Market data is unavailable right now.'
    });
  }

  protected loadPriceHistory(ticker: string): void {
    this.selectedTicker = ticker;
    this.marketDataService.getPriceHistory(ticker).subscribe({
      next: (history) => this.marketHistory = history,
      error: () => this.marketDataError = `Could not load ${ticker} history.`
    });
  }

  protected quoteSymbol(quote: MarketQuote): string {
    return String(quote.ticker ?? quote.symbol ?? '');
  }

  protected quotePrice(quote: MarketQuote): number {
    return Number(quote.price ?? quote.currentPrice ?? quote.close ?? 0);
  }

  protected quoteChange(quote: MarketQuote): number {
    return Number(quote.changePercent ?? quote.change ?? 0);
  }

  protected formatPrice(price: number): string {
    return price >= 1000 ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `$${price.toFixed(2)}`;
  }

  protected historyPath(): string {
    const prices = this.marketHistory
      .map((point) => Number(point.price ?? point.close))
      .filter((price) => Number.isFinite(price));
    if (prices.length < 2) return '';

    const minimum = Math.min(...prices);
    const maximum = Math.max(...prices);
    const range = maximum - minimum || 1;
    return prices.map((price, index) => {
      const x = (index / (prices.length - 1)) * 520;
      const y = 180 - ((price - minimum) / range) * 160;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  }

  protected loadTransactions(): void {
    if (!this.clientId.trim()) {
      this.transactionError = 'Enter a client ID first.';
      return;
    }

    this.transactionError = '';
    this.transactionsService.getTransactions(this.clientId.trim()).subscribe({
      next: (transactions) => this.transactions = transactions,
      error: () => this.transactionError = 'Could not load transactions.'
    });
  }

  protected submitTransaction(type: 'deposit' | 'withdraw' | 'purchase'): void {
    const amount = this.transactionAmount;
    if (!this.clientId.trim() || amount === null || amount <= 0) {
      this.transactionError = 'Enter a client ID and an amount greater than zero.';
      return;
    }

    const request = this.transactionsService[type](this.clientId.trim(), amount);
    request.subscribe({
      next: () => {
        this.transactionMessage = `${type} completed.`;
        this.transactionError = '';
        this.transactionAmount = null;
        this.loadTransactions();
      },
      error: () => this.transactionError = `Could not complete ${type}.`
    });
  }

  protected toggleMode(): void {
    this.mode.update((current) => current === 'login' ? 'signup' : 'login');
    this.error = '';
  }

  protected logout(): void {
    this.authenticated.set(false);
    this.password = '';
  }
}
