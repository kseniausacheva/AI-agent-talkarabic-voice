# Design

Премиум-светлая тема под бренд **Школы арабского** (talkarabicnow.online).
PURE WHITE фон несёт всю ясность; голубой `#43abd0` — идентичность бренда,
красный `#fb3501` — CTA / действие / запись (энергия). Точные бренд-цвета (hex),
не OKLCH-приближения. **Тёмная тема намеренно отключена** — раньше
`@media (prefers-color-scheme: dark)` форсил тёмный фон при тёмной ОС, и это не
подошло. Strategy: **Restrained** — нейтралы + бренд-цвета на акцентах.

Ощущение — «сдержанная роскошь» / VIP: воздух, дорогая типографика (Oswald),
мягкие слоистые тени, один фирменный hero-момент (canvas со звуковыми волнами),
отполированные микро-взаимодействия. Без AI-слопа: никаких sparkle-иконок,
gradient-текста, глассморфизма, конфетти.

## Color Tokens

Источник истины — `@theme` в `frontend/src/app/globals.css`. Контраст проверен в браузере.

```css
@theme {
  /* Поверхности */
  --color-bg: #ffffff;            /* pure white — всегда */
  --color-surface: #f4f6f8;       /* спокойная светло-холодная подложка */
  --color-surface-elev: #ffffff;  /* карточки — белые, с тенью */
  --color-tint: #e9f8fd;          /* очень светлый голубой — мягкие подложки */
  --color-tint-strong: #cbf6fd;   /* фирменный светло-голубой */

  /* Текст */
  --color-ink: #092127;           /* бренд ink; ~16:1 на белом */
  --color-muted: #51666d;         /* вторичный текст; 6.05:1 (проверено) */
  --color-subtle: #8a9aa0;        /* декор/иконки; ~3:1 — НЕ для body-текста */

  /* Бренд-голубой (идентичность) */
  --color-primary: #43abd0;       /* акценты, фокус, прогресс, hero */
  --color-primary-hover: #3897ba;
  --color-primary-strong: #0d6f90;/* голубой для ТЕКСТА/ссылок; 5.69:1 */
  --color-primary-ink: #ffffff;

  /* Бренд-красный (CTA / действие / запись) */
  --color-accent: #fb3501;        /* белый текст на нём = 3.74:1 (AA-large) */
  --color-accent-hover: #e02d00;
  --color-accent-ink: #ffffff;
  --color-recording: #fb3501;

  /* Вторичный teal + статусы */
  --color-teal: #235667;
  --color-success: #1f8a5b;
  --color-danger: #c5221a;

  /* Линии */
  --color-line: #e6ebee;
  --color-line-strong: #cfd8dc;
}
:root { color-scheme: light; }   /* НЕ добавлять dark-вариант */
```

**Контраст-правила, которые надо помнить:**
- Голубой `#43abd0` НЕЛЬЗЯ под белый текст (≈2.4:1). Для голубого текста/ссылок —
  `--color-primary-strong` (#0d6f90). Для выбранных сегментов — тоже primary-strong.
- Красный `#fb3501` под белым текстом = 3.74:1 (проходит AA-large для жирных
  кнопочных лейблов; для строгого AA-normal нужно затемнить до ~#d92d00).
- `--color-subtle` только декоративный; для body-текста минимум `--color-muted`.

## Typography

Три семейства (display + body + mono) — все с кириллицей.

- **Display / заголовки**: `Oswald` (шрифт школы, кириллица), вес 500–700 —
  утилита `.font-display`. Только большие заголовки (hero, h1/h2 страниц,
  крупные числа в статистике), НЕ лейблы/кнопки/данные.
- **Body & UI**: `Inter` (Latin + Cyrillic), fallback system-ui.
- **Mono**: `JetBrains Mono` — транскрипт, MD-preview, даты/числа в таблицах.

Подключены через `next/font/google` в `layout.tsx`, `display: swap`.

Шкала: product-UI ⇒ преимущественно фиксированный rem; для заголовков страниц —
мягкий `clamp(1.75rem … 2.25rem)`, для hero — `clamp(2.5rem … 4.5rem)`.
`text-wrap: balance` на заголовках, `pretty` на длинных абзацах, body ≤ 65–75ch.

## Spacing, Radius, Shadow

4-px сетка (Tailwind defaults). Радиусы щедрые:
`--radius-sm .5rem / md .75rem / lg 1.125rem / xl 1.5rem`, кнопки — pill.

Мягкие слоистые тени в ink-тоне (не чёрные): `--shadow-xs/sm/md/lg`, плюс
цветные `--shadow-accent` (красная) и `--shadow-primary` (голубая) для CTA/брендовых
кнопок.

## Motion

ease-out exponential, 140–360ms, без bounce. `--ease-out-quart`, `--ease-out-expo`.
Полный `prefers-reduced-motion` фолбэк (в т.ч. hero-canvas рисует один статичный кадр).

- **Hero**: фирменный `HeroCanvas` — звуковые волны (мотив голоса) в бренд-цветах,
  лёгкий Canvas2D без зависимостей, ResizeObserver, пауза на скрытой вкладке.
- **Появление**: `.animate-fade-up`, `.stagger > *` (60ms apart) для списков/карточек.
- **Запись**: `.animate-recording-pulse` + эквалайзер-бары `.eq-bar` (визуализация голоса).
- Кнопки — лёгкий lift (`translateY(-1px)`) + усиление тени на hover.

## Components (классы в globals.css)

- **.btn** + `.btn-primary` (красный CTA), `.btn-brand` (голубой), `.btn-secondary`
  (белая с обводкой), `.btn-ghost`; модификаторы `.btn-lg`, `.btn-sm`. Pill, focus-ring.
- **.card** — белая, тонкая обводка `--line`, `--radius-lg`, `--shadow-sm`. Без nested cards.
- **.input** — единый инпут, focus = голубая рамка + кольцо.
- **.brand-rule** — тонкая бренд-полоса (голубой→красный) сверху header / auth.
- **AppHeader** — sticky, бренд-полоса, ink-плитка с Mic, pill-навигация.
- **AudioRecorder** — idle (красная кнопка Mic) → recording (красная пульсация +
  эквалайзер + таймер) → processing → preview (правка транскрипта) → submitted.
- **DealCard** — карточка сделки: сегмент-контрол продукта (выбранный =
  primary-strong), стоимость, рассрочка/оплата (тоглы), бейдж «Сделка закрыта».
- **QuestionCard** — белая карточка, номер вопроса в голубой плитке, h3.
- **RoundIndicator** — горизонтальные маркеры, активный = голубой.

## Anti-patterns (соблюдать)

Side-stripe borders, gradient-текст, глассморфизм-по-умолчанию, hero-metric шаблон,
identical card grid, eyebrow-капс над каждой секцией, numbered markers на каждой
секции, sparkle/robot AI-иконки — НЕТ.

## Tech stack

Next.js 16 (App Router) + React 19 + TypeScript, Tailwind CSS 4 (`@theme` в
`globals.css` — source of truth), lucide-react (outline), нативный CSS/Canvas2D
для движения. Шрифты — `next/font/google` (Oswald, Inter, JetBrains Mono).
