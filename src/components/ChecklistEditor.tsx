import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Trash2, Plus, GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChecklistLine {
  text: string;
  bold?: boolean;
}

interface ChecklistEditorProps {
  value: ChecklistLine[];
  onChange: (lines: ChecklistLine[]) => void;
}

export const ChecklistEditor: React.FC<ChecklistEditorProps> = ({ value, onChange }) => {
  const lines = value?.length ? value : [];

  const update = (i: number, patch: Partial<ChecklistLine>) => {
    const next = [...lines];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  const add = () => onChange([...lines, { text: "", bold: false }]);
  const remove = (i: number) => onChange(lines.filter((_, idx) => idx !== i));
  const move = (i: number, dir: "up" | "down") => {
    const j = dir === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= lines.length) return;
    const next = [...lines];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {lines.map((line, i) => (
        <div
          key={i}
          className="flex items-center gap-2 rounded-lg border p-2 bg-card"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
          <CheckCircle2
            className={cn(
              "h-4 w-4 shrink-0 text-green-500 animate-pulse"
            )}
          />
          <Input
            value={line.text}
            onChange={(e) => update(i, { text: e.target.value })}
            placeholder="Line লিখুন..."
            className={cn("h-8 text-sm", line.bold && "font-bold")}
          />
          <Button
            type="button"
            size="sm"
            variant={line.bold ? "default" : "outline"}
            className="h-8 px-2 text-xs shrink-0"
            onClick={() => update(i, { bold: !line.bold })}
          >
            B
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => move(i, "up")} disabled={i === 0}>
            <ArrowUp className="h-3 w-3" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => move(i, "down")} disabled={i === lines.length - 1}>
            <ArrowDown className="h-3 w-3" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive" onClick={() => remove(i)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={add}>
        <Plus className="h-3 w-3" /> Line যোগ করুন
      </Button>
    </div>
  );
};
