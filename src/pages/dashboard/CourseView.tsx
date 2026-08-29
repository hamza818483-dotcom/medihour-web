import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { setExamSourceList } from "@/lib/examSourceTracker";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEnrollments } from "@/hooks/useEnrollments";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, BookOpen, Video, FileText, FolderOpen, Layers, ChevronRight, Clock, Trophy, Archive, LayoutTemplate } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CourseItemsManagerDialog } from "@/components/admin/CourseItemsManagerDialog";
import { ChapterSortDialog } from "@/components/admin/ChapterSortDialog";

const SECTION_LABELS: Record<string, string> = {
    record: "Record Class",
    "archive-class": "Archive Class",
    practice: "Past Exams",
    readymade: "Readymade Exam",
};

const CourseView = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { data: enrollments } = useEnrollments();
  const { isAdmin } = useAuth();

  const [selectedCategory, setSelectedCategory] = useState<"class" | "exam">("class");
  const [selectedSection, setSelectedSection] = useState<string>("record"); // record/archive-class | practice/readymade
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [manageType, setManageType] = useState<"classes" | "exams" | null>(null);
  const [manageChapters, setManageChapters] = useState(false);

  const handleCategoryChange = (cat: "class" | "exam") => {
      setSelectedCategory(cat);
      setSelectedSection(cat === "class" ? "record" : "practice");
      setSelectedSubject(null);
      setSelectedChapter(null);
  };

  const handleSectionChange = (section: string) => {
      setSelectedSection(section);
      setSelectedSubject(null);
      setSelectedChapter(null);
  };

  const enrollment = enrollments?.find((e: any) => e.course_id === courseId);
  // Course-level "Full Access" toggle for readymade exams (mirrors the
  // Readymade Access Manager toggle) -- when on, every published readymade
  // exam should be visible here, not just ones directly linked to this course.
  const readymadeFullAccess = !!enrollment?.course?.readymade_full_access;

  // Per subject/chapter grants (course_readymade_access, mode='readymade')
  // given to this specific course via the admin's Readymade Access Manager
  // sub-chapter checkboxes. These exams aren't linked to the course via
  // course_id/shared_course_ids/readymade_course_ids at all, so without this
  // they never show up in this tab even though the student can access them
  // from the main Readymade Exam page.
  const { data: courseReadymadeGrants } = useQuery({
    queryKey: ["course-view-readymade-grants", courseId],
    queryFn: async () => {
      if (!courseId) return [] as { subject: string; chapter: string }[];
      const { data, error } = await supabase
        .from("course_readymade_access")
        .select("subject, chapter")
        .eq("course_id", courseId)
        .eq("mode", "readymade");
      if (error) throw error;
      return (data || []) as { subject: string; chapter: string }[];
    },
    enabled: !!courseId,
  });
  const grantedSubjects = Array.from(new Set((courseReadymadeGrants || []).map(g => g.subject)));
  const grantedChaptersBySubject: Record<string, string[]> = {};
  (courseReadymadeGrants || []).forEach(g => {
    if (!grantedChaptersBySubject[g.subject]) grantedChaptersBySubject[g.subject] = [];
    grantedChaptersBySubject[g.subject].push(g.chapter);
  });

  useEffect(() => {
    if (enrollment?.course?.name) {
        document.title = `${enrollment.course.name} – Atlas`;
    }
  }, [enrollment]);

  // Build the base query for a given section (which table/filter to pull subjects/chapters from)
  const sectionTable = (section: string | null) => {
      if (section === "record") return { table: "classes" as const, archive: false };
      if (section === "archive-class") return { table: "classes" as const, archive: true };
      if (section === "practice") return { table: "exams" as const, archive: false, readymade: false };
      if (section === "readymade") return { table: "exams" as const, archive: false, readymade: true };
      return null;
  };

  // 1. Subjects (scoped to selected category+section)
  const { data: subjects, isLoading: loadingSubjects } = useQuery({
    queryKey: ["course-subjects", courseId, selectedSection, readymadeFullAccess, grantedSubjects.join(',')],
    queryFn: async () => {
      if (!courseId || !selectedSection) return [];
      const cfg = sectionTable(selectedSection);
      if (!cfg) return [];

      let query;
      if (cfg.table === "classes") {
          query = supabase.from("classes").select("subject")
              .or(cfg.archive
                  ? `archive_course_ids.cs.{${courseId}},and(course_id.eq.${courseId},is_archive.eq.true)`
                  : `course_id.eq.${courseId},shared_course_ids.ov.{${courseId}}`);
          if (!cfg.archive) query = query.not("is_archive", "is", true);
      } else if (cfg.readymade && readymadeFullAccess) {
          // Full-access toggle is on: every published readymade exam's
          // subject is relevant here, not just ones linked to this course.
          query = supabase.from("exams").select("subject")
              .eq("is_published", true)
              .eq("is_readymade", true);
      } else {
          query = supabase.from("exams").select("subject")
              .or(`course_id.eq.${courseId},shared_course_ids.ov.{${courseId}},readymade_course_ids.ov.{${courseId}}`)
              .eq("is_published", true)
              .eq("is_readymade", cfg.readymade);
          if (!cfg.readymade) query = query.not("is_archive", "is", true);
      }

      const { data } = await query;
      const unique = new Set<string>();
      data?.forEach((row: any) => {
          if (Array.isArray(row.subject)) row.subject.forEach((s: string) => unique.add(s));
          else if (typeof row.subject === 'string') unique.add(row.subject);
      });
      // Also fold in any subjects granted via course_readymade_access (chapter
      // grants) even if no directly-linked exam exists for them.
      if (cfg.readymade) grantedSubjects.forEach(s => unique.add(s));

      const { data: settingsData } = await supabase.from("app_settings").select("value").eq("key", "subject_order_global").maybeSingle();
      const savedOrder: string[] = settingsData?.value ? (settingsData.value as string[]) : [];

      return Array.from(unique).sort((a, b) => {
          const idxA = savedOrder.indexOf(a);
          const idxB = savedOrder.indexOf(b);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          return a.localeCompare(b);
      });
    },
    enabled: !!courseId && !!selectedSection
  });

  // 2. Chapters (scoped to selected category+section+subject)
  const { data: chapters, isLoading: loadingChapters } = useQuery({
    queryKey: ["course-chapters", courseId, selectedSection, selectedSubject, readymadeFullAccess, (grantedChaptersBySubject[selectedSubject || ""] || []).join(',')],
    queryFn: async () => {
      if (!courseId || !selectedSection || !selectedSubject) return [];
      const cfg = sectionTable(selectedSection);
      if (!cfg) return [];

      let query;
      if (cfg.table === "classes") {
          query = supabase.from("classes").select("chapter, sort_order")
              .or(cfg.archive
                  ? `archive_course_ids.cs.{${courseId}},and(course_id.eq.${courseId},is_archive.eq.true)`
                  : `course_id.eq.${courseId},shared_course_ids.ov.{${courseId}}`)
              .contains("subject", [selectedSubject]);
          if (!cfg.archive) query = query.not("is_archive", "is", true);
      } else if (cfg.readymade && readymadeFullAccess) {
          query = supabase.from("exams").select("chapter, sort_order")
              .contains("subject", [selectedSubject])
              .eq("is_published", true)
              .eq("is_readymade", true);
      } else {
          query = supabase.from("exams").select("chapter, sort_order")
              .or(`course_id.eq.${courseId},shared_course_ids.ov.{${courseId}},readymade_course_ids.ov.{${courseId}}`)
              .contains("subject", [selectedSubject])
              .eq("is_published", true)
              .eq("is_readymade", cfg.readymade);
          if (!cfg.readymade) query = query.not("is_archive", "is", true);
      }

      const { data } = await query;

      const settingsKey = `chapter_order_global_${selectedSubject}`;
      const { data: settingsData } = await supabase.from("app_settings").select("value").eq("key", settingsKey).maybeSingle();

      const unique = new Set<string>();
      const orderMap = new Map<string, number>();
      const savedOrder: string[] = settingsData?.value ? (settingsData.value as string[]) : [];

      data?.forEach((row: any) => {
          if (row.chapter) {
              unique.add(row.chapter);
              const currentMax = orderMap.get(row.chapter) || 0;
              const itemOrder = row.sort_order || 0;
              if (itemOrder > currentMax) orderMap.set(row.chapter, itemOrder);
          }
      });
      // Fold in chapters granted via course_readymade_access for this subject,
      // even when no directly-linked exam exists for them.
      if (cfg.readymade) (grantedChaptersBySubject[selectedSubject] || []).forEach(c => unique.add(c));

      return Array.from(unique).sort((a, b) => {
          const idxA = savedOrder.indexOf(a);
          const idxB = savedOrder.indexOf(b);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          const orderA = orderMap.get(a) || 0;
          const orderB = orderMap.get(b) || 0;
          if (orderA !== orderB) return orderB - orderA;
          return a.localeCompare(b);
      });
    },
    enabled: !!courseId && !!selectedSection && !!selectedSubject
  });

  if (!enrollment && enrollments) {
      return (
          <div className="p-8 text-center">
              <h2 className="text-xl font-bold text-destructive">Access Denied</h2>
              <p>You are not enrolled in this course.</p>
              <Button className="mt-4" onClick={() => navigate("/dashboard/my-courses")}>My Courses</Button>
          </div>
      );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => {
              if (selectedChapter) setSelectedChapter(null);
              else if (selectedSubject) setSelectedSubject(null);
              else navigate("/dashboard/my-courses");
          }}>
              <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
                {selectedChapter || selectedSubject || enrollment?.course?.name || "Course View"}
            </h1>
            {selectedSubject && (
                <p className="text-xs text-muted-foreground">
                    {enrollment?.course?.name} &gt; {selectedCategory === "class" ? "Class" : "Exam"} &gt; {SECTION_LABELS[selectedSection]}
                    {selectedChapter ? ` > ${selectedSubject}` : ""}
                </p>
            )}
          </div>
      </div>

      {/* Category row: Class / Exam */}
      <Tabs value={selectedCategory} onValueChange={(v) => handleCategoryChange(v as "class" | "exam")} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="class" className="gap-2"><Video className="h-4 w-4" /> Class</TabsTrigger>
              <TabsTrigger value="exam" className="gap-2"><Trophy className="h-4 w-4" /> Exam</TabsTrigger>
          </TabsList>
      </Tabs>

      {/* Sub-section dropdown */}
      <Select value={selectedSection} onValueChange={handleSectionChange}>
          <SelectTrigger className="w-full sm:w-64">
              <SelectValue />
          </SelectTrigger>
          <SelectContent>
              {selectedCategory === "class" ? (
                  <>
                      <SelectItem value="record">Record Class</SelectItem>
                      <SelectItem value="archive-class">Archive Class</SelectItem>
                  </>
              ) : (
                  <>
                      <SelectItem value="practice">Past Exams</SelectItem>
                      <SelectItem value="readymade">Readymade Exam</SelectItem>
                  </>
              )}
          </SelectContent>
      </Select>

      {isAdmin && selectedChapter && (
          <div className="flex gap-2 mb-4 bg-muted/30 p-3 rounded-lg border">
              <div className="text-sm font-medium mr-auto self-center">Admin Controls:</div>
              <Button variant="outline" size="sm" onClick={() => setManageType("classes")}>Manage Classes Order</Button>
              <Button variant="outline" size="sm" onClick={() => setManageType("exams")}>Manage Exams Order</Button>
          </div>
      )}

      {isAdmin && !selectedChapter && selectedSubject && chapters && chapters.length > 0 && (
          <div className="flex gap-2 mb-4 bg-muted/30 p-3 rounded-lg border">
              <div className="text-sm font-medium mr-auto self-center">Admin Controls:</div>
              <Button variant="outline" size="sm" onClick={() => setManageChapters(true)}>Manage Chapters Order</Button>
          </div>
      )}

      {manageType ? (
        <CourseItemsManagerDialog
          courseId={courseId!}
          courseName={enrollment?.course?.name || "Course"}
          subjectFilter={selectedSubject}
          chapterFilter={selectedChapter}
          resourceType={manageType}
          onClose={() => setManageType(null)}
        />
      ) : manageChapters ? (
        <ChapterSortDialog
          courseId={courseId!}
          subject={selectedSubject!}
          chapters={chapters || []}
          contextName={enrollment?.course?.name || "Course"}
          onClose={() => setManageChapters(false)}
        />
      ) : (
          <>
          {!selectedSubject ? (
              <div className="space-y-4">
                  <h2 className="text-lg font-semibold">Subjects</h2>
                  {loadingSubjects ? <div className="text-muted-foreground">Loading...</div> : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                          {subjects?.map(sub => (
                              <Card key={sub} className="cursor-pointer hover:border-primary/50 transition-all" onClick={() => setSelectedSubject(sub)}>
                                  <CardHeader className="flex flex-row items-center gap-4">
                                      <div className="p-3 bg-primary/10 rounded-full text-primary">
                                          <BookOpen className="h-6 w-6" />
                                      </div>
                                      <CardTitle className="text-base">{sub}</CardTitle>
                                  </CardHeader>
                              </Card>
                          ))}
                          {subjects?.length === 0 && <p className="text-muted-foreground">No content found.</p>}
                      </div>
                  )}
              </div>
          ) : !selectedChapter ? (
              <div className="space-y-4">
                  <h2 className="text-lg font-semibold">Chapters in {selectedSubject}</h2>
                  {loadingChapters ? <div className="text-muted-foreground">Loading...</div> : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {chapters?.map(chap => (
                              <Card key={chap} className="cursor-pointer hover:border-primary/50 transition-all" onClick={() => setSelectedChapter(chap)}>
                                  <CardHeader className="flex flex-row items-center justify-between">
                                      <CardTitle className="text-base">{chap}</CardTitle>
                                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  </CardHeader>
                              </Card>
                          ))}
                          {chapters?.length === 0 && <p className="text-muted-foreground">No chapters found.</p>}
                      </div>
                  )}
              </div>
          ) : (
              <CourseSectionContent courseId={courseId!} section={selectedSection} subject={selectedSubject} chapter={selectedChapter} readymadeFullAccess={readymadeFullAccess} />
          )}
          </>
      )}
    </div>
  );
};

const CourseSectionContent = ({ courseId, section, subject, chapter, readymadeFullAccess }: { courseId: string, section: string, subject: string, chapter: string, readymadeFullAccess?: boolean }) => {
    if (section === "record") return <ClassList courseId={courseId} subject={subject} chapter={chapter} />;
    if (section === "archive-class") return <ArchiveClassList courseId={courseId} subject={subject} chapter={chapter} />;
    if (section === "practice") return <ExamList courseId={courseId} subject={subject} chapter={chapter} />;
    if (section === "readymade") return <ReadymadeExamList courseId={courseId} subject={subject} chapter={chapter} readymadeFullAccess={readymadeFullAccess} />;
    return null;
}

const ClassList = ({ courseId, subject, chapter }: any) => {
    const navigate = useNavigate();
    const { data: classes, isLoading } = useQuery({
        queryKey: ["course-classes", courseId, subject, chapter],
        queryFn: async () => {
            const { data } = await supabase
                .from("classes")
                .select("*")
                .or(`course_id.eq.${courseId},shared_course_ids.ov.{${courseId}}`)
                .not("is_archive", "is", true)
                .contains("subject", [subject])
                .eq("chapter", chapter)
                .order("sort_order", { ascending: false })
                .order("start_at", { ascending: false });
            return data || [];
        }
    });

    if (isLoading) return <div>Loading...</div>;
    if (!classes || classes.length === 0) return <div>No recordings found.</div>;

    return (
        <div className="grid gap-4 md:grid-cols-2">
            {classes.map((cls: any) => (
                <Card key={cls.id} className="flex flex-col">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm leading-snug">{cls.title}</CardTitle>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <Clock className="h-3 w-3" />
                            {cls.start_at && new Date(cls.start_at).toLocaleDateString()}
                        </div>
                    </CardHeader>
                    <CardFooter className="mt-auto pt-4">
                        <Button size="sm" className="w-full" onClick={() => navigate(`/dashboard/class/${cls.id}`)}>
                            Watch Class
                        </Button>
                    </CardFooter>
                </Card>
            ))}
        </div>
    );
}

const ExamList = ({ courseId, subject, chapter }: any) => {
    const navigate = useNavigate();
    const { data: exams, isLoading } = useQuery({
        queryKey: ["course-exams", courseId, subject, chapter],
        queryFn: async () => {
            const { data } = await supabase
                .from("exams")
                .select("*")
                .or(`course_id.eq.${courseId},shared_course_ids.ov.{${courseId}}`)
                .not("is_archive", "is", true)
                .contains("subject", [subject])
                .eq("chapter", chapter)
                .eq("is_published", true)
                .not("is_readymade", "is", true) // Exclude readymade
                .order("created_at", { ascending: false });
            return data || [];
        }
    });

    if (isLoading) return <div>Loading...</div>;
    if (!exams || exams.length === 0) return <div>No exams found.</div>;

    return (
        <div className="grid gap-4 md:grid-cols-2">
            {exams.map((exam: any) => (
                <Card key={exam.id} className="flex flex-col">
                    <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                            <CardTitle className="text-sm leading-snug">{exam.title}</CardTitle>
                            {exam.exam_type === 'live' && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded font-bold">LIVE</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {exam.duration_minutes} mins • {exam.total_marks || '?'} marks
                        </div>
                    </CardHeader>
                    <CardFooter className="mt-auto pt-4">
                        <Button size="sm" className="w-full" onClick={() => { setExamSourceList(exam.id, window.location.pathname); navigate(`/dashboard/take-exam/${exam.id}`); }}>
                            Start Exam
                        </Button>
                    </CardFooter>
                </Card>
            ))}
        </div>
    );
}

const ReadymadeExamList = ({ courseId, subject, chapter, readymadeFullAccess }: any) => {
    const navigate = useNavigate();
    const { data: hasChapterGrant } = useQuery({
        queryKey: ["course-readymade-chapter-grant", courseId, subject, chapter],
        queryFn: async () => {
            if (readymadeFullAccess) return true; // full access already covers everything
            const { data, error } = await supabase
                .from("course_readymade_access")
                .select("course_id")
                .eq("course_id", courseId)
                .eq("mode", "readymade")
                .eq("subject", subject)
                .eq("chapter", chapter)
                .limit(1);
            if (error) throw error;
            return (data || []).length > 0;
        },
        enabled: !!courseId && !!subject && !!chapter,
    });

    const { data: exams, isLoading } = useQuery({
        queryKey: ["course-readymade-exams", courseId, subject, chapter, readymadeFullAccess, hasChapterGrant],
        queryFn: async () => {
            let query = supabase
                .from("exams")
                .select("*")
                .contains("subject", [subject])
                .eq("chapter", chapter)
                .eq("is_published", true)
                .eq("is_readymade", true)
                .order("created_at", { ascending: false });
            // Full-access toggle or a chapter-level grant unlocks EVERY exam in
            // this subject/chapter, not just ones directly linked to the course.
            if (!readymadeFullAccess && !hasChapterGrant) {
                query = query.or(`course_id.eq.${courseId},shared_course_ids.ov.{${courseId}},readymade_course_ids.ov.{${courseId}}`);
            }
            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        },
        enabled: hasChapterGrant !== undefined
    });

    if (isLoading) return <div>Loading...</div>;
    if (!exams || exams.length === 0) return <div>No readymade exams found.</div>;

    return (
        <div className="grid gap-4 md:grid-cols-2">
            {exams.map((exam: any) => (
                <Card key={exam.id} className="flex flex-col border-blue-100 bg-blue-50/20">
                    <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                            <CardTitle className="text-sm leading-snug">{exam.title}</CardTitle>
                            <Badge variant="outline" className="text-[10px] border-blue-200 text-blue-600">Readymade</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {exam.duration_minutes} mins • {exam.total_marks || '?'} marks
                        </div>
                    </CardHeader>
                    <CardFooter className="mt-auto pt-4">
                        <Button size="sm" className="w-full" onClick={() => { setExamSourceList(exam.id, window.location.pathname); navigate(`/dashboard/take-exam/${exam.id}`); }}>
                            Start Exam
                        </Button>
                    </CardFooter>
                </Card>
            ))}
        </div>
    );
}

const ArchiveClassList = ({ courseId, subject, chapter }: any) => {
    const navigate = useNavigate();
    const { data: classes, isLoading } = useQuery({
        queryKey: ["course-archive-classes", courseId, subject, chapter],
        queryFn: async () => {
            const { data } = await supabase
                .from("classes")
                .select("*")
                .or(`archive_course_ids.cs.{${courseId}},and(course_id.eq.${courseId},is_archive.eq.true)`)
                .contains("subject", [subject])
                .eq("chapter", chapter)
                .order("sort_order", { ascending: false })
                .order("start_at", { ascending: false });
            return data || [];
        }
    });

    if (isLoading) return <div>Loading...</div>;
    if (!classes || classes.length === 0) return <div>No archive classes found.</div>;

    return (
        <div className="grid gap-4 md:grid-cols-2">
            {classes.map((cls: any) => (
                <Card key={cls.id} className="flex flex-col border-emerald-100 bg-emerald-50/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm leading-snug">{cls.title}</CardTitle>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                             <Badge variant="outline" className="text-[10px]">Archive</Badge>
                             <Clock className="h-3 w-3" />
                             {cls.start_at && new Date(cls.start_at).toLocaleDateString()}
                        </div>
                    </CardHeader>
                    <CardFooter className="mt-auto pt-4">
                        <Button size="sm" className="w-full" onClick={() => navigate(`/dashboard/class/${cls.id}`)}>
                            Watch Class
                        </Button>
                    </CardFooter>
                </Card>
            ))}
        </div>
    );
}

const ArchiveExamList = ({ courseId, subject, chapter }: any) => {
    const navigate = useNavigate();
    const { data: exams, isLoading } = useQuery({
        queryKey: ["course-archive-exams", courseId, subject, chapter],
        queryFn: async () => {
            const { data } = await supabase
                .from("exams")
                .select("*")
                .or(`archive_course_ids.cs.{${courseId}},and(course_id.eq.${courseId},is_archive.eq.true)`)
                .contains("subject", [subject])
                .eq("chapter", chapter)
                .eq("is_published", true)
                .order("created_at", { ascending: false });
            return data || [];
        }
    });

    if (isLoading) return <div>Loading...</div>;
    if (!exams || exams.length === 0) return <div>No archive exams found.</div>;

    return (
        <div className="grid gap-4 md:grid-cols-2">
            {exams.map((exam: any) => (
                <Card key={exam.id} className="flex flex-col border-emerald-100 bg-emerald-50/20">
                    <CardHeader className="pb-2">
                         <div className="flex justify-between items-start">
                            <CardTitle className="text-sm leading-snug">{exam.title}</CardTitle>
                            <Badge variant="outline" className="text-[10px]">Archive</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {exam.duration_minutes} mins
                        </div>
                    </CardHeader>
                    <CardFooter className="mt-auto pt-4">
                        <Button size="sm" className="w-full" onClick={() => { setExamSourceList(exam.id, window.location.pathname); navigate(`/dashboard/take-exam/${exam.id}`); }}>
                            Start Exam
                        </Button>
                    </CardFooter>
                </Card>
            ))}
        </div>
    );
}

export default CourseView;
