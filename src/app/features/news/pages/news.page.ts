import { Component } from "@angular/core"
import NewsFeedComponent from "../news-feed.component"

@Component({
  selector: "app-news-page",
  standalone: true,
  imports: [NewsFeedComponent],
  template: `
    <div class="page-wrap">
      <div class="page-intro"><div><span class="eyebrow">Markets</span><h1>News</h1><p>Latest market headlines and company news.</p></div></div>
      <app-news-feed />
    </div>
  `,
})
export default class NewsPage {}
