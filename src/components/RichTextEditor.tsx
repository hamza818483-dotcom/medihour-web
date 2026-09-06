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

  // execCommand fontSize uses legacy HTML sizes 1-7 (not px). Selected text gets
  // wrapped in <font size="N">, which we map to real px sizes via CSS below.
  const setFontSize = (size: string) => {
    ref.current?.focus();
    document.execCommand("fontSize", false, size);
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
            onMouseDown={(e) => e.preventDefault()}
            title="টেক্সট সাইজ"
          >
            <SelectValue placeholder="সাইজ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2">ছোট</SelectItem>
            <SelectItem value="3">স্বাভাবিক</SelectItem>
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
        data-placeholder={placeholder}
        className={`${minHeightClassName} w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground [&_font[size='1']]:text-xs [&_font[size='2']]:text-sm [&_font[size='3']]:text-base [&_font[size='4']]:text-lg [&_font[size='5']]:text-xl [&_font[size='6']]:text-2xl [&_font[size='7']]:text-3xl`}
      />
    </div>
  );
};
