/**
 * Pick a grant status by typing at it.
 *
 * A plain dropdown was fine for the thirteen statuses that shipped. The office
 * works to sixty-six, and finding "Expired - Reviewing Completed" in a scrolling
 * list of that length is slower than typing four letters of it.
 *
 * Sorted alphabetically rather than in the configured order. The stored
 * sort_order groups the built-in thirteen first and the office's own list after
 * them, which is a sensible way to *administer* the list and a poor way to
 * *find* something in it: it puts Active and Award Active thirteen rows apart.
 * The configuration page still shows the configured order, because that is the
 * order it exists to manage.
 *
 * Retired statuses are absent from the list but still resolve to their label,
 * so a grant that carries one keeps showing its name instead of a raw value.
 */
import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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
import { useGrantStatuses } from "@/hooks/useGrantStatuses";

interface GrantStatusComboboxProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function GrantStatusCombobox({
  value,
  onChange,
  placeholder = "Select status",
  disabled,
  className,
  ...rest
}: GrantStatusComboboxProps) {
  const [open, setOpen] = useState(false);
  // Cleared every time the list opens. Left to itself the search box keeps what
  // was typed last time, so reopening it a day later shows five statuses out of
  // sixty-six and nothing on screen explains why.
  const [search, setSearch] = useState("");
  const { options, all } = useGrantStatuses();

  const sorted = [...options].sort((a, b) => a.label.localeCompare(b.label));
  const selectedLabel = all.find((option) => option.value === value)?.label;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setSearch("");
      }}
    >
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
          <span className={cn("truncate", !selectedLabel && "text-muted-foreground")}>
            {selectedLabel ?? placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search statuses..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No status matches.</CommandEmpty>
            <CommandGroup>
              {sorted.map((option) => (
                <CommandItem
                  key={option.value}
                  // Searched on the label, because that is the word the office
                  // reads and types. The stored value is a slug nobody sees.
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      option.value === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
