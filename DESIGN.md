# Design

Seed: editorial-минимализм с тёплой охрой как single brand color. PURE WHITE bg несёт всю архитектурную ясность; охра carryит brand-голос только в primary CTA и accent state записи. Анти-эстетика — SaaS-cream/dusty-brown AI-аттрактор. Strategy: **Restrained** — tinted neutrals + saturated охра ≤10% поверхности.

## Color Tokens

Все цвета в OKLCH. Hex-нотация запрещена.

```css
:root {
  /* Surfaces */
  --bg: oklch(1.000 0.000 0);            /* pure white — Stripe/Notion default */
  --surface: oklch(0.975 0.005 77);      /* almost-white panel, micro-warm */
  --surface-elev: oklch(0.955 0.006 77); /* slightly deeper for cards on surface */

  /* Text */
  --ink: oklch(0.185 0.012 77);          /* near-black, micro-warm; 17:1 vs bg */
  --muted: oklch(0.520 0.010 77);        /* secondary text; 4.7:1 vs bg */
  --subtle: oklch(0.700 0.008 77);       /* hints / placeholders / disabled */

  /* Brand */
  --primary: oklch(0.560 0.115 75);      /* deep ochre — single brand voice */
  --primary-ink: oklch(0.985 0.005 75);  /* white-on-primary text */
  --primary-hover: oklch(0.500 0.118 75);

  /* Accent — cool teal for contrast against warm primary */
  --accent: oklch(0.450 0.085 220);      /* deep teal — links, info state */
  --accent-ink: oklch(0.985 0.000 0);

  /* Status */
  --recording: oklch(0.580 0.205 25);    /* warm red, ONLY while mic active */
  --success: oklch(0.520 0.110 155);     /* calm green; sparingly */
  --danger: oklch(0.520 0.180 25);

  /* Lines */
  --line: oklch(0.910 0.005 77);         /* hairlines, dividers */
  --line-strong: oklch(0.820 0.007 77);  /* borders on inputs */
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: oklch(0.130 0.005 77);
    --surface: oklch(0.175 0.006 77);
    --surface-elev: oklch(0.215 0.007 77);
    --ink: oklch(0.960 0.005 77);
    --muted: oklch(0.700 0.010 77);
    --subtle: oklch(0.520 0.008 77);
    --primary: oklch(0.700 0.140 75);
    --primary-ink: oklch(0.130 0.005 77);
    --primary-hover: oklch(0.745 0.142 75);
    --accent: oklch(0.700 0.110 220);
    --line: oklch(0.260 0.006 77);
    --line-strong: oklch(0.360 0.008 77);
  }
}
```

## Typography

Одно семейство в нескольких весах — никаких "geometric sans + humanist sans" пар. Кириллица + латиница в одном шрифте.

- **Body & UI**: `Inter` (Latin + Cyrillic), variable, fallback `-apple-system, "Segoe UI", system-ui, sans-serif`
- **Headings**: тот же Inter, в большем размере и весе 600/700 — typographic hierarchy через размер + вес, не через смену семейства
- **Mono** (только для transcript-edit и MD-preview): `JetBrains Mono` или системный `ui-monospace, "SF Mono", Consolas, monospace`

Scale (ratio ≥ 1.25 между шагами, clamp() для fluid responsive):

```css
--font-display: clamp(2.25rem, 1.8rem + 2.2vw, 3.5rem);  /* hero h1 */
--font-h1: clamp(1.75rem, 1.5rem + 1.2vw, 2.25rem);      /* page heading */
--font-h2: clamp(1.375rem, 1.2rem + 0.6vw, 1.625rem);    /* section */
--font-h3: 1.125rem;                                      /* card heading */
--font-body: 1rem;                                        /* 16px base */
--font-small: 0.875rem;                                   /* hints, labels */
--font-tiny: 0.75rem;                                     /* badges, meta */

--lh-tight: 1.15;     /* display & h1 */
--lh-snug: 1.3;       /* h2, h3 */
--lh-base: 1.55;      /* body */
--lh-loose: 1.7;      /* long-form, transcripts */

--ls-display: -0.04em;  /* tightened headings */
--ls-body: 0;
--ls-mono: -0.005em;
```

Правила:
- `text-wrap: balance` на h1–h3
- `text-wrap: pretty` на длинных параграфах / transcript-preview
- Body line length cap: `max-width: 65ch`
- Никаких ALL-CAPS в body. Eyebrow-капс над каждой секцией — забанены (см. PRODUCT.md anti-references)

## Spacing & Layout

Используем 4-пиксельную сетку. Никаких произвольных значений.

```css
--space-1: 0.25rem;  /* 4 */
--space-2: 0.5rem;   /* 8 */
--space-3: 0.75rem;  /* 12 */
--space-4: 1rem;     /* 16 — base */
--space-5: 1.5rem;   /* 24 */
--space-6: 2rem;     /* 32 */
--space-7: 3rem;     /* 48 */
--space-8: 4rem;     /* 64 */
--space-9: 6rem;     /* 96 */

--radius-sm: 0.375rem;
--radius-md: 0.625rem;
--radius-lg: 1rem;
--radius-pill: 9999px;

--container: 64rem;   /* 1024px — единая центральная колонка */
--container-narrow: 42rem;  /* 672px — для текстовых страниц */
```

Layout:
- Flexbox для 1D, Grid для 2D
- Responsive grid без breakpoints: `grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))`
- Карточки используем только когда они правда лучший аффорданс — никаких nested cards

## Motion

Все движения «ease-out exponential», 180–280ms. Никакого bounce.

```css
--ease: cubic-bezier(0.16, 1, 0.3, 1);  /* ease-out-quart */
--dur-fast: 140ms;
--dur-base: 220ms;
--dur-slow: 360ms;

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Что анимируется:
- Появление новых вопросов в раунде — stagger fade-up 60ms apart
- Состояние рекордера: idle → pulse → success — через transform + opacity, не layout
- Прогресс-бар раундов — width transition

Что НЕ анимируется:
- Page transitions (мгновенно)
- Hover на кнопках (только color/bg, 140ms)
- Никаких reveal-on-scroll: контент видим сразу

## Z-Index Scale

Семантическая, без 999/9999.

```css
--z-base: 1;
--z-dropdown: 10;
--z-sticky: 20;
--z-modal-backdrop: 30;
--z-modal: 40;
--z-toast: 50;
--z-tooltip: 60;
```

## Components

Базовые примитивы (на Shadcn UI с переопределением tokens):

- **Button** — `primary` (охра, white ink), `secondary` (surface, ink), `ghost` (transparent, ink), `destructive` (danger)
- **Card** — `surface` bg, `--line` border 1px, `--radius-lg`. Без nested cards
- **Input / Textarea** — `bg`, `--line-strong` border, focus ring `--accent` 2px
- **Progress** — горизонтальный bar `--primary` на `--surface-elev`
- **Badge** — pill, satured `--primary` с `--primary-ink` ИЛИ outline вариант на `--surface`
- **AudioRecorder** — кастомный, см. ниже
- **QuestionCard** — кастомный, см. ниже

### AudioRecorder

Состояния: `idle` → `recording` → `processing` → `preview` → `submitted`.

- Idle: круглая кнопка 64px, охра `--primary`, иконка микрофона, label «Записать ответ»
- Recording: та же кнопка, цвет `--recording`, pulse-анимация (без bounce), таймер `00:12`, кнопка стоп
- Processing: spinner, текст «Транскрибируем…»
- Preview: textarea с транскриптом (редактируемый), кнопка «Подтвердить и отправить», кнопка «Перезаписать»
- Submitted: галочка, gray-out, кнопка «Изменить»

### QuestionCard

- Заголовок: номер вопроса (мелким, `--muted`) + текст вопроса (h3)
- Внутри — AudioRecorder
- Без иконок «AI ✨», без gradient borders, без nested cards

### RoundIndicator

- Три dot-маркера ИЛИ горизонтальный прогресс с цифрой «Раунд 2 из 3»
- Активный — `--primary`, пройденный — `--muted`, будущий — `--subtle`

## Anti-patterns (повтор из SKILL.md, чтобы не забыть)

- Side-stripe borders — нет
- Gradient text — нет
- Glassmorphism — нет
- Hero metric template — нет
- Identical card grid SaaS lego — нет
- Tiny uppercase tracked eyebrow над каждой секцией — нет
- Numbered section markers (01 / 02 / 03) на каждой секции — нет
- Sparkle/star/robot AI icons — нет

## Tech stack

- **Next.js 15 (App Router) + React 19 + TypeScript**
- **Tailwind CSS 4** с CSS-кастомными properties выше как source of truth (`@theme` в `globals.css`)
- **Shadcn UI** — Button, Card, Progress, Toast, Dialog — переопределяем через tokens
- **lucide-react** — только outline icons, без filled
- **Motion** (`framer-motion` или native CSS) — для рекордера и появления вопросов
