import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";

const InstallPWA = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Check if already installed
    const isInstalled = window.matchMedia('(display-mode: standalone)').matches;
    if (isInstalled) {
        setIsInstallable(false);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      toast.success("Thank you for installing the app!");
      setDeferredPrompt(null);
      setIsInstallable(false);
    } else {
      toast.info("Installation cancelled");
    }
  };

  if (!isInstallable) return null;

  return (
    <Button
        onClick={handleInstallClick}
        variant="outline"
        size="sm"
        className="gap-2 border-primary text-primary hover:bg-primary hover:text-white transition-all animate-pulse font-bold"
    >
      <Download className="h-4 w-4" />
      Install App
    </Button>
  );
};

export default InstallPWA;
