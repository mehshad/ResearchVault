---
name: Publication Office runtime checks
description: Why changes to the legacy Publication Office page require a live tab smoke test.
---

The legacy Publication Office page suppresses TypeScript checking, so unbound component state and missing JSX imports can survive both the normal type check and the Vite production build.

**Why:** A preprint-panel change compiled and bundled successfully while the affected Outcome Office tab still crashed at render time from undefined identifiers.

**How to apply:** After changing this page, open every affected Outcome Office tab in the live preview and inspect the browser console. Do not treat type-check and build success alone as sufficient verification until the suppression is removed.