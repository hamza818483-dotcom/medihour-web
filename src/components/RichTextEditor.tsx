import React, { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Bold, Underline, Highlighter, Type } from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeightClassName?: string;
}

// Simple contentEditable rich text editor: bold, underline, big text, highlight.
// Stores content as HTML (spans/tags), never re-syncs from `value` prop on every
// keystroke to avoid resetting cursor position (breaks typing, especially Bangla/IME).
export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder,
  minHeightClassName = "min-h-[160px]",
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (ref.current && isFirstRender.current) {
      ref.current.innerHTML = value || "";
      isFirstRender.current = false;
    }
  }, [value]);

  const emit = () => onChange(ref.current?.innerHTML || "");

  const exec = (cmd: string, val?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, val);
    emit();
  };

  const toggleBigText = () => {
    ref.current?.focus();
    // fontSize 5 ~ larger visible text; wraps selection in a <font size="5"> which
    // browsers render, then we normalize on save isn't needed since we just store HTML.
    document.execCommand("fontSize", false, "5");
    emit();
  };

  const toggleHighlight = () => {
    ref.current?.focus();
    document.execCommand("hiliteColor", false, "#fde68a");
    emit();
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 border-b pb-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("bold")}
          title="Bold"
        >
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("underline")}
          title="Underline"
        >
          <Underline className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleBigText}
          title="বড় টেক্সট"
        >
          <Type className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleHighlight}
          title="Highlight"
        >
          <Highlighter className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        data-placeholder={placeholder}
        className={`${minHeightClassName} w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground`}
      />
    </div>
  );
};
