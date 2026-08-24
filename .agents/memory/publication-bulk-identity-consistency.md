---
name: Publication bulk identity consistency
description: Safe identity resolution for publication workbook imports
---

**Rule:** Resolve every supplied publication identifier independently: explicit ID, canonical DOI, normalized PMID, and title/date/journal composite. All matched identifiers must resolve to the same record; reject ambiguity or cross-key conflicts.

**Why:** Priority matching can select one publication and overwrite it with an identifier that belongs to another publication, corrupting future imports even when each individual identifier appears valid.

**How to apply:** Canonicalize DOI values for both matching and persistence. Build the union of candidates from every supplied key before selecting a record. Accept an update only when the union is empty or contains exactly the explicit/single matched ID.