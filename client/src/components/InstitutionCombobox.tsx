/**
 * Pick an external organisation from the shared list, or add one.
 *
 * Used wherever a form names an institution -- a grant's submitting
 * institution, the institutions a grant is run with, a contract's counterparty
 * -- so that the same organisation is written the same way in all of them.
 *
 * The value is the institution's **name**, not its id: the records these fields
 * belong to store text, and this component's job is to make sure the text came
 * from the list. See shared/institutions.ts.
 *
 * Adding is offered inline rather than behind an administrator, because the
 * alternative is a researcher who cannot record the collaborator they are
 * working with. It is only offered for a name that is not already on the list
 * under another spelling, so the list cannot grow a second "Hamad Medical
 * Corporation" by way of this control.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  canAddInstitution,
  findInstitutionByName,
  normaliseInstitutionName,
  type InstitutionOption,
} from "@shared/institutions";

interface InstitutionComboboxProps {
  value: string | null | undefined;
  onChange: (name: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function InstitutionCombobox({
  value,
  onChange,
  placeholder = "Select or add an institution",
  disabled,
  className,
  ...rest
}: InstitutionComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: institutions = [] } = useQuery<InstitutionOption[]>({
    queryKey: ["/api/institutions"],
  });

  const addInstitution = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("POST", "/api/institutions", { name });
      return (await response.json()) as InstitutionOption;
    },
    onSuccess: (institution) => {
      // Every other open combobox picks it up too, which is the point of a
      // shared list.
      queryClient.invalidateQueries({ queryKey: ["/api/institutions"] });
      onChange(institution.name);
      setSearch("");
      setOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Could not add institution",
        description: error?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const typed = normaliseInstitutionName(search);
  const offerAdd = canAddInstitution(institutions, typed);

  // A value saved before this list existed, or imported, may not be on it. Show
  // it rather than rendering an empty box that looks like lost data.
  const selected = value ? findInstitutionByName(institutions, value) : undefined;
  const label = value ? selected?.name ?? value : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
          {...rest}
        >
          <span className={cn("truncate", !label && "text-muted-foreground")}>
            {label || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          // The list is already filtered by what has been typed; leaving the
          // built-in filter on as well hides entries whose match cmdk scores
          // differently from a plain substring.
          filter={(itemValue, searchValue) =>
            itemValue.toLowerCase().includes(searchValue.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput
            placeholder="Search institutions..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {!offerAdd && <CommandEmpty>No institution found.</CommandEmpty>}
            {offerAdd && (
              <CommandGroup>
                <CommandItem
                  value={typed}
                  onSelect={() => addInstitution.mutate(typed)}
                  disabled={addInstitution.isPending}
                  data-testid="option-add-institution"
                >
                  {addInstitution.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Add &ldquo;{typed}&rdquo;
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {value && (
                <CommandItem
                  value=""
                  onSelect={() => {
                    onChange("");
                    setSearch("");
                    setOpen(false);
                  }}
                >
                  <span className="text-muted-foreground">Clear</span>
                </CommandItem>
              )}
              {institutions.map((institution) => (
                <CommandItem
                  key={institution.id}
                  value={institution.name}
                  onSelect={() => {
                    onChange(institution.name);
                    setSearch("");
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selected?.id === institution.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{institution.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
