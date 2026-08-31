import { Menu, Home, BookOpen, Info, Phone } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export const PublicHeader = () => {
  const { data: links } = useQuery({
    queryKey: ["official-links-public"],
    queryFn: async () => {
      const { data } = await supabase.from("official_links").select("*").eq("id", 1).maybeSingle();
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const hotline = links?.whatsapp || "+8801639787547";

  const navItems = [
    { href: "/", label: "হোম", icon: Home, active: true },
    { href: "/#courses", label: "কোর্স", icon: BookOpen },
    { href: "/#about", label: "আমাদের সম্পর্কে", icon: Info },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-[1050] px-3 pt-3.5 sm:px-5 pointer-events-none bg-transparent">
      <div className="mx-auto w-full max-w-[1180px] pointer-events-auto">
        <nav className="flex h-[62px] items-center gap-5 rounded-[18px] border border-white/85 bg-white/[0.88] pl-4 pr-3 backdrop-blur-xl shadow-[0_8px_35px_rgba(30,40,70,0.09)] dark:bg-slate-900/85 dark:border-white/10">
          {/* Logo */}
          <a href="/" className="flex flex-shrink-0 items-center">
            <img src="/logo.png" alt="MediHour" className="h-[45px] w-[135px] object-contain" />
          </a>

          {/* Desktop Nav */}
          <div className="ml-auto hidden items-center gap-[3px] md:flex">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`group relative inline-flex items-center gap-[7px] rounded-[11px] px-3 py-2.5 text-[13px] font-semibold transition-all duration-200 after:absolute after:bottom-1 after:left-3 after:right-3 after:h-[2px] after:origin-left after:scale-x-0 after:rounded-full after:bg-[#ed347d] after:transition-transform after:duration-200 hover:bg-[#fff3f7] hover:text-[#ed347d] hover:after:scale-x-100 dark:hover:bg-rose-500/10 ${
                  item.active
                    ? "bg-[#fff2f7] text-[#ed347d] font-bold after:scale-x-100"
                    : "text-[#777] dark:text-slate-300"
                }`}
              >
                <span className="inline-flex w-[17px] items-center justify-center">
                  <item.icon className="h-3 w-3" strokeWidth={2.5} />
                </span>
                <span>{item.label}</span>
              </a>
            ))}
          </div>

          {/* Right side actions */}
          <div className="ml-auto flex flex-shrink-0 items-center gap-[9px] md:ml-0">
            {/* Hotline box */}
            <a
              href={`tel:${hotline}`}
              className="hidden items-center gap-2 rounded-[13px] border border-[#eee] bg-white py-[5px] pl-[7px] pr-[11px] transition-all duration-200 hover:-translate-y-px hover:border-[#ffd1e1] hover:bg-[#fff5f8] hover:shadow-[0_5px_15px_rgba(237,52,125,0.1)] sm:flex dark:bg-slate-800/70 dark:border-white/10"
            >
              <span className="flex h-[31px] w-[31px] flex-shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-br from-[#f53278] to-[#e9287a] text-white shadow-[0_4px_10px_rgba(239,45,117,0.2)]">
                <Phone className="h-3 w-3" strokeWidth={2.5} />
              </span>
              <span className="flex flex-col whitespace-nowrap leading-[1.1]">
                <span className="mb-[3px] text-[9px] font-semibold text-[#888] dark:text-slate-400">
                  হটলাইন (সকাল ১০টা – রাত ৮টা)
                </span>
                <strong className="text-[11px] font-extrabold tracking-[0.1px] text-[#333] dark:text-white">
                  {hotline}
                </strong>
              </span>
            </a>

            {/* Login */}
            <a
              href="/login"
              className="inline-flex h-[38px] items-center justify-center rounded-full bg-gradient-to-br from-[#f53278] to-[#e9287a] px-[19px] text-[13px] font-bold text-white shadow-[0_6px_16px_rgba(239,45,117,0.22)] transition-transform duration-200 hover:scale-[1.03] hover:shadow-[0_9px_22px_rgba(239,45,117,0.3)]"
            >
              লগইন
            </a>

            {/* Mobile Menu */}
            <div className="md:hidden">
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
                      <a key={item.href} href={item.href} className="flex items-center gap-2 text-lg font-medium hover:text-[#ed347d]">
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </a>
                    ))}
                    <a href="/login" className="text-lg font-medium hover:text-[#ed347d]">
                      লগইন
                    </a>
                    <a href={`tel:${hotline}`} className="flex items-center gap-2 text-lg font-medium hover:text-[#ed347d]">
                      <Phone className="h-4 w-4" />
                      {hotline}
                    </a>
                  </nav>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
};

export default PublicHeader;
