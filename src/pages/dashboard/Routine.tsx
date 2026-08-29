import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEnrollments } from "@/hooks/useEnrollments";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, FileImage, LayoutGrid, ChevronRight } from "lucide-react";
import MathText from "@/components/MathText";

const Routine = () => {
  const [view, setView] = useState<'courses' | 'list' | 'detail'>('courses');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);

  const { data: enrollments } = useEnrollments();

  const { data: courseRoutinesCount } = useQuery({
    queryKey: ["all-routines-count", enrollments?.map(e => e.course_id)],
    queryFn: async () => {
        if (!enrollments || enrollments.length === 0) return {};
        const courseIds = enrollments.map(e => e.course_id);
        const { data } = await supabase
            .from("routines")
            .select("course_id, course_ids")
            .or(`course_id.in.(${courseIds.join(',')}),course_ids.ov.{${courseIds.join(',')}}`);
        
        const counts: Record<string, number> = {};
        data?.forEach(r => {
            // Use a Set to avoid double counting same routine for same course
            const routineCourses = new Set([r.course_id, ...(r.course_ids || [])]);
            routineCourses.forEach(cid => {
                if (courseIds.includes(cid)) {
                    counts[cid] = (counts[cid] || 0) + 1;
                }
            });
        });
        return counts;
    },
    enabled: !!enrollments && enrollments.length > 0
  });

  useEffect(() => {
    document.title = "Routine – Atlas";
  }, []);

  // Back Handlers
  const handleBackToCourses = () => {
    setView('courses');
    setSelectedCourseId(null);
    setSelectedRoutineId(null);
  };

  const handleBackToList = () => {
    setView('list');
    setSelectedRoutineId(null);
  };

  // --- View 1: Course List ---
  if (view === 'courses') {
    return (
        <div className="space-y-6">
            <header className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">Routine & Schedule</h1>
                <p className="text-sm text-muted-foreground">Select a course to view its routine.</p>
            </header>

            {!enrollments || enrollments.length === 0 ? (
                 <div className="text-center py-12 text-muted-foreground">You are not enrolled in any courses.</div>
            ) : courseRoutinesCount && Object.keys(courseRoutinesCount).length === 0 ? (
                 <div className="text-center py-12 text-muted-foreground">No routines available for your enrolled courses yet.</div>
            ) : courseRoutinesCount ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {enrollments
                        .filter(enrollment => courseRoutinesCount[enrollment.course_id] > 0)
                        .map((enrollment) => (
                        <Card
                            key={enrollment.course_id}
                            className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-md group"
                            onClick={() => {
                                setSelectedCourseId(enrollment.course_id);
                                setView('list');
                            }}
                        >
                            <CardHeader className="pb-4">
                                <CardTitle className="text-lg group-hover:text-primary transition-colors">
                                    {enrollment.course.name}
                                </CardTitle>
                                <CardDescription>{courseRoutinesCount[enrollment.course_id]} Routine(s) available</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex justify-end">
                                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 text-muted-foreground">Loading routines...</div>
            )}
        </div>
    );
  }

  // --- View 2: Routine List for Course ---
  if (view === 'list' && selectedCourseId) {
      return <RoutineList courseId={selectedCourseId} onBack={handleBackToCourses} onSelect={(id) => {
          setSelectedRoutineId(id);
          setView('detail');
      }} />;
  }

  // --- View 3: Routine Detail ---
  if (view === 'detail' && selectedRoutineId) {
      return <RoutineDetail routineId={selectedRoutineId} onBack={handleBackToList} />;
  }

  return null;
};

// Sub-component: Routine List
const RoutineList = ({ courseId, onBack, onSelect }: { courseId: string, onBack: () => void, onSelect: (id: string) => void }) => {
    const { data: routines, isLoading } = useQuery({
        queryKey: ["routines-list", courseId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("routines")
                .select("id, title, created_at, media_urls")
                .or(`course_id.eq.${courseId},course_ids.cs.{${courseId}}`)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data || [];
        }
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onBack} className="pl-0 hover:bg-transparent">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Courses
                </Button>
            </div>

            <header className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">Published Routines</h1>
            </header>

            {isLoading ? (
                <div className="text-muted-foreground">Loading...</div>
            ) : routines.length === 0 ? (
                <div className="text-center py-12 border rounded-lg bg-muted/10 text-muted-foreground">
                    No routines published for this course yet.
                </div>
            ) : (
                <div className="space-y-4">
                    {routines.map((routine) => (
                        <Card
                            key={routine.id}
                            className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-sm"
                            onClick={() => onSelect(routine.id)}
                        >
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="p-2 bg-primary/10 rounded-full text-primary shrink-0">
                                    <Calendar className="h-6 w-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-lg truncate">{routine.title}</h3>
                                    <p className="text-xs text-muted-foreground">
                                        Posted on {new Date(routine.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                                {(routine.media_urls && routine.media_urls.length > 0) && (
                                     <div className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-full">
                                        <FileImage className="h-3 w-3" />
                                        {routine.media_urls.length} Pages
                                     </div>
                                )}
                                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};

// Sub-component: Routine Detail
const RoutineDetail = ({ routineId, onBack }: { routineId: string, onBack: () => void }) => {
    const { data: routine, isLoading } = useQuery({
        queryKey: ["routine-detail", routineId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("routines")
                .select("*")
                .eq("id", routineId)
                .single();
            if (error) throw error;
            return data;
        }
    });

    if (isLoading) return <div>Loading...</div>;
    if (!routine) return <div>Routine not found.</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onBack} className="pl-0 hover:bg-transparent">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to List
                </Button>
            </div>

            <article className="space-y-6 max-w-4xl mx-auto">
                <header className="space-y-2 border-b pb-4">
                    <h1 className="text-3xl font-bold">{routine.title}</h1>
                    <p className="text-sm text-muted-foreground">
                        Posted on {new Date(routine.created_at).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                </header>

                {routine.content && (
                    <div className="prose dark:prose-invert max-w-none bg-card p-6 rounded-xl border shadow-sm">
                        <MathText text={routine.content} />
                    </div>
                )}

                {routine.media_urls && routine.media_urls.length > 0 && (
                    <div className="space-y-8">
                        {routine.media_urls.map((url: string, idx: number) => (
                            <div key={idx} className="rounded-xl overflow-hidden border shadow-md bg-white">
                                <img src={url} alt={`Routine Page ${idx + 1}`} className="w-full h-auto" loading="lazy" />
                            </div>
                        ))}
                    </div>
                )}
            </article>
        </div>
    );
};

export default Routine;
