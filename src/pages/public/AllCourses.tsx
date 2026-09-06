import { useEffect } from "react";
import PublicHeader from "@/components/PublicHeader";
import Footer from "@/components/Footer";
import { CourseSection } from "@/components/home/CourseSection";

const AllCourses = () => {
  useEffect(() => {
    document.title = "All Courses – MediHour";
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicHeader />
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-10">
        <CourseSection />
      </main>
      <Footer />
    </div>
  );
};

export default AllCourses;
