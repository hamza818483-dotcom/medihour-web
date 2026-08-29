// ... existing types

export interface ExamAttempt {
  id: string;
  exam_id: string;
  user_id: string;
  score: number;
  total_marks: number;
  started_at: string;
  submitted_at: string;
  answers: any; // Ideally this should be a specific structure
  exam?: {
    title: string;
    course?: {
      name: string;
    }
  };
}

export interface QuestionReview {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  explanation?: string;
  user_answer?: string;
  is_correct_answer?: boolean;
}
