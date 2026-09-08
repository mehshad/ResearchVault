/**
 * The all / mine / my section control the two Research Portfolio pages share.
 *
 * Shown even when it cannot work -- disabled, with the reason in a tooltip.
 * An account with no staff profile, or a profile never placed in a section, is
 * a member of nothing; hiding the control there makes a working feature look
 * missing rather than inapplicable.
 */
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  scopeUnavailableReason,
  type PortfolioScope,
  type PortfolioViewerSummary,
} from "@/lib/portfolioScope";

interface PortfolioScopeSelectProps {
  scope: PortfolioScope;
  onChange: (scope: PortfolioScope) => void;
  viewer: PortfolioViewerSummary | undefined;
  allLabel: string;
  mineLabel: string;
  teamLabel: string;
  /**
   * Set on a page that already restricts its rows to the section, where "all"
   * would promise more than the server sends.
   */
  hideAll?: boolean;
}

export function PortfolioScopeSelect({
  scope,
  onChange,
  viewer,
  allLabel,
  mineLabel,
  teamLabel,
  hideAll = false,
}: PortfolioScopeSelectProps) {
  const unavailable = scopeUnavailableReason(viewer);

  const control = (
    <Select
      value={scope}
      onValueChange={(value) => onChange(value as PortfolioScope)}
      disabled={unavailable != null}
    >
      <SelectTrigger className="w-52" data-testid="select-portfolio-scope">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {!hideAll && <SelectItem value="all">{allLabel}</SelectItem>}
        <SelectItem value="mine">{mineLabel}</SelectItem>
        <SelectItem value="team">{teamLabel}</SelectItem>
      </SelectContent>
    </Select>
  );

  if (!unavailable) return control;

  return (
    <TooltipProvider>
      <Tooltip>
        {/* A disabled trigger fires no pointer events, so the tooltip needs a
            wrapper that does. */}
        <TooltipTrigger asChild>
          <span tabIndex={0}>{control}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{unavailable}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
