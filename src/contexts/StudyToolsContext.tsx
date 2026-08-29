import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface StudyToolsContextType {
  // White Noise
  whiteNoise: {
    activeSound: string | null;
    isPlaying: boolean;
    volume: number;
    isFloating: boolean;
    toggleSound: (id: string) => void;
    setVolume: (val: number) => void;
    setIsFloating: (val: boolean) => void;
    close: () => void;
  };
  // Pomodoro
  pomodoro: {
    timeLeft: number;
    isActive: boolean;
    mode: "work" | "shortBreak" | "longBreak";
    customWorkDuration: number;
    customBreakDuration: number;
    autoStartBreak: boolean;
    autoStartWork: boolean;
    toggleTimer: () => void;
    resetTimer: () => void;
    changeMode: (mode: "work" | "shortBreak" | "longBreak") => void;
    setCustomWorkDuration: (val: number) => void;
    setCustomBreakDuration: (val: number) => void;
    setAutoStartBreak: (val: boolean) => void;
    setAutoStartWork: (val: boolean) => void;
    skipBreak: () => void;
  };
  // Interval Reminder
  reminder: {
    intervalMinutes: number;
    message: string;
    isActive: boolean;
    start: (minutes: number, msg: string) => void;
    stop: () => void;
  };
  updateStreak: () => Promise<void>;
  updateStats: (metric: string, value: number) => Promise<void>;
}

const StudyToolsContext = createContext<StudyToolsContextType | undefined>(undefined);

export const useStudyTools = () => {
  const context = useContext(StudyToolsContext);
  if (!context) {
    throw new Error("useStudyTools must be used within StudyToolsProvider");
  }
  return context;
};

// Safe variant for components that may render outside StudyToolsProvider
// (e.g. the public/guest take-exam and exam-review routes, which sit
// outside DashboardLayout). Returns no-op functions instead of throwing.
export const useStudyToolsOptional = () => {
  const context = useContext(StudyToolsContext);
  if (!context) {
    return {
      updateStreak: async () => {},
      updateStats: async () => {},
    };
  }
  return context;
};

// Sound Assets
export const SOUNDS = [
  { id: "rain", name: "Rain", url: "https://cdn.pixabay.com/audio/2025/07/23/audio_63d9f37e74.mp3" },
  { id: "forest", name: "Forest", url: "https://cdn.pixabay.com/audio/2025/06/06/audio_b4ffb37ac1.mp3" },
  { id: "cafe", name: "Cafe", url: "https://cdn.pixabay.com/audio/2022/03/15/audio_174fffaa05.mp3" },
  { id: "white", name: "White Noise", url: "https://cdn.pixabay.com/audio/2024/03/21/audio_b20bc53f05.mp3" },
];

const CLOCK_ALARM = "https://actions.google.com/sounds/v1/alarms/beep_short.ogg";

export const StudyToolsProvider = ({ children }: { children: ReactNode }) => {
  const { toast } = useToast();
  const { user } = useAuth();

  // --- White Noise State ---
  const [activeSound, setActiveSound] = useState<string | null>(null);
  const [isNoisePlaying, setIsNoisePlaying] = useState(false);
  const [volume, setVolume] = useState(50);
  const [isFloating, setIsFloating] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // --- Pomodoro State ---
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isPomoActive, setIsPomoActive] = useState(false);
  const [pomoMode, setPomoMode] = useState<"work" | "shortBreak" | "longBreak">("work");
  const [customWorkDuration, setCustomWorkDuration] = useState(25);
  const [customBreakDuration, setCustomBreakDuration] = useState(5);
  const [autoStartBreak, setAutoStartBreak] = useState(true);
  const [autoStartWork, setAutoStartWork] = useState(true);

  const pomoAudioRef = useRef<HTMLAudioElement | null>(null);

  // --- Reminder State ---
  const [reminderInterval, setReminderInterval] = useState(0);
  const [reminderMessage, setReminderMessage] = useState("");
  const [isReminderActive, setIsReminderActive] = useState(false);
  const reminderRef = useRef<NodeJS.Timeout | null>(null);

  // --- Helper: Notifications ---
  const sendNotification = (title: string, body?: string) => {
    try {
        if (typeof window === 'undefined' || !("Notification" in window)) {
             toast({ title, description: body });
             return;
        }
        if (Notification.permission === "granted") {
          new Notification(title, { body, icon: "/public/favicon.png" });
        } else if (Notification.permission !== "denied") {
          Notification.requestPermission().then(permission => {
            if (permission === "granted") {
              new Notification(title, { body, icon: "/favicon.png" });
            }
          });
        }
    } catch (e) {
        console.warn("Notification failed:", e);
    }
    // Always show toast as fallback or complement
    toast({ title, description: body });
  };

  const safePlayAudio = (audio: HTMLAudioElement | null) => {
      if (!audio) return;
      audio.play().catch(e => {
          console.warn("Audio play blocked/failed:", e);
      });
  };

  // --- Helper: Update Streak & Stats ---
  const updateStreak = async () => {
      if (!user) return;
      const today = new Date().toISOString();
      try {
          const { data } = await supabase.from("user_study_data").select("streak_info").eq("user_id", user.id).single();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const info = data?.streak_info as any || { current_streak: 0, last_study_date: null };

          await supabase.from("user_study_data").upsert({
              user_id: user.id,
              streak_info: { ...info, last_study_date: today }
          }, { onConflict: 'user_id' });
      } catch (e) {
          console.error("Failed to update streak", e);
      }
  };

  const updateStats = async (metric: string, value: number) => {
      if (!user) return;
      try {
          // 1. Update Aggregate Stats in JSONB
          const { data } = await supabase.from("user_study_data").select("stats").eq("user_id", user.id).single();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const currentStats = data?.stats as any || {
            total_study_time: 0,
            total_exam_time: 0,
            total_class_time: 0,
            flashcards_reviewed: 0,
            todos_completed: 0,
            pomodoros_completed: 0
          };

          const newStats = {
              ...currentStats,
              [metric]: (currentStats[metric] || 0) + value
          };

          await supabase.from("user_study_data").update({
              stats: newStats
          }).eq("user_id", user.id);

          // 2. Insert into Activity Logs for granularity
          // Map metric name to activity type
          let activityType = "study";
          if (metric === "total_class_time") activityType = "class";
          else if (metric === "total_exam_time") activityType = "exam";
          else if (metric === "flashcards_reviewed") activityType = "flashcard";
          else if (metric === "pomodoros_completed") activityType = "pomodoro";

          // If metric is a counter (e.g. flashcards), duration might be 0 or estimated.
          // If metric is time (e.g. total_study_time), value is duration in minutes.
          let duration = 0;
          if (metric.includes("time")) {
             duration = value * 60; // Convert minutes to seconds for the log table
          }

          // metadata to store the raw value if it's a count
          const metadata = metric.includes("time") ? {} : { count: value };

          await supabase.from("study_activity_logs").insert({
              user_id: user.id,
              activity_type: activityType,
              duration_seconds: duration,
              metadata: metadata
          });

      } catch (e) {
          console.error("Failed to update stats", e);
      }
  };

  // --- White Noise Effects ---
  useEffect(() => {
    if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.loop = true;
    }
    audioRef.current.volume = volume / 100;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (activeSound) {
        const soundUrl = SOUNDS.find(s => s.id === activeSound)?.url;
        if (soundUrl && audio.src !== soundUrl) {
            audio.src = soundUrl;
        }

        if (isNoisePlaying) {
            safePlayAudio(audio);
        } else {
            audio.pause();
        }
    } else {
        audio.pause();
    }
  }, [activeSound, isNoisePlaying]);

  const toggleSound = (id: string) => {
    if (activeSound === id) {
        setIsNoisePlaying(!isNoisePlaying);
    } else {
        setActiveSound(id);
        setIsNoisePlaying(true);
    }
  };

  const closePlayer = () => {
      setIsNoisePlaying(false);
      setIsFloating(false);
      setActiveSound(null);
  };

  // --- Pomodoro Effects ---
  useEffect(() => {
      if (!pomoAudioRef.current) {
          pomoAudioRef.current = new Audio(CLOCK_ALARM);
      }
  }, []);

  const changePomoMode = (m: "work" | "shortBreak" | "longBreak") => {
      setPomoMode(m);
      setIsPomoActive(false);
      switch(m) {
          case "work": setTimeLeft(customWorkDuration * 60); break;
          case "shortBreak": setTimeLeft(customBreakDuration * 60); break;
          case "longBreak": setTimeLeft(15 * 60); break;
      }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isPomoActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((t) => t - 1);
      }, 1000);
    } else if (timeLeft === 0 && isPomoActive) {
      // Session Finished
      setIsPomoActive(false);
      safePlayAudio(pomoAudioRef.current);

      if (pomoMode === 'work') {
          // Work Finished -> Start Break
          sendNotification("Time's Up!", "Work session finished. Take a break!");
          updateStreak();
          updateStats("pomodoros_completed", 1);
          updateStats("total_study_time", customWorkDuration); // Add minutes

          if (autoStartBreak) {
              // Trigger Rain for Break
              setActiveSound("rain");
              setIsNoisePlaying(true);

              changePomoMode("shortBreak");
              setIsPomoActive(true);
              toast({ title: "Break Started", description: "Rain sound enabled for relaxation." });
          } else {
              changePomoMode("shortBreak");
          }
      } else {
          // Break Finished -> Start Work
          sendNotification("Break Over!", "Time to get back to work!");

          // Stop rain if it was auto-started (simple logic: turn off noise)
          if (activeSound === "rain") {
              setIsNoisePlaying(false);
          }

          if (autoStartWork) {
              changePomoMode("work");
              setIsPomoActive(true);
          } else {
              changePomoMode("work");
          }
      }
    }

    return () => {
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPomoActive, timeLeft, pomoMode, customWorkDuration, customBreakDuration, autoStartBreak, autoStartWork]);

  const togglePomo = () => setIsPomoActive(!isPomoActive);

  const resetPomo = () => {
      setIsPomoActive(false);
      // Stop rain if active
      if (activeSound === "rain") setIsNoisePlaying(false);
      changePomoMode(pomoMode);
  };

  const skipBreak = () => {
      if (pomoMode === 'shortBreak' || pomoMode === 'longBreak') {
          setIsPomoActive(false);
          if (activeSound === "rain") setIsNoisePlaying(false);
          changePomoMode("work");
          // Optionally start immediately
          setIsPomoActive(true);
          toast({ title: "Break Skipped", description: "Back to work!" });
      }
  };

  // --- Reminder Effects ---
  useEffect(() => {
      if (isReminderActive && reminderInterval > 0) {
          reminderRef.current = setInterval(() => {
              safePlayAudio(pomoAudioRef.current);
              sendNotification("Reminder", reminderMessage || "Time to check in!");
          }, reminderInterval * 60 * 1000);
      } else {
          if (reminderRef.current) clearInterval(reminderRef.current);
      }

      return () => {
          if (reminderRef.current) clearInterval(reminderRef.current);
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReminderActive, reminderInterval, reminderMessage]);

  const startReminder = (min: number, msg: string) => {
      setReminderInterval(min);
      setReminderMessage(msg);
      setIsReminderActive(true);
      toast({ title: "Reminder set", description: `You will be reminded every ${min} minutes.` });
  };

  const stopReminder = () => {
      setIsReminderActive(false);
      toast({ title: "Reminder stopped" });
  };

  return (
    <StudyToolsContext.Provider value={{
        whiteNoise: {
            activeSound,
            isPlaying: isNoisePlaying,
            volume,
            isFloating,
            toggleSound,
            setVolume,
            setIsFloating,
            close: closePlayer
        },
        pomodoro: {
            timeLeft,
            isActive: isPomoActive,
            mode: pomoMode,
            customWorkDuration,
            customBreakDuration,
            autoStartBreak,
            autoStartWork,
            toggleTimer: togglePomo,
            resetTimer: resetPomo,
            changeMode: changePomoMode,
            setCustomWorkDuration,
            setCustomBreakDuration,
            setAutoStartBreak,
            setAutoStartWork,
            skipBreak
        },
        reminder: {
            intervalMinutes: reminderInterval,
            message: reminderMessage,
            isActive: isReminderActive,
            start: startReminder,
            stop: stopReminder
        },
        updateStreak,
        updateStats
    }}>
      {children}
    </StudyToolsContext.Provider>
  );
};
