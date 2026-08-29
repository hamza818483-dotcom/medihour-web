import React, { useState, useRef, useMemo } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { Button } from "@/components/ui/button";
import { Check, Edit2 } from "lucide-react";

// Helper to sanitize HTML import (copied from ExamCreator, or just kept local if needed inside ExamCreator, but since this is UI component, it just renders value)
// The sanitization is done before saving or on import, so the editor just displays value.

interface ExpandableRichTextEditorProps {
    value: string;
    onChange: (val: string) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    modulesGenerator: (quillRef: any) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onImageUpload: (quillRef: any) => void;
    placeholder?: string;
    minHeight?: string;
}


export const ExpandableRichTextEditor = ({ value, onChange, modulesGenerator, minHeight = "100px", placeholder }: ExpandableRichTextEditorProps) => {
    const [isEditing, setIsEditing] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quillRef = useRef<any>(null);

    const modules = useMemo(() => {
        return modulesGenerator({
            getEditor: () => quillRef.current?.getEditor()
        });
    }, [modulesGenerator]);

    if (!isEditing) {
        return (
            <div
                onClick={() => setIsEditing(true)}
                className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm ring-offset-background cursor-text hover:bg-muted/20 hover:border-primary/30 transition-all shadow-sm"
                style={{ minHeight }}
            >
                {value && value !== "<p><br></p>" ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert pointer-events-none" dangerouslySetInnerHTML={{ __html: value }} />
                ) : (
                    <span className="text-muted-foreground flex items-center gap-2 mt-1">
                        <Edit2 className="h-3 w-3" /> {placeholder || "Click to edit..."}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div className="relative border-2 border-primary/20 rounded-xl p-2 bg-background animate-in fade-in zoom-in-95 duration-200 shadow-md ring-2 ring-primary/5">
            <ReactQuill
                ref={quillRef}
                theme="snow"
                value={value}
                onChange={onChange}
                modules={modules}
                placeholder={placeholder}
                style={{ height: 'auto' }}
                className="h-auto rounded-md overflow-hidden"
            />
            {/* Custom Styles */}
            <style>{`
                .ql-container {
                    min-height: ${minHeight};
                    font-size: 16px;
                    border: none !important;
                }
                .ql-toolbar {
                    border: none !important;
                    border-bottom: 1px solid #e2e8f0 !important;
                    background: #f8fafc;
                    border-radius: 8px 8px 0 0;
                }
                .dark .ql-toolbar {
                    background: #1e293b;
                    border-bottom: 1px solid #334155 !important;
                }
                .dark .ql-snow .ql-stroke {
                    stroke: #e2e8f0;
                }
                .dark .ql-snow .ql-fill {
                    fill: #e2e8f0;
                }
                .dark .ql-snow .ql-picker {
                    color: #e2e8f0;
                }
                .ql-editor {
                    min-height: ${minHeight};
                    padding: 16px;
                }
            `}</style>
            <div className="flex justify-end mt-2 pt-2 border-t border-dashed">
                <Button size="sm" onClick={(e) => { e.stopPropagation(); setIsEditing(false); }} className="h-8">
                    <Check className="mr-1 h-3 w-3" /> Done
                </Button>
            </div>
        </div>
    );
};
