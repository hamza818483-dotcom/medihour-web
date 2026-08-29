import React, { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "react-router-dom";

const FloatingInstallButton = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const { toast } = useToast();
  const location = useLocation();

  useEffect(() => {
    // Check if app is installed
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }

    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      // Manual instructions fallback
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

      toast({
        title: "Install App",
        description: isIOS
          ? "Tap the Share button and select 'Add to Home Screen'"
          : "Use your browser menu to 'Install App' or 'Add to Home Screen'",
        duration: 5000,
      });
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  // Visibility Logic:
  // 1. Not installed
  // 2. Only on Landing Page ("/") or Dashboard Home ("/dashboard")
  if (isInstalled) return null;
  if (location.pathname !== "/" && location.pathname !== "/dashboard") return null;

  return (
    <div className="fixed bottom-6 left-6 z-50 animate-in slide-in-from-bottom-10 fade-in duration-700 print:hidden">
      <Button
        onClick={handleInstallClick}
        size="icon"
        className="
            relative overflow-hidden group bg-background border border-primary/50 text-primary
            shadow-[0_0_15px_rgba(var(--primary),0.5)] hover:shadow-[0_0_25px_rgba(var(--primary),0.7)]
            rounded-full h-14 w-14 transition-all duration-300 hover:scale-105
        "
      >
        <div className="absolute inset-0 bg-primary/10 group-hover:bg-primary/20 transition-colors" />
        <Download className="h-6 w-6 animate-bounce" />
      </Button>
    </div>
  );
};

export default FloatingInstallButton;
