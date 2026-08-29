import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, TrendingUp, Presentation, FileText } from "lucide-react";

interface Props {
  studentId: string;
  studentName: string;
}

export function StudentProgressDialog({ studentId, studentName }: Props) {
  const [open, setOpen] = React.useState(false);

  const { data: progressData, isLoading } = useQuery({
    queryKey: ["student-progress", studentId],
    queryFn: async () => {
      // 1. Fetch user's enrollments
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("course_id, courses(name)")
        .eq("profile_id", studentId);

      const courseIds = enrollments?.map(e => e.course_id) || [];
      if (courseIds.length === 0) return [];

      // 2. Fetch all exams belonging to these courses
      const { data: exams } = await supabase
        .from("exams")
        .select("id, course_id, title")
        .in("course_id", courseIds);

      // 3. Fetch all classes belonging to these courses
      const { data: classes } = await supabase
        .from("classes")
        .select("id, course_id")
        .in("course_id", courseIds);

      // 4. Fetch all exam attempts by this student
      const { data: attempts } = await supabase
        .from("exam_attempts")
        .select("exam_id, score")
        .eq("user_id", studentId);

      // Group by course
      const courseProgress = enrollments?.map(enrollment => {
        const courseExams = exams?.filter(e => e.course_id === enrollment.course_id) || [];
        const courseClasses = classes?.filter(c => c.course_id === enrollment.course_id) || [];
        
        const totalExams = courseExams.length;
        const totalClasses = courseClasses.length;
        
        const attemptedExams = Array.from(new Set(
            attempts?.filter(a => courseExams.some(ce => ce.id === a.exam_id)).map(a => a.exam_id)
        ));
        const completedExams = attemptedExams.length;
        
        // Let's assume progress is heavily weighted by exams since classes don't have a reliable viewed state yet
        // If there are no exams, but there are classes, just show 0% for now or calculate based on something else
        const progressPercentage = totalExams === 0 ? 0 : Math.round((completedExams / totalExams) * 100);

        return {
          courseId: enrollment.course_id,
          // @ts-ignore
          courseName: enrollment.courses?.name || "Unknown Course",
          totalExams,
          totalClasses,
          completedExams,
          progressPercentage
        };
      }) || [];

      return courseProgress;
    },
    enabled: open && !!studentId,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <TrendingUp className="h-4 w-4 mr-2" /> View Progress
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{studentName}'s Progress</DialogTitle>
          <DialogDescription>
            Detailed progress metrics across all purchased courses.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !progressData || progressData.length === 0 ? (
          <div className="text-center p-8 bg-muted/20 border rounded-lg text-muted-foreground">
            <TrendingUp className="h-8 w-8 mx-auto mb-3 opacity-20" />
            No active courses or progress data available.
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            {progressData.map((course) => (
              <div key={course.courseId} className="border p-5 rounded-lg bg-card shadow-sm hover:shadow-md transition-all">
                <div className="flex justify-between items-start mb-4">
                  <h4 className="font-semibold text-lg">{course.courseName}</h4>
                  <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-bold">
                    {course.progressPercentage}%
                  </div>
                </div>
                
                <Progress value={course.progressPercentage} className="h-2.5 mb-5" />
                
                <div className="grid grid-cols-2 gap-4">
                   <div className="flex items-center gap-3 bg-muted/30 p-3 rounded-md border">
                      <div className="p-2 bg-orange-500/10 rounded-md">
                         <FileText className="h-4 w-4 text-orange-500" />
                      </div>
                      <div>
                         <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Exams Taken</div>
                         <div className="font-medium text-sm">
                            {course.completedExams} of {course.totalExams} completed
                         </div>
                      </div>
                   </div>
                   
                   <div className="flex items-center gap-3 bg-muted/30 p-3 rounded-md border">
                      <div className="p-2 bg-blue-500/10 rounded-md">
                         <Presentation className="h-4 w-4 text-blue-500" />
                      </div>
                      <div>
                         <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Classes</div>
                         <div className="font-medium text-sm">
                            {course.totalClasses} total classes
                         </div>
                      </div>
                   </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
