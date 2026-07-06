import type {
  ChecklistItem,
  ChecklistListItem,
  ChecklistsResponse,
  ClientAdvice,
  ContactInfo,
  DealInfo,
  DealUpdate,
  LeadInsights,
  Manager,
  Question,
  QuestionSkipStat,
  SalesReport,
  SessionStartResponse,
  StatsResponse,
  SubmitRoundResponse,
  ResultsResponse,
} from "./types";

/**
 * Школа арабского — фиксированный шаблон из 10 вопросов.
 * Раунд 1: знакомство (4), Раунд 2: опыт/формат (3), Раунд 3: условия (3).
 */

export const SCHOOL_NAME = "Школа арабского языка";

export const MOCK_QUESTIONS_R1: Question[] = [
  { id: "r1q1", round_number: 1, text: "Как клиента зовут и где он находится? Страна, город, часовой пояс." },
  { id: "r1q2", round_number: 1, text: "Откуда клиент узнал о нашей школе? Реклама, рекомендация, соцсети, поиск?" },
  { id: "r1q3", round_number: 1, text: "Для чего ему нужно изучать арабский язык? Какая основная мотивация?" },
  { id: "r1q4", round_number: 1, text: "Какой диалект клиент хочет изучать: литературный MSA, египетский, левантийский, магрибский или коранический?" },
];

export const MOCK_QUESTIONS_R2: Question[] = [
  { id: "r2q1", round_number: 2, text: "Какой клиент считает свой текущий уровень владения арабским языком?" },
  { id: "r2q2", round_number: 2, text: "Есть ли у клиента опыт прохождения онлайн-курсов? Что понравилось, что не понравилось?" },
  { id: "r2q3", round_number: 2, text: "Готов ли клиент посещать Zoom-занятия в реальном времени или предпочитает асинхронный формат?" },
];

export const MOCK_QUESTIONS_R3: Question[] = [
  { id: "r3q1", round_number: 3, text: "Сколько часов в день и в неделю клиент готов выделять на учёбу?" },
  { id: "r3q2", round_number: 3, text: "Какой бюджет на обучение клиент готов выделить — помесячно или общий?" },
  { id: "r3q3", round_number: 3, text: "Есть ли дополнительные пожелания: преподаватель мужчина или женщина, удобное время дня, что-то ещё?" },
];

export const MOCK_ROUND_SUMMARY_R1 =
  "Анна из Алматы, нашла школу через Instagram. Хочет учить египетский диалект для общения с мужем-египтянином и его семьёй.";

export const MOCK_ROUND_SUMMARY_R2 =
  "Уровень — нулевой. Год назад пробовала Duolingo, бросила из-за отсутствия живого общения. Готова к Zoom-занятиям 2–3 раза в неделю.";

export const MOCK_CHECKLIST: ChecklistItem[] = [
  { category: "Контакт и источник", item: "Имя: Анна", status: "confirmed" },
  { category: "Контакт и источник", item: "Локация: Алматы, GMT+5", status: "confirmed" },
  { category: "Контакт и источник", item: "Источник лида: реклама в Instagram", status: "confirmed" },
  { category: "Контакт и источник", item: "Email / Telegram / телефон", status: "not_discussed", notes: "Менеджеру дозапросить после звонка" },

  { category: "Мотивация и цель", item: "Цель: общение с мужем-египтянином и его семьёй", status: "confirmed" },
  { category: "Мотивация и цель", item: "Диалект: египетский (разговорный)", status: "confirmed" },
  { category: "Мотивация и цель", item: "Срок цели — собирается лететь в Каир через 4 месяца", status: "confirmed" },

  { category: "Текущий уровень", item: "Уровень: нулевой, алфавит знает частично", status: "confirmed" },
  { category: "Текущий уровень", item: "Опыт самостоятельного обучения: Duolingo, бросила через 2 недели", status: "confirmed" },
  { category: "Текущий уровень", item: "Причина бросания: не хватало живого общения", status: "confirmed" },

  { category: "Формат и расписание", item: "Готова к Zoom-занятиям в реальном времени", status: "confirmed" },
  { category: "Формат и расписание", item: "Желаемая частота: 2–3 раза в неделю по 60 минут", status: "confirmed" },
  { category: "Формат и расписание", item: "Самостоятельная работа дома: 30 минут в день", status: "confirmed" },
  { category: "Формат и расписание", item: "Удобное время: вечер с 19:00 по местному (GMT+5)", status: "confirmed" },

  { category: "Бюджет и условия", item: "Бюджет: до 20 000 ₽ в месяц", status: "needs_clarification", notes: "Уточнить, готова ли к разовой предоплате за пакет 3 месяца со скидкой" },
  { category: "Бюджет и условия", item: "Предпочтение преподавателя: женщина-носитель", status: "confirmed" },
  { category: "Бюджет и условия", item: "Готовность к пробному уроку", status: "confirmed", notes: "Договорились на четверг 20:00 по Алматы" },

  { category: "Следующие шаги для менеджера", item: "Запросить контакты в Telegram", status: "not_discussed" },
  { category: "Следующие шаги для менеджера", item: "Прислать программу обучения египетскому с нуля", status: "not_discussed" },
  { category: "Следующие шаги для менеджера", item: "Назначить пробный урок на четверг 20:00 GMT+5", status: "not_discussed" },
];

export const MOCK_MARKDOWN = `# Чеклист клиента — Школа арабского

**Дата:** 2026-06-09
**Менеджер:** demo
**Сессия:** abc123demo

---

## Контакт и источник

- [x] Имя: Анна
- [x] Локация: Алматы, GMT+5
- [x] Источник лида: реклама в Instagram
- [ ] Email / Telegram / телефон _(не обсуждалось)_
  - 📝 Менеджеру дозапросить после звонка

## Мотивация и цель

- [x] Цель: общение с мужем-египтянином и его семьёй
- [x] Диалект: египетский (разговорный)
- [x] Срок цели — собирается лететь в Каир через 4 месяца

## Текущий уровень

- [x] Уровень: нулевой, алфавит знает частично
- [x] Опыт самостоятельного обучения: Duolingo, бросила через 2 недели
- [x] Причина бросания: не хватало живого общения

## Формат и расписание

- [x] Готова к Zoom-занятиям в реальном времени
- [x] Желаемая частота: 2–3 раза в неделю по 60 минут
- [x] Самостоятельная работа дома: 30 минут в день
- [x] Удобное время: вечер с 19:00 по местному (GMT+5)

## Бюджет и условия

- [~] Бюджет: до 20 000 ₽ в месяц _(требует уточнения)_
  - 📝 Уточнить, готова ли к разовой предоплате за пакет 3 месяца со скидкой
- [x] Предпочтение преподавателя: женщина-носитель
- [x] Готовность к пробному уроку
  - 📝 Договорились на четверг 20:00 по Алматы

## Следующие шаги для менеджера

- [ ] Запросить контакты в Telegram _(не обсуждалось)_
- [ ] Прислать программу обучения египетскому с нуля _(не обсуждалось)_
- [ ] Назначить пробный урок на четверг 20:00 GMT+5 _(не обсуждалось)_

---

*Сгенерировано автоматически AI Checklist Agent для Школы арабского.*
`;

export const MOCK_TRANSCRIPTS: Record<string, string> = {
  r1q1: "Клиентку зовут Анна, она из Алматы, часовой пояс GMT плюс пять.",
  r1q2: "Узнала о школе через рекламу в Instagram — таргет на изучение арабского.",
  r1q3: "Хочет говорить с мужем-египтянином и его семьёй, готовится к поездке в Каир через четыре месяца.",
  r1q4: "Однозначно египетский диалект, литературный её не интересует.",
  r2q1: "Уровень нулевой, алфавит знает примерно наполовину, читать пока не может.",
  r2q2: "Пробовала Duolingo год назад, бросила через две недели — не хватало живого общения и обратной связи.",
  r2q3: "Готова к Zoom-занятиям, два-три раза в неделю по часу, плюс домашка.",
  r3q1: "Готова на Zoom два-три раза в неделю по часу и тридцать минут самостоятельной работы в день.",
  r3q2: "Бюджет около двадцати тысяч рублей в месяц, готова обсуждать пакеты со скидкой.",
  r3q3: "Хочет преподавателя женщину-носителя, удобное время — вечер с семи по Алматы. Готова на пробный урок в четверг.",
};

export const MOCK_DEMO_SESSION_ID = "demo-abc123";

/** Фиктивный менеджер для mock-режима — работает без логина (спека §5). */
export const MOCK_MANAGER: Manager = {
  id: 1,
  username: "demo",
  display_name: "Демо-менеджер",
  role: "admin",
};

export const MOCK_TOKEN = "mock-token-demo";

function daysAgoISO(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

/** Аналитика лида для demo-abc123 (спека §5, mock-режим). */
export const MOCK_INSIGHTS: LeadInsights = {
  lead_score: 7,
  score_reason:
    "Ясная мотивация и готовность к Zoom, но бюджет не подтверждён.",
  stage: "warm",
  objections: [
    { type: "price", note: "Сомневается, потянет ли 20 000 ₽ помесячно" },
  ],
  next_contact_date: daysAgoISO(0),
  follow_up_draft:
    "Здравствуйте, Анна! Спасибо за разговор. Отправляю программу египетского диалекта с нуля — она рассчитана на занятия в Zoom 2–3 раза в неделю по вечерам. Напомню про пробный урок в четверг в 20:00 по Алматы — подтвердите, пожалуйста, что время в силе.",
  tasks: [
    { title: "Отправить программу египетского с нуля", due_date: daysAgoISO(0) },
    { title: "Подтвердить пробный урок в четверг 20:00 GMT+5", due_date: null },
  ],
};

/** Сделка для demo-abc123 (mock-режим). Мутируется mockUpdateDeal. */
export const MOCK_DEAL: DealInfo = {
  product: "individual",
  product_note: "не хочет в группу-поток, только индивидуально",
  price: 20000,
  currency: "RUB",
  installment: true,
  planned_payment_date: daysAgoISO(-5),
  paid: false,
  paid_date: null,
  platform_status: "offered",
};

let mockDealState: DealInfo = { ...MOCK_DEAL };

export function mockUpdateDeal(changes: DealUpdate): DealInfo {
  mockDealState = { ...mockDealState, ...changes };
  if (mockDealState.paid && !mockDealState.paid_date) {
    mockDealState.paid_date = daysAgoISO(0);
  }
  if (!mockDealState.paid) {
    mockDealState.paid_date = null;
  }
  return { ...mockDealState };
}

/** Контакты клиента для demo-abc123 (mock). Мутируются mockUpdateContact. */
let mockContactState: ContactInfo = {
  phone: "+7 900 123-45-67",
  channel: "whatsapp",
  email: "anna@example.com",
  note: "Списывались в WhatsApp, отвечает вечером",
  next_contact_date: daysAgoISO(-2),
  next_contact_plan: "Прислать программу и предложить пробный урок",
};

export function mockUpdateContact(changes: {
  phone?: string;
  channel?: ContactInfo["channel"];
  email?: string;
  note?: string;
  next_contact_date?: string | null;
  next_contact_plan?: string;
}): ContactInfo {
  mockContactState = { ...mockContactState, ...changes };
  return { ...mockContactState };
}

/** Данные клиента для demo-abc123 (mock). Мутируются mockUpdateClient. */
const mockClientState = { client_name: "Анна", client_date: daysAgoISO(1) };

export function mockUpdateClient(changes: {
  client_name?: string;
  client_date?: string | null;
}): { client_name: string; client_date: string } {
  if (changes.client_name != null && changes.client_name !== "") {
    mockClientState.client_name = changes.client_name;
  }
  if (changes.client_date != null && changes.client_date !== "") {
    mockClientState.client_date = changes.client_date;
  }
  return { ...mockClientState };
}

/** База знаний школы (mock, изменяемая). */
export const mockKnowledgeState = {
  text:
    "Программы: индивидуально 20000 ₽/мес, групповой поток 12000 ₽/мес. Есть рассрочка на 3 месяца.\n" +
    "Возражение «дорого»: индивидуально = быстрый прогресс под цель; предложить рассрочку и пробный урок.\n" +
    "Возражение «нет времени»: занятия 50 мин, 2 раза в неделю вечером, записи остаются.\n" +
    "Тон общения: тёплый, на «вы», без давления. Всегда предлагаем бесплатный пробный урок.",
};

/** AI-советник: план работы с клиентом (mock). */
export const MOCK_ADVICE: ClientAdvice = {
  approach:
    "Анна замотивирована (общение с семьёй мужа) и почти готова — поддержите тёплым тоном, снимите ценовое сомнение рассрочкой и быстрым пробным уроком, не давите.",
  ask_next: [
    "Уточнить, готова ли к пакету на 3 месяца со скидкой",
    "Согласовать точное время пробного урока",
  ],
  objections: [
    {
      point: "Сомневается, потянет ли 20 000 ₽ помесячно",
      response:
        "Понимаю, Анна. Индивидуальные занятия дают быстрый результат под вашу цель к поездке в Каир. Можем оформить рассрочку на 3 месяца — выйдет комфортнее, а программа та же.",
    },
  ],
  touchpoints: [
    {
      when: "сегодня",
      channel: "WhatsApp",
      message:
        "Здравствуйте, Анна! Спасибо за разговор. Отправляю программу египетского с нуля и предлагаю бесплатный пробный урок в четверг в 20:00 по Алматы — подтвердите, удобно ли?",
    },
    {
      when: "через 2 дня",
      channel: "WhatsApp",
      message:
        "Анна, добрый день! Напомню про пробный урок в четверг. Также есть рассрочка на 3 месяца, если так удобнее по бюджету. Подскажите, остаётся ли время в силе?",
    },
  ],
};

export const MOCK_CHECKLISTS: ChecklistListItem[] = [
  {
    id: MOCK_DEMO_SESSION_ID,
    client_name: "Анна",
    client_date: daysAgoISO(1),
    status: "completed",
    created_at: `${daysAgoISO(1)}T10:12:00Z`,
    completed_at: `${daysAgoISO(1)}T10:21:00Z`,
    manager_name: "Демо-менеджер",
    lead_score: 7,
    stage: "warm",
    // Сегодня — запись попадает в блок «Сегодня связаться» (спека §5).
    next_contact_date: daysAgoISO(0),
    completeness: 80,
    paid: false,
    price: 20000,
    product: "individual",
  },
  {
    id: "demo-omar456",
    client_name: "Омар",
    client_date: daysAgoISO(3),
    status: "completed",
    created_at: `${daysAgoISO(3)}T14:40:00Z`,
    completed_at: `${daysAgoISO(3)}T14:49:00Z`,
    manager_name: "Ксения",
    lead_score: 9,
    stage: "hot",
    // Вчера — просроченная дата подсвечивается accent-цветом в таблице.
    next_contact_date: daysAgoISO(1),
    completeness: 90,
    paid: true,
    price: 45000,
    product: "course",
  },
  {
    id: "demo-fatima789",
    client_name: "Фатима",
    client_date: daysAgoISO(0),
    status: "in_progress",
    created_at: `${daysAgoISO(0)}T09:05:00Z`,
    completed_at: null,
    manager_name: "Демо-менеджер",
    lead_score: null,
    stage: null,
    next_contact_date: null,
    completeness: null,
    paid: false,
    price: null,
    product: null,
  },
];

export function mockChecklists(
  q: string,
  page: number,
  perPage = 20,
  due?: "today",
): ChecklistsResponse {
  const today = daysAgoISO(0);
  let source = MOCK_CHECKLISTS;
  if (due === "today") {
    source = MOCK_CHECKLISTS.filter(
      (c) =>
        c.status === "completed" &&
        c.next_contact_date !== null &&
        c.next_contact_date <= today &&
        c.stage !== "rejected",
    ).sort((a, b) =>
      (a.next_contact_date ?? "").localeCompare(b.next_contact_date ?? ""),
    );
  }
  const query = q.trim().toLowerCase();
  const filtered = query
    ? source.filter((c) => c.client_name.toLowerCase().includes(query))
    : source;
  const start = (page - 1) * perPage;
  return {
    items: filtered.slice(start, start + perPage),
    total: filtered.length,
    page,
    per_page: perPage,
  };
}

const MOCK_BY_DAY_COUNTS = [1, 0, 2, 3, 1, 0, 2, 1, 4, 2, 0, 3, 1, 2];

const ALL_QUESTIONS = [
  ...MOCK_QUESTIONS_R1,
  ...MOCK_QUESTIONS_R2,
  ...MOCK_QUESTIONS_R3,
];

/** Сколько раз пропускали каждый вопрос (спека §4: все 10, по убыванию). */
const MOCK_SKIP_COUNTS: Record<string, number> = {
  r3q2: 7,
  r2q2: 5,
  r3q3: 4,
  r1q2: 3,
  r1q4: 2,
  r2q1: 2,
  r2q3: 1,
  r3q1: 1,
  r1q1: 0,
  r1q3: 0,
};

const MOCK_SKIPS_BY_QUESTION: QuestionSkipStat[] = ALL_QUESTIONS.map((q) => ({
  question_id: q.id,
  label: q.text.slice(0, 60),
  count: MOCK_SKIP_COUNTS[q.id] ?? 0,
})).sort((a, b) => b.count - a.count);

export function mockStats(): StatsResponse {
  return {
    total_completed: 24,
    completed_this_week: 6,
    in_progress: 2,
    by_manager: [
      { display_name: "Демо-менеджер", week: 4, total: 15 },
      { display_name: "Ксения", week: 2, total: 9 },
    ],
    by_day: MOCK_BY_DAY_COUNTS.map((count, i) => ({
      date: daysAgoISO(13 - i),
      count,
    })),
    skips_by_question: MOCK_SKIPS_BY_QUESTION,
    avg_lead_score: 6.4,
    stage_counts: { new: 5, warm: 9, hot: 7, rejected: 3 },
    sales: {
      month: daysAgoISO(0).slice(0, 7),
      closed_count: 5,
      revenue: 187000,
      avg_check: 37400,
      pending_count: 4,
      pending_revenue: 96000,
      by_product: { individual: 3, course: 2, undecided: 0 },
    },
    objection_counts: { price: 8, time: 5, tech: 2, trust: 3, other: 1 },
  };
}

export function mockSales(month?: string): SalesReport {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ym =
    month && /^\d{4}-\d{2}$/.test(month)
      ? month
      : `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const [y, m] = ym.split("-").map(Number);
  const endY = m === 12 ? y + 1 : y;
  const endM = m === 12 ? 1 : m + 1;
  const cur = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const isCurrent = ym === cur;
  const revenue = isCurrent ? 78000 : 45000;
  const closed = isCurrent ? 3 : 2;
  const deals = isCurrent
    ? [
        { client_name: "Вероника Матвеева", price: 30000, product: "course" as const, paid_date: `${ym}-05` },
        { client_name: "Мукаев Муслим", price: 26000, product: "individual" as const, paid_date: `${ym}-04` },
        { client_name: "Руза", price: 22000, product: "platform" as const, paid_date: `${ym}-02` },
      ]
    : [
        { client_name: "Клиент А", price: 25000, product: "individual" as const, paid_date: `${ym}-12` },
        { client_name: "Клиент Б", price: 20000, product: "course" as const, paid_date: `${ym}-08` },
      ];
  const months: string[] = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }
  if (!months.includes(ym)) months.push(ym);
  return {
    month: ym,
    period_start: `${ym}-01`,
    period_end: `${endY}-${pad(endM)}-01`,
    revenue,
    closed_count: closed,
    avg_check: closed ? Math.round(revenue / closed) : null,
    pending_count: 2,
    pending_revenue: 52000,
    by_product: {
      individual: isCurrent ? 2 : 1,
      course: 1,
      platform: isCurrent ? 1 : 0,
      undecided: 0,
    },
    deals,
    available_months: [...new Set(months)].sort().reverse(),
  };
}

export function mockStart(
  clientName: string,
  clientDate: string,
): SessionStartResponse {
  return {
    session_id: MOCK_DEMO_SESSION_ID,
    round: 1,
    questions: MOCK_QUESTIONS_R1,
    client_name: clientName,
    client_date: clientDate,
  };
}

export function mockSubmit(round: number): SubmitRoundResponse {
  if (round === 1) {
    return {
      round: 2,
      is_complete: false,
      questions: MOCK_QUESTIONS_R2,
      round_summary: MOCK_ROUND_SUMMARY_R1,
    };
  }
  if (round === 2) {
    return {
      round: 3,
      is_complete: false,
      questions: MOCK_QUESTIONS_R3,
      round_summary: MOCK_ROUND_SUMMARY_R2,
    };
  }
  return {
    round: 3,
    is_complete: true,
    questions: [],
    round_summary:
      "Финальный раунд закрыт: бюджет требует уточнения, договорились о пробном уроке в четверг 20:00.",
    checklist_preview: MOCK_MARKDOWN,
  };
}

export function mockResults(): ResultsResponse {
  return {
    session_id: MOCK_DEMO_SESSION_ID,
    checklist: MOCK_CHECKLIST,
    markdown: MOCK_MARKDOWN,
    client_name: mockClientState.client_name,
    client_date: mockClientState.client_date,
    insights: MOCK_INSIGHTS,
    deal: { ...mockDealState },
    contact: { ...mockContactState },
  };
}
