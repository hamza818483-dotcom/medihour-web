import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Profile, Course, Enrollment } from "@/types/admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { X, ChevronLeft, ChevronRight, Ban, Trash2, Users, GraduationCap, Shield, Key, Mail, AlertTriangle, Eye, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

const PAGE_SIZE = 10;

type ListFilter = 'all' | 'paid' | 'free' | 'admin' | 'teacher' | null;

const AdminStudents = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCourseFilter = searchParams.get("course") || "all";
  const page = parseInt(searchParams.get("page") || "0");

  const [listFilter, setListFilter] = useState<ListFilter>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [updateEmailUserId, setUpdateEmailUserId] = useState<string | null>(null);
  const [confirmEmailUserId, setConfirmEmailUserId] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);

  const setPage = (newPage: number) => {
      setSearchParams(prev => {
          prev.set("page", newPage.toString());
          return prev;
      });
  };

  useEffect(() => {
      const timer = setTimeout(() => {
          setDebouncedSearch(searchQuery);
          if (searchQuery) setPage(0);
      }, 500);
      return () => clearTimeout(timer);
  }, [searchQuery]);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const confirmEmailMutation = useMutation({
    mutationFn: async (userId: string) => {
      // @ts-expect-error rpc not in generated types
      const { error } = await supabase.rpc('admin_confirm_user_email', { p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Email Confirmed", description: "Student's email has been marked as confirmed." });
      queryClient.invalidateQueries({ queryKey: ["admin-students"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to confirm email", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    document.title = "Admin – Students – Atlas";
  }, []);

  // --- Statistics Query ---
  const { data: stats } = useQuery({
      queryKey: ["admin-student-stats"],
      queryFn: async () => {
          // 1. Total Profiles
          const { count: totalProfiles } = await supabase
            .from("profiles")
            .select("*", { count: 'exact', head: true });

          // 2. Paid Students (unique profiles with enrollments)
          const { data: enrollmentIds } = await supabase
            .from("enrollments")
            .select("profile_id");

          const paidProfileIds = new Set(enrollmentIds?.map(e => e.profile_id));
          const paidCount = paidProfileIds.size;

          // 3. Admins & Teachers
          const { data: roles } = await supabase
             .from("user_roles")
             .select("role");

          const adminCount = roles?.filter(r => (r.role as any) === 'admin').length || 0;
          const teacherCount = roles?.filter(r => (r.role as any) === 'teacher').length || 0;

          return {
              total: totalProfiles || 0,
              paid: paidCount,
              free: (totalProfiles || 0) - paidCount,
              admins: adminCount,
              teachers: teacherCount
          };
      }
  });

  const { data: courses } = useQuery({
    queryKey: ["admin-courses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: studentsData, isLoading, error: studentsError } = useQuery({
    queryKey: ["admin-students", selectedCourseFilter, page, debouncedSearch, listFilter],
    queryFn: async () => {
      if (!listFilter && !debouncedSearch && selectedCourseFilter === 'all') return { data: [], count: 0 };

      // Base query setup
      let query: any = supabase
        .from("profiles")
        .select("id, registration_id, full_name, batch_year, created_at, status, enrollments:enrollments(id, course_id, courses(name))", { count: 'exact' });

      // Apply Paid/Enrollment Filter
      if (listFilter === 'paid') {
           query = supabase.from("profiles")
             .select("*, enrollments!inner(id, course_id, courses(name))", { count: 'exact' });
      } else if (listFilter === 'free') {
           // For free students, we MUST fetch excluded IDs first
           const { data: enrolledIds } = await supabase.from("enrollments").select("profile_id");
           const distinctEnrolled = new Set(enrolledIds?.map(e => e.profile_id));

           if (distinctEnrolled.size > 0 && distinctEnrolled.size < 2000) {
                query = query.not("id", "in", `(${Array.from(distinctEnrolled).join(',')})`);
           }
      } else if (listFilter === 'admin' || listFilter === 'teacher') {
             const { data: roleData } = await supabase.from("user_roles").select("user_id").eq("role", listFilter as any);
             const ids = roleData?.map(r => r.user_id) || [];
             if (ids.length === 0) return { data: [], count: 0 };
             query = query.in("id", ids);
      }

      // Apply Search Filter (ALWAYS applied on top of list filter)
      if (debouncedSearch) {
        // @ts-expect-error rpc not in generated types
        const { data: emailMatches } = await supabase.rpc('admin_search_users_by_email', { p_search: debouncedSearch });
        const emailIds: string[] = (emailMatches || []).map((r: any) => r.id);
        const orParts = [
          `full_name.ilike.%${debouncedSearch}%`,
          `registration_id.ilike.%${debouncedSearch}%`,
          `phone.ilike.%${debouncedSearch}%`,
        ];
        if (emailIds.length > 0) orParts.push(`id.in.(${emailIds.join(',')})`);
        query = query.or(orParts.join(','));
      }

      // Apply Course Filter (Overrides base query if specific)
      if (selectedCourseFilter !== 'all') {
           query = supabase.from("enrollments")
            .select("profile:profiles!inner(*), course:courses(name), id, course_id, created_at", { count: 'exact' })
            .eq("course_id", selectedCourseFilter);

           if (debouncedSearch) {
              // @ts-expect-error rpc not in generated types
              const { data: emailMatches2 } = await supabase.rpc('admin_search_users_by_email', { p_search: debouncedSearch });
              const emailIds2: string[] = (emailMatches2 || []).map((r: any) => r.id);
              const orParts2 = [
                `full_name.ilike.%${debouncedSearch}%`,
                `registration_id.ilike.%${debouncedSearch}%`,
                `phone.ilike.%${debouncedSearch}%`,
              ];
              if (emailIds2.length > 0) orParts2.push(`id.in.(${emailIds2.join(',')})`);
              query = query.or(orParts2.join(','), { foreignTable: "profiles" });
           }
      }

      // Final Execution
      const { data, error, count } = await query
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) throw error;

      // Normalization
      let resultData = data || [];

      if (selectedCourseFilter !== 'all') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          resultData = resultData.map((e: any) => ({
              ...(e.profile as Profile),
              enrollments: [{ id: e.id, course_id: e.course_id, courses: e.course, created_at: e.created_at }]
          }));
      }

      // Fetch roles
      if (resultData.length > 0) {
          const userIds = resultData.map((p: any) => p.id);
          const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("user_id", userIds);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          resultData = resultData.map((p: any) => ({
              ...p,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              roles: roles?.filter((r: any) => r.user_id === p.id).map((r: any) => r.role) || []
          }));
      }

      return { data: resultData, count: count || 0 };
    },
  });

  const students = (studentsData?.data as Profile[]) || [];
  const totalCount = studentsData?.count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // ... mutations (omitted for brevity, unchanged)
  const removeEnrollmentMutation = useMutation({
      mutationFn: async (enrollmentId: string) => {
          const { error } = await supabase.from("enrollments").delete().eq("id", enrollmentId);
          if (error) throw error;
      },
      onSuccess: () => {
          toast({ title: "Access removed" });
          queryClient.invalidateQueries({ queryKey: ["admin-students"] });
          queryClient.invalidateQueries({ queryKey: ["admin-student-stats"] });
      },
  });

  const toggleTeacherRoleMutation = useMutation({
      mutationFn: async ({ userId, isPromoting }: { userId: string, isPromoting: boolean }) => {
          if (isPromoting) {
              const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "teacher" as any });
              if (error) throw error;
          } else {
              const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "teacher" as any);
              if (error) throw error;
          }
      },
      onSuccess: () => {
          toast({ title: "Role updated successfully" });
          queryClient.invalidateQueries({ queryKey: ["admin-students"] });
          queryClient.invalidateQueries({ queryKey: ["admin-student-stats"] });
      },
  });

  const toggleBanMutation = useMutation({
      mutationFn: async ({ userId, status }: { userId: string, status: string }) => {
          const { error } = await supabase.from("profiles").update({ status } as any).eq("id", userId);
          if (error) throw error;
      },
      onSuccess: () => {
          toast({ title: "User status updated" });
          queryClient.invalidateQueries({ queryKey: ["admin-students"] });
      },
  });

  const deleteUserMutation = useMutation({
      mutationFn: async (userId: string) => {
          // @ts-expect-error RPC not in types yet
          const { error } = await supabase.rpc('admin_delete_user', {
              p_user_id: userId
          });
          if (error) throw error;
      },
      onSuccess: () => {
          toast({ title: "User deleted from everywhere" });
          queryClient.invalidateQueries({ queryKey: ["admin-students"] });
          queryClient.invalidateQueries({ queryKey: ["admin-student-stats"] });
      },
      onError: (err: any) => {
          toast({ title: "Failed to delete user", description: err.message, variant: "destructive" });
      }
  });

  const bulkDeleteMutation = useMutation({
      mutationFn: async (userIds: string[]) => {
          // @ts-expect-error RPC not in types yet
          const { error } = await supabase.rpc('admin_bulk_delete_users', {
              p_user_ids: userIds
          });
          if (error) throw error;
      },
      onSuccess: () => {
          toast({ title: `${selectedUserIds.length} users deleted from everywhere` });
          setSelectedUserIds([]);
          setIsBulkDeleteDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: ["admin-students"] });
          queryClient.invalidateQueries({ queryKey: ["admin-student-stats"] });
      },
      onError: (err: any) => {
          toast({ title: "Bulk deletion failed", description: err.message, variant: "destructive" });
      }
  });

  const toggleSelectAll = () => {
      if (selectedUserIds.length === students.length && students.length > 0) {
          setSelectedUserIds([]);
      } else {
          setSelectedUserIds(students.map(s => s.id));
      }
  };

  const toggleSelectUser = (userId: string) => {
      setSelectedUserIds(prev => 
          prev.includes(userId) 
            ? prev.filter(id => id !== userId) 
            : [...prev, userId]
      );
  };

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Admin: Students</h1>
        <p className="text-sm text-muted-foreground">
          Manage students, roles, and course enrollments.
        </p>
      </header>

      {/* Stats Cards - Clickable */}
      <div className="grid gap-6 grid-cols-2">
          <Card
            className={`cursor-pointer transition-all hover:border-primary/50 ${listFilter === 'paid' ? 'border-primary bg-primary/5' : ''}`}
            onClick={() => setListFilter(listFilter === 'paid' ? null : 'paid')}
          >
              <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <GraduationCap className="h-4 w-4" /> Paid Students
                  </CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="text-xl font-bold">{stats?.paid ?? "-"}</div>
                  <p className="text-xs text-muted-foreground mt-1">Click to view list</p>
              </CardContent>
          </Card>

          <Card
            className={`cursor-pointer transition-all hover:border-primary/50 ${listFilter === 'free' ? 'border-primary bg-primary/5' : ''}`}
            onClick={() => setListFilter(listFilter === 'free' ? null : 'free')}
          >
              <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                       <Users className="h-4 w-4" /> Free Students
                  </CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="text-xl font-bold">{stats?.free ?? "-"}</div>
                  <p className="text-xs text-muted-foreground mt-1">Click to view list</p>
              </CardContent>
          </Card>

          <Card
            className={`cursor-pointer transition-all hover:border-primary/50 ${listFilter === 'teacher' ? 'border-primary bg-primary/5' : ''}`}
            onClick={() => setListFilter(listFilter === 'teacher' ? null : 'teacher')}
          >
              <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <GraduationCap className="h-4 w-4" /> Teachers
                  </CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="text-xl font-bold">{stats?.teachers ?? "-"}</div>
                  <p className="text-xs text-muted-foreground mt-1">Click to view list</p>
              </CardContent>
          </Card>

           <Card
            className={`cursor-pointer transition-all hover:border-primary/50 ${listFilter === 'admin' ? 'border-primary bg-primary/5' : ''}`}
            onClick={() => setListFilter(listFilter === 'admin' ? null : 'admin')}
          >
              <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Shield className="h-4 w-4" /> Admins
                  </CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="text-xl font-bold">{stats?.admins ?? "-"}</div>
                  <p className="text-xs text-muted-foreground mt-1">Click to view list</p>
              </CardContent>
          </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border border-foreground/60">
          <CardHeader>
            <CardTitle className="text-base">Enroll Student</CardTitle>
            <CardDescription>Manually enroll a student into a course.</CardDescription>
          </CardHeader>
          <CardContent>
               <EnrollStudentForm courses={courses || []} />
          </CardContent>
        </Card>
      </div>

      <Card className="border border-foreground/60 min-h-[400px]">
        <CardHeader>
          <CardTitle className="text-base flex justify-between items-center">
              <span>Student List {listFilter ? `(${listFilter.toUpperCase()})` : ""}</span>
              {listFilter && <Button variant="ghost" size="sm" onClick={() => setListFilter(null)}>Clear Filter</Button>}
          </CardTitle>
          <CardDescription className="flex justify-between items-center">
            <span>{listFilter ? "Showing filtered results." : "Select a category above or search to view students."}</span>
            {selectedUserIds.length > 0 && (
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-destructive">{selectedUserIds.length} selected</span>
                    <Button 
                        variant="destructive" 
                        size="sm" 
                        className="h-8"
                        onClick={() => setIsBulkDeleteDialogOpen(true)}
                    >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Bulk Delete
                    </Button>
                </div>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {listFilter === 'paid' && courses && courses.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedCourseFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSearchParams(prev => {
                    prev.set("course", "all");
                    prev.set("page", "0");
                    return prev;
                })}
              >
                All Courses
              </Button>
              {courses.map((course: Pick<Course, "id" | "name">) => (
                <Button
                  key={course.id}
                  variant={selectedCourseFilter === course.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSearchParams(prev => {
                      prev.set("course", course.id);
                      prev.set("page", "0");
                      return prev;
                  })}
                >
                  {course.name}
                </Button>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center w-full">
                <div className="flex-1 w-full sm:max-w-xs">
                     <Input
                        placeholder="Search Name or ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                     />
                </div>
            </div>
          </div>

          {!listFilter && !searchQuery && selectedCourseFilter === 'all' ? (
              <div className="text-center py-12 text-muted-foreground">
                  <p>Click a stats card or use search to view students.</p>
              </div>
          ) : studentsError ? (
            <div className="text-sm text-destructive py-8 text-center">
              Failed to load students: {(studentsError as Error).message}
            </div>
          ) : isLoading ? (
            <div className="text-sm text-muted-foreground">Loading students...</div>
          ) : students.length === 0 ? (
            <div className="text-sm text-muted-foreground">No students found.</div>
          ) : (
            <>
            <div className="w-full overflow-x-auto rounded-md border border-border/60 bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                        <Checkbox 
                            checked={students.length > 0 && selectedUserIds.length === students.length}
                            onCheckedChange={toggleSelectAll}
                        />
                    </TableHead>
                    <TableHead>Registration ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Courses (Access)</TableHead>
                    {(selectedCourseFilter !== 'all' || listFilter === 'paid' || listFilter === 'free') && <TableHead>Enrolled On</TableHead>}
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student: Profile) => (
                    <TableRow key={student.id} className={`${student.status === 'banned' ? "bg-red-50 dark:bg-red-900/10" : ""} ${selectedUserIds.includes(student.id) ? "bg-primary/5" : ""}`}>
                      <TableCell>
                          <Checkbox 
                            checked={selectedUserIds.includes(student.id)}
                            onCheckedChange={() => toggleSelectUser(student.id)}
                          />
                      </TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap">{student.registration_id}</TableCell>
                      <TableCell className="whitespace-nowrap">{student.full_name}</TableCell>
                      <TableCell className="text-xs min-w-[200px]">
                        <div className="flex flex-wrap gap-1">
                            {(student.enrollments || []).map((e: Enrollment) => (
                                <div key={e.id} className="inline-flex items-center gap-1 bg-secondary px-2 py-1 rounded-full border">
                                    <span>{e.courses?.name}</span>
                                    <button
                                        onClick={() => {
                                            if (confirm(`Remove access to ${e.courses?.name} for ${student.full_name}?`)) {
                                                removeEnrollmentMutation.mutate(e.id);
                                            }
                                        }}
                                        className="text-muted-foreground hover:text-destructive transition-colors"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                            {(!student.enrollments || student.enrollments.length === 0) && <span className="text-muted-foreground">-</span>}
                        </div>
                      </TableCell>
                      {(selectedCourseFilter !== 'all' || listFilter === 'paid' || listFilter === 'free') && (
                        <TableCell className="text-xs whitespace-nowrap">
                          {student.enrollments?.[0]?.created_at
                            ? format(new Date(student.enrollments[0].created_at), "dd MMM yyyy")
                            : listFilter === 'free' ? "-" : (student as any).created_at
                              ? format(new Date((student as any).created_at), "dd MMM yyyy")
                              : "-"}
                        </TableCell>
                      )}
                      <TableCell className="text-xs whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            <span className="font-medium">{(student as any).roles?.includes("admin") ? "Admin" : (student as any).roles?.includes("teacher") ? "Teacher" : "Student"}</span>
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {!(student as any).roles?.includes("admin") && (
                                <div className="flex items-center gap-2">
                                    <Label htmlFor={`teacher-switch-${student.id}`} className="text-[10px] text-muted-foreground font-normal">Teacher Access</Label>
                                    <Switch
                                        id={`teacher-switch-${student.id}`}
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        checked={(student as any).roles?.includes("teacher")}
                                        onCheckedChange={(checked) => toggleTeacherRoleMutation.mutate({ userId: student.id, isPromoting: checked })}
                                        disabled={toggleTeacherRoleMutation.isPending}
                                        className="h-4 w-7"
                                    />
                                </div>
                            )}
                        </div>
                      </TableCell>
                      <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${student.status === 'banned' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                              {student.status || 'active'}
                          </span>
                      </TableCell>
                      <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="icon" className="text-primary" onClick={() => navigate(`/admin/student/${student.id}`)} title="View Details">
                                  <Eye className="h-4 w-4" />
                              </Button>
                              {student.status === 'banned' ? (
                                  <Button variant="outline" size="sm" onClick={() => toggleBanMutation.mutate({ userId: student.id, status: 'active' })}>
                                      Unban
                                  </Button>
                              ) : (
                                  <Button variant="ghost" size="icon" className="text-orange-500" onClick={() => toggleBanMutation.mutate({ userId: student.id, status: 'banned' })} title="Ban/Punish">
                                      <Ban className="h-4 w-4" />
                                  </Button>
                              )}
                              <Button variant="ghost" size="icon" className="text-blue-500" onClick={() => setResetPasswordUserId(student.id)} title="Reset Password">
                                  <Key className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-amber-500" onClick={() => setUpdateEmailUserId(student.id)} title="Force Update Email">
                                  <Mail className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-green-600" onClick={() => { if(confirm(`Confirm email for ${student.full_name}?`)) confirmEmailMutation.mutate(student.id) }} title="Confirm Email">
                                  <CheckCircle2 className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { if(confirm("Delete this user?")) deleteUserMutation.mutate(student.id) }} title="Delete">
                                  <Trash2 className="h-4 w-4" />
                              </Button>
                          </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between pt-4">
                 <div className="text-xs text-muted-foreground">
                     Page {page + 1} of {totalPages || 1} ({totalCount} items)
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
                         Next
                         <ChevronRight className="h-4 w-4" />
                     </Button>
                 </div>
            </div>
            </>
          )}
        </CardContent>
      </Card>
      
      {/* Reset Password Dialog */}
      <ResetPasswordDialog userId={resetPasswordUserId} onClose={() => setResetPasswordUserId(null)} />

      {/* Update Email Dialog */}
      <UpdateEmailDialog userId={updateEmailUserId} onClose={() => setUpdateEmailUserId(null)} />
       {/* Bulk Delete Dialog */}
      <Dialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
          <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-5 w-5" />
                        Extreme Caution Required
                    </DialogTitle>
                    <DialogDescription>
                        You are about to permanently delete <strong>{selectedUserIds.length}</strong> user accounts.
                    </DialogDescription>
                </DialogHeader>
                <div className="bg-destructive/10 p-4 rounded-md border border-destructive/20 text-sm space-y-2">
                    <p className="font-semibold text-destructive">This action is irreversible and will:</p>
                    <ul className="list-disc list-inside space-y-1 text-destructive/80">
                        <li>Remove users from Supabase Auth (Authentication)</li>
                        <li>Delete all profile data and registration history</li>
                        <li>Wipe all course enrollments and progress</li>
                        <li>Delete all exam attempts and result certificates</li>
                    </ul>
                </div>
                <div className="flex justify-end gap-3 mt-4">
                    <Button variant="outline" onClick={() => setIsBulkDeleteDialogOpen(false)} disabled={bulkDeleteMutation.isPending}>
                        Cancel
                    </Button>
                    <Button 
                        variant="destructive" 
                        onClick={() => bulkDeleteMutation.mutate(selectedUserIds)}
                        disabled={bulkDeleteMutation.isPending}
                    >
                        {bulkDeleteMutation.isPending ? "Deleting..." : `Yes, Delete ${selectedUserIds.length} Users`}
                    </Button>
                </div>
          </DialogContent>
      </Dialog>
    </section>
  );
};

const ResetPasswordDialog = ({ userId, onClose }: { userId: string | null, onClose: () => void }) => {
    const [newPass, setNewPass] = useState("");
    const { toast } = useToast();
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resetMutation = useMutation<any, any, string>({
        mutationFn: async (password: string) => {
             // @ts-expect-error RPC not in types yet
             const { data, error } = await supabase.rpc('admin_reset_password', {
                p_user_id: userId,
                p_new_password: password
             });
             if (error) throw error;
             return data;
        },
        onSuccess: () => {
            toast({ title: "Password Reset Successful" });
            onClose();
            setNewPass("");
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onError: (err: any) => {
            toast({ title: "Failed to reset password", description: err.message, variant: "destructive" });
        }
    });

    return (
        <Dialog open={!!userId} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Reset Student Password</DialogTitle>
                    <DialogDescription>Enter a new password for this user below.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>New Password</Label>
                        <Input value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Minimum 6 characters" type="text" />
                    </div>
                    <Button onClick={() => resetMutation.mutate(newPass)} disabled={resetMutation.isPending || newPass.length < 6} className="w-full">
                        {resetMutation.isPending ? "Resetting..." : "Force Reset Password"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

const UpdateEmailDialog = ({ userId, onClose }: { userId: string | null, onClose: () => void }) => {
    const [newEmail, setNewEmail] = useState("");
    const { toast } = useToast();
    const queryClient = useQueryClient();
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateEmailMutation = useMutation<any, any, string>({
        mutationFn: async (email: string) => {
             // @ts-expect-error RPC not in types yet
             const { data, error } = await supabase.rpc('admin_update_user_email', {
                p_user_id: userId,
                p_new_email: email
             });
             if (error) throw error;
             return data;
        },
        onSuccess: () => {
            toast({ title: "Email Force-Updated Successfully" });
            queryClient.invalidateQueries({ queryKey: ["admin-students"] });
            onClose();
            setNewEmail("");
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onError: (err: any) => {
            toast({ title: "Failed to update email", description: err.message, variant: "destructive" });
        }
    });

    return (
        <Dialog open={!!userId} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Force Update Email</DialogTitle>
                    <DialogDescription>
                        Instantly update a student's email in Auth. This bypasses all confirmation links.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>New Email Address</Label>
                        <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="new.student@gmail.com" type="email" />
                    </div>
                    <Button onClick={() => updateEmailMutation.mutate(newEmail)} disabled={updateEmailMutation.isPending || !newEmail.includes('@')} className="w-full">
                        {updateEmailMutation.isPending ? "Updating..." : "Force Update Email"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

const EnrollStudentForm = ({ courses }: { courses: Pick<Course, "id" | "name">[] }) => {
    const [registrationId, setRegistrationId] = useState("");
    const [courseId, setCourseId] = useState("");
    const [expiresAt, setExpiresAt] = useState(""); // Optional expiry date
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const enrollMutation = useMutation({
        mutationFn: async () => {
             const { data: profile, error: profileError } = await supabase
                .from("profiles")
                .select("id")
                .eq("registration_id", registrationId)
                .single();

            if (profileError || !profile) {
                throw new Error("Student not found with this Registration ID");
            }

            // Build insert payload
            const insertPayload: any = {
                profile_id: profile.id,
                course_id: courseId,
            };
            if (expiresAt) {
                // expiresAt is a date string like "2026-05-10", convert to end-of-day UTC
                insertPayload.expires_at = new Date(expiresAt + "T23:59:59+06:00").toISOString();
            }

            const { error: enrollError } = await supabase
                .from("enrollments")
                .insert(insertPayload);

            if (enrollError) {
                if (enrollError.code === '23505') throw new Error("Student is already enrolled in this course");
                throw enrollError;
            }
        },
        onSuccess: () => {
            toast({ title: "Student enrolled successfully", description: expiresAt ? `Access expires on ${expiresAt}` : "Permanent access granted." });
            setRegistrationId("");
            setCourseId("");
            setExpiresAt("");
            queryClient.invalidateQueries({ queryKey: ["admin-students"] });
             queryClient.invalidateQueries({ queryKey: ["admin-student-stats"] });
        },
        onError: (error: Error) => {
             toast({ title: "Enrollment failed", description: error.message, variant: "destructive" });
        }
    });

    return (
        <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label>Student Registration ID</Label>
              <Input
                 value={registrationId}
                 onChange={e => setRegistrationId(e.target.value)}
                 placeholder="Enter ID (e.g. 1001)"
              />
            </div>
            <div className="space-y-2">
              <Label>Select Course</Label>
              <Select value={courseId} onValueChange={setCourseId}>
                 <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                 <SelectContent>
                    {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                 </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Access Expiry Date
                <span className="text-xs font-normal text-muted-foreground">(Optional – for trials, giveaways)</span>
              </Label>
              <Input
                 type="date"
                 value={expiresAt}
                 onChange={e => setExpiresAt(e.target.value)}
                 min={new Date().toISOString().split('T')[0]}
              />
              {expiresAt && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  ⏳ Access will expire on <strong>{new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
                </p>
              )}
              {!expiresAt && <p className="text-xs text-muted-foreground">Leave empty for permanent access.</p>}
            </div>
            <Button
              className="w-full"
              onClick={() => enrollMutation.mutate()}
              disabled={!registrationId || !courseId || enrollMutation.isPending}
            >
                {enrollMutation.isPending ? "Enrolling..." : "Enroll"}
            </Button>
        </div>
    );
};

export default AdminStudents;
