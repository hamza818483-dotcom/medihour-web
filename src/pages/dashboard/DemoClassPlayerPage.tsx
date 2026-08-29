import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, FileText, PlayCircle } from "lucide-react";
import PublicHeader from "@/components/PublicHeader";
import { DemoContentItem } from "@/types/admin";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ClassPlayer from "@/components/ClassPlayer";

const DemoClassPlayerPage = () => {
  const { courseId, demoIndex } = useParams<{ courseId: string; demoIndex: string }>();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(window.location.search);
  const typeParam = searchParams.get('type') as 'video' | 'note' | null;

  const index = parseInt(demoIndex || "0", 10);

  const { data: course, isLoading, isError } = useQuery({
    queryKey: ["public-course-demo", courseId],
    queryFn: async () => {
      if (!courseId) return null;
      const { data, error } = await supabase
        .from("courses")
        .select("id, name, demo_content")
        .or(`slug.eq.${courseId},id.eq.${courseId}`)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const demoContent: DemoContentItem[] = (course?.demo_content as any) || [];
  const currentItem = demoContent[index];

  // Determine initial view based on url param or availability
  const [view, setView] = useState<'video' | 'note'>('video');

  useEffect(() => {
      if (currentItem) {
          if (typeParam === 'note' && currentItem.note_url) {
              setView('note');
          } else if (typeParam === 'video' && currentItem.video_url) {
              setView('video');
          } else if (currentItem.video_url) {
              setView('video');
          } else if (currentItem.note_url) {
              setView('note');
          }
      }
  }, [currentItem, typeParam]);

  useEffect(() => {
    if (currentItem?.title) {
      document.title = `${currentItem.title} - Demo - Atlas`;
    }
  }, [currentItem]);

  if (isLoading) {
      return <div className="min-h-screen bg-background flex items-center justify-center">Loading...</div>;
  }

  if (isError || !currentItem) {
      return (
          <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
              <h1 className="text-xl font-bold">Content Not Found</h1>
              <Button onClick={() => navigate(-1)}>Go Back</Button>
          </div>
      );
  }

  // Helper to extract YouTube ID if possible for embedding, else fallback to generic iframe/link
  const getEmbedUrl = (url: string) => {
      // Basic youtube ID extraction
      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
      const match = url.match(regExp);
      if (match && match[2].length === 11) {
          return `https://www.youtube.com/embed/${match[2]}?autoplay=1`;
      }
      return url;
  };

  const hasVideo = !!currentItem.video_url;
  const hasNote = !!currentItem.note_url;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <PublicHeader />

      <main className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-6 space-y-6">
          <div className="flex items-center gap-2 mb-4">
              <Button variant="ghost" size="sm" onClick={() => navigate(`/courses/${courseId}`)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Back to Course
              </Button>
              <h1 className="text-lg font-semibold truncate flex-1">{course?.name}</h1>
          </div>

          <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                      <h2 className="text-2xl font-bold">{currentItem.title}</h2>
                      <p className="text-muted-foreground text-sm">Demo Content</p>
                  </div>

                  {hasVideo && hasNote && (
                      <div className="bg-muted p-1 rounded-lg inline-flex">
                          <Button
                            variant={view === 'video' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setView('video')}
                            className="h-8 text-xs"
                          >
                              <PlayCircle className="w-3 h-3 mr-2" /> Video
                          </Button>
                          <Button
                            variant={view === 'note' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={() => setView('note')}
                            className="h-8 text-xs"
                          >
                              <FileText className="w-3 h-3 mr-2" /> Note
                          </Button>
                      </div>
                  )}
              </div>

              <Card className="overflow-hidden border-2 border-primary/10">
                  <CardContent className="p-0 min-h-[400px]">
                      {view === 'video' && hasVideo && currentItem.video_url ? (
                           <div className="aspect-video bg-black w-full">
                               <ClassPlayer
                                  videoId={currentItem.video_url}
                                  title={currentItem.title}
                               />
                           </div>
                      ) : view === 'note' && hasNote && currentItem.note_url ? (
                          <div className="h-[80vh] w-full bg-muted flex flex-col items-center justify-center gap-4">
                              {currentItem.note_url.endsWith('.pdf') ? (
                                   <iframe src={currentItem.note_url} className="w-full h-full" title="PDF Viewer" />
                              ) : (
                                  <div className="text-center p-8">
                                      <FileText className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                                      <h3 className="text-lg font-semibold mb-2">External Document</h3>
                                      <Button asChild>
                                          <a href={currentItem.note_url} target="_blank" rel="noopener noreferrer">
                                              Open Document
                                          </a>
                                      </Button>
                                  </div>
                              )}
                          </div>
                      ) : (
                          <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center h-full">
                              <p>No content available for this view.</p>
                              {hasVideo && view !== 'video' && <Button variant="link" onClick={() => setView('video')}>Switch to Video</Button>}
                              {hasNote && view !== 'note' && <Button variant="link" onClick={() => setView('note')}>Switch to Note</Button>}
                          </div>
                      )}
                  </CardContent>
              </Card>
          </div>
      </main>
    </div>
  );
};

export default DemoClassPlayerPage;
