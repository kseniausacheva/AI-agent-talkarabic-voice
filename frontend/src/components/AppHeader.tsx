"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Mic } from "lucide-react";
import { apiMe, isMock } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import type { Manager } from "@/lib/types";
import { cn } from "@/lib/cn";

/**
 * Общая шапка внутренних страниц: имя менеджера,
 * ссылки Дашборд / Статистика (только admin) / Выйти.
 */
export function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [manager, setManager] = useState<Manager | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isMock() && !getToken()) return;
    (async () => {
      try {
        const me = await apiMe();
        if (!cancelled) setManager(me);
      } catch {
        /* 401 обрабатывается в api-слое */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function logout() {
    clearToken();
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-20">
      <div className="brand-rule" />
      <div className="border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-6">
          <Link href="/" className="group flex items-center gap-2.5 shrink-0">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-white shadow-sm transition-transform group-hover:-translate-y-0.5">
              <Mic size={15} />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-display text-[0.95rem] text-ink">
                Чеклист клиента
              </span>
              <span className="text-[0.68rem] text-muted">Школа арабского</span>
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            <HeaderLink href="/dashboard" active={pathname === "/dashboard"}>
              Дашборд
            </HeaderLink>
            <HeaderLink href="/pipeline" active={pathname === "/pipeline"}>
              Воронка
            </HeaderLink>
            <HeaderLink href="/earnings" active={pathname === "/earnings"}>
              Заработок
            </HeaderLink>
            {manager?.role === "admin" && (
              <>
                <HeaderLink href="/stats" active={pathname === "/stats"}>
                  Статистика
                </HeaderLink>
                <HeaderLink href="/knowledge" active={pathname === "/knowledge"}>
                  База
                </HeaderLink>
                <HeaderLink href="/import" active={pathname === "/import"}>
                  Импорт
                </HeaderLink>
                <HeaderLink href="/broadcast" active={pathname === "/broadcast"}>
                  Рассылка
                </HeaderLink>
              </>
            )}
            {manager && (
              <Link
                href="/settings"
                className="ml-1 hidden max-w-[10rem] truncate rounded-full px-2.5 py-1 text-xs text-muted transition-colors hover:bg-surface hover:text-ink sm:ml-2 sm:inline"
                title="Настройки"
              >
                {manager.display_name}
              </Link>
            )}
            <button
              type="button"
              onClick={logout}
              className="ml-1 inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">Выйти</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}

function HeaderLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium transition-colors",
        active
          ? "bg-tint text-primary-strong"
          : "text-muted hover:bg-surface hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
