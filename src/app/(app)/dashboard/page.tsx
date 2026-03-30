"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Target,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  formatCurrency,
  formatDate,
  getCurrentCompetencia,
  competenciaToLabel,
  nextCompetencia,
  prevCompetencia,
} from "@/lib/utils";

interface DashboardData {
  receitas: number;
  despesas: number;
  saldo: number;
  meta: { current: number; target: number; percentage: number; lifespan?: number };
  chartData: { competencia: string; label: string; receitas: number; despesas: number; saldo: number }[];
  despesasPorCategoria: { name: string; value: number }[];
  parcelasAtivas: {
    id: string;
    description: string;
    currentInstallment: number;
    totalInstallments: number;
    amount: number;
    nextDueDate: string;
  }[];
  orcamentoPorCategoria: {
    category: string;
    actual: number;
    budget: number;
    percentage: number;
  }[];
}

interface ProjectionData {
  competencia: string;
  label: string;
  projectedIncome: number;
  projectedExpense: number;
  projectedBalance: number;
}

const PIE_COLORS = ["#334155", "#0f766e", "#7c3f00", "#a16207", "#475569", "#6d28d9"];

function toFiniteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDashboardData(payload: any): DashboardData {
  const receitas = toFiniteNumber(payload?.receitas ?? payload?.totalIncome);
  const despesas = toFiniteNumber(payload?.despesas ?? payload?.totalExpense);
  const saldo = toFiniteNumber(payload?.saldo ?? payload?.balance ?? receitas - despesas);

  const metaCurrent = toFiniteNumber(payload?.meta?.current ?? payload?.currentGoalAmount);
  const metaTarget = toFiniteNumber(payload?.meta?.target ?? payload?.goalTarget);
  const computedMetaPercentage =
    metaTarget > 0 ? (metaCurrent / metaTarget) * 100 : 0;
  const metaPercentage = toFiniteNumber(payload?.meta?.percentage ?? computedMetaPercentage);

  const chartData = Array.isArray(payload?.chartData)
    ? payload.chartData.map((item: any) => {
      const competencia = typeof item?.competencia === "string" ? item.competencia : "";
      const label =
        typeof item?.label === "string" && item.label
          ? item.label
          : /^\d{4}-\d{2}$/.test(competencia)
            ? competenciaToLabel(competencia)
            : competencia || "-";

      return {
        competencia,
        label,
        receitas: toFiniteNumber(item?.receitas ?? item?.income ?? item?.totalIncome),
        despesas: toFiniteNumber(item?.despesas ?? item?.expense ?? item?.totalExpense),
        saldo: toFiniteNumber(item?.saldo ?? item?.balance),
      };
    })
    : [];

  const despesasPorCategoriaSource = Array.isArray(payload?.despesasPorCategoria)
    ? payload.despesasPorCategoria
    : Array.isArray(payload?.topCategories)
      ? payload.topCategories
      : [];

  const despesasPorCategoria = despesasPorCategoriaSource.map((item: any) => ({
    name: String(item?.name ?? item?.category ?? "Categoria"),
    value: toFiniteNumber(item?.value ?? item?.amount ?? item?.total ?? item?.spent),
  }));

  const parcelasAtivasSource = Array.isArray(payload?.parcelasAtivas)
    ? payload.parcelasAtivas
    : Array.isArray(payload?.activeInstallments)
      ? payload.activeInstallments
      : [];

  const parcelasAtivas = parcelasAtivasSource.map((item: any) => ({
      id: String(item?.id ?? `${item?.description ?? "parcela"}-${item?.nextDueDate ?? ""}`),
      description: String(item?.description ?? "Parcela"),
      currentInstallment: toFiniteNumber(item?.currentInstallment ?? item?.installmentCurrent),
      totalInstallments: toFiniteNumber(item?.totalInstallments ?? item?.installmentTotal),
      amount: toFiniteNumber(item?.amount),
      nextDueDate: String(item?.nextDueDate ?? new Date().toISOString()),
    }));

  const orcamentoSource = Array.isArray(payload?.orcamentoPorCategoria)
    ? payload.orcamentoPorCategoria
    : Array.isArray(payload?.budgetProgress)
      ? payload.budgetProgress
      : [];

  const orcamentoPorCategoria = orcamentoSource.map((item: any) => {
    const actual = toFiniteNumber(item?.actual ?? item?.spent);
    const budget = toFiniteNumber(item?.budget);
    const fallbackPercentage = budget > 0 ? (actual / budget) * 100 : 0;

    return {
      category: String(item?.category ?? "Categoria"),
      actual,
      budget,
      percentage: toFiniteNumber(item?.percentage ?? fallbackPercentage),
    };
  });

  return {
    receitas,
    despesas,
    saldo,
    meta: {
      current: metaCurrent,
      target: metaTarget,
      percentage: metaPercentage,
      lifespan: toFiniteNumber(payload?.meta?.lifespan),
    },
    chartData,
    despesasPorCategoria,
    parcelasAtivas,
    orcamentoPorCategoria,
  };
}

export default function DashboardPage() {
  const [competencia, setCompetencia] = useState(getCurrentCompetencia());
  const [data, setData] = useState<DashboardData | null>(null);
  const [projectionData, setProjectionData] = useState<ProjectionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resDash, resProj] = await Promise.all([
        fetch(`/api/dashboard?competencia=${competencia}`),
        fetch(`/api/projection?months=6&competencia=${competencia}`)
      ]);

      if (!resDash.ok) throw new Error("Erro ao carregar dados do dashboard");

      const jsonDash = await resDash.json();
      setData(normalizeDashboardData(jsonDash));

      if (resProj.ok) {
        const jsonProj = await resProj.json();
        setProjectionData(
          jsonProj.map((p: any) => ({
            competencia: String(p?.competencia ?? ""),
            label: competenciaToLabel(p.competencia),
            projectedIncome: toFiniteNumber(p?.projectedIncome),
            projectedExpense: toFiniteNumber(p?.projectedExpense),
            projectedBalance: toFiniteNumber(p?.projectedBalance),
          }))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [competencia]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-destructive">{error}</p>
        <Button onClick={fetchData}>Tentar novamente</Button>
      </div>
    );
  }

  if (!data) return null;

  const customTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl border border-border/70 bg-card/95 p-3 shadow-[0_16px_30px_-26px_rgba(15,23,42,0.8)] backdrop-blur-xl">
        <p className="mb-1 text-sm font-medium">{label}</p>
        {payload.map((entry: any, i: number) => (
          <p key={i} style={{ color: entry.color }} className="text-xs">
            {entry.name}: {formatCurrency(entry.value)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="surface-card p-6 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Overview</p>
            <h1 className="section-title mt-2">Financial Dashboard</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Visao executiva das receitas, despesas e progresso da sua reserva.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-background/70 p-1.5">
            <Button variant="outline" size="icon" onClick={() => setCompetencia(prevCompetencia(competencia))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[130px] text-center text-sm font-medium">
              {competenciaToLabel(competencia)}
            </span>
            <Button variant="outline" size="icon" onClick={() => setCompetencia(nextCompetencia(competencia))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Receitas</CardTitle>
            <div className="rounded-lg bg-emerald-100/90 p-2 text-emerald-700 dark:bg-emerald-900/35 dark:text-emerald-300">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-300">
              {formatCurrency(data.receitas)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Despesas</CardTitle>
            <div className="rounded-lg bg-rose-100/90 p-2 text-rose-700 dark:bg-rose-900/35 dark:text-rose-300">
              <TrendingDown className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-rose-700 dark:text-rose-300">
              {formatCurrency(data.despesas)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Saldo</CardTitle>
            <div className="rounded-lg bg-slate-200/85 p-2 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <Wallet className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-semibold ${data.saldo >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"
                }`}
            >
              {formatCurrency(data.saldo)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Reserva de Emergencia</CardTitle>
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Target className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <p className="text-2xl font-semibold">{data.meta.percentage.toFixed(1)}%</p>
              <Badge variant="outline">Meta</Badge>
            </div>
            <Progress
              value={Math.min(data.meta.percentage, 100)}
              className="mt-3"
              indicatorClassName="bg-gradient-to-r from-emerald-500 to-emerald-400"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {formatCurrency(data.meta.current)} / {formatCurrency(data.meta.target)}
              </span>
              {data.meta.lifespan !== undefined && data.meta.lifespan < 999 && data.meta.lifespan > 0 && (
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  ~ {data.meta.lifespan} meses de fôlego
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Receitas vs Despesas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.chartData}>
                  <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} className="text-xs" />
                  <YAxis
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    axisLine={false}
                    tickLine={false}
                    className="text-xs"
                  />
                  <Tooltip content={customTooltip} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Bar dataKey="receitas" name="Receitas" fill="#0f766e" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="despesas" name="Despesas" fill="#be123c" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Despesas por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.despesasPorCategoria}
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={92}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={false}
                  >
                    {data.despesasPorCategoria.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={customTooltip} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Parcelas Ativas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr className="border-b border-border/70">
                  <th className="px-2 py-3 text-left">Descricao</th>
                  <th className="px-2 py-3 text-center">Parcela</th>
                  <th className="px-2 py-3 text-right">Valor</th>
                  <th className="px-2 py-3 text-right">Proximo Vencimento</th>
                </tr>
              </thead>
              <tbody>
                {data.parcelasAtivas.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-muted-foreground">
                      Nenhuma parcela ativa
                    </td>
                  </tr>
                ) : (
                  data.parcelasAtivas.map((parcela) => (
                    <tr key={parcela.id} className="border-b border-border/55 last:border-0">
                      <td className="px-2 py-3">{parcela.description}</td>
                      <td className="px-2 py-3 text-center">
                        <Badge variant="secondary">
                          {parcela.currentInstallment}/{parcela.totalInstallments}
                        </Badge>
                      </td>
                      <td className="px-2 py-3 text-right font-medium">{formatCurrency(parcela.amount)}</td>
                      <td className="px-2 py-3 text-right text-muted-foreground">
                        {formatDate(parcela.nextDueDate)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Orcamento por Categoria</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.orcamentoPorCategoria.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">Nenhum orcamento definido</p>
            ) : (
              data.orcamentoPorCategoria.map((item) => (
                <div key={item.category} className="rounded-2xl border border-border/60 bg-background/50 p-4">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium">{item.category}</span>
                    <span className="text-muted-foreground">
                      {formatCurrency(item.actual)} / {formatCurrency(item.budget)}
                    </span>
                  </div>
                  <Progress
                    value={Math.min(item.percentage, 100)}
                    indicatorClassName={
                      item.percentage > 100
                        ? "bg-gradient-to-r from-rose-600 to-rose-500"
                        : item.percentage > 80
                          ? "bg-gradient-to-r from-amber-500 to-amber-400"
                          : "bg-gradient-to-r from-emerald-500 to-emerald-400"
                    }
                  />
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Projection Chart */}
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Projeção de Fluxo de Caixa (Próximos 6 meses)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={projectionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  className="text-xs text-muted-foreground"
                />
                <YAxis
                  tickFormatter={(v) => `R$ ${(v / 1000).toFixed(1)}k`}
                  axisLine={false}
                  tickLine={false}
                  className="text-xs text-muted-foreground"
                />
                <Tooltip content={customTooltip} />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Line
                  type="monotone"
                  dataKey="projectedIncome"
                  name="Faturamento"
                  stroke="#0f766e"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="projectedExpense"
                  name="Gastos"
                  stroke="#be123c"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="projectedBalance"
                  name="Caixa"
                  stroke="#0ea5e9"
                  strokeWidth={3}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
