import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertCircle, PlayCircle, FileDown } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { openSolvePdf } from "@/lib/solvePdf";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const MyMistakes = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [pdfLoading, setPdfLoading] = useState<"wrong" | "both" | null>(null);
    const [singlePdfLoadingId, setSinglePdfLoadingId] = useState<string | null>(null);

    const generateSingleExamPdf = async (exam: any, mode: "all" | "wrong" | "both") => {
        setSinglePdfLoadingId(exam.id);
        try {
            const { data: reviewData } = await supabase.rpc("get_student_exam_review", {
                p_attempt_id: exam.attemptId
            });
            if (!reviewData) {
                toast({ title: "প্রশ্ন পাওয়া যায়নি", variant: "destructive" });
                return;
            }
            const userAnswers = (exam.answers as any[]) || [];
            const qs: any[] = [];
            reviewData.forEach((reviewQ: any) => {
                const userAnswerObj = userAnswers.find((a: any) => a.question_id === reviewQ.question_id);
                const selected = userAnswerObj?.selected_option;
                const isSkipped = !selected;
                const isWrong = !isSkipped && selected !== reviewQ.correct_option;
                if (mode === "wrong" && !isWrong) return;
                if (mode === "both" && !isWrong && !isSkipped) return;
                qs.push({
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
            if (qs.length === 0) {
                toast({ title: "কোনো প্রশ্ন পাওয়া যায়নি", variant: "destructive" });
                return;
            }
            openSolvePdf({
                examName: exam.title,
                questions: qs,
                totalMarks: qs.length,
                style: "style1",
            });
        } catch (e: any) {
            toast({ title: "PDF তৈরি করা যায়নি", description: e.message, variant: "destructive" });
        } finally {
            setSinglePdfLoadingId(null);
        }
    };

    const [filterMode, setFilterMode] = useState<"wrong" | "skipped" | "both">("both");
    const [category, setCategory] = useState<"all" | "live" | "practice" | "readymade">("all");
    const [readymadeSubCategory, setReadymadeSubCategory] = useState<string | null>(null);
    const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);

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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                reviewData.forEach((reviewQ: any) => {
                    const userAnswerObj = userAnswers.find((a: any) => a.question_id === reviewQ.question_id);
                    const selected = userAnswerObj?.selected_option;
                    if (!selected) skip++;
                    else if (selected !== reviewQ.correct_option) wrong++;
                });
                exam.wrongCount = wrong;
                exam.skipCount = skip;
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

    const handleSelectAll = () => {
        setSelectedExamIds(categoryFilteredExams.map((e: any) => e.id));
    };

    const handleDeselectAll = () => {
        setSelectedExamIds([]);
    };

    const toggleExam = (id: string) => {
        setSelectedExamIds(prev =>
            prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
        );
    };

    const handleStart = () => {
        if (selectedExamIds.length === 0) return;
        navigate("/dashboard/take-mistakes", {
            state: { examIds: selectedExamIds, filterMode }
        });
    };

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
                {/* Configuration Panel */}
                <Card className="lg:col-span-1 h-fit w-full mx-0">
                    <CardHeader className="py-2.5 px-3">
                        <CardTitle className="text-sm">Configuration</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 px-3 pb-3">
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium">Question Filter</label>
                            <div className="flex flex-col gap-1.5">
                                <div
                                    className={`p-2 border rounded-md cursor-pointer transition-all ${filterMode === 'wrong' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                                    onClick={() => setFilterMode('wrong')}
                                >
                                    <div className="text-xs font-medium">Wrong Only</div>
                                    <div className="text-[10px] text-muted-foreground">Questions you attempted but got wrong</div>
                                </div>
                                <div
                                    className={`p-2 border rounded-md cursor-pointer transition-all ${filterMode === 'skipped' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                                    onClick={() => setFilterMode('skipped')}
                                >
                                    <div className="text-xs font-medium">Skipped Only</div>
                                    <div className="text-[10px] text-muted-foreground">Questions you didn't answer</div>
                                </div>
                                <div
                                    className={`p-2 border rounded-md cursor-pointer transition-all ${filterMode === 'both' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                                    onClick={() => setFilterMode('both')}
                                >
                                    <div className="text-xs font-medium">Both</div>
                                    <div className="text-[10px] text-muted-foreground">All incorrect and unattempted questions</div>
                                </div>
                            </div>
                        </div>

                        <Button
                            className="w-full h-10"
                            disabled={selectedExamIds.length === 0}
                            onClick={handleStart}
                        >
                            <PlayCircle className="mr-2 h-4 w-4" /> Start Practice
                        </Button>
                        <p className="text-[11px] text-center text-muted-foreground">
                            {selectedExamIds.length} exams selected
                        </p>
                    </CardContent>
                </Card>

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

                {/* Exam Selection List */}
                <Card className="lg:col-span-2 w-full mx-0">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 py-2.5 px-3">
                        <CardTitle className="text-sm">Select Exams</CardTitle>
                        <div className="flex gap-1.5">
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={handleSelectAll}>All</Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleDeselectAll}>None</Button>
                        </div>
                    </CardHeader>
                    <CardContent className="px-3 pb-3">
                        {categoryFilteredExams.length > 0 ? (
                            <div className="space-y-3">
                                <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1" style={{ touchAction: 'pan-y' }}>
                                    {categoryFilteredExams.map((exam: any) => (
                                        <div
                                            key={exam.id}
                                            className="flex items-start space-x-2 p-2 rounded-md border active:bg-muted/50 select-none"
                                        >
                                            <Checkbox
                                                id={exam.id}
                                                checked={selectedExamIds.includes(exam.id)}
                                                onCheckedChange={() => toggleExam(exam.id)}
                                            />
                                            <div className="grid gap-1 leading-none w-full min-w-0 cursor-pointer" onClick={() => toggleExam(exam.id)}>
                                                <div className="flex justify-between items-start gap-2">
                                                    <label
                                                        htmlFor={exam.id}
                                                        className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer truncate min-w-0"
                                                    >
                                                        {exam.title}
                                                    </label>
                                                    {exam.subject && (
                                                        <Badge variant="outline" className="text-[10px] shrink-0">{exam.subject}</Badge>
                                                    )}
                                                </div>
                                                <p className="text-[10px] text-muted-foreground">
                                                    Last attempt: {format(new Date(exam.lastAttempt), "PP")}
                                                </p>
                                                <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                                                    <Badge variant="outline" className="text-[10px] text-red-600 dark:text-red-400 border-red-300 dark:border-red-900">Wrong: {exam.wrongCount}</Badge>
                                                    <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-900">Skip: {exam.skipCount}</Badge>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-6 text-[10px] px-2 ml-auto"
                                                                disabled={singlePdfLoadingId === exam.id}
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                {singlePdfLoadingId === exam.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FileDown className="h-3 w-3 mr-1" />}
                                                                Practice Sheet
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                                            <DropdownMenuItem onClick={() => generateSingleExamPdf(exam, "all")}>All Questions</DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => generateSingleExamPdf(exam, "wrong")}>Only Wrong</DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => generateSingleExamPdf(exam, "both")}>Wrong + Skip</DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
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
        </div>
    );
};

export default MyMistakes;
