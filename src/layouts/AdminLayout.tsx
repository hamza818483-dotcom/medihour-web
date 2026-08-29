import { Outlet, Link } from "react-router-dom";
import {
  ArrowLeft, Menu, Moon, Sun, 
  LayoutDashboard, VolumeX, Volume2, ShieldAlert
} from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar, adminItems } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminReportAlert } from "@/components/AdminReportAlert";

export const AdminLayout = () => {
  const { profile, signOut, isAdmin, isTeacher } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem("admin_sound_muted") === "true");
  const [isDevMode, setIsDevMode] = useState(() => localStorage.getItem("dev_mode") === "true");

  useEffect(() => {
    localStorage.setItem("admin_sound_muted", String(isMuted));
  }, [isMuted]);

  useEffect(() => {
    localStorage.setItem("dev_mode", String(isDevMode));
  }, [isDevMode]);
  
  return (
    <SidebarProvider>
      <div className="min-h-screen w-full bg-background text-foreground flex flex-col print:block print:h-auto print:overflow-visible">
        <header className="sticky top-0 z-10 flex h-14 items-center border-b bg-background/95 backdrop-blur px-4 supports-[backdrop-filter]:bg-background/60 print:hidden">
          <SidebarTrigger className="mr-3 hidden sm:inline-flex" />
          <div className="flex flex-1 items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 sm:hidden"
                aria-label="Go back"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 hidden sm:inline-flex"
                aria-label="Go back"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2">
                <div className="bg-white rounded p-1 hidden xs:block">
                  <img src="/logo.png" alt="Atlas Logo" className="h-8 w-auto object-contain" />
                </div>
                <Link to="/dashboard" className="text-sm font-semibold hover:underline">Dashboard</Link>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    className="hidden sm:inline-flex"
                    aria-label={isDevMode ? "Disable Dev Mode" : "Enable Dev Mode"}
                    onClick={async () => {
                        const newVal = !isDevMode;
                        setIsDevMode(newVal);
                        localStorage.setItem("dev_mode", String(newVal));
                        await supabase.rpc('toggle_anti_cheat', { p_enabled: !newVal });
                        window.location.reload();
                    }}
                    title={isDevMode ? "Disable Developer Mode" : "Enable Developer Mode"}
                  >
                    <ShieldAlert className={`h-4 w-4 ${isDevMode ? 'text-red-500' : 'text-muted-foreground'}`} />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="hidden sm:inline-flex"
                    aria-label={isMuted ? "Unmute notifications" : "Mute notifications"}
                    onClick={() => setIsMuted(!isMuted)}
                  >
                    {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </Button>
                </>
              )}
              {/* Desktop theme toggle */}
              <Button
                variant="outline"
                size="icon"
                className="hidden sm:inline-flex"
                aria-label="Toggle theme"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>

              <Button variant="outline" size="sm" onClick={() => signOut()} className="hidden sm:inline-flex">
                Logout
              </Button>

              {/* Mobile hamburger */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Open menu"
                    className="sm:hidden"
                  >
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="flex flex-col gap-4 w-[280px] overflow-y-auto">
                  <SheetHeader className="text-left">
                    <SheetTitle>Admin Menu</SheetTitle>
                    <SheetDescription className="text-xs text-muted-foreground">
                      {profile ? `Reg ID: ${profile.registration_id}` : 'Atlas Admin'}
                    </SheetDescription>
                  </SheetHeader>
                  <nav className="flex flex-col gap-1 text-sm">
                    {adminItems.filter(item => {
                        if (item.roles.includes("admin") && isAdmin) return true;
                        if (item.roles.includes("teacher") && isTeacher) return true;
                        return false;
                    }).map((item) => (
                        <Link key={item.url} to={item.url} className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md font-medium">
                            <item.icon className={`h-4 w-4 ${item.color || ''}`} />
                            {item.title}
                        </Link>
                    ))}
                    <div className="my-1 border-t border-border/50"></div>
                    <Link to="/dashboard" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md font-medium text-muted-foreground">
                        Back to Student Dashboard
                    </Link>
                  </nav>

                  <div className="mt-auto flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-2 px-2">
                      <span className="text-sm">Theme</span>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label="Toggle theme"
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                      >
                        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                      </Button>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => signOut()} className="w-full">
                      Logout
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>

        <div className="flex flex-1 w-full overflow-hidden pt-[1px] print:overflow-visible print:h-auto print:block">
          <div className="print:hidden">
            <AdminSidebar />
          </div>
          <main className="flex-1 bg-background px-4 py-4 sm:px-6 sm:py-6 overflow-y-auto w-full print:overflow-visible print:h-auto print:w-full print:px-0 print:py-0">
            <Outlet />
          </main>
        </div>
      </div>
      {(isAdmin || isTeacher) && <AdminReportAlert />}
    </SidebarProvider>
  );
};

export default AdminLayout;
