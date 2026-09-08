/**
 * Researcher or clinician, read off the job title rather than asked for.
 *
 * It used to be a question on every grant, which duplicated something that does
 * not vary by grant: 272 grants carrying an answer is 272 chances for one
 * person to be described two ways, and one person was. It is not stored on the
 * staff record either, because the staff record already says it -- a physician
 * is a clinician, and nobody should have to answer that twice.
 *
 * The rule is the office's own: physicians are clinical, and so are nurses.
 * Everyone else on a grant is a researcher.
 *
 * Checked against what the office actually recorded on 272 grants, taking each
 * person's majority answer:
 *
 *     job title              grants say        people
 *     Physician              Clinician              5
 *     Physician              Researcher             1
 *     Investigator           Researcher            10
 *     Staff Scientist        Researcher            16
 *     Post Doctoral Fellow   Researcher             6
 *
 * So this reproduces 37 of the 38 people who lead a grant. The exception is one
 * physician whose nine grants all say Researcher -- consistently, so it is a
 * deliberate description of how they work rather than a slip, and it is the
 * known cost of deriving this instead of storing it. Recorded here rather than
 * worked around: a rule with a named exception is honest, a rule with a
 * hard-coded name in it is not.
 */

export type InvestigatorType = "Researcher" | "Clinician";

/**
 * Job titles that mean clinical work.
 *
 * Matched on words rather than whole strings, so "Nurse", "Research Nurse" and
 * "Nursing Lead" all count without needing to be listed. `JOB_TITLES` in
 * shared/constants.ts carries no nurse title today -- the office named nurses
 * as clinical, so the rule is written for one arriving rather than needing a
 * code change on the day it does.
 */
export const CLINICAL_JOB_TITLE_WORDS = [
  "physician",
  "nurse",
  "nursing",
  "clinician",
] as const;

/** Letters only, so "Post-Doctoral" and "Post Doctoral" are one word list. */
function words(jobTitle: string): string[] {
  return jobTitle.toLowerCase().split(/[^a-z]+/).filter(Boolean);
}

/**
 * The investigator type a job title implies, or null when there is no title.
 *
 * Null rather than "Researcher" for somebody with no job title recorded: the
 * honest answer is that nothing has been said, and a screen can print that.
 * Defaulting would make an empty staff record assert something about the
 * person.
 */
export function investigatorTypeForJobTitle(
  jobTitle: string | null | undefined,
): InvestigatorType | null {
  if (typeof jobTitle !== "string") return null;
  const parts = words(jobTitle);
  if (parts.length === 0) return null;
  const clinical = parts.some((word) =>
    (CLINICAL_JOB_TITLE_WORDS as readonly string[]).includes(word),
  );
  return clinical ? "Clinician" : "Researcher";
}

/** The same question asked of a staff record. */
export function investigatorTypeOf(
  person: { jobTitle?: string | null } | null | undefined,
): InvestigatorType | null {
  return investigatorTypeForJobTitle(person?.jobTitle);
}
