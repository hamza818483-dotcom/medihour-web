import { Menu, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export const PublicHeader = () => {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  const navItems = [
    { href: "/", label: "হোম" },
    { href: "/#courses", label: "কোর্সসমূহ" },
    { href: "/free-class", label: "ফ্রি ক্লাস" },
    { href: "/free-exam", label: "ফ্রি এক্সাম" },
    { href: "/tutorial", label: "টিউটোরিয়াল" },
  ];

  return (
    <header className="sticky top-0 z-[1050] px-3 pt-3 sm:px-5">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex h-[62px] items-center gap-3 rounded-2xl border border-white/60 bg-white/90 dark:bg-slate-900/85 dark:border-white/10 px-3 sm:px-4 shadow-[0_8px_35px_rgba(30,40,70,0.10)] backdrop-blur-xl">
          <a href="/" className="flex flex-shrink-0 items-center">
            <img src="/logo.png" alt="Medihour Logo" className="h-9 w-auto object-contain sm:h-10" />
          </a>

          {/* Desktop Nav */}
          <nav className="ml-auto hidden items-center gap-1 sm:flex">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-[11px] px-3 py-2 text-[13px] font-semibold text-slate-500 transition-all hover:bg-rose-50 hover:text-rose-500 dark:text-slate-300 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex flex-shrink-0 items-center gap-2 sm:ml-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              aria-label="Toggle theme"
              className="rounded-full"
            >
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>

            <a
              href="/login"
              className="inline-flex h-9 items-center justify-center rounded-full bg-gradient-to-br from-[#F5327A] to-[#E9287A] px-5 text-[13px] font-bold text-white shadow-[0_6px_16px_rgba(239,45,117,0.25)] transition-transform hover:scale-[1.03]"
            >
              লগইন
            </a>

            {/* Mobile Menu */}
            <div className="sm:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right">
                  <SheetHeader>
                    <SheetTitle>মেনু</SheetTitle>
                  </SheetHeader>
                  <nav className="mt-6 flex flex-col gap-4">
                    {navItems.map((item) => (
                      <a key={item.href} href={item.href} className="text-lg font-medium hover:text-rose-500">
                        {item.label}
                      </a>
                    ))}
                    <a href="/login" className="text-lg font-medium hover:text-rose-500">
                      লগইন
                    </a>
                    <div className="mt-4 flex items-center justify-between border-t pt-4">
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
      </div>
    </header>
  );
};

export default PublicHeader;
