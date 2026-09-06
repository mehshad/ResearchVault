/**
 * The scope control shared by the two Research Portfolio pages.
 *
 * Both pages ask the same question of a record -- is this mine, my section's,
 * or neither -- and the server answers it per row (see
 * shared/researchPortfolioScope.ts). What is left here is what the interface
 * does with that answer: which rows a scope shows, and what to say when a scope
 * shows none.
 *
 * The empty message matters more than it looks. "No grants found" is the same
 * sentence whether the section is genuinely idle, the viewer has no staff
 * record, or their profile was never placed in the organisation -- and only the
 * last two are something the viewer can get fixed. Saying which it is turns a
 * page that looks broken into one that says what to do.
 */

/** How a record concerns the viewer, as the server reports it. */
export type Involvement = "mine" | "team" | null;

/** Which records the page is showing. */
export type PortfolioScope = "all" | "mine" | "team";

/** The viewer summary both portfolio endpoints return alongside their rows. */
export interface PortfolioViewerSummary {
  scientistId: number | null;
  sectionId: number | null;
  /** Management and administrators: no section boundary applies. */
  seesEverything: boolean;
  /** People in the viewer's section, including them. null when unbounded. */
  sectionSize: number | null;
}

/** The response shape both portfolio endpoints share. */
export type PortfolioResponse<T> = T & { viewer: PortfolioViewerSummary };

/** Whether a row belongs in the chosen scope. */
export function matchesScope(involvement: Involvement, scope: PortfolioScope): boolean {
  if (scope === "all") return true;
  if (scope === "mine") return involvement === "mine";
  // "My section" includes what is mine: my own work is my section's work, and
  // excluding it would make the section view an odd "everyone but me" list.
  return involvement === "mine" || involvement === "team";
}

/**
 * Why the viewer cannot use the scope filter, or null when they can.
 *
 * Both reasons are configuration gaps rather than anything the viewer did, so
 * the control stays visible and disabled with the reason attached. Hiding it
 * would make a working feature look missing.
 */
export function scopeUnavailableReason(
  viewer: PortfolioViewerSummary | undefined,
): string | null {
  if (!viewer || viewer.seesEverything) return null;
  if (viewer.scientistId == null) {
    return "Your account is not linked to a staff profile, so we cannot tell which records are yours.";
  }
  if (viewer.sectionId == null) {
    return "Your staff profile has not been placed in a section, so we cannot tell which records are your section's.";
  }
  return null;
}

/**
 * What to say when the chosen scope has nothing in it.
 *
 * `noun` is the plural the page uses ("grants", "contracts"). `filtered` says
 * whether a search or another filter is also narrowing the list, so an empty
 * result is not blamed on the scope when something else caused it.
 */
export function scopeEmptyMessage(
  scope: PortfolioScope,
  viewer: PortfolioViewerSummary | undefined,
  noun: string,
  filtered = false,
): string {
  const unavailable = scopeUnavailableReason(viewer);
  if (unavailable && scope !== "all") return unavailable;

  if (filtered) return `No ${noun} match the filters you have set.`;

  if (scope === "mine") return `You are not named on any ${noun}.`;
  if (scope === "team") {
    // Management has no section, so the scope means "records with somebody
    // named on them". Telling them their section is empty would describe a
    // boundary they do not have.
    if (viewer?.seesEverything) return `No ${noun} have anybody named on them.`;
    if (viewer && viewer.sectionSize === 1) {
      return `You are the only person in your section, and you are not named on any ${noun}.`;
    }
    return `Nobody in your section is named on any ${noun}.`;
  }
  return `There are no ${noun} on record.`;
}
