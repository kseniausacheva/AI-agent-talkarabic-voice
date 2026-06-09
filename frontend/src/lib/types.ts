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
};

export type SubmitRoundResponse = {
  round: number;
  is_complete: boolean;
  questions: Question[];
  round_summary?: string;
  checklist_preview?: string;
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
