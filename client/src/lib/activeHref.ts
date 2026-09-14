/**
 * Which sidebar entry a location belongs to.
 *
 * An entry used to light up only on an exact match, so every detail, create
 * and edit page (/scientists/12, /grants/7/edit) showed nothing selected. It
 * is now the entry whose href is the page itself or the nearest ancestor of
 * it: the longest matching prefix wins, so /research-office/configuration
 * beats /research-office on its own page.
 *
 * The PMO pages are registered twice, under /pmo/... and bare, and in-app
 * links overwhelmingly use the bare form while the sidebar links to /pmo/.
 * Both spellings are the same place here.
 */
export function resolveActiveHref(location: string, hrefs: readonly string[]): string | null {
  const strip = (path: string) => path.replace(/^\/pmo(?=\/|$)/, "");
  const here = strip(location.split("?")[0]);
  let best: string | null = null;
  let bestLength = -1;
  for (const href of hrefs) {
    const candidate = strip(href);
    const matches = here === candidate || here.startsWith(`${candidate}/`);
    if (matches && candidate.length > bestLength) {
      best = href;
      bestLength = candidate.length;
    }
  }
  return best;
}
