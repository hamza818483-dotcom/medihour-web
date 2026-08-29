import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Play, Square } from "lucide-react";
import { useStudyTools } from "@/contexts/StudyToolsContext";

const IntervalReminder = () => {
  const { reminder } = useStudyTools();
  const { isActive, start, stop } = reminder;

  const [minutes, setMinutes] = useState("5");
  const [message, setMessage] = useState("");

  const handleStart = (e: React.FormEvent) => {
      e.preventDefault();
      const min = parseInt(minutes);
      if (min > 0) {
          start(min, message);
      }
  };

  return (
    <div className="w-full max-w-sm mx-auto space-y-6">
        {isActive ? (
            <div className="flex flex-col items-center gap-4 py-8 animate-in fade-in">
                <div className="relative">
                    <div className="h-24 w-24 rounded-full border-4 border-primary/20 flex items-center justify-center animate-pulse">
                        <span className="text-2xl font-bold">{reminder.intervalMinutes}m</span>
                    </div>
                </div>
                <div className="text-center">
                    <p className="font-medium">Reminder Active</p>
                    <p className="text-sm text-muted-foreground">You will be notified every {reminder.intervalMinutes} minutes.</p>
                    {reminder.message && (
                        <p className="text-sm italic mt-2">"{reminder.message}"</p>
                    )}
                </div>
                <Button variant="destructive" onClick={stop} className="mt-2">
                    <Square className="mr-2 h-4 w-4" /> Stop Reminder
                </Button>
            </div>
        ) : (
            <form onSubmit={handleStart} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="interval">Interval (minutes)</Label>
                    <Input
                        id="interval"
                        type="number"
                        min="1"
                        value={minutes}
                        onChange={(e) => setMinutes(e.target.value)}
                        required
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="message">Message (Optional)</Label>
                    <Input
                        id="message"
                        placeholder="e.g. Drink water, Stretch..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                    />
                </div>
                <Button type="submit" className="w-full">
                    <Play className="mr-2 h-4 w-4" /> Start Reminder
                </Button>
            </form>
        )}
    </div>
  );
};

export default IntervalReminder;
