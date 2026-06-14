# Changelog Archive

Older changelog entries moved out of `replit.md` to keep the project README concise.
Newest archived entries first. The active changelog lives in `replit.md`.

- May 31, 2026. Made the IBC application edit page's right sidebar (Communication History, Submission Comment, Save/Submit) collapsible on desktop to give the main form more editing width
- January 20, 2026. Redesigned IBC application edit page with two-column layout: main form on left, sticky right sidebar with Communication History, Submission Comment, and Save/Submit buttons for better usability
- January 20, 2026. Removed redundant Risk Group Classification field from IBC applications as Biosafety Level already provides this information
- January 15, 2026. Added Team Management functionality to Settings with three tabs (Layout & Theme, Team Members, Feature Requests). Team members can be categorized as Element Leads, Faculty Testers, or Developers with full CRUD operations and photo support.
- January 6, 2026. Added configurable abbreviations (PRM/PRJ/SDR etc.) per institution with sidebar integration
- January 6, 2026. Added WCM-Q (Weill Cornell Medicine-Qatar) as third institution with Cornell red color theme
- January 6, 2026. Added configurable project management labels (Tier 1/2/3) per institution in Settings with localStorage persistence
- January 6, 2026. Renamed QBRI to HBKU (Hamad Bin Khalifa University) in theme system
- December 29, 2025. Added external profile links to Staff information page: ORCID, LinkedIn, Google Scholar, and Web of Science Author Profile with clickable buttons and branded icons
- September 1, 2025. Added pagination (100 records per page) and column sorting to Publication Office for faster loading of 3,000+ journal records
- September 1, 2025. Enhanced publication detail pages to show three-year impact factor comparison: year before publication, publication year (bold/larger), and most current year
- September 1, 2025. Implemented clickable column headers with sort indicators for all JCR fields with default rank ascending sort
- September 1, 2025. Enhanced journal impact factor system to include comprehensive JCR fields: ISSN, eISSN, Total Articles, Citable Items, Cited/Citing Half-Life metrics, 5-Year JIF, JIF Without Self-Cites, and JCI with full database schema and import functionality
- September 1, 2025. Updated Publication Office interface to display all JCR fields in tabular format with 28,480+ journal records
- September 1, 2025. Added impact factor display to publication detail pages showing current year and previous year metrics with quartile color-coding
- September 1, 2025. Added journal impact metrics summary to scientist overview pages
- August 24, 2025. Added comprehensive NIH Guidelines tab to IBC applications with 5 sections (III-A/B/C, III-D, III-E, III-F, Appendix C) following NIH recombinant DNA research requirements
- August 24, 2025. Added Protocol Summary field to IBC application Overview tab with enhanced guidance text for both Project Description and Protocol Summary fields
- August 24, 2025. Removed redundant Submission Comments field from Overview tab to eliminate duplication
- August 24, 2025. Implemented unified read-only view functionality for IBC applications using single edit page with conditional form disabling based on application status
- August 24, 2025. Added View/Edit button logic to IBC application list - Edit button for drafts only, View button for all applications
- August 24, 2025. Fixed data integrity bug where principalInvestigatorId was reset to 0 during form submissions due to || operator instead of ?? nullish coalescing
- August 24, 2025. Standardized timeline displays across all application views using unified TimelineComments component with proper comment content display and removal of redundant status change entries
- August 24, 2025. Implemented separate IBC comments table for reliable communication tracking with proper timestamps and author information
- August 24, 2025. Fixed reviewer feedback workflow to return applications to "vetted" status for revision requests
- August 24, 2025. Added comment validation requiring office users to provide comments before executing workflow actions
- August 24, 2025. Updated scientist management: removed role field and isStaff toggle, added "Management" job title, replaced with line manager field
- August 24, 2025. Enhanced program forms: replaced text fields with scientist dropdown selections for director and co-lead positions
- August 24, 2025. Created scientist edit form with full CRUD functionality including line manager selection
- July 17, 2025. Implemented comprehensive IBC timeline ordering system with content-based chronological workflow progression
- July 17, 2025. Fixed React rendering errors and converted office comments from single text to JSON array format
- July 17, 2025. Added draft status and priority-based timeline sorting ensuring proper workflow sequence
- June 29, 2025. Initial setup
