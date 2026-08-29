import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus, RotateCw, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStudyTools } from "@/contexts/StudyToolsContext";

interface Flashcard {
  id: string;
  subject: string;
  question: string;
  answer: string;
}

const SUBJECTS = ["Physics", "Chemistry", "Math", "Biology", "English", "General"];

const Flashcards = () => {
  const { user } = useAuth();
  const { updateStreak, updateStats } = useStudyTools();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [filterSubject, setFilterSubject] = useState<string>("all");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // Load from Supabase
  useEffect(() => {
    const loadCards = async () => {
        if (!user) return;
        try {
            const { data, error } = await supabase
                .from('user_study_data')
                .select('flashcards')
                .eq('user_id', user.id)
                .single();

            if (error && error.code !== 'PGRST116') throw error;

            if (data?.flashcards) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setCards(data.flashcards as any[]);
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Failed to load flashcards", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };
    loadCards();
  }, [user, toast]);

  // Save to Supabase (debounced ideally, but direct for now)
  const saveToSupabase = async (newCards: Flashcard[]) => {
      if (!user) return;
      setIsSaving(true);
      try {
          const { error } = await supabase
            .from('user_study_data')
            .upsert({
                user_id: user.id,
                flashcards: newCards
            }, { onConflict: 'user_id' });

          if (error) throw error;
      } catch (err) {
          console.error(err);
          toast({ title: "Failed to save changes", variant: "destructive" });
      } finally {
          setIsSaving(false);
      }
  };

  const filteredCards = filterSubject === "all"
    ? cards
    : cards.filter(c => c.subject === filterSubject);

  const handleAddCard = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newCard: Flashcard = {
      id: crypto.randomUUID(),
      subject: formData.get("subject") as string,
      question: formData.get("question") as string,
      answer: formData.get("answer") as string,
    };

    const newCards = [...cards, newCard];
    setCards(newCards);
    setIsAddOpen(false);
    await saveToSupabase(newCards);
    updateStreak();
    toast({ title: "Flashcard added" });
  };

  const handleEditCard = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const updatedQuestion = formData.get("question") as string;
    const updatedAnswer = formData.get("answer") as string;

    const newCards = [...cards];
    const index = cards.findIndex(c => c.id === filteredCards[currentIndex].id);
    if (index !== -1) {
      newCards[index] = { ...newCards[index], question: updatedQuestion, answer: updatedAnswer };
      setCards(newCards);
      setIsEditOpen(false);
      await saveToSupabase(newCards);
      updateStreak();
      toast({ title: "Flashcard updated" });
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Delete this card?")) {
      const newCards = cards.filter(c => c.id !== id);
      setCards(newCards);
      if (currentIndex >= newCards.length) {
        setCurrentIndex(Math.max(0, newCards.length - 1));
      }
      await saveToSupabase(newCards);
      toast({ title: "Card deleted" });
    }
  };

  const nextCard = () => {
    if (isFlipped) {
        // If they flip the card and move next, count it as a review
        updateStats("flashcards_reviewed", 1);
        updateStreak(); // Reviewing also counts for streak
    }
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev + 1) % filteredCards.length);
  };

  const prevCard = () => {
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev - 1 + filteredCards.length) % filteredCards.length);
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto">
      <div className="flex w-full justify-between items-center gap-4">
        <Select value={filterSubject} onValueChange={(v) => {
            setFilterSubject(v);
            setCurrentIndex(0);
            setIsFlipped(false);
        }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Subject" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Subjects</SelectItem>
            {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>

        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Add Card
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Flashcard</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddCard} className="space-y-4">
              <div className="space-y-2">
                <Label>Subject</Label>
                <Select name="subject" defaultValue="General" required>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Question (Front)</Label>
                <Textarea name="question" required placeholder="e.g. What is Newton's Second Law?" />
              </div>
              <div className="space-y-2">
                <Label>Answer (Back)</Label>
                <Textarea name="answer" required placeholder="e.g. F = ma" />
              </div>
              <Button type="submit" className="w-full">Save Card</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {filteredCards.length > 0 ? (
        <div className="w-full space-y-4">
          <div className="perspective-1000 w-full h-[300px] cursor-pointer group" onClick={() => setIsFlipped(!isFlipped)}>
            <div className={`relative w-full h-full duration-500 transform-style-3d transition-transform ${isFlipped ? "rotate-y-180" : ""}`}>
              {/* Front */}
              <Card className="absolute w-full h-full backface-hidden flex flex-col justify-between p-6">
                <div className="flex justify-between items-start">
                    <span className="text-xs font-bold uppercase text-muted-foreground tracking-wider">
                        {filteredCards[currentIndex].subject}
                    </span>
                    <span className="text-xs text-muted-foreground">
                        {currentIndex + 1} / {filteredCards.length}
                    </span>
                </div>
                <div className="flex-1 flex items-center justify-center text-center">
                    <h3 className="text-2xl font-semibold">{filteredCards[currentIndex].question}</h3>
                </div>
                <div className="text-center text-xs text-muted-foreground animate-pulse">
                    Click to flip
                </div>
              </Card>

              {/* Back */}
              <Card className="absolute w-full h-full backface-hidden rotate-y-180 flex flex-col justify-between p-6 bg-background border-primary/20 shadow-lg">
                 <div className="flex justify-between items-start">
                    <span className="text-xs font-bold uppercase text-muted-foreground tracking-wider">
                        Answer
                    </span>
                    <div className="flex gap-1">
                      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Dialog trigger handles opening, we just need to prevent flip
                            }}
                          >
                            <RotateCw className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent onClick={(e) => e.stopPropagation()}>
                          <DialogHeader>
                            <DialogTitle>Edit Flashcard</DialogTitle>
                          </DialogHeader>
                          <form onSubmit={handleEditCard} className="space-y-4">
                            <div className="space-y-2">
                              <Label>Question (Front)</Label>
                              <Textarea name="question" required defaultValue={filteredCards[currentIndex].question} />
                            </div>
                            <div className="space-y-2">
                              <Label>Answer (Back)</Label>
                              <Textarea name="answer" required defaultValue={filteredCards[currentIndex].answer} />
                            </div>
                            <Button type="submit" className="w-full">Update Card</Button>
                          </form>
                        </DialogContent>
                      </Dialog>

                      <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(filteredCards[currentIndex].id);
                          }}
                      >
                          <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                </div>
                <div className="flex-1 flex items-center justify-center text-center overflow-y-auto">
                    <p className="text-xl whitespace-pre-wrap">{filteredCards[currentIndex].answer}</p>
                </div>
                <div className="text-center text-xs text-muted-foreground">
                    Click to flip back
                </div>
              </Card>
            </div>
          </div>

          <div className="flex justify-center gap-4">
            <Button variant="outline" onClick={prevCard} disabled={filteredCards.length <= 1}>
              <ChevronLeft className="mr-2 h-4 w-4" /> Prev
            </Button>
            <Button variant="outline" onClick={nextCard} disabled={filteredCards.length <= 1}>
              Next <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl w-full">
          <p>No cards found for this subject.</p>
          <p className="text-sm mt-2">Create one to get started!</p>
        </div>
      )}

      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  );
};

export default Flashcards;
