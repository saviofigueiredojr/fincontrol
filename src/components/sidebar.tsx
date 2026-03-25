"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "./theme-provider";
import {
  LayoutDashboard,
  Receipt,
  CreditCard,
  Split,
  Target,
  CalendarCheck,
  Briefcase,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/lancamentos", label: "Lançamentos", icon: Receipt },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/divisao", label: "Divisão", icon: Split },
  { href: "/metas", label: "Metas", icon: Target },
  { href: "/fechar-mes", label: "Fechar Mês", icon: CalendarCheck },
  { href: "/creditos", label: "Créditos PJ", icon: Briefcase },
];

export function Sidebar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-50 rounded-xl border border-border/80 bg-card/90 p-2.5 shadow-[0_12px_24px_-18px_rgba(15,23,42,0.6)] backdrop-blur lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-screen w-72 flex-col border-r border-border/70 bg-card/90 backdrop-blur-xl transition-transform duration-300 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="border-b border-border/60 px-6 py-6">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-3" onClick={() => setMobileOpen(false)}>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-[0_14px_26px_-16px_rgba(15,23,42,0.75)]">
                <span className="text-sm font-semibold text-primary-foreground">FC</span>
              </div>
              <div>
                <p className="font-display text-lg font-semibold leading-none">FinControl</p>
                <p className="mt-1 text-xs text-muted-foreground">Financial Planning Suite</p>
              </div>
            </Link>
            <button
              onClick={() => setMobileOpen(false)}
              className="rounded-lg border border-border/70 p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
              aria-label="Fechar menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-[0_14px_26px_-20px_rgba(15,23,42,0.75)]"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-border/60 p-4">
          <button
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-background/70 px-3.5 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === "dark" ? "Modo Claro" : "Modo Escuro"}
          </button>

          {session?.user && (
            <div className="rounded-xl border border-border/70 bg-background/65 px-3.5 py-3">
              <p className="truncate text-sm font-medium">{session.user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
            </div>
          )}

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-3 rounded-xl border border-red-200/60 bg-red-50/80 px-3.5 py-2.5 text-sm text-red-700 transition-colors hover:bg-red-100 dark:border-red-900/35 dark:bg-red-950/25 dark:text-red-300 dark:hover:bg-red-900/35"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}
