"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
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
    <header className="border-b border-line bg-bg">
      <div className="mx-auto max-w-5xl px-6 h-14 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="text-sm font-medium text-ink hover:text-primary transition-colors shrink-0"
        >
          Чеклист клиента
          <span className="text-subtle font-normal hidden sm:inline">
            {" "}
            · Школа арабского
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          <HeaderLink href="/dashboard" active={pathname === "/dashboard"}>
            Дашборд
          </HeaderLink>
          {manager?.role === "admin" && (
            <HeaderLink href="/stats" active={pathname === "/stats"}>
              Статистика
            </HeaderLink>
          )}
          {manager && (
            <span
              className="ml-1 sm:ml-3 max-w-[10rem] truncate text-xs text-muted hidden sm:inline"
              title={manager.display_name}
            >
              {manager.display_name}
            </span>
          )}
          <button
            type="button"
            onClick={logout}
            className="ml-1 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs text-muted hover:text-ink hover:bg-surface transition-colors"
          >
            <LogOut size={13} />
            Выйти
          </button>
        </nav>
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
        "h-8 px-2.5 inline-flex items-center rounded-md text-sm transition-colors",
        active ? "text-ink bg-surface" : "text-muted hover:text-ink hover:bg-surface",
      )}
    >
      {children}
    </Link>
  );
}
