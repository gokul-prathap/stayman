# React + Vite

## Workspace performance update (migration 026)

Apply [`supabase/migrations/202610210026_bounded_workspace_queries.sql`](supabase/migrations/202610210026_bounded_workspace_queries.sql) after migration 025 **before deploying this client**. It adds three staff-authorized read RPCs and supporting indexes. No existing records or write workflows are changed. The client intentionally does not fall back to downloading all historical data if these RPCs are missing.

The workspace keeps its navigation mounted while routes load. Notifications poll once per minute while visible and online; unchanged data does not reload dashboard history. Dashboard/report queries use date windows, reservation and expense lists use server pagination, and booking forms check their selected dates. Local performance findings and test scope are recorded in [`qa/PERFORMANCE-CHANGES.md`](qa/PERFORMANCE-CHANGES.md).

Validation: `npm run build` and `node --test tests/*.test.mjs`. The new SQL tests run locally in PGlite using synthetic fixtures and do not contact Supabase. Browser scripts under `qa/` require Python Playwright and Microsoft Edge; run the production preview on port 4173 and `node qa/workspace-server.mjs` on port 4174 before running `qa/performance-after.py` or `qa/workspace-smoke.py`.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
