import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info } from "lucide-react";

interface PersonLike {
  id: number;
  honorificTitle?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  jobTitle?: string | null;
}

interface PersonSelectProps {
  /** Who this field is allowed to pick, already filtered by the caller. */
  options: PersonLike[];
  /** Every staff record, so an already-assigned person can still be shown. */
  allStaff?: PersonLike[];
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  placeholder?: string;
  /** One line saying who appears in this list and why. */
  rule?: string;
  disabled?: boolean;
  testId?: string;
}

/** Sentinel for the explicit "clear this field" item; Radix forbids "". */
const NONE = "__none__";

export const personLabel = (person: PersonLike): string =>
  [person.honorificTitle, person.firstName, person.lastName].filter(Boolean).join(" ");

/**
 * A person picker that cannot silently lose the person already assigned.
 *
 * Each of these fields is restricted -- a Program Director must hold the
 * Investigator access role, a Clinical Co-Lead must have the Physician job
 * title -- and the restriction is applied to the *options*. So when somebody's
 * role changes after they were assigned, the Select finds no option matching
 * its value, renders blank, and the next save writes null. Opening a record
 * quietly deleted part of it, which is what happened to two Program Directors
 * and a Research Co-Lead here.
 *
 * The person already on the record is therefore always offered, marked when
 * they no longer meet the rule. Removing them stays a deliberate act, and the
 * marker says why they would otherwise have vanished.
 *
 * `rule` prints the restriction under the field, because "why is this person
 * not in the list" is otherwise unanswerable from the interface.
 */
export function PersonSelect({
  options,
  allStaff = [],
  value,
  onChange,
  placeholder = "Select a person",
  rule,
  disabled,
  testId,
}: PersonSelectProps) {
  const eligibleIds = new Set(options.map((person) => person.id));

  // Assigned, but no longer eligible: keep them selectable rather than dropping
  // them on the floor.
  const assignedButIneligible =
    value != null && !eligibleIds.has(value)
      ? allStaff.find((person) => person.id === value) ?? null
      : null;

  // Nothing in the list matches the value yet -- normally because the staff
  // query has not resolved on first render. Radix clears a value it cannot
  // match and fires onValueChange(""), which react-hook-form stores as null,
  // so simply mounting the control during that window wipes the field before
  // anyone touches it. That is the whole bug: opening a record deleted part of
  // it. Hold the control back until it has something to show.
  const hasItemForValue =
    value == null || eligibleIds.has(value) || assignedButIneligible != null;

  if (!hasItemForValue) {
    return (
      <div className="space-y-1">
        <div
          className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground"
          data-testid={testId}
        >
          Loading…
        </div>
        {rule && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{rule}</span>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Select
        value={value != null ? String(value) : ""}
        // An empty emission is never a choice: there is no empty item in the
        // list, so the only way to receive one is Radix clearing a value it
        // could not match against the options it had at that moment. Acting on
        // it is what deleted the Program Director on open. Clearing the field
        // deliberately goes through the explicit "None" item below.
        onValueChange={(next) => {
          if (next === "") return;
          onChange(next === NONE ? null : Number(next));
        }}
        disabled={disabled}
      >
        <SelectTrigger data-testid={testId}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>
            <span className="text-muted-foreground">None</span>
          </SelectItem>
          {assignedButIneligible && (
            <SelectItem value={String(assignedButIneligible.id)}>
              {personLabel(assignedButIneligible)} — no longer meets this rule
            </SelectItem>
          )}
          {options.map((person) => (
            <SelectItem key={person.id} value={String(person.id)}>
              {personLabel(person)}
              {person.jobTitle ? ` — ${person.jobTitle}` : ""}
            </SelectItem>
          ))}
          {options.length === 0 && !assignedButIneligible && (
            <div className="px-2 py-3 text-sm text-muted-foreground">
              Nobody currently qualifies.
            </div>
          )}
        </SelectContent>
      </Select>

      {rule && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{rule}</span>
        </p>
      )}

      {assignedButIneligible && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {personLabel(assignedButIneligible)} is assigned here but no longer meets the rule above.
          They are kept so that saving does not remove them.
        </p>
      )}
    </div>
  );
}

/** The restrictions, in one place, so the pages and the docs cannot disagree. */
export const PERSON_SELECT_RULES = {
  investigator:
    "Shows staff whose access role is Investigator. Someone with a research job title but a different access role will not appear — set the access role in Settings → Users.",
  physician:
    "Shows staff whose job title is exactly Physician. Titles are not interchangeable here, so a variant spelling will not appear.",
  anyStaff: "Shows every staff record.",
} as const;
