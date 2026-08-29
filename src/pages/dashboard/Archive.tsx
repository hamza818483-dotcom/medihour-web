import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEnrollments } from "@/hooks/useEnrollments";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeft, BookOpen, Trophy, Clock, CheckCircle, Video, ChevronRight, Search, ChevronLeft, Lock, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { setExamSourceList } from "@/lib/examSourceTracker";
import { useAuth } from "@/contexts/AuthContext";
import { CourseItemsManagerDialog } from "@/components/admin/CourseItemsManagerDialog";
import { ChapterSortDialog } from "@/components/admin/ChapterSortDialog";
import { SubjectSortDialog } from "@/components/admin/SubjectSortDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const PAGE_SIZE = 15;

// Same access model as Readymade Exams: a class is unlocked if it belongs to
// (or is shared/archive-mapped to) an enrolled course, OR that course has
// archive_full_access = true, OR the course has been granted this specific
// subject/chapter via course_readymade_access (mode = 'archive-class').
const isClassUnlocked = (classItem: any, enrolledIds: string[], fullAccessCourseIds: string[] = [], chapterGrants: Set<string> = new Set()): boolean => {
  if (enrolledIds.length === 0) return false;
  if (fullAccessCourseIds.length > 0 && fullAccessCourseIds.some((id) => enrolledIds.includes(id))) return true;
  if (classItem.course_id && enrolledIds.includes(classItem.course_id)) return true;
  if (Array.isArray(classItem.archive_course_ids) && classItem.archive_course_ids.some((id: string) => enrolledIds.includes(id))) return true;
  const subs: string[] = Array.isArray(classItem.subject) ? classItem.subject : (typeof classItem.subject === "string" ? [classItem.subject] : []);
  const chapter = classItem.chapter || "সাধারণ";
  for (const subject of subs) {
    for (const courseId of enrolledIds) {
      if (chapterGrants.has(`${courseId}|||${subject}|||${chapter}`)) return true;
    }
  }
  return false;
};

const ArchiveLockDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <DialogTitle className="text-center">লক করা আছে</DialogTitle>
        <DialogDescription className="text-center">
          এই ক্লাসটি দেখতে হলে আপনার কোর্সে এই বিষয়/অধ্যায়ের অ্যাক্সেস থাকা প্রয়োজন।
        </DialogDescription>
      </DialogHeader>
    </DialogContent>
  </Dialog>
);

const Archive = () => {
  const [activeTab, setActiveTab] = useState("classes");
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [manageType, setManageType] = useState<"classes" | "exams" | null>(null);
  const [manageChapters, setManageChapters] = useState(false);
  const [manageSubjects, setManageSubjects] = useState(false);
  const [currentChaptersList, setCurrentChaptersList] = useState<string[]>([]);
  const { data: enrollments } = useEnrollments();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  // Search & Pagination State (Global for this page context, reset when tab changes)
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    document.title = "Archive – Atlas";
  }, []);

  useEffect(() => {
      const timer = setTimeout(() => {
          setDebouncedSearch(searchQuery);
          if (searchQuery) setPage(0);
      }, 500);
      return () => clearTimeout(timer);
  }, [searchQuery]);

  const resetSelection = () => {
      setSelectedSubject(null);
      setSelectedChapter(null);
      setSearchQuery("");
      setDebouncedSearch("");
      setPage(0);
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Archive</h1>
        <p className="text-sm text-muted-foreground">Access your past classes and exams organized by subject.</p>
      </header>

      <div className="flex items-center justify-between gap-4">
          <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val); resetSelection(); }} className="shrink-0">
            <TabsList>
                <TabsTrigger value="classes" className="gap-2 text-xs sm:text-sm px-2 sm:px-4"><Video className="h-4 w-4" /> Classes</TabsTrigger>
                <TabsTrigger value="exams" className="gap-2 text-xs sm:text-sm px-2 sm:px-4"><Trophy className="h-4 w-4" /> Exams</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative flex-1 max-w-[160px] sm:max-w-64 ml-auto">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 sm:h-10 text-xs"
              />
          </div>
      </div>

      {isAdmin && selectedChapter && (
          <div className="flex gap-2 mb-4 bg-muted/30 p-3 rounded-lg border">
              <div className="text-sm font-medium mr-auto self-center">Admin Controls:</div>
              <Button variant="outline" size="sm" onClick={() => setManageType("classes")}>Manage Classes Order</Button>
              <Button variant="outline" size="sm" onClick={() => setManageType("exams")}>Manage Exams Order</Button>
          </div>
      )}

      {manageType ? (
        <CourseItemsManagerDialog
          courseId={enrollments?.[0]?.course_id}
          courseName="Archive"
          subjectFilter={selectedSubject}
          chapterFilter={selectedChapter}
          resourceType={manageType}
          onClose={() => setManageType(null)}
        />
      ) : manageChapters && selectedSubject ? (
        <ChapterSortDialog
          courseId={enrollments?.[0]?.course_id || null}
          subject={selectedSubject}
          chapters={currentChaptersList}
          contextName={"Archive"}
          onClose={() => setManageChapters(false)}
        />
      ) : manageSubjects ? (
        <SubjectSortDialog onClose={() => setManageSubjects(false)} />
      ) : activeTab === "classes" ? (
        <ArchiveClassView
            enrollments={enrollments}
            selectedSubject={selectedSubject}
            setSelectedSubject={setSelectedSubject}
            selectedChapter={selectedChapter}
            setSelectedChapter={setSelectedChapter}
            navigate={navigate}
            searchQuery={debouncedSearch}
            page={page}
            setPage={setPage}
            setCurrentChaptersList={setCurrentChaptersList}
            isAdmin={isAdmin}
            setManageChapters={setManageChapters}
            setManageSubjects={setManageSubjects}
        />
      ) : (
        <ArchiveExamView
            enrollments={enrollments}
            selectedSubject={selectedSubject}
            setSelectedSubject={setSelectedSubject}
            selectedChapter={selectedChapter}
            setSelectedChapter={setSelectedChapter}
            navigate={navigate}
            searchQuery={debouncedSearch}
            page={page}
            setPage={setPage}
            setCurrentChaptersList={setCurrentChaptersList}
            isAdmin={isAdmin}
            setManageChapters={setManageChapters}
            setManageSubjects={setManageSubjects}
        />
      )}
    </div>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ArchiveClassView = ({ enrollments, selectedSubject, setSelectedSubject, selectedChapter, setSelectedChapter, navigate, searchQuery, page, setPage, setCurrentChaptersList, isAdmin, setManageChapters, setManageSubjects }: any) => {

    const [lockedClassOpen, setLockedClassOpen] = useState(false);
    const enrolledIds: string[] = enrollments?.map((e: any) => e.course_id) || [];
    const fullAccessCourseIds: string[] = enrollments?.filter((e: any) => e.course?.archive_full_access).map((e: any) => e.course_id) || [];

    const { data: chapterGrants } = useQuery({
        queryKey: ["course-archive-chapter-grants", enrolledIds.join(',')],
        queryFn: async () => {
            if (enrolledIds.length === 0) return new Set<string>();
            const { data, error } = await supabase
                .from("course_readymade_access")
                .select("course_id, subject, chapter")
                .eq("mode", "archive-class")
                .in("course_id", enrolledIds);
            if (error) throw error;
            return new Set((data || []).map((g: any) => `${g.course_id}|||${g.subject}|||${g.chapter}`));
        },
        enabled: enrolledIds.length > 0,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        refetchInterval: 60000,
        staleTime: 30000,
    });

    // Move all hooks to top level
    const { data: searchResults, isLoading: searching } = useQuery({
        queryKey: ["archive-classes-search", enrollments?.map((e: any) => e.course_id).join(','), searchQuery, page],
        queryFn: async () => {
            if (!enrollments || enrollments.length === 0) return { data: [], count: 0 };
            const safeQuery = searchQuery.replace(/[^\w\s\u0980-\u09FF]/g, "").trim();
            if (!safeQuery) return { data: [], count: 0 };

            const courseIds = enrollments.map((e: any) => e.course_id);
            const accessFilter = `archive_course_ids.ov.{${courseIds.join(',')}},course_id.in.(${courseIds.join(',')})`;
            const query = supabase
                .from("classes")
                .select("*, course:courses(name)", { count: 'exact' })
                .or(accessFilter)
                .eq("is_archive", true)
                .or(`title.ilike.%${safeQuery}%,topic.ilike.%${safeQuery}%`)
                .order("sort_order", { ascending: false })
                .order("start_at", { ascending: false })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

            const { data, error, count } = await query;
            if (error) throw error;
            return { data: data || [], count: count || 0 };
        },
        enabled: !!searchQuery && !!enrollments
    });

    const { data: subjects, isLoading: loadingSubjects } = useQuery({
        queryKey: ["archive-classes-subjects", enrollments?.map((e: any) => e.course_id).join(',')],
        queryFn: async () => {
            if (!enrollments || enrollments.length === 0) return [];
            const courseIds = enrollments.map((e: any) => e.course_id);
            const accessFilter = `archive_course_ids.ov.{${courseIds.join(',')}},course_id.in.(${courseIds.join(',')})`;
            const { data } = await supabase
                .from("classes")
                .select("subject")
                .or(accessFilter)
                .eq("is_archive", true);

            const unique = new Set<string>();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data?.forEach((row: any) => {
                 if (Array.isArray(row.subject)) row.subject.forEach((s: string) => unique.add(s));
                 else if (typeof row.subject === 'string') unique.add(row.subject);
            });
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
        enabled: !!enrollments && !selectedSubject && !searchQuery
    });

    const { data: chapters, isLoading: loadingChapters } = useQuery({
        queryKey: ["archive-classes-chapters", selectedSubject, enrollments?.map((e: any) => e.course_id).join(',')],
        queryFn: async () => {
            if (!enrollments || enrollments.length === 0 || !selectedSubject) return [];
            const courseIds = enrollments.map((e: any) => e.course_id);
            const accessFilter = `archive_course_ids.ov.{${courseIds.join(',')}},course_id.in.(${courseIds.join(',')})`;
            const { data } = await supabase
                .from("classes")
                .select("chapter, sort_order")
                .or(accessFilter)
                .eq("is_archive", true)
                .contains("subject", [selectedSubject]);

            const unique = new Set<string>();
            const orderMap = new Map<string, number>();

            const settingsKey = `chapter_order_global_${selectedSubject}`;
            const { data: settingsData } = await supabase.from("app_settings").select("value").eq("key", settingsKey).maybeSingle();
            const savedOrder: string[] = settingsData?.value ? (settingsData.value as string[]) : [];

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data?.forEach((row: any) => {
                if (row.chapter) {
                    unique.add(row.chapter);
                    const currentMax = orderMap.get(row.chapter) || 0;
                    const itemOrder = row.sort_order || 0;
                    if (itemOrder > currentMax) {
                        orderMap.set(row.chapter, itemOrder);
                    }
                }
            });
            return Array.from(unique).sort((a, b) => {
                const idxA = savedOrder.indexOf(a);
                const idxB = savedOrder.indexOf(b);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;
                const orderA = orderMap.get(a) || 0;
                const orderB = orderMap.get(b) || 0;
                if (orderA !== orderB) return orderB - orderA; // higher first
                return a.localeCompare(b);
            });
        },
        enabled: !!selectedSubject && !selectedChapter && !searchQuery
    });

    useEffect(() => {
        if (chapters) {
            setCurrentChaptersList(chapters);
        }
    }, [chapters, setCurrentChaptersList]);

    const { data: classesData, isLoading: loadingClasses } = useQuery({
        queryKey: ["archive-classes-list", selectedSubject, selectedChapter, page, enrollments?.map((e: any) => e.course_id).join(',')],
        queryFn: async () => {
            if (!enrollments || enrollments.length === 0 || !selectedSubject || !selectedChapter) return { data: [], count: 0 };
            const courseIds = enrollments.map((e: any) => e.course_id);
            const accessFilter = `archive_course_ids.ov.{${courseIds.join(',')}},course_id.in.(${courseIds.join(',')})`;
            const { data, count, error } = await supabase
                .from("classes")
                .select("*, course:courses(name)", { count: 'exact' })
                .or(accessFilter)
                .eq("is_archive", true)
                .contains("subject", [selectedSubject])
                .eq("chapter", selectedChapter)
                .order("sort_order", { ascending: false })
                .order("start_at", { ascending: false })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

            if (error) throw error;
            return { data: data || [], count: count || 0 };
        },
        enabled: !!selectedSubject && !!selectedChapter && !searchQuery
    });    // Render Logic
    if (searchQuery) {
        if (searching) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}</div>;
        const classes = searchResults?.data || [];
        const count = searchResults?.count || 0;
        const totalPages = Math.ceil(count / PAGE_SIZE);

        if (classes.length === 0) return <div className="text-center py-12 text-muted-foreground">No classes found matching "{searchQuery}".</div>;

        return (
            <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {classes.map((classItem: any) => {
                        const unlocked = isAdmin || isClassUnlocked(classItem, enrolledIds, fullAccessCourseIds, chapterGrants);
                        return (
                         <Card key={classItem.id} className={`border rounded-2xl shadow-md transition-all flex flex-col h-full ${unlocked ? 'border-emerald-100 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900 hover:shadow-lg' : 'border-border bg-muted/30 opacity-80'}`}>
                          <CardHeader className="space-y-1">
                            <div className="flex justify-between items-start gap-2">
                                <p className="text-xs font-mono uppercase text-muted-foreground">
                                    {classItem.course?.name}
                                </p>
                                {!unlocked && <Lock className="h-4 w-4 text-muted-foreground shrink-0" />}
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
                                unlocked ? (
                                <Button size="sm" className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700 border-none" onClick={() => navigate(`/dashboard/class/${classItem.id}`)}>
                                    Class
                                </Button>
                                ) : (
                                <Button size="sm" variant="outline" className="rounded-full" onClick={() => setLockedClassOpen(true)}>
                                    <Lock className="h-3 w-3 mr-1" /> Class
                                </Button>
                                )
                                )}
                                {classItem.notes_url && (
                                unlocked ? (
                                <Button size="sm" className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700 border-none" asChild>
                                    <a href={classItem.notes_url} target="_blank" rel="noopener noreferrer">
                                    Note
                                    </a>
                                </Button>
                                ) : (
                                <Button size="sm" variant="outline" className="rounded-full" onClick={() => setLockedClassOpen(true)}>
                                    <Lock className="h-3 w-3 mr-1" /> Note
                                </Button>
                                )
                                )}
                            </div>
                          </CardContent>
                        </Card>
                        );
                    })}
                </div>
                <PaginationControls page={page} setPage={setPage} totalPages={totalPages} />
                <ArchiveLockDialog open={lockedClassOpen} onClose={() => setLockedClassOpen(false)} />
            </div>
        );
    }

    if (!selectedSubject) {
        if (loadingSubjects) return <div className="text-muted-foreground">Loading subjects...</div>;
        if (!subjects || subjects.length === 0) return <div className="text-muted-foreground">No classes found in your courses.</div>;
        return (
            <div className="space-y-4">
                {isAdmin && (
                    <div className="flex justify-end">
                        <Button variant="outline" size="sm" onClick={() => setManageSubjects(true)}>Manage Subjects Order</Button>
                    </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {subjects.map(subject => (
                         <Card key={subject} className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-md" onClick={() => setSelectedSubject(subject)}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Subject</CardTitle>
                                <BookOpen className="h-4 w-4 text-primary" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-xl font-bold text-primary">{subject}</div>
                            </CardContent>
                         </Card>
                    ))}
                </div>
            </div>
        );
    }

    if (!selectedChapter) {
         return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <Button variant="ghost" onClick={() => setSelectedSubject(null)} className="pl-0"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Subjects</Button>
                    {isAdmin && (
                        <Button variant="outline" size="sm" onClick={() => setManageChapters(true)}>Manage Chapters Order</Button>
                    )}
                </div>
                <h2 className="text-xl font-bold">{selectedSubject}</h2>
                {loadingChapters ? (
                    <div className="text-muted-foreground">Loading chapters...</div>
                ) : !chapters || chapters.length === 0 ? (
                    <div className="text-muted-foreground">No chapters found for this subject.</div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {chapters.map(chapter => (
                             <Card key={chapter} className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-md" onClick={() => setSelectedChapter(chapter)}>
                                <CardHeader className="pb-2">
                                     <CardTitle className="text-lg">{chapter}</CardTitle>
                                </CardHeader>
                                <CardFooter className="pt-0 text-xs text-primary font-medium">View Classes <ChevronRight className="h-3 w-3 ml-1" /></CardFooter>
                             </Card>
                        ))}
                    </div>
                )}
            </div>
         );
    }

    const classes = classesData?.data || [];
    const totalCount = classesData?.count || 0;
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    return (
        <div className="space-y-6">
            <Button variant="ghost" onClick={() => setSelectedChapter(null)} className="pl-0"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Chapters</Button>
            <div>
                 <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{selectedSubject}</span>
                    <ChevronRight className="h-3 w-3" />
                    <span>{selectedChapter}</span>
                </div>
                <h2 className="text-xl font-bold mt-1">Available Classes</h2>
            </div>

            {loadingClasses ? (
                <div className="text-muted-foreground">Loading classes...</div>
            ) : !classes || classes.length === 0 ? (
                <div className="text-muted-foreground">No classes found.</div>
            ) : (
                <>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {classes.map((classItem: any) => {
                        const unlocked = isAdmin || isClassUnlocked(classItem, enrolledIds, fullAccessCourseIds, chapterGrants);
                        return (
                         <Card key={classItem.id} className={`border rounded-2xl shadow-md transition-all flex flex-col h-full ${unlocked ? 'border-emerald-100 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900 hover:shadow-lg' : 'border-border bg-muted/30 opacity-80'}`}>
                          <CardHeader className="space-y-1">
                            <div className="flex justify-between items-start gap-2">
                                <p className="text-xs font-mono uppercase text-muted-foreground">
                                    {classItem.course?.name}
                                </p>
                                {!unlocked && <Lock className="h-4 w-4 text-muted-foreground shrink-0" />}
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
                                unlocked ? (
                                <Button size="sm" className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700 border-none" onClick={() => navigate(`/dashboard/class/${classItem.id}`)}>
                                    Class
                                </Button>
                                ) : (
                                <Button size="sm" variant="outline" className="rounded-full" onClick={() => setLockedClassOpen(true)}>
                                    <Lock className="h-3 w-3 mr-1" /> Class
                                </Button>
                                )
                                )}
                                {classItem.notes_url && (
                                unlocked ? (
                                <Button size="sm" className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700 border-none" asChild>
                                    <a href={classItem.notes_url} target="_blank" rel="noopener noreferrer">
                                    Note
                                    </a>
                                </Button>
                                ) : (
                                <Button size="sm" variant="outline" className="rounded-full" onClick={() => setLockedClassOpen(true)}>
                                    <Lock className="h-3 w-3 mr-1" /> Note
                                </Button>
                                )
                                )}
                            </div>
                          </CardContent>
                        </Card>
                        );
                    })}
                </div>
                <PaginationControls page={page} setPage={setPage} totalPages={totalPages} />
                <ArchiveLockDialog open={lockedClassOpen} onClose={() => setLockedClassOpen(false)} />
                </>
            )}
        </div>
    );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ArchiveExamView = ({ enrollments, selectedSubject, setSelectedSubject, selectedChapter, setSelectedChapter, navigate, searchQuery, page, setPage, setCurrentChaptersList, isAdmin, setManageChapters, setManageSubjects }: any) => {

    const { data: searchResults, isLoading: searching } = useQuery({
        queryKey: ["archive-exams-search", enrollments?.map((e: any) => e.course_id).join(','), searchQuery, page],
        queryFn: async () => {
            if (!enrollments || enrollments.length === 0) return { data: [], count: 0 };
            const safeQuery = searchQuery.replace(/[^\w\s\u0980-\u09FF]/g, "").trim();
            if (!safeQuery) return { data: [], count: 0 };

            const courseIds = enrollments.map((e: any) => e.course_id);
            const accessFilter = `archive_course_ids.ov.{${courseIds.join(',')}},course_id.in.(${courseIds.join(',')}),is_visible_on_free.eq.true`;
            const query = supabase
                .from("exams")
                .select("*, course:courses(name), questions_count:exam_questions(count)", { count: 'exact' })
                .or(accessFilter)
                .eq("is_archive", true)
                .eq("is_published", true)
                .ilike("title", `%${safeQuery}%`)
                .order("sort_order", { ascending: false })
                .order("created_at", { ascending: false })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

            const { data, error, count } = await query;
            if (error) throw error;
            return { data: data || [], count: count || 0 };
        },
        enabled: !!searchQuery && !!enrollments
    });

    const { data: subjects, isLoading: loadingSubjects } = useQuery({
        queryKey: ["archive-exams-subjects", enrollments?.map((e: any) => e.course_id).join(',')],
        queryFn: async () => {
            if (!enrollments || enrollments.length === 0) return [];
            const courseIds = enrollments.map((e: any) => e.course_id);
            const accessFilter = `archive_course_ids.ov.{${courseIds.join(',')}},course_id.in.(${courseIds.join(',')}),is_visible_on_free.eq.true`;
            const { data } = await supabase
                .from("exams")
                .select("subject")
                .or(accessFilter)
                .eq("is_archive", true)
                .eq("is_published", true);

            const unique = new Set<string>();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data?.forEach((row: any) => {
                 if (Array.isArray(row.subject)) row.subject.forEach((s: string) => unique.add(s));
                 else if (typeof row.subject === 'string') unique.add(row.subject);
            });
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
        enabled: !!enrollments && !selectedSubject && !searchQuery
    });

    const { data: chapters, isLoading: loadingChapters } = useQuery({
        queryKey: ["archive-exams-chapters", selectedSubject, enrollments?.map((e: any) => e.course_id).join(',')],
        queryFn: async () => {
            if (!enrollments || enrollments.length === 0 || !selectedSubject) return [];
            const courseIds = enrollments.map((e: any) => e.course_id);
            const accessFilter = `archive_course_ids.ov.{${courseIds.join(',')}},course_id.in.(${courseIds.join(',')}),is_visible_on_free.eq.true`;
            const { data } = await supabase
                .from("exams")
                .select("chapter, sort_order")
                .or(accessFilter)
                .eq("is_archive", true)
                .contains("subject", [selectedSubject])
                .eq("is_published", true);

            const unique = new Set<string>();
            const orderMap = new Map<string, number>();

            const settingsKey = `chapter_order_global_${selectedSubject}`;
            const { data: settingsData } = await supabase.from("app_settings").select("value").eq("key", settingsKey).maybeSingle();
            const savedOrder: string[] = settingsData?.value ? (settingsData.value as string[]) : [];

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data?.forEach((row: any) => {
                if (row.chapter) {
                    unique.add(row.chapter);
                    const currentMax = orderMap.get(row.chapter) || 0;
                    const itemOrder = row.sort_order || 0;
                    if (itemOrder > currentMax) {
                        orderMap.set(row.chapter, itemOrder);
                    }
                }
            });
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
        enabled: !!selectedSubject && !selectedChapter && !searchQuery
    });

    useEffect(() => {
        if (chapters) {
            setCurrentChaptersList(chapters);
        }
    }, [chapters, setCurrentChaptersList]);

    const { data: examsData, isLoading: loadingExams } = useQuery({
        queryKey: ["archive-exams-list", selectedSubject, selectedChapter, page, enrollments?.map((e: any) => e.course_id).join(',')],
        queryFn: async () => {
             if (!enrollments || enrollments.length === 0 || !selectedSubject || !selectedChapter) return { data: [], count: 0 };
             const courseIds = enrollments.map((e: any) => e.course_id);
             const accessFilter = `archive_course_ids.ov.{${courseIds.join(',')}},course_id.in.(${courseIds.join(',')}),is_visible_on_free.eq.true`;
             const { data, count, error } = await supabase
                 .from("exams")
                 .select("*, course:courses(name), questions_count:exam_questions(count)", { count: 'exact' })
                 .or(accessFilter)
                 .eq("is_archive", true)
                 .contains("subject", [selectedSubject])
                 .eq("chapter", selectedChapter)
                 .eq("is_published", true)
                 .order("sort_order", { ascending: false })
                 .order("created_at", { ascending: false })
                 .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
             if (error) throw error;
             return { data: data || [], count: count || 0 };
        },
        enabled: !!selectedSubject && !!selectedChapter && !searchQuery
    });

    if (searchQuery) {
        if (searching) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}</div>;
        const exams = searchResults?.data || [];
        const count = searchResults?.count || 0;
        const totalPages = Math.ceil(count / PAGE_SIZE);

        if (exams.length === 0) return <div className="text-center py-12 text-muted-foreground">No exams found matching "{searchQuery}".</div>;

        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {exams.map((exam: any) => (
                        <Card
                            key={exam.id}
                            className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-md group flex flex-col"
                            onClick={() => { setExamSourceList(exam.id, "/dashboard/archive"); navigate(`/dashboard/take-exam/${exam.id}`); }}
                        >
                            <CardHeader className="pb-2">
                                <div className="flex justify-between items-start gap-2">
                                    <div className="space-y-1">
                                        <p className="text-xs font-mono uppercase text-muted-foreground">
                                            {exam.course?.name}
                                        </p>
                                        <CardTitle className="text-lg leading-tight group-hover:text-primary transition-colors line-clamp-2">
                                            {exam.title}
                                        </CardTitle>
                                    </div>
                                    <div className="flex flex-col gap-1 items-end">
                                        <Badge variant={exam.exam_type === 'live' ? 'destructive' : 'secondary'} className="shrink-0 capitalize">
                                            {exam.exam_type}
                                        </Badge>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="flex-1">
                                <div className="grid grid-cols-2 gap-y-2 text-sm text-muted-foreground mt-2">
                                    <div className="flex items-center gap-2">
                                        <Clock className="h-4 w-4" />
                                        <span>{exam.duration_minutes} min</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <CheckCircle className="h-4 w-4" />
                                        <span>{exam.questions_count?.[0]?.count || 0} Questions</span>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="pt-0 mt-auto border-t pt-4">
                                <Button className="w-full group-hover:bg-primary/90">
                                    Start Exam
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
                <PaginationControls page={page} setPage={setPage} totalPages={totalPages} />
            </div>
        );
    }

    if (!selectedSubject) {
        if (loadingSubjects) return <div className="text-muted-foreground">Loading subjects...</div>;
        if (!subjects || subjects.length === 0) return <div className="text-muted-foreground">No exams found in your courses.</div>;
        return (
            <div className="space-y-4">
                {isAdmin && (
                    <div className="flex justify-end">
                        <Button variant="outline" size="sm" onClick={() => setManageSubjects(true)}>Manage Subjects Order</Button>
                    </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {subjects.map(subject => (
                         <Card key={subject} className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-md" onClick={() => setSelectedSubject(subject)}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Subject</CardTitle>
                                <Trophy className="h-4 w-4 text-primary" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-xl font-bold text-primary">{subject}</div>
                            </CardContent>
                         </Card>
                    ))}
                </div>
            </div>
        );
    }

    if (!selectedChapter) {
         return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <Button variant="ghost" onClick={() => setSelectedSubject(null)} className="pl-0"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Subjects</Button>
                    {isAdmin && (
                        <Button variant="outline" size="sm" onClick={() => setManageChapters(true)}>Manage Chapters Order</Button>
                    )}
                </div>
                <h2 className="text-xl font-bold">{selectedSubject}</h2>
                {loadingChapters ? (
                    <div className="text-muted-foreground">Loading chapters...</div>
                ) : !chapters || chapters.length === 0 ? (
                    <div className="text-muted-foreground">No chapters found for this subject.</div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {chapters.map(chapter => (
                             <Card key={chapter} className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-md" onClick={() => setSelectedChapter(chapter)}>
                                <CardHeader className="pb-2">
                                     <CardTitle className="text-lg">{chapter}</CardTitle>
                                </CardHeader>
                                <CardFooter className="pt-0 text-xs text-primary font-medium">View Exams <ChevronRight className="h-3 w-3 ml-1" /></CardFooter>
                             </Card>
                        ))}
                    </div>
                )}
            </div>
         );
    }

    const exams = examsData?.data || [];
    const totalCount = examsData?.count || 0;
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    return (
        <div className="space-y-6">
            <Button variant="ghost" onClick={() => setSelectedChapter(null)} className="pl-0"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Chapters</Button>
            <div>
                 <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{selectedSubject}</span>
                    <ChevronRight className="h-3 w-3" />
                    <span>{selectedChapter}</span>
                </div>
                <h2 className="text-xl font-bold mt-1">Available Exams</h2>
            </div>

            {loadingExams ? (
                <div className="text-muted-foreground">Loading exams...</div>
            ) : !exams || exams.length === 0 ? (
                <div className="text-muted-foreground">No exams found.</div>
            ) : (
                <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {exams.map((exam: any) => (
                    <Card
                        key={exam.id}
                        className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-md group flex flex-col"
                        onClick={() => { setExamSourceList(exam.id, "/dashboard/archive"); navigate(`/dashboard/take-exam/${exam.id}`); }}
                    >
                        <CardHeader className="pb-2">
                            <div className="flex justify-between items-start gap-2">
                                <div className="space-y-1">
                                    <p className="text-xs font-mono uppercase text-muted-foreground">
                                        {exam.course?.name}
                                    </p>
                                    <CardTitle className="text-lg leading-tight group-hover:text-primary transition-colors line-clamp-2">
                                        {exam.title}
                                    </CardTitle>
                                </div>
                                <div className="flex flex-col gap-1 items-end">
                                    <Badge variant={exam.exam_type === 'live' ? 'destructive' : 'secondary'} className="shrink-0 capitalize">
                                        {exam.exam_type}
                                    </Badge>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1">
                            <div className="grid grid-cols-2 gap-y-2 text-sm text-muted-foreground mt-2">
                                <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4" />
                                    <span>{exam.duration_minutes} min</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4" />
                                    <span>{exam.questions_count?.[0]?.count || 0} Questions</span>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="pt-0 mt-auto border-t pt-4">
                            <Button className="w-full group-hover:bg-primary/90">
                                Start Exam
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>
            <PaginationControls page={page} setPage={setPage} totalPages={totalPages} />
            </>
            )}
        </div>
    );
};

const PaginationControls = ({ page, setPage, totalPages }: { page: number, setPage: (p: number) => void, totalPages: number }) => {
    return (
        <div className="flex items-center justify-between pt-4">
             <div className="text-xs text-muted-foreground">
                 Page {page + 1} of {totalPages || 1}
             </div>
             <div className="flex gap-2">
                 <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                 >
                     <ChevronLeft className="h-4 w-4" />
                     Previous
                 </Button>
                 <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page >= totalPages - 1}
                 >
                     Next <ChevronRight className="h-4 w-4" />
                 </Button>
             </div>
        </div>
    );
};

export default Archive;
