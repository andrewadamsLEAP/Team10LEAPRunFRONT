# Team10LEAPRunFRONT

Frontend for the Veridian trading application.

## Install

```powershell
npm install --global pnpm
```

## Commands

```powershell
pnpm start
pnpm typecheck
pnpm test
pnpm build
```

## Structure

Application source lives under `src/`:

- `src/app/core/` contains application-wide state, models, authentication, and
  route guards.
- `src/app/shared/` contains reusable presentation components.
- `src/app/features/` contains route-owned product areas. Orders, transactions,
  holdings, market list/detail/trade, client analytics, and account directory
  versus management are separate pages.
- `src/styles/` contains global styles composed from foundation, auth, client,
  dashboard/market, trade, data-table, employee/account, and responsive files.

The project uses standalone Angular components. Feature code may depend on
`core` and `shared`; `core` must not depend on feature code, and `shared` must
remain free of business logic.

## Table sorting

Data column headers across client, admin, and reporter tables support click,
Enter, and Space to cycle ascending, descending, and the original/default order.
The active direction is shown with an arrow and exposed through `aria-sort`.
IDs sort naturally, numeric amounts use underlying values rather than formatted
currency text, and date columns sort chronologically. Missing values stay last
in both directions. Each table maintains its own sort state, preserves filters
and row actions, and reapplies sorting to updated data without mutating it.
Action-only and empty navigation columns are not sortable.

Sorting applies to loaded rows. Paginated analytics reports sort the current page,
not the entire server-side result set; existing report ranking filters remain
available for server-side ranking. Charts themselves retain their original order
when the chart-value table is sorted. Run `npm run test:sorting` for sorting tests.

## Market price refresh

The portfolio chart's 1D view supplements backend history with actual holdings
valuations collected every five seconds while the dashboard is open. These
memory-only observations cover at most 24 hours and do not fabricate finer
historical samples. Backend samples replace overlapping live observations.
The 1W, 1M, and 1Y views continue to plot backend history only.

Market quotes refresh every five seconds when no refresh is already running.
Instrument names and statistics come from the instrument endpoint; bid/ask and
quote timestamps come from `/api/v1/trading/market-data/prices/{ticker}`, the
same latest-price source used by the dashboard valuation. The newest recorded
quote matching the ticker is selected, and daily change is recalculated from it.
Slower batches are allowed to finish instead of being cancelled by the next
poll. Each batch has a 15-second deadline. Refresh failures retain existing
quotes, show an out-of-date warning, and retry on subsequent polling ticks.
The Markets tab also provides Retry now. Run `npm run test:markets` to verify
slow responses, timeout recovery, failure recovery, and empty catalogues.

Daily percentage change is calculated as `(midpoint - previousClose) /
previousClose * 100`, using the bid/ask midpoint (one-sided quote fallback)
consistently on Markets, overview, and ticker detail. Invalid or missing prices
or previous closes produce an unavailable change, not zero. Backend previous
closes must be for the same instrument, currency/pair direction, and previous
trading session; the frontend cannot repair a stale or mismatched baseline.

## Market news

The client overview previews three articles; the News tab (`/client/news`)
shows paginated results from `GET /api/v1/news?limit=25&page=1&language=en`.
The shared feed accepts an optional comma-separated `symbols` input, passed as
the `symbols` query parameter. Requests use `HttpClient` and the existing JWT
interceptor, including session-expiry handling. There are no direct Marketaux
calls or provider credentials in the frontend.

The backend returns Marketaux JSON with `meta` and `data`. Articles use `uuid`,
`title`, `description` (or `snippet`), `source`, `published_at`, `entities`,
`image_url`, and `url`. Pagination uses `meta.found`, `meta.returned`, and
`meta.limit`; when no total is provided, a full page permits requesting the next.
Responses wrapped in a single `data` envelope are also accepted. Missing `meta`
does not block valid articles: pagination then uses the returned article count
and requested page size. Invalid article lists still display an explicit error.
Images and original article links accept HTTP(S) URLs only. Missing timestamps
are explicitly unavailable and failed images are removed.

Loading, empty, retry/error, refresh, and previous/next-page states are provided.
Page changes and leaving the feed cancel pending requests. Pagination replaces
the visible page rather than accumulating duplicates, and each response is
deduplicated by UUID and ordered newest first. Run `npm run test:news` for
response, request, pagination, and state tests.

## Python analytics

All analytics use the Python app on **port 5000**, not the authentication API on
port 3000 or Spring on port 8085. The existing development proxy strips
`/analytics-api` and forwards to `http://localhost:5000`. For example,
`/analytics-api/api/analytics/clients/47/allocation` forwards to
`http://localhost:5000/api/analytics/clients/47/allocation`.
Restart Angular after changing the proxy. Python's `/openapi.json` lists the
supported routes; missing routes require the matching Python app version.

- `/client/analytics`: signed-in client's top gaining holdings, allocation,
  allocation chart, order counts, and order-status chart. Transaction history
  stays on the dedicated Transactions tab and is not requested by analytics.
- `/reporter/analytics` and `/admin/analytics`: instrument rankings, orders over
  time, filtered/paginated orders, trading volume, most-active instrument, and
  client activity trend. Every displayed employee report supports the same
  instrument, client, date-range, and status filters. Unfiltered legacy
  overview/segments/catalogue/stock statistics remain available in the API service
  but are not mixed into this filtered reporting screen.

Client IDs come from the signed-in client's JWT subject; there is no editable
client selector on the client page. Employee reports support days, ticker,
client ID, date range, status, granularity, ranking, limits, and chart metric
where supported by Python. Client allocation is a percentage pie with separate
stock/crypto/bitcoin/other categories (including zero-percent legend entries).
Gainers show up to five holdings sorted by unrealized profit descending; rankings
can include losses when fewer than five holdings have positive gains. Client
holdings, allocation, and transactions are not date-filtered; client order status
uses the day period.
Trading volume defaults to fulfilled orders when status is left blank.

JSON reports unwrap Python's `{ status, data }` response, decode legacy pandas
JSON strings, and present known KPIs, tables, and chart data. Pagination uses
Python's `total_orders`. Charts share JSON requests with their tables, avoiding
duplicate warehouse queries through PNG endpoints. PNG methods remain available
in the service for export consumers. Reports fail independently, default refresh
work is limited to two concurrent report subscriptions (plus the paginated orders
request), stale requests are cancelled, and each report has a bounded timeout and
retry action. Missing values remain unavailable rather than fabricated zeros.

Overview trade and volume KPIs are currently all-time in Python; activity is
period-filtered. Empty warehouse results may require a wider period or ETL repair.
See [warehouse/backend requirements](docs/analytics-backend-requirements.md) for
verified backend blockers, required connection/query deadlines, ETL checks, and
recommended readiness/data-coverage endpoints. `pnpm check:analytics` tests route
availability and an aggregate warehouse response without requesting client data.

No extra npm packages are required: standalone components, forms, signals,
`HttpClient`, and RxJS are already installed and provided by this application.
Run `pnpm test:analytics`, `pnpm typecheck`, and `pnpm build` to validate.

### Overview portfolio chart and time buttons

The old dashboard used an instrument-price chart without supplying a ticker, so
it never loaded portfolio history. It is replaced with a dedicated portfolio-value
component. Current value uses the authenticated profile's cash balance plus actual
holdings marked at latest bid (ask fallback), not the seeded asset catalogue or
the incomplete deposit/withdrawal transaction sum. Missing quotes/cash make value
unavailable rather than silently reporting a cash-only or fabricated total.

The existing APIs do **not** provide historical portfolio values. The overview
therefore shows explicitly labelled real observations collected while that page
is open (refresh every 30 seconds). `1D`, `1W`, `1M`, `1Y` filter those observations
over rolling 1/7/30/365-day windows. Observations are memory-only, cleared on
account changes or leaving the component, and never backfilled using today's
holdings. Wider periods can legitimately show the same short coverage. A single
observation is displayed as a point, not a fake horizontal historical line.

For genuine month/year portfolio history, add an authenticated principal-scoped
snapshot/ledger endpoint as described in the backend requirements. Historical
execution timestamps, cash events, sold positions, and quotes are required;
price history alone cannot reconstruct account wealth correctly.

**Security:** the supplied Python app performs no authentication. Direct proxying
is appropriate only for trusted local development; Angular route guards and
decoded JWT IDs do not enforce server-side access control. Before deployment,
an authenticated gateway must derive client IDs from its principal and restrict
employee reports to REPORTER/ADMIN. Retain `Cache-Control: no-store` for private
reports. Production must route `/analytics-api` through that authorized gateway;
the bundled static Nginx configuration does not provide this routing.
The frontend also rejects unscoped employee-report calls made under client
claims, mismatched client IDs in report responses, and mismatched portfolio
profile/holding owners. These checks are defense in depth, not server security.
