import { useEffect, useState, ChangeEvent, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  PenTool, BookOpen, PlusCircle, ArrowRight, RefreshCw, XCircle, 
  Fingerprint, Loader2, Copy, CreditCard, AlertTriangle, ExternalLink, 
  Calendar, User, Mail, Hash, Phone, School, GraduationCap, Users, Binary, Info, Camera
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { startOfWeek, startOfMonth, format, isPast } from "date-fns";
import { useEnrollments } from "@/hooks/useEnrollments";
import { Link, useSearchParams } from "react-router-dom";

const profileSchema = z.object({
  full_name: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal(""))
    .refine(
      (val) => !val || val.trim().split(/\s+/).filter(Boolean).length === 2,
      { message: "নাম অবশ্যই ঠিক ২টা শব্দের হতে হবে (যেমন: Rafi Ahmed)" }
    ),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  school: z.string().trim().max(160).optional().or(z.literal("")),
  batch_year: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((val) => val === "" || (/^\d{4}$/.test(val) && Number(val) >= 2000 && Number(val) <= 2100), {
      message: "Enter a valid year between 2000 and 2100",
    }),
  is_second_timer: z.enum(["yes", "no"]).optional(),
  father_name: z.string().optional(),
  mother_name: z.string().optional(),
  college_name: z.string().optional(),
  hsc_batch: z.string().optional(),
  ssc_gpa: z.coerce.number().min(1).max(5).optional(),
  hsc_gpa: z.coerce.number().min(1).max(5).optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

type ProfileFormValues = z.infer<typeof profileSchema>;

const ProfileDetailItem = ({ label, value }: { label: string, value: string | number | undefined | null }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
        <span className="text-muted-foreground text-xs font-medium">{label}</span>
        <span className="font-bold text-sm text-right pl-4">{value || "-"}</span>
    </div>
);

const StudentProfile = () => {
  const { profile, user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const { data: enrollments } = useEnrollments();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [stats, setStats] = useState<any>(null);
  const [timeRange, setTimeRange] = useState("daily");
  const [isEditing, setIsEditing] = useState(false);
  const [searchParams] = useSearchParams();

  // Deep-link support: /dashboard/profile?complete=gender or ?complete=photo
  // opens edit mode and scrolls/focuses the relevant field. Used by the
  // "profile info missing" reminder toast shown elsewhere in the app.
  useEffect(() => {
    const complete = searchParams.get("complete");
    if (!complete) return;
    setIsEditing(true);
    const target = complete === "photo" ? "avatar-upload" : "gender";
    // Wait a tick for the edit form to render before scrolling/focusing.
    setTimeout(() => {
      const el = document.getElementById(target);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (complete === "photo") {
        el?.closest("div")?.classList.add("ring-2", "ring-primary", "rounded-full");
      } else {
        el?.focus();
      }
    }, 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [updatingEmail, setUpdatingEmail] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | undefined>();
  const turnstileRef = useRef<TurnstileInstance>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Basic validation: only images, max 5MB
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please select an image under 5MB.", variant: "destructive" });
      return;
    }

    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true, cacheControl: "3600" });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      // Cache-bust so the new image shows immediately even though the path is the same
      const bustedUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: bustedUrl })
        .eq("id", user.id);

      if (updateError) throw updateError;

      await refreshProfile();
      toast({ title: "Photo updated", description: "Your profile photo has been saved." });
    } catch (err) {
      console.error("Avatar upload failed:", err);
      toast({ title: "Upload failed", description: "Could not upload your photo. Please try again.", variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  };

  // OMR Credentials
  const [omrRollNo, setOmrRollNo] = useState<string | null>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (profile as any)?.omr_roll_no || null
  );
  const [omrRegNo, setOmrRegNo] = useState<string | null>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (profile as any)?.omr_reg_no || null
  );
  const [generatingOmr, setGeneratingOmr] = useState(false);

  // Fetch payment requests
  const { data: paymentRequests, isLoading: paymentsLoading } = useQuery({
    queryKey: ["student-payments", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await (supabase as any)
        .from("payment_requests")
        .select(`*, courses(name, price), emi_logs(*)`)
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: false });
      if (error) return [];
      return data || [];
    },
    enabled: !!profile?.id,
  });

  useEffect(() => {
    document.title = "Student Profile – Atlas";
    const fetchStats = async () => {
      if (!profile) return;

      let newStats = {
            total_study_time: 0,
            total_class_time: 0,
            total_exam_time: 0,
            flashcards_reviewed: 0,
            todos_completed: 0,
            pomodoros_completed: 0
      };

      if (timeRange === 'all') {
          const { data } = await (supabase as any).from('user_study_data').select('stats').eq('user_id', profile.id).single();
          if (data?.stats) newStats = data.stats;
      } else {
          // Fetch from logs for specific range
          let startDate = new Date();
          const now = new Date();

          if (timeRange === 'daily') {
              startDate = new Date(now.setHours(0,0,0,0));
          } else if (timeRange === 'weekly') {
              startDate = startOfWeek(now, { weekStartsOn: 6 }); // Saturday start
          } else if (timeRange === 'monthly') {
              startDate = startOfMonth(now);
          }

          const { data: logs } = await (supabase as any)
            .from('study_activity_logs')
            .select('activity_type, duration_seconds, metadata')
            .eq('user_id', profile.id)
            .gte('created_at', startDate.toISOString());

          if (logs) {
              logs.forEach(log => {
                  const durationMins = log.duration_seconds ? Math.floor(log.duration_seconds / 60) : 0;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const count = (log.metadata as any)?.count || 0;

                  if (log.activity_type === 'study') newStats.total_study_time += durationMins;
                  else if (log.activity_type === 'class') newStats.total_class_time += durationMins;
                  else if (log.activity_type === 'exam') newStats.total_exam_time += durationMins;
                  else if (log.activity_type === 'flashcard') newStats.flashcards_reviewed += count;
                  else if (log.activity_type === 'pomodoro') newStats.pomodoros_completed += count;
              });
          }
      }
      setStats(newStats);
    };
    fetchStats();
  }, [profile, timeRange]);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: profile?.full_name ?? "",
      phone: profile?.phone ?? "",
      school: profile?.school ?? "",
      batch_year: profile?.batch_year ? String(profile.batch_year) : "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      is_second_timer: (profile as any)?.is_second_timer ? "yes" : "no",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      father_name: (profile as any)?.father_name ?? "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mother_name: (profile as any)?.mother_name ?? "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      college_name: (profile as any)?.college_name ?? "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hsc_batch: (profile as any)?.hsc_batch ?? "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ssc_gpa: (profile as any)?.ssc_gpa ?? 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hsc_gpa: (profile as any)?.hsc_gpa ?? 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gender: (profile as any)?.gender ?? undefined,
    },
    // Using values to update form when profile loads
    values: {
      full_name: profile?.full_name ?? "",
      phone: profile?.phone ?? "",
      school: profile?.school ?? "",
      batch_year: profile?.batch_year ? String(profile.batch_year) : "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      is_second_timer: (profile as any)?.is_second_timer ? "yes" : "no",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      father_name: (profile as any)?.father_name ?? "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mother_name: (profile as any)?.mother_name ?? "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      college_name: (profile as any)?.college_name ?? "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hsc_batch: (profile as any)?.hsc_batch ?? "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ssc_gpa: (profile as any)?.ssc_gpa ?? 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hsc_gpa: (profile as any)?.hsc_gpa ?? 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gender: (profile as any)?.gender ?? undefined,
    },
  });

  const onSubmit = async (values: ProfileFormValues) => {
    if (!profile) return;

    const batchYearNumber = values.batch_year ? Number(values.batch_year) : null;
    const isSecondTimer = values.is_second_timer === "yes";

    const canChangeName = !profile.name_changed_once;
    const nameChanged = canChangeName && values.full_name && values.full_name.trim() !== (profile.full_name || "").trim();

    const updatePayload: any = {
        phone: values.phone || null,
        school: values.school || null,
        batch_year: batchYearNumber,
        is_second_timer: isSecondTimer,
        father_name: values.father_name,
        mother_name: values.mother_name,
        college_name: values.college_name,
        hsc_batch: values.hsc_batch,
        ssc_gpa: values.ssc_gpa,
        hsc_gpa: values.hsc_gpa,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        gender: values.gender as any,
    };

    if (nameChanged) {
        updatePayload.full_name = values.full_name!.trim();
        updatePayload.name_changed_once = true;
    }

    const { error } = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("id", profile.id);

    if (error) {
      toast({
        title: "Could not update profile",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    await refreshProfile();

    toast({
      title: "Profile updated",
      description: "Your profile information has been saved.",
    });
  };

  const handleEmailChange = async () => {
    if (!newEmail || !newEmail.includes('@')) {
        toast({ title: "Invalid Email", variant: "destructive" });
        return;
    }
    if (!profile) return;
    setUpdatingEmail(true);
    try {
        const { error } = await supabase.auth.updateUser(
            { email: newEmail },
            { 
                emailRedirectTo: `${window.location.origin}/dashboard/profile`,
                // @ts-ignore
                captchaToken 
            }
        );
        if (error) throw error;
        const { error: dbError } = await (supabase as any).from('profiles').update({ has_changed_email: true }).eq('id', profile.id);
        if (dbError) throw dbError;
        
        toast({ title: "Verification Sent", description: "Please check your new email's inbox to verify the change." });
        setIsChangingEmail(false);
        // temporarily update locally so button hides without refresh
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (profile as any).has_changed_email = true;
    } catch (e: any) {
        toast({ title: "Error changing email", description: e.message, variant: "destructive" });
        turnstileRef.current?.reset();
        setCaptchaToken(undefined);
    } finally {
        setUpdatingEmail(false);
    }
  };

  const cancelEmailChange = async () => {
    if (!profile || !user) return;
    setUpdatingEmail(true);
    try {
        // Resetting back to current email cancels the pending quest in Supabase
        const { error } = await supabase.auth.updateUser({ email: user.email });
        if (error) throw error;

        // Reset the flag so they can try again
        const { error: dbError } = await (supabase as any).from('profiles').update({ has_changed_email: false }).eq('id', profile.id);
        if (dbError) throw dbError;

        toast({ title: "Change Canceled", description: "Pending email change has been cleared." });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (profile as any).has_changed_email = false;
        
        // Refresh local session
        await supabase.auth.refreshSession();
        window.location.reload();
    } catch (e: any) {
        toast({ title: "Failed to cancel", description: e.message, variant: "destructive" });
    } finally {
        setUpdatingEmail(false);
    }
  };

  const handleGenerateOmrCredentials = async () => {
    setGeneratingOmr(true);
    try {
      const { data, error } = await (supabase as any).rpc('generate_omr_credentials');
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = data as any;
      setOmrRollNo(result.omr_roll_no);
      setOmrRegNo(result.omr_reg_no);
      toast({
        title: result.already_generated ? "OMR Credentials" : "✅ Credentials Generated!",
        description: result.already_generated
          ? "Your OMR credentials were already generated."
          : `Roll No: ${result.omr_roll_no} • Reg No: ${result.omr_reg_no}`,
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setGeneratingOmr(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: `${label} copied to clipboard.` });
  };

  const formatDuration = (minutes: number) => {
      if (!minutes) return "0m";
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const sscGpa = form.watch("ssc_gpa") || 0;
  const hscGpa = form.watch("hsc_gpa") || 0;
  const gpaScore = (sscGpa * 8) + (hscGpa * 12);

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Student Profile</h1>
        <p className="text-sm text-muted-foreground">
          Track your progress and manage your account details.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-2 items-start">
        {/* Left Column (Details & Payments) */}
        <div className="space-y-8 flex flex-col">
          {/* Profile Card (Compact vs Edit) */}
          <Card className="border border-foreground/60 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                    <CardTitle className="text-base">Personal Details</CardTitle>
                    <CardDescription>
                        {isEditing ? "Update your contact and academic information." : "Your registered profile information."}
                    </CardDescription>
                </div>
                {!isEditing && (
                    <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)}>
                        <PenTool className="h-4 w-4 mr-2" /> Edit Profile
                    </Button>
                )}
            </CardHeader>
            <CardContent>
            {profile && (
                <div className="flex flex-col items-center gap-3 pb-4 mb-4 border-b border-border/50">
                    <div className="relative">
                        <Avatar className="h-32 w-24 rounded-lg border-2 border-border">
                            <AvatarImage src={profile.avatar_url || undefined} alt={profile.full_name || "Profile"} className="rounded-lg object-cover" />
                            <AvatarFallback className="rounded-lg bg-muted" />
                        </Avatar>
                        <label
                            htmlFor="avatar-upload"
                            className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-colors shadow-sm"
                        >
                            {uploadingAvatar ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Camera className="h-4 w-4" />
                            )}
                        </label>
                        <input
                            id="avatar-upload"
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleAvatarUpload}
                            disabled={uploadingAvatar}
                        />
                    </div>
                    <div className="text-center min-w-0">
                        <p className="text-sm font-semibold truncate">{profile.full_name || "Student"}</p>
                        <p className="text-xs text-muted-foreground">Tap the camera icon to update your profile photo.</p>
                    </div>
                </div>
            )}
            {profile ? (
                isEditing ? (
                    <form className="space-y-4" onSubmit={form.handleSubmit((v) => { onSubmit(v); setIsEditing(false); })}>
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="full_name">Full name</Label>
                                <Input id="full_name" {...form.register("full_name")} disabled={profile.name_changed_once} />
                                {profile.name_changed_once ? (
                                    <p className="text-xs text-muted-foreground">নাম একবার পরিবর্তন করা হয়ে গেছে, আর পরিবর্তন করা যাবে না।</p>
                                ) : (
                                    <p className="text-xs text-muted-foreground">শুধু একবার পরিবর্তন করা যাবে — নাম অবশ্যই ২টা শব্দের হতে হবে (যেমন: Rafi Ahmed)।</p>
                                )}
                                {form.formState.errors.full_name && (
                                    <p className="text-xs text-destructive">{form.formState.errors.full_name.message}</p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label>Registration ID</Label>
                                <Input value={profile.registration_id} disabled className="bg-muted" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="phone">Phone</Label>
                                <Input id="phone" {...form.register("phone")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="gender">Gender</Label>
                                <Select
                                value={form.watch("gender")}
                                onValueChange={(val: "male" | "female" | "other") => form.setValue("gender", val)}
                                >
                                <SelectTrigger id="gender">
                                    <SelectValue placeholder="Select gender" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="male">Male</SelectItem>
                                    <SelectItem value="female">Female</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="father_name">Father's Name</Label>
                                <Input id="father_name" {...form.register("father_name")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="mother_name">Mother's Name</Label>
                                <Input id="mother_name" {...form.register("mother_name")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="college_name">College Name</Label>
                                <Input id="college_name" {...form.register("college_name")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="hsc_batch">HSC Batch</Label>
                                <Input id="hsc_batch" {...form.register("hsc_batch")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="school">School / College</Label>
                                <Input id="school" {...form.register("school")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="ssc_gpa">SSC GPA</Label>
                                <Input id="ssc_gpa" type="number" step="0.01" {...form.register("ssc_gpa")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="hsc_gpa">HSC GPA</Label>
                                <Input id="hsc_gpa" type="number" step="0.01" {...form.register("hsc_gpa")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="batch_year">Batch year</Label>
                                <Input id="batch_year" placeholder="2025" {...form.register("batch_year")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="is_second_timer">Second Timer?</Label>
                                <Select
                                value={form.watch("is_second_timer")}
                                onValueChange={(val: "yes" | "no") => form.setValue("is_second_timer", val)}
                                >
                                <SelectTrigger id="is_second_timer">
                                    <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="no">No</SelectItem>
                                    <SelectItem value="yes">Yes</SelectItem>
                                </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="pt-2 flex justify-end gap-2 border-t mt-4">
                            <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                                Cancel
                            </Button>
                            <Button type="submit">
                                Save Changes
                            </Button>
                        </div>
                    </form>
                ) : (
                    <div className="divide-y divide-border/40">
                        {/* Identity Group */}
                        <div className="pb-4">
                            <ProfileDetailItem label="Full Name" value={profile.full_name} />
                            <div className="flex items-center justify-between py-2.5 border-b border-border/50">
                                <span className="text-muted-foreground text-xs font-medium">Email</span>
                                <div className="flex flex-col items-end gap-1">
                                    <span className="font-bold text-sm">{user?.email}</span>
                                    {user?.new_email && (
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] text-amber-600 font-medium italic">Pending: {user.new_email}</span>
                                            <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => window.location.reload()}><RefreshCw className="h-3 w-3" /></Button>
                                            <Button variant="ghost" size="icon" className="h-4 w-4 text-destructive" onClick={cancelEmailChange} disabled={updatingEmail}><XCircle className="h-3 w-3" /></Button>
                                        </div>
                                    )}
                                    {!(profile as any).has_changed_email && (
                                        <Button variant="link" size="sm" className="h-auto p-0 text-xs text-primary" onClick={() => setIsChangingEmail(true)}>Change Email</Button>
                                    )}
                                </div>
                            </div>
                            <ProfileDetailItem label="Registration ID" value={profile.registration_id} />
                            <ProfileDetailItem label="Phone" value={profile.phone} />
                            <ProfileDetailItem
                                label="Joining Date & Time"
                                value={profile.created_at ? format(new Date(profile.created_at), 'PPPp') : "-"}
                            />
                        </div>

                        {/* Academic Group */}
                        <div className="py-4">
                            <h4 className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-2 px-1">Academic</h4>
                            <ProfileDetailItem label="College" value={(profile as any).college_name} />
                            <ProfileDetailItem label="HSC Batch" value={(profile as any).hsc_batch} />
                            <ProfileDetailItem label="Second Timer" value={(profile as any).is_second_timer ? "Yes" : "No"} />
                            <ProfileDetailItem label="SSC GPA" value={(profile as any).ssc_gpa} />
                            <ProfileDetailItem label="HSC GPA" value={(profile as any).hsc_gpa} />
                        </div>

                        {/* Guardian Group */}
                        <div className="pt-4 pb-2">
                            <h4 className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-2 px-1">Guardians</h4>
                            <ProfileDetailItem label="Father's Name" value={(profile as any).father_name} />
                            <ProfileDetailItem label="Mother's Name" value={(profile as any).mother_name} />
                        </div>
                    </div>
                )
            ) : (
                <p className="text-sm text-muted-foreground">Loading profile…</p>
            )}
            </CardContent>
        </Card>

        {/* OMR Credentials Card */}
        <Card className="border border-violet-200 dark:border-violet-800/40 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                <Fingerprint className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <CardTitle className="text-base">OMR Credentials</CardTitle>
                <CardDescription>Your unique Roll No & Reg No for OMR answer sheets</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {omrRollNo && omrRegNo ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800/30">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Roll No</p>
                      <p className="text-2xl font-bold font-mono tracking-[0.3em] text-violet-700 dark:text-violet-300 mt-1">{omrRollNo}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(omrRollNo, "Roll No")}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-xl bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800/30">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Reg No</p>
                      <p className="text-2xl font-bold font-mono tracking-[0.3em] text-violet-700 dark:text-violet-300 mt-1">{omrRegNo}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(omrRegNo, "Reg No")}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">✏️ Write these numbers on your OMR answer sheet by filling the corresponding bubbles. These are permanently assigned to your account.</p>
              </div>
            ) : (
              <div className="text-center py-6 space-y-4">
                <div className="flex flex-col items-center gap-2">
                  <Fingerprint className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">You haven't generated your OMR credentials yet.</p>
                  <p className="text-xs text-muted-foreground/80 max-w-sm">Generate unique Roll No & Reg No to use on your OMR answer sheets. This is a one-time generation.</p>
                </div>
                <Button onClick={handleGenerateOmrCredentials} disabled={generatingOmr} className="rounded-full px-6 bg-violet-600 hover:bg-violet-700">
                  {generatingOmr ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                  ) : (
                    <><Fingerprint className="h-4 w-4 mr-2" /> Generate OMR Credentials</>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payments Section (Natively displayed) */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">Payment History & Invoices</h2>
          {paymentsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" /></div>
          ) : !paymentRequests || paymentRequests.length === 0 ? (
            <div className="text-center py-10 px-4 bg-muted/20 border border-dashed rounded-lg shadow-sm">
               <div className="h-10 w-10 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                  <CreditCard className="h-4 w-4 text-muted-foreground opacity-50" />
               </div>
               <h3 className="font-semibold text-base">No Payment Records</h3>
               <p className="text-xs text-muted-foreground mt-1 mx-auto">You haven't made any course purchases yet.</p>
            </div>
          ) : (
            <div className="grid gap-4 pb-6">
              {paymentRequests.map((payment: any) => {
                const remaining = (payment.due_amount || 0) - (payment.amount_paid || 0);
                const isOverdue = payment.due_date && isPast(new Date(payment.due_date)) && remaining > 0;
                return (
                  <div key={payment.id} className={`p-4 sm:p-5 rounded-xl border shadow-sm transition-colors bg-background hover:border-primary/50 ${isOverdue ? 'border-red-200 bg-red-50/10 dark:bg-red-950/10' : ''}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                      <div>
                        <div className="font-bold text-base">{payment.courses?.name || "Unknown Course"}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(payment.created_at), 'PPP')}</div>
                      </div>
                      <Badge variant={payment.status === 'approved' ? 'default' : payment.status === 'rejected' ? 'destructive' : 'secondary'} className="capitalize w-fit">
                        {payment.status}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm bg-muted/20 p-3 rounded-lg border">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider mb-1">Amount Sent</p>
                        <p className="font-bold text-green-700">৳{payment.amount_sent || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider mb-1">Method</p>
                        <p className="font-semibold capitalize text-xs">{payment.payment_method}</p>
                      </div>
                      <div className="col-span-2 sm:col-span-2">
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider mb-1">Txn ID</p>
                        <p className="font-mono font-medium text-xs truncate max-w-full">{payment.sender_last5 || payment.trx_id || "N/A"}</p>
                      </div>
                      {payment.due_amount && payment.due_amount > 0 && (
                        <>
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider mb-1">Total Due</p>
                            <p className="font-bold text-amber-700">৳{payment.due_amount}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider mb-1">Remaining</p>
                            <p className={`font-bold text-base ${remaining > 0 ? 'text-amber-700' : 'text-green-600'}`}>৳{Math.max(0, remaining)}</p>
                          </div>
                          {payment.due_date && remaining > 0 && (
                            <div className="sm:col-span-2">
                              <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider mb-1">Pay By</p>
                              <p className={`font-bold text-xs flex items-center gap-1.5 ${isOverdue ? 'text-red-600' : ''}`}>
                                {isOverdue && <AlertTriangle className="h-3 w-3" />}
                                {format(new Date(payment.due_date), "dd MMM yyyy")}
                                {isOverdue && <span className="text-[9px] bg-red-100 text-red-700 px-1 py-0.5 rounded uppercase font-bold ml-1">Overdue</span>}
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {payment.admin_note && (
                      <div className="mt-3 text-xs text-muted-foreground bg-amber-50/50 p-2.5 rounded-md border border-amber-200 flex items-start gap-2">
                        <span className="text-base leading-none">📝</span>
                        <div>
                            <strong className="block text-amber-800 mb-0.5">Admin Note:</strong>
                            {payment.admin_note}
                        </div>
                      </div>
                    )}
                    
                    {payment.emi_logs && payment.emi_logs.length > 0 && (
                      <div className="mt-4 pt-3 border-t">
                        <h5 className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-wider">Partial Payments Log</h5>
                        <div className="space-y-1.5">
                          {payment.emi_logs.sort((a: any, b: any) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()).map((log: any) => (
                            <div key={log.id} className="flex justify-between items-center bg-muted/30 p-2 rounded-md text-xs">
                              <div>
                                <div className="font-bold text-green-700">+৳{log.amount}</div>
                                <div className="text-[9px] text-muted-foreground">{format(new Date(log.recorded_at), 'PPp')}</div>
                              </div>
                              {log.admin_note && (
                                <div className="text-right text-muted-foreground max-w-[50%] truncate italic text-[10px]">
                                  "{log.admin_note}"
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
        </div>
      </div>

      {/* Right Column (Courses) */}
      <div className="space-y-8 flex flex-col">
        {/* Enrolled Courses Section */}
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight">My Courses</h2>
                <Button size="sm" variant="outline" className="h-8 gap-1" asChild>
                    <Link to="/">
                        <PlusCircle className="h-3.5 w-3.5" /> Buy More
                    </Link>
                </Button>
            </div>
            
            <Card className="border border-border/60 shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-muted/30">
                        <TableRow>
                            <TableHead className="w-12 text-center">#</TableHead>
                            <TableHead>Course Name</TableHead>
                            <TableHead className="hidden sm:table-cell">Enrolled Date</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {enrollments?.filter(e => !(e as any).is_extra).length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                    No courses found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            enrollments?.filter(e => !(e as any).is_extra).map((enrollment, index) => (
                                <TableRow key={enrollment.id} className="group">
                                    <TableCell className="text-center font-medium text-muted-foreground">{index + 1}</TableCell>
                                    <TableCell className="font-bold">
                                        <div className="flex flex-col">
                                            <span>{enrollment.course?.name || "Unknown Course"}</span>
                                            <span className="text-[10px] sm:hidden text-muted-foreground font-normal">
                                                Enrolled: {new Date(enrollment.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="h-3.5 w-3.5" />
                                            {new Date(enrollment.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button asChild variant="ghost" size="sm" className="h-8 pr-0 hover:bg-transparent hover:text-primary transition-colors">
                                            <Link to={`/dashboard/course/${enrollment.course_id}`}>
                                                <span className="hidden sm:inline mr-1">Enter</span> <ArrowRight className="h-3.5 w-3.5" />
                                            </Link>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </Card>
        </div>
      </div>
      </div>

      <Dialog open={isChangingEmail} onOpenChange={setIsChangingEmail}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Change Email Address</DialogTitle>
                <DialogDescription>
                    You can change your email address only <strong>once</strong>. A verification link will be sent to your new email. 
                    <br /><br />
                    <strong>Note:</strong> Your User ID and Password will remain exactly the same. Only the email used for login and notifications will be updated.
                    <br /><br />
                    <span className="text-xs text-muted-foreground italic">Stuck? If you don't receive the email, please contact the admin to force-update your email.</span>
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
                <div className="space-y-2">
                    <Label>New Email Address</Label>
                    <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email" placeholder="new.email@gmail.com" />
                </div>
                <div className="flex justify-center py-2">
                    <Turnstile
                        ref={turnstileRef}
                        siteKey="0x4AAAAAAEh9uwZCk2LnDkH7"
                        onSuccess={(token) => setCaptchaToken(token)}
                        onExpire={() => setCaptchaToken(undefined)}
                        onError={() => setCaptchaToken(undefined)}
                    />
                </div>
                <Button onClick={handleEmailChange} disabled={updatingEmail || !captchaToken} className="w-full">
                    {updatingEmail ? "Sending Verification..." : "Send Verification Link"}
                </Button>
            </div>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default StudentProfile;
