import React, { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check, Save, Image as ImageIcon, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormulaEditorDialog } from "@/components/ui/formula-editor-dialog";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { MultiSelect } from "@/components/ui/multi-select";
import { useGlobalMetadata, useAddGlobalMetadata } from "@/hooks/useGlobalMetadata";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface QuestionData {
    id?: string;
    question: string;
    options: { [key: string]: string };
    correct_answer: string;
    explanation: string;
    subject?: string;
    chapter?: string;
    topic?: string;
    exam_code?: string;
    year?: string;
    difficulty?: string;
    tags?: string[];
    is_segment_mandatory?: boolean;
}

interface QuestionEditorProps {
    data: QuestionData;
    onChange: (data: QuestionData) => void;
    onSave: () => void;
    onCancel: () => void;
}

export const QuestionEditor = ({ data, onChange, onSave, onCancel }: QuestionEditorProps) => {
    // Formula Editor State
    const [formulaState, setFormulaState] = useState<{ isOpen: boolean; targetId: string | null }>({
        isOpen: false,
        targetId: null
    });

    // Global Metadata Hook
    const { data: globalMeta } = useGlobalMetadata() as any;
    const addMetadata = useAddGlobalMetadata();

    const { data: distinctMetadata } = useQuery({
        queryKey: ["question-bank-metadata"],
        queryFn: async () => {
            const { data } = await supabase.from("question_bank").select("subject, chapter, topic");
            return data || [];
        }
    });

    const subjectOptions = React.useMemo(() => {
        const set = new Set<string>();
        globalMeta?.subject?.forEach((s: any) => set.add(s.value));
        distinctMetadata?.forEach((item: any) => {
             if (item.subject) set.add(item.subject);
        });
        return Array.from(set).sort().map(s => ({ label: s, value: s }));
    }, [globalMeta, distinctMetadata]);

    const chapterOptions = React.useMemo(() => {
        const set = new Set<string>();
        globalMeta?.chapter?.forEach((c: any) => set.add(c.value));
        distinctMetadata?.forEach((item: any) => {
            if (!item.chapter) return;
            if (data.subject && item.subject !== data.subject) return;
            set.add(item.chapter);
        });
        return Array.from(set).sort().map(c => ({ label: c, value: c }));
    }, [globalMeta, distinctMetadata, data.subject]);

    const topicOptions = React.useMemo(() => {
        const set = new Set<string>();
        globalMeta?.topic?.forEach((t: any) => set.add(t.value));
        distinctMetadata?.forEach((item: any) => {
            if (!item.topic) return;
            if (data.chapter && item.chapter !== data.chapter) return;
            set.add(item.topic);
        });
        return Array.from(set).sort().map(t => ({ label: t, value: t }));
    }, [globalMeta, distinctMetadata, data.chapter]);

    const handleCreateMeta = (type: 'subject' | 'chapter' | 'topic' | 'exam_code' | 'year' | 'tag', value: string) => {
        addMetadata.mutate({ type, value });
        if (type === 'tag') {
            onChange({ ...data, tags: [...(data.tags || []), value] });
        } else {
            onChange({ ...data, [type]: value });
        }
    };


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

    const handleOpenFormula = (id: string) => {
        setFormulaState({ isOpen: true, targetId: id });
    };

    const handleFormulaInsert = (latex: string) => {
        if (formulaState.targetId) {
            const id = formulaState.targetId;
            const insertText = `$${latex}$ `;

            if (id === 'question') {
                onChange({ ...data, question: data.question + insertText });
            } else if (id === 'explanation') {
                onChange({ ...data, explanation: data.explanation + insertText });
            } else if (id.startsWith('option_')) {
                const opt = id.split('_')[1];
                onChange({ ...data, options: { ...data.options, [opt]: data.options[opt] + insertText } });
            }
        }
        setFormulaState({ isOpen: false, targetId: null });
    };

    return (
        <div className="space-y-4 max-w-2xl mx-auto w-full">
            {/* Question Box */}
            <div className="border border-border/60 rounded-[20px] p-4 sm:p-5 bg-card shadow-sm flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold text-foreground/80">Question <span className="text-destructive">*</span></Label>
                    <Button variant="ghost" size="sm" onClick={() => handleOpenFormula('question')} className="text-xs h-7 px-2 rounded-full bg-secondary/50 hover:bg-secondary text-foreground">
                        + Math
                    </Button>
                </div>
                <Textarea
                    value={data.question}
                    onChange={(e) => update('question', e.target.value)}
                    placeholder="Enter the question text (LaTeX allowed)..."
                    className="min-h-[100px] rounded-[12px] resize-y text-sm focus-visible:ring-1"
                />
            </div>

            {/* Options Box with Inline Correct Answer Selection */}
            <div className="border border-border/60 rounded-[20px] p-4 sm:p-5 bg-card shadow-sm space-y-3">
                <div className="flex items-center justify-between mb-1">
                    <Label className="text-sm font-semibold text-foreground/80">Options & Correct Answer (A-D required) <span className="text-destructive">*</span></Label>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Tap letter to mark correct</span>
                </div>
                {['A', 'B', 'C', 'D'].map((opt) => {
                    const isCorrect = data.correct_answer === opt;
                    return (
                        <div key={opt} className={`flex items-center gap-2 sm:gap-3 p-1 rounded-[14px] transition-colors border ${isCorrect ? 'border-green-500 bg-green-50/50 dark:bg-green-900/10' : 'border-transparent hover:border-border/50'}`}>
                            {/* Clickable Letter Box */}
                            <button
                                type="button"
                                onClick={() => update('correct_answer', opt)}
                                className={`w-8 h-8 sm:w-9 sm:h-9 shrink-0 flex items-center justify-center rounded-full text-xs sm:text-sm font-bold transition-all duration-200 border cursor-pointer ${
                                    isCorrect
                                    ? 'bg-green-500 text-white border-green-600 shadow-sm'
                                    : 'bg-secondary/40 text-muted-foreground border-border hover:bg-secondary'
                                }`}
                                title={`Mark option ${opt} as correct`}
                            >
                                {opt}
                            </button>

                            {/* Input Field */}
                            <Input
                                value={data.options[opt]}
                                onChange={(e) => updateOption(opt, e.target.value)}
                                placeholder={`Option ${opt}`}
                                className={`rounded-[10px] flex-1 text-sm h-9 sm:h-10 transition-colors ${isCorrect ? 'border-green-200 focus-visible:ring-green-500 dark:border-green-800' : 'focus-visible:ring-1'}`}
                            />

                            {/* Math Button */}
                            <Button variant="ghost" size="icon" onClick={() => handleOpenFormula(`option_${opt}`)} className="text-xs shrink-0 text-muted-foreground h-8 w-8 rounded-full hover:bg-secondary/80">
                               <ImageIcon className="h-4 w-4" />
                            </Button>
                        </div>
                    );
                })}

                {/* Option E - optional 5th option */}
                {typeof data.options.E === 'string' ? (
                    <div className={`flex items-center gap-2 sm:gap-3 p-1 rounded-[14px] transition-colors border ${data.correct_answer === 'E' ? 'border-green-500 bg-green-50/50 dark:bg-green-900/10' : 'border-transparent hover:border-border/50'}`}>
                        <button
                            type="button"
                            onClick={() => update('correct_answer', 'E')}
                            className={`w-8 h-8 sm:w-9 sm:h-9 shrink-0 flex items-center justify-center rounded-full text-xs sm:text-sm font-bold transition-all duration-200 border cursor-pointer ${
                                data.correct_answer === 'E'
                                ? 'bg-green-500 text-white border-green-600 shadow-sm'
                                : 'bg-secondary/40 text-muted-foreground border-border hover:bg-secondary'
                            }`}
                            title="Mark option E as correct"
                        >
                            E
                        </button>
                        <Input
                            value={data.options.E}
                            onChange={(e) => updateOption('E', e.target.value)}
                            placeholder="Option E"
                            className={`rounded-[10px] flex-1 text-sm h-9 sm:h-10 transition-colors ${data.correct_answer === 'E' ? 'border-green-200 focus-visible:ring-green-500 dark:border-green-800' : 'focus-visible:ring-1'}`}
                        />
                        <Button variant="ghost" size="icon" onClick={() => handleOpenFormula('option_E')} className="text-xs shrink-0 text-muted-foreground h-8 w-8 rounded-full hover:bg-secondary/80">
                           <ImageIcon className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                                const { E, ...rest } = data.options;
                                onChange({ ...data, options: rest, correct_answer: data.correct_answer === 'E' ? '' : data.correct_answer });
                            }}
                            className="text-xs shrink-0 text-muted-foreground h-8 w-8 rounded-full hover:bg-destructive/10 hover:text-destructive"
                            title="Remove option E"
                        >
                           <X className="h-4 w-4" />
                        </Button>
                    </div>
                ) : (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onChange({ ...data, options: { ...data.options, E: "" } })}
                        className="rounded-full text-xs h-8 px-3 border-dashed"
                    >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Option E (optional)
                    </Button>
                )}
            </div>

            {/* Explanation Box */}
            <div className="border border-border/60 rounded-[20px] p-4 sm:p-5 bg-card shadow-sm flex flex-col gap-2">
                 <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold text-foreground/80">Explanation</Label>
                    <Button variant="ghost" size="sm" onClick={() => handleOpenFormula('explanation')} className="text-xs h-7 px-2 rounded-full bg-secondary/50 hover:bg-secondary text-foreground">
                        + Math
                    </Button>
                </div>
                <Textarea
                    value={data.explanation}
                    onChange={(e) => update('explanation', e.target.value)}
                    placeholder="Provide an explanation (optional)..."
                    className="min-h-[80px] rounded-[12px] resize-y text-sm focus-visible:ring-1"
                />
            </div>

            {/* Metadata / Tags - Compact Grid */}
            <div className="border border-border/60 rounded-[20px] p-4 sm:p-5 bg-card shadow-sm">
                <Label className="text-sm font-semibold text-foreground/80 block mb-3">Metadata & Tags</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-4">
                     <div className="space-y-1.5">
                        <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Subject</Label>
                        <CreatableSelect
                            options={subjectOptions}
                            value={data.subject || ""}
                            onChange={(val) => update('subject', val)}
                            onCreate={(val) => handleCreateMeta('subject', val)}
                            placeholder="Subject"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Chapter</Label>
                        <CreatableSelect
                            options={chapterOptions}
                            value={data.chapter || ""}
                            onChange={(val) => update('chapter', val)}
                            onCreate={(val) => handleCreateMeta('chapter', val)}
                            placeholder="Chapter"
                        />
                    </div>
                    <div className="space-y-1.5 col-span-2 md:col-span-1">
                        <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Topic</Label>
                        <CreatableSelect
                            options={topicOptions}
                            value={data.topic || ""}
                            onChange={(val) => update('topic', val)}
                            onCreate={(val) => handleCreateMeta('topic', val)}
                            placeholder="Topic"
                        />
                    </div>
                     <div className="space-y-1.5">
                        <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Exam Code</Label>
                        <CreatableSelect
                            options={globalMeta?.exam_code || []}
                            value={data.exam_code || ""}
                            onChange={(val) => update('exam_code', val)}
                            onCreate={(val) => handleCreateMeta('exam_code', val)}
                            placeholder="Code"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Year</Label>
                        <CreatableSelect
                            options={globalMeta?.year || []}
                            value={data.year || ""}
                            onChange={(val) => update('year', val)}
                            onCreate={(val) => handleCreateMeta('year', val)}
                            placeholder="Year"
                        />
                    </div>
                    <div className="space-y-1.5 col-span-2 md:col-span-3">
                        <Label className="text-[11px] text-muted-foreground uppercase tracking-wider">Tags</Label>
                        <MultiSelect
                            options={globalMeta?.tag || []}
                            selected={data.tags || []}
                            onChange={(val) => update('tags', val)}
                            onCreate={(val) => handleCreateMeta('tag', val)}
                            placeholder="Add tags..."
                        />
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2 justify-end">
                <Button variant="ghost" onClick={onCancel} className="rounded-full px-6 h-10 font-medium text-muted-foreground hover:bg-secondary">
                    Cancel
                </Button>
                <Button onClick={onSave} className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-8 h-10 font-medium shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
                    Save Question
                </Button>
            </div>

            <FormulaEditorDialog
                isOpen={formulaState.isOpen}
                onClose={() => setFormulaState({ isOpen: false, targetId: null })}
                onInsert={handleFormulaInsert}
            />
        </div>
    );
};
