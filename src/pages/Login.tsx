import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PublicHeader from "@/components/PublicHeader";
import { Eye, EyeOff, LayoutDashboard, LogOut, AlertTriangle, Send, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const TELEGRAM_SUPPORT_BOT = "https://t.me/MedihourWeb_Robot";
const WHATSAPP_HELPLINE = "https://wa.me/8801639787547";

function buildTelegramSupportLink(errorMessage: string, identifier: string) {
  const text = `আসসালামু আলাইকুম, আমি লগইন করতে সমস্যায় পড়েছি।\nEmail/ID: ${identifier || "(দেওয়া হয়নি)"}\nError: ${errorMessage}\nদয়া করে সাহায্য করুন।`;
  return `${TELEGRAM_SUPPORT_BOT}?text=${encodeURIComponent(text)}`;
}

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, user, signOut, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | undefined>();
  const turnstileRef = useRef<TurnstileInstance>(null);
  const [loginError, setLoginError] = useState<{ message: string; identifier: string } | null>(null);
  const [passwordLength, setPasswordLength] = useState(0);
  const [loginSuccess, setLoginSuccess] = useState(false);

  useEffect(() => {
    document.title = "Login – MediHour";

    const params = new URLSearchParams(location.search);
    const reason = params.get("reason");

    if (reason === "session_mismatch" && user) {
      signOut();
      return;
    }
  }, [user, navigate, location.search, signOut]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const identifier = formData.get("identifier") as string; // Changed from registrationId to identifier
    const password = formData.get("password") as string;

    const { error } = await signIn(identifier, password, captchaToken);

    if (error) {
      setLoginError({ message: error.message || "Invalid credentials", identifier });
      setLoading(false);
      turnstileRef.current?.reset();
      setCaptchaToken(undefined);
    } else {
      // Fetch user roles quickly to decide redirect
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      const destination = profileData && (profileData.role === 'admin' || profileData.role === 'teacher') ? "/admin" : "/dashboard";

      setLoading(false);
      setLoginSuccess(true);
      setTimeout(() => navigate(destination), 1400);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicHeader />
      <main className="flex min-h-screen items-center justify-center px-4 pt-[92px] pb-10">
        {user ? (
          <Card className="w-full max-w-md border-[3px] border-foreground animate-in zoom-in-95 duration-200">
            <CardHeader className="space-y-2 pb-4 text-center">
              <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">MediHour</p>
              <CardTitle className="text-xl font-semibold">Welcome Back!</CardTitle>
              <CardDescription>
                You are already logged in as <span className="font-semibold text-foreground">{profile?.full_name || profile?.registration_id || "User"}</span>.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button onClick={() => navigate("/dashboard")} className="w-full h-12 text-lg" size="lg">
                <LayoutDashboard className="mr-2 h-5 w-5" /> Go to Dashboard
              </Button>
            </CardContent>
            <CardFooter>
              <Button onClick={() => signOut()} variant="outline" className="w-full text-muted-foreground hover:text-destructive">
                <LogOut className="mr-2 h-4 w-4" /> Logout from this account
              </Button>
            </CardFooter>
          </Card>
        ) : (
          <Card className="w-full max-w-md overflow-hidden rounded-[26px] border border-[#f3d9e3] bg-gradient-to-br from-white via-white to-[#fff7fa] shadow-[0_25px_60px_rgba(237,52,125,0.14)] dark:border-white/10 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900">
            {/* Top accent bar */}
            <div className="h-[5px] w-full bg-gradient-to-r from-[#f5327a] via-[#ff6b8d] to-[#e9287a]" />

            <CardHeader className="space-y-3 pb-2 pt-7 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f5327a] to-[#e9287a] shadow-[0_10px_25px_rgba(239,45,117,0.3)]">
                <img src="/logo.png" alt="MediHour" className="h-9 w-9 object-contain brightness-0 invert" />
              </div>
              <div>
                <CardTitle className="text-2xl font-black tracking-tight text-[#1f2328] dark:text-white">
                  MediHour-এ স্বাগতম
                </CardTitle>
                <CardDescription className="mt-1 text-[13px] text-muted-foreground">
                  চালিয়ে যেতে লগইন করুন
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="pt-3">
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-1.5">
                  <Label htmlFor="identifier" className="text-xs font-semibold text-[#555]">Gmail অথবা Phone Number</Label>
                  <div className="relative">
                    <Input
                      id="identifier"
                      name="identifier"
                      type="text"
                      required
                      autoComplete="username"
                      placeholder="Gmail বা Phone Number লিখুন"
                      className="h-12 rounded-xl border-[#e8dde3] pl-4 pr-4 text-[15px] shadow-sm transition-all placeholder:text-muted-foreground/60 focus-visible:border-[#ed347d] focus-visible:ring-[#ed347d]/20 dark:border-white/10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs font-semibold text-[#555]">
                      Password <span className="font-normal text-muted-foreground">(কমপক্ষে ৬ অক্ষর)</span>
                    </Label>
                    <Link to="/forgot-password" tabIndex={-1} className="text-xs font-semibold text-[#ed347d] hover:underline">
                      পাসওয়ার্ড ভুলে গেছেন?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      onChange={(e) => setPasswordLength(e.target.value.length)}
                      className="login-caret h-12 rounded-xl border-[#e8dde3] pl-4 pr-10 text-[15px] tracking-wide shadow-sm transition-all focus-visible:border-[#ed347d] focus-visible:ring-[#ed347d]/20 dark:border-white/10"
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
                  <div className="flex items-center justify-end gap-1.5 pr-0.5 pt-0.5">
                    {passwordLength > 0 && (
                      <>
                        <span className={`text-[11px] font-bold transition-colors ${passwordLength >= 6 ? "text-emerald-500" : "text-[#ed347d]"}`}>
                          {passwordLength} অক্ষর
                        </span>
                        {passwordLength >= 6 ? (
                          <span className="text-[11px] font-semibold text-emerald-500">✓ ঠিক আছে</span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">আরও {6 - passwordLength} লাগবে</span>
                        )}
                      </>
                    )}
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

                <Button
                  type="submit"
                  className="mt-1 h-12 w-full rounded-xl bg-gradient-to-r from-[#f5327a] to-[#e9287a] text-[15px] font-bold shadow-[0_10px_25px_rgba(239,45,117,0.28)] transition-transform hover:scale-[1.015] hover:shadow-[0_14px_30px_rgba(239,45,117,0.36)]"
                  disabled={loading || !captchaToken}
                >
                  {loading ? "লগইন হচ্ছে..." : "লগইন করুন"}
                </Button>

                <div className="mt-4 text-center text-sm">
                  অ্যাকাউন্ট নেই?{" "}
                  <Link to="/register" state={{ from: location.state?.from }} className="font-bold text-[#ed347d] hover:underline">
                    নতুন অ্যাকাউন্ট তৈরি করুন
                  </Link>
                </div>
              </form>

              <div className="mt-6 overflow-hidden rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50 via-orange-50/60 to-white shadow-[0_8px_25px_rgba(245,158,11,0.1)] dark:border-amber-500/20 dark:from-amber-950/30 dark:via-amber-900/10 dark:to-transparent">
                <div className="flex items-start gap-3 p-4">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-[0_6px_16px_rgba(245,158,11,0.3)]">
                    <AlertTriangle className="h-4.5 w-4.5 text-white" />
                  </div>
                  <div className="w-full text-[13px] text-amber-900 dark:text-amber-200">
                    <p className="mb-1 text-sm font-black tracking-tight">সতর্কবার্তা!</p>
                    <p className="leading-relaxed text-amber-800/90 dark:text-amber-200/80">আপনার ফোন নম্বর এবং পাসওয়ার্ড মনে রাখুন এবং কোথাও লিখে রাখুন।</p>
                    <p className="mt-2 font-medium text-amber-800/90 dark:text-amber-200/80">লগইন সংক্রান্ত সমস্যা হলে নিচে মেসেজ করুন:</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        asChild
                        size="sm"
                        className="w-full gap-1.5 rounded-lg bg-[#229ED9] font-bold shadow-sm transition-transform hover:scale-[1.02] hover:bg-[#1b87bd] text-white"
                      >
                        <a href={TELEGRAM_SUPPORT_BOT} target="_blank" rel="noopener noreferrer">
                          <Send className="h-3.5 w-3.5" />
                          Telegram
                        </a>
                      </Button>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="w-full gap-1.5 rounded-lg border-[#25D366] font-bold text-[#25D366] shadow-sm transition-transform hover:scale-[1.02] hover:bg-[#25D366]/10 hover:text-[#25D366]"
                      >
                        <a href={WHATSAPP_HELPLINE} target="_blank" rel="noopener noreferrer">
                          <MessageCircle className="h-3.5 w-3.5" />
                          WhatsApp
                        </a>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <Dialog open={!!loginError} onOpenChange={(open) => !open && setLoginError(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              লগইন ব্যর্থ হয়েছে
            </DialogTitle>
            <DialogDescription className="text-sm text-foreground pt-1">
              {loginError?.message}
            </DialogDescription>
          </DialogHeader>
          <div className="text-xs text-muted-foreground">
            পাসওয়ার্ড ভুল হতে পারে, অথবা এই Email/Phone দিয়ে কোনো অ্যাকাউন্ট নেই। নতুন হলে নিচে থেকে অ্যাকাউন্ট খুলুন, অথবা সমস্যা হলে সাপোর্টে যোগাযোগ করো:
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              asChild
              className="w-full gap-2 bg-gradient-to-r from-[#f5327a] to-[#e9287a] text-white hover:opacity-90"
            >
              <Link to="/register" state={{ from: location.state?.from }} onClick={() => setLoginError(null)}>
                নতুন অ্যাকাউন্ট খুলুন
              </Link>
            </Button>
            <Button
              asChild
              className="w-full gap-2 bg-[#229ED9] hover:bg-[#1b87bd] text-white"
            >
              <a
                href={buildTelegramSupportLink(loginError?.message || "", loginError?.identifier || "")}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Send className="h-4 w-4" />
                Telegram-এ মেসেজ করো
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              className="w-full gap-2 border-[#25D366] text-[#25D366] hover:bg-[#25D366]/10 hover:text-[#25D366]"
            >
              <a href={WHATSAPP_HELPLINE} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" />
                WhatsApp হেল্পলাইন
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={loginSuccess}>
        <DialogContent className="max-w-xs border-none bg-transparent p-0 shadow-none [&>button]:hidden">
          <div className="flex flex-col items-center gap-4 rounded-3xl bg-white p-8 text-center shadow-[0_25px_60px_rgba(0,0,0,0.25)] dark:bg-slate-900">
            <div className="relative flex h-20 w-20 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/40" />
              <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-[0_10px_25px_rgba(16,185,129,0.4)]">
                <svg viewBox="0 0 24 24" className="h-10 w-10 text-white" fill="none">
                  <path
                    d="M4 12.5L9.5 18L20 6"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ strokeDasharray: 30, strokeDashoffset: 30, animation: "loginCheckDraw 0.5s ease-out 0.15s forwards" }}
                  />
                </svg>
              </span>
            </div>
            <div>
              <h3 className="text-lg font-black text-[#1f2328] dark:text-white">লগইন সফল হয়েছে!</h3>
              <p className="mt-1 text-sm text-muted-foreground">ড্যাশবোর্ডে নিয়ে যাওয়া হচ্ছে...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Login;
