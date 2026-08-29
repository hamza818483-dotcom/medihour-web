import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GPACalculator from "@/components/study/GPACalculator";
import { Timer, ListTodo, Layers, Sparkles, Music, BellRing, Calculator } from "lucide-react";

import PomodoroTimer from "@/components/study/PomodoroTimer";
import TodoList from "@/components/study/TodoList";
import Flashcards from "@/components/study/Flashcards";
import WhiteNoisePlayer from "@/components/study/WhiteNoisePlayer";
import IntervalReminder from "@/components/study/IntervalReminder";

const Program = () => {
  useEffect(() => {
    document.title = "Study Tools – Atlas";
  }, []);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-yellow-500" />
          Study Tools
        </h1>
        <p className="text-sm text-muted-foreground">
          Boost your productivity with these built-in utilities.
        </p>
      </header>

      <Tabs defaultValue="pomodoro" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-6 lg:w-[800px] h-auto">
          <TabsTrigger value="pomodoro" className="gap-2 py-3">
            <Timer className="h-4 w-4" />
            Pomodoro
          </TabsTrigger>
          <TabsTrigger value="todo" className="gap-2 py-3">
            <ListTodo className="h-4 w-4" />
            To-Do
          </TabsTrigger>
          <TabsTrigger value="flashcards" className="gap-2 py-3">
            <Layers className="h-4 w-4" />
            Flashcards
          </TabsTrigger>
          <TabsTrigger value="ambience" className="gap-2 py-3">
            <Music className="h-4 w-4" />
            Ambience
          </TabsTrigger>
          <TabsTrigger value="interval" className="gap-2 py-3">
            <BellRing className="h-4 w-4" />
            Interval
          </TabsTrigger>
        <TabsTrigger value="gpa" className="gap-2 py-3">
            <Calculator className="h-4 w-4" />
            GPA Calc
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="pomodoro">
            <Card className="border-border">
              <CardHeader>
                <CardTitle>Focus Timer</CardTitle>
                <CardDescription>
                  The Pomodoro Technique is a time management method that uses a timer to break work into intervals, traditionally 25 minutes in length, separated by short breaks.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center py-8">
                <PomodoroTimer />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="todo">
            <Card className="border-border">
              <CardHeader>
                <CardTitle>Task List</CardTitle>
                <CardDescription>
                  Manage your daily study tasks. Data is saved locally in your browser.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TodoList />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="flashcards">
            <Card className="border-border">
              <CardHeader>
                <CardTitle>Flashcards</CardTitle>
                <CardDescription>
                  Create and review flashcards for quick revision. Organized by subject.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Flashcards />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ambience">
            <Card className="border-border">
              <CardHeader>
                <CardTitle>White Noise & Ambience</CardTitle>
                <CardDescription>
                  Play background sounds to help you focus or relax.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <WhiteNoisePlayer />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="interval">
            <Card className="border-border">
              <CardHeader>
                <CardTitle>Interval Reminder</CardTitle>
                <CardDescription>
                  Set a recurring reminder to check in, drink water, or take a mini-break.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <IntervalReminder />
              </CardContent>
            </Card>
          </TabsContent>
        <TabsContent value="gpa">
            <GPACalculator />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default Program;
