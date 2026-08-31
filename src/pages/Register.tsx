import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import PublicHeader from "@/components/PublicHeader";
import { Eye, EyeOff, AlertTriangle, PhoneCall, MessageCircle, Send, User } from "lucide-react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

const Register = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSecondTimer, setIsSecondTimer] = useState(false);
  const [hscBatch, setHscBatch] = useState("2025");
  const [hscGpa, setHscGpa] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | undefined>();
  const turnstileRef = useRef<TurnstileInstance>(null);
  const [gender, setGender] = useState("");
  const [duplicatePhone, setDuplicatePhone] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [passwordLength, setPasswordLength] = useState(0);

  useEffect(() => {
    if (hscBatch === "2026" || hscBatch === "2027") {
      setHscGpa("5.00");
    }
  }, [hscBatch]);

  useEffect(() => {
    document.title = "Register – Medihour";
  }, []);

  const convertToEnglishDigits = (str: string) => {
    const bengaliToEnglish: Record<string, string> = {
      '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
      '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
    };
    return str.split('').map(char => bengaliToEnglish[char] || char).join('');
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please select an image under 5MB.", variant: "destructive" });
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const fullName = formData.get("fullName") as string;
    const fatherName = formData.get("fatherName") as string;
    const motherName = formData.get("motherName") as string;
    // const registrationId = formData.get("registrationId") as string; // Optional or generated
    const rawPhone = formData.get("phone") as string;
    const phone = convertToEnglishDigits(rawPhone).trim();
    const emailInput = formData.get("email") as string;
    const hscBatch = formData.get("hscBatch") as string;
    const collegeName = formData.get("collegeName") as string;
    const sscGpa = formData.get("sscGpa") as string;
    const hscGpaForm = formData.get("hscGpa") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (!gender) {
      toast({
        title: "Registration failed",
        description: "Please select your gender",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    if (collegeName.trim().length < 10) {
      toast({
        title: "Registration failed",
        description: "Please provide your Full college name",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Registration failed",
        description: "Passwords do not match",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const validPrefixes = ['013', '014', '015', '016', '017', '018', '019'];
    if (phone.length !== 11 || !validPrefixes.some(prefix => phone.startsWith(prefix))) {
      toast({
        title: "Registration failed",
        description: "Please enter a valid 11-digit phone number starting with a recognized prefix.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    try {
      // 0. Check if phone already exists
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("phone", phone)
        .maybeSingle();

      if (existingProfile) {
        setDuplicatePhone(phone);
        setLoading(false);
        turnstileRef.current?.reset();
        setCaptchaToken(undefined);
        return;
      }
      // 1. Determine Auth Email Strategy
      // If user provided a real email, use it. Otherwise, fallback to phone logic?
      // Requirement: "Real Email" preferred. We make email mandatory in UI now.

      const email = emailInput.trim().toLowerCase();

      // Check if email is valid format roughly
      if (!email || !email.includes('@')) {
        throw new Error("Please provide a valid email address.");
      }

      const emailDomain = email.split('@')[1];
      const allowedDomains = ['medihour.com', 'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'];
      if (!allowedDomains.includes(emailDomain)) {
        throw new Error("Only Gmail, Yahoo, Outlook, or Hotmail accounts are allowed.");
      }

      // 2. Create the user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          captchaToken,
          data: {
            full_name: fullName,
            father_name: fatherName,
            mother_name: motherName,
            hsc_batch: hscBatch,
            college_name: collegeName,
            ssc_gpa: sscGpa,
            hsc_gpa: hscGpaForm,
            phone: phone,
            gender: gender,
            is_second_timer: isSecondTimer,
          }
        }
      });

      if (authError) {
        throw authError;
      }

      if (!authData.user) {
        throw new Error("No user returned from sign up. Please check your email for verification.");
      }

      // Note: The public.profiles insertion is now handled safely by a database trigger (handle_new_user)
      // which automatically runs when the user is created in Supabase Auth. This prevents issues when email verification is required.

      // Optional photo upload (non-blocking — registration succeeds even if this fails)
      if (photoFile) {
        try {
          const ext = photoFile.name.split(".").pop() || "jpg";
          const filePath = `${authData.user.id}/avatar.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from("avatars")
            .upload(filePath, photoFile, { upsert: true, cacheControl: "3600" });
          if (!uploadError) {
            const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
            await supabase.from("profiles").update({ avatar_url: `${publicUrlData.publicUrl}?t=${Date.now()}` }).eq("id", authData.user.id);
          }
        } catch (photoErr) {
          console.error("Photo upload failed (non-blocking):", photoErr);
        }
      }

      toast({
        title: "Registration successful",
        description: "Account created! Redirecting...",
      });

      if (authData.session) {
        navigate(location.state?.from || "/dashboard", { replace: true });
      } else {
        navigate("/login", { state: { from: location.state?.from } });
      }

    } catch (error: any) {
      console.error("Registration error:", error);
      toast({
        title: "Registration failed",
        description: error.message || "An error occurred during registration",
        variant: "destructive",
      });
      turnstileRef.current?.reset();
      setCaptchaToken(undefined);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicHeader />
      <main className="flex min-h-screen items-center justify-center px-4 pt-[92px] pb-10">
        <Card className="w-full max-w-xl overflow-hidden rounded-[26px] border border-[#f3d9e3] bg-gradient-to-br from-white via-white to-[#fff7fa] shadow-[0_25px_60px_rgba(237,52,125,0.14)] dark:border-white/10 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900">
          <div className="h-[5px] w-full bg-gradient-to-r from-[#f5327a] via-[#ff6b8d] to-[#e9287a]" />
          <CardHeader className="space-y-3 pb-2 pt-7 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f5327a] to-[#e9287a] shadow-[0_10px_25px_rgba(239,45,117,0.3)]">
              <img src="/logo.png" alt="Medihour" className="h-9 w-9 object-contain brightness-0 invert" />
            </div>
            <div>
              <CardTitle className="text-2xl font-black tracking-tight text-[#1f2328] dark:text-white">নতুন অ্যাকাউন্ট তৈরি করুন</CardTitle>
              <CardDescription className="mt-1 text-[13px] text-muted-foreground">Medihour পরিবারে যুক্ত হও</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {/* Duplicate Phone Alert */}
            {duplicatePhone && (
              <div className="mb-4 rounded-lg border-2 border-red-400 bg-red-50 dark:bg-red-950/30 dark:border-red-700 p-4 animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="flex items-start gap-3">
                  <PhoneCall className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                  <div className="space-y-2">
                    <p className="font-bold text-red-700 dark:text-red-400">এই ফোন নম্বরটি আগেই রেজিস্ট্রেশন করা হয়েছে!</p>
                    <p className="text-sm text-red-600 dark:text-red-300">
                      <span className="font-mono font-bold">{duplicatePhone}</span> নম্বর দিয়ে আগেই একটি অ্যাকাউন্ট আছে।
                      যদি সাহায্য দরকার হয়, আমাদের সাথে যোগাযোগ করুন:
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <a
                        href="https://wa.me/8801639787547"
                        target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] text-white text-xs font-semibold px-3 py-1.5 hover:opacity-90 transition-opacity"
                      >
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                      </a>
                      <a
                        href="https://t.me/rafi_somc"
                        target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#0088cc] text-white text-xs font-semibold px-3 py-1.5 hover:opacity-90 transition-opacity"
                      >
                        <Send className="h-3.5 w-3.5" /> Telegram
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="flex flex-col items-center gap-2 pb-2">
                <div className="relative">
                  <div className="h-20 w-20 rounded-full border-2 border-dashed border-muted-foreground/40 overflow-hidden flex items-center justify-center bg-muted">
                    {photoPreview ? (
                      <img src={photoPreview} alt="Preview" className="h-full w-full object-cover" />
                    ) : (
                      <User className="h-8 w-8 text-muted-foreground/50" />
                    )}
                  </div>
                  <label
                    htmlFor="photoUpload"
                    className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer text-xs"
                    title="Upload photo"
                  >
                    +
                  </label>
                  <input id="photoUpload" type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
                </div>
                <p className="text-xs text-muted-foreground">Profile Photo (Optional)</p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Own Full Name</Label>
                  <Input id="fullName" name="fullName" required placeholder="Your full name" className="h-11 rounded-xl border-[#e8dde3] text-[15px] shadow-sm transition-all placeholder:text-muted-foreground/60 focus-visible:border-[#ed347d] focus-visible:ring-[#ed347d]/20 dark:border-white/10" />
                  <p className="text-[11px] text-orange-600/90 dark:text-orange-400">Please provide your full name.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input id="phone" name="phone" required placeholder="01XXXXXXXXX" className="h-11 rounded-xl border-[#e8dde3] text-[15px] shadow-sm transition-all placeholder:text-muted-foreground/60 focus-visible:border-[#ed347d] focus-visible:ring-[#ed347d]/20 dark:border-white/10" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gender">Gender <span className="text-red-500">*</span></Label>
                  <Select value={gender} onValueChange={setGender}>
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
                  <Label htmlFor="email">Email Address <span className="text-red-500">*</span></Label>
                  <Input id="email" name="email" type="email" required placeholder="user@example.com" className="h-11 rounded-xl border-[#e8dde3] text-[15px] shadow-sm transition-all placeholder:text-muted-foreground/60 focus-visible:border-[#ed347d] focus-visible:ring-[#ed347d]/20 dark:border-white/10" />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="fatherName">Father's Full Name</Label>
                  <Input id="fatherName" name="fatherName" required placeholder="Father's full name" className="h-11 rounded-xl border-[#e8dde3] text-[15px] shadow-sm transition-all placeholder:text-muted-foreground/60 focus-visible:border-[#ed347d] focus-visible:ring-[#ed347d]/20 dark:border-white/10" />
                  <p className="text-[11px] text-orange-600/90 dark:text-orange-400">Please provide father's full name.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="motherName">Mother's Full Name</Label>
                  <Input id="motherName" name="motherName" required placeholder="Mother's full name" className="h-11 rounded-xl border-[#e8dde3] text-[15px] shadow-sm transition-all placeholder:text-muted-foreground/60 focus-visible:border-[#ed347d] focus-visible:ring-[#ed347d]/20 dark:border-white/10" />
                  <p className="text-[11px] text-orange-600/90 dark:text-orange-400">Please provide mother's full name.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="collegeName">Full College Name</Label>
                  <Input id="collegeName" name="collegeName" required placeholder="Your full college name" className="h-11 rounded-xl border-[#e8dde3] text-[15px] shadow-sm transition-all placeholder:text-muted-foreground/60 focus-visible:border-[#ed347d] focus-visible:ring-[#ed347d]/20 dark:border-white/10" />
                  <p className="text-[11px] text-orange-600/90 dark:text-orange-400">Please provide your full college name.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hscBatch">HSC Batch</Label>
                  <select
                    id="hscBatch"
                    name="hscBatch"
                    value={hscBatch}
                    onChange={(e) => setHscBatch(e.target.value)}
                    required
                    className="flex h-11 w-full rounded-xl border border-[#e8dde3] bg-background px-3 py-2 text-[15px] shadow-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-[#ed347d] focus-visible:ring-2 focus-visible:ring-[#ed347d]/20 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10"
                  >
                    <option value="2025">2025</option>
                    <option value="2026">2026</option>
                    <option value="2027">2027</option>
                    <option value="2028">2028</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sscGpa">SSC GPA (Out of 5)</Label>
                  <Input id="sscGpa" name="sscGpa" type="number" step="0.01" max="5.00" min="1.00" required placeholder="5.00" className="h-11 rounded-xl border-[#e8dde3] text-[15px] shadow-sm transition-all placeholder:text-muted-foreground/60 focus-visible:border-[#ed347d] focus-visible:ring-[#ed347d]/20 dark:border-white/10" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="hscGpa">HSC GPA (Optional)</Label>
                  <Input
                    id="hscGpa"
                    name="hscGpa"
                    type="number"
                    step="0.01"
                    max="5.00"
                    min="0.00"
                    placeholder="5.00"
                    value={hscGpa}
                    onChange={(e) => setHscGpa(e.target.value)}
                    className="h-11 rounded-xl border-[#e8dde3] text-[15px] shadow-sm transition-all placeholder:text-muted-foreground/60 focus-visible:border-[#ed347d] focus-visible:ring-[#ed347d]/20 dark:border-white/10"
                  />
                  <p className="text-[11px] text-orange-600/90 dark:text-orange-400">If you have not given HSC exam yet, please fill 5.00</p>
                </div>
              </div>

              <div className="flex items-center space-x-2 py-2">
                <Checkbox
                  id="isSecondTimer"
                  checked={isSecondTimer}
                  onCheckedChange={(checked) => setIsSecondTimer(checked as boolean)}
                />
                <Label htmlFor="isSecondTimer" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  I am a Second Timer Student
                </Label>
              </div>

              <div className="flex items-start space-x-2 py-2">
                <Checkbox
                  id="acknowledgement"
                  required
                />
                <Label htmlFor="acknowledgement" className="text-sm font-medium leading-tight peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  আমি স্বীকার করছি যে উপরে দেওয়া সকল তথ্য সঠিক। ভুয়া বা ভুল নম্বর ও তথ্য দিলে জরিমানা বা একাউন্ট বাতিল হতে পারে। (I acknowledge that providing fake information may result in fine or account suspension.)
                </Label>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="password">Password <span className="font-normal text-muted-foreground">(কমপক্ষে ৬ অক্ষর)</span></Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      required
                      onChange={(e) => setPasswordLength(e.target.value.length)}
                      className="login-caret h-11 rounded-xl border-[#e8dde3] pr-10 text-[15px] tracking-wide shadow-sm transition-all focus-visible:border-[#ed347d] focus-visible:ring-[#ed347d]/20 dark:border-white/10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="sr-only">Toggle password visibility</span>
                    </Button>
                  </div>
                  <div className="flex items-center justify-end gap-1.5 pr-0.5">
                    <span className={`text-[11px] font-bold transition-colors ${passwordLength >= 6 ? "text-emerald-500" : "text-[#ed347d]"}`}>
                      {passwordLength} অক্ষর
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      className="login-caret h-11 rounded-xl border-[#e8dde3] pr-10 text-[15px] tracking-wide shadow-sm transition-all focus-visible:border-[#ed347d] focus-visible:ring-[#ed347d]/20 dark:border-white/10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="sr-only">Toggle password visibility</span>
                    </Button>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50 via-orange-50/60 to-white shadow-[0_8px_25px_rgba(245,158,11,0.1)] dark:border-amber-500/20 dark:from-amber-950/30 dark:via-amber-900/10 dark:to-transparent">
                <div className="flex items-start gap-3 p-4">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-[0_6px_16px_rgba(245,158,11,0.3)]">
                    <AlertTriangle className="h-4.5 w-4.5 text-white" />
                  </div>
                  <div className="space-y-1 text-[13px] text-amber-900 dark:text-amber-200">
                    <p className="mb-1 text-sm font-black tracking-tight">সতর্কবার্তা!</p>
                    <p className="leading-relaxed text-amber-800/90 dark:text-amber-200/80">আপনার ফোন নম্বর এবং পাসওয়ার্ড মনে রাখুন এবং কোথাও লিখে রাখুন।</p>
                    <p className="font-bold text-red-600 dark:text-red-400">অবশ্যই নিজের সচল ইমেইল দিবেন।</p>
                  </div>
                </div>
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

              <div className="flex items-start space-x-2 py-2 mt-2 mb-1">
                <Checkbox
                  id="termsConfirm"
                  required
                />
                <Label htmlFor="termsConfirm" className="text-sm font-medium leading-tight peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  I confirm the information I provided is accurate. (আমি নিশ্চিত করছি যে প্রদত্ত তথ্য সঠিক।)
                </Label>
              </div>

              <Button
                type="submit"
                className="mt-4 h-12 w-full rounded-xl bg-gradient-to-r from-[#f5327a] to-[#e9287a] text-[15px] font-bold shadow-[0_10px_25px_rgba(239,45,117,0.28)] transition-transform hover:scale-[1.015] hover:shadow-[0_14px_30px_rgba(239,45,117,0.36)]"
                disabled={loading || !captchaToken}
              >
                {loading ? "একাউন্ট তৈরি হচ্ছে..." : "রেজিস্ট্রেশন করুন"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Register;
