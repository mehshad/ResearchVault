import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Plus, Trash2, UserPlus } from "lucide-react";
import type { GrantCollaborationTree } from "@shared/schema";

interface GrantCollaborationsProps {
  value: GrantCollaborationTree;
  onChange: (next: GrantCollaborationTree) => void;
  disabled?: boolean;
}

/**
 * Collaborating institutions on a grant, and the people at each of them.
 *
 * Replaces a free-text box that held one line per collaborator. Every value
 * anyone had actually typed into it was an institution name, with nowhere to
 * record who at that institution was involved -- so the box could not answer
 * either "who do we work with" or "who do we work with there".
 *
 * Edited as a whole and saved with the grant: the parent form owns the tree and
 * submits it, rather than each row being its own request. That keeps a
 * half-finished institution with no people from being written while someone is
 * still typing.
 */
export function GrantCollaborations({ value, onChange, disabled }: GrantCollaborationsProps) {
  const institutions = value ?? [];

  const updateInstitution = (index: number, patch: Partial<GrantCollaborationTree[number]>) => {
    onChange(institutions.map((inst, i) => (i === index ? { ...inst, ...patch } : inst)));
  };

  const addInstitution = () => {
    onChange([...institutions, { name: "", collaborators: [] }]);
  };

  const removeInstitution = (index: number) => {
    onChange(institutions.filter((_, i) => i !== index));
  };

  const addCollaborator = (index: number) => {
    updateInstitution(index, {
      collaborators: [...(institutions[index].collaborators ?? []), { name: "", role: "" }],
    });
  };

  const updateCollaborator = (
    index: number,
    personIndex: number,
    patch: { name?: string; role?: string },
  ) => {
    updateInstitution(index, {
      collaborators: (institutions[index].collaborators ?? []).map((person, i) =>
        i === personIndex ? { ...person, ...patch } : person,
      ),
    });
  };

  const removeCollaborator = (index: number, personIndex: number) => {
    updateInstitution(index, {
      collaborators: (institutions[index].collaborators ?? []).filter((_, i) => i !== personIndex),
    });
  };

  return (
    <div className="space-y-3" data-testid="grant-collaborations">
      {institutions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No collaborating institutions recorded.
        </p>
      )}

      {institutions.map((institution, index) => (
        <div key={index} className="rounded-lg border p-3 space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Institution</Label>
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Input
                  value={institution.name}
                  onChange={(e) => updateInstitution(index, { name: e.target.value })}
                  placeholder="e.g. Weill Cornell Medical College in Qatar"
                  disabled={disabled}
                  data-testid={`input-institution-name-${index}`}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => removeInstitution(index)}
              disabled={disabled}
              data-testid={`button-remove-institution-${index}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2 pl-6">
            {(institution.collaborators ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No named collaborators at this institution yet.
              </p>
            ) : (
              (institution.collaborators ?? []).map((person, personIndex) => (
                <div key={personIndex} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Collaborator</Label>
                    <Input
                      value={person.name}
                      onChange={(e) => updateCollaborator(index, personIndex, { name: e.target.value })}
                      placeholder="Name"
                      disabled={disabled}
                      data-testid={`input-collaborator-name-${index}-${personIndex}`}
                    />
                  </div>
                  <div className="w-[200px] space-y-1">
                    <Label className="text-xs">Role</Label>
                    <Input
                      value={person.role ?? ""}
                      onChange={(e) => updateCollaborator(index, personIndex, { role: e.target.value })}
                      placeholder="Optional"
                      disabled={disabled}
                      data-testid={`input-collaborator-role-${index}-${personIndex}`}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => removeCollaborator(index, personIndex)}
                    disabled={disabled}
                    data-testid={`button-remove-collaborator-${index}-${personIndex}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addCollaborator(index)}
              disabled={disabled}
              data-testid={`button-add-collaborator-${index}`}
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Add collaborator
            </Button>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addInstitution}
        disabled={disabled}
        data-testid="button-add-institution"
      >
        <Plus className="mr-2 h-4 w-4" />
        Add institution
      </Button>
    </div>
  );
}
