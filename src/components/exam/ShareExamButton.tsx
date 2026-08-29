import { Share2, Link as LinkIcon, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ShareExamButtonProps {
  examId: string;
  examTitle: string;
  className?: string;
}

export default function ShareExamButton({ examId, examTitle, className }: ShareExamButtonProps) {
  const shareUrl = `${window.location.origin}/take-exam/${examId}`;
  const shareText = `${examTitle} — এই ফ্রি এক্সামটি দাও:`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("লিংক কপি হয়েছে");
    } catch {
      toast.error("লিংক কপি করা যায়নি");
    }
  };

  const shareToWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`, "_blank");
  };

  const shareToTelegram = () => {
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`,
      "_blank"
    );
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: examTitle, text: shareText, url: shareUrl });
      } catch {
        // user cancelled — no-op
      }
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={className ?? "h-8 w-8 p-0"}
          onClick={(e) => e.stopPropagation()}
          aria-label="Share exam"
        >
          <Share2 className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={copyLink}>
          <LinkIcon className="h-4 w-4 mr-2" /> Copy Link
        </DropdownMenuItem>
        <DropdownMenuItem onClick={shareToWhatsApp}>
          <MessageCircle className="h-4 w-4 mr-2" /> WhatsApp
        </DropdownMenuItem>
        <DropdownMenuItem onClick={shareToTelegram}>
          <Send className="h-4 w-4 mr-2" /> Telegram
        </DropdownMenuItem>
        {typeof navigator !== "undefined" && !!navigator.share && (
          <DropdownMenuItem onClick={nativeShare}>
            <Share2 className="h-4 w-4 mr-2" /> আরও অপশন
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
