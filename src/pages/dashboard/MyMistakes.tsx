import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, AlertCircle, FileDown } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { openSolvePdf } from "@/lib/solvePdf";
import { useToast } from "@/hooks/use-toast";

const MyMistakes = () => {
    const { user } = useAuth();
    const { toast } = useToast();
    const [pdfLoading, setPdfLoading] = useState<"wrong" | "both" | null>(null);

    const [category, setCategory] = useState<"all" | "live" | "practice" | "readymade">("all");
    const [readymadeSubCategory, setReadymadeSubCategory] = useState<string | null>(null);
    const [listDialog, setListDialog] = useState<{ examTitle: string; type: "wrong" | "skip"; questions: any[] } | null>(null);

    const { data: exams, isLoading } = useQuery({
        queryKey: ["my-mistakes-exams", user?.id],
        queryFn: async () => {
            if (!user) return [];
            // Fetch exams that user has attempted
            const { data, error } = await supabase
                .from("exam_attempts")
                .select(`
                    id,
                    exam_id,
                    submitted_at,
                    answers,
                    exams (
                        id,
                        title,
                        subject,
                        exam_type,
                        readymade_topic,
                        is_readymade,
                        time_window_end
                    )
                `)
                .eq("profile_id", user.id)
                .order("submitted_at", { ascending: false });

            if (error) throw error;

            // De-duplicate exams (keep latest attempt info)

            const uniqueExamsMap = new Map();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data.forEach((attempt: any) => {
                if (attempt.exams && !uniqueExamsMap.has(attempt.exam_id)) {
                    const examData = attempt.exams;
                    const subjectDisplay = Array.isArray(examData.subject)
                        ? examData.subject.join(", ")
                        : (examData.subject || "General");

                    const isReadymade = !!examData.readymade_topic || !!examData.is_readymade;
                    // Attempted live exams stay "live" in history even after
                    // the window expires — "practice" is only for missed
                    // (unattempted) live exams elsewhere in the app.
                    const category = isReadymade ? 'readymade' : (examData.exam_type === 'live' ? 'live' : 'practice');

                    uniqueExamsMap.set(attempt.exam_id, {
                        id: examData.id,
                        attemptId: attempt.id,
                        title: examData.title,
                        subject: subjectDisplay,
                        lastAttempt: attempt.submitted_at,
                        category,
                        readymadeTopic: examData.readymade_topic || null,
                        answers: attempt.answers || [],
                        wrongCount: 0,
                        skipCount: 0,
                        wrongQuestions: [],
                        skippedQuestions: [],
                    });
                }
            });

            const uniqueExams = Array.from(uniqueExamsMap.values());

            // Compute wrong/skip counts per exam using the correct-answer review RPC
            await Promise.all(uniqueExams.map(async (exam: any) => {
                const { data: reviewData } = await supabase.rpc("get_student_exam_review", {
                    p_attempt_id: exam.attemptId
                });
                if (!reviewData) return;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const userAnswers = (exam.answers as any[]) || [];
                let wrong = 0, skip = 0;
                const wrongQuestions: any[] = [];
                const skippedQuestions: any[] = [];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                reviewData.forEach((reviewQ: any) => {
                    const userAnswerObj = userAnswers.find((a: any) => a.question_id === reviewQ.question_id);
                    const selected = userAnswerObj?.selected_option;
                    if (!selected) {
                        skip++;
                        skippedQuestions.push({ ...reviewQ, user_answer: null });
                    } else if (selected !== reviewQ.correct_option) {
                        wrong++;
                        wrongQuestions.push({ ...reviewQ, user_answer: selected });
                    }
                });
                exam.wrongCount = wrong;
                exam.skipCount = skip;
                exam.wrongQuestions = wrongQuestions;
                exam.skippedQuestions = skippedQuestions;
            }));

            return uniqueExams;
        },
        enabled: !!user
    });

    const readymadeTopics = Array.from(new Set((exams || []).filter((e: any) => e.category === 'readymade' && e.readymadeTopic).map((e: any) => e.readymadeTopic)));

    const categoryFilteredExams = (exams || []).filter((e: any) => {
        if (category === 'all') return true;
        if (category === 'readymade') {
            if (e.category !== 'readymade') return false;
            if (readymadeSubCategory) return e.readymadeTopic === readymadeSubCategory;
            return true;
        }
        return e.category === category;
    });

    const totalWrong = categoryFilteredExams.reduce((s: number, e: any) => s + (e.wrongCount || 0), 0);
    const totalSkip = categoryFilteredExams.reduce((s: number, e: any) => s + (e.skipCount || 0), 0);

    const generateMistakesPdf = async (mode: "wrong" | "both") => {
        setPdfLoading(mode);
        try {
            const allQuestions: any[] = [];
            for (const exam of categoryFilteredExams) {
                const { data: reviewData } = await supabase.rpc("get_student_exam_review", {
                    p_attempt_id: exam.attemptId
                });
                if (!reviewData) continue;
                const userAnswers = (exam.answers as any[]) || [];
                reviewData.forEach((reviewQ: any) => {
                    const userAnswerObj = userAnswers.find((a: any) => a.question_id === reviewQ.question_id);
                    const selected = userAnswerObj?.selected_option;
                    const isSkipped = !selected;
                    const isWrong = !isSkipped && selected !== reviewQ.correct_option;
                    if (mode === "wrong" && !isWrong) return;
                    if (mode === "both" && !isWrong && !isSkipped) return;
                    allQuestions.push({
                        question_text: reviewQ.question_text,
                        option_a: reviewQ.option_a,
                        option_b: reviewQ.option_b,
                        option_c: reviewQ.option_c,
                        option_d: reviewQ.option_d,
                        option_e: reviewQ.option_e,
                        correct_option: reviewQ.correct_option,
                        user_answer: selected || null,
                        explanation: reviewQ.explanation,
                    });
                });
            }
            if (allQuestions.length === 0) {
                toast({ title: "কোনো প্রশ্ন পাওয়া যায়নি", variant: "destructive" });
                return;
            }
            openSolvePdf({
                examName: mode === "wrong" ? "All Wrong Questions" : "All Wrong + Skipped Questions",
                questions: allQuestions,
                totalMarks: allQuestions.length,
                style: "style1",
            });
        } catch (e: any) {
            toast({ title: "PDF তৈরি করা যায়নি", description: e.message, variant: "destructive" });
        } finally {
            setPdfLoading(null);
        }
    };

    if (isLoading) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
    }

    return (
        <div className="w-full px-0 py-3 space-y-3">
            <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-full">
                        <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold leading-tight">My Mistakes</h1>
                        <p className="text-xs text-muted-foreground">Practice questions you missed or skipped.</p>
                    </div>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] px-2"
                        disabled={pdfLoading !== null}
                        onClick={() => generateMistakesPdf("wrong")}
                    >
                        {pdfLoading === "wrong" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FileDown className="h-3 w-3 mr-1" />}
                        All Wrong PDF
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] px-2"
                        disabled={pdfLoading !== null}
                        onClick={() => generateMistakesPdf("both")}
                    >
                        {pdfLoading === "both" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FileDown className="h-3 w-3 mr-1" />}
                        All Wrong+Skip PDF
                    </Button>
                </div>
            </div>

            {/* Stat Row */}
            <div className="grid grid-cols-3 gap-1.5 px-1">
                <Card className="p-2 text-center">
                    <div className="text-[10px] text-muted-foreground font-medium">Total Exams</div>
                    <div className="text-base font-bold">{categoryFilteredExams.length}</div>
                </Card>
                <Card className="p-2 text-center">
                    <div className="text-[10px] text-red-600 dark:text-red-400 font-medium">Total Wrong</div>
                    <div className="text-base font-bold text-red-600 dark:text-red-400">{totalWrong}</div>
                </Card>
                <Card className="p-2 text-center">
                    <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Total Skip</div>
                    <div className="text-base font-bold text-amber-600 dark:text-amber-400">{totalSkip}</div>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-1.5 px-0.5 w-full">
                {/* Category Row */}
                <div className="lg:col-span-3 grid grid-cols-4 gap-1.5">
                    {([
                        { key: 'all', label: 'All' },
                        { key: 'live', label: 'Live' },
                        { key: 'practice', label: 'Practice' },
                        { key: 'readymade', label: 'Readymade' },
                    ] as const).map(c => (
                        <Button
                            key={c.key}
                            size="sm"
                            variant={category === c.key ? 'default' : 'outline'}
                            className="h-8 !px-0.5 text-[11px] w-full overflow-hidden"
                            onClick={() => {
                                if (category === c.key) {
                                    setCategory('all');
                                } else {
                                    setCategory(c.key);
                                }
                                setReadymadeSubCategory(null);
                            }}
                        >
                            <span className="truncate">{c.label}</span>
                        </Button>
                    ))}
                </div>

                {/* Readymade Sub-category Row */}
                {category === 'readymade' && readymadeTopics.length > 0 && (
                    <div className="lg:col-span-3 flex flex-wrap gap-1.5 pl-1">
                        {readymadeTopics.map((topic: string) => (
                            <Button
                                key={topic}
                                size="sm"
                                variant={readymadeSubCategory === topic ? 'secondary' : 'ghost'}
                                className="h-6 px-2 text-[11px]"
                                onClick={() => {
                                    setReadymadeSubCategory(readymadeSubCategory === topic ? null : topic);
                                }}
                            >
                                {topic}
                            </Button>
                        ))}
                    </div>
                )}

                {/* Exam List */}
                <Card className="lg:col-span-2 w-full mx-0">
                    <CardHeader className="py-2.5 px-3">
                        <CardTitle className="text-sm">Exams</CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 pb-3">
                        {categoryFilteredExams.length > 0 ? (
                            <div className="space-y-3">
                                <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1" style={{ touchAction: 'pan-y' }}>
                                    {categoryFilteredExams.map((exam: any) => (
                                        <div
                                            key={exam.id}
                                            className="p-2 rounded-md border select-none"
                                        >
                                            <div className="grid gap-1 leading-none w-full min-w-0">
                                                <div className="flex justify-between items-start gap-2">
                                                    <span className="text-xs font-medium leading-none truncate min-w-0">
                                                        {exam.title}
                                                    </span>
                                                    {exam.subject && (
                                                        <Badge variant="outline" className="text-[10px] shrink-0">{exam.subject}</Badge>
                                                    )}
                                                </div>
                                                <p className="text-[10px] text-muted-foreground">
                                                    Last attempt: {format(new Date(exam.lastAttempt), "PP")}
                                                </p>
                                                <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                                                    <Badge
                                                        variant="outline"
                                                        className="text-[10px] text-red-600 dark:text-red-400 border-red-300 dark:border-red-900 cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/20"
                                                        onClick={() => setListDialog({ examTitle: exam.title, type: "wrong", questions: exam.wrongQuestions })}
                                                    >
                                                        Wrong: {exam.wrongCount}
                                                    </Badge>
                                                    <Badge
                                                        variant="outline"
                                                        className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-900 cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-900/20"
                                                        onClick={() => setListDialog({ examTitle: exam.title, type: "skip", questions: exam.skippedQuestions })}
                                                    >
                                                        Skip: {exam.skipCount}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                            </div>
                        ) : (
                            <div className="text-center py-6 text-xs text-muted-foreground">
                                No exams found in this category.
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Question List Dialog (Wrong / Skip) */}
            <Dialog open={!!listDialog} onOpenChange={(open) => !open && setListDialog(null)}>
                <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-sm">
                            {listDialog?.examTitle} — {listDialog?.type === "wrong" ? "Wrong" : "Skipped"} Questions
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        {listDialog?.questions?.length ? (
                            listDialog.questions.map((q: any, i: number) => (
                                <div key={q.question_id || i} className="p-2.5 border rounded-md space-y-1">
                                    <p className="text-xs font-medium">{i + 1}. {q.question_text}</p>
                                    <div className="text-[11px] text-muted-foreground space-y-0.5">
                                        <p>A. {q.option_a}</p>
                                        <p>B. {q.option_b}</p>
                                        <p>C. {q.option_c}</p>
                                        <p>D. {q.option_d}</p>
                                        {q.option_e && <p>E. {q.option_e}</p>}
                                    </div>
                                    <div className="flex items-center gap-3 pt-1 text-[11px] flex-wrap">
                                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">Correct: {q.correct_option}</span>
                                        {q.user_answer ? (
                                            <span className="text-red-600 dark:text-red-400 font-medium">Your answer: {q.user_answer}</span>
                                        ) : (
                                            <span className="text-amber-600 dark:text-amber-400 font-medium">Skipped</span>
                                        )}
                                    </div>
                                    {q.explanation && (
                                        <p className="text-[11px] text-muted-foreground pt-1 border-t">{q.explanation}</p>
                                    )}
                                </div>
                            ))
                        ) : (
                            <p className="text-xs text-center text-muted-foreground py-4">No questions found.</p>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default MyMistakes;
