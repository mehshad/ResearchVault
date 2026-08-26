---
name: Container migration registration
description: Keep the explicit self-hosted migration sequence synchronized with schema migrations.
---

Every new database migration must be added to the explicit container startup
migration sequence in dependency order.

**Why:** A merge preserved migration files and application code but dropped
their startup registration. Development remained healthy because its database
was already migrated, while fresh container deployments would have lacked
required publication, user, organization, and grant fields.

**How to apply:** When adding or merging a migration, verify that every startup
migration reference exists and that all schema-critical migrations are included.
Keep lifecycle or integrity-constraint migrations fail-closed.