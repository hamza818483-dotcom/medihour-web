import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import MathText from "@/components/MathText";
import { Loader2, Check, X, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const AdminReports = () => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [activeLiveSubject, setActiveLiveSubject] = useState<string | null>(null);
    const [activePracticeSubject, setActivePracticeSubject] = useState<string | null>(null);
    const [activeReadymadeSubject, setActiveReadymadeSubject] = useState<string | null>(null);
    const [showHistory, setShowHistory] = useState(false);

    useEffect(() => {
        document.title = "Reports – Atlas Admin";
    }, []);

    // Builds a rich, categorized notification body: exam type/category, full question,
    // all options (correct one marked), explanation, and the admin's feedback —
    // so the student sees everything in one place without needing to reopen the exam.
    const formatReportNotificationBody = (report: any, feedback: string, status: "resolved" | "declined") => {
        const q = report.question;
        const exam = q?.exam;
        const examTypeLabel = exam?.is_readymade
            ? "Readymade Exam"
            : exam?.exam_type === "special"
            ? "Special Exam"
            : exam?.exam_type === "practice"
            ? "Practice Exam"
            : exam?.exam_type === "live"
            ? "Live Exam"
            : "Exam";
        const category = q?.subject || exam?.subject || null;

        const lines: string[] = [];
        lines.push(`Category: ${examTypeLabel}${category ? ` • ${category}` : ""}`);
        if (exam?.title) lines.push(`Exam: ${exam.title}`);
        lines.push("");
        if (q?.question_text) {
            lines.push(`Question:\n${q.question_text}`);
            lines.push("");
        }
        const options: { key: string; text?: string }[] = [
            { key: "A", text: q?.option_a },
            { key: "B", text: q?.option_b },
            { key: "C", text: q?.option_c },
            { key: "D", text: q?.option_d },
        ];
        const optionLines = options
            .filter((o) => o.text)
            .map((o) => `${o.key}) ${o.text}${q?.correct_option === o.key ? "  ✅ Correct" : ""}`);
        if (optionLines.length) {
            lines.push("Options:");
            lines.push(...optionLines);
            lines.push("");
        }
        if (q?.explanation) {
            lines.push(`Explanation: ${q.explanation}`);
            lines.push("");
        }
        lines.push(`Your report: ${report.report_text}`);
        lines.push("");
        lines.push(`Status: ${status === "resolved" ? "Resolved ✅" : "Declined ❌"}`);
        lines.push(`Admin Feedback: ${feedback || "—"}`);
        return lines.join("\n");
    };

    const { data: reports, isLoading } = useQuery({
        queryKey: ["admin-reports", showHistory],
        queryFn: async () => {
            let query = supabase
                .from("question_reports")
                .select(`
                    *,
                    question:exam_questions(
                        *,
                        exam:exams(title, exam_type, is_readymade, time_window_end, subject)
                    ),
                    reporter:profiles(full_name, registration_id)
                `)
                .order("created_at", { ascending: false });

            query = showHistory
                ? query.in("status", ["resolved", "declined"])
                : query.eq("status", "pending");

            const { data, error } = await query;
            if (error) throw error;
            return data;
        }
    });

    const deleteReportMutation = useMutation({
        mutationFn: async ({ report, feedback }: { report: any, feedback: string }) => {
            const { error } = await supabase
                .from("question_reports")
                .update({ status: "declined", admin_feedback: feedback, resolved_at: new Date().toISOString() })
                .eq("id", report.id);
            if (error) throw error;

            const notificationBody = formatReportNotificationBody(report, feedback, "declined");
            await supabase.from("user_notifications").insert({
                user_id: report.user_id,
                title: "Question Report Declined",
                body: notificationBody,
                type: "report_reply"
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
            toast({ title: "Report cleared & feedback sent" });
        },
        onError: (error) => {
            toast({ title: "Failed to delete report", description: error.message, variant: "destructive" });
        }
    });



    const DeclineDialog = ({ report }: { report: any }) => {
        const [isOpen, setIsOpen] = useState(false);
        const [feedback, setFeedback] = useState("আপনার রিপোর্টটি সঠিক নয়, তাই গ্রহণ করা হলো না।");

        return (
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="flex-1 min-w-0 sm:flex-none sm:w-auto">
                        <X className="h-4 w-4 mr-1 shrink-0" />
                        <span className="truncate">Decline (Delete)</span>
                    </Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Decline Report</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to decline and delete this report? You can optionally send feedback to the student.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Feedback to Student</Label>
                            <Textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={3} placeholder="Enter your feedback here..." />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                        <Button
                            variant="destructive"
                            onClick={() => {
                                deleteReportMutation.mutate({ report, feedback });
                                setIsOpen(false);
                            }}
                            disabled={deleteReportMutation.isPending}
                        >
                            {deleteReportMutation.isPending ? "Declining..." : "Decline & Send Feedback"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    };

    const EditQuestionDialog = ({ report, onClose }: { report: any, onClose: () => void }) => {
        const [isOpen, setIsOpen] = useState(false);
        const [qText, setQText] = useState(report.question.question_text);
        const [optA, setOptA] = useState(report.question.option_a);
        const [optB, setOptB] = useState(report.question.option_b);
        const [optC, setOptC] = useState(report.question.option_c);
        const [optD, setOptD] = useState(report.question.option_d);
        const [correct, setCorrect] = useState(report.question.correct_option);
        const [explanation, setExplanation] = useState(report.question.explanation || "");
        const [feedback, setFeedback] = useState("");
        const updateQuestionMutation = useMutation({
            mutationFn: async () => {
                // 1. Update the question
                const { error: updateError } = await supabase
                    .from("exam_questions")
                    .update({
                        question_text: qText,
                        option_a: optA,
                        option_b: optB,
                        option_c: optC,
                        option_d: optD,
                        correct_option: correct,
                        explanation: explanation
                    })
                    .eq("id", report.question.id);

                if (updateError) throw updateError;

                // 1b. Recalculate marks for all existing attempts on this exam
                // so a changed correct answer reflects in already-submitted results too.
                const { error: recalcError } = await supabase.rpc("recalculate_exam_attempts_for_question", {
                    p_question_id: report.question.id,
                });
                if (recalcError) throw recalcError;

                // 2. Mark the report resolved (keep it for history, don't delete)
                const { error: deleteError } = await supabase
                    .from("question_reports")
                    .update({ status: "resolved", admin_feedback: feedback || null, resolved_at: new Date().toISOString() })
                    .eq("id", report.id);

                if (deleteError) throw deleteError;

                // 3. Send notification (always, with full corrected MCQ context)
                if (report.user_id) {
                    const updatedQuestion = {
                        ...report.question,
                        question_text: qText,
                        option_a: optA,
                        option_b: optB,
                        option_c: optC,
                        option_d: optD,
                        correct_option: correct,
                        explanation: explanation,
                    };
                    const notificationBody = formatReportNotificationBody(
                        { ...report, question: updatedQuestion },
                        feedback || "প্রশ্নটি সংশোধন করা হয়েছে।",
                        "resolved"
                    );
                    await supabase.from("user_notifications").insert({
                        user_id: report.user_id,
                        title: "Question Report Resolved",
                        body: notificationBody,
                        type: "report_reply"
                    });
                }

            },
            onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
                toast({ title: "Question updated & report resolved" });
                setIsOpen(false);
                onClose();
            },
            onError: (error) => {
                toast({ title: "Failed to update", description: error.message, variant: "destructive" });
            }
        });

        return (
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger asChild>
                    <Button variant="default" size="sm" className="flex-1 min-w-0 sm:flex-none sm:w-auto">
                        <Check className="h-4 w-4 mr-1 shrink-0" />
                        <span className="truncate">Edit & Resolve</span>
                    </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit Question</DialogTitle>
                        <DialogDescription>
                            Updating this question will resolve the report.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Question Text</Label>
                            <Textarea value={qText} onChange={e => setQText(e.target.value)} rows={3} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Option A</Label>
                                <Textarea value={optA} onChange={e => setOptA(e.target.value)} rows={2} />
                            </div>
                            <div className="space-y-2">
                                <Label>Option B</Label>
                                <Textarea value={optB} onChange={e => setOptB(e.target.value)} rows={2} />
                            </div>
                            <div className="space-y-2">
                                <Label>Option C</Label>
                                <Textarea value={optC} onChange={e => setOptC(e.target.value)} rows={2} />
                            </div>
                            <div className="space-y-2">
                                <Label>Option D</Label>
                                <Textarea value={optD} onChange={e => setOptD(e.target.value)} rows={2} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Correct Option</Label>
                            <Select value={correct} onValueChange={setCorrect}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="A">A</SelectItem>
                                    <SelectItem value="B">B</SelectItem>
                                    <SelectItem value="C">C</SelectItem>
                                    <SelectItem value="D">D</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Explanation</Label>
                            <Textarea value={explanation} onChange={e => setExplanation(e.target.value)} rows={3} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-primary font-semibold">Feedback to Student</Label>
                            <Textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={2} placeholder="Optional feedback..." />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                        <Button onClick={() => updateQuestionMutation.mutate()} disabled={updateQuestionMutation.isPending}>
                            {updateQuestionMutation.isPending ? "Saving..." : "Save & Resolve"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    };

    const getCategory = (exam: any): string => {
        if (!exam) return "Other";
        if (exam.is_readymade) return "Readymade Exam";
        if (exam.exam_type === "live") {
            const ended = exam.time_window_end && new Date(exam.time_window_end) < new Date();
            return ended ? "Practice Exam" : "Live Exam";
        }
        if (exam.exam_type === "practice") return "Practice Exam";
        return "Other";
    };

    const getSubject = (exam: any): string => {
        const subj = exam?.subject;
        if (Array.isArray(subj) && subj.length > 0) return subj[0];
        return "General";
    };

    if (isLoading) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
    }

    if (!reports || reports.length === 0) {
        return (
            <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-4">
                <AlertCircle className="h-12 w-12 text-green-500" />
                <h2 className="text-xl font-bold">All Good!</h2>
                <p>No pending question reports.</p>
            </div>
        );
    }

    const CATEGORY_ORDER = ["Live Exam", "Practice Exam", "Readymade Exam", "Other"];
    const groupedReports: Record<string, typeof reports> = {};
    for (const report of reports) {
        const cat = getCategory(report.question?.exam);
        if (!groupedReports[cat]) groupedReports[cat] = [];
        groupedReports[cat].push(report);
    }

    const availableCategories = CATEGORY_ORDER.filter(cat => cat !== "Other" || groupedReports[cat]?.length);
    const currentCategory = activeCategory && availableCategories.includes(activeCategory) ? activeCategory : availableCategories[0];

    let visibleReports = groupedReports[currentCategory] || [];
    let subjectTabs: string[] = [];
    let activeSubject: string | null = null;
    const activeSubjectState = currentCategory === "Live Exam" ? activeLiveSubject
        : currentCategory === "Practice Exam" ? activePracticeSubject
        : currentCategory === "Readymade Exam" ? activeReadymadeSubject
        : null;
    const setActiveSubjectState = currentCategory === "Live Exam" ? setActiveLiveSubject
        : currentCategory === "Practice Exam" ? setActivePracticeSubject
        : currentCategory === "Readymade Exam" ? setActiveReadymadeSubject
        : null;

    if (currentCategory === "Live Exam" || currentCategory === "Practice Exam" || currentCategory === "Readymade Exam") {
        const bySubject: Record<string, typeof reports> = {};
        for (const r of visibleReports) {
            const subj = getSubject(r.question?.exam);
            if (!bySubject[subj]) bySubject[subj] = [];
            bySubject[subj].push(r);
        }
        subjectTabs = Object.keys(bySubject).sort();
        activeSubject = activeSubjectState && bySubject[activeSubjectState]?.length ? activeSubjectState : subjectTabs[0];
        visibleReports = bySubject[activeSubject] || [];
    }

    const ViewFullDialog = ({ report }: { report: any }) => {
        const [isOpen, setIsOpen] = useState(false);
        return (
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger asChild>
                    <Button variant="secondary" size="sm" className="flex-1 min-w-0 sm:flex-none sm:w-auto">
                        <span className="truncate">View Full</span>
                    </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto text-sm">
                    <DialogHeader>
                        <DialogTitle className="text-sm flex items-center justify-between gap-2 pr-6">
                            <span>Q{report.question?.question_index}</span>
                            <span className="text-xs font-medium bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                                Correct: <strong>{report.question?.correct_option}</strong>
                            </span>
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="bg-orange-50 dark:bg-orange-950/20 p-2 rounded-lg border border-orange-100 dark:border-orange-900">
                            <h3 className="text-xs font-bold text-orange-800 dark:text-orange-200 mb-1 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                User Report
                            </h3>
                            <p className="text-xs italic">"{report.report_text}"</p>
                            {report.suggested_correct_option && (
                                <div className="mt-1 text-xs">
                                    <span className="text-red-600 bg-red-100 px-1.5 py-0.5 rounded font-bold">
                                        Suggested: {report.suggested_correct_option}
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="text-sm">
                            <MathText text={report.question?.question_text || ""} />
                        </div>
                        <div className="grid grid-cols-1 gap-1.5">
                            {(["A", "B", "C", "D"] as const).map((opt) => {
                                const optText = report.question?.[`option_${opt.toLowerCase()}`];
                                const isCorrect = report.question?.correct_option === opt;
                                return (
                                    <div
                                        key={opt}
                                        className={`text-xs px-2 py-1.5 rounded border ${isCorrect ? "bg-green-100 dark:bg-green-950/30 border-green-300 font-semibold" : "bg-muted/40 border-transparent"}`}
                                    >
                                        <span className="font-bold">{opt}.</span> <MathText text={optText || ""} />
                                    </div>
                                );
                            })}
                        </div>
                        {report.question?.explanation && (
                            <div className="text-xs border-t pt-2">
                                <span className="font-bold">Explanation: </span>
                                <MathText text={report.question.explanation} />
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        );
    };

    const renderCard = (report: any) => (
        <Card key={report.id} className="border shadow-sm overflow-hidden text-sm">
            <CardHeader className="bg-muted/30 py-2 px-3">
                <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                        <CardTitle className="text-xs font-medium text-muted-foreground truncate">
                            <span className="text-foreground font-bold">{report.reporter?.full_name}</span> ({report.reporter?.registration_id})
                        </CardTitle>
                        <CardDescription className="text-xs truncate">
                            {report.question?.exam?.title}
                        </CardDescription>
                    </div>
                    <div className="text-[10px] text-muted-foreground shrink-0 text-right leading-tight">
                        <div>{new Date(report.created_at).toLocaleDateString()}</div>
                        <div>{new Date(report.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-3 space-y-2">
                <div className="bg-orange-50 dark:bg-orange-950/20 p-2 rounded-lg border border-orange-100 dark:border-orange-900">
                    <h3 className="text-xs font-bold text-orange-800 dark:text-orange-200 mb-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        User Report
                    </h3>
                    <p className="text-xs italic line-clamp-3">"{report.report_text}"</p>
                    {report.suggested_correct_option && (
                        <div className="mt-1 text-xs">
                            <span className="text-red-600 bg-red-100 px-1.5 py-0.5 rounded font-bold">Suggested: {report.suggested_correct_option}</span>
                        </div>
                    )}
                </div>

                <div className="border rounded-lg p-2 bg-card">
                    <div className="flex justify-between items-center mb-1 pb-1 border-b">
                        <span className="font-bold text-[10px] bg-secondary px-1.5 py-0.5 rounded">Q{report.question?.question_index}</span>
                        <span className="text-[10px] font-medium bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Correct: <strong>{report.question?.correct_option}</strong></span>
                    </div>
                    <div className="text-xs mb-2 line-clamp-3">
                        <MathText text={report.question?.question_text || ""} />
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                        {(["A", "B", "C", "D"] as const).map((opt) => {
                            const optText = report.question?.[`option_${opt.toLowerCase()}`];
                            const isCorrect = report.question?.correct_option === opt;
                            return (
                                <div
                                    key={opt}
                                    className={`text-[10px] px-1.5 py-1 rounded border truncate ${isCorrect ? "bg-green-100 dark:bg-green-950/30 border-green-300 font-semibold" : "bg-muted/40 border-transparent"}`}
                                >
                                    <span className="font-bold">{opt}.</span> <MathText text={optText || ""} />
                                </div>
                            );
                        })}
                    </div>
                </div>
            </CardContent>
            <CardFooter className="flex flex-row justify-end gap-2 bg-muted/20 py-3 px-3 flex-wrap">
                {report.status === "pending" ? (
                    <>
                        <ViewFullDialog report={report} />
                        <DeclineDialog report={report} />
                        <EditQuestionDialog report={report} onClose={() => {}} />
                    </>
                ) : (
                    <div className="w-full space-y-1.5">
                        <span className={`text-xs font-bold px-2 py-1 rounded-full inline-block ${report.status === "resolved" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {report.status === "resolved" ? "Resolved ✅" : "Declined ❌"}
                        </span>
                        {report.admin_feedback && (
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{report.admin_feedback}</p>
                        )}
                    </div>
                )}
            </CardFooter>
        </Card>
    );

    return (
        <div className="space-y-6 pb-20 p-2 sm:p-4 mx-auto overflow-x-hidden w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold tracking-tight">Question Reports</h1>
                    <p className="text-sm text-muted-foreground">{showHistory ? "Resolved & declined report history." : "Manage user reported mistakes."}</p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                    <div className="flex rounded-full border overflow-hidden text-xs font-semibold">
                        <button
                            type="button"
                            onClick={() => setShowHistory(false)}
                            className={`px-3 py-1.5 transition-colors ${!showHistory ? "bg-primary text-primary-foreground" : "bg-secondary/60 hover:bg-secondary"}`}
                        >
                            Pending
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowHistory(true)}
                            className={`px-3 py-1.5 transition-colors ${showHistory ? "bg-primary text-primary-foreground" : "bg-secondary/60 hover:bg-secondary"}`}
                        >
                            History
                        </button>
                    </div>
                    <div className="text-sm font-medium bg-secondary px-3 py-1 rounded-full">
                        {reports.length} {showHistory ? "Total" : "Pending"}
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap gap-1.5 sm:gap-2 pb-1">
                {availableCategories.map((cat) => (
                    <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveCategory(cat)}
                        className={`flex items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg border text-xs sm:text-sm font-bold uppercase tracking-wide transition-colors whitespace-nowrap shrink-0 ${cat === currentCategory ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/70 hover:bg-secondary"}`}
                    >
                        {cat}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cat === currentCategory ? "bg-primary-foreground/20" : "bg-background"}`}>
                            {groupedReports[cat]?.length || 0}
                        </span>
                    </button>
                ))}
            </div>

            {(currentCategory === "Live Exam" || currentCategory === "Practice Exam" || currentCategory === "Readymade Exam") && subjectTabs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 sm:gap-2 pb-1">
                    {subjectTabs.map((subj) => (
                        <button
                            key={subj}
                            type="button"
                            onClick={() => setActiveSubjectState?.(subj)}
                            className={`px-2.5 py-1.5 rounded-full border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${subj === activeSubject ? "bg-foreground text-background border-foreground" : "bg-muted hover:bg-muted/70"}`}
                        >
                            {subj}
                        </button>
                    ))}
                </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visibleReports.map(renderCard)}
            </div>
        </div>
    );
};

export default AdminReports;
