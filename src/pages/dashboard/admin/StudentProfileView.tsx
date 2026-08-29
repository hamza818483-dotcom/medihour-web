import React, { useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isPast } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, ArrowLeft, Calendar, BookOpen, Presentation, FileText,
  CheckCircle2, User, Mail, Phone, CreditCard, AlertTriangle,
  ExternalLink, TrendingDown, MessageCircle
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export default function StudentProfileView() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromCourse = searchParams.get("fromCourse");
  const fromTab = searchParams.get("fromTab");

  const handleBack = () => {
    if (fromCourse) {
      navigate(`/admin/course-dashboard/${fromCourse}?tab=${fromTab || 'students'}`);
    } else {
      navigate(-1);
    }
  };

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["admin-student-profile", studentId],
    queryFn: async () => {
      if (!studentId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", studentId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!studentId,
  });

  // Fetch auth user email
  const { data: userEmail } = useQuery({
    queryKey: ["admin-student-email", studentId],
    queryFn: async () => {
      if (!studentId) return null;
      // @ts-expect-error rpc not in types
      const { data, error } = await supabase.rpc('admin_get_user_email', { p_user_id: studentId });
      if (error) return null;
      return data as string | null;
    },
    enabled: !!studentId,
  });

  // Fetch payment requests
  const { data: paymentRequests, isLoading: paymentsLoading } = useQuery({
    queryKey: ["admin-student-payments", studentId],
    queryFn: async () => {
      if (!studentId) return [];
      const { data, error } = await (supabase.from as any)("payment_requests")
        .select(`*, courses(name, price), emi_logs(*)`)
        .eq("profile_id", studentId)
        .order("created_at", { ascending: false });
      if (error) return [];
      return data || [];
    },
    enabled: !!studentId,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["admin-student-analytics", studentId],
    queryFn: async () => {
      if (!studentId) return null;
      
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("course_id, created_at, expires_at, courses(name, price, created_at)")
        .eq("profile_id", studentId);

      const courseIds = enrollments?.map(e => e.course_id) || [];
      
      const { data: exams } = await supabase
        .from("exams")
        .select("id, course_id, shared_course_ids, is_readymade, readymade_course_ids, title, exam_type")
        .eq("is_published", true);

      const { data: classes } = await supabase
        .from("classes")
        .select("id, course_id, shared_course_ids, archive_course_ids, title");

      const { data: attempts } = await supabase
        .from("exam_attempts")
        .select("id, exam_id, score, created_at, exams(total_marks)")
        .eq("profile_id", studentId)
        .order("created_at", { ascending: false });

      const courseProgress = enrollments?.map(enrollment => {
        const courseExams = (exams as any)?.filter((e: any) => e.course_id === enrollment.course_id || (e.shared_course_ids && e.shared_course_ids.includes(enrollment.course_id)) || (e.is_readymade && (!e.course_id || e.readymade_course_ids?.includes(enrollment.course_id)))) || [];
        const courseClasses = (classes as any)?.filter((c: any) => c.course_id === enrollment.course_id || (c.shared_course_ids && c.shared_course_ids.includes(enrollment.course_id)) || (c.archive_course_ids && c.archive_course_ids.includes(enrollment.course_id))) || [];
        
        const liveExams = courseExams.filter((e: any) => e.exam_type === 'live');
        const practiceExams = courseExams.filter((e: any) => e.exam_type === 'practice');

        const courseAttempts = attempts?.filter(a => courseExams.some((ce: any) => ce.id === a.exam_id)) || [];
        const liveExamsTaken = new Set(courseAttempts.filter(a => liveExams.some((le: any) => le.id === a.exam_id)).map(a => a.exam_id)).size;
        const practiceExamsTaken = courseAttempts.filter(a => practiceExams.some((pe: any) => pe.id === a.exam_id)).length;
        const attemptedExamsCount = new Set(courseAttempts.map(a => a.exam_id)).size;
        const progressPercentage = courseExams.length === 0 ? 0 : Math.round((attemptedExamsCount / courseExams.length) * 100);

          return {
            courseId: enrollment.course_id,
            courseName: (enrollment.courses as any)?.name || "Unknown Course",
            enrolledAt: enrollment.created_at,
            enrolledDays: Math.floor((Date.now() - new Date(enrollment.created_at || Date.now()).getTime()) / (1000 * 60 * 60 * 24)),
            expiresAt: (enrollment as any).expires_at || null,
          totalClasses: courseClasses.length,
          totalExams: courseExams.length,
          liveExamsTotal: liveExams.length,
          practiceExamsTotal: practiceExams.length,
          attempts: courseAttempts,
          liveExamsTaken,
          practiceExamsTaken,
          progressPercentage
        };
      }) || [];

      const allAttemptsMapped = attempts?.map(a => {
          const examInfo = (exams as any)?.find((e: any) => e.id === a.exam_id);
          const tm = (a as any).exams?.total_marks || 1;
          return {
              ...a,
              examTitle: examInfo?.title || 'Unknown Exam',
              examType: examInfo?.exam_type || 'Unknown',
              percent: tm > 0 ? Math.round(((a.score || 0) / tm) * 100) : 0
          };
      }) || [];

      return {
        courseProgress,
        globalStats: {
          totalEnrolled: enrollments?.length || 0,
          totalAttempts: attempts?.length || 0
        },
        recentAttempts: allAttemptsMapped.slice(0, 10),
        chartData: allAttemptsMapped.slice(0, 20).reverse().map((a, i) => ({
            name: format(new Date(a.created_at), 'MMM dd'),
            score: a.percent,
            title: a.examTitle
        }))
      };
    },
    enabled: !!studentId,
  });

  const isLoading = profileLoading || analyticsLoading;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-24 h-[60vh]">
        <Loader2 className="h-12 w-12 animate-spin text-primary opacity-50 mb-4" />
        <p className="text-muted-foreground">Loading student profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
        <User className="h-16 w-16 mb-4 opacity-20" />
        <h2 className="text-xl font-bold">Student Not Found</h2>
        <Button variant="link" onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    );
  }

  // Payment summary
  const totalPaid = paymentRequests?.filter((p: any) => p.status === 'approved').reduce((sum: number, p: any) => sum + (p.amount_sent || 0), 0) || 0;
  const totalDue = paymentRequests?.filter((p: any) => p.status === 'approved').reduce((sum: number, p: any) => {
    const remaining = (p.due_amount || 0) - (p.amount_paid || 0);
    return sum + Math.max(0, remaining);
  }, 0) || 0;

  return (
    <div className="space-y-6 pb-12 w-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={handleBack} className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{profile.full_name || "Unknown Student"}</h1>
            <p className="text-muted-foreground flex items-center gap-2 flex-wrap">
               <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-semibold">ID: {profile.registration_id}</span>
               {profile.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{profile.phone}</span>}
               {userEmail && <span className="flex items-center gap-1 text-xs"><Mail className="h-3 w-3" />{userEmail}</span>}
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 max-w-md">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="mt-4 space-y-6">
          {/* Top Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-primary/5 border-primary/20 shadow-none">
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                      <BookOpen className="h-5 w-5 text-primary mb-2 opacity-80" />
                      <div className="text-2xl font-bold">{analytics?.globalStats.totalEnrolled || 0}</div>
                      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Courses Enrolled</div>
                  </CardContent>
              </Card>
              <Card className="bg-primary/5 border-primary/20 shadow-none">
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                      <FileText className="h-5 w-5 text-primary mb-2 opacity-80" />
                      <div className="text-2xl font-bold">{analytics?.globalStats.totalAttempts || 0}</div>
                      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Exams</div>
                  </CardContent>
              </Card>
              <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800 shadow-none">
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                      <CreditCard className="h-5 w-5 text-green-600 mb-2 opacity-80" />
                      <div className="text-2xl font-bold text-green-700">৳{totalPaid.toLocaleString("en-BD")}</div>
                      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Paid</div>
                  </CardContent>
              </Card>
              <Card className={`shadow-none ${totalDue > 0 ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800' : 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'}`}>
                  <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                      <TrendingDown className={`h-5 w-5 mb-2 opacity-80 ${totalDue > 0 ? 'text-amber-600' : 'text-green-600'}`} />
                      <div className={`text-2xl font-bold ${totalDue > 0 ? 'text-amber-700' : 'text-green-700'}`}>৳{totalDue.toLocaleString("en-BD")}</div>
                      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Outstanding Due</div>
                  </CardContent>
              </Card>
          </div>

          {/* Course Breakdowns */}
          <Card className="shadow-sm">
              <CardHeader>
                  <CardTitle>Enrolled Courses Progress</CardTitle>
                  <CardDescription>Metrics spanning across all active courses the student owns.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                  {analytics?.courseProgress.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg bg-muted/20">
                          No courses found for this student.
                      </div>
                  ) : (
                      analytics?.courseProgress.map((course) => (
                          <div key={course.courseId} className="space-y-3">
                               <div className="flex justify-between items-center">
                                   <h4 className="font-semibold">{course.courseName}</h4>
                                   <div className="flex gap-2 items-center flex-wrap">
                                       {course.expiresAt && (
                                           <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${
                                               isPast(new Date(course.expiresAt))
                                               ? 'bg-red-100 text-red-700 border-red-200'
                                               : 'bg-amber-100 text-amber-700 border-amber-200'
                                           }`}>
                                               {isPast(new Date(course.expiresAt)) ? '⛔ Expired' : '⏳ Expires'} {format(new Date(course.expiresAt), 'dd MMM yyyy')}
                                           </span>
                                       )}
                                       <span className="text-xs text-muted-foreground border px-1.5 rounded bg-muted/20">
                                           {format(new Date(course.enrolledAt), 'dd MMM yyyy')} ({course.enrolledDays}d ago)
                                       </span>
                                       <span className="text-sm font-bold bg-primary/10 text-primary px-2 py-0.5 rounded">{course.progressPercentage}% Progress</span>
                                   </div>
                               </div>
                              <Progress value={course.progressPercentage} className="h-2" />
                              
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                                  <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-md border text-sm">
                                      <Presentation className="h-4 w-4 text-blue-500" />
                                      <div>
                                          <span className="font-semibold">{course.totalClasses}</span> Total Classes
                                      </div>
                                  </div>
                                  <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-md border text-sm">
                                      <FileText className="h-4 w-4 text-orange-500" />
                                      <div>
                                          <span className="font-semibold">{course.liveExamsTaken}</span> Live Exams Taken
                                          <p className="text-[10px] text-muted-foreground leading-none mt-1">Out of {course.liveExamsTotal} available</p>
                                      </div>
                                  </div>
                                  <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-md border text-sm">
                                      <FileText className="h-4 w-4 text-purple-500" />
                                      <div>
                                          <span className="font-semibold">{course.practiceExamsTaken}</span> Practice Exams
                                      </div>
                                  </div>
                              </div>

                              <div className="flex justify-center pt-2">
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="text-[10px] h-8 text-primary border-primary/20 hover:bg-primary/5 w-full flex items-center gap-2"
                                    onClick={() => navigate(`/admin/student/${studentId}/course-results/${course.courseId}`)}
                                  >
                                      <FileText className="h-3.5 w-3.5" />
                                      View Full Exam History
                                  </Button>
                              </div>
                          </div>
                      ))
                  )}
              </CardContent>
          </Card>

          {/* Performance Chart */}
          {analytics?.chartData && analytics.chartData.length > 1 && (
              <Card className="shadow-sm">
                  <CardHeader>
                      <CardTitle>Performance Trend (Last 20 Exams)</CardTitle>
                      <CardDescription>Percentage score improvement over time.</CardDescription>
                  </CardHeader>
                  <CardContent>
                      <div className="h-[250px] w-full mt-4">
                          <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={analytics.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                  <defs>
                                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                      </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dy={10} />
                                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dx={-10} domain={[0, 100]} />
                                  <Tooltip
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    labelStyle={{ fontWeight: 'bold', color: '#374151' }}
                                    formatter={(value: any, name: string, props: any) => [`${value}%`, props.payload.title]}
                                  />
                                  <Area type="monotone" dataKey="score" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
                              </AreaChart>
                          </ResponsiveContainer>
                      </div>
                  </CardContent>
              </Card>
          )}

          {/* Recent Exam Activity */}
          <Card className="shadow-sm">
              <CardHeader>
                  <CardTitle>Recent Exam Activity</CardTitle>
                  <CardDescription>Latest generated exam results and practice runs.</CardDescription>
              </CardHeader>
              <CardContent>
                  {analytics?.recentAttempts.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground">No recent activity found.</div>
                  ) : (
                      <div className="space-y-4">
                          {analytics?.recentAttempts.map((attempt: any) => (
                              <div
                                key={attempt.id}
                                className="flex justify-between items-center p-3 border rounded-lg bg-card cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={() => navigate(`/dashboard/exam-review/${attempt.id}`)}
                              >
                                  <div>
                                      <div className="font-semibold flex items-center gap-2">
                                          <span>{attempt.examTitle}</span>
                                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full uppercase font-bold tracking-wider ${attempt.examType === 'live' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                              {attempt.examType}
                                          </span>
                                      </div>
                                      <div className="text-xs text-muted-foreground mt-1">
                                          {format(new Date(attempt.created_at), 'PPp')}
                                      </div>
                                  </div>
                                  <div className="text-right">
                                      <div className="font-bold text-lg text-primary">{attempt.score?.toFixed(2)} Score</div>
                                      <div className="text-xs text-primary font-medium mt-0.5">View details →</div>
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}
              </CardContent>
          </Card>
        </TabsContent>

        {/* PAYMENTS TAB */}
        <TabsContent value="payments" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payment History
              </CardTitle>
              <CardDescription>All payment requests by this student across all courses.</CardDescription>
            </CardHeader>
            <CardContent>
              {paymentsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" /></div>
              ) : !paymentRequests || paymentRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No payment records found.</div>
              ) : (
                <div className="space-y-4">
                  {/* Per-course summary */}
                  <div className="grid grid-cols-3 gap-3 p-4 bg-muted/30 rounded-lg border text-center">
                    <div>
                      <div className="text-xl font-bold text-green-700">৳{totalPaid.toLocaleString("en-BD")}</div>
                      <div className="text-xs text-muted-foreground">Total Paid</div>
                    </div>
                    <div>
                      <div className={`text-xl font-bold ${totalDue > 0 ? 'text-amber-700' : 'text-green-700'}`}>৳{totalDue.toLocaleString("en-BD")}</div>
                      <div className="text-xs text-muted-foreground">Remaining Due</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold">{paymentRequests.filter((p: any) => p.status === 'approved').length}</div>
                      <div className="text-xs text-muted-foreground">Approved Requests</div>
                    </div>
                  </div>

                  {paymentRequests.map((payment: any) => {
                    const remaining = (payment.due_amount || 0) - (payment.amount_paid || 0);
                    const isOverdue = payment.due_date && isPast(new Date(payment.due_date)) && remaining > 0;
                    return (
                      <div key={payment.id} className={`border rounded-lg p-4 space-y-3 ${isOverdue ? 'border-red-300 bg-red-50 dark:bg-red-950/10' : ''}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-semibold">{payment.courses?.name || "Unknown Course"}</div>
                            <div className="text-xs text-muted-foreground">{format(new Date(payment.created_at), 'PPP')}</div>
                          </div>
                          <Badge variant={payment.status === 'approved' ? 'default' : payment.status === 'rejected' ? 'destructive' : 'secondary'} className="capitalize">
                            {payment.status}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Amount Sent</p>
                            <p className="font-medium text-green-700">৳{payment.amount_sent || "N/A"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Method</p>
                            <p className="font-medium capitalize">{payment.payment_method}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Last 5 Digits</p>
                            <p className="font-mono font-medium">{payment.sender_last5 || payment.trx_id}</p>
                          </div>
                          {payment.contact_number && (
                            <div>
                              <p className="text-xs text-muted-foreground">Contact</p>
                              <p className="font-medium">{payment.contact_number}</p>
                            </div>
                          )}
                          {payment.due_amount && payment.due_amount > 0 && (
                            <>
                              <div>
                                <p className="text-xs text-muted-foreground">Due Amount</p>
                                <p className="font-medium text-amber-700">৳{payment.due_amount}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Remaining</p>
                                <p className={`font-bold ${remaining > 0 ? 'text-amber-700' : 'text-green-600'}`}>৳{Math.max(0, remaining)}</p>
                              </div>
                              {payment.due_date && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Due Date</p>
                                  <p className={`font-medium flex items-center gap-1 ${isOverdue ? 'text-red-600' : ''}`}>
                                    {isOverdue && <AlertTriangle className="h-3.5 w-3.5" />}
                                    {format(new Date(payment.due_date), "dd MMM yyyy")}
                                    {isOverdue && <span className="text-[10px] bg-red-100 text-red-700 px-1 rounded">OVERDUE</span>}
                                  </p>
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {payment.social_link && (
                          <a href={payment.social_link} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" />{payment.social_link}
                          </a>
                        )}
                        {payment.admin_note && (
                          <div className="text-xs text-muted-foreground bg-muted/40 p-2 rounded border">
                            📝 {payment.admin_note}
                          </div>
                        )}
                        {payment.emi_logs && payment.emi_logs.length > 0 && (
                          <div className="mt-3 pt-3 border-t">
                            <h5 className="text-xs font-semibold mb-2">EMI / Partial Payments</h5>
                            <div className="space-y-2">
                              {payment.emi_logs.sort((a: any, b: any) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()).map((log: any) => (
                                <div key={log.id} className="flex justify-between items-center bg-muted/20 p-2 rounded border text-xs">
                                  <div>
                                    <div className="font-medium text-green-700">+৳{log.amount}</div>
                                    <div className="text-muted-foreground">{format(new Date(log.recorded_at), 'PPPp')}</div>
                                  </div>
                                  {log.admin_note && (
                                    <div className="text-right text-muted-foreground max-w-[50%] truncate">
                                      {log.admin_note}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PROFILE TAB */}
        <TabsContent value="profile" className="mt-4">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Profile Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center mb-6 pt-2 pb-4 border-b">
                  <div className="h-24 w-24 bg-secondary rounded-full flex items-center justify-center text-4xl mb-3 shadow-inner text-muted-foreground">
                      {profile.full_name?.charAt(0) || <User />}
                  </div>
                  <div className="text-sm font-medium text-center">{(profile as any).college_name || profile.school || 'College not provided'}</div>
                  <div className="text-xs text-muted-foreground text-center">
                      Batch {(profile as any).hsc_batch || 'N/A'}
                      {(profile as any).is_second_timer && <span className="ml-1 text-red-500">(2nd Timer)</span>}
                  </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                {userEmail && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <div className="text-xs text-muted-foreground">Email</div>
                      <div className="font-medium break-all">{userEmail}</div>
                    </div>
                  </div>
                )}
                {profile.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <div className="text-xs text-muted-foreground">Phone</div>
                      <div className="font-medium">{profile.phone}</div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground">Joining Date & Time</div>
                    <div className="font-medium">{profile.created_at ? format(new Date(profile.created_at), 'PPPp') : 'N/A'}</div>
                  </div>
                </div>
                {(profile as any).father_name && (
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <div className="text-xs text-muted-foreground">Father's Name</div>
                      <div className="font-medium">{(profile as any).father_name}</div>
                    </div>
                  </div>
                )}
                {(profile as any).mother_name && (
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <div className="text-xs text-muted-foreground">Mother's Name</div>
                      <div className="font-medium">{(profile as any).mother_name}</div>
                    </div>
                  </div>
                )}
                {(profile as any).ssc_gpa && (
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <div className="text-xs text-muted-foreground">SSC GPA</div>
                      <div className="font-medium">{(profile as any).ssc_gpa}</div>
                    </div>
                  </div>
                )}
                {(profile as any).hsc_gpa && (
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <div className="text-xs text-muted-foreground">HSC GPA</div>
                      <div className="font-medium">{(profile as any).hsc_gpa}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick contact actions */}
              {profile.phone && (
                <div className="flex gap-2 mt-6 pt-4 border-t">
                  <Button size="sm" variant="outline" asChild className="gap-2 bg-green-50 border-green-200 text-green-700 hover:bg-green-100">
                    <a href={`https://wa.me/88${profile.phone.replace(/^0/, '')}`} target="_blank" rel="noreferrer">
                      <MessageCircle className="h-4 w-4" />WhatsApp
                    </a>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
