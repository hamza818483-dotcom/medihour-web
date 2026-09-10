// Tracks which list/page page a user started an exam from, so ExamReview's
// "Exam List" button can send them back to the correct page.
// Uses sessionStorage keyed by examId — does not touch routing or component props.

const KEY_PREFIX = "examSourceList:";
const FALLBACK = "/dashboard/past-exam";

export function setExamSourceList(examId: string, path: string) {
  try {
    sessionStorage.setItem(`${KEY_PREFIX}${examId}`, path);
  } catch {
    // sessionStorage unavailable — ignore, fallback will be used
  }
}

export function getExamSourceList(examId: string | undefined | null): string {
  if (!examId) return FALLBACK;
  try {
    return sessionStorage.getItem(`${KEY_PREFIX}${examId}`) || FALLBACK;
  } catch {
    return FALLBACK;
  }
}
