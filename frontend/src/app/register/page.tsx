"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Mic } from "lucide-react";
import { FormField } from "@/components/FormField";
import { MockBanner } from "@/components/MockBanner";
import { AuthBackdrop } from "@/components/AuthBackdrop";
import { apiRegister } from "@/lib/api";
import { setToken } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (!inviteCode.trim()) return "Введите инвайт-код.";
    if (!displayName.trim()) return "Введите имя для отображения.";
    if (!/^[a-z0-9_]{3,32}$/.test(username.trim()))
      return "Логин: 3–32 символа, только a–z, цифры и подчёркивание.";
    if (password.length < 8) return "Пароль — минимум 8 символов.";
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const { token } = await apiRegister({
        invite_code: inviteCode.trim(),
        username: username.trim(),
        password,
        display_name: displayName.trim(),
      });
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
      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-16">
        <AuthBackdrop />
        <div className="relative w-full max-w-sm animate-fade-up">
          <div className="card p-8 shadow-md">
            <div className="mb-7 flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-ink text-white shadow-sm">
                <Mic size={16} />
              </span>
              <div className="flex flex-col leading-tight">
                <span className="font-display text-[0.95rem] text-ink">
                  Школа арабского
                </span>
                <span className="text-[0.68rem] text-muted">
                  внутренний инструмент
                </span>
              </div>
            </div>
            <h1 className="font-display mb-1.5 text-[1.6rem] text-ink">
              Регистрация менеджера
            </h1>
            <p className="mb-7 text-sm text-muted">
              Нужен инвайт-код — его выдаёт администратор школы.
            </p>

            <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormField
              label="Инвайт-код"
              name="invite_code"
              value={inviteCode}
              onChange={setInviteCode}
              placeholder="код от администратора"
            />
            <FormField
              label="Имя для отображения"
              name="display_name"
              autoComplete="name"
              value={displayName}
              onChange={setDisplayName}
              placeholder="Ксения"
            />
            <FormField
              label="Логин"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(v) => setUsername(v.toLowerCase())}
              placeholder="ivanova"
              hint="3–32 символа: a–z, цифры, подчёркивание"
            />
            <FormField
              label="Пароль"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              placeholder="минимум 8 символов"
            />

            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}

              <button
                type="submit"
                disabled={pending}
                className="btn btn-primary w-full"
              >
                {pending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Создаём аккаунт…
                  </>
                ) : (
                  "Зарегистрироваться"
                )}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-muted">
            Уже есть аккаунт?{" "}
            <Link
              href="/login"
              className="font-medium text-primary-strong underline-offset-4 hover:underline"
            >
              Войти
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
