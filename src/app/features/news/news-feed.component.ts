import { Component, computed, effect, inject, input, signal } from "@angular/core"
import { DatePipe } from "@angular/common"
import { RouterLink } from "@angular/router"
import { NewsService, newsErrorMessage } from "../../core/api/news.service"
import { NewsPage } from "../../core/api/news-response"

@Component({
  selector: "app-news-feed",
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <section class="surface news-surface" aria-label="Market news" [attr.aria-busy]="loading()">
      <div class="section-title news-heading">
        <div><span class="eyebrow">Market updates</span><h2>Latest news</h2></div>
        @if (preview()) { <a routerLink="/client/news">All news</a> }
        <button type="button" class="secondary-button" [disabled]="loading()" (click)="reload()">Refresh</button>
      </div>
      @if (loading()) { <p class="empty-state" role="status">Loading market news...</p> }
      @else if (error()) {
        <div class="news-notice" role="alert">
          <span>{{ error() }}</span>
          <button type="button" class="secondary-button" (click)="reload()">Retry</button>
        </div>
      } @else if (articles().length) {
        <ul class="news-list">
          @for (article of articles(); track article.id) {
            <li class="news-article" [class.news-with-image]="article.image && !failedImages().includes(article.id)">
              @if (article.image && !failedImages().includes(article.id)) {
                <img class="news-image" [src]="article.image" alt="" loading="lazy" referrerpolicy="no-referrer" (error)="hideImage(article.id)">
              }
              <div class="news-article-copy">
                <div class="news-meta">
                  <span>{{ article.source || 'Source unavailable' }}</span>
                  @if (article.publishedAt !== null) {
                    <time [attr.datetime]="isoDate(article.publishedAt)">{{ article.publishedAt | date:'MMM d, y, h:mm a' }}</time>
                  } @else { <span>Published time unavailable</span> }
                </div>
                <h3>
                  @if (article.url) {
                    <a [href]="article.url" target="_blank" rel="noopener noreferrer">{{ article.headline }}<span class="news-external"> (opens in new tab)</span></a>
                  } @else { {{ article.headline }} }
                </h3>
                @if (article.summary) { <p class="news-summary" [class.news-summary-preview]="preview()">{{ article.summary }}</p> }
                @if (article.entities.length) {
                  <ul class="news-symbols" aria-label="Related symbols and entities">
                    @for (entity of article.entities; track entity) { <li>{{ entity }}</li> }
                  </ul>
                }
              </div>
            </li>
          }
        </ul>
      } @else { <p class="empty-state" role="status">No market news found.</p> }
      @if (!preview()) {
        <nav class="news-pagination" aria-label="News pagination">
          <button type="button" class="secondary-button" [disabled]="loading() || requestedPage() <= 1" (click)="goToPage(requestedPage() - 1)">Previous</button>
          <span role="status">Page {{ requestedPage() }}</span>
          <button type="button" class="secondary-button" [disabled]="loading() || !!error() || !result()?.hasNext" (click)="goToPage(requestedPage() + 1)">Next</button>
        </nav>
      }
    </section>
  `,
})
export default class NewsFeedComponent {
  private readonly news = inject(NewsService)
  readonly preview = input(false)
  readonly symbols = input("")
  readonly requestedPage = signal(1)
  private readonly refresh = signal(0)
  readonly result = signal<NewsPage | null>(null)
  readonly loading = signal(true)
  readonly error = signal("")
  readonly failedImages = signal<string[]>([])
  readonly articles = computed(() => {
    const articles = this.result()?.articles ?? []
    return this.preview() ? articles.slice(0, 3) : articles
  })

  constructor() {
    effect(() => {
      this.symbols()
      this.requestedPage.set(1)
    })
    effect((onCleanup) => {
      const page = this.requestedPage()
      const symbols = this.symbols()
      this.refresh()
      this.loading.set(true)
      this.error.set("")
      this.result.set(null)
      this.failedImages.set([])
      const subscription = this.news.getNews(page, symbols).subscribe({
        next: (result) => {
          this.result.set(result)
          this.loading.set(false)
        },
        error: (error: unknown) => {
          this.error.set(newsErrorMessage(error))
          this.loading.set(false)
        },
      })
      onCleanup(() => subscription.unsubscribe())
    })
  }

  reload() {
    this.refresh.update((value) => value + 1)
  }

  goToPage(page: number) {
    this.requestedPage.set(page)
  }

  hideImage(id: string) {
    this.failedImages.update((ids) => [...ids, id])
  }

  isoDate(timestamp: number) {
    return new Date(timestamp).toISOString()
  }
}
