"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { FormField } from "@/components/FormField";
import { MockBanner } from "@/components/MockBanner";
import { apiLogin } from "@/lib/api";
import { setToken } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { token } = await apiLogin(username.trim(), password);
      setToken(token);
      router.replace("/");
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }

  return (
    <>
      <MockBanner />
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-muted mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Внутренний инструмент · Школа арабского
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-ink mb-2">
            Вход для менеджера
          </h1>
          <p className="text-sm text-muted mb-8">
            Введите логин и пароль, выданные администратором.
          </p>

          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormField
              label="Логин"
              name="username"
              autoComplete="username"
              value={username}
              onChange={setUsername}
              placeholder="ivanova"
            />
            <FormField
              label="Пароль"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
            />

            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending || !username.trim() || !password}
              className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-full bg-primary text-primary-ink font-medium hover:bg-primary-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {pending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Входим…
                </>
              ) : (
                "Войти"
              )}
            </button>
          </form>

          <p className="mt-8 text-sm text-muted">
            Нет аккаунта?{" "}
            <Link
              href="/register"
              className="text-primary hover:underline underline-offset-4 font-medium"
            >
              Регистрация по инвайт-коду
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
