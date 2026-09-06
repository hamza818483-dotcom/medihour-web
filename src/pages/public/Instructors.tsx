import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import PublicHeader from "@/components/PublicHeader";
import Footer from "@/components/Footer";
import { User } from "lucide-react";

const Instructors = () => {
  useEffect(() => {
    document.title = "আমাদের মেন্টরবৃন্দ – MediHour";
  }, []);

  const { data: mentors, isLoading } = useQuery({
    queryKey: ["public-mentors-page"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mentors")
        .select("*")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicHeader />
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-10 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-primary">আমাদের মেন্টরবৃন্দ</h1>
          <p className="text-muted-foreground">আপনার সফলতার কারিগর।</p>
        </div>

        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground">লোড হচ্ছে...</p>
        ) : !mentors || mentors.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">কোনো মেন্টর যোগ করা হয়নি।</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
            {mentors.map((mentor: any) => (
              <div
                key={mentor.id}
                className="flex flex-col items-center text-center gap-3 rounded-2xl border bg-card p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="h-36 w-36 rounded-full overflow-hidden border-2 border-primary shadow">
                  {mentor.image_url ? (
                    <img src={mentor.image_url} alt={mentor.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-secondary flex items-center justify-center">
                      <User className="h-16 w-16 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-lg">{mentor.name}</h3>
                  {mentor.role && (
                    <p className="text-xs text-primary font-medium uppercase tracking-wide">{mentor.role}</p>
                  )}
                  {mentor.description && (
                    <p className="text-sm text-muted-foreground mt-1">{mentor.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Instructors;
