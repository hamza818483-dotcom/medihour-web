export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      official_links: {
        Row: {
          email: string | null
          facebook_group: string | null
          facebook_page: string | null
          id: number
          telegram: string | null
          updated_at: string
          whatsapp: string | null
          youtube: string | null
        }
        Insert: {
          email?: string | null
          facebook_group?: string | null
          facebook_page?: string | null
          id?: number
          telegram?: string | null
          updated_at?: string
          whatsapp?: string | null
          youtube?: string | null
        }
        Update: {
          email?: string | null
          facebook_group?: string | null
          facebook_page?: string | null
          id?: number
          telegram?: string | null
          updated_at?: string
          whatsapp?: string | null
          youtube?: string | null
        }
        Relationships: []
      }
      success_gallery: {
        Row: {
          caption: string | null
          created_at: string
          display_order: number
          id: string
          image_url: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
        }
        Relationships: []
      }
      announcements: {
        Row: {
          body: string
          course_id: string | null
          created_at: string
          created_by: string | null
          id: string
          published_at: string
          title: string
        }
        Insert: {
          body: string
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string
          title: string
        }
        Update: {
          body?: string
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      focus_sessions: {
        Row: {
          created_at: string
          duration_seconds: number
          ended_at: string | null
          id: number
          is_paused: boolean
          mood: string
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number
          ended_at?: string | null
          id?: number
          is_paused?: boolean
          mood: string
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number
          ended_at?: string | null
          id?: number
          is_paused?: boolean
          mood?: string
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "focus_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      class_notes: {
        Row: {
          chapter: string | null
          course_id: string | null
          created_at: string
          id: string
          notes_url: string | null
          title: string
          topic: string | null
          subject: string | null
          content: string | null
        }
        Insert: {
          chapter?: string | null
          course_id?: string | null
          created_at?: string
          id?: string
          notes_url?: string | null
          title: string
          topic?: string | null
          subject?: string | null
          content?: string | null
        }
        Update: {
          chapter?: string | null
          course_id?: string | null
          created_at?: string
          id?: string
          notes_url?: string | null
          title?: string
          topic?: string | null
          subject?: string | null
          content?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_notes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          class_type: string
          course_id: string
          created_at: string
          end_at: string | null
          id: string
          notes_url: string | null
          start_at: string | null
          title: string
          updated_at: string
          video_url: string | null
          button_text: string | null
          button_url: string | null
          sort_order: number | null
          subject: string[] | null
        }
        Insert: {
          class_type: string
          course_id: string
          created_at?: string
          end_at?: string | null
          id?: string
          notes_url?: string | null
          start_at?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
          button_text?: string | null
          button_url?: string | null
          sort_order?: number | null
          subject?: string[] | null
        }
        Update: {
          class_type?: string
          course_id?: string
          created_at?: string
          end_at?: string | null
          id?: string
          notes_url?: string | null
          start_at?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
          button_text?: string | null
          button_url?: string | null
          sort_order?: number | null
          subject?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          bkash_number: string | null
          contact_info: string | null
          created_at: string
          full_description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          nagad_number: string | null
          name: string
          price: number | null
          short_description: string | null
          slug: string | null
          updated_at: string
          what_you_get: string[] | null
          access_unlimited_practice: boolean | null
          priority: number | null
          routine_url: string | null
        }
        Insert: {
          bkash_number?: string | null
          contact_info?: string | null
          created_at?: string
          full_description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          nagad_number?: string | null
          name: string
          price?: number | null
          short_description?: string | null
          slug?: string | null
          updated_at?: string
          what_you_get?: string[] | null
          access_unlimited_practice?: boolean | null
          priority?: number | null
          routine_url?: string | null
        }
        Update: {
          bkash_number?: string | null
          contact_info?: string | null
          created_at?: string
          full_description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          nagad_number?: string | null
          name?: string
          price?: number | null
          short_description?: string | null
          slug?: string | null
          updated_at?: string
          what_you_get?: string[] | null
          access_unlimited_practice?: boolean | null
          priority?: number | null
          routine_url?: string | null
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          course_id: string
          created_at: string
          id: string
          profile_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          profile_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_answers: {
        Row: {
          attempt_id: string
          created_at: string
          id: string
          is_correct: boolean | null
          question_id: string
          selected_option: string | null
        }
        Insert: {
          attempt_id: string
          created_at?: string
          id?: string
          is_correct?: boolean | null
          question_id: string
          selected_option?: string | null
        }
        Update: {
          attempt_id?: string
          created_at?: string
          id?: string
          is_correct?: boolean | null
          question_id?: string
          selected_option?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_exam_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "exam_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_attempts: {
        Row: {
          attempt_type: string | null
          created_at: string
          exam_id: string
          id: string
          profile_id: string
          score: number | null
          started_at: string
          submitted_at: string | null
        }
        Insert: {
          attempt_type?: string | null
          created_at?: string
          exam_id: string
          id?: string
          profile_id: string
          score?: number | null
          started_at?: string
          submitted_at?: string | null
        }
        Update: {
          attempt_type?: string | null
          created_at?: string
          exam_id?: string
          id?: string
          profile_id?: string
          score?: number | null
          started_at?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_attempts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_attempts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_questions: {
        Row: {
          correct_option: string
          exam_id: string
          explanation: string | null
          id: string
          marks: number
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          question_index: number
          question_text: string
          question_type: string | null
          section: string | null
        }
        Insert: {
          correct_option: string
          exam_id: string
          explanation?: string | null
          id?: string
          marks?: number
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          question_index: number
          question_text: string
          question_type?: string | null
          section?: string | null
        }
        Update: {
          correct_option?: string
          exam_id?: string
          explanation?: string | null
          id?: string
          marks?: number
          option_a?: string
          option_b?: string
          option_c?: string
          option_d?: string
          question_index?: number
          question_text?: string
          question_type?: string | null
          section?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          course_id: string
          created_at: string
          duration_minutes: number
          exam_type: string
          id: string
          instructions: string | null
          is_published: boolean
          negative_mark_per_question: number
          readymade_topic: string | null
          time_window_end: string | null
          time_window_start: string | null
          title: string
          total_marks: number | null
          updated_at: string
          subject: string[] | null
          external_exam_link: string | null
          restrict_solution: boolean | null
          free_exam_category: string
        }
        Insert: {
          course_id: string
          created_at?: string
          duration_minutes: number
          exam_type: string
          id?: string
          instructions?: string | null
          is_published?: boolean
          negative_mark_per_question?: number
          readymade_topic?: string | null
          time_window_end?: string | null
          time_window_start?: string | null
          title: string
          total_marks?: number | null
          updated_at?: string
          subject?: string[] | null
          external_exam_link?: string | null
          restrict_solution?: boolean | null
          free_exam_category?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          duration_minutes?: number
          exam_type?: string
          id?: string
          instructions?: string | null
          is_published?: boolean
          negative_mark_per_question?: number
          readymade_topic?: string | null
          time_window_end?: string | null
          time_window_start?: string | null
          title?: string
          total_marks?: number | null
          updated_at?: string
          subject?: string[] | null
          external_exam_link?: string | null
          restrict_solution?: boolean | null
          free_exam_category?: string
        }
        Relationships: [
          {
            foreignKeyName: "exams_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          batch_year: number | null
          created_at: string
          extra_time_multiplier: number
          full_name: string | null
          id: string
          phone: string | null
          registration_id: string
          school: string | null
          updated_at: string
          father_name: string | null
          mother_name: string | null
          college_name: string | null
          ssc_gpa: number | null
          hsc_gpa: number | null
          hsc_batch: string | null
          is_second_timer: boolean | null
        }
        Insert: {
          batch_year?: number | null
          created_at?: string
          extra_time_multiplier?: number
          full_name?: string | null
          id: string
          phone?: string | null
          registration_id: string
          school?: string | null
          updated_at?: string
          father_name?: string | null
          mother_name?: string | null
          college_name?: string | null
          ssc_gpa?: number | null
          hsc_gpa?: number | null
          hsc_batch?: string | null
          is_second_timer?: boolean | null
        }
        Update: {
          batch_year?: number | null
          created_at?: string
          extra_time_multiplier?: number
          full_name?: string | null
          id?: string
          phone?: string | null
          registration_id?: string
          school?: string | null
          updated_at?: string
          father_name?: string | null
          mother_name?: string | null
          college_name?: string | null
          ssc_gpa?: number | null
          hsc_gpa?: number | null
          hsc_batch?: string | null
          is_second_timer?: boolean | null
        }
        Relationships: []
      }
      question_reports: {
        Row: {
          id: string
          question_id: string
          user_id: string
          report_text: string
          suggested_correct_option: string | null
          created_at: string
          status: string | null
        }
        Insert: {
          id?: string
          question_id: string
          user_id: string
          report_text: string
          suggested_correct_option?: string | null
          created_at?: string
          status?: string | null
        }
        Update: {
          id?: string
          question_id?: string
          user_id?: string
          report_text?: string
          suggested_correct_option?: string | null
          created_at?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_reports_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "exam_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_preferences: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          remind_before_minutes: number
          remind_for_live_classes: boolean
          remind_for_live_exams: boolean
          remind_for_practice_exams: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          remind_before_minutes?: number
          remind_for_live_classes?: boolean
          remind_for_live_exams?: boolean
          remind_for_practice_exams?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          remind_before_minutes?: number
          remind_for_live_classes?: boolean
          remind_for_live_exams?: boolean
          remind_for_practice_exams?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_support_cards: {
        Row: {
          id: string
          title: string
          description: string | null
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          sort_order?: number
          created_at?: string
        }
        Relationships: []
      }
      telegram_support_topics: {
        Row: {
          id: string
          card_id: string
          title: string
          url: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          card_id: string
          title: string
          url: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          card_id?: string
          title?: string
          url?: string
          sort_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_support_topics_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "telegram_support_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          course_id: string | null
          created_at: string
          description: string | null
          id: string
          resource_type: string
          title: string
          url: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          resource_type: string
          title: string
          url: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          resource_type?: string
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_note_states: {
        Row: {
          id: string
          profile_id: string
          note_id: string
          is_bookmarked: boolean | null
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          note_id: string
          is_bookmarked?: boolean | null
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          note_id?: string
          is_bookmarked?: boolean | null
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_note_states_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "class_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_note_states_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      leaderboard_exam_attempts: {
        Row: {
          attempt_number: number | null
          attempt_type: string | null
          created_at: string | null
          exam_id: string | null
          id: string | null
          profile: Json | null
          profile_id: string | null
          score: number | null
          started_at: string | null
          submitted_at: string | null
          time_taken_seconds: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_attempts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_attempts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_app_setting: { Args: { p_key: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      toggle_anti_cheat: { Args: { p_enabled: boolean }; Returns: undefined }
      enroll_in_free_course: {
        Args: { p_course_id: string }
        Returns: undefined
      }
      get_dashboard_data: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_exam_questions_start: {
        Args: {
          p_exam_id: string
        }
        Returns: {
          id: string
          question_text: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
        }[]
      }
      qp_add_points: {
        Args: { p_user_id: string; p_points: number }
        Returns: undefined
      }
      focus_leaderboard: {
        Args: { p_days: number }
        Returns: {
          user_id: string
          full_name: string | null
          hsc_batch: string | null
          total_seconds: number
        }[]
      }
      focus_mood_leaderboard: {
        Args: { p_mood: string; p_days: number }
        Returns: {
          user_id: string
          full_name: string | null
          hsc_batch: string | null
          total_seconds: number
        }[]
      }
      focus_live_now: {
        Args: Record<PropertyKey, never>
        Returns: {
          user_id: string
          full_name: string | null
          hsc_batch: string | null
          mood: string
          duration_seconds: number
          is_paused: boolean
          started_at: string
        }[]
      }
      focus_start_session: {
        Args: { p_mood: string; p_resume_id?: number | null }
        Returns: number
      }
      focus_update_session: {
        Args: { p_id: number; p_duration_seconds: number; p_is_paused: boolean }
        Returns: undefined
      }
      focus_end_session: {
        Args: { p_id: number; p_duration_seconds: number }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
