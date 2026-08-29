import React, { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check, Save, Image as ImageIcon } from "lucide-react";
import { ExpandableRichTextEditor } from "@/components/ui/expandable-rich-text-editor";
import { FormulaEditorDialog } from "@/components/ui/formula-editor-dialog";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import Cropper from "react-cropper";

// Helper to convert base64 to Blob
const base64ToBlob = (base64: string) => {
    try {
        const parts = base64.split(';base64,');
        if (parts.length !== 2) throw new Error("Invalid base64 format");

        const contentType = parts[0].split(':')[1] || 'image/png';
        const raw = window.atob(parts[1].trim());
        const rawLength = raw.length;
        const uInt8Array = new Uint8Array(rawLength);
        for (let i = 0; i < rawLength; ++i) {
            uInt8Array[i] = raw.charCodeAt(i);
        }
        return new Blob([uInt8Array], { type: contentType });
    } catch (e) {
        console.error("Base64 parsing error:", e);
        return null;
    }
};

export interface QuestionData {
    id?: string;
    question: string;
    options: { [key: string]: string };
    correct_answer: string;
    explanation: string;
}

interface QuestionEditorProps {
    data: QuestionData;
    onChange: (data: QuestionData) => void;
    onSave: () => void;
    onCancel: () => void;
}

export const QuestionEditor = ({ data, onChange, onSave, onCancel }: QuestionEditorProps) => {
    // Formula Editor State
    const [formulaState, setFormulaState] = useState<{ isOpen: boolean; targetQuill: any | null }>({
        isOpen: false,
        targetQuill: null
    });

    // Image Cropper State
    const [showCropModal, setShowCropModal] = useState(false);
    const [cropImage, setCropImage] = useState<string>("");
    const [currentQuillRef, setCurrentQuillRef] = useState<any>(null);
    const [cropper, setCropper] = useState<any>();

    // MathLive setup
    useEffect(() => {
        if (!document.getElementById("mathlive-script")) {
            const script = document.createElement("script");
            script.id = "mathlive-script";
            script.src = "https://unpkg.com/mathlive";
            script.type = "module";
            document.body.appendChild(script);
        }
    }, []);

    const update = (field: string, val: any) => {
        if (data[field as keyof QuestionData] === val) return;
        onChange({ ...data, [field]: val });
    };

    const updateOption = (key: string, val: string) => {
        if (data.options[key] === val) return;
        onChange({ ...data, options: { ...data.options, [key]: val } });
    };

    // Image Upload Handler
    const handleImageUpload = useCallback((quillRef: any) => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();
        input.onchange = async () => {
            const file = input.files?.[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e: any) => {
                    setCropImage(e.target.result);
                    setCurrentQuillRef(quillRef);
                    setShowCropModal(true);
                };
                reader.readAsDataURL(file);
            }
        };
    }, []);

    const insertCroppedImage = () => {
        if (typeof cropper !== "undefined" && currentQuillRef) {
            const editor = currentQuillRef.getEditor();
            const range = editor.getSelection(true);
            const index = range ? range.index : editor.getLength();

            editor.insertEmbed(index, "image", cropper.getCroppedCanvas().toDataURL());
            setShowCropModal(false);
            setCropImage("");
        }
    };

    // Formula Handlers
    const handleOpenFormula = useCallback((quillRef: any) => {
        setFormulaState({ isOpen: true, targetQuill: quillRef });
    }, []);

    const handleFormulaInsert = (latex: string) => {
        if (formulaState.targetQuill) {
            const editor = formulaState.targetQuill.getEditor();
            const range = editor.getSelection(true);
            const index = range ? range.index : editor.getLength();

            editor.insertText(index, `$${latex}$ `);

            // Move cursor after the inserted formula and space
            // FIX: Increased timeout to 100ms to ensure editor regains focus after dialog close
            setTimeout(() => {
                editor.setSelection(index + latex.length + 3);
                editor.focus();
            }, 100);
        }
        setFormulaState({ isOpen: false, targetQuill: null });
    };

    const modules = useCallback((quillRef: any) => ({
        toolbar: {
            container: [
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                [{ 'script': 'sub'}, { 'script': 'super' }],
                ['formula'],
                ['link', 'image', 'clean']
            ],
            handlers: {
                image: () => handleImageUpload(quillRef),
                formula: () => handleOpenFormula(quillRef)
            }
        }
    }), [handleImageUpload, handleOpenFormula]);

    return (
        <div className="space-y-8">
             <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Question Text</Label>
                    <Button variant="ghost" size="sm" onClick={() => handleOpenFormula(null)} className="text-xs h-8 bg-secondary/50 hover:bg-secondary text-foreground">
                        Math Formula Helper (Manual)
                    </Button>
                </div>
                <ExpandableRichTextEditor
                    value={data.question}
                    onChange={(val: string) => update('question', val)}
                    modulesGenerator={modules}
                    onImageUpload={handleImageUpload}
                    placeholder="Type your question here... (Click to edit)"
                    minHeight="150px"
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {['A', 'B', 'C', 'D'].map((opt) => (
                    <div key={opt} className={`space-y-3 p-4 rounded-xl border-2 transition-all ${
                        data.correct_answer === opt
                        ? 'border-green-500 bg-green-50/20 shadow-sm'
                        : 'border-border/50 hover:border-primary/30 hover:bg-muted/20'
                    }`}>
                        <div className="flex items-center justify-between mb-2">
                            <Label className="font-bold flex items-center gap-3 cursor-pointer select-none">
                                <div className="relative flex items-center justify-center">
                                    <input
                                        type="radio"
                                        name="correct_opt"
                                        checked={data.correct_answer === opt}
                                        onChange={() => update('correct_answer', opt)}
                                        className="peer sr-only"
                                    />
                                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                        data.correct_answer === opt
                                        ? 'border-green-600 bg-green-600 text-white'
                                        : 'border-muted-foreground'
                                    }`}>
                                        {data.correct_answer === opt && <Check className="h-3 w-3" />}
                                    </div>
                                </div>
                                <span>Option {opt}</span>
                            </Label>
                            {data.correct_answer === opt && <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded-full">Correct Answer</span>}
                        </div>
                        <ExpandableRichTextEditor
                            value={data.options[opt]}
                            onChange={(val: string) => updateOption(opt, val)}
                            modulesGenerator={modules}
                            onImageUpload={handleImageUpload}
                            minHeight="80px"
                            placeholder={`Option ${opt} text...`}
                        />
                    </div>
                ))}
            </div>

            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Explanation (Optional)</Label>
                </div>
                <ExpandableRichTextEditor
                    value={data.explanation}
                    onChange={(val: string) => update('explanation', val)}
                    modulesGenerator={modules}
                    onImageUpload={handleImageUpload}
                    minHeight="100px"
                    placeholder="Explain the answer here..."
                />
            </div>

            <div className="flex gap-4 pt-6 border-t mt-4">
                <Button onClick={onSave} className="w-full sm:w-auto min-w-[150px] shadow-md">
                    <Save className="mr-2 h-4 w-4" /> Save Question
                </Button>
                <Button variant="outline" onClick={onCancel} className="w-full sm:w-auto">
                    Cancel
                </Button>
            </div>

            <FormulaEditorDialog
                isOpen={formulaState.isOpen}
                onClose={() => setFormulaState({ isOpen: false, targetQuill: null })}
                onInsert={handleFormulaInsert}
            />

            {/* Crop Modal */}
            {showCropModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-card border rounded-xl shadow-2xl p-6 w-full max-w-3xl max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold">Crop Image</h3>
                            <Button variant="ghost" size="sm" onClick={() => setShowCropModal(false)}>✕</Button>
                        </div>

                        <div className="flex-1 overflow-hidden bg-black/5 rounded-lg border min-h-[300px]">
                            <Cropper
                                src={cropImage}
                                style={{ height: 400, width: "100%" }}
                                initialAspectRatio={NaN}
                                guides={true}
                                viewMode={1}
                                minCropBoxHeight={10}
                                minCropBoxWidth={10}
                                background={false}
                                responsive={true}
                                autoCropArea={1}
                                checkOrientation={false}
                                onInitialized={(instance: any) => setCropper(instance)}
                            />
                        </div>

                        <div className="flex gap-3 mt-6 justify-end">
                            <Button variant="outline" onClick={() => setShowCropModal(false)}>Cancel</Button>
                            <Button onClick={insertCroppedImage}>
                                <ImageIcon className="mr-2 h-4 w-4" /> Insert Image
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
