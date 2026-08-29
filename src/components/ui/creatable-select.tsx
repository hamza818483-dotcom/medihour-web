import * as React from "react";
import { Check, ChevronsUpDown, Plus, Pencil, Trash2, X, CheckCheck } from "lucide-react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

export type Option = {
  label: string;
  value: string;
};

interface CreatableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  onCreate?: (value: string) => void;
  onRename?: (oldValue: string, newValue: string) => void;
  onDelete?: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function CreatableSelect({
  options,
  value,
  onChange,
  onCreate,
  onRename,
  onDelete,
  placeholder = "Select item...",
  className,
}: CreatableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");
  const [editingValue, setEditingValue] = React.useState<string | null>(null);
  const [editText, setEditText] = React.useState("");
  const [deletingValue, setDeletingValue] = React.useState<string | null>(null);
  const canManage = !!(onRename || onDelete);

  const commitRename = (oldValue: string) => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== oldValue) {
      onRename?.(oldValue, trimmed);
      if (value === oldValue) onChange(trimmed);
    }
    setEditingValue(null);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between px-3 py-2 h-auto min-h-10", className)}
        >
          <div className="flex-1 flex flex-wrap gap-1">
            {!value && <span className="text-muted-foreground font-normal">{placeholder}</span>}
            {value && (
              <Badge variant="secondary" className="mr-1 mb-1">
                {options.find((option) => option.value === value)?.label || value}
                <button
                  type="button"
                  className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      onChange("");
                    }
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange("");
                    setOpen(true);
                  }}
                >
                  <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </button>
              </Badge>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandInput
            placeholder={placeholder}
            onValueChange={(val) => setInputValue(val)}
          />
          <CommandList>
              <CommandEmpty className="py-2 px-2">
                {onCreate && inputValue.trim().length > 0 ? (
                    <div
                        className="flex items-center gap-2 p-2 text-sm rounded-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                        }}
                        onClick={() => {
                            onCreate(inputValue.trim());
                            onChange(inputValue.trim());
                            setInputValue("");
                            setOpen(false);
                        }}
                    >
                        <Plus className="h-4 w-4" />
                        Create "{inputValue}"
                    </div>
                ) : (
                   <span className="text-muted-foreground text-sm block py-4 text-center">No item found.</span>
                )}
              </CommandEmpty>
              <CommandGroup className="max-h-64 overflow-auto">
                {options.map((option) =>
                  editingValue === option.value ? (
                    <div key={option.value} className="flex items-center gap-1 px-2 py-1.5">
                      <input
                        autoFocus
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(option.value);
                          if (e.key === "Escape") setEditingValue(null);
                        }}
                        className="flex-1 h-7 px-2 text-sm border rounded-md bg-background"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0 text-emerald-600"
                        onMouseDown={(e) => { e.preventDefault(); commitRename(option.value); }}
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0"
                        onMouseDown={(e) => { e.preventDefault(); setEditingValue(null); }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      onSelect={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                      className="group"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          value === option.value ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="flex-1 truncate">{option.label}</span>
                      {canManage && (
                        <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                          {onRename && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setEditingValue(option.value);
                                setEditText(option.value);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                          {onDelete && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-destructive"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDeletingValue(option.value);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </span>
                      )}
                    </CommandItem>
                  )
                )}
              </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>

      <AlertDialog open={!!deletingValue} onOpenChange={(o) => !o && setDeletingValue(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deletingValue}"?</AlertDialogTitle>
            <AlertDialogDescription>
              এই অপশনটি লিস্ট থেকে বাদ যাবে। আগে থেকে এই ভ্যালু দেওয়া exam গুলোর ডেটা অপরিবর্তিত থাকবে।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingValue(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingValue) onDelete?.(deletingValue);
                setDeletingValue(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Popover>
  );
}
