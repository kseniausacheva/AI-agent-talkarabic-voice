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
  telegram_chat_id?: string | null;
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
  lead_score: number | null;
  stage: LeadStage | null;
  next_contact_date: string | null;
  completeness: number | null;
  paid: boolean;
  price: number | null;
  product: ProductType | null;
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

export type QuestionSkipStat = {
  question_id: string;
  label: string;
  count: number;
};

export type StageCounts = {
  new: number;
  warm: number;
  hot: number;
  rejected: number;
};

export type ObjectionCounts = {
  price: number;
  time: number;
  tech: number;
  trust: number;
  other: number;
};

export type SalesStats = {
  month: string; // YYYY-MM
  closed_count: number;
  revenue: number;
  avg_check: number | null;
  pending_count: number;
  pending_revenue: number;
  by_product: { individual: number; course: number; undecided: number };
};

export type StatsResponse = {
  total_completed: number;
  completed_this_week: number;
  in_progress: number;
  by_manager: ManagerStat[];
  by_day: DayStat[];
  skips_by_question: QuestionSkipStat[];
  avg_lead_score: number | null;
  stage_counts: StageCounts;
  sales: SalesStats;
  objection_counts: ObjectionCounts;
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

/* ------------------- Аналитика лида (спринт 3, спека §3) ------------------- */

export type ObjectionType = "price" | "time" | "tech" | "trust" | "other";

export type Objection = {
  type: ObjectionType;
  note: string;
};

export type LeadTask = {
  title: string;
  due_date: string | null;
};

export type LeadStage = "new" | "warm" | "hot" | "rejected";

/** Колонка воронки (канбан): стадии лида + «оплачено». */
export type FunnelColumn = "new" | "warm" | "hot" | "rejected" | "paid";

export type LeadInsights = {
  lead_score: number | null;
  score_reason: string;
  stage: LeadStage | null;
  objections: Objection[];
  next_contact_date: string | null;
  follow_up_draft: string;
  tasks: LeadTask[];
};

/* ------------------------------ Сделка ------------------------------ */

export type ProductType = "individual" | "course" | "undecided";

export type DealInfo = {
  product: ProductType | null;
  product_note: string;
  price: number | null;
  currency: string;
  installment: boolean;
  planned_payment_date: string | null;
  paid: boolean;
  paid_date: string | null;
};

/** Частичное обновление сделки (PATCH) — только изменённые поля. */
export type DealUpdate = Partial<{
  product: ProductType | null;
  product_note: string;
  price: number | null;
  installment: boolean;
  planned_payment_date: string | null;
  paid: boolean;
  paid_date: string | null;
}>;

export type ResultsResponse = {
  session_id: string;
  checklist: ChecklistItem[];
  markdown: string;
  insights: LeadInsights | null;
  deal: DealInfo | null;
};

export type RecorderState =
  | "idle"
  | "recording"
  | "processing"
  | "preview"
  | "submitted";
