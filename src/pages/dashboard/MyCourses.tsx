import { useEffect, useState } from "react";
import { useEnrollments } from "@/hooks/useEnrollments";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { BookOpen, GraduationCap, Gift, Search } from "lucide-react";

const MyCourses = () => {
  const { data: enrollments, isLoading } = useEnrollments();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    document.title = "My Courses – Atlas";
  }, []);

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading courses...</div>;
  }

  if (!enrollments || enrollments.filter((e: any) => !e.is_extra).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <GraduationCap className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold">No Active Courses</h2>
        <p className="text-muted-foreground">You are not enrolled in any courses yet.</p>
        <Button onClick={() => navigate("/courses")}>Browse Courses</Button>
      </div>
    );
  }

  const directEnrollments = (enrollments || []).filter((e: any) => !e.is_extra);

  const filteredEnrollments = directEnrollments.filter((enrollment: any) =>
      enrollment.course?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      enrollment.course?.short_description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">My Courses</h1>
          <p className="text-sm text-muted-foreground">Access your enrolled courses and content.</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
              placeholder="Search my courses..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </header>

      {filteredEnrollments.length === 0 && searchQuery ? (
          <div className="text-center py-12 text-muted-foreground">No courses found matching "{searchQuery}".</div>
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredEnrollments.map((enrollment: any) => (
          <Card key={enrollment.id} className="flex flex-col h-full group transition-all duration-300 hover:shadow-md hover:border-primary/50">
            <div className="aspect-video w-full overflow-hidden rounded-t-xl bg-muted/20 relative">
                {enrollment.course?.image_url ? (
                    <img
                        src={enrollment.course.image_url}
                        alt={enrollment.course.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        {enrollment.is_extra ? <Gift className="h-12 w-12 opacity-20" /> : <GraduationCap className="h-12 w-12 opacity-20" />}
                    </div>
                )}
                {/* Status Badge */}
                <div className="absolute top-2 right-2 flex gap-2">
                    <span className="bg-background/80 backdrop-blur text-xs font-semibold px-2 py-1 rounded-full shadow-sm">
                        Enrolled
                    </span>
                </div>
            </div>

            <CardHeader className="pb-2">
              <CardTitle className="line-clamp-2 leading-tight text-lg group-hover:text-primary transition-colors">
                {enrollment.course?.name || "Unknown Course"}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 pb-4 space-y-3">
               <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                   {enrollment.course?.short_description || "No description available."}
               </p>
               {enrollment.bonus_courses?.length > 0 && (
                 <div className="space-y-1.5">
                   <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-700 dark:text-purple-300">
                     <Gift className="h-3.5 w-3.5" /> এই কোর্সে বোনাস হিসেবে যা পাচ্ছেন
                   </div>
                   <div className="flex flex-wrap gap-1.5">
                     {enrollment.bonus_courses.map((b: any) => (
                       <span key={b.id} className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 text-[11px] font-medium px-2 py-0.5 rounded-full">
                         {b.name}
                       </span>
                     ))}
                   </div>
                 </div>
               )}
            </CardContent>
            <CardFooter className="pt-0 mt-auto pb-6 px-6">
              <Button className="w-full gap-2 rounded-full shadow-lg shadow-primary/10 group-hover:shadow-primary/20 transition-all" onClick={() => navigate(`/dashboard/course/${enrollment.course_id}`)}>
                <BookOpen className="h-4 w-4" /> Enter Course
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      )}
    </div>
  );
};

export default MyCourses;
