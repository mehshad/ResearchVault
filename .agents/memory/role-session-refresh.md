---
name: Role changes and active sessions
description: Explains why user-management role changes can disagree with active permissions until the session is refreshed.
---

Roles selected in User Management are stored on the user record, while authenticated sessions also contain a serialized copy of the role. `/api/auth/me` refreshes that session user from the database so a page reload picks up role changes.

**Why:** Without refreshing, a user can retain an old role for the full session lifetime. That blocks newly granted access and can also preserve permissions that were removed.

**How to apply:** When changing role storage or permission gates, keep the database user as the source of truth and refresh the session identity before the client relies on it. Users should reload or sign in again after an administrator changes their role.