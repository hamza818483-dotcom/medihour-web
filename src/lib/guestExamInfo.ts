// Guest identity for anonymous (login-free) Free Exam attempts.
// Collected once via GuestExamInfoDialog, then kept in localStorage so the
// visitor doesn't have to re-type it on future free exams, AND so the same
// info can pre-fill the real Register form if they come back to sign up later.

export interface GuestExamInfo {
  name: string;
  hscBatch: string;
  collegeName: string;
  phone: string;
}

const KEY = "freeExamGuestInfo";

export function getGuestInfo(): GuestExamInfo | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GuestExamInfo) : null;
  } catch {
    return null;
  }
}

export function setGuestInfo(info: GuestExamInfo) {
  try {
    localStorage.setItem(KEY, JSON.stringify(info));
  } catch {
    // ignore — worst case, dialog asks again next time
  }
}
