/**
 * Pick a contract type from the shared list, or add one.
 *
 * The same control as InstitutionCombobox, against a different list. Kept as
 * its own component rather than one generic picker with six props: the two
 * differ in what they call things and what they explain, and a shared
 * component would have to be told both.
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
import { referenceNameKey } from "@shared/institutions";

interface ContractTypeOption {
  id: number;
  name: string;
  isBuiltIn: boolean;
}

interface ContractTypeComboboxProps {
  value: string | null | undefined;
  onChange: (name: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function ContractTypeCombobox({
  value,
  onChange,
  placeholder = "Select or add a contract type",
  disabled,
  className,
  ...rest
}: ContractTypeComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: types = [] } = useQuery<ContractTypeOption[]>({
    queryKey: ["/api/contract-types"],
  });

  const addType = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("POST", "/api/contract-types", { name });
      return (await response.json()) as ContractTypeOption;
    },
    onSuccess: (type) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contract-types"] });
      onChange(type.name);
      setSearch("");
      setOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Could not add contract type",
        description: error?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const typed = search.replace(/\s+/g, " ").trim();
  const typedKey = referenceNameKey(typed);
  const matching = typed
    ? types.find((type) => referenceNameKey(type.name) === typedKey)
    : undefined;
  const offerAdd = typedKey.length > 0 && matching === undefined;

  // A value saved before this list existed may not be on it. Show it rather
  // than an empty box that reads as lost data.
  const selected = value
    ? types.find((type) => referenceNameKey(type.name) === referenceNameKey(value))
    : undefined;
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
          filter={(itemValue, searchValue) =>
            itemValue.toLowerCase().includes(searchValue.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput
            placeholder="Search contract types..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {!offerAdd && <CommandEmpty>No contract type found.</CommandEmpty>}
            {offerAdd && (
              <CommandGroup>
                <CommandItem
                  value={typed}
                  onSelect={() => addType.mutate(typed)}
                  disabled={addType.isPending}
                  data-testid="option-add-contract-type"
                >
                  {addType.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Add &ldquo;{typed}&rdquo;
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {types.map((type) => (
                <CommandItem
                  key={type.id}
                  value={type.name}
                  onSelect={() => {
                    onChange(type.name);
                    setSearch("");
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selected?.id === type.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{type.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
