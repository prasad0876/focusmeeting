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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      abuse_incidents: {
        Row: {
          action_taken: string
          category: string
          created_at: string
          excerpt: string | null
          id: string
          meeting_id: string
          message_id: string | null
          severity: Database["public"]["Enums"]["abuse_severity"]
          user_id: string
        }
        Insert: {
          action_taken: string
          category: string
          created_at?: string
          excerpt?: string | null
          id?: string
          meeting_id: string
          message_id?: string | null
          severity: Database["public"]["Enums"]["abuse_severity"]
          user_id: string
        }
        Update: {
          action_taken?: string
          category?: string
          created_at?: string
          excerpt?: string | null
          id?: string
          meeting_id?: string
          message_id?: string | null
          severity?: Database["public"]["Enums"]["abuse_severity"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "abuse_incidents_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abuse_incidents_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "meeting_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_submissions: {
        Row: {
          assessment_id: string
          content: string
          created_at: string
          feedback: string | null
          graded_at: string | null
          graded_by: string | null
          id: string
          score: number | null
          student_id: string
          submitted_at: string
          updated_at: string
        }
        Insert: {
          assessment_id: string
          content: string
          created_at?: string
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          score?: number | null
          student_id: string
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          content?: string
          created_at?: string
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          score?: number | null
          student_id?: string
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_submissions_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          due_at: string | null
          id: string
          max_score: number
          section_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          due_at?: string | null
          id?: string
          max_score?: number
          section_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          due_at?: string | null
          id?: string
          max_score?: number
          section_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          created_at: string
          date: string
          id: string
          marked_by: string | null
          notes: string | null
          section_id: string
          slot: number
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          marked_by?: string | null
          notes?: string | null
          section_id: string
          slot?: number
          status: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          marked_by?: string | null
          notes?: string | null
          section_id?: string
          slot?: number
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string
          created_at: string
          hod_id: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          hod_id?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          hod_id?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      faculty_sections: {
        Row: {
          assigned_at: string
          faculty_id: string
          id: string
          section_id: string
        }
        Insert: {
          assigned_at?: string
          faculty_id: string
          id?: string
          section_id: string
        }
        Update: {
          assigned_at?: string
          faculty_id?: string
          id?: string
          section_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "faculty_sections_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      focus_samples: {
        Row: {
          created_at: string
          focus_score: number
          id: string
          meeting_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          focus_score: number
          id?: string
          meeting_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          focus_score?: number
          id?: string
          meeting_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "focus_samples_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      gradebook_entries: {
        Row: {
          created_at: string
          entered_by: string | null
          exam_type: string
          id: string
          marks: number
          max_marks: number
          notes: string | null
          section_id: string
          student_id: string
          subject: string
          term: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          entered_by?: string | null
          exam_type: string
          id?: string
          marks: number
          max_marks?: number
          notes?: string | null
          section_id: string
          student_id: string
          subject: string
          term?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          entered_by?: string | null
          exam_type?: string
          id?: string
          marks?: number
          max_marks?: number
          notes?: string | null
          section_id?: string
          student_id?: string
          subject?: string
          term?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gradebook_entries_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_action_items: {
        Row: {
          assignee_name: string
          assignee_user_id: string | null
          created_at: string
          deadline: string | null
          id: string
          meeting_id: string
          source_timestamp_ms: number | null
          status: string
          task: string
          updated_at: string
        }
        Insert: {
          assignee_name: string
          assignee_user_id?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          meeting_id: string
          source_timestamp_ms?: number | null
          status?: string
          task: string
          updated_at?: string
        }
        Update: {
          assignee_name?: string
          assignee_user_id?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          meeting_id?: string
          source_timestamp_ms?: number | null
          status?: string
          task?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_action_items_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_invitations: {
        Row: {
          created_at: string
          id: string
          invitee_id: string
          inviter_id: string
          meeting_id: string
          responded_at: string | null
          status: Database["public"]["Enums"]["invitation_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          invitee_id: string
          inviter_id: string
          meeting_id: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
        }
        Update: {
          created_at?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          meeting_id?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["invitation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "meeting_invitations_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          is_flagged: boolean
          meeting_id: string
          severity: Database["public"]["Enums"]["abuse_severity"] | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_flagged?: boolean
          meeting_id: string
          severity?: Database["public"]["Enums"]["abuse_severity"] | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_flagged?: boolean
          meeting_id?: string
          severity?: Database["public"]["Enums"]["abuse_severity"] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_messages_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_participants: {
        Row: {
          focus_score: number
          id: string
          is_muted: boolean
          is_removed: boolean
          joined_at: string
          left_at: string | null
          meeting_id: string
          user_id: string
        }
        Insert: {
          focus_score?: number
          id?: string
          is_muted?: boolean
          is_removed?: boolean
          joined_at?: string
          left_at?: string | null
          meeting_id: string
          user_id: string
        }
        Update: {
          focus_score?: number
          id?: string
          is_muted?: boolean
          is_removed?: boolean
          joined_at?: string
          left_at?: string | null
          meeting_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_participants_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_summaries: {
        Row: {
          chapters: Json
          created_at: string
          decisions: Json
          duration_seconds: number | null
          generated_at: string
          id: string
          meeting_id: string
          summary: string
          title: string | null
          topics: Json
          updated_at: string
        }
        Insert: {
          chapters?: Json
          created_at?: string
          decisions?: Json
          duration_seconds?: number | null
          generated_at?: string
          id?: string
          meeting_id: string
          summary: string
          title?: string | null
          topics?: Json
          updated_at?: string
        }
        Update: {
          chapters?: Json
          created_at?: string
          decisions?: Json
          duration_seconds?: number | null
          generated_at?: string
          id?: string
          meeting_id?: string
          summary?: string
          title?: string | null
          topics?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_summaries_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_transcripts: {
        Row: {
          content: string
          created_at: string
          ended_at_ms: number
          id: string
          language: string | null
          meeting_id: string
          speaker_name: string | null
          started_at_ms: number
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          ended_at_ms?: number
          id?: string
          language?: string | null
          meeting_id: string
          speaker_name?: string | null
          started_at_ms?: number
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          ended_at_ms?: number
          id?: string
          language?: string | null
          meeting_id?: string
          speaker_name?: string | null
          started_at_ms?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_transcripts_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          created_at: string
          department_id: string | null
          description: string | null
          ended_at: string | null
          host_id: string
          id: string
          is_locked: boolean
          scheduled_at: string | null
          scope: Database["public"]["Enums"]["meeting_scope"]
          section_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["meeting_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          description?: string | null
          ended_at?: string | null
          host_id: string
          id?: string
          is_locked?: boolean
          scheduled_at?: string | null
          scope?: Database["public"]["Enums"]["meeting_scope"]
          section_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["meeting_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          description?: string | null
          ended_at?: string | null
          host_id?: string
          id?: string
          is_locked?: boolean
          scheduled_at?: string | null
          scope?: Database["public"]["Enums"]["meeting_scope"]
          section_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["meeting_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          department_id: string | null
          display_name: string
          handle: string
          id: string
          is_blacklisted: boolean
          reputation: number
          status: Database["public"]["Enums"]["account_status"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          display_name: string
          handle: string
          id: string
          is_blacklisted?: boolean
          reputation?: number
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          display_name?: string
          handle?: string
          id?: string
          is_blacklisted?: boolean
          reputation?: number
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          created_at: string
          department_id: string
          id: string
          is_locked: boolean
          name: string
          slot_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          is_locked?: boolean
          name: string
          slot_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          is_locked?: boolean
          name?: string
          slot_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      student_sections: {
        Row: {
          enrolled_at: string
          id: string
          section_id: string
          student_id: string
        }
        Insert: {
          enrolled_at?: string
          id?: string
          section_id: string
          student_id: string
        }
        Update: {
          enrolled_at?: string
          id?: string
          section_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_sections_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whiteboard_elements: {
        Row: {
          color: string
          created_at: string
          data: Json
          id: string
          kind: string
          meeting_id: string
          updated_at: string
          user_id: string
          z_index: number
        }
        Insert: {
          color?: string
          created_at?: string
          data?: Json
          id?: string
          kind: string
          meeting_id: string
          updated_at?: string
          user_id: string
          z_index?: number
        }
        Update: {
          color?: string
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          meeting_id?: string
          updated_at?: string
          user_id?: string
          z_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "whiteboard_elements_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_meeting: {
        Args: { _meeting: string; _user: string }
        Returns: boolean
      }
      faculty_of_section: {
        Args: { _section: string; _user: string }
        Returns: boolean
      }
      generate_unique_handle: { Args: { _base: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      in_department: {
        Args: { _dept: string; _user: string }
        Returns: boolean
      }
      is_admin: { Args: { _user: string }; Returns: boolean }
      is_admin_or_deo: { Args: { _user: string }; Returns: boolean }
      is_deo: { Args: { _user: string }; Returns: boolean }
      is_hod_of: { Args: { _dept: string; _user: string }; Returns: boolean }
      is_meeting_host: {
        Args: { _meeting: string; _user: string }
        Returns: boolean
      }
      primary_role: {
        Args: { _user: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      student_of_section: {
        Args: { _section: string; _user: string }
        Returns: boolean
      }
    }
    Enums: {
      abuse_severity: "low" | "moderate" | "high" | "severe"
      account_status: "active" | "suspended" | "pending" | "rejected"
      app_role: "admin" | "hod" | "faculty" | "student" | "deo"
      invitation_status: "pending" | "accepted" | "declined" | "cancelled"
      meeting_scope: "university" | "department" | "section" | "adhoc"
      meeting_status: "scheduled" | "live" | "ended"
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
      abuse_severity: ["low", "moderate", "high", "severe"],
      account_status: ["active", "suspended", "pending", "rejected"],
      app_role: ["admin", "hod", "faculty", "student", "deo"],
      invitation_status: ["pending", "accepted", "declined", "cancelled"],
      meeting_scope: ["university", "department", "section", "adhoc"],
      meeting_status: ["scheduled", "live", "ended"],
    },
  },
} as const
