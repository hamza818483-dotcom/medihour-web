import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, FileText, CheckCircle2 } from "lucide-react";

export default function StudentCourseResults() {
  const { studentId, courseId } = useParams();
  const navigate = useNavigate();

  const { data: profile } = useQuery({
    queryKey: ["admin-student-profile", studentId],
    queryFn: async () => {
      if (!studentId) return null;
      const { data, error } = await supabase.from("profiles").select("full_name").eq("id", studentId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!studentId,
  });

  const { data: course } = useQuery({
    queryKey: ["course-details", courseId],
    queryFn: async () => {
      if (!courseId) return null;
      const { data, error } = await supabase.from("courses").select("name").eq("id", courseId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });

  const { data: attempts, isLoading } = useQuery({
    queryKey: ["admin-student-course-attempts", studentId, courseId],
    queryFn: async () => {
      if (!studentId || !courseId) return [];
      
      // 1. Get exams for this course
      const { data: courseExams } = await supabase
        .from("exams")
        .select("id, title, exam_type")
        .or(`course_id.eq.${courseId},shared_course_ids.cs.{${courseId}}`);

      if (!courseExams || courseExams.length === 0) return [];
      const examIds = courseExams.map(e => e.id);

      // 2. Get attempts for these exams
      const { data: attemptData } = await supabase
        .from("exam_attempts")
        .select("id, exam_id, score, created_at, exams(title, total_marks, exam_type)")
        .eq("profile_id", studentId)
        .in("exam_id", examIds)
        .order("created_at", { ascending: false });

      return attemptData || [];
    },
    enabled: !!studentId && !!courseId,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-24 h-[60vh]">
        <Loader2 className="h-12 w-12 animate-spin text-primary opacity-50 mb-4" />
        <p className="text-muted-foreground">Loading exam history...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 w-full max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)} className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Exam History</h1>
            <p className="text-muted-foreground text-sm">
              {profile?.full_name}'s performance in <span className="text-primary font-medium">{course?.name}</span>
            </p>
          </div>
        </div>
      </div>

      <Card className="shadow-sm border-none bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            All Attempts
          </CardTitle>
          <CardDescription>
            Comprehensive list of all practice and live exam trials.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-muted-foreground uppercase text-[10px] font-bold">
                <tr>
                  <th className="px-4 py-3">Exam Title</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Score</th>
                  <th className="px-4 py-3 text-right">Percentage</th>
                  <th className="px-4 py-3 text-right">Date</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {attempts?.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground italic">
                      No attempts recorded for this course yet.
                    </td>
                  </tr>
                ) : (
                  attempts?.map((attempt: any) => {
                    const tm = attempt.exams?.total_marks || 1;
                    const percent = Math.round(((attempt.score || 0) / tm) * 100);
                    const examTitle = attempt.exams?.title || "Unknown Exam";
                    const examType = attempt.exams?.exam_type || "N/A";
                    
                    return (
                      <tr key={attempt.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{examTitle}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold ${examType === 'live' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                            {examType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-primary">{attempt.score}</td>
                        <td className="px-4 py-3 text-right">
                           <div className="flex items-center justify-end gap-2">
                              {percent}%
                              <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                                 <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
                              </div>
                           </div>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {format(new Date(attempt.created_at), 'PPp')}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            className="h-8"
                            onClick={() => navigate(`/dashboard/exam-review/${attempt.id}`)}
                          >
                            Review
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
