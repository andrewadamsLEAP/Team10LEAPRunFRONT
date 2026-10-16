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
