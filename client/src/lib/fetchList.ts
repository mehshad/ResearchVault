/**
 * Fetch a list endpoint, tolerating a refusal.
 *
 * `fetch(url).then(res => res.json())` hands the response body straight to the
 * component whatever the status was. The navigation-access guards answer a
 * refused area with 403 and `{ message: "Forbidden. IBC office access
 * required." }`, so a component expecting an array receives an object, calls
 * .find() on it, and throws during render -- which React answers by unmounting
 * the tree. The page goes completely blank, with no error and nothing to act
 * on, and it looks like the application is broken rather than like a
 * permission being withheld.
 *
 * That is not hypothetical: /scientists fetches the IRB and IBC board member
 * lists, both behind office areas an Investigator is hidden from, so the whole
 * staff directory went blank for every non-administrator.
 *
 * A refusal yields an empty list here. The caller wanted a list of things it
 * may see, and it may see none of them -- which is materially different from
 * the request having failed, but identical in what the page should render.
 */
export async function fetchList<T>(url: string): Promise<T[]> {
  const response = await fetch(url, { credentials: "include" });

  // Refused, or gone. Neither is an error the page can do anything about, and
  // both mean "no rows for you".
  if (response.status === 403 || response.status === 404) return [];

  if (!response.ok) {
    // A real fault still surfaces, so react-query reports an error state
    // rather than the page rendering a confident empty list over a broken API.
    throw new Error(`${response.status} ${response.statusText} from ${url}`);
  }

  const data = await response.json();
  // A success that is not a list is a contract change, not data.
  return Array.isArray(data) ? (data as T[]) : [];
}
