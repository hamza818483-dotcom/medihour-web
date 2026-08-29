import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import ClassPlayer from "@/components/ClassPlayer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText, ArrowLeft, Calendar, Eye } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import ClassComments from "@/components/ClassComments";

const ClassPlayerPage = () => {
  const { classId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const { data: classItem, isLoading } = useQuery({
    queryKey: ["class", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("*, course:courses(name, id)")
        .eq("id", classId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: accessInfo, isLoading: accessLoading } = useQuery({
    queryKey: ["check-class-access", classItem?.id, profile?.id],
    queryFn: async (): Promise<{ hasAccess: boolean; viaArchive: boolean }> => {
      if (!classItem || !profile?.id) return { hasAccess: false, viaArchive: false };

      // Fetch all enrollments for the user
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("course_id, course:courses(archive_full_access)")
        .eq("profile_id", profile.id);

      if (!enrollments || enrollments.length === 0) return { hasAccess: false, viaArchive: false };

      const enrolledCourseIds = enrollments.map(e => e.course_id);

      // 1. Check Primary Course
      if (classItem.course_id && enrolledCourseIds.includes(classItem.course_id)) {
        return { hasAccess: true, viaArchive: false };
      }

      // 2. Check Shared Courses
      if (classItem.shared_course_ids && Array.isArray(classItem.shared_course_ids)) {
          const hasSharedAccess = classItem.shared_course_ids.some((id: string) => enrolledCourseIds.includes(id));
          if (hasSharedAccess) return { hasAccess: true, viaArchive: false };
      }

      if (classItem.is_archive) {
          // 3a. Course-level "Archive Full Access" toggle
          const hasFullArchiveAccess = enrollments.some((e: any) => e.course?.archive_full_access);
          if (hasFullArchiveAccess) return { hasAccess: true, viaArchive: true };

          // 3b. Check Archive Courses (explicit per-class mapping)
          if (classItem.archive_course_ids && Array.isArray(classItem.archive_course_ids)) {
              const hasArchiveAccess = classItem.archive_course_ids.some((id: string) => enrolledCourseIds.includes(id));
              if (hasArchiveAccess) return { hasAccess: true, viaArchive: true };
          }

          // 3c. Granular subject/chapter grant (course_readymade_access, mode='archive-class')
          const subs: string[] = Array.isArray(classItem.subject) ? classItem.subject : (typeof classItem.subject === "string" && classItem.subject ? [classItem.subject] : []);
          const chapter = classItem.chapter || "সাধারণ";
          if (subs.length > 0) {
              const { data: grants } = await supabase
                  .from("course_readymade_access")
                  .select("course_id")
                  .eq("mode", "archive-class")
                  .in("course_id", enrolledCourseIds)
                  .eq("chapter", chapter)
                  .in("subject", subs);
              if (grants && grants.length > 0) return { hasAccess: true, viaArchive: true };
          }
      }

      return { hasAccess: false, viaArchive: false };
    },
    enabled: !!classItem && !!profile?.id
  });
  const hasAccess = accessInfo?.hasAccess ?? false;

  const { data: viewCount } = useQuery({
    queryKey: ["class-view-count", classId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("class_views")
        .select("id", { count: "exact", head: true })
        .eq("class_id", classId);
      if (error) return 0;
      return count || 0;
    },
    enabled: !!classId,
  });

  useEffect(() => {
    if (classItem?.title) {
      document.title = `${classItem.title} – Atlas`;
    }
  }, [classItem]);

  // Record this student's view once access is confirmed (distinct-viewer count).
  useEffect(() => {
    if (!classId || !profile?.id || !hasAccess) return;
    supabase.rpc("record_class_view", { p_class_id: classId }).then(({ error }) => {
      if (error) console.error("Error recording class view", error);
    });
  }, [classId, profile?.id, hasAccess]);

  if (isLoading || accessLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading class...</div>;
  }

  if (!classItem) {
    return (
      <div className="p-8 text-center space-y-4">
        <h2 className="text-xl font-bold">Class not found</h2>
        <Button onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    );
  }

  // Check if class hasn't started yet
  const startTime = classItem.start_at ? new Date(classItem.start_at) : null;
  const endTime = classItem.end_at ? new Date(classItem.end_at) : null;
  const now = new Date();

  // Determine actual live status: It is live ONLY if it's type 'live' AND current time is BEFORE end_at
  // If end_at is null, we assume it's live indefinitely (or until manual change), but usually end_at is set.
  // If end_at is passed, we treat it as recorded (isLive=false).
  const isActuallyLive = classItem.class_type === 'live' && (!endTime || now < endTime);

  if (startTime && startTime > now) {
      return (
          <div className="p-8 max-w-2xl mx-auto text-center space-y-6">
              <div className="p-6 border rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300">
                  <h2 className="text-xl font-bold mb-2">Class Has Not Started Yet</h2>
                  <p className="mb-4">This class is scheduled to start on:</p>
                  <p className="text-lg font-mono bg-white dark:bg-black/20 p-2 rounded inline-block border">
                      {startTime.toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}
                  </p>
                  <p className="text-xs mt-4 opacity-80">Please come back at the scheduled time.</p>
              </div>
              <Button onClick={() => navigate(-1)}>
                  Go Back
              </Button>
          </div>
      );
  }

  if (!hasAccess) {
     return (
        <div className="p-8 max-w-2xl mx-auto text-center space-y-6">
            <div className="p-6 border rounded-lg bg-destructive/5 text-destructive">
                <h2 className="text-xl font-bold mb-2">Access Denied</h2>
                <p>You are not enrolled in <strong>{classItem.course?.name}</strong>.</p>
                <p className="text-sm mt-2">Please purchase the course to access this content.</p>
            </div>
            <Button onClick={() => navigate(`/courses/${classItem.course_id}`)}>
                View Course Details
            </Button>
        </div>
     );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <Button variant="ghost" className="pl-0 hover:bg-transparent" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Classes
        </Button>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
          <Eye className="h-3.5 w-3.5" />
          <span>{viewCount ?? 0} জন দেখেছে</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="relative aspect-video w-full bg-black rounded-lg overflow-hidden shadow-lg border border-border/50 group">
            {classItem.video_url ? (
              <ClassPlayer
                videoId={classItem.video_url}
                title={classItem.title}
                isLive={isActuallyLive}
                startTime={classItem.start_at}
                classId={classItem.id}
                watchCategory={isActuallyLive ? "live" : accessInfo?.viaArchive ? "archive" : "record"}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                Video not available yet.
              </div>
            )}
          </div>

          <div>
            <h1 className="text-2xl font-bold font-kalpurush leading-tight">{classItem.title}</h1>
            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                <span className="font-semibold text-primary">{classItem.course?.name}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {classItem.start_at && new Date(classItem.start_at).toLocaleString()}
                </span>
            </div>
          </div>
        </div>

        <div className="space-y-6">
            {isActuallyLive && (
                <div className="lg:sticky lg:top-4 lg:h-[calc(100vh-8rem)]">
                    <ClassComments classId={classItem.id} isLive />
                </div>
            )}

            {classItem.topic && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Topic Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap font-kalpurush">
                            {classItem.topic}
                        </p>
                    </CardContent>
                </Card>
            )}

            {classItem.notes_url && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Class Materials</CardTitle>
                        <CardDescription>Download attached resources</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button variant="outline" className="w-full justify-start" asChild>
                            <a href={classItem.notes_url} target="_blank" rel="noopener noreferrer">
                                <FileText className="mr-2 h-4 w-4" />
                                Lecture Notes (PDF)
                            </a>
                        </Button>
                    </CardContent>
                </Card>
            )}

            {!isActuallyLive && <ClassComments classId={classItem.id} />}
        </div>
      </div>
    </div>
  );
};

export default ClassPlayerPage;
