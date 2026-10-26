# Making warehouse analytics return real data

## Verified findings

The Angular routes match the Python API on localhost:5000. During investigation,
`/openapi.json` responded, but each of these direct Python requests exceeded a
30-second deadline: overview with 30 days, overview with 3650 days, orders with
limit 1, and trends with 30 days. This is a **backend/warehouse availability or
query-performance blocker**, not a browser rendering or proxy-path problem.
No database rows, ETL checkpoints, credentials, or configuration values were
modified. Live warehouse correctness remains unverified until requests complete.

Frontend fixes now handle the actual response contracts: pandas JSON strings,
native arrays/objects, `total_orders` pagination, KPI fields, client exclusions,
and shared JSON-backed charts. A report cannot display records Python has not
returned. Never replace an empty client report with a different client's data,
fabricated holdings, operational-store totals, or a silently expanded date range.

## Required backend fixes before expecting successful live reports

1. **Bound database work.** In the Python warehouse connection helper, configure
   a connection deadline (for example 5 seconds), statement deadline (for example
   10 seconds), and lock deadline (for example 3 seconds). If using a pool, also
   bound pool size and acquisition time. These must finish before Angular's
   20-second request deadline. Close/rollback connections on every error.
   Cancelling a browser request does not necessarily cancel a synchronous query.
2. **Verify the warehouse connection and schema.** Analytics reads
   `WAREHOUSE_DB_HOST/PORT/NAME/USER/PASSWORD`. The separate ETL implementation
   uses `TARGET_DB_*`; the bundled ETL uses `WAREHOUSE_DB_*`. Confirm privately
   that the selected pipeline writes to the same database/schema analytics reads.
   Do not expose connection strings or secrets in API errors or health responses.
3. **Verify warehouse population and freshness.** Check row counts and latest
   fact dates for clients, instruments, holdings, orders, transactions, and prices;
   check the last successful ETL run and logs. A newly created trading account or
   trade is not automatically present in the warehouse. Compare only the signed-in
   account's operational client ID with its corresponding warehouse client ID.
4. **Fix the chosen ETL, not both blindly.** Source review found potential
   incompatibilities: nested tuple timestamp binding in `queryRunner`, watermark
   `name_id` versus DDL `etl_name`, non-underscored price fields versus warehouse
   underscored fields, and extraction requiring `updated_at` not present in the
   supplied source DDL. Check deployed migrations before applying changes.
5. **Extract orders independently of current holdings.** The inspected extractor
   joins orders to holdings, omitting orders whose positions do not currently
   exist. `order_date` alone misses later status changes; use a modification
   watermark or another reliable change-data mechanism. Synchronize holdings
   independently and reconcile removals. Upsert missing checkpoint rows and
   populate instruments before dependent facts. Do not run an additive holdings
   repair that ignores sells.
6. **Investigate slow queries.** Examine connection waits, blocked statements,
   query plans and indexes for order date/client/ticker/status filters. The KPI
   endpoint executes multiple aggregate scans; consolidate where appropriate.
   A small orders page still performs a full filtered count. Do not hide failures
   as zero metrics or successful empty responses.

The source indicates JWT `sub` is the operational client primary key, copied by
ETL into the warehouse; there is no separate surrogate-key mapping in that path.
If the deployed warehouse was independently seeded, fix identity alignment
server-side rather than selecting an arbitrary existing warehouse client.

## Endpoint contract improvements

No new report endpoint is required for the current screens. The following
observability and response-contract changes are strongly recommended:

| Endpoint/change | Required behavior |
| --- | --- |
| Add `GET /health/live` | Cheap liveness response, no database query. |
| Add `GET /health/ready` | Bounded warehouse ping; 200 when ready, 503 when unavailable. Do not return secrets. |
| Add employee-only `GET /api/analytics/data-coverage` | `last_successful_etl_at`, `min_order_date`, `max_order_date`, `latest_price_at`, source identifier, and freshness status. This lets employees deliberately select valid report dates. |
| Catalogue and transactions | Return native records (`to_dict(orient='records')`) rather than a JSON string inside JSON. Angular accepts both during migration. |
| Orders | Retain `{total_orders, orders, limit, offset}` and document it with a response model. |
| All reports | Use typed response models and JSON-safe native values; convert NaN/Infinity to null. Return meaningful 503/504 for DB failure/timeouts, not a misleading 404 or empty success. |
| Client holdings/allocation | Validate client existence. Include freshness metadata and distinguish no holdings, missing quotes, and incomplete fulfilled-order history. |
| Transactions | Include transaction type and timestamp if available. Current SQL returns only transaction ID, first name, and amount; Angular cannot reconstruct ticker, date, or trade side. |
| Stock statistics | Use the latest available trading session or explicitly return no recent quotes. The current implementation requires today's America/Chicago quotes; weekends/market holidays may legitimately be empty. |

`GET /api/analytics/` currently mixes **all-time** trade/volume/client totals with
period-filtered activity metrics. The UI labels this explicitly. Change backend
aggregates if a consistently period-filtered overview is intended. Shared
report date filters are based on database `CURRENT_DATE`; historical warehouse
data can be outside the default 30-day window. Do not automatically fall back to
all-time and label it "30 days".

## Historical total portfolio value

The inspected APIs have no historical total account valuation endpoint. The
overview currently displays real observations taken while the page is open,
not an assertion of pre-existing account history. To supply true `1D/1W/1M/1Y`
history, add an authenticated principal-scoped endpoint such as
`GET /api/v1/clients/portfolio-history?from=<UTC>&to=<UTC>` (proposed, not currently
called by Angular). Return currency, valuation method, coverage, missing/stale
quote indicators, and points shaped as `{timestamp,cash,invested,total}`.

Build those points from persisted valuation snapshots or a complete event ledger:
opening cash/holdings, deposits/withdrawals/adjustments, executed trades with actual
UTC execution time, sold positions, and latest permissible historical prices at
or before each sample. The inspected order API only exposes placement time and
current fulfillment status, not execution time; the transaction stream does not
record every executed buy/sell. Multiplying today's quantities by historical
prices or summing deposits does not produce valid total portfolio history.

The current frontend independently reads authenticated profile cash and holdings
and validates both owners. Quote currency must be USD/common quote currency;
multi-currency accounts require server-side FX conversion with timestamped rates.

## Security and rollout

Python performs no authentication. Direct `/analytics-api` proxying is for
trusted local development only. Production must use an authenticated gateway
that derives client IDs from its principal and restricts employee analytics to
REPORTER/ADMIN. Retain `Cache-Control: no-store`. A bearer header forwarded to an
unauthenticated Python endpoint does not enforce authorization.

## Verification

- `pnpm check:analytics` verifies the published routes and a bounded aggregate
  warehouse request; it exits nonzero on timeout or invalid responses.
- `pnpm check:analytics --contracts-only` only checks published GET routes and
  does not access warehouse data. `ANALYTICS_BASE_URL` can point to a trusted local
  proxy (for example `http://localhost:4200/analytics-api`) to test rewriting.
- Run `pnpm test`, `pnpm typecheck`, and `pnpm build` for frontend validation.
- After warehouse readiness passes, sign in with a real client, verify that its
  expected holdings and transaction IDs match warehouse records, then verify
  employee report totals with the same explicit dates/statuses. Do not use test
  JWTs or mocked reports to claim live warehouse validation.