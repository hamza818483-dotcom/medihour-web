import { Link } from "react-router-dom";
import { Facebook, Youtube, Mail, Phone, MapPin, Send, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  const { data: links } = useQuery({
    queryKey: ["official-links-public"],
    queryFn: async () => {
      const { data } = await supabase.from("official_links").select("*").eq("id", 1).maybeSingle();
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const email = links?.email || "medihourofficial@gmail.com";
  const whatsapp = links?.whatsapp || "+8801639787547";
  const facebookPage = links?.facebook_page || "https://www.facebook.com/share/1EX8RkwBoP/";
  const facebookGroup = links?.facebook_group || "https://www.facebook.com/share/g/1CsYjAfZxw/";
  const telegram = links?.telegram || "https://t.me/MediHour";
  const youtube = links?.youtube || "https://youtube.com/@medihour.official?si=Q-vU8sHvBB0cka-C";

  return (
    <footer className="relative w-full overflow-hidden bg-gradient-to-br from-[#111118] via-[#151520] to-[#101015] text-white">
      {/* Decorative glows */}
      <div className="pointer-events-none absolute -left-40 -top-64 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(239,48,119,0.12),transparent_68%)]" />
      <div className="pointer-events-none absolute -bottom-64 -right-44 h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,rgba(95,108,255,0.1),transparent_68%)]" />

      <div className="relative z-[2] mx-auto w-[min(1160px,calc(100%-36px))] py-11 pb-6">
        {/* Top: Brand + Tagline */}
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <a href="/" className="flex h-12 w-12 items-center justify-center rounded-[13px] border border-white/10 bg-white/[0.07] transition-transform hover:-translate-y-0.5 hover:bg-white/[0.11]">
              <img src="/logo.png" alt="MediHour Logo" className="h-[34px] w-[34px] object-contain" />
            </a>
            <div>
              <h3 className="m-0 text-lg font-extrabold leading-tight text-white sm:text-xl">MediHour</h3>
              <span className="mt-0.5 block text-[11px] font-medium text-white/50">মেডিকেল-ভার্সিটি প্ল্যাটফর্ম</span>
            </div>
          </div>

          <div className="flex max-w-[470px] items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.043] px-4 py-3">
            <span className="h-[7px] w-[7px] flex-shrink-0 rounded-full bg-[#f33b7c] shadow-[0_0_12px_rgba(243,59,124,0.65)]" />
            <p className="m-0 text-xs leading-relaxed text-white/65">
              উন্নত শিক্ষা ও তাৎক্ষণিক এক্সাম রেজাল্ট নিয়ে <strong className="font-bold text-white">'MediHour'</strong> একটি আস্থার নাম।
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="my-7 h-px w-full bg-gradient-to-r from-transparent via-white/[0.12] to-transparent" />

        {/* Main columns */}
        <div className="grid grid-cols-1 gap-9 sm:grid-cols-3">
          {/* Quick Links */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              <span className="h-[18px] w-1 rounded-full bg-gradient-to-b from-[#ff4384] to-[#e93272]" />
              <h4 className="m-0 text-sm font-bold text-white">প্রয়োজনীয় লিংক</h4>
            </div>
            <div className="flex flex-col gap-2">
              <Link to="/" className="flex w-fit items-center gap-1.5 text-[11px] text-white/55 transition-all hover:translate-x-1 hover:text-white">হোম</Link>
              <Link to="/courses" className="flex w-fit items-center gap-1.5 text-[11px] text-white/55 transition-all hover:translate-x-1 hover:text-white">সকল কোর্স</Link>
              <Link to="/login" className="flex w-fit items-center gap-1.5 text-[11px] text-white/55 transition-all hover:translate-x-1 hover:text-white">লগইন</Link>
              <Link to="/register" className="flex w-fit items-center gap-1.5 text-[11px] text-white/55 transition-all hover:translate-x-1 hover:text-white">রেজিস্ট্রেশন</Link>
              <a href="/free-exam" className="flex w-fit items-center gap-1.5 text-[11px] text-white/55 transition-all hover:translate-x-1 hover:text-white">ফ্রি এক্সাম</a>
              <a href="/free-class" className="flex w-fit items-center gap-1.5 text-[11px] text-white/55 transition-all hover:translate-x-1 hover:text-white">ডেমো ক্লাস</a>
            </div>
          </div>

          {/* Contact */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              <span className="h-[18px] w-1 rounded-full bg-gradient-to-b from-[#ff4384] to-[#e93272]" />
              <h4 className="m-0 text-sm font-bold text-white">যোগাযোগ</h4>
            </div>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-start gap-2.5">
                <Mail size={13} className="mt-0.5 flex-shrink-0 text-[#f0447f]" />
                <a href={`mailto:${email}`} className="text-[12px] text-white/65 hover:text-white transition-colors">{email}</a>
              </div>
              <div className="flex items-start gap-2.5">
                <Phone size={13} className="mt-0.5 flex-shrink-0 text-[#f0447f]" />
                <a href={`tel:${whatsapp}`} className="text-[12px] text-white/65 hover:text-white transition-colors">{whatsapp}</a>
              </div>
              <div className="flex items-start gap-2.5">
                <MapPin size={13} className="mt-0.5 flex-shrink-0 text-[#f0447f]" />
                <span className="text-[12px] text-white/65">চট্টগ্রাম, বাংলাদেশ</span>
              </div>
            </div>
          </div>

          {/* Social */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              <span className="h-[18px] w-1 rounded-full bg-gradient-to-b from-[#ff4384] to-[#e93272]" />
              <h4 className="m-0 text-sm font-bold text-white">সোশ্যাল</h4>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <a href={facebookPage} target="_blank" rel="noreferrer" className="flex h-[35px] w-[35px] items-center justify-center rounded-[10px] border border-white/[0.07] bg-white/[0.043] text-white/55 transition-all hover:-translate-y-0.5 hover:bg-white/10 hover:text-[#4d8dff]">
                <Facebook size={15} />
              </a>
              <a href={facebookGroup} target="_blank" rel="noreferrer" className="flex h-[35px] w-[35px] items-center justify-center rounded-[10px] border border-white/[0.07] bg-white/[0.043] text-white/55 transition-all hover:-translate-y-0.5 hover:bg-white/10 hover:text-[#4d8dff]">
                <Users size={15} />
              </a>
              <a href={telegram} target="_blank" rel="noreferrer" className="flex h-[35px] w-[35px] items-center justify-center rounded-[10px] border border-white/[0.07] bg-white/[0.043] text-white/55 transition-all hover:-translate-y-0.5 hover:bg-white/10 hover:text-[#35aeea]">
                <Send size={15} />
              </a>
              <a href={youtube} target="_blank" rel="noreferrer" className="flex h-[35px] w-[35px] items-center justify-center rounded-[10px] border border-white/[0.07] bg-white/[0.043] text-white/55 transition-all hover:-translate-y-0.5 hover:bg-white/10 hover:text-[#ff4d62]">
                <Youtube size={15} />
              </a>
            </div>
          </div>
        </div>

        {/* Bottom: Copyright */}
        <div className="mt-9 border-t border-white/[0.07] pt-5 text-center">
          <p className="m-0 text-[9.5px] leading-relaxed text-white/40">© {currentYear} MediHour. সর্বস্বত্ব সংরক্ষিত।</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
