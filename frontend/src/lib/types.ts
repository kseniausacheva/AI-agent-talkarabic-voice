export type Question = {
  id: string;
  text: string;
  round_number: 1 | 2 | 3;
};

export type Answer = {
  question_id: string;
  question_text: string;
  audio_transcript: string;
  round_number: 1 | 2 | 3;
};

/** Ответ, который frontend шлёт в /api/session/{id}/submit (спека §3). */
export type AnswerPayload = {
  question_id: string;
  transcript: string;
  skipped: boolean;
};

export type ManagerRole = "manager" | "admin";

export type Manager = {
  id: number;
  username: string;
  display_name: string;
  role: ManagerRole;
};

export type AuthResponse = {
  token: string;
  manager: Manager;
};

export type ChecklistListStatus = "in_progress" | "completed";

export type ChecklistListItem = {
  id: string;
  client_name: string;
  client_date: string;
  status: ChecklistListStatus;
  created_at: string;
  completed_at: string | null;
  manager_name: string;
};

export type ChecklistsResponse = {
  items: ChecklistListItem[];
  total: number;
  page: number;
  per_page: number;
};

export type ManagerStat = {
  display_name: string;
  week: number;
  total: number;
};

export type DayStat = {
  date: string;
  count: number;
};

export type StatsResponse = {
  total_completed: number;
  completed_this_week: number;
  in_progress: number;
  by_manager: ManagerStat[];
  by_day: DayStat[];
};

export type ChecklistStatus = "confirmed" | "needs_clarification" | "not_discussed";

export type ChecklistItem = {
  category: string;
  item: string;
  status: ChecklistStatus;
  notes?: string | null;
};

export type SessionStartResponse = {
  session_id: string;
  round: number;
  questions: Question[];
  client_name: string;
  client_date: string;
};

export type SubmitRoundResponse = {
  round: number;
  is_complete: boolean;
  questions: Question[];
  round_summary?: string;
  checklist_preview?: string;
  client_name?: string;
};

export type ResultsResponse = {
  session_id: string;
  checklist: ChecklistItem[];
  markdown: string;
};

export type RecorderState =
  | "idle"
  | "recording"
  | "processing"
  | "preview"
  | "submitted";
