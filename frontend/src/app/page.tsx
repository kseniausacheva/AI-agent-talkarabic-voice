import Link from "next/link";
import { ArrowRight, ListChecks, Mic, FileDown } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { MockBanner } from "@/components/MockBanner";

export default function LandingPage() {
  return (
    <AuthGuard>
      <MockBanner />
      <AppHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-muted mb-8">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Внутренний инструмент · Школа арабского
            </div>
            <h1 className="text-balance text-[clamp(2.25rem,1.8rem+2.2vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-ink">
              Чеклист клиента <span className="text-primary">за 7 минут.</span> После звонка или переписки.
            </h1>
            <p className="mt-6 text-lg text-muted leading-relaxed max-w-prose text-pretty">
              Менеджер только что закончил разговор с клиентом в Telegram, WhatsApp
              или по телефону. Открывает этот инструмент, наговаривает голосом
              ответы на 10 ключевых вопросов про клиента, и получает готовый
              <code className="font-mono text-sm mx-1">.md</code> с категоризацией
              — для CRM и команды.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/session"
                className="inline-flex items-center gap-2 h-14 px-7 rounded-full bg-primary text-primary-ink font-medium hover:bg-primary-hover transition-colors"
              >
                Новый клиент — начать
                <ArrowRight size={18} />
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 h-14 px-7 rounded-full border border-line-strong bg-surface text-ink font-medium hover:bg-surface-elev transition-colors"
              >
                Мои чеклисты
              </Link>
              <span className="text-sm text-muted">
                10 вопросов · 3 раунда · ~7 минут
              </span>
            </div>
          </div>

          <div className="mt-24 grid gap-px bg-line rounded-2xl overflow-hidden border border-line sm:grid-cols-3">
            <Step
              n="1"
              icon={Mic}
              title="Наговариваете ответы"
              body="После общения с клиентом — открываете и наговариваете ответы голосом. Whisper транскрибирует."
            />
            <Step
              n="2"
              icon={ListChecks}
              title="Агент структурирует"
              body="MiniMax M3 разбирает по категориям: контакт, мотивация, уровень, формат, бюджет, следующие шаги."
            />
            <Step
              n="3"
              icon={FileDown}
              title="Скачиваете .md"
              body="Готовый Markdown — кидаете в CRM, в Telegram-чат команды или в карточку клиента в Notion."
            />
          </div>

          <div className="mt-24 flex items-baseline justify-between border-t border-line pt-8">
            <p className="text-sm text-muted">
              Хочешь посмотреть пример готового чеклиста? —{" "}
              <Link
                href="/results/demo-abc123"
                className="text-accent hover:underline underline-offset-4 font-medium"
              >
                демо клиента Анны
              </Link>
            </p>
            <p className="text-xs text-subtle font-mono tabular-nums">
              talkarabic-internal / v0.2
            </p>
          </div>
        </div>
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
    <div className="bg-bg p-7 sm:p-8">
      <div className="flex items-center gap-3 mb-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-elev text-primary">
          <Icon size={18} />
        </span>
        <span className="text-xs font-mono text-subtle tabular-nums">{n}</span>
      </div>
      <h2 className="text-[0.95rem] font-medium text-ink mb-2">{title}</h2>
      <p className="text-sm text-muted leading-relaxed text-pretty">{body}</p>
    </div>
  );
}
