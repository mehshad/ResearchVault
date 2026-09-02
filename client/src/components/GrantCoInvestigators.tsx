import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Trash2, UserPlus } from "lucide-react";
import type { GrantCoInvestigatorList } from "@shared/schema";

interface GrantCoInvestigatorsProps {
  value: GrantCoInvestigatorList;
  onChange: (next: GrantCoInvestigatorList) => void;
  disabled?: boolean;
}

/**
 * Sidra Medicine co-investigators on a grant.
 *
 * Chosen from the staff directory rather than typed. They are our own people,
 * and the free-text box this replaces could not be counted, filtered, or shown
 * on the person's own profile -- two spellings of one colleague were two
 * different co-investigators.
 *
 * People at other institutions are not here: they belong to the collaborating
 * institution they work for, which is the control above this one.
 */
export function GrantCoInvestigators({ value, onChange, disabled }: GrantCoInvestigatorsProps) {
  const rows = value ?? [];

  const { data: scientists = [] } = useQuery<
    Array<{ id: number; firstName?: string | null; lastName?: string | null; honorificTitle?: string | null }>
  >({ queryKey: ["/api/scientists"] });

  const options = scientists
    .map((s) => ({
      value: String(s.id),
      label: [s.honorificTitle, s.firstName, s.lastName].filter(Boolean).join(" "),
    }))
    .filter((option) => option.label.trim() !== "")
    .sort((a, b) => a.label.localeCompare(b.label));

  const update = (index: number, patch: Partial<GrantCoInvestigatorList[number]>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <div className="space-y-2" data-testid="grant-co-investigators">
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No Sidra Medicine co-investigators recorded.</p>
      )}

      {rows.map((row, index) => {
        // A colleague already chosen on another row cannot be chosen twice.
        const takenElsewhere = new Set(
          rows.filter((_, i) => i !== index).map((other) => String(other.scientistId)),
        );
        return (
          <div key={index} className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Co-investigator</Label>
              <SearchableSelect
                options={options.filter((option) => !takenElsewhere.has(option.value))}
                value={row.scientistId ? String(row.scientistId) : ""}
                onChange={(next) => update(index, { scientistId: Number(next) })}
                placeholder="Select staff member"
                searchPlaceholder="Search staff..."
                data-testid={`select-co-investigator-${index}`}
              />
            </div>
            <div className="w-[200px] space-y-1">
              <Label className="text-xs">Role</Label>
              <Input
                value={row.role ?? ""}
                onChange={(e) => update(index, { role: e.target.value })}
                placeholder="Optional"
                disabled={disabled}
                data-testid={`input-co-investigator-role-${index}`}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
              disabled={disabled}
              data-testid={`button-remove-co-investigator-${index}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...rows, { scientistId: 0, role: "" }])}
        disabled={disabled}
        data-testid="button-add-co-investigator"
      >
        <UserPlus className="mr-2 h-4 w-4" />
        Add co-investigator
      </Button>
    </div>
  );
}
