// Shared rule used across the app: a "live" exam whose time window has
// ended (missed / deadline passed) is treated as "Practice" everywhere —
// Bookmarks, Exam History, My Mistakes, etc. There is no separate DB
// exam_type for this; it's derived purely from exam_type + time_window_end.

export type ExamCategory = "live" | "practice" | "readymade";

export interface ExamCategoryInput {
  exam_type?: string | null;
  is_readymade?: boolean | null;
  time_window_end?: string | null;
}

export function getExamCategory(exam: ExamCategoryInput | null | undefined): ExamCategory {
  if (!exam) return "practice";
  if (exam.is_readymade) return "readymade";
  if (exam.exam_type === "live") {
    const isPastDeadline = exam.time_window_end && new Date(exam.time_window_end) < new Date();
    return isPastDeadline ? "practice" : "live";
  }
  return "practice";
}
