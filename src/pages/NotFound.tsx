import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import PublicHeader from "@/components/PublicHeader";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicHeader />
      <main className="flex min-h-[calc(100vh-56px)] items-center justify-center px-4 py-10">
        <div className="text-center">
          <h1 className="mb-4 text-4xl font-bold">404</h1>
          <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
          <a href="/" className="text-primary underline underline-offset-4 hover:text-primary/90">
            Return to Home
          </a>
        </div>
      </main>
    </div>
  );
};

export default NotFound;
