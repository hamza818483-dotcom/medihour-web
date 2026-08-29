import { Link } from "react-router-dom";
import { Facebook, Youtube, Mail, Phone, MapPin, Send } from "lucide-react";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#052e16] text-slate-100 border-t border-primary/20">
      <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12">

          {/* Brand Column */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 bg-white w-fit px-3 py-2 rounded-md">
               <img src="/logo.png" alt="Medihour Logo" className="h-10 w-auto object-contain" />
            </div>
            <p className="text-sm text-slate-200 leading-relaxed">
              উন্নত শিক্ষা, লাইভ ক্লাস এবং তাৎক্ষণিক এক্সাম রেজাল্ট নিয়ে শিক্ষার্থীদের পাশে আমরা। নিজের সম্ভাবনাকে বিকশিত করতে আমাদের সাথে যুক্ত হোন।
            </p>
            <div className="flex gap-4">
              <a href="https://www.facebook.com/share/1ZsxAaL8zN" className="bg-primary-foreground/10 p-2 rounded-full hover:bg-white hover:text-primary transition-colors">
                <Facebook size={18} />
              </a>
              <a href="https://t.me/MediHour" className="bg-primary-foreground/10 p-2 rounded-full hover:bg-white hover:text-blue-400 transition-colors">
                <Send size={18} />
              </a>
              <a href="https://www.youtube.com/@MedihourMedical_Preparation" className="bg-primary-foreground/10 p-2 rounded-full hover:bg-white hover:text-red-600 transition-colors">
                <Youtube size={18} />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-lg font-semibold text-white mb-4">প্রয়োজনীয় লিংক</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/" className="hover:text-primary transition-colors">হোম</Link></li>
              <li><Link to="/courses" className="hover:text-primary transition-colors">সকল কোর্স</Link></li>
              <li><Link to="/login" className="hover:text-primary transition-colors">লগইন</Link></li>
              <li><Link to="/register" className="hover:text-primary transition-colors">রেজিস্ট্রেশন</Link></li>
            </ul>
          </div>

          {/* Resources (Placeholder) */}
          <div>
            <h4 className="text-lg font-semibold text-white mb-4">রিসোর্স</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="/#free-resources" className="hover:text-primary transition-colors">ফ্রি এক্সাম</a></li>
              <li><a href="/#free-resources" className="hover:text-primary transition-colors">ডেমো ক্লাস</a></li>
              <li><a href="/#success-stories" className="hover:text-primary transition-colors">সাফল্যের গল্প</a></li>
              <li><a href="/#reviews" className="hover:text-primary transition-colors">শিক্ষার্থীদের মতামত</a></li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h4 className="text-lg font-semibold text-white mb-4">যোগাযোগ</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <Mail size={18} className="text-primary shrink-0 mt-0.5" />
                <a href="mailto:hamza818483@gmail.com" className="hover:text-white transition-colors">hamza818483@gmail.com</a>
              </li>
              <li className="flex items-start gap-3">
                <Phone size={18} className="text-primary shrink-0 mt-0.5" />
                <a href="tel:+8801999681290" className="hover:text-white transition-colors">+8801999681290</a>
              </li>
              <li className="flex items-start gap-3">
                <MapPin size={18} className="text-primary shrink-0 mt-0.5" />
                <span>সিলেট, বাংলাদেশ</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-12 pt-8 border-t border-slate-800 text-center text-xs text-slate-500">
          <p>© {currentYear} Medihour. সর্বস্বত্ব সংরক্ষিত।</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
