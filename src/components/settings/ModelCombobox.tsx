import { useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

import { useModels } from "@/components/hooks/useModels";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface ModelComboboxProps {
  id?: string;
  value: string | null;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}

// Searchable picker over the OpenRouter model list (hundreds of entries). Models load on first open.
export function ModelCombobox({
  id,
  value,
  onChange,
  disabled = false,
  invalid = false,
  describedBy,
}: ModelComboboxProps) {
  const [open, setOpen] = useState(false);
  const { status, models, message, load } = useModels();
  const selected = models.find((model) => model.id === value);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      void load();
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          className="w-full justify-between font-normal"
          data-testid="model-combobox"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {selected ? selected.name : (value ?? "Select a model")}
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search models…" />
          <CommandList>
            {status === "loading" && (
              <div role="status" className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Loading models…
              </div>
            )}
            {status === "error" && (
              <div className="space-y-2 px-3 py-4 text-sm">
                <p role="alert" className="text-destructive">
                  {message}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={() => void load(true)}>
                  Try again
                </Button>
              </div>
            )}
            {status === "ready" && (
              <>
                <CommandEmpty>No models found.</CommandEmpty>
                <CommandGroup>
                  {models.map((model) => (
                    <CommandItem
                      key={model.id}
                      value={`${model.name} ${model.id}`}
                      onSelect={() => {
                        onChange(model.id);
                        setOpen(false);
                      }}
                      data-testid="model-option"
                    >
                      <Check
                        className={cn("size-4", model.id === value ? "opacity-100" : "opacity-0")}
                        aria-hidden="true"
                      />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">{model.name}</span>
                        <span className="truncate font-mono text-xs text-muted-foreground">{model.id}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default ModelCombobox;
