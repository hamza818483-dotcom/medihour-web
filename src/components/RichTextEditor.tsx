import React, { useRef, useEffect, useState } from "react";
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

const DEFAULT_HIGHLIGHT = "#fde68a";

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
  // The Select dropdown / color input steal focus from the editable div when
  // opened, which collapses the text selection. We snapshot the Range on
  // mousedown (before focus moves) and restore it right before applying.
  const savedRangeRef = useRef<Range | null>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [highlightColor, setHighlightColor] = useState(DEFAULT_HIGHLIGHT);

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

  // Restores the saved selection (if any) into the editable div and returns
  // the live Selection object, or null if there's nothing usable to apply to.
  const restoreSelection = (): Selection | null => {
    if (!ref.current) return null;
    ref.current.focus();
    const sel = window.getSelection();
    if (sel && savedRangeRef.current) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
    if (!sel || sel.isCollapsed) return null;
    return sel;
  };

  // Wraps the current selection in a <span> with the given inline style,
  // falling back to extract+re-wrap when the selection crosses partial node
  // boundaries (surroundContents throws in that case).
  const wrapSelection = (styleProp: "fontSize" | "backgroundColor", value: string) => {
    const sel = restoreSelection();
    if (!sel) return;

    const range = sel.getRangeAt(0);
    const span = document.createElement("span");
    span.style[styleProp] = value;
    if (styleProp === "backgroundColor") {
      // Keep highlighted text fully opaque/dark so it stays legible against
      // any highlight color, instead of inheriting a faded muted color.
      span.style.color = "#111827";
      span.style.borderRadius = "2px";
      span.style.padding = "0 2px";
    }
    try {
      range.surroundContents(span);
    } catch {
      const frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
    }
    sel.removeAllRanges();
    emit();
  };

  const setFontSize = (size: string) => {
    const px = FONT_SIZE_PX[size];
    if (px) wrapSelection("fontSize", px);
  };

  const applyHighlight = (color: string) => {
    setHighlightColor(color);
    wrapSelection("backgroundColor", color);
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
        <div className="relative">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
            }}
            onClick={() => colorInputRef.current?.click()}
            title="Highlight color"
            style={{ color: highlightColor }}
          >
            <Highlighter className="h-3.5 w-3.5" />
          </Button>
          <input
            ref={colorInputRef}
            type="color"
            defaultValue={DEFAULT_HIGHLIGHT}
            className="absolute inset-0 h-7 w-7 cursor-pointer opacity-0"
            onMouseDown={saveSelection}
            onChange={(e) => applyHighlight(e.target.value)}
          />
        </div>
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
