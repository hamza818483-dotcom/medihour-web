export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      announcement_reads: {
        Row: { announcement_id: string; id: string; read_at: string; user_id: string }
        Insert: { announcement_id: string; id?: string; read_at?: string; user_id: string }
        Update: { announcement_id?: string; id?: string; read_at?: string; user_id?: string }
        Relationships: [
          { foreignKeyName: "announcement_reads_announcement_id_fkey"; columns: ["announcement_id"]; isOneToOne: false; referencedRelation: "announcements"; referencedColumns: ["id"] },
        ]
      }
      announcements: {
        Row: { body: string; course_id: string | null; created_at: string; created_by: string | null; id: string; published_at: string; read_at: string | null; recipient_profile_id: string | null; title: string; type: string | null }
        Insert: { body: string; course_id?: string | null; created_at?: string; created_by?: string | null; id?: string; published_at?: string; read_at?: string | null; recipient_profile_id?: string | null; title: string; type?: string | null }
        Update: { body?: string; course_id?: string | null; created_at?: string; created_by?: string | null; id?: string; published_at?: string; read_at?: string | null; recipient_profile_id?: string | null; title?: string; type?: string | null }
        Relationships: [
          { foreignKeyName: "announcements_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] },
          { foreignKeyName: "announcements_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "announcements_recipient_profile_id_fkey"; columns: ["recipient_profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      app_settings: {
        Row: { key: string; updated_at: string; updated_by: string | null; value: Json }
        Insert: { key: string; updated_at?: string; updated_by?: string | null; value: Json }
        Update: { key?: string; updated_at?: string; updated_by?: string | null; value?: Json }
        Relationships: []
      }
      bookmarks: {
        Row: { created_at: string; id: string; profile_id: string; question_id: string }
        Insert: { created_at?: string; id?: string; profile_id: string; question_id: string }
        Update: { created_at?: string; id?: string; profile_id?: string; question_id?: string }
        Relationships: [
          { foreignKeyName: "bookmarks_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "bookmarks_question_id_fkey"; columns: ["question_id"]; isOneToOne: false; referencedRelation: "exam_questions"; referencedColumns: ["id"] },
        ]
      }
      class_comments: {
        Row: { class_id: string; comment_text: string; created_at: string; id: string; parent_id: string | null; user_id: string }
        Insert: { class_id: string; comment_text: string; created_at?: string; id?: string; parent_id?: string | null; user_id: string }
        Update: { class_id?: string; comment_text?: string; created_at?: string; id?: string; parent_id?: string | null; user_id?: string }
        Relationships: [
          { foreignKeyName: "class_comments_class_id_fkey"; columns: ["class_id"]; isOneToOne: false; referencedRelation: "classes"; referencedColumns: ["id"] },
          { foreignKeyName: "class_comments_parent_id_fkey"; columns: ["parent_id"]; isOneToOne: false; referencedRelation: "class_comments"; referencedColumns: ["id"] },
        ]
      }
      class_notes: {
        Row: { chapter: string | null; content: string | null; course_id: string | null; created_at: string; id: string; notes_url: string | null; shared_course_ids: string[] | null; subject: string | null; title: string; topic: string | null }
        Insert: { chapter?: string | null; content?: string | null; course_id?: string | null; created_at?: string; id?: string; notes_url?: string | null; shared_course_ids?: string[] | null; subject?: string | null; title: string; topic?: string | null }
        Update: { chapter?: string | null; content?: string | null; course_id?: string | null; created_at?: string; id?: string; notes_url?: string | null; shared_course_ids?: string[] | null; subject?: string | null; title?: string; topic?: string | null }
        Relationships: [
          { foreignKeyName: "class_notes_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] },
        ]
      }
      class_views: {
        Row: { class_id: string; created_at: string; id: string; profile_id: string }
        Insert: { class_id: string; created_at?: string; id?: string; profile_id: string }
        Update: { class_id?: string; created_at?: string; id?: string; profile_id?: string }
        Relationships: [
          { foreignKeyName: "class_views_class_id_fkey"; columns: ["class_id"]; isOneToOne: false; referencedRelation: "classes"; referencedColumns: ["id"] },
          { foreignKeyName: "class_views_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      class_watch_sessions: {
        Row: { category: string; class_id: string; created_at: string; id: string; last_watched_at: string; profile_id: string; watch_date: string; watched_seconds: number }
        Insert: { category: string; class_id: string; created_at?: string; id?: string; last_watched_at?: string; profile_id: string; watch_date?: string; watched_seconds?: number }
        Update: { category?: string; class_id?: string; created_at?: string; id?: string; last_watched_at?: string; profile_id?: string; watch_date?: string; watched_seconds?: number }
        Relationships: [
          { foreignKeyName: "class_watch_sessions_class_id_fkey"; columns: ["class_id"]; isOneToOne: false; referencedRelation: "classes"; referencedColumns: ["id"] },
          { foreignKeyName: "class_watch_sessions_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      classes: {
        Row: { archive_course_ids: string[] | null; archive_sort_order: number; button_text: string | null; button_url: string | null; chapter: string | null; class_type: string; course_id: string | null; created_at: string; end_at: string | null; free_sort_order: number; id: string; is_archive: boolean | null; is_archived: boolean | null; notes_url: string | null; shared_course_ids: string[] | null; sort_order: number | null; start_at: string | null; subject: string[] | null; title: string; topic: string | null; updated_at: string; video_url: string | null }
        Insert: { archive_course_ids?: string[] | null; archive_sort_order?: number; button_text?: string | null; button_url?: string | null; chapter?: string | null; class_type: string; course_id?: string | null; created_at?: string; end_at?: string | null; free_sort_order?: number; id?: string; is_archive?: boolean | null; is_archived?: boolean | null; notes_url?: string | null; shared_course_ids?: string[] | null; sort_order?: number | null; start_at?: string | null; subject?: string[] | null; title: string; topic?: string | null; updated_at?: string; video_url?: string | null }
        Update: { archive_course_ids?: string[] | null; archive_sort_order?: number; button_text?: string | null; button_url?: string | null; chapter?: string | null; class_type?: string; course_id?: string | null; created_at?: string; end_at?: string | null; free_sort_order?: number; id?: string; is_archive?: boolean | null; is_archived?: boolean | null; notes_url?: string | null; shared_course_ids?: string[] | null; sort_order?: number | null; start_at?: string | null; subject?: string[] | null; title?: string; topic?: string | null; updated_at?: string; video_url?: string | null }
        Relationships: [
          { foreignKeyName: "classes_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] },
        ]
      }
      community_link_clicks: {
        Row: { clicked_at: string; id: string; profile_id: string; resource_id: string }
        Insert: { clicked_at?: string; id?: string; profile_id: string; resource_id: string }
        Update: { clicked_at?: string; id?: string; profile_id?: string; resource_id?: string }
        Relationships: [
          { foreignKeyName: "community_link_clicks_resource_id_fkey"; columns: ["resource_id"]; isOneToOne: false; referencedRelation: "resources"; referencedColumns: ["id"] },
        ]
      }
      course_mentors: {
        Row: { course_id: string; created_at: string; display_order: number | null; experience_years: string | null; id: string; mentor_id: string }
        Insert: { course_id: string; created_at?: string; display_order?: number | null; experience_years?: string | null; id?: string; mentor_id: string }
        Update: { course_id?: string; created_at?: string; display_order?: number | null; experience_years?: string | null; id?: string; mentor_id?: string }
        Relationships: [
          { foreignKeyName: "course_mentors_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] },
          { foreignKeyName: "course_mentors_mentor_id_fkey"; columns: ["mentor_id"]; isOneToOne: false; referencedRelation: "mentors"; referencedColumns: ["id"] },
        ]
      }
      courses: {
        Row: { access_unlimited_practice: boolean | null; archive_full_access: boolean | null; bkash_number: string | null; category: string[] | null; contact_info: string | null; created_at: string; demo_content: Json | null; extra_links: Json | null; full_description: string | null; full_description_blocks: Json | null; id: string; image_url: string | null; included_course_ids: string[] | null; is_active: boolean; is_hidden: boolean; is_public: boolean; linked_course_ids: string[] | null; nagad_number: string | null; name: string; original_price: number | null; price: number | null; priority: number | null; routine_url: string | null; sections: string[] | null; short_description: string | null; short_description_lines: Json | null; show_enrollment_count: boolean; slug: string | null; sub_category: string[] | null; sub_category_order: Json | null; updated_at: string; video_url: string | null; what_you_get: string[] | null }
        Insert: { access_unlimited_practice?: boolean | null; archive_full_access?: boolean | null; bkash_number?: string | null; category?: string[] | null; contact_info?: string | null; created_at?: string; demo_content?: Json | null; extra_links?: Json | null; full_description?: string | null; full_description_blocks?: Json | null; id?: string; image_url?: string | null; included_course_ids?: string[] | null; is_active?: boolean; is_hidden?: boolean; is_public?: boolean; linked_course_ids?: string[] | null; nagad_number?: string | null; name: string; original_price?: number | null; price?: number | null; priority?: number | null; routine_url?: string | null; sections?: string[] | null; short_description?: string | null; short_description_lines?: Json | null; show_enrollment_count?: boolean; slug?: string | null; sub_category?: string[] | null; sub_category_order?: Json | null; updated_at?: string; video_url?: string | null; what_you_get?: string[] | null }
        Update: { access_unlimited_practice?: boolean | null; archive_full_access?: boolean | null; bkash_number?: string | null; category?: string[] | null; contact_info?: string | null; created_at?: string; demo_content?: Json | null; extra_links?: Json | null; full_description?: string | null; full_description_blocks?: Json | null; id?: string; image_url?: string | null; included_course_ids?: string[] | null; is_active?: boolean; is_hidden?: boolean; is_public?: boolean; linked_course_ids?: string[] | null; nagad_number?: string | null; name?: string; original_price?: number | null; price?: number | null; priority?: number | null; routine_url?: string | null; sections?: string[] | null; short_description?: string | null; short_description_lines?: Json | null; show_enrollment_count?: boolean; slug?: string | null; sub_category?: string[] | null; sub_category_order?: Json | null; updated_at?: string; video_url?: string | null; what_you_get?: string[] | null }
        Relationships: []
      }
      ebooks: {
        Row: { created_at: string; discount_price: number | null; display_order: number | null; download_url: string | null; id: string; image_url: string | null; is_active: boolean; name: string; original_price: number | null }
        Insert: { created_at?: string; discount_price?: number | null; display_order?: number | null; download_url?: string | null; id?: string; image_url?: string | null; is_active?: boolean; name: string; original_price?: number | null }
        Update: { created_at?: string; discount_price?: number | null; display_order?: number | null; download_url?: string | null; id?: string; image_url?: string | null; is_active?: boolean; name?: string; original_price?: number | null }
        Relationships: []
      }
      emi_logs: {
        Row: { admin_note: string | null; amount: number; course_id: string | null; id: string; payment_request_id: string | null; profile_id: string | null; recorded_at: string }
        Insert: { admin_note?: string | null; amount: number; course_id?: string | null; id?: string; payment_request_id?: string | null; profile_id?: string | null; recorded_at?: string }
        Update: { admin_note?: string | null; amount?: number; course_id?: string | null; id?: string; payment_request_id?: string | null; profile_id?: string | null; recorded_at?: string }
        Relationships: [
          { foreignKeyName: "emi_logs_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] },
          { foreignKeyName: "emi_logs_payment_request_id_fkey"; columns: ["payment_request_id"]; isOneToOne: false; referencedRelation: "payment_requests"; referencedColumns: ["id"] },
          { foreignKeyName: "emi_logs_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      enrollments: {
        Row: { course_id: string; created_at: string; expires_at: string | null; id: string; metadata: Json | null; profile_id: string; valid_from: string | null; valid_until: string | null }
        Insert: { course_id: string; created_at?: string; expires_at?: string | null; id?: string; metadata?: Json | null; profile_id: string; valid_from?: string | null; valid_until?: string | null }
        Update: { course_id?: string; created_at?: string; expires_at?: string | null; id?: string; metadata?: Json | null; profile_id?: string; valid_from?: string | null; valid_until?: string | null }
        Relationships: [
          { foreignKeyName: "enrollments_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] },
          { foreignKeyName: "enrollments_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      exam_answers: {
        Row: { attempt_id: string; created_at: string; id: string; is_correct: boolean | null; question_id: string; selected_option: string | null }
        Insert: { attempt_id: string; created_at?: string; id?: string; is_correct?: boolean | null; question_id: string; selected_option?: string | null }
        Update: { attempt_id?: string; created_at?: string; id?: string; is_correct?: boolean | null; question_id?: string; selected_option?: string | null }
        Relationships: [
          { foreignKeyName: "exam_answers_attempt_id_fkey"; columns: ["attempt_id"]; isOneToOne: false; referencedRelation: "exam_attempts"; referencedColumns: ["id"] },
          { foreignKeyName: "exam_answers_attempt_id_fkey"; columns: ["attempt_id"]; isOneToOne: false; referencedRelation: "leaderboard_exam_attempts"; referencedColumns: ["id"] },
          { foreignKeyName: "exam_answers_question_id_fkey"; columns: ["question_id"]; isOneToOne: false; referencedRelation: "exam_questions"; referencedColumns: ["id"] },
        ]
      }
      exam_attempts: {
        Row: { answers: Json | null; attempt_number: number | null; attempt_type: string | null; created_at: string; exam_id: string; id: string; profile_id: string; score: number | null; started_at: string; submitted_at: string | null; time_taken_seconds: number | null; total_marks: number | null; violation_count: number | null }
        Insert: { answers?: Json | null; attempt_number?: number | null; attempt_type?: string | null; created_at?: string; exam_id: string; id?: string; profile_id: string; score?: number | null; started_at?: string; submitted_at?: string | null; time_taken_seconds?: number | null; total_marks?: number | null; violation_count?: number | null }
        Update: { answers?: Json | null; attempt_number?: number | null; attempt_type?: string | null; created_at?: string; exam_id?: string; id?: string; profile_id?: string; score?: number | null; started_at?: string; submitted_at?: string | null; time_taken_seconds?: number | null; total_marks?: number | null; violation_count?: number | null }
        Relationships: [
          { foreignKeyName: "exam_attempts_exam_id_fkey"; columns: ["exam_id"]; isOneToOne: false; referencedRelation: "exams"; referencedColumns: ["id"] },
          { foreignKeyName: "exam_attempts_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      exam_question_counts: {
        Row: { exam_id: string; question_count: number }
        Insert: { exam_id: string; question_count: number }
        Update: { exam_id?: string; question_count?: number }
        Relationships: []
      }
      exam_questions: {
        Row: { chapter: string | null; correct_option: string; difficulty: string | null; exam_code: string | null; exam_id: string; explanation: string | null; id: string; is_segment_mandatory: boolean | null; marks: number; option_a: string; option_b: string; option_c: string; option_d: string; option_e: string | null; question_index: number; question_text: string; question_type: string | null; section: string | null; subject: string | null; subtopic: string | null; tags: string[] | null; topic: string | null; year: string | null }
        Insert: { chapter?: string | null; correct_option: string; difficulty?: string | null; exam_code?: string | null; exam_id: string; explanation?: string | null; id?: string; is_segment_mandatory?: boolean | null; marks?: number; option_a: string; option_b: string; option_c: string; option_d: string; option_e?: string | null; question_index: number; question_text: string; question_type?: string | null; section?: string | null; subject?: string | null; subtopic?: string | null; tags?: string[] | null; topic?: string | null; year?: string | null }
        Update: { chapter?: string | null; correct_option?: string; difficulty?: string | null; exam_code?: string | null; exam_id?: string; explanation?: string | null; id?: string; is_segment_mandatory?: boolean | null; marks?: number; option_a?: string; option_b?: string; option_c?: string; option_d?: string; option_e?: string | null; question_index?: number; question_text?: string; question_type?: string | null; section?: string | null; subject?: string | null; subtopic?: string | null; tags?: string[] | null; topic?: string | null; year?: string | null }
        Relationships: [
          { foreignKeyName: "exam_questions_exam_id_fkey"; columns: ["exam_id"]; isOneToOne: false; referencedRelation: "exams"; referencedColumns: ["id"] },
        ]
      }
      exam_schedules: {
        Row: { category_name: string; created_at: string | null; display_order: number | null; exam_date: string; id: string; paper_name: string | null; subject_name: string; updated_at: string | null }
        Insert: { category_name?: string; created_at?: string | null; display_order?: number | null; exam_date: string; id?: string; paper_name?: string | null; subject_name: string; updated_at?: string | null }
        Update: { category_name?: string; created_at?: string | null; display_order?: number | null; exam_date?: string; id?: string; paper_name?: string | null; subject_name?: string; updated_at?: string | null }
        Relationships: []
      }
      exams: {
        Row: { allow_guest: boolean; archive_course_ids: string[] | null; archive_sort_order: number; category: string[] | null; chapter: string | null; course_id: string | null; created_at: string; disable_second_timer_deduction: boolean | null; duration_minutes: number; exam_type: string; external_exam_link: string | null; free_exam_category: string; free_sort_order: number; id: string; instructions: string | null; is_archive: boolean | null; is_archived: boolean | null; is_omr: boolean | null; is_only_live: boolean | null; is_published: boolean; is_readymade: boolean | null; is_visible_on_free: boolean | null; negative_mark_per_question: number; parent_exam_id: string | null; readymade_category: string | null; readymade_course_ids: string[] | null; readymade_sort_order: number; readymade_sub_chapter: string | null; readymade_topic: string | null; restrict_solution: boolean | null; shared_course_ids: string[] | null; show_on_landing: boolean; sort_order: number; subject: string[] | null; telegram_channel_ids: string[] | null; time_window_end: string | null; time_window_start: string | null; title: string; total_marks: number | null; updated_at: string }
        Insert: { allow_guest?: boolean; archive_course_ids?: string[] | null; archive_sort_order?: number; category?: string[] | null; chapter?: string | null; course_id?: string | null; created_at?: string; disable_second_timer_deduction?: boolean | null; duration_minutes: number; exam_type: string; external_exam_link?: string | null; free_exam_category?: string; free_sort_order?: number; id?: string; instructions?: string | null; is_archive?: boolean | null; is_archived?: boolean | null; is_omr?: boolean | null; is_only_live?: boolean | null; is_published?: boolean; is_readymade?: boolean | null; is_visible_on_free?: boolean | null; negative_mark_per_question?: number; parent_exam_id?: string | null; readymade_category?: string | null; readymade_course_ids?: string[] | null; readymade_sort_order?: number; readymade_sub_chapter?: string | null; readymade_topic?: string | null; restrict_solution?: boolean | null; shared_course_ids?: string[] | null; show_on_landing?: boolean; sort_order?: number; subject?: string[] | null; telegram_channel_ids?: string[] | null; time_window_end?: string | null; time_window_start?: string | null; title: string; total_marks?: number | null; updated_at?: string }
        Update: { allow_guest?: boolean; archive_course_ids?: string[] | null; archive_sort_order?: number; category?: string[] | null; chapter?: string | null; course_id?: string | null; created_at?: string; disable_second_timer_deduction?: boolean | null; duration_minutes?: number; exam_type?: string; external_exam_link?: string | null; free_exam_category?: string; free_sort_order?: number; id?: string; instructions?: string | null; is_archive?: boolean | null; is_archived?: boolean | null; is_omr?: boolean | null; is_only_live?: boolean | null; is_published?: boolean; is_readymade?: boolean | null; is_visible_on_free?: boolean | null; negative_mark_per_question?: number; parent_exam_id?: string | null; readymade_category?: string | null; readymade_course_ids?: string[] | null; readymade_sort_order?: number; readymade_sub_chapter?: string | null; readymade_topic?: string | null; restrict_solution?: boolean | null; shared_course_ids?: string[] | null; show_on_landing?: boolean; sort_order?: number; subject?: string[] | null; telegram_channel_ids?: string[] | null; time_window_end?: string | null; time_window_start?: string | null; title?: string; total_marks?: number | null; updated_at?: string }
        Relationships: [
          { foreignKeyName: "exams_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] },
          { foreignKeyName: "exams_parent_exam_id_fkey"; columns: ["parent_exam_id"]; isOneToOne: false; referencedRelation: "exams"; referencedColumns: ["id"] },
        ]
      }
      focus_sessions: {
        Row: { created_at: string; duration_seconds: number; ended_at: string | null; id: number; is_break_start: boolean; is_paused: boolean; last_heartbeat_at: string | null; mood: string; started_at: string; status: string; user_id: string }
        Insert: { created_at?: string; duration_seconds?: number; ended_at?: string | null; id?: never; is_break_start?: boolean; is_paused?: boolean; last_heartbeat_at?: string | null; mood: string; started_at?: string; status?: string; user_id: string }
        Update: { created_at?: string; duration_seconds?: number; ended_at?: string | null; id?: never; is_break_start?: boolean; is_paused?: boolean; last_heartbeat_at?: string | null; mood?: string; started_at?: string; status?: string; user_id?: string }
        Relationships: []
      }
      global_metadata: {
        Row: { created_at: string; id: string; type: string; value: string }
        Insert: { created_at?: string; id?: string; type: string; value: string }
        Update: { created_at?: string; id?: string; type?: string; value?: string }
        Relationships: []
      }
      heroes: {
        Row: { background_config: Json | null; countdown_target: string | null; created_at: string; cta_link: string | null; cta_text: string | null; display_order: number | null; hero_type: string | null; id: string; image_url: string; is_active: boolean | null; markdown_content: string | null; subtitle: string | null; title: string }
        Insert: { background_config?: Json | null; countdown_target?: string | null; created_at?: string; cta_link?: string | null; cta_text?: string | null; display_order?: number | null; hero_type?: string | null; id?: string; image_url: string; is_active?: boolean | null; markdown_content?: string | null; subtitle?: string | null; title: string }
        Update: { background_config?: Json | null; countdown_target?: string | null; created_at?: string; cta_link?: string | null; cta_text?: string | null; display_order?: number | null; hero_type?: string | null; id?: string; image_url?: string; is_active?: boolean | null; markdown_content?: string | null; subtitle?: string | null; title?: string }
        Relationships: []
      }
      mentors: {
        Row: { created_at: string; description: string | null; display_order: number | null; id: string; image_url: string | null; name: string; role: string | null }
        Insert: { created_at?: string; description?: string | null; display_order?: number | null; id?: string; image_url?: string | null; name: string; role?: string | null }
        Update: { created_at?: string; description?: string | null; display_order?: number | null; id?: string; image_url?: string | null; name?: string; role?: string | null }
        Relationships: []
      }
      official_links: {
        Row: { email: string | null; facebook_group: string | null; facebook_page: string | null; id: number; telegram: string | null; updated_at: string; whatsapp: string | null; youtube: string | null }
        Insert: { email?: string | null; facebook_group?: string | null; facebook_page?: string | null; id?: number; telegram?: string | null; updated_at?: string; whatsapp?: string | null; youtube?: string | null }
        Update: { email?: string | null; facebook_group?: string | null; facebook_page?: string | null; id?: number; telegram?: string | null; updated_at?: string; whatsapp?: string | null; youtube?: string | null }
        Relationships: []
      }
      payment_requests: {
        Row: { admin_note: string | null; amount_paid: number | null; amount_sent: number | null; contact_number: string | null; course_id: string; created_at: string; due_amount: number | null; due_date: string | null; event_id: string | null; id: string; payment_method: string; phone: string; profile_id: string; promo_code_id: string | null; sender_last5: string | null; social_link: string | null; status: string; trx_id: string; updated_at: string; utm_campaign: string | null; utm_content: string | null; utm_medium: string | null; utm_source: string | null; utm_term: string | null }
        Insert: { admin_note?: string | null; amount_paid?: number | null; amount_sent?: number | null; contact_number?: string | null; course_id: string; created_at?: string; due_amount?: number | null; due_date?: string | null; event_id?: string | null; id?: string; payment_method: string; phone: string; profile_id: string; promo_code_id?: string | null; sender_last5?: string | null; social_link?: string | null; status?: string; trx_id: string; updated_at?: string; utm_campaign?: string | null; utm_content?: string | null; utm_medium?: string | null; utm_source?: string | null; utm_term?: string | null }
        Update: { admin_note?: string | null; amount_paid?: number | null; amount_sent?: number | null; contact_number?: string | null; course_id?: string; created_at?: string; due_amount?: number | null; due_date?: string | null; event_id?: string | null; id?: string; payment_method?: string; phone?: string; profile_id?: string; promo_code_id?: string | null; sender_last5?: string | null; social_link?: string | null; status?: string; trx_id?: string; updated_at?: string; utm_campaign?: string | null; utm_content?: string | null; utm_medium?: string | null; utm_source?: string | null; utm_term?: string | null }
        Relationships: [
          { foreignKeyName: "payment_requests_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] },
          { foreignKeyName: "payment_requests_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "payment_requests_promo_code_id_fkey"; columns: ["promo_code_id"]; isOneToOne: false; referencedRelation: "promo_codes"; referencedColumns: ["id"] },
        ]
      }
      profiles: {
        Row: { avatar_url: string | null; batch_year: number | null; college_name: string | null; created_at: string; current_session_id: string | null; extra_time_multiplier: number; father_name: string | null; full_name: string | null; gender: string | null; has_changed_email: boolean | null; hsc_batch: string | null; hsc_gpa: number | null; id: string; is_second_timer: boolean | null; mother_name: string | null; name_changed_once: boolean; omr_reg_no: string | null; omr_roll_no: string | null; phone: string | null; registration_id: string; school: string | null; ssc_gpa: number | null; status: string | null; updated_at: string }
        Insert: { avatar_url?: string | null; batch_year?: number | null; college_name?: string | null; created_at?: string; current_session_id?: string | null; extra_time_multiplier?: number; father_name?: string | null; full_name?: string | null; gender?: string | null; has_changed_email?: boolean | null; hsc_batch?: string | null; hsc_gpa?: number | null; id: string; is_second_timer?: boolean | null; mother_name?: string | null; name_changed_once?: boolean; omr_reg_no?: string | null; omr_roll_no?: string | null; phone?: string | null; registration_id: string; school?: string | null; ssc_gpa?: number | null; status?: string | null; updated_at?: string }
        Update: { avatar_url?: string | null; batch_year?: number | null; college_name?: string | null; created_at?: string; current_session_id?: string | null; extra_time_multiplier?: number; father_name?: string | null; full_name?: string | null; gender?: string | null; has_changed_email?: boolean | null; hsc_batch?: string | null; hsc_gpa?: number | null; id?: string; is_second_timer?: boolean | null; mother_name?: string | null; name_changed_once?: boolean; omr_reg_no?: string | null; omr_roll_no?: string | null; phone?: string | null; registration_id?: string; school?: string | null; ssc_gpa?: number | null; status?: string | null; updated_at?: string }
        Relationships: []
      }
      promo_codes: {
        Row: { code: string; course_id: string | null; course_ids: string[] | null; created_at: string; discount_amount: number; discount_type: string | null; id: string; is_active: boolean | null; special_discount_deadline: string | null; special_discount_text: string | null; usage_limit: number | null; used_count: number | null }
        Insert: { code: string; course_id?: string | null; course_ids?: string[] | null; created_at?: string; discount_amount: number; discount_type?: string | null; id?: string; is_active?: boolean | null; special_discount_deadline?: string | null; special_discount_text?: string | null; usage_limit?: number | null; used_count?: number | null }
        Update: { code?: string; course_id?: string | null; course_ids?: string[] | null; created_at?: string; discount_amount?: number; discount_type?: string | null; id?: string; is_active?: boolean | null; special_discount_deadline?: string | null; special_discount_text?: string | null; usage_limit?: number | null; used_count?: number | null }
        Relationships: [
          { foreignKeyName: "promo_codes_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] },
        ]
      }
      push_subscriptions: {
        Row: { auth: string; created_at: string; endpoint: string; id: string; p256dh: string; user_id: string }
        Insert: { auth: string; created_at?: string; endpoint: string; id?: string; p256dh: string; user_id: string }
        Update: { auth?: string; created_at?: string; endpoint?: string; id?: string; p256dh?: string; user_id?: string }
        Relationships: []
      }
      qp_attempts: {
        Row: { chapter_ids: number[] | null; correct_count: number; created_at: string; id: number; mode: string; points_earned: number; total_questions: number; user_id: string }
        Insert: { chapter_ids?: number[] | null; correct_count?: number; created_at?: string; id?: never; mode: string; points_earned?: number; total_questions?: number; user_id: string }
        Update: { chapter_ids?: number[] | null; correct_count?: number; created_at?: string; id?: never; mode?: string; points_earned?: number; total_questions?: number; user_id?: string }
        Relationships: []
      }
      qp_chapters: {
        Row: { created_at: string; id: number; name: string; sort_order: number; subject_id: number }
        Insert: { created_at?: string; id?: never; name: string; sort_order?: number; subject_id: number }
        Update: { created_at?: string; id?: never; name?: string; sort_order?: number; subject_id?: number }
        Relationships: [
          { foreignKeyName: "qp_chapters_subject_id_fkey"; columns: ["subject_id"]; isOneToOne: false; referencedRelation: "qp_subjects"; referencedColumns: ["id"] },
        ]
      }
      qp_mcqs: {
        Row: { chapter_id: number; correct_index: number; created_at: string; explanation: string | null; id: number; options: Json; question: string }
        Insert: { chapter_id: number; correct_index: number; created_at?: string; explanation?: string | null; id?: never; options: Json; question: string }
        Update: { chapter_id?: number; correct_index?: number; created_at?: string; explanation?: string | null; id?: never; options?: Json; question?: string }
        Relationships: [
          { foreignKeyName: "qp_mcqs_chapter_id_fkey"; columns: ["chapter_id"]; isOneToOne: false; referencedRelation: "qp_chapters"; referencedColumns: ["id"] },
        ]
      }
      qp_subjects: {
        Row: { created_at: string; id: number; name: string; sort_order: number }
        Insert: { created_at?: string; id?: never; name: string; sort_order?: number }
        Update: { created_at?: string; id?: never; name?: string; sort_order?: number }
        Relationships: []
      }
      qp_user_points: {
        Row: { total_points: number; updated_at: string; user_id: string }
        Insert: { total_points?: number; updated_at?: string; user_id: string }
        Update: { total_points?: number; updated_at?: string; user_id?: string }
        Relationships: []
      }
      question_bank: {
        Row: { chapter: string | null; correct_option: string; created_at: string; difficulty: string | null; exam_code: string | null; explanation: string | null; id: string; option_a: string; option_b: string; option_c: string; option_d: string; question_text: string; subject: string | null; tags: string[] | null; topic: string | null; updated_at: string; year: string | null }
        Insert: { chapter?: string | null; correct_option: string; created_at?: string; difficulty?: string | null; exam_code?: string | null; explanation?: string | null; id?: string; option_a: string; option_b: string; option_c: string; option_d: string; question_text: string; subject?: string | null; tags?: string[] | null; topic?: string | null; updated_at?: string; year?: string | null }
        Update: { chapter?: string | null; correct_option?: string; created_at?: string; difficulty?: string | null; exam_code?: string | null; explanation?: string | null; id?: string; option_a?: string; option_b?: string; option_c?: string; option_d?: string; question_text?: string; subject?: string | null; tags?: string[] | null; topic?: string | null; updated_at?: string; year?: string | null }
        Relationships: []
      }
      question_reports: {
        Row: { admin_feedback: string | null; created_at: string | null; id: string; image_url: string | null; question_id: string; report_text: string; resolved_at: string | null; status: string | null; suggested_correct_option: string | null; user_id: string }
        Insert: { admin_feedback?: string | null; created_at?: string | null; id?: string; image_url?: string | null; question_id: string; report_text: string; resolved_at?: string | null; status?: string | null; suggested_correct_option?: string | null; user_id: string }
        Update: { admin_feedback?: string | null; created_at?: string | null; id?: string; image_url?: string | null; question_id?: string; report_text?: string; resolved_at?: string | null; status?: string | null; suggested_correct_option?: string | null; user_id?: string }
        Relationships: [
          { foreignKeyName: "question_reports_question_id_fkey"; columns: ["question_id"]; isOneToOne: false; referencedRelation: "exam_questions"; referencedColumns: ["id"] },
          { foreignKeyName: "question_reports_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      reminder_preferences: {
        Row: { created_at: string; id: string; profile_id: string; remind_before_minutes: number; remind_for_live_classes: boolean; remind_for_live_exams: boolean; remind_for_practice_exams: boolean; updated_at: string }
        Insert: { created_at?: string; id?: string; profile_id: string; remind_before_minutes?: number; remind_for_live_classes?: boolean; remind_for_live_exams?: boolean; remind_for_practice_exams?: boolean; updated_at?: string }
        Update: { created_at?: string; id?: string; profile_id?: string; remind_before_minutes?: number; remind_for_live_classes?: boolean; remind_for_live_exams?: boolean; remind_for_practice_exams?: boolean; updated_at?: string }
        Relationships: [
          { foreignKeyName: "reminder_preferences_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: true; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      resources: {
        Row: { course_id: string | null; created_at: string; description: string | null; id: string; resource_type: string; shared_course_ids: string[] | null; subject: string | null; title: string; url: string }
        Insert: { course_id?: string | null; created_at?: string; description?: string | null; id?: string; resource_type: string; shared_course_ids?: string[] | null; subject?: string | null; title: string; url: string }
        Update: { course_id?: string | null; created_at?: string; description?: string | null; id?: string; resource_type?: string; shared_course_ids?: string[] | null; subject?: string | null; title?: string; url?: string }
        Relationships: [
          { foreignKeyName: "resources_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] },
        ]
      }
      reviews: {
        Row: { category: string | null; college_name: string | null; course_id: string | null; created_at: string; gender: string | null; id: string; image_url: string | null; images: string[] | null; is_featured: boolean | null; post_image_url: string | null; rating: number | null; review_text: string; student_name: string }
        Insert: { category?: string | null; college_name?: string | null; course_id?: string | null; created_at?: string; gender?: string | null; id?: string; image_url?: string | null; images?: string[] | null; is_featured?: boolean | null; post_image_url?: string | null; rating?: number | null; review_text: string; student_name: string }
        Update: { category?: string | null; college_name?: string | null; course_id?: string | null; created_at?: string; gender?: string | null; id?: string; image_url?: string | null; images?: string[] | null; is_featured?: boolean | null; post_image_url?: string | null; rating?: number | null; review_text?: string; student_name?: string }
        Relationships: [
          { foreignKeyName: "reviews_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] },
        ]
      }
      routines: {
        Row: { content: string | null; course_id: string | null; course_ids: string[] | null; created_at: string | null; id: string; is_visible: boolean | null; media_urls: string[] | null; title: string }
        Insert: { content?: string | null; course_id?: string | null; course_ids?: string[] | null; created_at?: string | null; id?: string; is_visible?: boolean | null; media_urls?: string[] | null; title: string }
        Update: { content?: string | null; course_id?: string | null; course_ids?: string[] | null; created_at?: string | null; id?: string; is_visible?: boolean | null; media_urls?: string[] | null; title?: string }
        Relationships: [
          { foreignKeyName: "routines_course_id_fkey"; columns: ["course_id"]; isOneToOne: false; referencedRelation: "courses"; referencedColumns: ["id"] },
        ]
      }
      special_exam_cards: {
        Row: { action_link: string | null; button_text: string | null; card_type: string; created_at: string | null; details: string | null; display_order: number | null; id: string; image_url: string | null; instructions: string | null; is_active: boolean | null; title: string; updated_at: string | null }
        Insert: { action_link?: string | null; button_text?: string | null; card_type?: string; created_at?: string | null; details?: string | null; display_order?: number | null; id?: string; image_url?: string | null; instructions?: string | null; is_active?: boolean | null; title: string; updated_at?: string | null }
        Update: { action_link?: string | null; button_text?: string | null; card_type?: string; created_at?: string | null; details?: string | null; display_order?: number | null; id?: string; image_url?: string | null; instructions?: string | null; is_active?: boolean | null; title?: string; updated_at?: string | null }
        Relationships: []
      }
      st_chapters: {
        Row: { created_at: string; id: number; name: string; sort_order: number; subject_id: number }
        Insert: { created_at?: string; id?: never; name: string; sort_order?: number; subject_id: number }
        Update: { created_at?: string; id?: never; name?: string; sort_order?: number; subject_id?: number }
        Relationships: [
          { foreignKeyName: "st_chapters_subject_id_fkey"; columns: ["subject_id"]; isOneToOne: false; referencedRelation: "st_subjects"; referencedColumns: ["id"] },
        ]
      }
      st_subjects: {
        Row: { created_at: string; id: number; mode: string; name: string; short_name: string | null; sort_order: number }
        Insert: { created_at?: string; id?: never; mode: string; name: string; short_name?: string | null; sort_order?: number }
        Update: { created_at?: string; id?: never; mode?: string; name?: string; short_name?: string | null; sort_order?: number }
        Relationships: []
      }
      st_topics: {
        Row: { chapter_id: number; created_at: string; id: number; name: string; sort_order: number; weight: number }
        Insert: { chapter_id: number; created_at?: string; id?: never; name: string; sort_order?: number; weight?: number }
        Update: { chapter_id?: number; created_at?: string; id?: never; name?: string; sort_order?: number; weight?: number }
        Relationships: [
          { foreignKeyName: "st_topics_chapter_id_fkey"; columns: ["chapter_id"]; isOneToOne: false; referencedRelation: "st_chapters"; referencedColumns: ["id"] },
        ]
      }
      st_user_progress: {
        Row: { done_topics: number; mode: string; pct: number; total_topics: number; updated_at: string; user_id: string }
        Insert: { done_topics?: number; mode: string; pct?: number; total_topics?: number; updated_at?: string; user_id: string }
        Update: { done_topics?: number; mode?: string; pct?: number; total_topics?: number; updated_at?: string; user_id?: string }
        Relationships: []
      }
      study_activity_logs: {
        Row: { activity_type: string; created_at: string; duration_seconds: number | null; id: string; metadata: Json | null; user_id: string | null }
        Insert: { activity_type: string; created_at?: string; duration_seconds?: number | null; id?: string; metadata?: Json | null; user_id?: string | null }
        Update: { activity_type?: string; created_at?: string; duration_seconds?: number | null; id?: string; metadata?: Json | null; user_id?: string | null }
        Relationships: [
          { foreignKeyName: "study_activity_logs_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      success_gallery: {
        Row: { caption: string | null; created_at: string; display_order: number; id: string; image_url: string }
        Insert: { caption?: string | null; created_at?: string; display_order?: number; id?: string; image_url: string }
        Update: { caption?: string | null; created_at?: string; display_order?: number; id?: string; image_url?: string }
        Relationships: []
      }
      telegram_channels: {
        Row: { chat_id: string; created_at: string; id: string; is_active: boolean; name: string }
        Insert: { chat_id: string; created_at?: string; id?: string; is_active?: boolean; name: string }
        Update: { chat_id?: string; created_at?: string; id?: string; is_active?: boolean; name?: string }
        Relationships: []
      }
      user_note_states: {
        Row: { id: string; is_bookmarked: boolean | null; note_id: string; profile_id: string; sort_order: number | null; updated_at: string }
        Insert: { id?: string; is_bookmarked?: boolean | null; note_id: string; profile_id: string; sort_order?: number | null; updated_at?: string }
        Update: { id?: string; is_bookmarked?: boolean | null; note_id?: string; profile_id?: string; sort_order?: number | null; updated_at?: string }
        Relationships: [
          { foreignKeyName: "user_note_states_note_id_fkey"; columns: ["note_id"]; isOneToOne: false; referencedRelation: "class_notes"; referencedColumns: ["id"] },
          { foreignKeyName: "user_note_states_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      user_notifications: {
        Row: { body: string; created_at: string; id: string; is_read: boolean | null; title: string; type: string | null; user_id: string }
        Insert: { body: string; created_at?: string; id?: string; is_read?: boolean | null; title: string; type?: string | null; user_id: string }
        Update: { body?: string; created_at?: string; id?: string; is_read?: boolean | null; title?: string; type?: string | null; user_id?: string }
        Relationships: []
      }
      user_roles: {
        Row: { id: string; role: Database["public"]["Enums"]["app_role"]; user_id: string }
        Insert: { id?: string; role: Database["public"]["Enums"]["app_role"]; user_id: string }
        Update: { id?: string; role?: Database["public"]["Enums"]["app_role"]; user_id?: string }
        Relationships: []
      }
      user_study_data: {
        Row: { created_at: string; flashcards: Json | null; id: string; stats: Json | null; streak_info: Json | null; todos: Json | null; updated_at: string; user_id: string }
        Insert: { created_at?: string; flashcards?: Json | null; id?: string; stats?: Json | null; streak_info?: Json | null; todos?: Json | null; updated_at?: string; user_id: string }
        Update: { created_at?: string; flashcards?: Json | null; id?: string; stats?: Json | null; streak_info?: Json | null; todos?: Json | null; updated_at?: string; user_id?: string }
        Relationships: []
      }
    }
    Views: {
      leaderboard_exam_attempts: {
        Row: { attempt_number: number | null; attempt_type: string | null; created_at: string | null; exam_id: string | null; id: string | null; profile: Json | null; profile_id: string | null; score: number | null; started_at: string | null; submitted_at: string | null; time_taken_seconds: number | null; violation_count: number | null }
        Relationships: [
          { foreignKeyName: "exam_attempts_exam_id_fkey"; columns: ["exam_id"]; isOneToOne: false; referencedRelation: "exams"; referencedColumns: ["id"] },
          { foreignKeyName: "exam_attempts_profile_id_fkey"; columns: ["profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
    }
    Functions: {
      admin_bulk_delete_users: { Args: { p_user_ids: string[] }; Returns: Json }
      admin_confirm_user_email: { Args: { p_user_id: string }; Returns: undefined }
      admin_delete_user: { Args: { p_user_id: string }; Returns: Json }
      admin_get_user_email: { Args: { p_user_id: string }; Returns: string }
      admin_reset_password: { Args: { p_new_password: string; p_user_id: string }; Returns: boolean }
      admin_update_user_email: { Args: { p_new_email: string; p_user_id: string }; Returns: Json }
      approve_payment_request: { Args: { p_request_id: string }; Returns: undefined }
      check_identifier_exists: { Args: { p_identifier: string }; Returns: boolean }
      check_promo_code: { Args: { p_code: string; p_course_id: string }; Returns: Json }
      enroll_in_free_course: { Args: { p_course_id: string }; Returns: undefined }
      focus_breaks_today: { Args: { p_user_id: string }; Returns: number }
      focus_close_stale_sessions: { Args: never; Returns: undefined }
      focus_compare_daily: { Args: { p_days: number; p_other_user: string }; Returns: { day: string; total_seconds: number; user_id: string }[] }
      focus_end_session: { Args: { p_duration_seconds: number; p_id: number }; Returns: undefined }
      focus_history_daily: { Args: { p_days?: number }; Returns: { break_seconds: number; breaks_used: number; day: string; is_ongoing: boolean; session_count: number; sleep_seconds: number; study_seconds: number }[] }
      focus_leaderboard: { Args: { p_days: number }; Returns: { full_name: string; hsc_batch: string; total_seconds: number; user_id: string }[] }
      focus_live_now: { Args: never; Returns: { avatar_url: string; duration_seconds: number; full_name: string; hsc_batch: string; is_paused: boolean; mood: string; started_at: string; user_id: string }[] }
      focus_mood_leaderboard: { Args: { p_days: number; p_mood: string }; Returns: { full_name: string; hsc_batch: string; total_seconds: number; user_id: string }[] }
      focus_start_session: { Args: { p_mood: string; p_resume_id?: number }; Returns: number }
      focus_update_session: { Args: { p_duration_seconds: number; p_id: number; p_is_paused: boolean }; Returns: undefined }
      generate_omr_credentials: { Args: never; Returns: Json }
      get_admin_profiles_paginated: { Args: { p_filter_type: string; p_page: number; p_page_size: number; p_search: string }; Returns: Json }
      get_admin_student_stats: { Args: never; Returns: Json }
      get_all_course_enrollment_counts: { Args: never; Returns: { course_id: string; enrollment_count: number }[] }
      get_app_setting: { Args: { p_key: string }; Returns: Json }
      get_course_enrollment_count: { Args: { p_course_id: string }; Returns: number }
      get_dashboard_data: { Args: never; Returns: Json }
      get_exam_questions: { Args: { p_exam_id: string }; Returns: { id: string; marks: number; option_a: string; option_b: string; option_c: string; option_d: string; question_index: number; question_text: string }[] }
      get_exam_questions_start: { Args: { p_exam_id: string; p_user_id?: string }; Returns: { id: string; option_a: string; option_b: string; option_c: string; option_d: string; question_index: number; question_text: string }[] }
      get_my_class_report: { Args: never; Returns: { category: string; class_id: string; class_start_at: string; class_title: string; course_name: string; last_watched_at: string; rank: number; total_participants: number; total_watched_seconds: number }[] }
      get_pending_payment_count: { Args: never; Returns: number }
      get_readymade_mcq_counts: { Args: { p_readymade_categories?: string[]; p_readymade_topics?: string[] }; Returns: Json }
      get_special_discounts: { Args: { p_course_id: string }; Returns: Json }
      get_student_community_links: { Args: never; Returns: { course_id: string; course_name: string; created_at: string; description: string; id: string; resource_type: string; title: string; url: string }[] }
      get_student_exam_analytics: { Args: never; Returns: Json }
      get_student_exam_analytics_v2: { Args: never; Returns: Json }
      get_student_exam_review: { Args: { p_attempt_id: string }; Returns: { correct_option: string; explanation: string; marks: number; option_a: string; option_b: string; option_c: string; option_d: string; question_id: string; question_index: number; question_text: string }[] }
      get_total_revenue: { Args: never; Returns: number }
      has_role: { Args: { _role: Database["public"]["Enums"]["app_role"]; _user_id: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      is_teacher: { Args: never; Returns: boolean }
      log_class_watch_time: { Args: { p_category: string; p_class_id: string; p_seconds: number }; Returns: undefined }
      notify_live_exams_telegram: { Args: never; Returns: undefined }
      qp_add_points: { Args: { p_points: number; p_user_id: string }; Returns: undefined }
      recalculate_exam_attempts_for_exam: { Args: { p_exam_id: string }; Returns: number }
      recalculate_exam_attempts_for_question: { Args: { p_question_id: string }; Returns: number }
      recalculate_exam_results: { Args: { p_exam_id: string }; Returns: undefined }
      record_class_view: { Args: { p_class_id: string }; Returns: undefined }
      record_community_link_click: { Args: { p_resource_id: string }; Returns: undefined }
      reject_payment_request: { Args: { p_request_id: string }; Returns: undefined }
      resolve_login_email: { Args: { p_identifier: string }; Returns: string }
      st_leaderboard: { Args: { p_mode: string }; Returns: { done_topics: number; full_name: string; hsc_batch: string; pct: number; total_topics: number; user_id: string }[] }
      st_sync_progress: { Args: { p_done: number; p_mode: string; p_pct: number; p_total: number }; Returns: undefined }
      submit_exam_attempt:
        | { Args: { p_answers: Json; p_exam_id: string; p_time_taken_seconds?: number; p_violation_count?: number }; Returns: string }
        | { Args: { p_answers: Json; p_exam_id: string; p_guest_college_name?: string; p_guest_hsc_batch?: string; p_guest_name?: string; p_guest_phone?: string; p_time_taken_seconds?: number; p_violation_count?: number }; Returns: string }
      sync_retroactive_enrollments: { Args: never; Returns: undefined }
      toggle_anti_cheat: { Args: { p_enabled: boolean }; Returns: undefined }
      verify_and_reset_password: { Args: { p_college_name?: string; p_father_name: string; p_hsc_batch: string; p_identifier: string; p_method: string; p_mother_name: string; p_new_password?: string; p_ssc_gpa?: number }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "teacher"
      app_role_new: "admin" | "teacher" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user", "teacher"],
      app_role_new: ["admin", "teacher", "moderator", "user"],
    },
  },
} as const
