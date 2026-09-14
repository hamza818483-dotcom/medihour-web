import { useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import PublicHeader from "@/components/PublicHeader";
import { getEmbedUrl } from "@/lib/videoUtils";

const ExtraLinkPlayerPage = () => {
  const { courseId, linkIndex } = useParams<{ courseId: string; linkIndex: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const index = parseInt(linkIndex || "0", 10);

  const { data: course, isLoading } = useQuery({
    queryKey: ["public-course-extra-links", courseId],
    queryFn: async () => {
      if (!courseId) return null;
      const { data, error } = await supabase
        .from("courses")
        .select("id, name, extra_links")
        .or(`slug.eq.${courseId},id.eq.${courseId}`)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });

  const extraLinks: { label: string; url: string }[] = (course as any)?.extra_links || [];
  const currentLink = extraLinks[index];

  useEffect(() => {
    if (currentLink?.label) {
      document.title = `${currentLink.label} - Atlas`;
    }
  }, [currentLink]);

  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">Loading...</div>;
  }

  if (!currentLink) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <h1 className="text-xl font-bold">Content Not Found</h1>
        <Button onClick={() => navigate(`/courses/${courseId}`)}>Go Back</Button>
      </div>
    );
  }

  const rawUrl = (currentLink.url || "").trim();
  const safeUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const embedUrl = getEmbedUrl(safeUrl) || safeUrl;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <PublicHeader />

      <main className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/courses/${courseId}`)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Course
          </Button>
          <h1 className="text-lg font-semibold truncate flex-1">{course?.name}</h1>
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-kalpurush">{currentLink.label}</h2>

          <div className="relative aspect-video w-full bg-black rounded-lg overflow-hidden shadow-lg border border-border/50">
            <iframe
              src={embedUrl}
              title={currentLink.label}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default ExtraLinkPlayerPage;
