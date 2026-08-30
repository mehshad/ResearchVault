import { ChevronRight, Star, Lock } from "lucide-react";
import {
  PUBLICATION_WORKFLOW_STAGES,
  PUBLICATION_OFF_FLOW_STATES,
} from "@shared/publicationWorkflow";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const ALL_STATES = "__all__";

export interface PublicationWorkflowFilterProps {
  /** Count per stored status value, keyed exactly as stored. */
  countsByStatus: Record<string, number>;
  /**
   * Sealed records live outside this list, so their count comes separately and
   * the stage is shown for context rather than as a filter.
   */
  sealedCount?: number;
  selected: string;
  onSelect: (value: string) => void;
  total: number;
}

function sumFor(statuses: string[], counts: Record<string, number>): number {
  return statuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
}

/**
 * The publication workflow rendered as the sequence staff actually talk about,
 * with a live count in each stage and click-to-filter. Showing every stage —
 * including empty ones — is deliberate: an empty stage is information, and a
 * list of only the populated statuses hides where work is not flowing.
 */
export function PublicationWorkflowFilter({
  countsByStatus,
  sealedCount,
  selected,
  onSelect,
  total,
}: PublicationWorkflowFilterProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-3" data-testid="publication-workflow-filter">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Publication workflow
          </span>
          <button
            type="button"
            onClick={() => onSelect(ALL_STATES)}
            className={cn(
              "rounded-md px-2 py-1 text-xs transition-colors",
              selected === ALL_STATES
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
            data-testid="filter-state-all"
          >
            All states ({total})
          </button>
        </div>

        <div className="flex flex-wrap items-stretch gap-1">
          {PUBLICATION_WORKFLOW_STAGES.map((stage, index) => {
            const isSealed = stage.sealed === true;
            const count = isSealed ? (sealedCount ?? 0) : sumFor(stage.statuses, countsByStatus);
            const isSelected = !isSealed && stage.statuses.includes(selected);
            const isEmpty = count === 0;

            const node = (
              <button
                type="button"
                disabled={isSealed}
                onClick={() => !isSealed && onSelect(stage.statuses[0])}
                className={cn(
                  "flex min-w-[104px] flex-col items-start rounded-lg border px-2.5 py-2 text-left transition-colors",
                  isSelected
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "border-border hover:bg-muted",
                  isSealed && "cursor-default opacity-70 hover:bg-transparent",
                  isEmpty && !isSelected && "opacity-60",
                )}
                data-testid={`filter-stage-${stage.stage}`}
              >
                <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {stage.stage}
                  {isSealed && <Star className="h-3 w-3 text-amber-500" />}
                  {isSealed && <Lock className="h-2.5 w-2.5" />}
                </span>
                <span className="mt-0.5 text-[11px] font-medium leading-tight">{stage.label}</span>
                <span
                  className={cn(
                    "mt-1 text-lg font-semibold leading-none",
                    isSelected ? "text-primary" : isEmpty ? "text-muted-foreground" : "",
                  )}
                >
                  {count}
                </span>
              </button>
            );

            return (
              <div key={stage.stage} className="flex items-center gap-1">
                {isSealed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{node}</TooltipTrigger>
                    <TooltipContent>
                      Sealed records are not listed here. Revert a final approval from
                      Publication Tools.
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  node
                )}
                {index < PUBLICATION_WORKFLOW_STAGES.length - 1 && (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                )}
              </div>
            );
          })}
        </div>

        {/* Off-flow states are reachable from several stages, so they sit apart
            from the sequence rather than pretending to be a step in it. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Off flow
          </span>
          {PUBLICATION_OFF_FLOW_STATES.map((state) => {
            const count = sumFor(state.statuses, countsByStatus);
            const isSelected = state.statuses.includes(selected);
            return (
              <button
                key={state.label}
                type="button"
                onClick={() => onSelect(state.statuses[0])}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
                  isSelected
                    ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                    : "border-border text-muted-foreground hover:bg-muted",
                  count === 0 && !isSelected && "opacity-60",
                )}
                data-testid={`filter-offflow-${state.statuses[0]}`}
              >
                {state.label} ({count})
              </button>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
