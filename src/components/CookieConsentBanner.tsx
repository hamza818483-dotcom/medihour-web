import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Cookie } from "lucide-react";

const CONSENT_KEY = "mh_cookie_consent";

const CookieConsentBanner = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (!consent) setVisible(true);
  }, []);

  const accept = () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[1100] mx-auto flex max-w-xl flex-col gap-3 rounded-2xl border border-white/10 bg-[#151520]/95 p-4 shadow-[0_10px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2.5">
        <Cookie size={18} className="mt-0.5 flex-shrink-0 text-[#2563eb]" />
        <p className="text-xs leading-relaxed text-white/75">
          আমরা আপনার অভিজ্ঞতা উন্নত করতে এবং বিজ্ঞাপন কার্যকারিতা যাচাই করতে কুকি ব্যবহার করি।{" "}
          <Link to="/privacy-policy" className="text-[#60a5fa] underline">
            বিস্তারিত জানুন
          </Link>
        </p>
      </div>
      <Button size="sm" onClick={accept} className="flex-shrink-0 self-end bg-gradient-to-br from-[#2563eb] to-[#1d4ed8] sm:self-auto">
        বুঝেছি
      </Button>
    </div>
  );
};

export default CookieConsentBanner;
