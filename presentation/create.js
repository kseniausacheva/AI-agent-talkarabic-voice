/* Презентация-инструкция: голосовой чеклист клиента для школы арабского.
 * Цвета школы: белый фон, голубой primary, красный accent.
 * 16:9, шрифты: Trebuchet MS (заголовки) + Calibri (текст).
 * v2 — после визуального QA: valign:top везде, ровные сетки 0.3" gap,
 * единые футеры, синие стрелки, без зелёных вкраплений.
 */
const pptxgen = require("pptxgenjs");

const C = {
  blue: "2563EB",
  blueDark: "1E3A8A",
  blueDeep: "172554",
  blueLight: "EFF6FF",
  blueMid: "BFDBFE",
  red: "DC2626",
  redLight: "FEE2E2",
  ink: "1E293B",
  muted: "64748B",
  subtle: "94A3B8",
  white: "FFFFFF",
  line: "E2E8F0",
};

const HEAD = "Trebuchet MS";
const BODY = "Calibri";

const pptx = new pptxgen();
pptx.defineLayout({ name: "WIDE", width: 10, height: 5.625 });
pptx.layout = "WIDE";

// ---------- helpers ----------

function darkSlide(slide) {
  slide.background = { color: C.blueDeep };
  slide.addShape("ellipse", { x: 8.4, y: -1.2, w: 3.4, h: 3.4, fill: { color: C.blue, transparency: 82 }, line: { type: "none" } });
  slide.addShape("ellipse", { x: -1.4, y: 4.0, w: 3.2, h: 3.2, fill: { color: C.blue, transparency: 88 }, line: { type: "none" } });
}

function contentTitle(slide, num, title) {
  slide.addShape("ellipse", { x: 0.5, y: 0.42, w: 0.52, h: 0.52, fill: { color: C.blue }, line: { type: "none" } });
  slide.addText(num, {
    x: 0.5, y: 0.42, w: 0.52, h: 0.52, align: "center", valign: "middle",
    fontFace: HEAD, fontSize: 18, bold: true, color: C.white, margin: 0,
  });
  slide.addText(title, {
    x: 1.18, y: 0.34, w: 8.3, h: 0.68, align: "left", valign: "middle",
    fontFace: HEAD, fontSize: 26, bold: true, color: C.ink, margin: 0,
  });
}

function footer(slide) {
  slide.addText("Школа арабского · Голосовой чеклист клиента", {
    x: 0.5, y: 5.26, w: 6.5, h: 0.3, fontFace: BODY, fontSize: 9.5, color: C.muted, margin: 0, valign: "middle",
  });
}

function card(slide, x, y, w, h, fillColor, lineColor) {
  slide.addShape("roundRect", {
    x, y, w, h, rectRadius: 0.08,
    fill: { color: fillColor || C.blueLight },
    line: lineColor ? { color: lineColor, width: 1 } : { type: "none" },
  });
}

// ============================================================
// СЛАЙД 1 — Титул
// ============================================================
{
  const s = pptx.addSlide();
  darkSlide(s);
  s.addText("ИНСТРУКЦИЯ ПО СОЗДАНИЮ", {
    x: 0.7, y: 1.05, w: 8.6, h: 0.4, fontFace: BODY, fontSize: 14, color: "93C5FD",
    charSpacing: 4, margin: 0,
  });
  s.addText("Голосовой чеклист клиента", {
    x: 0.7, y: 1.5, w: 8.6, h: 1.0, fontFace: HEAD, fontSize: 44, bold: true, color: C.white, margin: 0,
  });
  s.addText("AI-помощник для менеджеров школы арабского языка:\nот пустой папки до боевого сервера на DigitalOcean + Coolify", {
    x: 0.7, y: 2.6, w: 8.0, h: 0.9, fontFace: BODY, fontSize: 17, color: "CBD5E1", margin: 0, valign: "top",
  });
  const tags = ["Whisper · распознавание речи", "MiniMax M3 · анализ ответов", "DigitalOcean + Coolify · хостинг"];
  tags.forEach((t, i) => {
    s.addShape("roundRect", { x: 0.7 + i * 2.95, y: 3.95, w: 2.75, h: 0.55, rectRadius: 0.27, fill: { color: C.blue, transparency: 55 }, line: { color: "3B82F6", width: 1 } });
    s.addText(t, { x: 0.7 + i * 2.95, y: 3.95, w: 2.75, h: 0.55, align: "center", valign: "middle", fontFace: BODY, fontSize: 11.5, color: C.white, margin: 0 });
  });
  s.addText("v0.1 · 2026", { x: 7.9, y: 5.1, w: 1.4, h: 0.3, align: "right", fontFace: BODY, fontSize: 10, color: "93C5FD", margin: 0 });
}

// ============================================================
// СЛАЙД 2 — Что это и зачем
// ============================================================
{
  const s = pptx.addSlide();
  contentTitle(s, "01", "Что это и какую проблему решает");

  card(s, 0.5, 1.25, 4.55, 1.7, "FFF1F2", "FECACA");
  s.addText("ПРОБЛЕМА", { x: 0.78, y: 1.43, w: 4.0, h: 0.3, fontFace: HEAD, fontSize: 12, bold: true, color: C.red, margin: 0, valign: "top" });
  s.addText("Менеджер общается с клиентами в Telegram, WhatsApp и по телефону. После каждого разговора нужно заполнить карточку клиента в CRM — печатать долго, лень, детали забываются.", {
    x: 0.78, y: 1.76, w: 4.0, h: 1.1, fontFace: BODY, fontSize: 12.5, color: C.ink, margin: 0, valign: "top",
  });

  card(s, 0.5, 3.25, 4.55, 1.7, C.blueLight, C.blueMid);
  s.addText("РЕШЕНИЕ", { x: 0.78, y: 3.43, w: 4.0, h: 0.3, fontFace: HEAD, fontSize: 12, bold: true, color: C.blue, margin: 0, valign: "top" });
  s.addText("После разговора менеджер наговаривает голосом ответы на 10 вопросов о клиенте. AI транскрибирует речь, раскладывает по категориям и отдаёт готовый чеклист для CRM.", {
    x: 0.78, y: 3.76, w: 4.0, h: 1.1, fontFace: BODY, fontSize: 12.5, color: C.ink, margin: 0, valign: "top",
  });

  const stats = [
    { n: "7 мин", t: "на одного клиента вместо 20 минут печатания" },
    { n: "10", t: "фиксированных вопросов — данные сопоставимы от клиента к клиенту" },
    { n: "1 ₽", t: "стоимость AI-обработки одного чеклиста" },
  ];
  stats.forEach((st, i) => {
    const y = 1.25 + i * 1.35;
    card(s, 5.35, y, 4.15, 1.05, C.white, C.line);
    s.addText(st.n, { x: 5.6, y: y, w: 1.6, h: 1.05, fontFace: HEAD, fontSize: 28, bold: true, color: C.blue, valign: "middle", align: "left", margin: 0 });
    s.addText(st.t, { x: 7.25, y: y, w: 2.15, h: 1.05, fontFace: BODY, fontSize: 11, color: C.muted, valign: "middle", margin: 0 });
  });

  footer(s);
}

// ============================================================
// СЛАЙД 3 — Как пользуется менеджер
// ============================================================
{
  const s = pptx.addSlide();
  contentTitle(s, "02", "Как этим пользуется менеджер");

  const steps = [
    { n: "1", title: "Открывает сайт", text: "Сразу после разговора с клиентом. Никакой регистрации — открыл ссылку и работаешь." },
    { n: "2", title: "Говорит ответы", text: "10 вопросов в 3 раунда. Жмёт кнопку записи, говорит своими словами, жмёт стоп." },
    { n: "3", title: "Проверяет текст", text: "Whisper показывает черновик транскрипции. Имена и термины можно поправить руками." },
    { n: "4", title: "Скачивает файл", text: "Готовый чеклист .md по 6 категориям со статусами. Кидает в CRM или чат команды." },
  ];
  steps.forEach((st, i) => {
    const x = 0.5 + i * 2.37;
    card(s, x, 1.45, 2.1, 2.85, C.blueLight, C.blueMid);
    s.addShape("ellipse", { x: x + 0.75, y: 1.73, w: 0.6, h: 0.6, fill: { color: i === 3 ? C.red : C.blue }, line: { type: "none" } });
    s.addText(st.n, { x: x + 0.75, y: 1.73, w: 0.6, h: 0.6, align: "center", valign: "middle", fontFace: HEAD, fontSize: 20, bold: true, color: C.white, margin: 0 });
    s.addText(st.title, { x: x + 0.08, y: 2.48, w: 1.94, h: 0.35, align: "center", fontFace: HEAD, fontSize: 13.5, bold: true, color: C.ink, margin: 0, valign: "top" });
    s.addText(st.text, { x: x + 0.14, y: 2.9, w: 1.82, h: 1.3, align: "center", fontFace: BODY, fontSize: 10.5, color: C.muted, margin: 0, valign: "top" });
    if (i < 3) {
      s.addText("→", { x: x + 2.08, y: 2.6, w: 0.31, h: 0.5, fontFace: HEAD, fontSize: 18, bold: true, color: C.blue, align: "center", valign: "middle", margin: 0 });
    }
  });

  card(s, 0.5, 4.55, 9.0, 0.55, C.blueLight, null);
  s.addText([
    { text: "Важно: ", options: { bold: true, color: C.blue } },
    { text: "это конспект ПОСЛЕ разговора. Менеджер не записывает клиента и не читает вопросы вслух — он пересказывает итоги своими словами.", options: { color: C.ink } },
  ], { x: 0.75, y: 4.55, w: 8.6, h: 0.55, fontFace: BODY, fontSize: 11.5, valign: "middle", margin: 0 });

  footer(s);
}

// ============================================================
// СЛАЙД 4 — 10 вопросов
// ============================================================
{
  const s = pptx.addSlide();
  contentTitle(s, "03", "Шаблон: 10 вопросов в 3 раунда");

  const rounds = [
    {
      title: "Раунд 1 · Знакомство", n: "4 вопроса", color: C.blue,
      items: ["Имя и где находится (страна, часовой пояс)", "Откуда узнал о школе — источник лида", "Зачем учит арабский — мотивация", "Какой диалект: MSA, египетский, левантийский…"],
    },
    {
      title: "Раунд 2 · Опыт и формат", n: "3 вопроса", color: C.blue,
      items: ["Текущий уровень владения арабским", "Опыт онлайн-курсов: что нравилось, что нет", "Готовность к Zoom или асинхронный формат"],
    },
    {
      title: "Раунд 3 · Условия", n: "3 вопроса", color: C.red,
      items: ["Сколько часов в день и в неделю готов уделять", "Бюджет на обучение", "Пожелания: пол преподавателя, удобное время"],
    },
  ];
  rounds.forEach((r, i) => {
    const x = 0.5 + i * 3.2;
    card(s, x, 1.3, 2.9, 3.35, C.white, C.line);
    s.addShape("roundRect", { x: x + 0.2, y: 1.5, w: 2.5, h: 0.5, rectRadius: 0.1, fill: { color: r.color }, line: { type: "none" } });
    s.addText(r.title, { x: x + 0.2, y: 1.5, w: 2.5, h: 0.5, align: "center", valign: "middle", fontFace: HEAD, fontSize: 12.5, bold: true, color: C.white, margin: 0 });
    s.addText(r.n, { x: x + 0.2, y: 2.08, w: 2.5, h: 0.28, align: "center", fontFace: BODY, fontSize: 10, color: C.subtle, margin: 0, valign: "top" });
    s.addText(r.items.map((it) => ({ text: it, options: { bullet: { code: "2022", indent: 10 }, paraSpaceAfter: 8 } })), {
      x: x + 0.25, y: 2.45, w: 2.42, h: 2.1, fontFace: BODY, fontSize: 11, color: C.ink, margin: 0, valign: "top",
    });
  });

  s.addText([
    { text: "Почему вопросы фиксированные? ", options: { bold: true, color: C.blue } },
    { text: "Для продаж важна повторяемость данных. AI не выдумывает вопросы — он только анализирует ответы и собирает итоговый чеклист.", options: { color: C.muted } },
  ], { x: 0.5, y: 4.8, w: 9.0, h: 0.4, fontFace: BODY, fontSize: 11.5, margin: 0, valign: "top" });

  footer(s);
}

// ============================================================
// СЛАЙД 5 — Архитектура
// ============================================================
{
  const s = pptx.addSlide();
  contentTitle(s, "04", "Архитектура: четыре звена");

  const boxes = [
    { t: "Менеджер", sub: "браузер + микрофон", x: 0.5, fill: C.white, line: C.subtle, dash: "dash" },
    { t: "Frontend", sub: "Next.js 16\nстраницы и запись звука", x: 2.95, fill: C.blueLight, line: C.blueMid },
    { t: "Backend", sub: "FastAPI + LangGraph\nWhisper транскрибирует", x: 5.4, fill: C.blueLight, line: C.blueMid },
    { t: "OpenRouter", sub: "MiniMax M3\nанализ и чеклист", x: 7.85, fill: C.redLight, line: "FCA5A5" },
  ];
  boxes.forEach((b, i) => {
    s.addShape("roundRect", { x: b.x, y: 1.55, w: 1.95, h: 1.5, rectRadius: 0.1, fill: { color: b.fill }, line: { color: b.line, width: 1.25, dashType: b.dash || "solid" } });
    s.addText(b.t, { x: b.x, y: 1.67, w: 1.95, h: 0.4, align: "center", fontFace: HEAD, fontSize: 14, bold: true, color: C.ink, margin: 0, valign: "top" });
    s.addText(b.sub, { x: b.x + 0.06, y: 2.07, w: 1.83, h: 0.9, align: "center", fontFace: BODY, fontSize: 9.5, color: C.muted, margin: 0, valign: "top" });
    if (i < 3) s.addText("→", { x: b.x + 1.95, y: 2.0, w: 0.5, h: 0.6, align: "center", valign: "middle", fontFace: HEAD, fontSize: 22, bold: true, color: C.blue, margin: 0 });
  });

  // подписи потоков — по центрам стрелок
  s.addText("голос (webm)", { x: 1.85, y: 3.12, w: 1.7, h: 0.28, align: "center", fontFace: BODY, fontSize: 9.5, color: C.muted, margin: 0, valign: "top" });
  s.addText("текст ответов", { x: 4.3, y: 3.12, w: 1.7, h: 0.28, align: "center", fontFace: BODY, fontSize: 9.5, color: C.muted, margin: 0, valign: "top" });
  s.addText("3 вызова за сессию", { x: 6.75, y: 3.12, w: 1.7, h: 0.28, align: "center", fontFace: BODY, fontSize: 9.5, color: C.muted, margin: 0, valign: "top" });

  const notes = [
    { h: "Whisper работает локально", t: "Распознавание речи на нашем сервере. Аудио не уходит третьим лицам — важно для данных клиентов." },
    { h: "LLM — только анализ", t: "MiniMax M3 вызывается 3 раза за сессию: 2 резюме раундов + 1 финальный чеклист. Отсюда цена ≈1 ₽." },
    { h: "Один docker-compose", t: "Frontend и backend упакованы в контейнеры. Один файл описывает всю систему — Coolify читает его напрямую." },
  ];
  notes.forEach((n, i) => {
    const x = 0.5 + i * 3.2;
    card(s, x, 3.55, 2.9, 1.5, C.white, C.line);
    s.addText(n.h, { x: x + 0.18, y: 3.69, w: 2.55, h: 0.32, fontFace: HEAD, fontSize: 11.5, bold: true, color: C.blue, margin: 0, valign: "top" });
    s.addText(n.t, { x: x + 0.18, y: 4.03, w: 2.55, h: 0.95, fontFace: BODY, fontSize: 10, color: C.muted, margin: 0, valign: "top" });
  });

  footer(s);
}

// ============================================================
// СЛАЙД 6 — Стек
// ============================================================
{
  const s = pptx.addSlide();
  contentTitle(s, "05", "Технологический стек");

  const rows = [
    ["Frontend", "Next.js 16, React 19, TypeScript, Tailwind 4 — страницы, запись звука, прогресс раундов"],
    ["Backend", "Python 3.11, FastAPI, LangGraph — API, логика раундов, сборка чеклиста"],
    ["Распознавание речи", "Whisper (модель small/medium) локально + ffmpeg для конвертации звука из браузера"],
    ["Языковая модель", "MiniMax M3 через OpenRouter — резюме раундов и финальный чеклист в JSON"],
    ["Упаковка", "Docker: два образа (frontend, backend) + docker-compose как общее описание"],
    ["Хостинг", "DigitalOcean droplet + Coolify (панель, SSL, авто-деплой) · frontend на Vercel CDN"],
  ];
  rows.forEach((r, i) => {
    const y = 1.3 + i * 0.63;
    if (i % 2 === 0) {
      s.addShape("rect", { x: 0.5, y: y, w: 9.3, h: 0.63, fill: { color: "F8FAFC" }, line: { type: "none" } });
    }
    s.addText(r[0], { x: 0.7, y, w: 2.3, h: 0.63, fontFace: HEAD, fontSize: 12.5, bold: true, color: C.blue, valign: "middle", margin: 0 });
    s.addText(r[1], { x: 3.1, y, w: 6.6, h: 0.63, fontFace: BODY, fontSize: 11.5, color: C.ink, valign: "middle", margin: 0 });
  });

  footer(s);
}

// ============================================================
// СЛАЙД 7 — ШАГ 1: Backend
// ============================================================
{
  const s = pptx.addSlide();
  contentTitle(s, "06", "Шаг 1. Собираем backend");

  s.addText("Python-сервер, который принимает звук, превращает его в текст и собирает чеклист.", {
    x: 0.5, y: 1.08, w: 9.0, h: 0.32, fontFace: BODY, fontSize: 13, color: C.muted, margin: 0, valign: "top",
  });

  const items = [
    { h: "FastAPI — шесть точек входа", t: "Старт сессии, транскрипция, сабмит раунда, результаты, скачивание .md, health-проверка." },
    { h: "Whisper + ffmpeg", t: "Браузер пишет звук в формате webm. ffmpeg конвертирует его в wav 16 кГц — только такой формат Whisper умеет читать." },
    { h: "LangGraph — логика раундов", t: "После раунда: резюме ответов → если раунды остались, отдать следующие вопросы; если нет — собрать финальный чеклист." },
    { h: "Вопросы — в коде, не в AI", t: "10 вопросов лежат в файле questions_template.py. Поменять формулировку = поправить одну строку." },
  ];
  items.forEach((it, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.5 + col * 4.75, y = 1.55 + row * 1.6;
    card(s, x, y, 4.55, 1.45, C.blueLight, C.blueMid);
    s.addText(it.h, { x: x + 0.22, y: y + 0.14, w: 4.1, h: 0.32, fontFace: HEAD, fontSize: 13, bold: true, color: C.ink, margin: 0, valign: "top" });
    s.addText(it.t, { x: x + 0.22, y: y + 0.5, w: 4.1, h: 0.85, fontFace: BODY, fontSize: 10.5, color: C.muted, margin: 0, valign: "top" });
  });

  s.addText([
    { text: "Секреты: ", options: { bold: true, color: C.red } },
    { text: "ключ OPENROUTER_API_KEY живёт только в .env-файле, который никогда не попадает в git.", options: { color: C.muted } },
  ], { x: 0.5, y: 4.85, w: 9.0, h: 0.32, fontFace: BODY, fontSize: 11.5, margin: 0, valign: "top" });

  footer(s);
}

// ============================================================
// СЛАЙД 8 — ШАГ 2: Frontend
// ============================================================
{
  const s = pptx.addSlide();
  contentTitle(s, "07", "Шаг 2. Собираем frontend");

  s.addText("Три страницы на Next.js: главная, сессия с записью голоса, итоговый чеклист.", {
    x: 0.5, y: 1.08, w: 9.0, h: 0.32, fontFace: BODY, fontSize: 13, color: C.muted, margin: 0, valign: "top",
  });

  s.addText("Сердце интерфейса — кнопка записи с пятью состояниями:", {
    x: 0.5, y: 1.52, w: 9.0, h: 0.32, fontFace: HEAD, fontSize: 13.5, bold: true, color: C.ink, margin: 0, valign: "top",
  });
  const states = [
    { n: "1 · ожидание", t: "голубая кнопка с микрофоном", c: C.blue },
    { n: "2 · запись", t: "красная кнопка, пульс, таймер", c: C.red },
    { n: "3 · обработка", t: "спиннер «Транскрибируем…»", c: C.muted },
    { n: "4 · проверка", t: "текст можно править руками", c: C.blueDark },
    { n: "5 · готово", t: "галочка, ответ принят", c: C.blue },
  ];
  states.forEach((st, i) => {
    const x = 0.5 + i * 1.9;
    card(s, x, 1.98, 1.6, 1.5, C.white, C.line);
    s.addShape("ellipse", { x: x + 0.55, y: 2.14, w: 0.5, h: 0.5, fill: { color: st.c }, line: { type: "none" } });
    s.addText(st.n, { x: x + 0.06, y: 2.74, w: 1.48, h: 0.3, align: "center", fontFace: HEAD, fontSize: 10.5, bold: true, color: C.ink, margin: 0, valign: "top" });
    s.addText(st.t, { x: x + 0.12, y: 3.04, w: 1.36, h: 0.42, align: "center", fontFace: BODY, fontSize: 9, color: C.muted, margin: 0, valign: "top" });
  });

  const notes = [
    { h: "Черновик можно править", t: "Whisper иногда ошибается в именах и арабских терминах. Менеджер видит текст до отправки и правит руками — дешевле, чем разбирать кривой чеклист потом." },
    { h: "Mock-режим для разработки", t: "Переменная NEXT_PUBLIC_USE_MOCK=true включает предзаписанные ответы — интерфейс можно смотреть и улучшать без бэкенда и микрофона." },
  ];
  notes.forEach((n, i) => {
    const x = 0.5 + i * 4.75;
    card(s, x, 3.75, 4.55, 1.35, C.blueLight, C.blueMid);
    s.addText(n.h, { x: x + 0.22, y: 3.88, w: 4.1, h: 0.3, fontFace: HEAD, fontSize: 12.5, bold: true, color: C.ink, margin: 0, valign: "top" });
    s.addText(n.t, { x: x + 0.22, y: 4.2, w: 4.1, h: 0.82, fontFace: BODY, fontSize: 10, color: C.muted, margin: 0, valign: "top" });
  });

  footer(s);
}

// ============================================================
// СЛАЙД 9 — ШАГ 3: Локальная проверка
// ============================================================
{
  const s = pptx.addSlide();
  contentTitle(s, "08", "Шаг 3. Проверяем локально");

  s.addText("Прежде чем платить за сервер — убеждаемся, что всё работает на своём компьютере.", {
    x: 0.5, y: 1.08, w: 9.0, h: 0.32, fontFace: BODY, fontSize: 13, color: C.muted, margin: 0, valign: "top",
  });

  const checks = [
    { n: "1", h: "Smoke-тест языковой модели", t: "Маленький скрипт шлёт один запрос в OpenRouter и проверяет, что MiniMax M3 отвечает корректным JSON. Стоимость теста — доли копейки.", accent: false },
    { n: "2", h: "Интерфейс в mock-режиме", t: "Запускаем frontend с предзаписанными данными. Кликаем весь путь: главная → 3 раунда → чеклист. Правим дизайн, пока не понравится.", accent: false },
    { n: "3", h: "Полный прогон с микрофоном", t: "Поднимаем backend (нужны Python, ffmpeg и ~3 ГБ под Whisper), выключаем mock — и проходим сессию реальным голосом.", accent: true },
  ];
  checks.forEach((c, i) => {
    const y = 1.6 + i * 1.2;
    card(s, 0.5, y, 9.0, 1.0, c.accent ? C.blueLight : C.white, c.accent ? C.blueMid : C.line);
    s.addShape("ellipse", { x: 0.75, y: y + 0.25, w: 0.5, h: 0.5, fill: { color: c.accent ? C.red : C.blue }, line: { type: "none" } });
    s.addText(c.n, { x: 0.75, y: y + 0.25, w: 0.5, h: 0.5, align: "center", valign: "middle", fontFace: HEAD, fontSize: 16, bold: true, color: C.white, margin: 0 });
    s.addText(c.h, { x: 1.45, y: y + 0.13, w: 7.8, h: 0.32, fontFace: HEAD, fontSize: 13.5, bold: true, color: C.ink, margin: 0, valign: "top" });
    s.addText(c.t, { x: 1.45, y: y + 0.48, w: 7.8, h: 0.45, fontFace: BODY, fontSize: 10.5, color: C.muted, margin: 0, valign: "top" });
  });

  footer(s);
}

// ============================================================
// СЛАЙД 10 — ШАГ 4: Docker + GitHub
// ============================================================
{
  const s = pptx.addSlide();
  contentTitle(s, "09", "Шаг 4. Docker и GitHub");

  s.addText("Упаковываем обе части в контейнеры и заливаем код в репозиторий — основа для деплоя.", {
    x: 0.5, y: 1.08, w: 9.0, h: 0.32, fontFace: BODY, fontSize: 13, color: C.muted, margin: 0, valign: "top",
  });

  const cols = [
    {
      h: "Два Dockerfile",
      lines: [
        "backend: Python + ffmpeg + Whisper; модель скачивается при сборке — быстрый старт",
        "frontend: standalone-сборка Next.js, образ ~150 МБ вместо гигабайта",
      ],
    },
    {
      h: "docker-compose.yml",
      lines: [
        "Один файл описывает оба контейнера, переменные окружения и порты",
        "Coolify читает его напрямую — отдельная настройка не нужна",
      ],
    },
    {
      h: "GitHub",
      lines: [
        "Код в приватный или публичный репозиторий — удобно через GitHub Desktop",
        "В .gitignore: ключи (.env), node_modules, кеш моделей — секреты в git не попадают",
      ],
    },
  ];
  cols.forEach((c, i) => {
    const x = 0.5 + i * 3.2;
    card(s, x, 1.55, 2.9, 2.95, C.blueLight, C.blueMid);
    s.addText(c.h, { x: x + 0.2, y: 1.73, w: 2.5, h: 0.38, fontFace: HEAD, fontSize: 14, bold: true, color: C.blue, margin: 0, valign: "top" });
    s.addText(c.lines.map((l) => ({ text: l, options: { bullet: { code: "2022", indent: 10 }, paraSpaceAfter: 10 } })), {
      x: x + 0.22, y: 2.2, w: 2.46, h: 2.15, fontFace: BODY, fontSize: 10.5, color: C.ink, margin: 0, valign: "top",
    });
  });

  s.addText([
    { text: "Зачем Docker? ", options: { bold: true, color: C.blue } },
    { text: "Контейнер одинаково работает на ноутбуке, на бесплатном хостинге и на боевом сервере. Переезд = тот же образ на новом месте.", options: { color: C.muted } },
  ], { x: 0.5, y: 4.72, w: 9.0, h: 0.4, fontFace: BODY, fontSize: 11.5, margin: 0, valign: "top" });

  footer(s);
}

// ============================================================
// СЛАЙД 11 — ШАГ 5: Hetzner
// ============================================================
{
  const s = pptx.addSlide();
  contentTitle(s, "10", "Шаг 5. Арендуем сервер DigitalOcean");

  const steps = [
    { n: "1", h: "Аккаунт DigitalOcean", t: "cloud.digitalocean.com — почта + карта или PayPal. Подойдёт уже существующий аккаунт, новый не нужен." },
    { n: "2", h: "SSH-ключ", t: "На своём компьютере: ssh-keygen -t ed25519. Публичная часть (.pub) вставляется в панель DO — вход без пароля." },
    { n: "3", h: "Создание droplet", t: "Ubuntu 24.04 · Basic 4 ГБ RAM / 2 vCPU. Регион Frankfurt — центр между Россией и Египтом. Через минуту получаем IP." },
    { n: "4", h: "Домен и DNS", t: "A-запись api.домен → IP droplet. Frontend остаётся на Vercel CDN — он уже задеплоен и бесплатен." },
  ];
  steps.forEach((st, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.5 + col * 4.75, y = 1.3 + row * 1.75;
    card(s, x, y, 4.55, 1.45, C.white, C.line);
    s.addShape("ellipse", { x: x + 0.2, y: y + 0.18, w: 0.5, h: 0.5, fill: { color: C.blue }, line: { type: "none" } });
    s.addText(st.n, { x: x + 0.2, y: y + 0.18, w: 0.5, h: 0.5, align: "center", valign: "middle", fontFace: HEAD, fontSize: 16, bold: true, color: C.white, margin: 0 });
    s.addText(st.h, { x: x + 0.85, y: y + 0.16, w: 3.5, h: 0.32, fontFace: HEAD, fontSize: 13.5, bold: true, color: C.ink, margin: 0, valign: "top" });
    s.addText(st.t, { x: x + 0.85, y: y + 0.52, w: 3.5, h: 0.85, fontFace: BODY, fontSize: 10, color: C.muted, margin: 0, valign: "top" });
  });

  s.addShape("roundRect", { x: 0.5, y: 4.85, w: 9.0, h: 0.5, rectRadius: 0.1, fill: { color: C.blueDeep }, line: { type: "none" } });
  s.addText([
    { text: "$24/мес ", options: { bold: true, color: C.white, fontSize: 13 } },
    { text: "— стабильные ядра для Whisper, resize в пару кликов, сервер никогда не «засыпает».", options: { color: "CBD5E1", fontSize: 11.5 } },
  ], { x: 0.8, y: 4.85, w: 8.5, h: 0.5, fontFace: BODY, valign: "middle", margin: 0 });
}

// ============================================================
// СЛАЙД 12 — ШАГ 6: Coolify
// ============================================================
{
  const s = pptx.addSlide();
  contentTitle(s, "11", "Шаг 6. Ставим Coolify и деплоим");

  s.addText("Coolify — бесплатная панель управления, которая превращает голый сервер в «свой Vercel».", {
    x: 0.5, y: 1.08, w: 9.0, h: 0.32, fontFace: BODY, fontSize: 13, color: C.muted, margin: 0, valign: "top",
  });

  const steps = [
    { n: "1", h: "Установка одной командой", t: "По SSH запускаем установочный скрипт с coolify.io. Через 5 минут панель доступна на http://IP:8000." },
    { n: "2", h: "Подключаем GitHub", t: "Coolify ставит своё приложение на репозиторий. Новый проект → Docker Compose → выбираем репо и ветку main." },
    { n: "3", h: "Переменные окружения", t: "OPENROUTER_API_KEY (секрет), домены фронта и бэка, язык Whisper. Всё через веб-форму." },
    { n: "4", h: "Домены и SSL", t: "Прописываем app.домен и api.домен. Сертификаты Let's Encrypt выпускаются и продлеваются сами." },
    { n: "5", h: "Deploy", t: "Кнопка Deploy: Coolify собирает оба образа и запускает. Первая сборка ~15 минут, дальше быстрее." },
    { n: "6", h: "Авто-деплой", t: "Включаем Deploy on Push: каждый git push в main автоматически обновляет прод." },
  ];
  steps.forEach((st, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.5 + col * 4.75, y = 1.55 + row * 1.18;
    card(s, x, y, 4.55, 1.0, C.blueLight, C.blueMid);
    s.addShape("ellipse", { x: x + 0.16, y: y + 0.28, w: 0.44, h: 0.44, fill: { color: C.blue }, line: { type: "none" } });
    s.addText(st.n, { x: x + 0.16, y: y + 0.28, w: 0.44, h: 0.44, align: "center", valign: "middle", fontFace: HEAD, fontSize: 14, bold: true, color: C.white, margin: 0 });
    s.addText(st.h, { x: x + 0.75, y: y + 0.12, w: 3.6, h: 0.28, fontFace: HEAD, fontSize: 12, bold: true, color: C.ink, margin: 0, valign: "top" });
    s.addText(st.t, { x: x + 0.75, y: y + 0.42, w: 3.6, h: 0.52, fontFace: BODY, fontSize: 9.2, color: C.muted, margin: 0, valign: "top" });
  });

  footer(s);
}

// ============================================================
// СЛАЙД 13 — Проверка и стоимость
// ============================================================
{
  const s = pptx.addSlide();
  contentTitle(s, "12", "Проверяем и считаем деньги");

  s.addText("Чек-лист после деплоя", { x: 0.5, y: 1.3, w: 4.4, h: 0.38, fontFace: HEAD, fontSize: 15, bold: true, color: C.ink, margin: 0, valign: "top" });
  const checks = [
    "api.домен/health отвечает: whisper загружен",
    "api.домен/docs — открывается документация API",
    "Frontend на Vercel открывается, стили школы на месте",
    "Запись голоса → транскрипция приходит",
    "Полная сессия: 3 раунда → чеклист → скачали .md",
    "Сертификат: замочек в браузере, https без ошибок",
  ];
  checks.forEach((c, i) => {
    const y = 1.82 + i * 0.52;
    s.addShape("ellipse", { x: 0.55, y: y + 0.08, w: 0.3, h: 0.3, fill: { color: C.blueLight }, line: { color: C.blue, width: 1 } });
    s.addText("✓", { x: 0.55, y: y + 0.08, w: 0.3, h: 0.3, align: "center", valign: "middle", fontFace: BODY, fontSize: 11, bold: true, color: C.blue, margin: 0 });
    s.addText(c, { x: 1.0, y, w: 3.95, h: 0.46, fontFace: BODY, fontSize: 10.5, color: C.ink, valign: "middle", margin: 0 });
  });

  s.addText("Стоимость в месяц", { x: 5.35, y: 1.3, w: 4.15, h: 0.38, fontFace: HEAD, fontSize: 15, bold: true, color: C.ink, margin: 0, valign: "top" });
  const costs = [
    ["Droplet DigitalOcean 4 ГБ", "$24 ≈ 2200 ₽"],
    ["Домен .ru", "≈ 17 ₽/мес"],
    ["Coolify + Vercel", "0 ₽"],
    ["AI-обработка (30 клиентов)", "≈ 30 ₽"],
  ];
  costs.forEach((c, i) => {
    const y = 1.82 + i * 0.62;
    card(s, 5.35, y, 4.15, 0.52, C.white, C.line);
    s.addText(c[0], { x: 5.55, y, w: 2.6, h: 0.52, fontFace: BODY, fontSize: 10.5, color: C.ink, valign: "middle", margin: 0 });
    s.addText(c[1], { x: 8.0, y, w: 1.35, h: 0.52, align: "right", fontFace: HEAD, fontSize: 10.5, bold: true, color: C.blue, valign: "middle", margin: 0 });
  });
  s.addShape("roundRect", { x: 5.35, y: 4.42, w: 4.15, h: 0.78, rectRadius: 0.1, fill: { color: C.blueDeep }, line: { type: "none" } });
  s.addText([
    { text: "Итого: ≈2250 ₽/мес", options: { bold: true, color: C.white, fontSize: 15, breakLine: true } },
    { text: "за инструмент для всего отдела продаж", options: { color: "CBD5E1", fontSize: 10 } },
  ], { x: 5.62, y: 4.42, w: 3.7, h: 0.78, fontFace: HEAD, valign: "middle", margin: 0 });

  footer(s);
}

// ============================================================
// СЛАЙД 14 — Что дальше + итог
// ============================================================
{
  const s = pptx.addSlide();
  darkSlide(s);

  s.addText("Готово. Что можно улучшить дальше", {
    x: 0.7, y: 0.72, w: 8.6, h: 0.65, fontFace: HEAD, fontSize: 30, bold: true, color: C.white, margin: 0, valign: "top",
  });

  const nexts = [
    { h: "Whisper-medium", t: "Точнее распознаёт имена и арабские термины. Цена — чуть больше диска и пара секунд к ответу." },
    { h: "Redis для сессий", t: "Сейчас незаконченные сессии живут в памяти и теряются при перезапуске. Redis ставится в Coolify в один клик." },
    { h: "Вход по паролю", t: "Сейчас доступ по секретной ссылке. Authelia добавит логин и двухфакторку для менеджеров." },
    { h: "Архив чеклистов", t: "Сохранять готовые .md в хранилище — история работы с каждым клиентом в одном месте." },
  ];
  nexts.forEach((n, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.7 + col * 4.5, y = 1.65 + row * 1.42;
    s.addShape("roundRect", { x, y, w: 4.2, h: 1.22, rectRadius: 0.08, fill: { color: "263A75" }, line: { color: "3B82F6", width: 1 } });
    s.addText(n.h, { x: x + 0.22, y: y + 0.12, w: 3.8, h: 0.3, fontFace: HEAD, fontSize: 13, bold: true, color: "93C5FD", margin: 0, valign: "top" });
    s.addText(n.t, { x: x + 0.22, y: y + 0.46, w: 3.8, h: 0.68, fontFace: BODY, fontSize: 9.5, color: "E2E8F0", margin: 0, valign: "top" });
  });

  s.addText([
    { text: "Менеджер говорит — ", options: { color: "CBD5E1" } },
    { text: "AI пишет", options: { bold: true, color: C.white } },
    { text: " — школа растёт.", options: { color: "CBD5E1" } },
  ], { x: 0.7, y: 4.75, w: 8.6, h: 0.5, fontFace: HEAD, fontSize: 18, align: "center", valign: "middle", margin: 0 });
}

// ---------- save ----------
pptx.writeFile({ fileName: "Talkarabic-Инструкция.pptx" }).then(() => {
  console.log("OK: Talkarabic-Инструкция.pptx created (v2)");
});
