import { useMemo } from "react";
import { X } from "lucide-react";
import type { ResearchActivity } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { NO_SDR_OPTION } from "@/components/SdrExemptionDialog";

/**
 * The two SDR fields on a publication form.
 *
 * Both are typed into rather than scrolled: the list runs to hundreds of
 * SDRs, and the person filling the form usually knows the number. Typing
 * "400029" or a word from the title narrows it to the one they mean.
 *
 * The first field is the primary SDR, the one on the record, and it carries
 * every rule -- the exemption, the score, the finalise check. The second is
 * optional: any other SDRs the paper also belongs to, so each of them lists
 * it. See shared/publicationSdrLinks.ts.
 */

const activityLabel = (activity: ResearchActivity) =>
  `${activity.sdrNumber} - ${activity.shortTitle || activity.title}`;

function activityOptions(
  activities: readonly ResearchActivity[],
  exclude: ReadonlySet<number>,
): SearchableSelectOption[] {
  return activities
    .filter((activity) => !exclude.has(activity.id))
    .map((activity) => ({
      value: String(activity.id),
      label: activityLabel(activity),
      // The number, both titles, and the status, so any of them finds it.
      searchText: `${activity.sdrNumber} ${activity.shortTitle ?? ""} ${activity.title} ${activity.status}`,
    }));
}

interface SdrComboboxProps {
  activities: readonly ResearchActivity[];
  loading?: boolean;
  /** The selected activity id, or null when none is chosen. */
  value: number | null;
  /** True when the form is carrying an exception instead of an SDR. */
  exceptionSelected?: boolean;
  /** A number for an SDR, or NO_SDR_OPTION when the exception row is picked. */
  onChange: (value: number | typeof NO_SDR_OPTION) => void;
  "data-testid"?: string;
}

export function SdrCombobox({
  activities,
  loading,
  value,
  exceptionSelected,
  onChange,
  ...rest
}: SdrComboboxProps) {
  const options = useMemo<SearchableSelectOption[]>(
    () => [
      ...activityOptions(activities, new Set()),
      {
        value: NO_SDR_OPTION,
        label: "No SDR applies - request an exception",
        searchText: "no sdr applies exception",
      },
    ],
    [activities],
  );
  return (
    <SearchableSelect
      options={options}
      value={value != null ? String(value) : exceptionSelected ? NO_SDR_OPTION : null}
      onChange={(selected) => onChange(selected === NO_SDR_OPTION ? NO_SDR_OPTION : Number(selected))}
      placeholder={loading ? "Loading research activities..." : "Type an SDR number or title"}
      searchPlaceholder="SDR number or title"
      emptyMessage="No research activity matches."
      disabled={loading}
      data-testid={rest["data-testid"]}
    />
  );
}

interface AdditionalSdrPickerProps {
  activities: readonly ResearchActivity[];
  /** The primary SDR, which is never offered here. */
  primaryId: number | null | undefined;
  selectedIds: readonly number[];
  onChange: (ids: number[]) => void;
  "data-testid"?: string;
}

export function AdditionalSdrPicker({
  activities,
  primaryId,
  selectedIds,
  onChange,
  ...rest
}: AdditionalSdrPickerProps) {
  const byId = useMemo(
    () => new Map(activities.map((activity) => [activity.id, activity])),
    [activities],
  );
  const options = useMemo(() => {
    const exclude = new Set<number>(selectedIds);
    if (primaryId != null) exclude.add(primaryId);
    return activityOptions(activities, exclude);
  }, [activities, selectedIds, primaryId]);

  return (
    <div className="space-y-2" data-testid={rest["data-testid"]}>
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedIds.map((id) => {
            const activity = byId.get(id);
            return (
              <Badge
                key={id}
                variant="outline"
                className="gap-1 pr-1 font-normal bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800"
                data-testid={`badge-additional-sdr-${id}`}
              >
                <span className="truncate max-w-[28rem]">
                  {activity ? activityLabel(activity) : `SDR #${id}`}
                </span>
                <button
                  type="button"
                  className="rounded-sm hover:bg-blue-100 dark:hover:bg-blue-900 p-0.5"
                  aria-label={`Remove ${activity?.sdrNumber ?? `SDR #${id}`}`}
                  onClick={() => onChange(selectedIds.filter((selected) => selected !== id))}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
      <SearchableSelect
        options={options}
        // Always empty: choosing adds to the list above, and the box resets.
        value={null}
        onChange={(selected) => onChange([...selectedIds, Number(selected)])}
        placeholder={selectedIds.length > 0 ? "Add another SDR" : "Add an SDR this paper also belongs to (optional)"}
        searchPlaceholder="SDR number or title"
        emptyMessage="No other research activity matches."
        data-testid="select-additional-sdr"
      />
    </div>
  );
}
