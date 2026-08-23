---
name: HMR-stable React contexts
description: Preventing Vite Fast Refresh from splitting React context identity
---

**Rule:** Keep the context object, provider component, consumer hook, and frequently edited fixture/constants data in separate modules.

**Why:** A mixed module that exports a provider, hook, and changing constants can become an incompatible Vite refresh boundary. A stale browser may retain one context instance while reloaded consumers import another, causing “hook must be used within provider” even when the JSX provider hierarchy is correct.

**How to apply:** Put `createContext` in a stable non-component module, export the provider from a component-only module, export the hook from a hook-only module, and keep demo/test identity arrays elsewhere. Restart after renaming modules so Vite discards stale resolved filenames.