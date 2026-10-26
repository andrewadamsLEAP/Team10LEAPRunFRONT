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
