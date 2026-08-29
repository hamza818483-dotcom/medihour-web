import { useEffect, useState } from "react";
import { useEnrollments } from "@/hooks/useEnrollments";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { Gift, BookOpen, Search } from "lucide-react";

const ExtraCourses = () => {
  const { data: enrollments, isLoading } = useEnrollments();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    document.title = "Extra Courses – Atlas";
  }, []);

  // Filter for filtered/virtual enrollments
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extraCourses = enrollments?.filter((e: any) => e.is_extra) || [];

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  }

  if (extraCourses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <Gift className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold">No Extra Courses</h2>
        <p className="text-muted-foreground">You don't have any bonus courses assigned yet.</p>
        <Button variant="outline" onClick={() => navigate("/dashboard/my-courses")}>View My Courses</Button>
      </div>
    );
  }

  const filteredCourses = extraCourses.filter((enrollment: any) =>
      enrollment.course?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      enrollment.course?.short_description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Extra Courses</h1>
          <p className="text-sm text-muted-foreground">Bonus content included with your enrollments.</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
              placeholder="Search extra courses..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </header>

      {filteredCourses.length === 0 && searchQuery ? (
          <div className="text-center py-12 text-muted-foreground">No extra courses found matching "{searchQuery}".</div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {filteredCourses.map((enrollment: any) => (
          <Card key={enrollment.id} className="flex flex-col h-full transition-all duration-300 hover:shadow-md hover:border-purple-500 group">
             <div className="aspect-video w-full overflow-hidden rounded-t-xl bg-purple-50 dark:bg-purple-950/20 relative flex items-center justify-center">
                {enrollment.course?.image_url ? (
                    <img
                        src={enrollment.course.image_url}
                        alt={enrollment.course.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                ) : (
                    <Gift className="h-12 w-12 text-purple-300 dark:text-purple-800" />
                )}
                {/* Status Badge */}
                <div className="absolute top-2 right-2">
                    <span className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 text-xs font-bold px-2 py-1 rounded-full shadow-sm">
                        BONUS
                    </span>
                </div>
            </div>

            <CardHeader className="pb-2">
              <CardTitle className="line-clamp-2 leading-tight text-lg group-hover:text-purple-600 transition-colors">
                {enrollment.course?.name || "Unknown Course"}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 pb-4">
               <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                   {enrollment.course?.short_description || "Bonus content included with your enrollment."}
               </p>
            </CardContent>
            <CardFooter className="pt-0 mt-auto pb-6 px-6">
              <Button className="w-full gap-2 rounded-full shadow-lg shadow-purple-500/10 group-hover:shadow-purple-500/20 transition-all bg-purple-600 hover:bg-purple-700" onClick={() => navigate(`/dashboard/course/${enrollment.course_id}`)}>
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

export default ExtraCourses;
