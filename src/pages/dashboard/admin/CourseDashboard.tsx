import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, Users, Video, FileText, BarChart3, TrendingUp, Presentation, ArrowLeft, Plus, Edit } from "lucide-react";
import { ClassForm } from "@/components/admin/ClassForm";
import { ExamForm } from "@/components/admin/ExamForm";
import { ReadymadeAccessManager } from "@/components/admin/ReadymadeAccessManager";

export default function CourseDashboard() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "classes";
  const queryClient = useQueryClient();
  
  const [showClassForm, setShowClassForm] = useState(false);
  const [editingClass, setEditingClass] = useState<any>(null);
  
  const [showExamForm, setShowExamForm] = useState(false);
  const [editingExam, setEditingExam] = useState<any>(null);

  useEffect(() => {
    document.title = "Course Dashboard - Admin";
  }, []);

  // Fetch course details
  const { data: course, isLoading: loadingCourse } = useQuery({
    queryKey: ["course-details", courseId],
    queryFn: async () => {
      if (!courseId) return null;
      const { data, error } = await supabase
        .from("courses")
        .select("*")
        .eq("id", courseId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });

  // Fetch exam attempts for this course
  const { data: attemptsStats } = useQuery({
    queryKey: ["course-attempts-stats", courseId],
    queryFn: async () => {
      if (!courseId) return null;

      const { data: examsInCourse } = await supabase
        .from("exams")
        .select("id")
        .eq("course_id", courseId);

      if (!examsInCourse || examsInCourse.length === 0) return { avgScore: 0, totalAttempts: 0 };

      const examIds = examsInCourse.map(e => e.id);

      const { data: attempts } = await supabase
        .from("exam_attempts")
        .select("score, exams(total_marks)")
        .in("exam_id", examIds);

      if (!attempts || attempts.length === 0) return { avgScore: 0, totalAttempts: 0 };

      let totalPercent = 0;
      let validAttempts = 0;

      attempts.forEach((a: any) => {
        const tm = a.exams?.total_marks || 0;
        if (tm > 0) {
          totalPercent += (a.score / tm) * 100;
          validAttempts++;
        }
      });

      return {
        avgScore: validAttempts > 0 ? Math.round(totalPercent / validAttempts) : 0,
        totalAttempts: attempts.length
      };
    },
    enabled: !!courseId,
  });

  // Fetch classes
  const { data: classes, isLoading: loadingClasses } = useQuery({
    queryKey: ["course-classes", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("*")
        .eq("course_id", courseId)
        .order("start_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!courseId,
  });

  // Fetch exams
  const { data: exams, isLoading: loadingExams } = useQuery({
    queryKey: ["course-exams", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("*")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!courseId,
  });

  // Fetch Enrollments
  const { data: enrollments, isLoading: loadingEnrollments } = useQuery({
    queryKey: ["course-enrollments", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select(`
          id,
          created_at,
          profile:profiles (
            id,
            full_name,
            registration_id,
            phone,
            school,
            college_name,
            hsc_batch,
            is_second_timer,
            father_name,
            mother_name,
            ssc_gpa,
            hsc_gpa
          )
        `)
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!courseId,
  });

  if (loadingCourse) {
    return <div className="p-8 text-center text-muted-foreground">Loading dashboard...</div>;
  }

  if (!course) {
    return <div className="p-8 text-center text-muted-foreground">Course not found.</div>;
  }

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-500 w-full">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate("/admin/courses")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{course.name}</h1>
          <p className="text-muted-foreground text-sm">Professional Dashboard Overview</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 hover:shadow-md transition-all border-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{enrollments?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Currently enrolled</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 hover:shadow-md transition-all border-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Classes</CardTitle>
            <Presentation className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{classes?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Scheduled / Completed</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 hover:shadow-md transition-all border-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Exams</CardTitle>
            <FileText className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{exams?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Available for students</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 hover:shadow-md transition-all border-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg. Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{attemptsStats?.avgScore || 0}%</div>
            <p className="text-xs text-muted-foreground mt-1">Avg Score in Exams</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        <Card className="md:col-span-4 border-none shadow-sm bg-card/50 backdrop-blur-sm flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" /> Engagement Analytics
            </CardTitle>
            <CardDescription>
              Student engagement and content consumption overview
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center">
            <div className="h-[200px] w-full flex items-center justify-center p-4 text-center">
                <div>
                    <p className="text-5xl font-bold text-primary mb-2">{attemptsStats?.totalAttempts || 0}</p>
                    <p className="text-muted-foreground">Total Exam Attempts from All Students</p>
                </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-3 border-none shadow-sm bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Course Details</CardTitle>
            <CardDescription>Quick glance at course settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-1">Status</div>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${course.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                <span>{course.is_active ? 'Active & Published' : 'Inactive'}</span>
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-1">Price</div>
              <div className="text-xl font-semibold">৳{course.price || "Free"}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-1">Short Description</div>
              <p className="text-sm line-clamp-3">{course.short_description || "No description provided."}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(val) => setSearchParams({ tab: val })} className="w-full">
        <TabsList className="flex flex-wrap h-auto bg-muted/50 p-1 w-full justify-start border-b rounded-none rounded-t-lg">
          <TabsTrigger value="classes" className="data-[state=active]:bg-background">Classes</TabsTrigger>
          <TabsTrigger value="exams" className="data-[state=active]:bg-background">Exams</TabsTrigger>
          <TabsTrigger value="readymade-access" className="data-[state=active]:bg-background">Readymade Access</TabsTrigger>
          <TabsTrigger value="archive-access" className="data-[state=active]:bg-background">Archive Access</TabsTrigger>
          <TabsTrigger value="students" className="data-[state=active]:bg-background">Enrolled Students</TabsTrigger>
        </TabsList>

        <div className="bg-card border-x border-b rounded-b-lg p-6 min-h-[400px]">
          <TabsContent value="classes" className="mt-0 space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-lg">Class Curriculum</h3>
              <Button onClick={() => { setShowClassForm(!showClassForm); setEditingClass(null); }} variant={showClassForm || editingClass ? "secondary" : "default"} size="sm">
                  {showClassForm || editingClass ? "Cancel" : <><Plus className="h-4 w-4 mr-2" /> Add Class</>}
              </Button>
            </div>
            
            {(showClassForm || editingClass) && (
                <div className="bg-card border rounded-lg shadow-sm mb-4 animate-in fade-in slide-in-from-top-4 duration-300">
                    <ClassForm
                        classItem={editingClass}
                        defaultCourseId={courseId}
                        onSuccess={() => { setEditingClass(null); setShowClassForm(false); queryClient.invalidateQueries({ queryKey: ["course-classes", courseId] }); }}
                        onCancel={() => { setEditingClass(null); setShowClassForm(false); }}
                    />
                </div>
            )}
            
            {classes?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No classes added to this course yet.</p>
            ) : (
              <div className="space-y-3">
                {classes?.map((cls) => (
                  <div key={cls.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-md">
                        <Video className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <div className="font-medium">{cls.title}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                          <span className="capitalize">{cls.class_type}</span>
                          <span>•</span>
                          <span>{new Date(cls.start_at).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { setEditingClass(cls); setShowClassForm(false); }}>
                       <Edit className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="exams" className="mt-0 space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-lg">Course Exams</h3>
              <Button onClick={() => { setShowExamForm(!showExamForm); setEditingExam(null); }} variant={showExamForm || editingExam ? "secondary" : "default"} size="sm">
                  {showExamForm || editingExam ? "Cancel" : <><Plus className="h-4 w-4 mr-2" /> Add Exam</>}
              </Button>
            </div>
            
            {(showExamForm || editingExam) && (
                <div className="bg-card border rounded-lg shadow-sm mb-4 animate-in fade-in slide-in-from-top-4 duration-300">
                    <ExamForm
                        exam={editingExam}
                        defaultCourseId={courseId}
                        onSuccess={() => { setEditingExam(null); setShowExamForm(false); queryClient.invalidateQueries({ queryKey: ["course-exams", courseId] }); }}
                        onCancel={() => { setEditingExam(null); setShowExamForm(false); }}
                    />
                </div>
            )}
            
            {exams?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No exams added to this course yet.</p>
            ) : (
              <div className="space-y-3">
                {exams?.map((exam) => (
                  <div key={exam.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-orange-500/10 rounded-md">
                        <FileText className="h-4 w-4 text-orange-500" />
                      </div>
                      <div>
                        <div className="font-medium">{exam.title}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                          <span className="capitalize">{exam.exam_type} Exam</span>
                          <span>•</span>
                          <span>{exam.duration_minutes} Minutes</span>
                        </div>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { setEditingExam(exam); setShowExamForm(false); }}>
                       <Edit className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="readymade-access" className="mt-0 space-y-4">
            <div className="mb-4">
              <h3 className="font-semibold text-lg">Readymade Exam Access</h3>
              <p className="text-sm text-muted-foreground mt-1">Select which subjects/chapters/sub-chapters of Readymade Exams students in this course can access. Unselected ones remain locked.</p>
            </div>
            {courseId && <ReadymadeAccessManager courseId={courseId} mode="readymade" />}
          </TabsContent>

          <TabsContent value="archive-access" className="mt-0 space-y-4">
            <div className="mb-4">
              <h3 className="font-semibold text-lg">Archive Class Access</h3>
              <p className="text-sm text-muted-foreground mt-1">Select which subjects/chapters of Archive Classes students in this course can access. Unselected ones remain locked.</p>
            </div>
            {courseId && <ReadymadeAccessManager courseId={courseId} mode="archive-class" />}
          </TabsContent>

          <TabsContent value="students" className="mt-0 space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-lg">Enrolled Students</h3>
            </div>
            {loadingEnrollments ? (
              <p className="text-sm text-muted-foreground">Loading students...</p>
            ) : enrollments?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No students enrolled yet.</p>
            ) : (
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3">Student Name</th>
                      <th className="px-4 py-3 hidden md:table-cell">Contact</th>
                      <th className="px-4 py-3 hidden lg:table-cell">College</th>
                      <th className="px-4 py-3 hidden xl:table-cell">Batch Info</th>
                      <th className="px-4 py-3">Enrollment Date</th>
                      <th className="px-4 py-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {enrollments?.map((enrollment: any) => (
                      <tr key={enrollment.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3">
                           <div className="font-medium">{enrollment.profile?.full_name || "Unknown"}</div>
                           <div className="text-xs text-muted-foreground mt-0.5">ID: {enrollment.profile?.registration_id || "N/A"}</div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                            <div className="text-sm">{enrollment.profile?.phone || "N/A"}</div>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-sm">
                            {enrollment.profile?.college_name || enrollment.profile?.school || "N/A"}
                        </td>
                        <td className="px-4 py-3 hidden xl:table-cell">
                            <div className="text-sm">Batch: {enrollment.profile?.hsc_batch || "N/A"}</div>
                            {enrollment.profile?.is_second_timer && <span className="text-xs text-red-500 font-medium">2nd Timer</span>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{new Date(enrollment.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-right">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => navigate(`/admin/student/${enrollment.profile?.id}?fromCourse=${courseId}&fromTab=students`)}
                          >
                            <TrendingUp className="h-4 w-4 mr-2" /> View Details
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
