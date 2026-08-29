-- Add option_e to mock_question_bookmarks for 5-option MCQ support
alter table public.mock_question_bookmarks add column if not exists option_e text;
