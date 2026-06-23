---
name: Server code requires manual workflow restart
description: Backend edits don't hot-reload in this project; restart the workflow before testing API changes.
---

The dev workflow runs `tsx server/index.ts` **without** `--watch`, so edits to
`server/*.ts` (routes, storage, etc.) do NOT take effect until the workflow is
restarted. Only the Vite client gets HMR.

**Why:** Symptom of stale server code is that new API routes return the Vite
`index.html` (HTTP 200, `Content-Type: text/html`) instead of JSON — the request
falls through to the Vite catch-all because the route isn't registered in the
still-running old process. The Express request log will still show `200` for the
path, which is misleading (it's the catch-all, not your handler).

**How to apply:** After any backend change, call `restart_workflow("Start application")`
before curl/browser testing. Don't trust a `200` alone — check `Content-Type` is
`application/json`. (The fullstack-js skill claims the workflow auto-restarts on
edits; that holds for client HMR but not for server-side reloads here.)
