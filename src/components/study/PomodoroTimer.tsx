import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Play, Pause, RotateCcw, Coffee, Briefcase, SkipForward, Settings2 } from "lucide-react";
import { useStudyTools } from "@/contexts/StudyToolsContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const PomodoroTimer = () => {
  const { pomodoro } = useStudyTools();
  const {
    timeLeft, isActive, mode,
    customWorkDuration, customBreakDuration, autoStartBreak, autoStartWork,
    toggleTimer, resetTimer, changeMode, skipBreak,
    setCustomWorkDuration, setCustomBreakDuration, setAutoStartBreak, setAutoStartWork
  } = pomodoro;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const isBreak = mode === 'shortBreak' || mode === 'longBreak';

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-sm">
      <div className="flex justify-between w-full items-center">
          <div className="flex gap-2 flex-wrap justify-center">
            <Button
              variant={mode === "work" ? "default" : "outline"}
              onClick={() => changeMode("work")}
              size="sm"
              className="text-xs h-8"
            >
              <Briefcase className="mr-2 h-3 w-3" /> Work
            </Button>
            <Button
              variant={mode === "shortBreak" ? "default" : "outline"}
              onClick={() => changeMode("shortBreak")}
              size="sm"
              className="text-xs h-8"
            >
              <Coffee className="mr-2 h-3 w-3" /> Short
            </Button>
            <Button
              variant={mode === "longBreak" ? "default" : "outline"}
              onClick={() => changeMode("longBreak")}
              size="sm"
              className="text-xs h-8"
            >
              <Coffee className="mr-2 h-3 w-3" /> Long
            </Button>
          </div>

          <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Settings2 className="h-4 w-4" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
                <div className="grid gap-4">
                    <div className="space-y-2">
                        <h4 className="font-medium leading-none">Settings</h4>
                        <p className="text-sm text-muted-foreground">Customize your timer.</p>
                    </div>
                    <div className="grid gap-2">
                        <div className="grid grid-cols-3 items-center gap-4">
                            <Label htmlFor="workDuration">Work (min)</Label>
                            <Input
                                id="workDuration"
                                type="number"
                                value={customWorkDuration}
                                onChange={(e) => setCustomWorkDuration(Number(e.target.value))}
                                className="col-span-2 h-8"
                            />
                        </div>
                        <div className="grid grid-cols-3 items-center gap-4">
                            <Label htmlFor="breakDuration">Break (min)</Label>
                            <Input
                                id="breakDuration"
                                type="number"
                                value={customBreakDuration}
                                onChange={(e) => setCustomBreakDuration(Number(e.target.value))}
                                className="col-span-2 h-8"
                            />
                        </div>
                        <div className="flex items-center justify-between mt-2">
                            <Label htmlFor="autoBreak">Auto-start Break</Label>
                            <Switch id="autoBreak" checked={autoStartBreak} onCheckedChange={setAutoStartBreak} />
                        </div>
                        <div className="flex items-center justify-between">
                            <Label htmlFor="autoWork">Auto-start Work</Label>
                            <Switch id="autoWork" checked={autoStartWork} onCheckedChange={setAutoStartWork} />
                        </div>
                    </div>
                </div>
            </PopoverContent>
          </Popover>
      </div>

      <div className="text-8xl font-bold font-mono tracking-tighter tabular-nums text-primary animate-in zoom-in duration-300 select-none">
        {formatTime(timeLeft)}
      </div>

      <div className="flex flex-col items-center gap-2 w-full">
        <div className="flex gap-4">
            <Button size="lg" className="w-32 rounded-full text-lg shadow-lg" onClick={toggleTimer}>
            {isActive ? (
                <>
                <Pause className="mr-2 h-5 w-5" /> Pause
                </>
            ) : (
                <>
                <Play className="mr-2 h-5 w-5" /> Start
                </>
            )}
            </Button>
            <Button size="lg" variant="outline" className="rounded-full" onClick={resetTimer}>
            <RotateCcw className="h-5 w-5" />
            </Button>
        </div>

        {isBreak && isActive && (
            <Button variant="ghost" size="sm" onClick={skipBreak} className="text-muted-foreground hover:text-primary animate-pulse">
                <SkipForward className="mr-2 h-4 w-4" /> Skip Break
            </Button>
        )}
      </div>
    </div>
  );
};

export default PomodoroTimer;
