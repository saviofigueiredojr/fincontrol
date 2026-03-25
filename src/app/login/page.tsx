"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (res?.error) {
      setError("Email ou senha incorretos. Após 5 tentativas, o acesso será bloqueado por 30 minutos.");
      setLoading(false);
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(148,163,184,0.16),transparent_32%),radial-gradient(circle_at_85%_0%,rgba(244,114,182,0.08),transparent_30%)]" />
      <div className="relative w-full max-w-md rounded-3xl border border-border/70 bg-card/88 p-8 shadow-[0_40px_80px_-50px_rgba(15,23,42,0.75)] backdrop-blur-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-[0_18px_34px_-24px_rgba(15,23,42,0.8)]">
            <span className="text-base font-semibold text-primary-foreground">FC</span>
          </div>
          <h1 className="font-display text-3xl font-semibold text-foreground">FinControl</h1>
          <p className="mt-2 text-sm text-muted-foreground">Planejamento financeiro elegante e privado.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200/70 bg-red-50/80 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11"
              placeholder="seu@email.com"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1">
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[0_20px_32px_-24px_rgba(15,23,42,0.9)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/95 disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Workspace seguro para planejamentos, metas e operacoes financeiras.
        </p>
      </div>
    </div>
  );
}
