---
name: Preprint classification vs merge provenance
description: Why prepublicationSite/Url must not be used to decide whether a record IS a preprint
---
Rule: classify a publication record as a preprint only from its DOI prefix, publicationType, or journal text — never from `prepublicationSite`/`prepublicationUrl`.

Preprint records keep the preprint DOI as `prepublicationUrl`; the primary DOI, PMID, journal, volume, issue, and publication date belong only to the eventual publication and must remain clear until that publication exists.

**Why:** the preprint→published merge flow deliberately copies the preprint's site/link onto the surviving published record for provenance. Using those fields as evidence reclassifies published survivors as preprints (caught by code review when the scientist-profile list started grouping preprints on top).

**How to apply:** when calling `isPreprintRecord` on records that may be merge survivors, blank `prepublicationSite`/`prepublicationUrl` first (see PublicationsList grouping). Inside dedup itself the field is still used to distinguish bioRxiv vs medRxiv server names — that's naming, not classification. When importing or repairing a preprint, move its DOI into the prepublication URL and clear publication-only identifiers and citation metadata.

Related: preprint DOI prefixes live in `PREPRINT_DOI_PREFIXES` (includes Authorea `10.22541/`); `normalizeDoi` strips trailing `vN` and Authorea-style `/vN` version markers for those prefixes.
