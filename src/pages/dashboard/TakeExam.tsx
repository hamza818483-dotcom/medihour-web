import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import MathText from "@/components/MathText";
import { LayoutGrid, Clock, AlertTriangle, RotateCw, CheckCircle2, ChevronLeft, ArrowLeft, Loader2, Lock, Plus, Minus, Zap, Volume2, Volume1, VolumeX, Volume, Bookmark, Flag } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { useAntiCheat } from "@/hooks/useAntiCheat";
import { useStudyToolsOptional } from "@/contexts/StudyToolsContext";
import { Checkbox } from "@/components/ui/checkbox";
import { useEnrollments } from "@/hooks/useEnrollments";
import { OmrExamScanner } from "@/components/exam/OmrExamScanner";
import { RIGHT_PACKS, WRONG_PACKS, playSound } from "@/lib/quizSounds";
import GuestExamInfoDialog from "@/components/exam/GuestExamInfoDialog";
import { getGuestInfo, GuestExamInfo } from "@/lib/guestExamInfo";

const ReportQuestionDialog = ({ questionId, questionText, onClose }: { questionId: string, questionText: string, onClose: () => void }) => {
    const { toast } = useToast();
    const [reportText, setReportText] = useState("");
    const [suggestedOption, setSuggestedOption] = useState<string | undefined>(undefined);
    const [isOpen, setIsOpen] = useState(false);
    const { user } = useAuth();
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isUploadingImage, setIsUploadingImage] = useState(false);

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast({ title: "File too large", description: "Please select an image under 5MB.", variant: "destructive" });
            return;
        }
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
    };

    const reportMutation = useMutation({
        mutationFn: async () => {
            if (!user) throw new Error("Must be logged in");
            let image_url: string | null = null;
            if (imageFile) {
                setIsUploadingImage(true);
                const ext = imageFile.name.split(".").pop() || "jpg";
                const filePath = `${user.id}/${Date.now()}.${ext}`;
                const { error: uploadError } = await supabase.storage
                    .from("report-images")
                    .upload(filePath, imageFile, { upsert: true, cacheControl: "3600" });
                setIsUploadingImage(false);
                if (uploadError) throw uploadError;
                const { data: publicUrlData } = supabase.storage.from("report-images").getPublicUrl(filePath);
                image_url = publicUrlData.publicUrl;
            }
            const { error } = await supabase.from("question_reports").insert({
                question_id: questionId,
                user_id: user.id,
                report_text: reportText,
                suggested_correct_option: suggestedOption,
                image_url
            });
            if (error) throw error;
        },
        onSuccess: () => {
            toast({ title: "Report submitted successfully", description: "Thank you for your feedback." });
            setReportText("");
            setSuggestedOption(undefined);
            setImageFile(null);
            setImagePreview(null);
            setIsOpen(false);
            onClose();
        },
        onError: (error) => {
            toast({ title: "Failed to submit report", description: error.message, variant: "destructive" });
        }
    });

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500">
                    <Flag className="h-5 w-5" />
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Report Mistake</DialogTitle>
                    <DialogDescription>Found an error in this question? Let us know.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="text-sm text-muted-foreground line-clamp-2 italic bg-muted p-2 rounded">
                        <MathText text={questionText} />
                    </div>
                    <div className="space-y-2">
                        <Label>Describe the issue</Label>
                        <Textarea placeholder="Explain what is wrong..." value={reportText} onChange={(e) => setReportText(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>Suggested Correct Option (Optional)</Label>
                        <Select value={suggestedOption} onValueChange={setSuggestedOption}>
                            <SelectTrigger><SelectValue placeholder="Select option" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="A">A</SelectItem>
                                <SelectItem value="B">B</SelectItem>
                                <SelectItem value="C">C</SelectItem>
                                <SelectItem value="D">D</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Attach Image (Optional)</Label>
                        {imagePreview ? (
                            <div className="relative w-fit">
                                <img src={imagePreview} alt="Preview" className="max-h-40 rounded-lg border" />
                                <button
                                    type="button"
                                    onClick={() => { setImageFile(null); setImagePreview(null); }}
                                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center shadow"
                                >
                                    ✕
                                </button>
                            </div>
                        ) : (
                            <Input type="file" accept="image/*" onChange={handleImageSelect} />
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={() => reportMutation.mutate()} disabled={!reportText.trim() || reportMutation.isPending || isUploadingImage}>
                        {isUploadingImage ? "Uploading image..." : reportMutation.isPending ? "Submitting..." : "Submit Report"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

const TakeExam = () => {
  useAntiCheat();
  const { examId } = useParams();
  const [searchParams] = useSearchParams();
  const retakeFromAttemptId = searchParams.get('retake_from');

  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, loading: authLoading } = useAuth();
  const { updateStreak, updateStats } = useStudyToolsOptional();
  const { data: enrollments, isLoading: enrollmentsLoading } = useEnrollments();

  // Guest (login-free) attempt support — only relevant when there's no
  // logged-in user AND the exam is visible on the Free Exam page.
  const [guestInfo, setGuestInfoState] = useState<GuestExamInfo | null>(() => getGuestInfo());
  const [showGuestDialog, setShowGuestDialog] = useState(false);

  // State
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());

  // Ensure the page always opens at the top instead of retaining the
  // previous page's scroll position (was causing the pre-exam review card
  // to appear scrolled/cut-off on entry).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("bookmarks").select("question_id").eq("profile_id", user.id);
      if (data) setBookmarkedIds(new Set(data.map((b: any) => b.question_id)));
    })();
  }, [user]);

  const toggleBookmark = async (questionId: string) => {
    if (!user) return;
    const isBookmarked = bookmarkedIds.has(questionId);
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (isBookmarked) next.delete(questionId); else next.add(questionId);
      return next;
    });
    if (isBookmarked) {
      await supabase.from("bookmarks").delete().eq("profile_id", user.id).eq("question_id", questionId);
    } else {
      await supabase.from("bookmarks").insert({ profile_id: user.id, question_id: questionId });
    }
  };
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const fixedHeaderRef = useRef<HTMLDivElement | null>(null);
  const [fixedHeaderHeight, setFixedHeaderHeight] = useState(96);
  const [isNavigatorOpen, setIsNavigatorOpen] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [agreedToInstructions, setAgreedToInstructions] = useState(false);
  const [selectedQuestionCount, setSelectedQuestionCount] = useState<number | null>(null);
  const [customTimeMinutes, setCustomTimeMinutes] = useState<number | null>(null);
  const [omrMode, setOmrMode] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showOmrPopup, setShowOmrPopup] = useState(false);
  const [omrUploadFile, setOmrUploadFile] = useState<File | null>(null);
  const [omrSubmitting, setOmrSubmitting] = useState(false);
  const [contentMode, setContentMode] = useState<'with' | 'without' | null>(null);
  const [selectedOptionalSubjects, setSelectedOptionalSubjects] = useState<string[]>([]);
  const [isQuickPracticeMode, setIsQuickPracticeMode] = useState(false);
  const [qpSoundVol, setQpSoundVol] = useState(() => parseFloat(localStorage.getItem("atlas-sound-vol") || "1"));
  const [qpRightPack, setQpRightPack] = useState(() => localStorage.getItem("qpp-right-pack") || "kahoot");
  const [qpWrongPack, setQpWrongPack] = useState(() => localStorage.getItem("qpp-wrong-pack") || "ayhay");
  const [qpVolMenuOpen, setQpVolMenuOpen] = useState(false);
  // Quick Practice runtime state
  const [qpCurrent, setQpCurrent] = useState(0);
  const [qpAnswers, setQpAnswers] = useState<Record<number, { selected: string | null; correct: boolean; skipped: boolean }>>({});
  const [qpTimeLeft, setQpTimeLeft] = useState(30);
  const [qpFinished, setQpFinished] = useState(false);
  const [qpShowDetailResult, setQpShowDetailResult] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [qpQuestions, setQpQuestions] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [shuffledQuestions, setShuffledQuestions] = useState<any[]>([]);
  const questionRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const autoSubmitTriggered = useRef(false);

  // Use a different key prefix for retakes so we don't conflict with main exam session storage
  const LOCAL_STORAGE_KEY_PREFIX = retakeFromAttemptId
      ? `exam_session_retake_${retakeFromAttemptId}_${user?.id}`
      : `exam_session_${examId}_${user?.id}`;

  const QUESTIONS_STORAGE_KEY = `${LOCAL_STORAGE_KEY_PREFIX}_questions`;

  useEffect(() => {
    if (!hasStarted) return;

    document.title = retakeFromAttemptId ? "Retake Mistakes – Atlas" : "Take Exam – Atlas";

    // Anti-Cheat: Tab Switch Detection
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
            setViolationCount(prev => prev + 1);
            toast({
                title: "⚠️ Warning: Tab Switch Detected",
                description: "Leaving the exam tab is recorded. Multiple violations may disqualify you.",
                variant: "destructive",
                duration: 5000,
            });
        }
    };

    // Block PrintScreen / OS screenshot shortcuts (best-effort; cannot fully prevent OS-level capture)
    const handleKeyDown = (e: KeyboardEvent) => {
        const key = e.key;
        const isScreenshotKey =
            key === "PrintScreen" ||
            (e.metaKey && e.shiftKey && ["3", "4", "5"].includes(key)); // macOS screenshot
        if (isScreenshotKey) {
            e.preventDefault();
            setViolationCount(prev => prev + 1);
            toast({
                title: "⚠️ Warning: Screenshot Attempt Blocked",
                description: "Screenshots are disabled during the exam. This attempt is recorded.",
                variant: "destructive",
                duration: 5000,
            });
        }
    };

    // Warning on refresh
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = "Are you sure you want to refresh? You might lose your progress if not saved.";
        return e.returnValue;
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [toast, retakeFromAttemptId, hasStarted]);

  const { data: exam, isLoading: examLoading } = useQuery({
    queryKey: ["exam", examId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("*")
        .eq("id", examId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Exams with "Allow Dashboard" (show_on_landing) on always use the plain
  // Live-Exam-style pre-exam screen — no Quick Practice toggle, no MCQ Count
  // selector — regardless of whether is_readymade is true or false.
  const showsReadymadeUI = !!(exam?.is_readymade && !exam?.external_exam_link && !exam?.show_on_landing);

  // Direct Quick Practice deep-link: if ?qp=1 is present (from post-exam header button),
  // skip the pre-exam mode-select screen entirely and jump straight into the same
  // quiz-style Quick Practice experience as the toggle-and-Start flow.
  const qpAutoStartTriggered = useRef(false);
  useEffect(() => {
    if (qpAutoStartTriggered.current) return;
    if (searchParams.get("qp") !== "1") return;
    if (!exam || !exam.is_readymade || hasStarted) return;
    qpAutoStartTriggered.current = true;
    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}_qp_mode`, "1");
    if (selectedQuestionCount) {
      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}_selected_count`, selectedQuestionCount.toString());
    }
    setIsQuickPracticeMode(true);
    setHasStarted(true);
  }, [exam, hasStarted, searchParams, selectedQuestionCount, LOCAL_STORAGE_KEY_PREFIX]);

  // Check for previous attempts if exam is LIVE
  const { data: existingAttempts, isLoading: attemptsLoading } = useQuery({
    queryKey: ["existing-attempts", examId, user?.id],
    queryFn: async () => {
        if (!user || !examId) return [];
        const { data, error } = await supabase
            .from("exam_attempts")
            .select("id, submitted_at")
            .eq("exam_id", examId)
            .eq("profile_id", user.id);
        if (error) throw error;
        return data;
    },
    enabled: !!user && !!examId && !retakeFromAttemptId, // Don't block if retaking mistakes
  });

  const { data: questions, isLoading: questionsLoading } = useQuery({
    queryKey: ["exam-questions", examId, retakeFromAttemptId],
    queryFn: async () => {
      let allQuestions;

      // 1. Check LocalStorage
      const cached = localStorage.getItem(QUESTIONS_STORAGE_KEY);
      if (cached) {
          try {
            const parsed = JSON.parse(cached);
            // Cache is stored as { examId, data } so we can verify it actually
            // belongs to the exam being opened right now before trusting it.
            if (parsed && parsed.examId === examId && Array.isArray(parsed.data) && parsed.data.length > 0) {
                allQuestions = parsed.data;
                console.log("Loaded questions from cache");
            } else {
                console.warn("Cached questions empty, mismatched exam, or invalid, refetching...");
                allQuestions = null;
            }
          } catch(e) {
            console.error("Cache parse error", e);
            allQuestions = null;
          }
      }

      // 2. Fetch if missing
      if (!allQuestions) {
          // Use light RPC: get_exam_questions_start
          // We pass p_user_id explicitly to ensure the SECURITY DEFINER function uses the correct context
          const { data, error } = await supabase.rpc("get_exam_questions_start", {
            p_exam_id: examId,
            p_user_id: user?.id
          });

          if (error) {
              console.error("RPC Error:", error);
              throw error;
          }

          // Fallback: If RPC returns empty but we know questions exist (admin view),
          // try direct fetch if RPC logic is too strict (e.g. published check)
          // Only do this if user has access (already checked in logic below, but RLS might block)
          if (!data || data.length === 0) {
               console.warn("RPC returned no questions. Attempting direct fallback...");
               const { data: directData, error: directError } = await supabase
                   .from("exam_questions")
                   .select("id, question_text, option_a, option_b, option_c, option_d, option_e, question_index, subject, is_segment_mandatory, topic, subtopic")
                   .eq("exam_id", examId)
                   .order("question_index", { ascending: true });

               if (!directError && directData && directData.length > 0) {
                   allQuestions = directData;
               } else {
                   allQuestions = [];
               }
          } else {
              allQuestions = data;
          }
      }

      // 3. If filtering for mistakes, fetch the previous attempt's wrong answers
      if (retakeFromAttemptId) {
          const { data: attemptData } = await supabase
              .from("exam_attempts")
              .select("answers")
              .eq("id", retakeFromAttemptId)
              .single();

          if (attemptData?.answers) {
              const { data: reviewData, error: reviewError } = await supabase.rpc("get_student_exam_review", {
                  p_attempt_id: retakeFromAttemptId
              });

              if (!reviewError && reviewData) {
                  // Filter for questions where user was WRONG
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const wrongQuestionIds = new Set(reviewData.filter((q: any) => {
                       const userAnswerObj = (attemptData.answers as any[]).find((a: any) => a.question_id === (q.question_id || q.id));
                       const selected = userAnswerObj?.selected_option;
                       return selected !== q.correct_option; // Wrong or Skipped
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  }).map((q: any) => q.question_id || q.id));

                  // Return only the questions from `allQuestions` that match `wrongQuestionIds`
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  allQuestions = allQuestions.filter((q: any) => wrongQuestionIds.has(q.id));
              }
          }
      }

      // Update cache with the final list (filtered or full)
      // Since the key is specific to the session (retake vs normal), caching the result is correct.
      try {
         localStorage.setItem(QUESTIONS_STORAGE_KEY, JSON.stringify({ examId, data: allQuestions }));
      } catch (e) {
         console.error("Cache save error", e);
      }

      return allQuestions;
    },
  });

  // Quick Practice Mode needs correct_option + explanation up-front (instant feedback),
  // so it uses a dedicated RPC restricted to readymade exams only.
  const { data: practiceQuestions, isLoading: practiceQuestionsLoading, error: practiceQuestionsError } = useQuery({
    queryKey: ["exam-questions-practice", examId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_exam_questions_practice", {
        p_exam_id: examId,
        p_user_id: user?.id,
      });
      if (error) throw error;
      return data;
    },
    enabled: isQuickPracticeMode && showsReadymadeUI && !!user?.id,
    retry: 1,
  });

  // Detect questions with images or Roman-numeral/multi-part (উদ্দীপক-style) content.
  // Only checks question_text + options — explanation is intentionally excluded.
  const isImageOrPatternQuestion = (q: any) => {
      if (!q) return false;
      const fields = [q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.option_e];
      const combined = fields.filter(Boolean).join(" ");
      if (/<img/i.test(combined)) return true;
      // Roman numeral list patterns: i. ii. iii. / (i) (ii) (iii) / i) ii) iii)
      if (/\(?\b(i|ii|iii|iv|v|vi)\)?[.)]/i.test(combined)) return true;
      return false;
  };

  const hasImageOrPatternQuestions = !!(questions && questions.some(isImageOrPatternQuestion));

  // Effective pool after applying the content-mode filter (only applies when relevant questions exist)
  const isSpecialExam = exam?.exam_type === 'special';

  // Special Exam: distinct mandatory/optional subject segments, derived from the loaded question pool.
  const mandatorySubjects = isSpecialExam
      ? Array.from(new Set((questions || []).filter((q: any) => q.subject && (q.is_segment_mandatory ?? true)).map((q: any) => q.subject)))
      : [];
  const optionalSubjects = isSpecialExam
      ? Array.from(new Set((questions || []).filter((q: any) => q.subject && q.is_segment_mandatory === false).map((q: any) => q.subject)))
      : [];

  // Readymade exam topic filter: ?topic=<name> restricts the pool to only
  // questions tagged with that topic (falls back to full exam when absent).
  // ?subtopic=<name> further restricts within that topic, when the topic
  // picker's dropdown was used instead of "সম্পূর্ণ <topic>".
  const selectedTopic = searchParams.get("topic");
  const selectedSubtopic = searchParams.get("subtopic");

  const effectiveQuestions = (() => {
      if (!questions) return questions;
      let pool = questions;
      if (hasImageOrPatternQuestions && contentMode === 'without') {
          pool = pool.filter((q: any) => !isImageOrPatternQuestion(q));
      }
      if (isSpecialExam && optionalSubjects.length > 0) {
          pool = pool.filter((q: any) =>
              !q.subject || (q.is_segment_mandatory ?? true) || selectedOptionalSubjects.includes(q.subject)
          );
      }
      if (selectedTopic) {
          pool = pool.filter((q: any) => q.topic === selectedTopic);
      }
      if (selectedSubtopic) {
          pool = pool.filter((q: any) => q.subtopic === selectedSubtopic);
      }
      return pool;
  })();

  // Reset the chosen MCQ count whenever the content-mode (with/without image & pattern questions) changes,
  // since the max available question count changes with it.
  useEffect(() => {
      setSelectedQuestionCount(null);
  }, [contentMode]);

  // Quick Practice: prepare (shuffle + apply count) question set once exam starts
  useEffect(() => {
    if (!isQuickPracticeMode || !hasStarted || !practiceQuestions || practiceQuestions.length === 0) return;
    if (qpQuestions.length > 0) return;
    let pool = practiceQuestions;
    if (selectedTopic) {
        pool = pool.filter((q: any) => q.topic === selectedTopic);
    }
    if (selectedSubtopic) {
        pool = pool.filter((q: any) => q.subtopic === selectedSubtopic);
    }
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const finalSet = selectedQuestionCount && selectedQuestionCount < shuffled.length
      ? shuffled.slice(0, selectedQuestionCount)
      : shuffled;
    setQpQuestions(finalSet);
    setQpTimeLeft(30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQuickPracticeMode, hasStarted, practiceQuestions, selectedTopic, selectedSubtopic]);

  // Quick Practice: per-question 30s countdown. If time runs out without an answer,
  // reveal the correct answer and mark the question as skipped (doesn't count as wrong).
  useEffect(() => {
    if (!isQuickPracticeMode || !hasStarted || qpFinished) return;
    if (qpQuestions.length === 0) return;
    if (qpAnswers[qpCurrent]) return; // already answered/skipped
    if (qpTimeLeft <= 0) {
      setQpAnswers((prev) => ({ ...prev, [qpCurrent]: { selected: null, correct: false, skipped: true } }));
      return;
    }
    const t = setTimeout(() => setQpTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [isQuickPracticeMode, hasStarted, qpFinished, qpQuestions.length, qpCurrent, qpTimeLeft, qpAnswers]);

  const qpSelectOption = (optionKey: string) => {
    if (qpAnswers[qpCurrent]) return;
    const q = qpQuestions[qpCurrent];
    const correct = optionKey.toUpperCase() === String(q.correct_option).toUpperCase();
    setQpAnswers((prev) => ({ ...prev, [qpCurrent]: { selected: optionKey, correct, skipped: false } }));
    playSound(correct, qpSoundVol, qpRightPack, qpWrongPack);
  };

  const qpChangeVol = (v: number) => {
    setQpSoundVol(v);
    try { localStorage.setItem("atlas-sound-vol", String(v)); } catch { /* ignore */ }
  };

  const qpChooseSound = (which: "right" | "wrong", key: string) => {
    if (which === "right") {
      setQpRightPack(key);
      try { localStorage.setItem("qpp-right-pack", key); } catch { /* ignore */ }
    } else {
      setQpWrongPack(key);
      try { localStorage.setItem("qpp-wrong-pack", key); } catch { /* ignore */ }
    }
  };

  const qpCleanupStorage = () => {
      try {
          localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}_qp_mode`);
          localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}_selected_count`);
      } catch { /* ignore */ }
  };

  // Full cleanup for the timed-exam (non-Quick-Practice) session — same keys
  // cleared on successful submit. Used when the student explicitly confirms
  // "yes, exit" from the back-navigation dialog, so a later "Start Exam"
  // begins fresh instead of silently resuming the abandoned attempt.
  const cleanupExamStorage = () => {
      try {
          localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}_answers`);
          localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}_start_time`);
          localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}_violations`);
          localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}_selected_count`);
          localStorage.removeItem(QUESTIONS_STORAGE_KEY);
      } catch { /* ignore */ }
  };

  const qpGoNext = () => {
    if (qpCurrent >= qpQuestions.length - 1) {
      setQpFinished(true);
      qpCleanupStorage();
      return;
    }
    setQpCurrent((c) => c + 1);
    setQpTimeLeft(30);
  };

  // Send the user back to the pre-exam screen (mode/count select) instead of
  // silently restarting — matches how a fresh attempt should begin.
  const qpRestart = () => {
    setQpFinished(false);
    setQpAnswers({});
    setQpCurrent(0);
    setQpTimeLeft(30);
    setQpQuestions([]);
    setHasStarted(false);
  };

  // Shuffle Questions Effect
  useEffect(() => {
    // For readymade exams (non-external), only shuffle/lock the question set once the exam has
    // actually started (Start Exam clicked). This prevents the count input's keystrokes
    // (e.g. typing "10" fires an intermediate "1") from prematurely locking in a wrong count.
    if (exam?.is_readymade && !exam.external_exam_link && (!hasStarted || isQuickPracticeMode)) {
        return;
    }

    if (hasStarted && exam && effectiveQuestions && effectiveQuestions.length > 0 && shuffledQuestions.length === 0) {
        // If the exam is an OMR exam, DO NOT SHUFFLE so the question numbers align with the OMR sheet
        if (exam.is_omr_enabled || exam.is_omr) {
            setShuffledQuestions([...effectiveQuestions]);
            return;
        }

        // Special Exam: keep questions grouped by subject/segment (do not mix subjects).
        // Shuffle within each subject group, but preserve the subject block order
        // (mandatory subjects first in their original order, then selected optional subjects).
        if (isSpecialExam) {
            const orderedSubjects = [...mandatorySubjects, ...optionalSubjects.filter((s: string) => selectedOptionalSubjects.includes(s))];
            const bySubject = new Map<string, any[]>();
            const noSubject: any[] = [];
            effectiveQuestions.forEach((q: any) => {
                if (q.subject && orderedSubjects.includes(q.subject)) {
                    if (!bySubject.has(q.subject)) bySubject.set(q.subject, []);
                    bySubject.get(q.subject)!.push(q);
                } else {
                    noSubject.push(q);
                }
            });
            const shuffleGroup = (arr: any[]) => {
                const a = [...arr];
                for (let i = a.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [a[i], a[j]] = [a[j], a[i]];
                }
                return a;
            };
            const grouped: any[] = [];
            orderedSubjects.forEach((s: string) => {
                if (bySubject.has(s)) grouped.push(...shuffleGroup(bySubject.get(s)!));
            });
            grouped.push(...shuffleGroup(noSubject));
            setShuffledQuestions(grouped);
            return;
        }

        // Simple Fisher-Yates shuffle
        const shuffled = [...effectiveQuestions];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        // For readymade exams, limit to the student-selected question count
        if (exam.is_readymade && selectedQuestionCount && selectedQuestionCount < shuffled.length) {
            setShuffledQuestions(shuffled.slice(0, selectedQuestionCount));
        } else {
            setShuffledQuestions(shuffled);
        }
    }
  }, [effectiveQuestions, shuffledQuestions.length, exam, selectedQuestionCount, hasStarted, isQuickPracticeMode, isSpecialExam, mandatorySubjects, optionalSubjects, selectedOptionalSubjects]);

  // Load persistence logic - ONLY ON MOUNT.
  // Instead of silently auto-resuming, show a confirmation popup so the user
  // explicitly chooses Continue (restore saved answers) or Restart (fresh attempt).
  const [resumePrompt, setResumePrompt] = useState<null | {
      savedAnswers: string | null;
      savedViolations: string | null;
      savedStartTime: string | null;
      savedCount: string | null;
      savedQpMode: string | null;
      isReadymadeCountExam: boolean;
  }>(null);

  useEffect(() => {
      if (!examId || !exam) return;
      if (!user && !guestInfo) return; // guest info not yet collected — nothing to restore

      const savedAnswers = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}_answers`);
      const savedViolations = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}_violations`);
      const savedStartTime = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}_start_time`);
      const savedCountKey = `${LOCAL_STORAGE_KEY_PREFIX}_selected_count`;
      const savedCount = localStorage.getItem(savedCountKey);
      const savedQpMode = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}_qp_mode`);
      const isReadymadeCountExam = showsReadymadeUI;

      // Nothing saved for this exam — fresh start, no popup needed.
      if (!savedStartTime && savedQpMode !== "1") return;

      setResumePrompt({ savedAnswers, savedViolations, savedStartTime, savedCount, savedQpMode, isReadymadeCountExam });
  }, [user, guestInfo, examId, LOCAL_STORAGE_KEY_PREFIX, exam, QUESTIONS_STORAGE_KEY]);

  const clearSavedExamSession = () => {
      localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}_qp_mode`);
      localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}_selected_count`);
      localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}_answers`);
      localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}_start_time`);
      localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}_violations`);
      localStorage.removeItem(QUESTIONS_STORAGE_KEY);
  };

  const handleResumeContinue = () => {
      if (!resumePrompt) return;
      const { savedAnswers, savedViolations, savedStartTime, savedCount, savedQpMode, isReadymadeCountExam } = resumePrompt;

      if (savedQpMode === "1" && isReadymadeCountExam) {
          setIsQuickPracticeMode(true);
          if (savedCount && !isNaN(parseInt(savedCount, 10))) {
              setSelectedQuestionCount(parseInt(savedCount, 10));
          }
          setHasStarted(true);
          setResumePrompt(null);
          return;
      }

      if (savedStartTime) {
          if (isReadymadeCountExam && savedCount && !isNaN(parseInt(savedCount, 10))) {
              setSelectedQuestionCount(parseInt(savedCount, 10));
          }
          setHasStarted(true);
      }
      if (savedAnswers) {
          try {
              setAnswers(JSON.parse(savedAnswers));
          } catch (e) {
              console.error("Failed to parse saved answers", e);
          }
      }
      if (savedViolations) {
          setViolationCount(parseInt(savedViolations));
      }
      setResumePrompt(null);
  };

  const handleResumeRestart = () => {
      clearSavedExamSession();
      setResumePrompt(null);
      // hasStarted stays false — the exam's normal "start" screen/flow takes over,
      // producing a fully fresh attempt with no restored answers/timer.
  };

  // Save state on changes
  useEffect(() => {
      if (!examId || (!user && !guestInfo)) return;
      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}_answers`, JSON.stringify(answers));
      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}_violations`, violationCount.toString());
  }, [answers, violationCount, user, guestInfo, examId, LOCAL_STORAGE_KEY_PREFIX]);

  // Timer logic with persistence
  useEffect(() => {
    if (!exam?.duration_minutes || (!user && !guestInfo) || !hasStarted || isQuickPracticeMode) return;

    const isExpiredPractice = exam.exam_type === 'live' && exam.time_window_end && new Date() > new Date(exam.time_window_end);
    const startTimeKey = `${LOCAL_STORAGE_KEY_PREFIX}_start_time`;

    let startTime = localStorage.getItem(startTimeKey);

    if (!startTime) {
        startTime = Date.now().toString();
        localStorage.setItem(startTimeKey, startTime);
    }

    const now = Date.now();
    // For readymade exams where the student picked a specific MCQ count,
    // exam duration = count × 30 seconds per MCQ, overriding the exam's fixed duration.
    const isReadymadeCountMode = showsReadymadeUI && !!selectedQuestionCount;
    const durationSeconds = customTimeMinutes
        ? customTimeMinutes * 60
        : isReadymadeCountMode
        ? selectedQuestionCount * 30
        : exam.duration_minutes * 60;
    const elapsedSeconds = Math.floor((now - parseInt(startTime)) / 1000);
    let remaining = Math.max(0, durationSeconds - elapsedSeconds);

    // For active live exams (not expired ones taken for practice), respect the time window.
    if (exam.exam_type === 'live' && !isExpiredPractice && exam.time_window_end && !retakeFromAttemptId) {
        const hardEnd = new Date(exam.time_window_end).getTime();
        const secondsUntilEnd = Math.floor((hardEnd - now) / 1000);
        if (!isNaN(secondsUntilEnd)) {
             remaining = Math.min(remaining, Math.max(0, secondsUntilEnd));
        }
    }

    setTimeLeft(remaining);

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
          if (prev === null) return null;
          if (prev <= 1) {
              clearInterval(timer);
              return 0;
          }
          return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [exam, user, guestInfo, LOCAL_STORAGE_KEY_PREFIX, retakeFromAttemptId, hasStarted, selectedQuestionCount, isQuickPracticeMode, customTimeMinutes]);

  // Auto-submit
  const submitExamMutation = useMutation({
    mutationFn: async () => {
        const isGuestAttempt = !user && !!guestInfo;
        if ((!user && !isGuestAttempt) || !exam) throw new Error("Invalid state");
        // Explicitly check profile presence before submission (logged-in users only —
        // guests have no profile row).
        if (user && (!profile || !profile.id)) throw new Error("User profile not found. Please contact support.");

        // Build the answers list from ALL questions shown in this attempt (shuffledQuestions),
        // not just the ones answered, so skipped questions are recorded too.
        // This matters for readymade exams where the student attempts a subset of the bank —
        // the review page needs to know exactly which question_ids were part of this attempt.
        const attemptedQuestions = shuffledQuestions.length > 0 ? shuffledQuestions : (questions || []);
        const answersList = attemptedQuestions.map((q: any) => ({
            question_id: q.id,
            selected_option: answers[q.id] ?? null
        }));

        const startTime = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}_start_time`);
        const timeTaken = startTime ? Math.floor((Date.now() - parseInt(startTime)) / 1000) : 0;

        const { data: attemptId, error } = await supabase.rpc("submit_exam_attempt", {
            p_exam_id: exam.id,
            p_answers: answersList,
            p_violation_count: violationCount,
            p_time_taken_seconds: timeTaken,
            ...(!user && guestInfo ? {
                p_guest_name: guestInfo.name,
                p_guest_hsc_batch: guestInfo.hscBatch,
                p_guest_college_name: guestInfo.collegeName,
                p_guest_phone: guestInfo.phone,
            } : {}),
        });

        if (error) throw error;

        // Check for Streak (Duration >= 15 mins)
        if (exam.duration_minutes >= 15) {
            updateStreak();
        }

        updateStats("total_exam_time", exam.duration_minutes);

        return attemptId;
    },
    onSuccess: (attemptId) => {
      // Clear storage
      localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}_answers`);
      localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}_start_time`);
      localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}_violations`);
      localStorage.removeItem(`${LOCAL_STORAGE_KEY_PREFIX}_selected_count`);
      localStorage.removeItem(QUESTIONS_STORAGE_KEY); // Clear questions cache

      toast({ title: "Exam submitted successfully!" });
      navigate(user ? `/dashboard/exam-review/${attemptId}` : `/exam-review/${attemptId}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Submission Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Intercept browser/mobile back navigation during an active (in-progress)
  // exam and show our own confirmation popup instead of silently leaving —
  // avoids losing an unsaved attempt. Not shown once the exam is finished
  // (result screens use normal back navigation) or before the exam has
  // actually started.
  useEffect(() => {
    const examIsActive = hasStarted && !isQuickPracticeMode ? !submitExamMutation.isSuccess : false;
    const qpIsActive = hasStarted && isQuickPracticeMode ? !qpFinished : false;
    if (!examIsActive && !qpIsActive) return;

    // Push one extra history entry so the first back-press is intercepted
    // (it consumes our pushed entry) instead of immediately leaving the page.
    window.history.pushState(null, "", window.location.href);

    const handlePopState = () => {
      // Re-push immediately so the URL doesn't actually change while the
      // confirmation is pending — the popup's own buttons drive navigation.
      window.history.pushState(null, "", window.location.href);
      setShowExitConfirm(true);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStarted, isQuickPracticeMode, submitExamMutation.isSuccess, qpFinished]);

  useEffect(() => {
      if (timeLeft === 0 && !autoSubmitTriggered.current && !submitExamMutation.isPending) {
          autoSubmitTriggered.current = true;
          submitExamMutation.mutate();
      }
  }, [timeLeft, submitExamMutation]);

  // Measure the fixed exam-progress header's real rendered height (it varies with
  // retake/violation badges) so the spacer below it never overlaps or gaps.
  useEffect(() => {
      const measure = () => {
          if (fixedHeaderRef.current) {
              setFixedHeaderHeight(fixedHeaderRef.current.offsetHeight);
          }
      };
      measure();
      window.addEventListener("resize", measure);
      const interval = setInterval(measure, 500);
      return () => {
          window.removeEventListener("resize", measure);
          clearInterval(interval);
      };
  }, [violationCount]);


  const scrollToQuestion = (index: number) => {
    const questionId = shuffledQuestions?.[index]?.id;
    if (questionId && questionRefs.current[questionId]) {
      questionRefs.current[questionId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      setIsNavigatorOpen(false);
    }
  };

  // After answering a question, auto-scroll to the next unanswered question.
  // Skips already-answered ones; if none remain after current, wraps around to the
  // earliest unanswered question in the whole exam.
  const scrollToNextUnanswered = (currentQuestionId: string, latestAnswers: Record<string, string>) => {
    const list = shuffledQuestions;
    if (!list || list.length === 0) return;
    const currentIndex = list.findIndex((q: any) => q.id === currentQuestionId);
    if (currentIndex === -1) return;

    let targetId: string | null = null;

    // Search forward from the next question
    for (let i = currentIndex + 1; i < list.length; i++) {
      if (!latestAnswers[list[i].id]) {
        targetId = list[i].id;
        break;
      }
    }
    // Wrap around: search from the start up to the current question
    if (!targetId) {
      for (let i = 0; i < currentIndex; i++) {
        if (!latestAnswers[list[i].id]) {
          targetId = list[i].id;
          break;
        }
      }
    }

    if (!targetId) return; // all answered

    const finalTargetId = targetId;
    // Delay lets the answer actually register and the layout reflow settle
    // before scrolling — too short and it can fire before the click/state
    // update finishes, causing it to jump early.
    setTimeout(() => {
      requestAnimationFrame(() => {
        questionRefs.current[finalTargetId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }, 250);
  };

  // 0. Auth Loading / Profile Check
  if (authLoading || (!profile && user)) {
     return <div className="p-8 text-center flex items-center justify-center min-h-[50vh]">
          <div className="space-y-4">
              <Loader2 className="animate-spin h-8 w-8 text-primary mx-auto" />
              <p className="text-muted-foreground">Verifying user profile...</p>
          </div>
     </div>;
  }

  if (examLoading || questionsLoading || attemptsLoading || (user && enrollmentsLoading)) {
    return <div className="p-8 text-center flex items-center justify-center min-h-[50vh]">
        <div className="space-y-4">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
            <p className="text-muted-foreground">Loading exam...</p>
        </div>
    </div>;
  }

  // Access Control
  const hasAccess = (() => {
      if (!exam) return false;

      // Explicit per-exam guest-access toggle overrides everything else.
      // @ts-ignore
      if (exam.allow_guest === true) return true;

      // If course_id is null, it's potentially public, BUT we must check if hidden from free view
      if (!exam.course_id) {
          // @ts-ignore
          if (exam.is_visible_on_free === false) {
             // Not public. Check if user has access via Archive/Shared
             // Fall through to enrollment checks
          } else {
             return true; // Strictly public/free
          }
      }

      if (!user) return false; // guests only ever get access via is_visible_on_free/allow_guest above
      if (!enrollments) return false;

      const enrolledIds = enrollments.map((e: any) => e.course_id);
      // Course-level bulk grant (Admin → Course → Readymade Access Manager →
      // "Full Access" toggle) — separate from per-exam readymade_course_ids
      // below. A student enrolled in a course with this flag on should reach
      // EVERY readymade exam, not just ones individually listed on the exam.
      const fullAccessCourseIds = enrollments
        .filter((e: any) => e.course?.readymade_full_access)
        .map((e: any) => e.course_id);

      // Check Primary Enrollment
      if (exam.course_id && enrolledIds.includes(exam.course_id)) return true;

      // Check Shared Courses
      // @ts-ignore
      if (exam.shared_course_ids && Array.isArray(exam.shared_course_ids)) {
          // @ts-ignore
          if (exam.shared_course_ids.some((id: string) => enrolledIds.includes(id))) return true;
      }

      // Check Archive Courses
      // @ts-ignore
      if (exam.archive_course_ids && Array.isArray(exam.archive_course_ids)) {
          // @ts-ignore
          if (exam.archive_course_ids.some((id: string) => enrolledIds.includes(id))) return true;
      }

      // Check Readymade Linked Courses
      // @ts-ignore
      if (exam.is_readymade) {
          if (fullAccessCourseIds.length > 0) return true;
          // @ts-ignore
          if (exam.readymade_course_ids && Array.isArray(exam.readymade_course_ids)) {
              // @ts-ignore
              if (exam.readymade_course_ids.some((id: string) => enrolledIds.includes(id))) return true;
          }
      }

      return false;
  })();

  if (!hasAccess) {
      return (
          <div className="p-8 text-center flex flex-col items-center justify-center min-h-[60vh] gap-4">
              <AlertTriangle className="h-12 w-12 text-destructive" />
              <h2 className="text-xl font-bold">Access Denied</h2>
              <p className="text-muted-foreground">You are not enrolled in the course required for this exam.</p>
              <Button onClick={() => navigate("/courses")}>View Courses</Button>
          </div>
      );
  }

  // Live Exam Check
  const isLive = exam && exam.exam_type === 'live';
  const now = new Date();
  const start = exam?.time_window_start ? new Date(exam.time_window_start) : null;
  const end = exam?.time_window_end ? new Date(exam.time_window_end) : null;
  const isExpiredLive = isLive && end && now > end;

  // 1. Not Started Yet
  if (isLive && start && now < start && !retakeFromAttemptId) {
      return (
          <div className="p-8 text-center flex flex-col items-center justify-center min-h-[60vh] max-w-lg mx-auto">
              <div className="bg-primary/10 p-4 rounded-full mb-4">
                  <Clock className="h-10 w-10 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Exam Has Not Started Yet</h2>
              <p className="text-muted-foreground mb-6">This exam is scheduled to start on <span className="font-semibold text-foreground">{start.toLocaleString()}</span>.</p>
              <Button size="lg" onClick={() => navigate(-1)}>
                  <ChevronLeft className="h-4 w-4 mr-2" /> Go Back
              </Button>
          </div>
      );
  }

  // 1.5 Expired Only-Live
  if (isExpiredLive && exam.is_only_live) {
      return (
          <div className="p-8 text-center flex flex-col items-center justify-center min-h-[60vh] max-w-lg mx-auto">
              <div className="bg-red-100 dark:bg-red-900/20 p-4 rounded-full mb-4">
                  <Lock className="h-10 w-10 text-red-600 dark:text-red-500" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Exam Has Ended</h2>
              <p className="text-muted-foreground mb-6">This was a live-only exam and the time window has closed. It is no longer available for practice.</p>
              <Button size="lg" onClick={() => navigate(-1)}>
                  <ChevronLeft className="h-4 w-4 mr-2" /> Go Back
              </Button>
          </div>
      );
  }

  // Handle External Exam Redirects *after* ensuring the exam has started


  // 2. Check previous attempts logic (only if NOT retaking mistakes)
  if (!isExpiredLive && existingAttempts && existingAttempts.length > 0 && !retakeFromAttemptId) {
      if (isLive) {
            return (
              <div className="p-8 text-center flex flex-col items-center justify-center min-h-[60vh] max-w-lg mx-auto">
                  <div className="bg-green-100 dark:bg-green-900/20 p-4 rounded-full mb-4">
                      <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-500" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">You have already taken this exam</h2>
                  <p className="text-muted-foreground mb-6">
                      You can view your results or check the leaderboard. Practice mode will be available after the exam period ends.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
                      <Button size="lg" onClick={() => navigate(`/dashboard/exam-review/${existingAttempts[0].id}`)}>View Result</Button>
                      <Button size="lg" variant="outline" onClick={() => navigate(`/dashboard/leaderboard/${exam.id}`)}>Leaderboard</Button>
                  </div>
              </div>
          );
      }
  }

  if (!exam.external_exam_link && (!questions || questions.length === 0)) {
    return (
        <div className="p-8 text-center flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <div className="bg-muted p-4 rounded-full">
                <AlertTriangle className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
                <p className="text-xl font-semibold">No questions loaded</p>
                <p className="text-muted-foreground text-sm max-w-md mx-auto mt-2">
                    We verified your access, but could not load the exam content. This might be due to a server error or the questions haven't been published yet.
                </p>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
                <Button onClick={() => navigate(-1)}>Go Back</Button>
            </div>
        </div>
    );
  }

  if (!hasStarted) {
      return (
          <div className="h-[100dvh] bg-background flex flex-col items-start justify-start px-1 py-1 sm:px-1.5 overflow-y-auto">
          <div className="w-full max-w-2xl mx-auto space-y-1.5 flex flex-col pt-2">
              {/* Card 1: Header/Info */}
              <Card className="w-full rounded-xl shadow-sm border shrink-0">
                  <div className="p-2 md:p-3 space-y-1">
                      <div className="text-center space-y-0.5">
                          <h1 className="text-xl md:text-3xl font-bold tracking-tight leading-tight">
                              {exam.title}
                              {selectedTopic ? ` (${selectedSubtopic || selectedTopic})` : ""}
                          </h1>
                          <p className="text-muted-foreground text-[10px]">Please review the details below before starting.</p>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                          <div className="flex flex-col items-center justify-center p-1.5 bg-secondary/30 rounded-lg">
                              <span className="text-base font-bold text-primary">
                                  {showsReadymadeUI && (selectedQuestionCount || selectedTopic)
                                      ? Math.ceil(((selectedQuestionCount || effectiveQuestions?.length || 0) * 30) / 60)
                                      : exam.duration_minutes}
                              </span>
                              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Minutes</span>
                          </div>
                          <div className="flex flex-col items-center justify-center p-1.5 bg-secondary/30 rounded-lg">
                              <span className="text-base font-bold text-primary">{exam.external_exam_link ? 'N/A' : effectiveQuestions?.length}</span>
                              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Questions</span>
                          </div>
                          <div className="flex flex-col items-center justify-center p-1.5 bg-secondary/30 rounded-lg">
                              <span className="text-base font-bold text-red-500">{exam.negative_mark_per_question}</span>
                              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Negative</span>
                          </div>
                      </div>
                  </div>
              </Card>

              {/* Card: Quick Practice Mode toggle */}
              {showsReadymadeUI && (
                  <Card className="w-full rounded-xl shadow-sm border overflow-hidden shrink-0">
                      <div className="px-2.5 py-1.5 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                              <Zap className="h-4 w-4 text-violet-500 shrink-0" />
                              <div className="min-w-0">
                                  <p className="text-[11px] font-bold truncate">Quick Practice Mode</p>
                                  <p className="text-[9px] text-muted-foreground leading-snug line-clamp-1">
                                      প্রতি প্রশ্নে ৩০ সেকেন্ড, তাৎক্ষণিক ফলাফল।
                                  </p>
                              </div>
                          </div>
                          <button
                              type="button"
                              onClick={() => setIsQuickPracticeMode((v) => !v)}
                              className={cn(
                                  "shrink-0 h-6 w-[46px] rounded-full relative transition-colors shadow-inner",
                                  isQuickPracticeMode ? "bg-violet-500" : "bg-muted border border-border"
                              )}
                              aria-label="Toggle Quick Practice Mode"
                          >
                              <span
                                  className={cn(
                                      "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                                      isQuickPracticeMode ? "translate-x-[20px]" : "translate-x-0"
                                  )}
                              />
                          </button>
                      </div>
                  </Card>
              )}

              {/* Card: Special Exam Subject Selection */}
              {isSpecialExam && (mandatorySubjects.length > 0 || optionalSubjects.length > 0) && (
                  <Card className="w-full rounded-xl shadow-sm border overflow-hidden p-3 space-y-3">
                      {mandatorySubjects.length > 0 && (
                          <div>
                              <p className="text-[10px] font-bold text-muted-foreground mb-1.5">Mandatory Subjects</p>
                              <div className="grid grid-cols-3 gap-2">
                                  {mandatorySubjects.map((s: string) => {
                                      const cnt = (questions || []).filter((q: any) => q.subject === s).length;
                                      return (
                                          <div
                                              key={s}
                                              className="relative rounded-xl border border-primary/30 bg-primary/10 px-2 py-2.5 flex flex-col items-center text-center gap-0.5"
                                          >
                                              <span className="absolute -top-1.5 -right-1.5 text-[9px] font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center bg-primary text-primary-foreground shadow-sm">{cnt}</span>
                                              <span className="text-xs font-semibold text-primary truncate w-full">{s}</span>
                                              <span className="text-[9px] text-primary/70">Mandatory</span>
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                      )}
                      {optionalSubjects.length > 0 && (
                          <div>
                              <p className="text-[10px] font-bold text-muted-foreground mb-1.5">যেসব বিষয় থেকে MCQ চান বেছে নিন</p>
                              <div className="grid grid-cols-3 gap-2">
                                  {optionalSubjects.map((s: string) => {
                                      const selected = selectedOptionalSubjects.includes(s);
                                      const cnt = (questions || []).filter((q: any) => q.subject === s).length;
                                      return (
                                          <button
                                              key={s}
                                              type="button"
                                              onClick={() => setSelectedOptionalSubjects(prev => selected ? prev.filter(x => x !== s) : [...prev, s])}
                                              className={cn(
                                                  "relative rounded-xl border-2 px-2 py-2.5 flex flex-col items-center text-center gap-0.5 transition-colors",
                                                  selected ? "bg-violet-500/10 border-violet-500 text-violet-700 dark:text-violet-300" : "border-border text-muted-foreground hover:border-violet-300"
                                              )}
                                          >
                                              <span className={cn(
                                                  "absolute -top-1.5 -right-1.5 text-[9px] font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center shadow-sm",
                                                  selected ? "bg-violet-500 text-white" : "bg-muted text-muted-foreground border border-border"
                                              )}>{cnt}</span>
                                              <span className="text-xs font-semibold truncate w-full">{s}</span>
                                              <span className="text-[9px]">{selected ? "Selected" : "Optional"}</span>
                                          </button>
                                      );
                                  })}
                              </div>
                          </div>
                      )}
                  </Card>
              )}

              {/* Card: Readymade MCQ Count Selector */}
              {showsReadymadeUI && (
                  <Card className="w-full rounded-xl shadow-sm border overflow-hidden">
                      {hasImageOrPatternQuestions && (
                          <div className="px-3 pt-2 pb-1 border-b space-y-1">
                              <p className="text-[10px] font-bold text-foreground">
                                  চিত্র/উদ্দীপকযুক্ত প্রশ্নের ধরন বেছে নিন:
                              </p>
                              <div className="grid grid-cols-2 gap-1.5">
                                  <button
                                      type="button"
                                      onClick={() => setContentMode('with')}
                                      className={cn(
                                          "text-xs font-semibold rounded-lg border-2 px-3 py-2.5 leading-tight transition-colors",
                                          contentMode === 'with'
                                              ? "border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                                              : "border-border text-muted-foreground hover:border-violet-300"
                                      )}
                                  >
                                      চিত্র/উদ্দীপকসহ(HSC/Varsity)
                                  </button>
                                  <button
                                      type="button"
                                      onClick={() => setContentMode('without')}
                                      className={cn(
                                          "text-xs font-semibold rounded-lg border-2 px-3 py-2.5 leading-tight transition-colors",
                                          contentMode === 'without'
                                              ? "border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                                              : "border-border text-muted-foreground hover:border-violet-300"
                                      )}
                                  >
                                      চিত্র/উদ্দীপকছাড়া(Medical Standard)
                                  </button>
                              </div>
                          </div>
                      )}
                      <div className="px-3 pt-1.5">
                          <p className="text-[10px] font-medium text-muted-foreground line-clamp-1">
                              নির্দিষ্ট সংখ্যক প্রশ্ন দিতে চাইলে লিখুন, খালি রাখলে সব MCQ থাকবে।
                          </p>
                      </div>
                      <div className="px-3 py-1.5 flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0 mb-1">
                              <Zap className="h-4 w-4 text-violet-500 shrink-0" />
                              <span className="text-xs font-semibold truncate">MCQs to attempt</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                  type="button"
                                  onClick={() => {
                                      const max = effectiveQuestions?.length || 1;
                                      setSelectedQuestionCount((prev) => {
                                          const cur = prev ?? max;
                                          return Math.min(Math.max(cur - 1, 1), max);
                                      });
                                  }}
                                  className="h-6 w-6 shrink-0 rounded-full border-2 border-violet-300 dark:border-violet-700 flex items-center justify-center text-violet-600 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950 active:scale-90 transition-all"
                                  aria-label="Decrease count"
                              >
                                  <Minus className="h-3 w-3" />
                              </button>

                              <div className="relative rounded-lg border-2 border-violet-400 dark:border-violet-600 bg-white dark:bg-black">
                                  <div className="h-8 w-12 rounded-[8px] flex items-center justify-center relative">
                                      {selectedQuestionCount === null && (
                                          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-black dark:text-white pointer-events-none select-none animate-pulse">|</span>
                                      )}
                                      <input
                                          type="number"
                                          min={1}
                                          max={effectiveQuestions?.length || 1}
                                          value={selectedQuestionCount ?? ""}
                                          onCopy={(e) => e.preventDefault()}
                                          onCut={(e) => e.preventDefault()}
                                          onPaste={(e) => e.preventDefault()}
                                          onChange={(e) => {
                                              const raw = e.target.value;
                                              const max = effectiveQuestions?.length || 1;
                                              if (raw === "") {
                                                  setSelectedQuestionCount(null);
                                                  return;
                                              }
                                              const val = parseInt(raw, 10);
                                              if (Number.isNaN(val)) {
                                                  setSelectedQuestionCount(null);
                                              } else {
                                                  setSelectedQuestionCount(Math.min(Math.max(val, 1), max));
                                              }
                                          }}
                                          className="w-full h-full bg-transparent text-center text-sm font-bold text-foreground focus:outline-none cursor-text [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                      />
                                  </div>
                                  {selectedQuestionCount !== null && (
                                      <button
                                          type="button"
                                          onClick={() => setSelectedQuestionCount(null)}
                                          aria-label="Clear, take full exam"
                                          className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-violet-500 text-white flex items-center justify-center text-[9px] leading-none hover:bg-violet-600 active:scale-90 transition-all"
                                      >
                                          ×
                                      </button>
                                  )}
                              </div>

                              <button
                                  type="button"
                                  onClick={() => {
                                      const max = effectiveQuestions?.length || 1;
                                      setSelectedQuestionCount((prev) => {
                                          const cur = prev ?? 0;
                                          return Math.min(Math.max(cur + 1, 1), max);
                                      });
                                  }}
                                  className="h-6 w-6 shrink-0 rounded-full border-2 border-violet-300 dark:border-violet-700 flex items-center justify-center text-violet-600 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950 active:scale-90 transition-all"
                                  aria-label="Increase count"
                              >
                                  <Plus className="h-3 w-3" />
                              </button>
                          </div>
                          </div>

                          {/* Right column: optional custom exam time */}
                          <div className="flex-1 min-w-0 border-l pl-3">
                              <div className="flex items-center gap-1.5 min-w-0 mb-1">
                                  <Clock className="h-4 w-4 text-emerald-500 shrink-0" />
                                  <span className="text-xs font-semibold truncate">সময় (মিনিট)</span>
                              </div>
                              <div className="relative rounded-lg border-2 border-emerald-400 dark:border-emerald-600 bg-white dark:bg-black w-20">
                                  <input
                                      type="number"
                                      min={1}
                                      placeholder="Optional"
                                      value={customTimeMinutes ?? ""}
                                      onChange={(e) => {
                                          const raw = e.target.value;
                                          if (raw === "") {
                                              setCustomTimeMinutes(null);
                                              return;
                                          }
                                          const val = parseInt(raw, 10);
                                          setCustomTimeMinutes(Number.isNaN(val) ? null : Math.max(val, 1));
                                      }}
                                      className="h-8 w-full bg-transparent text-center text-sm font-bold text-foreground focus:outline-none cursor-text [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none px-1"
                                  />
                              </div>
                              <span className="text-[10px] text-muted-foreground">খালি রাখলে ডিফল্ট সময়</span>
                          </div>
                      </div>
                      <div className="px-3 pb-1.5 -mt-1">
                          <span className="text-[10px] text-muted-foreground">
                              Max {effectiveQuestions?.length || 0}
                          </span>
                      </div>
                  </Card>
              )}

              {/* Card 2: Instructions */}
              <Card className="w-full rounded-xl shadow-sm border relative">
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-muted-foreground">OMR এ পরীক্ষা</span>
                      <button
                          type="button"
                          role="switch"
                          aria-checked={omrMode}
                          onClick={() => {
                              const next = !omrMode;
                              setOmrMode(next);
                              if (next) setShowOmrPopup(true);
                          }}
                          className={cn(
                              "h-5 w-9 rounded-full border-2 transition-colors flex items-center px-0.5",
                              omrMode ? "bg-emerald-500 border-emerald-500 justify-end" : "bg-muted border-border justify-start"
                          )}
                      >
                          <span className="h-3.5 w-3.5 rounded-full bg-white shadow-sm" />
                      </button>
                  </div>
                  <div className="p-3 md:p-4 pr-28 space-y-1.5">
                      <h3 className="text-xs font-semibold flex items-center gap-1.5">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                          Instructions
                      </h3>
                      <div className="text-xs text-muted-foreground leading-snug max-h-20 overflow-y-auto">
                          {exam.instructions ? (
                              <div className="prose prose-sm max-w-none dark:prose-invert">
                                  <MathText text={exam.instructions} />
                              </div>
                          ) : (
                              <ul className="list-disc pl-4 space-y-0.5">
                                  <li>Ensure you have a stable internet connection.</li>
                                  <li>Do not switch tabs or windows. Violations are recorded.</li>
                                  <li>The exam will auto-submit when the timer ends.</li>
                                  <li>Once started, the timer cannot be paused.</li>
                              </ul>
                          )}
                      </div>
                  </div>
              </Card>

              {/* OMR Mode Popup */}
              <Dialog open={showOmrPopup} onOpenChange={(o) => { setShowOmrPopup(o); if (!o && !hasStarted) setOmrMode(false); }}>
                  <DialogContent className="max-w-md">
                      <DialogHeader>
                          <DialogTitle>OMR মোড</DialogTitle>
                          <DialogDescription>
                              OMR শীটে উত্তর দিয়ে স্ক্যান করে জমা দিতে চাইলে এই মোড ব্যবহার করুন।
                          </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3">
                          <Button
                              variant="outline"
                              className="w-full justify-start h-auto py-2.5"
                              onClick={() => {
                                  window.open("/omr/atlas-omr-sheet.pdf", "_blank");
                              }}
                          >
                              <div className="text-left">
                                  <div className="font-medium">OMR শীট ডাউনলোড করুন</div>
                                  <div className="text-[10px] font-normal text-muted-foreground">এখনো ডাউনলোড করা না থাকলে এখান থেকে করুন</div>
                              </div>
                          </Button>

                          <Button
                              className="w-full h-11 text-sm font-semibold"
                              onClick={() => {
                                  setOmrMode(true);
                                  setShowOmrPopup(false);
                                  setHasStarted(true);
                              }}
                          >
                              OMR এ পরীক্ষা দিন
                          </Button>
                      </div>
                  </DialogContent>
              </Dialog>

              {/* Card 3: Actions */}
              <Card className="w-full rounded-xl shadow-sm border">
                  <div className="p-3 md:p-4 space-y-2">
                      <div className="flex items-center space-x-2 p-1 rounded-lg hover:bg-muted/50 transition-colors">
                          <Checkbox
                              id="terms"
                              checked={agreedToInstructions}
                              onCheckedChange={(c) => setAgreedToInstructions(!!c)}
                              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary h-4 w-4"
                          />
                          <label
                              htmlFor="terms"
                              className="text-xs font-medium leading-none cursor-pointer flex-1"
                          >
                              I have read and understood the instructions.
                          </label>
                      </div>

                      <div className="flex gap-2">
                          <Button variant="outline" className="flex-1 h-10 text-sm rounded-xl" onClick={() => navigate(-1)}>
                              Cancel
                          </Button>
                          <Button
                              className="flex-[2] h-10 text-sm rounded-xl font-semibold shadow-md"
                              onClick={() => {
                                  if (hasImageOrPatternQuestions && showsReadymadeUI && !isQuickPracticeMode && !contentMode) {
                                      toast({
                                          title: "মোড সিলেক্ট করুন",
                                          description: "পরীক্ষা শুরু করার আগে উপরে থেকে চিত্র/উদ্দীপকসহ অথবা চিত্র/উদ্দীপকছাড়া মোড বেছে নিন।",
                                          variant: "destructive",
                                      });
                                      return;
                                  }
                                  if (isSpecialExam && optionalSubjects.length > 0 && selectedOptionalSubjects.length === 0) {
                                      toast({
                                          title: "বিষয় সিলেক্ট করুন",
                                          description: "পরীক্ষা শুরু করার আগে অন্তত একটি ঐচ্ছিক বিষয় বেছে নিন।",
                                          variant: "destructive",
                                      });
                                      return;
                                  }
                                  // Guest (not logged in) on a Free/guest-allowed Exam — collect name/batch/college/phone first.
                                  // @ts-ignore
                                  if (!user && (exam?.is_visible_on_free || exam?.allow_guest) && !guestInfo) {
                                      setShowGuestDialog(true);
                                      return;
                                  }
                                  if (exam.external_exam_link) {
                                      window.location.replace(exam.external_exam_link);
                                  } else if (isQuickPracticeMode && exam.is_readymade) {
                                      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}_qp_mode`, "1");
                                      if (selectedQuestionCount) {
                                          localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}_selected_count`, selectedQuestionCount.toString());
                                      }
                                      setHasStarted(true);
                                  } else {
                                      if (exam.is_readymade && selectedQuestionCount) {
                                          localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}_selected_count`, selectedQuestionCount.toString());
                                      }
                                      setHasStarted(true);
                                  }
                              }}
                              disabled={!agreedToInstructions}
                          >
                              Start Exam
                          </Button>
                      </div>
                  </div>
              </Card>

              <GuestExamInfoDialog
                  open={showGuestDialog}
                  onOpenChange={setShowGuestDialog}
                  onConfirm={(info) => {
                      setGuestInfoState(info);
                      setShowGuestDialog(false);
                      setHasStarted(true);
                  }}
              />
          </div>
          </div>
      );
  }

  // OMR-only mode: bypass the normal click-through MCQ screen entirely —
  // sticky upload bar at the very top, then a read-only (non-clickable)
  // style2-style question+options view below. No answer selection here;
  // the student fills the printed OMR sheet by hand and uploads/scans it.
  if (omrMode && hasStarted && !isQuickPracticeMode) {
    const omrQuestions = shuffledQuestions.length > 0 ? shuffledQuestions : (effectiveQuestions || []);
    const omrQuestionIds = omrQuestions.map((q: any) => q.id);
    const omrOptionLabels = ["A", "B", "C", "D"];
    return (
      <div className="min-h-screen bg-background pb-10">
        <div className="sticky top-0 z-20 bg-background border-b shadow-sm">
          <div className="max-w-5xl mx-auto p-3 flex items-center justify-between gap-3">
            <span className="text-xs font-mono font-bold px-2 py-1 rounded-full bg-muted">
              {timeLeft !== null ? `${Math.floor(timeLeft / 60).toString().padStart(2, "0")}:${(timeLeft % 60).toString().padStart(2, "0")}` : "--:--"}
            </span>
            <span className="text-xs font-semibold flex-1 truncate">{exam.title}{selectedTopic ? ` (${selectedSubtopic || selectedTopic})` : ""}</span>
          </div>
          <div className="max-w-5xl mx-auto px-3 pb-3">
            <OmrExamScanner
              questionIds={omrQuestionIds}
              answers={answers}
              onFillAnswers={(filledAnswers) => {
                setAnswers((prev) => ({ ...prev, ...filledAnswers }));
              }}
            />
          </div>
          <div className="max-w-5xl mx-auto px-3 pb-3">
            <Button
              className="w-full h-11 text-sm font-semibold"
              disabled={submitExamMutation.isPending || Object.keys(answers).length === 0}
              onClick={() => submitExamMutation.mutate()}
            >
              {submitExamMutation.isPending ? "জমা হচ্ছে..." : "OMR জমা দিন"}
            </Button>
          </div>
        </div>

        <div className="w-full">
          <div className="p-2 grid grid-cols-2 gap-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {omrQuestions.map((q: any, idx: number) => {
              const currentAnswer = answers[q.id];
              return (
              <Card key={q.id} className="rounded-lg border p-2.5 flex flex-col">
                <div className="flex items-start gap-1.5 mb-1.5">
                  <span className="text-xs font-bold text-emerald-600 shrink-0">{String(idx + 1).padStart(2, "0")}.</span>
                  <div className="text-xs flex-1">
                    <MathText text={q.question_text} />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-1 pl-4 text-[11px]">
                  {[q.option_a, q.option_b, q.option_c, q.option_d].map((opt: string, oi: number) => {
                    const isMarked = currentAnswer === omrOptionLabels[oi];
                    return (
                    <div key={oi} className={cn("flex items-start gap-1.5", isMarked ? "text-emerald-700 dark:text-emerald-400 font-semibold" : "text-muted-foreground")}>
                      <span className={cn(
                        "h-4 w-4 rounded-full border flex items-center justify-center text-[8px] font-bold shrink-0 mt-0.5",
                        isMarked ? "bg-emerald-500 border-emerald-500 text-white" : ""
                      )}>
                        {omrOptionLabels[oi]}
                      </span>
                      <span className="break-words"><MathText text={opt} as="span" /></span>
                    </div>
                    );
                  })}
                </div>
              </Card>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Quick Practice Mode: dedicated quiz-style UI (30s/question, instant feedback, end anytime)
  if (isQuickPracticeMode && exam?.is_readymade) {
    if (practiceQuestionsError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="text-sm font-semibold">Quick Practice লোড করা যায়নি।</p>
          <p className="text-xs text-muted-foreground max-w-xs">Database migration (get_exam_questions_practice) রান করা হয়েছে কিনা চেক করুন, তারপর আবার চেষ্টা করুন।</p>
          <Button variant="outline" onClick={() => { qpCleanupStorage(); navigate(-1); }} className="mt-2 rounded-xl">ফিরে যাও</Button>
        </div>
      );
    }
    if (!practiceQuestionsLoading && practiceQuestions && practiceQuestions.length === 0) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <p className="text-sm font-semibold">এই পরীক্ষায় কোনো প্রশ্ন পাওয়া যায়নি।</p>
          <Button variant="outline" onClick={() => { qpCleanupStorage(); navigate(-1); }} className="mt-2 rounded-xl">ফিরে যাও</Button>
        </div>
      );
    }
    if (practiceQuestionsLoading || qpQuestions.length === 0) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (qpFinished) {
      const total = qpQuestions.length;
      const correctCount = Object.values(qpAnswers).filter((a) => a.correct).length;
      const skippedCount = Object.values(qpAnswers).filter((a) => a.skipped).length;
      const wrongCount = total - correctCount - skippedCount;

      if (qpShowDetailResult) {
        return (
          <div className="min-h-screen bg-background pb-24">
            <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQpShowDetailResult(false)}
                className="h-9 w-9 rounded-full border flex items-center justify-center shrink-0 hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
                <h1 className="text-base font-bold">Detail Result</h1>
                <p className="text-xs text-muted-foreground">Correct: {correctCount} · Wrong: {wrongCount} · Skipped: {skippedCount}</p>
              </div>
            </div>

            <div className="max-w-2xl mx-auto px-3 py-4 space-y-4">
              {qpQuestions.map((q: any, idx: number) => {
                const ans = qpAnswers[idx];
                const options: { key: string; text: string }[] = [
                  { key: "a", text: q.option_a },
                  { key: "b", text: q.option_b },
                  { key: "c", text: q.option_c },
                  { key: "d", text: q.option_d },
                  { key: "e", text: q.option_e },
                ].filter((o) => !!o.text);

                return (
                  <Card key={q.id ?? idx} className="rounded-2xl overflow-hidden shadow-sm border">
                    <CardContent className="p-4 space-y-2">
                      <span className={cn(
                        "text-xs font-bold px-2.5 py-1 rounded-full inline-block",
                        ans?.correct ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                        ans?.skipped ? "bg-muted text-muted-foreground" :
                        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      )}>
                        {idx + 1}/{qpQuestions.length}
                      </span>
                      <div className="text-base font-medium leading-relaxed">
                        <MathText text={q.question_text} />
                      </div>
                      <div className="space-y-2 pt-1">
                        {options.map((opt) => {
                          const isCorrectOpt = opt.key.toUpperCase() === String(q.correct_option).toUpperCase();
                          const isSelected = ans?.selected === opt.key;
                          return (
                            <div key={opt.key} className="flex items-start gap-3">
                              <div className={cn(
                                "flex-shrink-0 h-7 w-7 rounded-full border-2 flex items-center justify-center text-xs font-bold mt-0.5",
                                isCorrectOpt ? "bg-green-500 border-green-500 text-white"
                                  : isSelected ? "bg-red-500 border-red-500 text-white"
                                  : "border-muted-foreground/30 text-muted-foreground"
                              )}>
                                {opt.key.toUpperCase()}
                              </div>
                              <div className={cn(
                                "flex-1 min-w-0 text-sm pt-1",
                                isCorrectOpt ? "text-green-700 dark:text-green-400 font-medium" :
                                isSelected ? "text-red-600 dark:text-red-400" : "text-foreground"
                              )}>
                                <MathText text={opt.text} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {q.explanation && (
                        <div className="mt-2 pt-2 border-t border-dashed text-sm text-foreground/80">
                          <span className="font-bold text-muted-foreground mr-1">ব্যাখ্যা:</span>
                          <MathText text={q.explanation} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 text-center">
          <h2 className="text-xl font-bold">Quick Practice শেষ!</h2>
          <div className="flex gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/10 min-w-20">
              <div className="text-xl font-extrabold text-emerald-600">{correctCount}</div>
              <div className="text-[10px] text-muted-foreground">Correct</div>
            </div>
            <div className="p-3 rounded-xl bg-destructive/10 min-w-20">
              <div className="text-xl font-extrabold text-destructive">{wrongCount}</div>
              <div className="text-[10px] text-muted-foreground">Wrong</div>
            </div>
            <div className="p-3 rounded-xl bg-muted min-w-20">
              <div className="text-xl font-extrabold text-muted-foreground">{skippedCount}</div>
              <div className="text-[10px] text-muted-foreground">Skipped</div>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="outline" onClick={() => { qpCleanupStorage(); navigate(-1); }} className="rounded-xl">ফিরে যাও</Button>
            <Button onClick={qpRestart} className="rounded-xl">আবার Practice করুন</Button>
            <Button variant="secondary" onClick={() => setQpShowDetailResult(true)} className="rounded-xl">Detail Result</Button>
          </div>
        </div>
      );
    }

    const q = qpQuestions[qpCurrent];
    const ans = qpAnswers[qpCurrent];
    const options: { key: string; text: string }[] = [
      { key: "a", text: q.option_a },
      { key: "b", text: q.option_b },
      { key: "c", text: q.option_c },
      { key: "d", text: q.option_d },
      { key: "e", text: q.option_e },
    ].filter((o) => !!o.text);

    return (
      <div className="fixed inset-0 z-40 bg-background flex flex-col overflow-hidden">
        <Dialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Practice ছেড়ে যেতে চান?</DialogTitle>
                    <DialogDescription>
                        এখনো Quick Practice শেষ হয়নি। এই মুহূর্তে বের হয়ে গেলে আপনার অগ্রগতি হারিয়ে যেতে পারে।
                    </DialogDescription>
                </DialogHeader>
                <div className="flex gap-2 justify-end pt-2">
                    <Button
                        variant="outline"
                        onClick={() => setShowExitConfirm(false)}
                    >
                        না, চালিয়ে যাই
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => {
                            setShowExitConfirm(false);
                            qpCleanupStorage();
                            navigate(-1);
                        }}
                    >
                        হ্যাঁ, বের হবো
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
        <div className="flex items-center gap-3 px-4 py-3 bg-card border-b shrink-0">
          <div className="flex-1">
            <div className="text-[11px] text-muted-foreground mb-1">প্রশ্ন {qpCurrent + 1}/{qpQuestions.length}</div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-gradient-to-r from-violet-500 to-violet-400 transition-all" style={{ width: `${((qpCurrent + 1) / qpQuestions.length) * 100}%` }} />
            </div>
          </div>
          <div className={cn("h-9 w-9 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0",
            qpTimeLeft <= 10 ? "border-destructive text-destructive" : "border-violet-400 text-violet-600")}>
            {qpTimeLeft}
          </div>

          <div className="relative flex-shrink-0">
            <button
              onClick={() => setQpVolMenuOpen((v) => !v)}
              className="h-9 w-9 rounded-full border flex items-center justify-center hover:bg-muted"
            >
              {qpSoundVol <= 0 ? <VolumeX className="h-4 w-4" /> : qpSoundVol < 1 ? <Volume1 className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            {qpVolMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setQpVolMenuOpen(false)} />
                <div className="absolute top-11 right-0 z-50 w-[230px] bg-card border rounded-xl p-2.5 shadow-xl flex flex-col gap-2">
                  <div className="flex gap-1 justify-between pb-2 border-b">
                    {[0, 0.5, 1, 1.6].map((v) => (
                      <button
                        key={v}
                        onClick={() => qpChangeVol(v)}
                        className={cn(
                          "flex-1 text-center py-1.5 rounded-lg text-xs",
                          qpSoundVol === v ? "bg-primary/15 text-primary" : "hover:bg-muted"
                        )}
                      >
                        {v === 0 ? <VolumeX className="h-4 w-4 mx-auto" /> : v < 1 ? <Volume1 className="h-4 w-4 mx-auto" /> : v === 1 ? <Volume2 className="h-4 w-4 mx-auto" /> : <Volume className="h-4 w-4 mx-auto text-amber-500" />}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-extrabold text-muted-foreground mb-1">Right</div>
                      {Object.entries(RIGHT_PACKS).map(([k, p]) => (
                        <div
                          key={k}
                          onClick={() => qpChooseSound("right", k)}
                          className={cn(
                            "px-1.5 py-1.5 rounded-md text-[11px] cursor-pointer truncate",
                            k === qpRightPack ? "bg-primary/15 text-primary font-bold" : "hover:bg-muted"
                          )}
                        >
                          {p.label}
                        </div>
                      ))}
                    </div>
                    <div className="w-px bg-border mx-1.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-extrabold text-muted-foreground mb-1">Wrong</div>
                      {Object.entries(WRONG_PACKS).map(([k, p]) => (
                        <div
                          key={k}
                          onClick={() => qpChooseSound("wrong", k)}
                          className={cn(
                            "px-1.5 py-1.5 rounded-md text-[11px] cursor-pointer truncate",
                            k === qpWrongPack ? "bg-primary/15 text-primary font-bold" : "hover:bg-muted"
                          )}
                        >
                          {p.label}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => { if (confirm("Quick Practice শেষ করবেন?")) { setQpFinished(true); qpCleanupStorage(); } }}
            className="px-3 py-2 rounded-full bg-destructive text-destructive-foreground font-bold text-xs shrink-0 whitespace-nowrap"
          >
            শেষ করো
          </button>
        </div>

        <div className="flex-1 max-w-2xl w-full mx-auto px-4 py-5 flex flex-col overflow-y-auto pb-24">
          <div className="flex items-start justify-between gap-3 mb-3">
            <p className="text-[16px] font-bold leading-relaxed flex-1"><MathText text={q.question_text} /></p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <ReportQuestionDialog questionId={q.id} questionText={q.question_text} onClose={() => {}} />
              <button
                onClick={() => toggleBookmark(q.id)}
                className="h-8 w-8 rounded-full border flex items-center justify-center hover:bg-muted"
              >
                <Bookmark className={cn("h-4 w-4", bookmarkedIds.has(q.id) && "fill-current text-amber-500")} />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {options.map((opt) => {
              let cls = "border-border bg-card hover:border-primary/40";
              if (ans) {
                if (opt.key.toUpperCase() === String(q.correct_option).toUpperCase()) cls = "border-emerald-500 bg-emerald-500/10";
                else if (opt.key === ans.selected) cls = "border-destructive bg-destructive/10";
                else cls = "border-border bg-card opacity-50";
              }
              return (
                <button
                  key={opt.key}
                  onClick={() => qpSelectOption(opt.key)}
                  disabled={!!ans}
                  className={cn("flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-sm text-left transition-all active:scale-[0.98]", cls)}
                >
                  <span className={cn("h-7 w-7 rounded-lg flex items-center justify-center font-extrabold text-xs shrink-0",
                    ans && opt.key.toUpperCase() === String(q.correct_option).toUpperCase() ? "bg-emerald-500 text-white"
                    : ans && opt.key === ans.selected ? "bg-destructive text-white"
                    : "bg-muted text-muted-foreground")}>
                    {opt.key.toUpperCase()}
                  </span>
                  <span><MathText text={opt.text} /></span>
                </button>
              );
            })}
          </div>

          {ans?.skipped && (
            <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border-l-4 border-amber-500 text-xs font-semibold">
              ⏱️ সময় শেষ! সঠিক উত্তর উপরে দেখানো হয়েছে।
            </div>
          )}

          {ans && q.explanation && (
            <div className="mt-4 p-4 rounded-xl bg-muted/50 border-l-4 border-primary text-sm leading-relaxed">
              <div className="text-[11px] font-extrabold text-primary mb-1">ব্যাখ্যা</div>
              <MathText text={q.explanation} />
            </div>
          )}
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-30 bg-background border-t px-4 py-3">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={qpGoNext}
              disabled={!ans}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {qpCurrent === qpQuestions.length - 1 ? "শেষ করো" : "পরবর্তী →"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Use shuffled questions if ready, else raw (should only be raw for a split second)
  const displayQuestions = shuffledQuestions.length > 0 ? shuffledQuestions : questions;

  const answeredCount = Object.keys(answers).length;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const isLowTime = timeLeft !== null && timeLeft < 300; // < 5 mins

  return (
    <div className="min-h-screen bg-background pb-20 relative font-sans">

      <Dialog open={!!resumePrompt} onOpenChange={() => { /* must choose an option below */ }}>
          <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
              <DialogHeader>
                  <DialogTitle>আগের পরীক্ষা চালিয়ে যাবেন?</DialogTitle>
                  <DialogDescription>
                      এই পরীক্ষার একটি অসম্পূর্ণ session পাওয়া গেছে। আগের উত্তরগুলো নিয়ে চালিয়ে যেতে চান, নাকি নতুন করে শুরু করবেন?
                  </DialogDescription>
              </DialogHeader>
              <div className="flex gap-2 justify-end pt-2">
                  <Button variant="outline" onClick={handleResumeRestart}>
                      নতুন করে শুরু করুন
                  </Button>
                  <Button onClick={handleResumeContinue}>
                      চালিয়ে যান
                  </Button>
              </div>
          </DialogContent>
      </Dialog>

      <Dialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
          <DialogContent className="max-w-sm">
              <DialogHeader>
                  <DialogTitle>পরীক্ষা ছেড়ে যেতে চান?</DialogTitle>
                  <DialogDescription>
                      এখনো পরীক্ষা শেষ হয়নি। এই মুহূর্তে বের হয়ে গেলে আপনার অগ্রগতি হারিয়ে যেতে পারে।
                  </DialogDescription>
              </DialogHeader>
              <div className="flex gap-2 justify-end pt-2">
                  <Button
                      variant="outline"
                      onClick={() => setShowExitConfirm(false)}
                  >
                      না, পরীক্ষা চালিয়ে যাই
                  </Button>
                  <Button
                      variant="destructive"
                      onClick={() => {
                          setShowExitConfirm(false);
                          cleanupExamStorage();
                          navigate(-1);
                      }}
                  >
                      হ্যাঁ, বের হবো
                  </Button>
              </div>
          </DialogContent>
      </Dialog>

      <div className="container max-w-full lg:max-w-[92rem] mx-auto px-0.5 py-4 md:px-3 md:py-8 space-y-3 overflow-x-hidden">
        {/* fixed (not sticky) so it stays visible no matter which ancestor actually
            scrolls on mobile. top offset clears the dashboard's own 56px header when
            logged in — guests hit this page standalone (no such header) so it sits at 0. */}
        <div ref={fixedHeaderRef} className={cn("fixed left-0 right-0 z-40 bg-background/95 backdrop-blur border-b py-2 px-2 md:px-3 space-y-2", user ? "top-14" : "top-0")}>
          <div className="container max-w-full lg:max-w-[92rem] mx-auto px-0 md:px-0 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl md:text-2xl font-bold truncate">{exam.title}{selectedTopic ? ` (${selectedSubtopic || selectedTopic})` : ""} {retakeFromAttemptId && "(Mistakes Only)"}</h1>
              <p className="text-sm text-muted-foreground">
                Answered: {answeredCount} / {displayQuestions.length}
                {displayQuestions.length > 0 && ` (${Math.round((answeredCount / displayQuestions.length) * 100)}%)`}
              </p>
              <Progress
                value={displayQuestions.length > 0 ? (answeredCount / displayQuestions.length) * 100 : 0}
                className="h-1.5 mt-1"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Timer Badge */}
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

          <div className="flex flex-wrap items-center gap-2">
            {retakeFromAttemptId && (
                <div className="px-3 py-1 rounded-full font-bold border bg-blue-500/10 border-blue-500/50 text-blue-600 dark:text-blue-400 flex items-center gap-1.5 text-xs">
                    <RotateCw className="h-3 w-3" />
                    <span>Retake Mode</span>
                </div>
            )}

            {/* Auto-save Indicator */}
            <div className="px-2.5 py-1 rounded-full font-medium text-xs border bg-background text-muted-foreground flex items-center gap-1 opacity-70">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                Saved
            </div>

            {/* Violation Badge - Only shows if violations exist */}
            {violationCount > 0 && (
                <div className="px-3 py-1 rounded-full font-bold border bg-yellow-500/10 border-yellow-500/50 text-yellow-600 dark:text-yellow-400 flex items-center gap-1.5 text-xs animate-in fade-in zoom-in">
                    <AlertTriangle className="h-3 w-3" />
                    <span>Warnings: {violationCount}</span>
                </div>
            )}
          </div>
          </div>
        </div>
        {/* Spacer so page content isn't hidden under the fixed header above —
            height is measured live from the header itself. */}
        <div style={{ height: fixedHeaderHeight }} aria-hidden="true" />

        {/* OMR Scanner Section - only for OMR-enabled exams */}
        {exam.is_omr && displayQuestions && displayQuestions.length > 0 && (
            <OmrExamScanner
                questionIds={displayQuestions.map((q: any) => q.id)}
                answers={answers}
                onFillAnswers={(filledAnswers) => {
                    setAnswers(prev => ({ ...prev, ...filledAnswers }));
                }}
            />
        )}

        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {displayQuestions.map((q: any, idx: number) => (
          <div
            key={q.id}
            ref={(el) => { questionRefs.current[q.id] = el; }}
            className="scroll-mt-28"
          >
            {isSpecialExam && q.subject && q.subject !== displayQuestions[idx - 1]?.subject && (
                <div className="sticky top-16 z-10 mb-2 flex justify-center">
                    <div className="rounded-full bg-primary text-primary-foreground text-xs font-bold px-4 py-1.5 shadow-md">
                        {q.subject}
                    </div>
                </div>
            )}
            <Card className="shadow-sm rounded-[30px] overflow-hidden max-w-full">
                <CardContent className="p-4 md:p-5 space-y-2 max-w-full overflow-x-hidden">
                    {/* Top Row: N/total badge + icons */}
                    <div className="flex items-center justify-between gap-2 max-w-full">
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                            {idx + 1}/{displayQuestions.length}
                        </span>
                        <div className="flex-shrink-0 flex items-center gap-0.5">
                            <ReportQuestionDialog questionId={q.id} questionText={q.question_text} onClose={() => {}} />
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-amber-500"
                                onClick={() => toggleBookmark(q.id)}
                            >
                                <Bookmark className={cn("h-5 w-5", bookmarkedIds.has(q.id) && "fill-current text-amber-500")} />
                            </Button>
                        </div>
                    </div>

                    {/* Question Row - full width */}
                    <div className="w-full min-w-0 overflow-x-auto no-scrollbar scroll-smooth overscroll-x-contain">
                        <div className="text-lg font-medium leading-relaxed whitespace-pre-line min-w-0 break-words text-black dark:text-white">
                            <MathText text={q.question_text} className="prose dark:prose-invert max-w-none whitespace-pre-line min-w-0 break-words text-black dark:text-white" />
                        </div>
                    </div>

                    {/* Options Row */}
                    <div className="space-y-2 pt-2 max-w-full">
                        {(["A", "B", "C", "D", "E"] as const).map((optionKey) => {
                            const optionText = q[`option_${optionKey.toLowerCase()}` as keyof typeof q];
                            if (!optionText) return null;
                            const isSelected = answers[q.id] === optionKey;
                            const isAnswered = !!answers[q.id];
                            const isDisabled = isAnswered && !isSelected;

                            return (
                                <div
                                    key={optionKey}
                                    onClick={() => {
                                        if (!isAnswered) {
                                            const updated = { ...answers, [q.id]: optionKey };
                                            setAnswers(updated);
                                            scrollToNextUnanswered(q.id, updated);
                                        }
                                    }}
                                    className={cn("flex items-start gap-4 group max-w-full", !isAnswered && "cursor-pointer", isDisabled && "opacity-50 pointer-events-none")}
                                >
                                    <div
                                        className={cn(
                                        "flex-shrink-0 h-8 w-8 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all mt-0.5",
                                        isSelected
                                            ? "bg-primary border-primary text-primary-foreground scale-110"
                                            : "border-muted-foreground/30 text-muted-foreground",
                                        !isAnswered && !isSelected && "group-hover:border-primary/50 group-hover:text-primary",
                                        isDisabled && "border-muted-foreground/20 text-muted-foreground/50 cursor-not-allowed"
                                    )}>
                                        {optionKey}
                                    </div>
                                    <div className={cn(
                                        "flex-1 min-w-0 text-base whitespace-pre-line pt-1 p-2.5 rounded-lg border overflow-x-auto no-scrollbar scroll-smooth overscroll-x-contain flex items-start justify-between gap-2",
                                        isSelected ? "text-primary font-medium bg-primary/5 border-primary/40" : "text-black dark:text-white border-border/60"
                                    )}>
                                        <div className="flex-1 min-w-0">
                                            <MathText text={optionText} className="prose dark:prose-invert max-w-none whitespace-pre-line min-w-0 break-words text-black dark:text-white" />
                                        </div>
                                        {isSelected && <Lock className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
          </div>
        ))}

        <div className="flex justify-center mt-8 pb-12">
            <Button
                size="lg"
                onClick={() => {
                        if (confirm("Finish and submit exam?")) submitExamMutation.mutate();
                }}
                className="bg-green-600 hover:bg-green-700 w-full max-w-sm h-12 text-lg rounded-full"
            >
                Finish Exam
            </Button>
        </div>
      </div>

      {/* Floating Submit Button */}
      <div className="fixed bottom-6 right-6 z-40">
        <Button
             size="default"
             className="h-12 rounded-full shadow-xl bg-green-600 hover:bg-green-700 text-white font-bold px-5"
             onClick={() => {
                if (confirm("Are you sure you want to submit?")) submitExamMutation.mutate();
             }}
             disabled={submitExamMutation.isPending}
        >
            {submitExamMutation.isPending ? "Submitting..." : "Submit"}
        </Button>
      </div>

      {/* Floating Navigator Button - Right Middle */}
      <div className="fixed top-1/2 right-4 -translate-y-1/2 z-40">
        <Button
            size="icon"
            className="h-12 w-12 rounded-full shadow-xl bg-primary hover:bg-primary/90"
            onClick={() => setIsNavigatorOpen(true)}
        >
            <LayoutGrid className="h-6 w-6" />
        </Button>
      </div>

      {/* Question Navigator Modal */}
      <Dialog open={isNavigatorOpen} onOpenChange={setIsNavigatorOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader>
                <DialogTitle>Question Navigator</DialogTitle>
            </DialogHeader>
            {isSpecialExam ? (
                <div className="space-y-4 p-2">
                    {(() => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const groups: { subject: string; items: { q: any; idx: number }[] }[] = [];
                        displayQuestions.forEach((q: any, idx: number) => {
                            const key = q.subject || "";
                            const last = groups[groups.length - 1];
                            if (last && last.subject === key) {
                                last.items.push({ q, idx });
                            } else {
                                groups.push({ subject: key, items: [{ q, idx }] });
                            }
                        });
                        return groups.map((g, gi) => (
                            <div key={gi}>
                                {g.subject && (
                                    <p className="text-xs font-bold text-primary mb-2">{g.subject}</p>
                                )}
                                <div className="grid grid-cols-5 gap-3">
                                    {g.items.map(({ q, idx }) => {
                                        const isAnswered = !!answers[q.id];
                                        return (
                                            <button
                                                key={q.id}
                                                onClick={() => scrollToQuestion(idx)}
                                                className={`
                                                    h-10 w-10 rounded-lg flex items-center justify-center text-sm font-bold transition-all
                                                    ${isAnswered
                                                        ? 'bg-primary text-primary-foreground shadow-sm'
                                                        : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-border'}
                                                `}
                                            >
                                                {idx + 1}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ));
                    })()}
                </div>
            ) : displayQuestions.some((q: any) => q.topic) ? (
                <div className="space-y-4 p-2">
                    {(() => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const groups: { topic: string; items: { q: any; idx: number }[] }[] = [];
                        displayQuestions.forEach((q: any, idx: number) => {
                            const key = q.topic || "";
                            const last = groups[groups.length - 1];
                            if (last && last.topic === key) {
                                last.items.push({ q, idx });
                            } else {
                                groups.push({ topic: key, items: [{ q, idx }] });
                            }
                        });
                        return groups.map((g, gi) => (
                            <div key={gi}>
                                {g.topic && (
                                    <p className="text-xs font-bold text-primary mb-2">{g.topic}</p>
                                )}
                                <div className="grid grid-cols-5 gap-3">
                                    {g.items.map(({ q, idx }) => {
                                        const isAnswered = !!answers[q.id];
                                        return (
                                            <button
                                                key={q.id}
                                                onClick={() => scrollToQuestion(idx)}
                                                className={`
                                                    h-10 w-10 rounded-lg flex items-center justify-center text-sm font-bold transition-all
                                                    ${isAnswered
                                                        ? 'bg-primary text-primary-foreground shadow-sm'
                                                        : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-border'}
                                                `}
                                            >
                                                {idx + 1}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ));
                    })()}
                </div>
            ) : (
                <div className="grid grid-cols-5 gap-3 p-2">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {displayQuestions.map((q: any, idx: number) => {
                        const isAnswered = !!answers[q.id];
                        return (
                            <button
                                key={q.id}
                                onClick={() => scrollToQuestion(idx)}
                                className={`
                                    h-10 w-10 rounded-lg flex items-center justify-center text-sm font-bold transition-all
                                    ${isAnswered
                                        ? 'bg-primary text-primary-foreground shadow-sm'
                                        : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-border'}
                                `}
                            >
                                {idx + 1}
                            </button>
                        );
                    })}
                </div>
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TakeExam;
