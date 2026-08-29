import { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import MathText from "@/components/MathText";
import { LayoutGrid, Clock, CheckCircle2, AlertTriangle, Loader2, PlayCircle, RotateCcw, Check, X, Bookmark, RotateCw, Trophy, Lock, Calculator, ArrowLeft } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

interface Question {
    id: string;
    question_text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    option_e?: string;
    correct_option: string;
    explanation?: string;
    exam_id: string;
    exam_title?: string;
    marks: number;
    negative_mark: number;
}

const TakeMistakeExam = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { toast } = useToast();
    const { user } = useAuth();

    const state = location.state as { examIds: string[]; filterMode: 'wrong' | 'skipped' | 'both'; sourceAttemptId?: string } | undefined;

    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const [isNavigatorOpen, setIsNavigatorOpen] = useState(false);
    const [hasStarted, setHasStarted] = useState(false);
    const [agreedToInstructions, setAgreedToInstructions] = useState(false);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [isFinished, setIsFinished] = useState(false);
    const questionRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

    // Result State
    const [resultData, setResultData] = useState<{
        score: number;
        total: number;
        correctCount: number;
        wrongCount: number;
        skippedCount: number;
        timeTaken: number;
        correctMarks: number;
        negativeMarks: number;
    } | null>(null);

    const { data: loadedQuestions, isLoading, isError } = useQuery({
        queryKey: ["mistake-questions", state?.examIds, state?.filterMode],
        queryFn: async () => {
            if (!state?.examIds || state.examIds.length === 0) return [];

            const allQuestions: Question[] = [];

            // Process exams in parallel batches of 5 to avoid overwhelming but speed up
            // Or just simpler Promise.all
            const promises = state.examIds.map(async (examId) => {
                // 1. Get Exam Details (Negative Marking)
                const { data: examData } = await supabase
                    .from("exams")
                    .select("title, negative_mark_per_question")
                    .eq("id", examId)
                    .single();

                const examTitle = examData?.title || "Unknown Exam";
                const negativeMark = Number(examData?.negative_mark_per_question) || 0;

                // 2. Get latest attempt
                const { data: attempts } = await supabase
                    .from("exam_attempts")
                    .select("id, answers")
                    .eq("exam_id", examId)
                    .eq("profile_id", user?.id)
                    .order("submitted_at", { ascending: false })
                    .limit(1);

                if (!attempts || attempts.length === 0) return [];
                const attempt = attempts[0];

                // 3. Get questions review (to know correct answers for filtering)
                const { data: reviewData } = await supabase.rpc("get_student_exam_review", {
                    p_attempt_id: attempt.id
                });

                if (!reviewData) return [];

                // 4. Get full question details
                const { data: questionDetails } = await supabase.rpc("get_exam_questions", {
                    p_exam_id: examId
                });

                if (!questionDetails) return [];

                // 5. Filter

                const questionsToAdd: Question[] = [];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const userAnswers = (attempt.answers as any[]) || [];

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                reviewData.forEach((reviewQ: any) => {
                    // Match with user answer
                    const userAnswerObj = userAnswers.find((a: any) => a.question_id === reviewQ.question_id);
                    const selected = userAnswerObj?.selected_option; // string "A", "B"... or null/undefined
                    const correct = reviewQ.correct_option;

                    let include = false;
                    if (state.filterMode === 'skipped') {
                        if (!selected) include = true;
                    } else if (state.filterMode === 'wrong') {
                        if (selected && selected !== correct) include = true;
                    } else { // both
                        if (!selected || selected !== correct) include = true;
                    }

                    if (include) {
                        // Find full details
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const detail = questionDetails.find((d: any) => d.id === reviewQ.question_id);
                        if (detail) {
                            questionsToAdd.push({
                                ...detail,
                                correct_option: correct, // We need correct option for result view later
                                exam_title: examTitle,
                                marks: Number(detail.marks) || 1,
                                negative_mark: negativeMark
                            });
                        }
                    }
                });

                return questionsToAdd;
            });

            const results = await Promise.all(promises);

            // Collect questions grouped by exam
            // We want to keep them grouped for the UI sections
            // But we can shuffle the order of exams, and shuffle questions within each exam

            // 1. Shuffle the order of exams (optional, but good for variety if selecting many)
            for (let i = results.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [results[i], results[j]] = [results[j], results[i]];
            }

            // 2. Flatten but keep groups intact (shuffle within groups)
            results.forEach(batch => {
                // Shuffle questions WITHIN this exam batch
                for (let i = batch.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [batch[i], batch[j]] = [batch[j], batch[i]];
                }
                // Add to main list
                allQuestions.push(...batch);
            });

            return allQuestions;
        },
        enabled: !!state && !!user,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
    });

    useEffect(() => {
        if (loadedQuestions && questions.length === 0 && !isFinished) {
            setQuestions(loadedQuestions);
        }
    }, [loadedQuestions, questions.length, isFinished]);

    useEffect(() => {
        if (hasStarted && timeLeft === null && questions.length > 0) {
            setTimeLeft(questions.length * 45); // 45 seconds per question
        }
    }, [hasStarted, timeLeft, questions.length]);

    // Timer Tick
    useEffect(() => {
        if (!hasStarted || timeLeft === null || isFinished) return;

        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev === null) return null;
                if (prev <= 1) {
                    clearInterval(timer);
                    handleFinish();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [hasStarted, timeLeft, isFinished]);


    const handleFinish = () => {
        setIsFinished(true);
        // Calculate Score
        let correctCount = 0;
        let wrongCount = 0;
        let skippedCount = 0;
        let correctMarks = 0;
        let negativeMarks = 0;

        questions.forEach(q => {
            const selected = answers[q.id];
            if (!selected) {
                skippedCount++;
            } else if (selected === q.correct_option) {
                correctCount++;
                correctMarks += q.marks;
            } else {
                wrongCount++;
                negativeMarks += q.negative_mark;
            }
        });

        const total = questions.length;
        const timeTaken = (questions.length * 45) - (timeLeft || 0);
        const score = Math.max(0, correctMarks - negativeMarks);

        setResultData({
            score,
            total,
            correctCount,
            wrongCount,
            skippedCount,
            timeTaken,
            correctMarks,
            negativeMarks
        });

        window.scrollTo(0,0);
    };

    const scrollToQuestion = (index: number) => {
        const questionId = questions?.[index]?.id;
        if (questionId && questionRefs.current[questionId]) {
            questionRefs.current[questionId]?.scrollIntoView({ behavior: "smooth", block: "center" });
            setIsNavigatorOpen(false);
        }
    };

    // After answering a question, auto-scroll to the next unanswered question.
    const scrollToNextUnanswered = (currentQuestionId: string, latestAnswers: Record<string, string>) => {
        const list = questions;
        if (!list || list.length === 0) return;
        const currentIndex = list.findIndex((q) => q.id === currentQuestionId);
        if (currentIndex === -1) return;

        let targetId: string | null = null;
        for (let i = currentIndex + 1; i < list.length; i++) {
            if (!latestAnswers[list[i].id]) { targetId = list[i].id; break; }
        }
        if (!targetId) {
            for (let i = 0; i < currentIndex; i++) {
                if (!latestAnswers[list[i].id]) { targetId = list[i].id; break; }
            }
        }
        if (!targetId) return;

        const finalTargetId = targetId;
        setTimeout(() => {
            requestAnimationFrame(() => {
                questionRefs.current[finalTargetId]?.scrollIntoView({ behavior: "smooth", block: "center" });
            });
        }, 300);
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    };

    if (!state || !state.examIds) {
        return <div className="p-8 text-center">Invalid State. Please start from My Mistakes page. <Button onClick={() => navigate('/dashboard/my-mistakes')} variant="link">Go Back</Button></div>;
    }

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-muted-foreground">Preparing your personalized practice exam...</p>
                <p className="text-xs text-muted-foreground">Fetching questions from multiple exams</p>
            </div>
        );
    }

    if (isError) {
        return <div className="p-8 text-center text-red-500">Error loading questions. Please try again.</div>;
    }

    if (questions.length === 0 && !isFinished) {
        return (
            <div className="p-8 text-center flex flex-col items-center justify-center min-h-[60vh]">
                <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
                <h2 className="text-2xl font-bold mb-2">No Mistakes Found!</h2>
                <p className="text-muted-foreground mb-6">You don't have any matching questions for the selected criteria.</p>
                <Button onClick={() => navigate('/dashboard/my-mistakes')}>Go Back</Button>
            </div>
        );
    }

    // --- RESULT VIEW (checked first so a background refetch never bumps the user back to loading/start) ---
    if (isFinished && resultData) {
        return (
            <div className="min-h-screen bg-background font-sans pb-20 -mt-4">
                <div className="container max-w-4xl mx-auto px-[5px] pt-0 pb-2 md:pt-0 md:pb-6 md:px-6 space-y-2 overflow-x-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-end gap-1.5 flex-nowrap overflow-x-auto">
                             <Button size="sm" variant="outline" className="shrink-0 px-2 text-xs sm:text-sm sm:px-3" onClick={() => navigate('/dashboard/my-mistakes')}>
                                <ArrowLeft className="h-4 w-4 mr-1 sm:mr-2" /> Exam List
                             </Button>
                             {state.sourceAttemptId && (
                                 <Button size="sm" variant="outline" className="shrink-0 px-2 text-xs sm:text-sm sm:px-3" onClick={() => navigate(`/dashboard/exam-review/${state.sourceAttemptId}`)}>
                                    <RotateCcw className="h-4 w-4 mr-1 sm:mr-2" /> Main Result
                                 </Button>
                             )}
                             <Button size="sm" className="shrink-0 px-2 text-xs sm:text-sm sm:px-3" onClick={() => window.location.reload()}>
                                <RotateCw className="h-4 w-4 mr-1 sm:mr-2" /> Practice Again
                             </Button>
                    </div>

                    {/* Score Card */}
                    <Card className="bg-primary/5 border-primary/20">
                        <CardContent className="p-6">
                            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                                <div className="text-center md:text-left">
                                    <h1 className="text-2xl font-bold mb-1">Practice Result</h1>
                                    <p className="text-sm text-muted-foreground">Duration: {Math.floor(resultData.timeTaken / 60)}m {resultData.timeTaken % 60}s</p>
                                </div>
                                <div className="flex gap-8 text-center">
                                    <div>
                                        <div className="text-3xl font-bold text-primary">{resultData.score.toFixed(2)}</div>
                                        <div className="text-xs uppercase font-bold text-muted-foreground">Score</div>
                                    </div>
                                     <div>
                                        <div className="text-3xl font-bold text-green-600">{resultData.correctCount}</div>
                                        <div className="text-xs uppercase font-bold text-muted-foreground">Correct</div>
                                    </div>
                                     <div>
                                        <div className="text-3xl font-bold text-red-500">{resultData.wrongCount}</div>
                                        <div className="text-xs uppercase font-bold text-muted-foreground">Wrong</div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Formula Card */}
                    <Card className="bg-card border-border shadow-sm">
                        <CardContent className="p-4 md:p-6">
                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-muted-foreground">
                                <Calculator className="h-5 w-5" /> Score Breakdown
                            </h3>
                            {/* Mobile: Grid Layout (Side by Side) */}
                            <div className="grid grid-cols-3 gap-2 md:hidden text-xs">
                                <div className="p-2 bg-green-500/5 rounded-lg border border-green-500/20 text-center">
                                    <div className="text-[10px] text-muted-foreground font-bold uppercase mb-1">Correct</div>
                                    <div className="text-base font-bold text-green-600 font-mono">+{resultData.correctMarks.toFixed(1)}</div>
                                </div>

                                <div className="p-2 bg-red-500/5 rounded-lg border border-red-500/20 text-center">
                                    <div className="text-[10px] text-muted-foreground font-bold uppercase mb-1">Negative</div>
                                    <div className="text-base font-bold text-red-500 font-mono">-{resultData.negativeMarks.toFixed(1)}</div>
                                </div>

                                <div className="p-2 bg-primary/5 rounded-lg border border-primary/20 text-center">
                                    <div className="text-[10px] text-muted-foreground font-bold uppercase mb-1">Total</div>
                                    <div className="text-base font-bold text-primary font-mono">{resultData.score.toFixed(2)}</div>
                                </div>
                            </div>

                            {/* Desktop: Flex Row */}
                            <div className="hidden md:flex flex-row gap-4 items-center text-sm">
                                <div className="flex-1 p-3 bg-green-500/5 rounded-xl border border-green-500/20 text-left">
                                    <div className="text-muted-foreground text-xs uppercase font-bold tracking-wider mb-1">Correct Marks</div>
                                    <div className="text-xl font-bold text-green-600 font-mono">+{resultData.correctMarks.toFixed(2)}</div>
                                </div>

                                <div className="text-muted-foreground font-bold text-xl">-</div>

                                <div className="flex-1 p-3 bg-red-500/5 rounded-xl border border-red-500/20 text-left">
                                    <div className="text-muted-foreground text-xs uppercase font-bold tracking-wider mb-1">Negative ({resultData.wrongCount})</div>
                                    <div className="text-xl font-bold text-red-500 font-mono">-{resultData.negativeMarks.toFixed(2)}</div>
                                </div>

                                <div className="text-muted-foreground font-bold text-xl">=</div>

                                <div className="flex-1 p-3 bg-primary/5 rounded-xl border border-primary/20 text-left">
                                    <div className="text-muted-foreground text-xs uppercase font-bold tracking-wider mb-1">Final Score</div>
                                    <div className="text-xl font-bold text-primary font-mono">{resultData.score.toFixed(2)}</div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Questions List */}
                    <div className="space-y-6">
                        {questions.map((q, idx) => {
                            const selected = answers[q.id];
                            const isCorrect = selected === q.correct_option;
                            const isSkipped = !selected;
                            const isWrong = !isCorrect && !isSkipped;

                            return (
                                <Card key={q.id} className="rounded-[30px] overflow-hidden shadow-sm border">
                                    <CardContent className="p-5 space-y-2 relative">
                                        {/* Question Header */}
                                        <div className="flex items-start gap-4 pr-10">
                                            <div className={cn(
                                                "flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm",
                                                isCorrect ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                                                isWrong ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                                                "bg-muted text-muted-foreground"
                                            )}>
                                                {idx + 1}
                                            </div>
                                            <div className="flex-1 min-w-0 pt-1 overflow-x-auto no-scrollbar scroll-smooth">
                                                <div className="text-lg font-medium leading-relaxed whitespace-pre-line min-w-0">
                                                    <MathText text={q.question_text} className="prose dark:prose-invert max-w-none whitespace-pre-line min-w-0" />
                                                </div>
                                                <Badge variant="outline" className="mt-2 text-[10px]">{q.exam_title}</Badge>
                                            </div>
                                        </div>

                                        {/* Options */}
                                        <div className="space-y-2 pt-2">
                                            {(["A", "B", "C", "D", "E"] as const).map((optionKey) => {
                                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                const optionText = (q as any)[`option_${optionKey.toLowerCase()}`];
                                                if (!optionText) return null;
                                                const isSelected = selected === optionKey;
                                                const isCorrectOption = q.correct_option === optionKey;

                                                // Determine circle style
                                                let circleClass = "border-muted-foreground/30 text-muted-foreground";
                                                let icon = <span className="text-sm font-bold">{optionKey}</span>;

                                                if (isCorrectOption) {
                                                    circleClass = "bg-green-500 border-green-500 text-white";
                                                    icon = <Check className="h-4 w-4" />;
                                                } else if (isSelected && !isCorrectOption) {
                                                    circleClass = "bg-red-500 border-red-500 text-white";
                                                    icon = <X className="h-4 w-4" />;
                                                } else if (isSelected) {
                                                    circleClass = "bg-green-500 border-green-500 text-white";
                                                    icon = <Check className="h-4 w-4" />;
                                                }

                                                return (
                                                    <div key={optionKey} className="flex items-center gap-4 max-w-full">
                                                        <div className={cn(
                                                            "flex-shrink-0 h-8 w-8 rounded-full border-2 flex items-center justify-center transition-all",
                                                            circleClass
                                                        )}>
                                                            {icon}
                                                        </div>
                                                        <div className={cn(
                                                            "flex-1 min-w-0 text-base whitespace-pre-line p-3 rounded-lg border transition-all overflow-x-auto no-scrollbar scroll-smooth",
                                                            isCorrectOption ? "text-green-700 dark:text-green-400 font-medium bg-green-500/10 border-green-500/40" :
                                                            isSelected ? "text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/40" : "text-foreground border-border/60"
                                                        )}>
                                                            <MathText text={optionText} className="prose dark:prose-invert max-w-none whitespace-pre-line min-w-0" />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Explanation */}
                                        {q.explanation && (
                                            <div className="mt-4 pt-4 border-t border-dashed">
                                                <h4 className="text-sm font-bold text-muted-foreground mb-1">Explanation:</h4>
                                                <div className="text-sm text-foreground/80 whitespace-pre-line overflow-x-auto no-scrollbar scroll-smooth">
                                                    <MathText text={q.explanation} className="prose dark:prose-invert max-w-none whitespace-pre-line min-w-0" />
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    // --- START SCREEN ---
    if (!hasStarted) {
        const uniqueExamTitles = Array.from(new Set(questions.map(q => q.exam_title).filter(Boolean)));
        const headerTitle = uniqueExamTitles.length === 1 ? uniqueExamTitles[0] : "Mistakes Practice";
        return (
            <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-2">
                <Card className="w-full max-w-md shadow-xl">
                    <CardContent className="p-3 space-y-2 text-center">
                        <div className="space-y-0.5">
                            <h1 className="text-xl font-bold text-primary leading-tight truncate">{headerTitle}</h1>
                            <p className="text-[11px] text-muted-foreground">
                                {uniqueExamTitles.length > 1
                                    ? `Mistakes Practice · ${uniqueExamTitles.length} exams · ${questions.length} questions`
                                    : `${questions.length} questions based on your selection`}
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                             <div className="p-1.5 bg-muted rounded-lg">
                                 <div className="text-[9px] font-medium text-muted-foreground uppercase">Questions</div>
                                 <div className="text-lg font-bold">{questions.length}</div>
                             </div>
                             <div className="p-1.5 bg-muted rounded-lg">
                                 <div className="text-[9px] font-medium text-muted-foreground uppercase">Duration</div>
                                 <div className="text-lg font-bold text-primary">{Math.ceil((questions.length * 45) / 60)} <span className="text-[9px] font-normal text-muted-foreground">min</span></div>
                             </div>
                        </div>

                        <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/20 p-2 rounded-lg text-[10px] text-left">
                            <h3 className="font-bold flex items-center gap-1.5 mb-0.5">
                                <AlertTriangle className="h-3 w-3 text-yellow-600 shrink-0" />
                                Note
                            </h3>
                            <ul className="list-disc pl-3.5 space-y-0 text-muted-foreground">
                                <li>45 seconds per question.</li>
                                <li>Doesn't affect main exam statistics.</li>
                                <li>Questions from multiple exams you've taken.</li>
                            </ul>
                        </div>

                        <div className="flex items-center justify-center space-x-2">
                            <Checkbox
                                id="terms"
                                checked={agreedToInstructions}
                                onCheckedChange={(c) => setAgreedToInstructions(!!c)}
                            />
                            <label htmlFor="terms" className="text-xs font-medium cursor-pointer">
                                I am ready to start.
                            </label>
                        </div>

                        <div className="flex gap-2 justify-center">
                            <Button variant="outline" size="sm" onClick={() => navigate(-1)}>Cancel</Button>
                            <Button
                                size="sm"
                                disabled={!agreedToInstructions}
                                onClick={() => setHasStarted(true)}
                                className="min-w-[130px]"
                            >
                                <PlayCircle className="mr-2 h-4 w-4" /> Start Now
                            </Button>
                        </div>

                    </CardContent>
                </Card>
            </div>
        );
    }

    // --- EXAM UI ---

    const currentQIndex = 0; // We render list, so no single currentQ. But navigator needs index.

    const isLowTime = timeLeft !== null && timeLeft < 60;

    return (
        <div className="min-h-screen bg-background pb-20 relative font-sans overflow-x-hidden">
            <div className="container max-w-4xl mx-auto px-[5px] py-4 md:p-8 space-y-6 overflow-x-hidden">
                <div className="sticky top-0 z-40 bg-background/95 backdrop-blur py-2 -mx-[5px] px-[5px] md:mx-0 md:px-0 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h1 className="text-xl md:text-2xl font-bold truncate">Practice Session</h1>
                            <p className="text-sm text-muted-foreground">
                                {Object.keys(answers).length} of {questions.length} answered
                            </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <div className={cn(
                                "px-3 py-1.5 rounded-full font-mono font-bold shadow-sm border flex items-center gap-1.5 transition-all duration-300 text-sm",
                                isLowTime
                                    ? "bg-red-600 text-white border-red-700 animate-pulse"
                                    : "bg-background border-primary/20 text-primary"
                            )}>
                                <Clock className="h-3.5 w-3.5" />
                                {timeLeft !== null ? formatTime(timeLeft) : "--:--"}
                            </div>
                        </div>
                    </div>
                </div>

                {questions.map((q, idx) => {
                    // Group header if exam changes?
                    // Optional: check if previous question exam title is different
                    const showHeader = idx === 0 || questions[idx-1].exam_title !== q.exam_title;

                    return (
                        <div key={q.id} ref={(el) => { questionRefs.current[q.id] = el; }} className="scroll-mt-28">
                            {showHeader && (
                                <div className="flex items-center gap-2 pt-4 pb-2">
                                    <div className="h-px bg-border flex-1" />
                                    <Badge variant="outline" className="text-muted-foreground font-normal bg-muted/50">
                                        {q.exam_title}
                                    </Badge>
                                    <div className="h-px bg-border flex-1" />
                                </div>
                            )}

                            <Card className="shadow-sm rounded-[30px] overflow-hidden max-w-full">
                                <CardContent className="p-5 space-y-2 max-w-full overflow-x-hidden">
                                    <div className="flex items-start gap-4 max-w-full">
                                        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1 min-w-0 pt-1 overflow-x-auto no-scrollbar scroll-smooth">
                                            <MathText text={q.question_text} className="prose dark:prose-invert max-w-none whitespace-pre-line min-w-0" />
                                        </div>
                                    </div>

                                    <div className="space-y-2 pt-2 max-w-full">
                                        {(["A", "B", "C", "D", "E"] as const).map((optionKey) => {
                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                            const optionText = (q as any)[`option_${optionKey.toLowerCase()}`];
                                            if (!optionText) return null;
                                            const isSelected = answers[q.id] === optionKey;
                                            const isAnswered = !!answers[q.id];
                                            const isDisabled = isAnswered && !isSelected;

                                            return (
                                                <div
                                                    key={optionKey}
                                                    onClick={() => {
                                                        if (!isAnswered) {
                                                            setAnswers(prev => {
                                                                const updated = { ...prev, [q.id]: optionKey };
                                                                scrollToNextUnanswered(q.id, updated);
                                                                return updated;
                                                            });
                                                        }
                                                    }}
                                                    className={cn("flex items-center gap-4 group max-w-full", !isAnswered && "cursor-pointer", isDisabled && "opacity-50 pointer-events-none")}
                                                >
                                                    <div className={cn(
                                                        "flex-shrink-0 h-8 w-8 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all",
                                                        isSelected
                                                            ? "border-primary bg-primary text-primary-foreground scale-110"
                                                            : "border-muted-foreground/30 text-muted-foreground",
                                                        !isAnswered && !isSelected && "group-hover:border-primary/50 group-hover:text-primary",
                                                        isDisabled && "border-muted-foreground/20 text-muted-foreground/50 cursor-not-allowed"
                                                    )}>
                                                        {optionKey}
                                                    </div>
                                                    <div className={cn(
                                                        "flex-1 min-w-0 text-base whitespace-pre-line flex items-center justify-between gap-3 p-3 rounded-lg border transition-all",
                                                        isSelected ? "text-primary font-medium bg-primary/10 border-primary/50 shadow-sm" : "text-foreground border-border/60 hover:bg-muted/30 hover:border-primary/30"
                                                    )}>
                                                        <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar scroll-smooth overscroll-x-contain">
                                                            <MathText text={optionText} className="prose dark:prose-invert max-w-none whitespace-pre-line min-w-0 break-words" />
                                                        </div>
                                                        {isSelected && <Lock className="h-5 w-5 text-primary shrink-0 ml-auto" />}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    );
                })}

                <div className="flex justify-center mt-8 pb-12">
                     {/* Placeholder to ensure scrolling space */}
                </div>
            </div>

            {/* Floating Submit */}
            <div className="fixed bottom-6 right-6 z-40">
                <Button
                    size="default"
                    onClick={handleFinish}
                    className="h-12 rounded-full shadow-xl bg-green-600 hover:bg-green-700 text-white font-bold px-5"
                >
                    Submit Practice
                </Button>
            </div>

            {/* Navigator FAB */}
            <div className="fixed top-1/2 right-4 -translate-y-1/2 z-40">
                <Button
                    size="icon"
                    className="h-12 w-12 rounded-full shadow-xl bg-primary hover:bg-primary/90"
                    onClick={() => setIsNavigatorOpen(true)}
                >
                    <LayoutGrid className="h-6 w-6" />
                </Button>
            </div>

            <Dialog open={isNavigatorOpen} onOpenChange={setIsNavigatorOpen}>
                <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Question Navigator</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-5 gap-3 p-2">
                        {questions.map((q, idx) => {
                            const isAnswered = !!answers[q.id];
                            return (
                                <button
                                    key={q.id}
                                    onClick={() => scrollToQuestion(idx)}
                                    className={cn(
                                        "h-10 w-10 rounded-lg flex items-center justify-center text-sm font-bold transition-all border",
                                        isAnswered
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-muted text-muted-foreground hover:bg-muted/80 border-transparent"
                                    )}
                                >
                                    {idx + 1}
                                </button>
                            );
                        })}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default TakeMistakeExam;
