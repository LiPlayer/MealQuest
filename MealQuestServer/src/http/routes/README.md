# HTTP Route Modules

## Goal
Keep `createHttpRequestHandler` as a thin dispatcher and move business routes into domain modules.

## Module Ownership
- `preAuthRoutes.ts`: public endpoints and callback endpoints that do not require JWT auth.
- `systemRoutes.ts`: state/audit/websocket status query endpoints.
- `paymentRoutes.ts`: payment quote/verify/refund/ledger endpoints.
- `invoiceRoutes.ts`: invoice issue and list endpoints.
- `privacyRoutes.ts`: privacy export/delete/cancel endpoints.
- `merchantRoutes.ts`: merchant dashboard, strategy (including strategy chat), policy lifecycle, contract, supplier, kill-switch endpoints.
- `allianceRoutes.ts`: alliance config/store/sync endpoints.
- `tenantRoutes.ts`: tenant policy and migration endpoints.

## Contract
Each module exports a route handler factory. The produced handler must:
1. Return `true` when request is handled.
2. Return `false` when request path/method does not match.
3. Throw on business errors and let top-level dispatcher map status code and audit failure logs.
