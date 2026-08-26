---
name: Protected GitHub workflows
description: Repository authorization forbids any changes under .github/workflows.
---

Never add, edit, delete, restore, rename, or otherwise include changes under
`.github/workflows/`.

**Why:** The repository credentials are not authorized to modify GitHub Actions
workflow files. Any commit that touches these paths prevents the branch from
being pushed, including a revert commit that changes them again.

**How to apply:** Exclude `.github/workflows/**` from merges, cherry-picks,
restorations, and automated cleanup. If workflow changes enter local history,
rewrite the affected commits so the branch history never touches those paths;
do not use a revert.