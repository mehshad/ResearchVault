/**
 * The "current publication queues" readout, shaped for a chart.
 *
 * The office dashboard used to list the server's raw status counts in whatever
 * order the query returned them, and keyed by the stored string -- so two
 * spellings of the same status showed as two rows both labelled "Published",
 * and the reader had to know the workflow to see that Concept comes before
 * Under review. This folds every stored status into the stage model that the
 * rest of the app already uses (case-insensitive, like publicationStageOf) and
 * returns the stages in workflow order, every one present even at zero so the
 * funnel keeps its shape.
 *
 * "Published *" is returned apart from the bars. It is the sealed, final state
 * that every finished record ends in, so it grows without bound while the
 * queues stay small; on the same axis it would flatten every other bar to a
 * sliver. It is shown as the one big number instead.
 */
import {
  PUBLICATION_OFF_FLOW_STATES,
  PUBLICATION_WORKFLOW_STAGES,
} from "@shared/publicationWorkflow";

export interface QueueBar {
  label: string;
  count: number;
  /** Workflow stage number for in-flow states; undefined for off-flow and unknown. */
  stage?: number;
}

export interface PublicationQueues {
  /** Records in the sealed final state, "Published *". */
  sealed: number;
  /** Stages 1-7 in order (always present), then off-flow states and any status the model does not know, when non-zero. */
  bars: QueueBar[];
}

const norm = (value: string) => value.trim().toLowerCase();
const titleCase = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function buildPublicationQueues(stocks: Record<string, number>): PublicationQueues {
  const inFlow = PUBLICATION_WORKFLOW_STAGES.filter((s) => !s.sealed);
  const sealedStage = PUBLICATION_WORKFLOW_STAGES.find((s) => s.sealed);
  const byStage = new Map<number, number>(inFlow.map((s) => [s.stage, 0]));
  const offFlow = new Map<string, number>();
  const unknown = new Map<string, { label: string; count: number }>();
  let sealed = 0;

  for (const [rawStatus, rawCount] of Object.entries(stocks)) {
    const count = Number(rawCount) || 0;
    const key = norm(rawStatus);
    if (sealedStage && sealedStage.statuses.some((s) => norm(s) === key)) {
      sealed += count;
      continue;
    }
    const stage = inFlow.find((s) => s.statuses.some((v) => norm(v) === key));
    if (stage) {
      byStage.set(stage.stage, (byStage.get(stage.stage) ?? 0) + count);
      continue;
    }
    const off = PUBLICATION_OFF_FLOW_STATES.find((s) => s.statuses.some((v) => norm(v) === key));
    if (off) {
      offFlow.set(off.label, (offFlow.get(off.label) ?? 0) + count);
      continue;
    }
    const existing = unknown.get(key);
    if (existing) existing.count += count;
    else unknown.set(key, { label: titleCase(rawStatus.trim()), count });
  }

  const bars: QueueBar[] = inFlow.map((s) => ({ label: s.label, count: byStage.get(s.stage) ?? 0, stage: s.stage }));
  for (const state of PUBLICATION_OFF_FLOW_STATES) {
    const count = offFlow.get(state.label);
    if (count) bars.push({ label: state.label, count });
  }
  for (const { label, count } of unknown.values()) {
    if (count) bars.push({ label, count });
  }
  return { sealed, bars };
}
