import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Send, Facebook, Link as LinkIcon, Users, MessageCircle, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";

const Community = () => {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [platformFilter, setPlatformFilter] = useState<"all" | "facebook" | "telegram">("all");
  const PAGE_SIZE = 5;

  useEffect(() => {
    document.title = "Community – Atlas";
  }, []);

  const { data: links, isLoading } = useQuery({
    queryKey: ["student-community-links", user?.id],
    queryFn: async () => {
      if (!user) return [];
      // NOTE: get_student_community_links is SECURITY DEFINER and only returns
      // communities for directly-enrolled courses (not bonus/linked courses).
      // This is the correct behavior per requirements.
      const { data, error } = await supabase.rpc("get_student_community_links");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user
  });

  const getIcon = (url: string) => {
      if (url.includes("t.me")) return <Send className="h-5 w-5" />;
      if (url.includes("facebook.com") || url.includes("fb.me")) return <Facebook className="h-5 w-5" />;
      if (url.includes("wa.me") || url.includes("whatsapp")) return <MessageCircle className="h-5 w-5" />;
      return <Users className="h-5 w-5" />;
  };

  const getPlatformName = (url: string) => {
      if (url.includes("t.me")) return "Telegram";
      if (url.includes("facebook.com") || url.includes("fb.me")) return "Facebook";
      if (url.includes("wa.me") || url.includes("whatsapp")) return "WhatsApp";
      return "Community";
  };

  const getBgColor = (url: string) => {
      if (url.includes("t.me")) return "border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900";
      if (url.includes("facebook.com")) return "border-indigo-200 bg-indigo-50/50 dark:bg-indigo-950/20 dark:border-indigo-900";
      if (url.includes("wa.me")) return "border-green-200 bg-green-50/50 dark:bg-green-950/20 dark:border-green-900";
      return "border-gray-200 bg-gray-50/50 dark:bg-gray-800/20 dark:border-gray-700";
  };

  const getBtnColor = (url: string) => {
       if (url.includes("t.me")) return "bg-blue-500 hover:bg-blue-600";
       if (url.includes("facebook.com")) return "bg-indigo-600 hover:bg-indigo-700";
       if (url.includes("wa.me")) return "bg-green-600 hover:bg-green-700";
       return "";
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderGrid = (items: any[]) => {
      if (items.length === 0) return null;
      return (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {items.map((link: any) => (
                <Card key={link.id} className={`shadow-sm hover:shadow-md transition-all ${getBgColor(link.url)}`}>
                    <CardHeader className="p-4 pb-2">
                        <div className="flex items-start justify-between gap-2">
                             <div className="flex items-center gap-2">
                                <div className={`p-1.5 rounded-lg text-white shadow-sm shrink-0 ${getBtnColor(link.url) || "bg-primary"}`}>
                                    {getIcon(link.url)}
                                </div>
                                <div>
                                    <CardTitle className="text-base font-semibold leading-tight">{link.title}</CardTitle>
                                    <div className="text-[10px] uppercase font-bold tracking-wider opacity-70 mt-0.5">
                                        {getPlatformName(link.url)}
                                    </div>
                                </div>
                             </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-2">
                        <CardDescription className="line-clamp-2 text-xs mb-3 min-h-[2.5em]">
                            {link.description || "Join the discussion and stay updated."}
                        </CardDescription>
                        <Button
                            size="sm"
                            className={`w-full h-8 text-xs font-semibold text-white shadow-sm ${getBtnColor(link.url) || "bg-primary hover:bg-primary/90"}`}
                            asChild
                        >
                            <a
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => {
                                    supabase.rpc("record_community_link_click", { p_resource_id: link.id }).then(({ error }) => {
                                        if (error) console.error("Error recording link click", error);
                                    });
                                }}
                            >
                                <ExternalLink className="h-3 w-3 mr-2" />
                                Join Now
                            </a>
                        </Button>
                    </CardContent>
                </Card>
            ))}
        </div>
      );
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const platformFilteredLinks = (links || []).filter((link: any) => {
      if (platformFilter === "all") return true;
      if (platformFilter === "telegram") return link.url.includes("t.me");
      if (platformFilter === "facebook") return link.url.includes("facebook.com") || link.url.includes("fb.me");
      return true;
  });

  // Deduplicate by URL globally: if a student is enrolled in multiple courses
  // that share the exact same FB/TG group link, only show it once (first occurrence).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dedupedLinks = (() => {
      const seenUrls = new Set<string>();
      const result: any[] = [];
      for (const link of platformFilteredLinks) {
          if (seenUrls.has(link.url)) continue;
          seenUrls.add(link.url);
          result.push(link);
      }
      return result;
  })();

  // Group links by course name
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groupedLinks = dedupedLinks.reduce((acc: Record<string, any[]>, link: any) => {
      const courseName = link.course_name || "Public Community";
      if (!acc[courseName]) acc[courseName] = [];
      acc[courseName].push(link);
      return acc;
  }, {});

  const courseNames = Object.keys(groupedLinks).sort();
  const totalPages = Math.ceil(courseNames.length / PAGE_SIZE);
  const displayedCourses = courseNames.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6 pb-20">
      <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">FB & Telegram Group</h1>
          <p className="text-sm text-muted-foreground">Join our community channels to stay updated.</p>
      </header>

      <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {([
              { key: "all", label: "All" },
              { key: "facebook", label: "Facebook" },
              { key: "telegram", label: "Telegram" },
          ] as const).map((p) => (
              <button
                  key={p.key}
                  type="button"
                  onClick={() => { setPlatformFilter(p.key); setPage(1); }}
                  className={`px-3 py-2 rounded-lg border text-sm font-bold uppercase tracking-wide transition-colors shrink-0 whitespace-nowrap ${platformFilter === p.key ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/70 hover:bg-secondary"}`}
              >
                  {p.label}
              </button>
          ))}
      </div>


      {isLoading ? (
          <div className="text-muted-foreground py-10 text-center">Loading community links...</div>
      ) : courseNames.length === 0 ? (
          <div className="text-center py-12 border rounded-lg bg-muted/10 text-muted-foreground border-dashed">
             No community links found.
          </div>
      ) : (
          <div className="space-y-8">
              {displayedCourses.map((courseName) => (
                  <div key={courseName} className="space-y-3">
                      <div className="flex items-center gap-2">
                          <div className="h-4 w-1 bg-primary rounded-full"></div>
                          <h2 className="text-lg font-bold">{courseName}</h2>
                      </div>
                      {renderGrid(groupedLinks[courseName])}
                  </div>
              ))}
          </div>
      )}

      {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
              </div>
              <div className="flex gap-2">
                  <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                  >
                      <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                  </Button>
                  <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                  >
                      Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
              </div>
          </div>
      )}
    </div>
  );
};

export default Community;
