import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import PublicHeader from "@/components/PublicHeader";
import Footer from "@/components/Footer";
import { Download, BookOpen } from "lucide-react";

const EBooks = () => {
  useEffect(() => {
    document.title = "E-Books – MediHour";
  }, []);

  const { data: ebooks, isLoading } = useQuery({
    queryKey: ["public-ebooks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ebooks")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicHeader />
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-10 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-primary">E-Books</h1>
          <p className="text-muted-foreground">প্রয়োজনীয় বই ডাউনলোড করুন।</p>
        </div>

        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground">লোড হচ্ছে...</p>
        ) : !ebooks || ebooks.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">কোনো ই-বুক পাওয়া যায়নি।</p>
        ) : (
          <div className="flex flex-col gap-4">
            {ebooks.map((ebook: any) => {
              const hasDiscount =
                ebook.discount_price != null &&
                ebook.original_price != null &&
                Number(ebook.discount_price) < Number(ebook.original_price);

              return (
                <div
                  key={ebook.id}
                  className="flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="h-24 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-secondary">
                    {ebook.image_url ? (
                      <img src={ebook.image_url} alt={ebook.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <BookOpen className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{ebook.name}</h3>
                    <div className="mt-1 flex items-baseline gap-2">
                      {hasDiscount ? (
                        <>
                          <span className="text-sm line-through text-muted-foreground">৳{ebook.original_price}</span>
                          <span className="text-lg font-bold text-primary">৳{ebook.discount_price}</span>
                        </>
                      ) : ebook.original_price != null ? (
                        <span className="text-lg font-bold text-primary">৳{ebook.original_price}</span>
                      ) : null}
                    </div>
                  </div>

                  {ebook.download_url && (
                    <a
                      href={ebook.download_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow hover:scale-105 transition-transform"
                      aria-label={`Download ${ebook.name}`}
                    >
                      <Download className="h-5 w-5" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default EBooks;
