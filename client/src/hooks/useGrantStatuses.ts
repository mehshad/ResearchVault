/**
 * The grant statuses the office has configured, for the screens that offer them.
 *
 * Statuses became rows the Research Office maintains, and the server loads that
 * table into the registry every lifecycle rule reads. The browser never got the
 * same treatment: `GRANT_STATUS_OPTIONS` is a literal in shared/grantLifecycle,
 * so the configuration page listed all sixty-six while the grant form -- the
 * one place the list is actually used -- still offered the built-in thirteen.
 *
 * This hook closes that gap at both ends. It supplies the options to render,
 * and it feeds the same rows into the browser's copy of the registry, so
 * grantStatusImpliesAward() and friends can answer for a status the office
 * invented. Without the second half the dropdown would list "Award Pending" and
 * then decline to tick Awarded when it was chosen, because the rule would not
 * recognise the word.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { GRANT_STATUS_OPTIONS } from "@shared/grantLifecycle";
import { setGrantStatusRegistry } from "@shared/grantStatusRegistry";
import type { GrantStatusStage } from "@shared/grantStatusStages";

export interface GrantStatusRow {
  id: number;
  value: string;
  label: string;
  stage: GrantStatusStage;
  sortOrder: number;
  isBuiltIn: boolean;
  retiredAt: string | null;
}

export interface GrantStatusOption {
  value: string;
  label: string;
}

export interface UseGrantStatuses {
  /**
   * What a status dropdown should offer: everything not retired.
   *
   * Retiring a status is how the office stops new grants being set to it.
   */
  options: GrantStatusOption[];
  /**
   * Every status, retired ones included, for turning a stored value into a
   * label. A grant that still carries a retired status has to keep showing its
   * name rather than falling back to the raw value.
   */
  all: GrantStatusOption[];
  isLoading: boolean;
}

export function useGrantStatuses(): UseGrantStatuses {
  const { data, isLoading } = useQuery<GrantStatusRow[]>({
    queryKey: ["/api/grant-statuses"],
    // The list changes when an administrator edits it, which is rare, and every
    // grant screen asks for it. One fetch per session is the right trade.
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    // An empty or failed load leaves the built-in thirteen in place, which is
    // what the rules meant before the table existed. setGrantStatusRegistry
    // ignores an empty list for the same reason.
    if (!data?.length) return;
    setGrantStatusRegistry(
      data.map((row) => ({
        value: row.value,
        label: row.label,
        stage: row.stage,
        sortOrder: row.sortOrder,
        isBuiltIn: row.isBuiltIn,
      })),
    );
  }, [data]);

  // Falling back to the built-in list rather than to nothing: an empty status
  // dropdown would make the grant form unusable, and these thirteen are still
  // correct, just incomplete.
  if (!data?.length) {
    const builtIn = GRANT_STATUS_OPTIONS.map(({ value, label }) => ({ value, label }));
    return { options: builtIn, all: builtIn, isLoading };
  }

  const toOption = (row: GrantStatusRow): GrantStatusOption => ({
    value: row.value,
    label: row.label,
  });

  return {
    options: data.filter((row) => !row.retiredAt).map(toOption),
    all: data.map(toOption),
    isLoading,
  };
}
