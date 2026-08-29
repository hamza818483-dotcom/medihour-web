import React, { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy } from "lucide-react";

interface FormulaEditorDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onInsert: (latex: string) => void;
}

export const FormulaEditorDialog = ({ isOpen, onClose, onInsert }: FormulaEditorDialogProps) => {
    const { toast } = useToast();
    const [latex, setLatex] = useState("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mathFieldRef = useRef<any>(null);

    // Reset latex when opened
    useEffect(() => {
        if (isOpen) {
            // Focus on open
            setTimeout(() => {
                if (mathFieldRef.current) mathFieldRef.current.focus();
            }, 100);
        }
    }, [isOpen]);

    const copyToClipboard = () => {
        if(latex) {
            navigator.clipboard.writeText('$' + latex + '$');
            toast({ title: "Copied!", description: "LaTeX formula copied to clipboard." });
        } else {
            toast({ title: "Empty", description: "Type a formula first.", variant: "secondary" });
        }
    };

    const handleInsert = () => {
        if (latex) {
            onInsert(latex);
        } else {
            toast({ title: "Empty", description: "Type a formula first.", variant: "secondary" });
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent
                className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto"
                onPointerDownOutside={(e) => {
                    const target = e.target as HTMLElement;
                    // Check if target is detached (handles virtual keyboard re-renders like Shift key)
                    const isDetached = !document.body.contains(target);
                    if (
                        isDetached ||
                        target.closest('math-field') ||
                        target.closest('.ML__keyboard') ||
                        target.tagName.toLowerCase().startsWith('math-') ||
                        target.classList.contains('ML__keyboard') ||
                        document.querySelector('.ML__keyboard')?.contains(target)
                    ) {
                        e.preventDefault();
                    }
                }}
                onInteractOutside={(e) => {
                    const target = e.target as HTMLElement;
                    const isDetached = !document.body.contains(target);
                    if (
                        isDetached ||
                        target.closest('math-field') ||
                        target.closest('.ML__keyboard') ||
                        target.tagName.toLowerCase().startsWith('math-') ||
                        target.classList.contains('ML__keyboard') ||
                        document.querySelector('.ML__keyboard')?.contains(target)
                    ) {
                        e.preventDefault();
                    }
                }}
                onFocusOutside={(e) => {
                     // Prevent closing when focus moves to the virtual keyboard
                     e.preventDefault();
                }}
            >
                <DialogHeader>
                    <DialogTitle>Math Formula Editor</DialogTitle>
                    <DialogDescription className="sr-only">Editor for inserting mathematical formulas</DialogDescription>
                </DialogHeader>
                <div className="py-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                         <p className="text-sm text-muted-foreground">
                            Type standard keyboard input or use the virtual math keyboard.
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                const mf = mathFieldRef.current;
                                if (mf) {
                                    if (mf.virtualKeyboardState === 'visible') {
                                        mf.executeCommand('hideVirtualKeyboard');
                                    } else {
                                        mf.executeCommand('showVirtualKeyboard');
                                    }
                                    mf.focus();
                                }
                            }}
                        >
                            Toggle Virtual Keyboard
                        </Button>
                    </div>

                    {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
                    {/* @ts-ignore */}
                    <math-field
                        ref={mathFieldRef}
                        virtual-keyboard-mode="manual"
                        style={{
                            width: '100%',
                            border: '2px solid #3b82f6',
                            padding: '16px',
                            borderRadius: '8px',
                            background: 'white',
                            color: 'black',
                            fontSize: '1.5em',
                            outline: 'none',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        onInput={(e: any) => setLatex(e.target.value)}
                    ></math-field>

                    <div className="relative group">
                         <div className="bg-muted p-4 rounded-lg text-sm font-mono break-all select-all border min-h-[4rem] flex items-center">
                             {latex ? `$${latex}$` : <span className="text-muted-foreground italic">LaTeX preview will appear here...</span>}
                         </div>
                         <Button
                            size="sm"
                            variant="ghost"
                            className="absolute right-2 top-2 h-8 w-8"
                            onClick={copyToClipboard}
                            title="Copy to clipboard"
                         >
                            <Copy className="h-4 w-4" />
                         </Button>
                    </div>

                    <div className="flex justify-end gap-3 mt-4 pt-4 border-t">
                        <Button variant="outline" size="lg" onClick={onClose}>Cancel</Button>
                        <Button
                            onClick={handleInsert}
                            size="lg"
                            className="bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
                        >
                            Insert Formula
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
