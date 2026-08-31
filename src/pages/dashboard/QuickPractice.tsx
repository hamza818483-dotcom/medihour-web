import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ChevronRight, Zap, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Mcq {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
}

const QuickPractice = () => {
  const navigate = useNavigate();

  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);

  const [started, setStarted] = useState(false);
  const [questions, setQuestions] = useState<Mcq[]>([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const { data: subjects, isLoading: subjectsLoading } = useQuery({
    queryKey: ["qp-subjects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qp_subjects")
        .select("id, name")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: chapters } = useQuery({
    queryKey: ["qp-chapters", subjectId],
    enabled: !!subjectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qp_chapters")
        .select("id, name")
        .eq("subject_id", subjectId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: topics } = useQuery({
    queryKey: ["qp-topics", chapterId],
    enabled: !!chapterId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qp_topics")
        .select("id, name")
        .eq("chapter_id", chapterId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const startPractice = async (scopeTopicId: string | null) => {
    if (!chapterId) return;
    let query = supabase
      .from("qp_mcqs")
      .select("id, question, options, correct_index, explanation");

    if (scopeTopicId) {
      query = query.eq("topic_id", scopeTopicId);
    } else {
      query = query.eq("chapter_id", chapterId).is("topic_id", null);
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) return;

    const shuffled = [...data].sort(() => Math.random() - 0.5);
    setQuestions(shuffled as Mcq[]);
    setCurrent(0);
    setSelected(null);
    setScore(0);
    setFinished(false);
    setStarted(true);
  };

  const handleAnswer = (idx: number) => {
    if (selected !== null) return;
    setSelected(idx);
    if (idx === questions[current].correct_index) {
      setScore((s) => s + 1);
    }
  };

  const handleNext = () => {
    if (current + 1 >= questions.length) {
      setFinished(true);
      return;
    }
    setCurrent((c) => c + 1);
    setSelected(null);
  };

  const reset = () => {
    setStarted(false);
    setFinished(false);
    setQuestions([]);
    setSubjectId(null);
    setChapterId(null);
    setTopicId(null);
  };

  // --- Practice mode UI ---
  if (started && !finished && questions.length > 0) {
    const q = questions[current];
    return (
      <div className="mx-auto w-full max-w-[600px] px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> বের হন
          </button>
          <span className="text-sm font-bold text-muted-foreground">
            {current + 1} / {questions.length}
          </span>
        </div>

        <Card>
          <CardContent className="p-5">
            <p className="mb-4 font-semibold leading-relaxed">{q.question}</p>
            <div className="space-y-2">
              {q.options.map((opt, i) => {
                const isCorrect = i === q.correct_index;
                const isSelected = i === selected;
                return (
                  <button
                    key={i}
                    onClick={() => handleAnswer(i)}
                    disabled={selected !== null}
                    className={cn(
                      "w-full rounded-xl border p-3 text-left text-sm transition-colors",
                      selected === null && "hover:border-violet-400",
                      selected !== null && isCorrect && "border-green-500 bg-green-50 dark:bg-green-950/30",
                      selected !== null && isSelected && !isCorrect && "border-red-500 bg-red-50 dark:bg-red-950/30"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span>{opt}</span>
                      {selected !== null && isCorrect && <Check className="h-4 w-4 text-green-600" />}
                      {selected !== null && isSelected && !isCorrect && <X className="h-4 w-4 text-red-600" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {selected !== null && q.explanation && (
              <p className="mt-4 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                {q.explanation}
              </p>
            )}

            {selected !== null && (
              <Button onClick={handleNext} className="mt-4 w-full font-bold">
                {current + 1 >= questions.length ? "শেষ করুন" : "পরবর্তী প্রশ্ন"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Result screen ---
  if (finished) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-[500px] flex-col items-center justify-center gap-3 px-4 text-center">
        <Zap className="h-10 w-10 text-violet-500" />
        <p className="text-xl font-extrabold">Quick Practice শেষ!</p>
        <p className="text-lg font-bold text-violet-600">
          {score} / {questions.length} সঠিক
        </p>
        <div className="mt-2 flex gap-3">
          <Button variant="outline" onClick={reset}>
            আবার শুরু করুন
          </Button>
          <Button onClick={() => navigate("/dashboard")}>ড্যাশবোর্ডে যান</Button>
        </div>
      </div>
    );
  }

  // --- Selection screen ---
  return (
    <div className="mx-auto w-full max-w-[600px] px-4 py-6">
      <button
        onClick={() => (subjectId ? (chapterId ? setChapterId(null) : setSubjectId(null)) : navigate(-1))}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> ফিরে যান
      </button>

      <div className="mb-6 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500">
          <Zap className="h-5 w-5 text-white" />
        </div>
        <h1 className="text-xl font-extrabold">Quick Practice</h1>
      </div>

      {!subjectId && (
        <div className="space-y-2">
          {subjectsLoading && <p className="text-sm text-muted-foreground">লোড হচ্ছে...</p>}
          {subjects?.length === 0 && (
            <p className="text-sm text-muted-foreground">এখনো কোনো বিষয় যোগ করা হয়নি।</p>
          )}
          {subjects?.map((s) => (
            <button
              key={s.id}
              onClick={() => setSubjectId(s.id)}
              className="flex w-full items-center justify-between rounded-xl border p-3.5 text-left font-semibold hover:border-violet-400"
            >
              {s.name}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      {subjectId && !chapterId && (
        <div className="space-y-2">
          {chapters?.length === 0 && (
            <p className="text-sm text-muted-foreground">এই বিষয়ে এখনো কোনো অধ্যায় নেই।</p>
          )}
          {chapters?.map((c) => (
            <button
              key={c.id}
              onClick={() => setChapterId(c.id)}
              className="flex w-full items-center justify-between rounded-xl border p-3.5 text-left font-semibold hover:border-violet-400"
            >
              {c.name}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      {chapterId && (
        <div className="space-y-2">
          <button
            onClick={() => startPractice(null)}
            className="flex w-full items-center justify-between rounded-xl border border-violet-300 bg-violet-50 p-3.5 text-left font-bold text-violet-700 hover:border-violet-500 dark:bg-violet-950/30 dark:text-violet-300"
          >
            পুরো অধ্যায় থেকে Practice করুন
            <Zap className="h-4 w-4" />
          </button>

          {topics && topics.length > 0 && (
            <>
              <p className="pt-2 text-xs font-bold text-muted-foreground">অথবা টপিক বাছাই করুন</p>
              {topics.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTopicId(t.id);
                    startPractice(t.id);
                  }}
                  className="flex w-full items-center justify-between rounded-xl border p-3.5 text-left font-semibold hover:border-violet-400"
                >
                  {t.name}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default QuickPractice;
