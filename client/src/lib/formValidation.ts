import { grantStatusRequiresStartDate } from "@shared/grantLifecycle";

/**
 * Field-level checks for the forms that keep their values in useState.
 *
 * The grant editor and the RA-200 forms are not react-hook-form forms, so
 * they cannot lean on a zod resolver for per-field messages. Until they are
 * rewritten, these functions give them the same thing: a map from field name
 * to the sentence that goes under it. The page decides when to run them
 * (on submit) and when to clear them (as each field is fixed).
 *
 * Every message names what to do, not only what is wrong.
 */

export type FieldErrors = Record<string, string>;

export interface GrantFormValues {
  title: string;
  projectNumber: string;
  status: string;
  startDate: string;
  endDate: string;
  requestedAmount: string;
  awardedAmount: string;
  submittedYear: string;
  awardedYear: string;
}

const isBlank = (value: string | null | undefined) => !value || !String(value).trim();
const isMoney = (value: string) => /^\s*\$?\s*[\d,]+(\.\d{1,2})?\s*$/.test(value);
const isYear = (value: string) => /^\d{4}$/.test(value.trim());

/**
 * `statusLabel` turns a stored status into the office's name for it, so the
 * start-date message can say "Active grants require a start date" rather
 * than quoting the stored value.
 */
export function grantFormErrors(
  form: GrantFormValues,
  statusLabel: (status: string) => string = (status) => status,
): FieldErrors {
  const errors: FieldErrors = {};
  if (isBlank(form.title)) errors.title = "Enter the grant's title.";
  if (isBlank(form.projectNumber)) errors.projectNumber = "Enter the project number.";
  if (isBlank(form.status)) errors.status = "Choose a status.";
  if (!isBlank(form.status) && grantStatusRequiresStartDate(form.status) && isBlank(form.startDate)) {
    errors.startDate = `${statusLabel(form.status)} grants require a start date.`;
  }
  if (!isBlank(form.startDate) && !isBlank(form.endDate) && form.endDate < form.startDate) {
    errors.endDate = "End date cannot be before the start date.";
  }
  if (!isBlank(form.requestedAmount) && !isMoney(form.requestedAmount)) {
    errors.requestedAmount = "Enter an amount as a number, e.g. 250000.";
  }
  if (!isBlank(form.awardedAmount) && !isMoney(form.awardedAmount)) {
    errors.awardedAmount = "Enter an amount as a number, e.g. 250000.";
  }
  if (!isBlank(form.submittedYear) && !isYear(form.submittedYear)) {
    errors.submittedYear = "Enter a four-digit year.";
  }
  if (!isBlank(form.awardedYear) && !isYear(form.awardedYear)) {
    errors.awardedYear = "Enter a four-digit year.";
  }
  return errors;
}

export interface Ra200RequiredValues {
  title: string;
  leadScientistId: number | null;
  projectId: number | null;
  budgetHolderId: number | null;
  abstract: string;
}

/**
 * What an RA-200 must carry to be submitted. A draft may be saved with any
 * of these empty; the form marks these five with an asterisk and nothing
 * enforced it.
 */
export function ra200RequiredFieldErrors(form: Ra200RequiredValues): FieldErrors {
  const errors: FieldErrors = {};
  if (isBlank(form.title)) errors.title = "Enter the research activity title.";
  if (form.leadScientistId == null) errors.leadScientistId = "Choose the lead scientist.";
  if (form.projectId == null) errors.projectId = "Choose the project this activity belongs to.";
  if (form.budgetHolderId == null) errors.budgetHolderId = "Choose the budget holder.";
  if (isBlank(form.abstract)) errors.abstract = "Write the abstract.";
  return errors;
}

/** Keeps only the errors still true, so a field's message clears as it is fixed. */
export function stillFailing(previous: FieldErrors, fresh: FieldErrors): FieldErrors {
  const kept: FieldErrors = {};
  for (const key of Object.keys(previous)) {
    if (fresh[key]) kept[key] = fresh[key];
  }
  return kept;
}
