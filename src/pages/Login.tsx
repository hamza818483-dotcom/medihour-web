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

  useEffect(() => {
    document.title = "Login – Medihour";

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

      if (profileData && (profileData.role === 'admin' || profileData.role === 'teacher')) {
        navigate("/admin");
      } else {
        navigate("/dashboard");
      }
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicHeader />
      <main className="flex min-h-screen items-center justify-center px-4 pt-[92px] pb-10">
        {user ? (
          <Card className="w-full max-w-md border-[3px] border-foreground animate-in zoom-in-95 duration-200">
            <CardHeader className="space-y-2 pb-4 text-center">
              <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">Medihour</p>
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
          <Card className="w-full max-w-md border-[3px] border-foreground">
            <CardHeader className="space-y-2 pb-4">
              <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">Medihour</p>
              <CardTitle className="text-xl font-semibold">Student &amp; Admin Login</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Enter your Email to login.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="identifier">ইমেইল / ফোন নম্বর</Label>
                  <Input id="identifier" name="identifier" type="text" required autoComplete="username" placeholder="Email অথবা Phone Number" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link to="/forgot-password" tabIndex={-1} className="text-xs text-primary font-medium hover:underline">
                      Forgot Password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      className="pr-10"
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

                <Button type="submit" className="mt-2 w-full" disabled={loading || !captchaToken}>
                  {loading ? "Logging in..." : "Login"}
                </Button>

                <div className="mt-4 text-center text-sm">
                  Don&apos;t have an account?{" "}
                  <Link to="/register" state={{ from: location.state?.from }} className="font-semibold text-primary hover:underline">
                    Create new account
                  </Link>
                </div>
              </form>

              <div className="mt-6 rounded-md border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/50 dark:bg-yellow-900/20">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
                  <div className="text-sm text-yellow-800 dark:text-yellow-400 w-full">
                    <p className="font-bold mb-1">সতর্কবার্তা!</p>
                    <p>আপনার ফোন নম্বর এবং পাসওয়ার্ড মনে রাখুন এবং কোথাও লিখে রাখুন।</p>
                    <p className="mt-2">লগইন সংক্রান্ত সমস্যা হলে নিচে মেসেজ করুন:</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Button
                        asChild
                        size="sm"
                        className="w-full gap-1.5 bg-[#229ED9] hover:bg-[#1b87bd] text-white"
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
                        className="w-full gap-1.5 border-[#25D366] text-[#25D366] hover:bg-[#25D366]/10 hover:text-[#25D366]"
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
              Login failed
            </DialogTitle>
            <DialogDescription className="text-sm text-foreground pt-1">
              {loginError?.message}
            </DialogDescription>
          </DialogHeader>
          <div className="text-xs text-muted-foreground">
            সমস্যা সমাধান না হলে আমাদের সাপোর্টে যোগাযোগ করো:
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
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
    </div>
  );
};

export default Login;
