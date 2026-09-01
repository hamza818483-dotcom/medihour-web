import React, { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Bold, Italic, Underline, Trash2, Plus, ArrowUp, ArrowDown } from "lucide-react";

export interface DescriptionBlock {
  id?: string;
  heading: string;
  body: string; // html: bold/italic/underline only
}

interface DescriptionBlockEditorProps {
  value: DescriptionBlock[];
  onChange: (blocks: DescriptionBlock[]) => void;
}

const RichBodyEditor: React.FC<{ html: string; onChange: (html: string) => void }> = ({ html, onChange }) => {
  const ref = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  // Set initial content only once on mount (or when switching to a different block).
  // Never re-sync from the `html` prop on every keystroke — that resets the cursor
  // position and breaks typing (especially Bangla/IME composition).
  useEffect(() => {
    if (ref.current && isFirstRender.current) {
      ref.current.innerHTML = html || "";
      isFirstRender.current = false;
    }
  }, [html]);

  const exec = (cmd: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false);
    onChange(ref.current?.innerHTML || "");
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 border-b pb-1">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("bold")}>
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("italic")}>
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("underline")}>
          <Underline className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => onChange(ref.current?.innerHTML || "")}
        className="min-h-[90px] w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
};

const genId = () => Math.random().toString(36).slice(2, 10);

export const DescriptionBlockEditor: React.FC<DescriptionBlockEditorProps> = ({ value, onChange }) => {
  const blocks = value?.length ? value : [];

  const update = (i: number, patch: Partial<DescriptionBlock>) => {
    const next = [...blocks];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  const add = () => onChange([...blocks, { id: genId(), heading: "", body: "" }]);
  const remove = (i: number) => onChange(blocks.filter((_, idx) => idx !== i));
  const move = (i: number, dir: "up" | "down") => {
    const j = dir === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => (
        <Card key={block.id || i} className="border shadow-sm">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-muted-foreground">#{i + 1}</span>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => move(i, "up")} disabled={i === 0}>
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => move(i, "down")} disabled={i === blocks.length - 1}>
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => remove(i)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-amber-500 animate-pulse" />
              <Input
                value={block.heading}
                onChange={(e) => update(i, { heading: e.target.value })}
                placeholder="Special line (bold heading)..."
                className="font-bold text-sm h-9"
              />
            </div>
            <RichBodyEditor html={block.body} onChange={(html) => update(i, { body: html })} />
          </CardContent>
        </Card>
      ))}
      <Button type="button" variant="outline" className="w-full py-6 border-dashed gap-2" onClick={add}>
        <Plus className="h-4 w-4" /> নতুন Block যোগ করুন
      </Button>
    </div>
  );
};
