import React, { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Bold, Underline, Highlighter } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeightClassName?: string;
}

const FONT_SIZE_PX: Record<string, string> = {
  "1": "12px",
  "2": "14px",
  "3": "16px",
  "4": "18px",
  "5": "20px",
  "6": "24px",
  "7": "30px",
};

// Simple contentEditable rich text editor: bold, underline, font size, highlight.
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
  // The Select dropdown steals focus from the editable div when opened, which
  // collapses the text selection. We snapshot the Range on mousedown (before
  // focus moves) and restore it right before applying the font size.
  const savedRangeRef = useRef<Range | null>(null);

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

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && ref.current?.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const setFontSize = (size: string) => {
    const px = FONT_SIZE_PX[size];
    if (!px || !ref.current) return;

    ref.current.focus();
    const sel = window.getSelection();
    if (sel && savedRangeRef.current) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
    if (!sel || sel.isCollapsed) {
      // Nothing selected — nothing to resize.
      return;
    }

    const range = sel.getRangeAt(0);
    const span = document.createElement("span");
    span.style.fontSize = px;
    try {
      range.surroundContents(span);
    } catch {
      // Selection spans multiple elements (surroundContents fails on partial
      // node boundaries) — fall back to extracting and re-wrapping contents.
      const frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
    }
    sel.removeAllRanges();
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
        <Select onValueChange={setFontSize}>
          <SelectTrigger
            className="h-7 w-[110px] text-xs"
            onMouseDown={saveSelection}
            title="টেক্সট সাইজ"
          >
            <SelectValue placeholder="সাইজ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">ছোট</SelectItem>
            <SelectItem value="2">স্বাভাবিক</SelectItem>
            <SelectItem value="3">মাঝারি</SelectItem>
            <SelectItem value="4">মাঝারি বড়</SelectItem>
            <SelectItem value="5">বড়</SelectItem>
            <SelectItem value="6">অনেক বড়</SelectItem>
            <SelectItem value="7">সবচেয়ে বড়</SelectItem>
          </SelectContent>
        </Select>
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
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        data-placeholder={placeholder}
        className={`${minHeightClassName} w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground`}
      />
    </div>
  );
};
