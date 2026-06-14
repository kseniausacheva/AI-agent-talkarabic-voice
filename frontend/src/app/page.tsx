import Link from "next/link";
import { ArrowRight, ListChecks, Mic, FileDown } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { MockBanner } from "@/components/MockBanner";
import { HeroCanvas } from "@/components/HeroCanvas";

export default function LandingPage() {
  return (
    <AuthGuard>
      <MockBanner />
      <AppHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <HeroCanvas />
          {/* мягкая радиальная подложка под заголовком для читаемости */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 55% at 30% 40%, rgba(255,255,255,0.92), rgba(255,255,255,0.4) 70%, transparent)",
            }}
          />
          <div className="relative mx-auto max-w-5xl px-6 py-24 sm:py-32">
            <div className="max-w-2xl animate-fade-up">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-line bg-bg/70 px-3.5 py-1.5 text-xs font-medium text-teal shadow-xs backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Внутренний инструмент · Школа арабского
              </div>
              <h1 className="font-display text-balance text-[clamp(2.5rem,1.9rem+3vw,4.5rem)] leading-[1.02] tracking-[-0.02em] text-ink">
                Чеклист клиента{" "}
                <span className="text-primary-strong">за 7 минут.</span>
                <br className="hidden sm:block" /> После звонка или переписки.
              </h1>
              <p className="mt-6 max-w-prose text-pretty text-lg leading-relaxed text-muted">
                Закончили разговор с клиентом в Telegram, WhatsApp или по телефону —
                наговорите голосом ответы на 10 ключевых вопросов и получите готовый{" "}
                <code className="mx-0.5 rounded bg-surface px-1.5 py-0.5 font-mono text-sm text-ink">
                  .md
                </code>{" "}
                с аналитикой лида и сделкой для CRM.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link href="/session" className="btn btn-primary btn-lg">
                  Новый клиент — начать
                  <ArrowRight size={18} />
                </Link>
                <Link href="/dashboard" className="btn btn-secondary btn-lg">
                  Мои чеклисты
                </Link>
                <span className="text-sm text-muted">
                  10 вопросов · 3 раунда · ~7 минут
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Как это работает — реальная последовательность из 3 шагов */}
        <section className="mx-auto max-w-5xl px-6 pb-8">
          <div className="grid gap-4 stagger sm:grid-cols-3">
            <Step
              n="01"
              icon={Mic}
              title="Наговариваете ответы"
              body="После общения с клиентом открываете и наговариваете итоги голосом. Локальный Whisper транскрибирует речь."
            />
            <Step
              n="02"
              icon={ListChecks}
              title="Агент структурирует"
              body="MiniMax M3 раскладывает по категориям, оценивает лида и заполняет сделку: продукт, стоимость, оплата."
            />
            <Step
              n="03"
              icon={FileDown}
              title="Готовый итог"
              body="Markdown в CRM или чат команды, аналитика на дашборде, продажи за месяц — в статистике."
            />
          </div>
        </section>

        {/* Footer */}
        <section className="mx-auto max-w-5xl px-6 py-16">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-line pt-8">
            <p className="text-sm text-muted">
              Посмотреть пример готового чеклиста —{" "}
              <Link
                href="/results/demo-abc123"
                className="font-medium text-primary-strong underline-offset-4 hover:underline"
              >
                демо клиента Анны
              </Link>
            </p>
            <p className="font-mono text-xs tabular-nums text-subtle">
              talkarabic-internal
            </p>
          </div>
        </section>
      </main>
    </AuthGuard>
  );
}

function Step({
  n,
  icon: Icon,
  title,
  body,
}: {
  n: string;
  icon: typeof Mic;
  title: string;
  body: string;
}) {
  return (
    <div className="card group p-7 transition-shadow duration-300 hover:shadow-md">
      <div className="mb-5 flex items-center justify-between">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-tint text-primary-strong transition-transform duration-300 group-hover:-translate-y-0.5">
          <Icon size={20} />
        </span>
        <span className="font-display text-lg tabular-nums text-line-strong">
          {n}
        </span>
      </div>
      <h2 className="mb-2 text-[1.05rem] font-semibold text-ink">{title}</h2>
      <p className="text-pretty text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
