import { Flame, Menu, Moon, Sun } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import InstallPWA from "@/components/InstallPWA";

export const PublicHeader = () => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <header className="w-full border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-2 py-3 sm:gap-4 sm:px-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <a href="/" className="block bg-white rounded p-1">
            <img src="/logo.png" alt="Medihour Logo" className="h-10 w-auto object-contain" />
          </a>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-4 text-xs font-medium sm:flex sm:text-sm">
          <a href="/" className="underline-offset-4 hover:underline">
            হোম
          </a>
          <a href="/#courses" className="underline-offset-4 hover:underline">
            কোর্সসমূহ
          </a>
          <a href="/free-class" className="underline-offset-4 hover:underline">
            ফ্রি ক্লাস
          </a>
          <a href="/free-exam" className="underline-offset-4 hover:underline">
            ফ্রি এক্সাম
          </a>
          <a href="/tutorial" className="underline-offset-4 hover:underline">
            টিউটোরিয়াল
          </a>
          <a href="/login" className="underline-offset-4 hover:underline">
            লগইন
          </a>
        </nav>

        <div className="flex items-center gap-2">
          {/* Mobile Theme Toggle — same single toggle as desktop, placed right by Login */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label="Toggle theme"
            className="sm:hidden rounded-full"
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>

          {/* Mobile Login Button */}
          <a href="/login" className="sm:hidden">
            <Button size="sm" variant="default" className="h-9 px-4">
              লগইন
            </Button>
          </a>

          {/* Desktop Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label="Toggle theme"
            className="hidden sm:flex rounded-full"
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>

          {/* Mobile Menu */}
          <div className="sm:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Menu">
                  <Menu className="h-5 w-5 text-primary" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right">
                <SheetHeader>
                  <SheetTitle>মেনু</SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-4 mt-6">
                  <a href="/" className="text-lg font-medium hover:text-primary">
                    হোম
                  </a>
                  <a href="/#courses" className="text-lg font-medium hover:text-primary">
                    কোর্সসমূহ
                  </a>
                  <a href="/free-class" className="text-lg font-medium hover:text-primary">
                    ফ্রি ক্লাস
                  </a>
                  <a href="/free-exam" className="text-lg font-medium hover:text-primary">
                    ফ্রি এক্সাম
                  </a>
                  <a href="/tutorial" className="text-lg font-medium hover:text-primary">
                    টিউটোরিয়াল
                  </a>
                  <a href="/login" className="text-lg font-medium hover:text-primary">
                    লগইন
                  </a>

                  {/* Mobile Theme Toggle in Menu */}
                  <div className="flex items-center justify-between mt-4 border-t pt-4">
                    <span className="text-lg font-medium">ডার্ক মোড</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setTheme(isDark ? "light" : "dark")}
                      aria-label="Toggle theme"
                      className="rounded-full"
                    >
                      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                    </Button>
                  </div>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
};

export default PublicHeader;
