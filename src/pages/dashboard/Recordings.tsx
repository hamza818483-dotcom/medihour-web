import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEnrollments } from "@/hooks/useEnrollments";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SUBJECTS } from "@/lib/constants";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const Recordings = () => {
  const [selectedCourse, setSelectedCourse] = useState<string>("all");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<string>("recent");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const { data: enrollments } = useEnrollments();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Recordings – Atlas";
  }, []);

  const { data: classes, isLoading } = useQuery({
    queryKey: ["recordings-list", selectedCourse, selectedSubject, sortOrder],
    queryFn: async () => {
      const now = new Date().toISOString();
      let query = supabase
        .from("classes")
        .select("*, course:courses(*)")
        .or(`class_type.eq.recorded,and(class_type.eq.live,end_at.lt.${now})`)
        .not("is_archive", "is", true);

      if (sortOrder === "recent") {
        query = query.order("start_at", { ascending: false });
      } else if (sortOrder === "old") {
        query = query.order("start_at", { ascending: true });
      } else {
        query = query.order("sort_order", { ascending: false }).order("start_at", { ascending: false });
      }

      if (selectedCourse !== "all") {
        // Match course_id directly OR check shared_course_ids
        query = query.or(`course_id.eq.${selectedCourse},shared_course_ids.cs.{${selectedCourse}}`);
      }

      if (selectedSubject !== "all") {
        query = query.contains("subject", [selectedSubject]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Client-side filtering as fallback/refinement
  const enrolledCourseIds = enrollments?.map(e => e.course_id) || [];

  const filteredClasses = classes?.filter(c => {
      // If course is selected, trust the server filter
      if (selectedCourse !== "all") return true;

      // Otherwise, ensure the user has access
      // Case 1: Primary Course Enrollment
      if (enrolledCourseIds.includes(c.course_id)) return true;

      // Case 2: Public Content - Removed to ensure only enrolled content shows
      // if (!c.course_id) return true;

      // Case 3: Shared Access
      // @ts-ignore
      if (c.shared_course_ids && Array.isArray(c.shared_course_ids)) {
          // @ts-ignore
          if (c.shared_course_ids.some((id: string) => enrolledCourseIds.includes(id))) return true;
      }

      return false;
  }) || [];

  const searchedClasses = searchQuery.trim()
    ? filteredClasses.filter(c => c.title?.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : filteredClasses;

  return (
    <div className="space-y-3">
      <header className="space-y-0.5">
        <h1 className="text-xl font-semibold tracking-tight">Record Class</h1>
        <p className="text-xs text-muted-foreground">Watch recordings of previous sessions.</p>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search classes by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-10"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Select value={selectedCourse} onValueChange={setSelectedCourse}>
          <SelectTrigger className="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Courses</SelectItem>
            {enrollments?.map((enrollment) => (
              <SelectItem key={enrollment.course_id} value={enrollment.course_id}>
                {enrollment.course.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortOrder} onValueChange={setSortOrder}>
          <SelectTrigger className="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default Order</SelectItem>
            <SelectItem value="recent">Recent to Old</SelectItem>
            <SelectItem value="old">Old to Recent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Subject category quick-filter: 2 per row, "All Subjects" first */}
      <div className="grid grid-cols-2 gap-2">
        {["all", ...SUBJECTS].map((s) => (
          <button
            key={s}
            onClick={() => setSelectedSubject(s)}
            className={cn(
              "h-10 rounded-lg border-2 px-2 text-xs font-semibold truncate transition-colors",
              selectedSubject === s
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40"
            )}
          >
            {s === "all" ? "All Subjects" : s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : searchedClasses.length === 0 ? (
        <Card className="border border-foreground/50">
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No recorded classes available for this course yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {searchedClasses.map((classItem: any) => (
            <Card key={classItem.id} className="border border-emerald-100 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900 rounded-2xl shadow-md hover:shadow-lg transition-all flex flex-col h-full">
              <CardHeader className="space-y-1">
                <div className="flex justify-between items-start gap-2">
                    <p className="text-xs font-mono uppercase text-muted-foreground">
                        {classItem.course?.name || "Public/Archive"}
                    </p>
                    {Array.isArray(classItem.subject) && (
                        <div className="flex flex-wrap gap-1 justify-end">
                            {classItem.subject.map((s: string) => (
                                <span key={s} className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-colors border-emerald-200 bg-emerald-100/50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-100 dark:border-emerald-800">
                                    {s}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                <CardTitle className="text-base">{classItem.title}</CardTitle>
                <CardDescription className="text-xs">
                  {classItem.start_at && new Date(classItem.start_at).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {classItem.topic && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{classItem.topic}</p>
                )}
                <div className="flex gap-2 flex-wrap mt-auto">
                    {classItem.video_url && (
                    <Button size="sm" className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700 border-none" onClick={() => navigate(`/dashboard/class/${classItem.id}`)}>
                        Class
                    </Button>
                    )}
                    {classItem.notes_url && (
                    <Button size="sm" className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700 border-none" asChild>
                        <a href={classItem.notes_url} target="_blank" rel="noopener noreferrer">
                        Note
                        </a>
                    </Button>
                    )}
                    {classItem.button_text && classItem.button_url && (
                    <Button size="sm" variant="outline" className="rounded-full border-emerald-200 text-emerald-700 hover:bg-emerald-50" asChild>
                        <a href={classItem.button_url} target="_blank" rel="noopener noreferrer">
                        {classItem.button_text}
                        </a>
                    </Button>
                    )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Recordings;
