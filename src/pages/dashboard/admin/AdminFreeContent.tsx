import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import NotesManager from "@/components/admin/NotesManager";
import ExamsManager from "@/components/admin/ExamsManager";
import { useEffect } from "react";

const AdminFreeContent = () => {
    useEffect(() => {
        document.title = "Free Content Manager – Atlas";
    }, []);

    return (
        <div className="space-y-6">
            <header className="space-y-1">
                <h1 className="text-xl font-bold tracking-tight">Free Content Manager</h1>
                <p className="text-muted-foreground">Manage free classes (notes) and exams visible to everyone.</p>
            </header>
            <Tabs defaultValue="notes" className="space-y-4">
                <TabsList className="flex flex-wrap h-auto">
                    <TabsTrigger value="notes">Free Classes (Notes)</TabsTrigger>
                    <TabsTrigger value="exams">Free Exams</TabsTrigger>
                </TabsList>
                <TabsContent value="notes">
                    <NotesManager isFreeMode={true} />
                </TabsContent>
                <TabsContent value="exams">
                    <ExamsManager isFreeMode={true} />
                </TabsContent>
            </Tabs>
        </div>
    );
};
export default AdminFreeContent;
