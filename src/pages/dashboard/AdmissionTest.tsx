import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, FileText, LayoutGrid, ChevronRight, Loader2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type Category = "medical" | "varsity";
type Mode = "subject_final" | "paper_final" | "full_model";

const CATEGORY_LABEL: Record<Category, string> = {
  medical: "মেডিকেল এডমিশন টেস্ট",
  varsity: "ভার্সিটি এডমিশন টেস্ট",
};

function SubjectOrPaperList({ testId, mode }: { testId: string; mode: "subject_final" | "paper_final" }) {
  const navigate = useNavigate();
  const table = mode === "subject_final" ? "admission_test_subjects" : "admission_test_papers";
  const nameField = mode === "subject_final" ? "subject_name" : "paper_name";

  const { data: rows, isLoading } = useQuery({
    queryKey: [table, testId],
    queryFn: async () => {
      // @ts-expect-error dynamic table
      const { data, error } = await supabase.from(table).select("*").eq("admission_test_id", testId).eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!rows || rows.length === 0) return <p className="text-sm text-muted-foreground text-center py-8">এখনো কিছু যোগ করা হয়নি</p>;

  return (
    <div className="space-y-2">
      {rows.map((r: any) => (
        <Card key={r.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => navigate(`/dashboard/admission-test/play?mode=${mode}&refId=${r.id}&testId=${testId}`)}>
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{r[nameField]}</p>
              <div className="flex gap-1.5 mt-1">
                <Badge variant="secondary" className="text-[10px]">{r.marks} Marks</Badge>
                <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px]">{r.question_count} MCQ</Badge>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FullModelCard({ testId, test }: { testId: string; test: any }) {
  const navigate = useNavigate();
  const { data: slices } = useQuery({
    queryKey: ["admission_test_full_model_slices", testId],
    queryFn: async () => {
      const { data, error } = await supabase.from("admission_test_full_model_slices" as any).select("*").eq("admission_test_id", testId).eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });

  const totalMarks = (slices || []).reduce((s: number, r: any) => s + Number(r.marks || 0), 0);
  const totalQ = (slices || []).reduce((s: number, r: any) => s + Number(r.question_count || 0), 0);

  if (!slices || slices.length === 0) return <p className="text-sm text-muted-foreground text-center py-8">এখনো কিছু যোগ করা হয়নি</p>;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">Full Model Test</p>
            <p className="text-xs text-muted-foreground">{test.duration_minutes} মিনিট</p>
          </div>
          <div className="flex gap-1.5">
            <Badge variant="secondary">{totalMarks} Marks</Badge>
            <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400">{totalQ} MCQ</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {slices.map((s: any) => (
            <Badge key={s.id} variant="outline" className="text-[10px]">{s.subject_name}: {s.marks}</Badge>
          ))}
        </div>
        <Button className="w-full" onClick={() => navigate(`/dashboard/admission-test/play?mode=full_model&testId=${testId}`)}>
          Start Full Model Test
        </Button>
      </CardContent>
    </Card>
  );
}

function TestBlock({ test, lockedMode }: { test: any; lockedMode?: Mode }) {
  // When the user arrived via a specific "মডেল টেস্ট বানাও" mode button, show
  // ONLY that mode's content — no tabs, no other mode's data.
  if (lockedMode) {
    return (
      <div className="space-y-3">
        <h2 className="font-semibold text-base flex items-center gap-2"><BookOpen className="h-4 w-4" />{test.title}</h2>
        {lockedMode === "full_model" ? (
          <FullModelCard testId={test.id} test={test} />
        ) : (
          <SubjectOrPaperList testId={test.id} mode={lockedMode} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-base flex items-center gap-2"><BookOpen className="h-4 w-4" />{test.title}</h2>
      <Tabs defaultValue="subject_final">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="subject_final" className="text-xs">Subject Final</TabsTrigger>
          <TabsTrigger value="paper_final" className="text-xs">Paper Final</TabsTrigger>
          <TabsTrigger value="full_model" className="text-xs">Full Model</TabsTrigger>
        </TabsList>
        <TabsContent value="subject_final" className="mt-3"><SubjectOrPaperList testId={test.id} mode="subject_final" /></TabsContent>
        <TabsContent value="paper_final" className="mt-3"><SubjectOrPaperList testId={test.id} mode="paper_final" /></TabsContent>
        <TabsContent value="full_model" className="mt-3"><FullModelCard testId={test.id} test={test} /></TabsContent>
      </Tabs>
    </div>
  );
}

export default function AdmissionTest() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialCategory = (params.get("category") as Category) || "medical";
  const [category, setCategory] = useState<Category>(initialCategory);
  const lockedMode = (params.get("mode") as Mode) || undefined;

  const { data: tests, isLoading } = useQuery({
    queryKey: ["admission-tests-public", category],
    queryFn: async () => {
      const { data, error } = await supabase.from("admission_tests" as any).select("*").eq("category", category).eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-lg font-semibold">Admission Test</h1>
      </div>

      <Tabs value={category} onValueChange={(v) => setCategory(v as Category)}>
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="medical">{CATEGORY_LABEL.medical}</TabsTrigger>
          <TabsTrigger value="varsity">{CATEGORY_LABEL.varsity}</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : !tests || tests.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">এখনো কোনো টেস্ট যোগ করা হয়নি</p>
      ) : (
        <div className="space-y-6">
          {tests.map((t: any) => <TestBlock key={t.id} test={t} lockedMode={lockedMode} />)}
        </div>
      )}
    </div>
  );
}
