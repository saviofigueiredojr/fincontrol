"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Lock,
  Unlock,
  ArrowRight,
  ClipboardCheck,
  PiggyBank,
  Flag,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  formatCurrency,
  getCurrentCompetencia,
  competenciaToLabel,
  nextCompetencia,
  prevCompetencia,
} from "@/lib/utils";

interface CategorySummary {
  category: string;
  total: number;
  type: "income" | "expense";
}

interface MonthData {
  competencia: string;
  isClosed: boolean;
  receitas: number;
  despesas: number;
  saldo: number;
  categorySummary: CategorySummary[];
  goalSuggestion: number;
  currentGoalAmount: number;
  goalTarget: number;
}

interface ProjectionPoint {
  label: string;
  saldo: number;
  meta: number;
}

export default function FecharMesPage() {
  const [competencia, setCompetencia] = useState(getCurrentCompetencia());
  const [monthData, setMonthData] = useState<MonthData | null>(null);
  const [projection, setProjection] = useState<ProjectionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Wizard state
  const [step, setStep] = useState(1);
  const [allocation, setAllocation] = useState("");
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState(false);
  const [reopening, setReopening] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setClosed(false);
    setStep(1);
    try {
      const [monthRes, projRes] = await Promise.all([
        fetch(`/api/months?competencia=${competencia}`),
        fetch(`/api/projection?competencia=${competencia}`),
      ]);

      if (!monthRes.ok) throw new Error("Erro ao carregar dados do mes");
      const mJson = await monthRes.json();
      setMonthData(mJson);
      setAllocation(String(mJson.goalSuggestion ?? 4761.64));

      if (projRes.ok) {
        const pJson = await projRes.json();
        setProjection(pJson.projection ?? pJson);
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

  const handleClose = async () => {
    if (!monthData) return;
    setClosing(true);
    try {
      const res = await fetch("/api/months", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competencia,
          allocation: parseFloat(allocation) || 0,
        }),
      });
      if (!res.ok) throw new Error("Erro ao fechar mes");
      setClosed(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao fechar mes");
    } finally {
      setClosing(false);
    }
  };

  const handleReopen = async () => {
    setReopening(true);
    try {
      const res = await fetch("/api/months", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competencia, action: "reopen" }),
      });
      if (!res.ok) throw new Error("Erro ao reabrir mes");
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao reabrir");
    } finally {
      setReopening(false);
    }
  };

  const customTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-background border rounded-lg p-3 shadow-md">
        <p className="font-medium mb-1">{label}</p>
        {payload.map((entry: any, i: number) => (
          <p key={i} style={{ color: entry.color }} className="text-sm">
            {entry.name}: {formatCurrency(entry.value)}
          </p>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-destructive">{error}</p>
        <Button onClick={fetchData}>Tentar novamente</Button>
      </div>
    );
  }

  if (!monthData) return null;

  const allocationValue = parseFloat(allocation) || 0;
  const saldoAfterAllocation = monthData.saldo - allocationValue;

  const incomeCategories = monthData.categorySummary.filter((c) => c.type === "income");
  const expenseCategories = monthData.categorySummary.filter((c) => c.type === "expense");

  // Steps config
  const steps = [
    { num: 1, label: "Revisar", icon: ClipboardCheck },
    { num: 2, label: "Alocar", icon: PiggyBank },
    { num: 3, label: "Confirmar", icon: Flag },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Fechar Mes</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCompetencia(prevCompetencia(competencia))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[100px] text-center">
            {competenciaToLabel(competencia)}
          </span>
          <Button variant="outline" size="icon" onClick={() => setCompetencia(nextCompetencia(competencia))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Already closed state */}
      {monthData.isClosed && !closed ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-green-600" />
                <CardTitle>Mes Fechado</CardTitle>
              </div>
              <Button variant="outline" onClick={handleReopen} disabled={reopening}>
                {reopening ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Unlock className="h-4 w-4 mr-1" />}
                Reabrir
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 text-center">
                <p className="text-xs text-muted-foreground">Receitas</p>
                <p className="text-lg font-bold text-green-600">{formatCurrency(monthData.receitas)}</p>
              </div>
              <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 text-center">
                <p className="text-xs text-muted-foreground">Despesas</p>
                <p className="text-lg font-bold text-red-600">{formatCurrency(monthData.despesas)}</p>
              </div>
              <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-center">
                <p className="text-xs text-muted-foreground">Alocacao Meta</p>
                <p className="text-lg font-bold text-primary">{formatCurrency(monthData.goalSuggestion)}</p>
              </div>
              <div className={`p-4 rounded-lg text-center ${monthData.saldo >= 0 ? "bg-green-50 dark:bg-green-950/30" : "bg-red-50 dark:bg-red-950/30"}`}>
                <p className="text-xs text-muted-foreground">Saldo Final</p>
                <p className={`text-lg font-bold ${monthData.saldo >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(monthData.saldo)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Wizard Steps Indicator */}
          {!closed && (
            <div className="flex items-center justify-center gap-2">
              {steps.map((s, i) => (
                <div key={s.num} className="flex items-center">
                  <button
                    onClick={() => setStep(s.num)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      step === s.num
                        ? "bg-primary text-primary-foreground"
                        : step > s.num
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <s.icon className="h-4 w-4" />
                    {s.label}
                  </button>
                  {i < steps.length - 1 && <ArrowRight className="h-4 w-4 mx-1 text-muted-foreground" />}
                </div>
              ))}
            </div>
          )}

          {/* Step 1: Revisar */}
          {step === 1 && !closed && (
            <div className="space-y-4">
              {/* Income summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-green-600">Receitas</CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <tbody>
                      {incomeCategories.map((cat) => (
                        <tr key={cat.category} className="border-b last:border-0">
                          <td className="py-2 px-2">{cat.category}</td>
                          <td className="py-2 px-2 text-right font-medium text-green-600">
                            {formatCurrency(cat.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 font-bold">
                        <td className="py-2 px-2">Total Receitas</td>
                        <td className="py-2 px-2 text-right text-green-600">{formatCurrency(monthData.receitas)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>

              {/* Expense summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-red-600">Despesas</CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <tbody>
                      {expenseCategories.map((cat) => (
                        <tr key={cat.category} className="border-b last:border-0">
                          <td className="py-2 px-2">{cat.category}</td>
                          <td className="py-2 px-2 text-right font-medium text-red-600">
                            {formatCurrency(cat.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 font-bold">
                        <td className="py-2 px-2">Total Despesas</td>
                        <td className="py-2 px-2 text-right text-red-600">{formatCurrency(monthData.despesas)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>

              {/* Saldo */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold">Saldo do Mes</span>
                    <span className={`text-2xl font-bold ${monthData.saldo >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatCurrency(monthData.saldo)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button onClick={() => setStep(2)}>
                  Proximo: Alocar <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Alocar */}
          {step === 2 && !closed && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Alocar para Reserva de Emergencia</CardTitle>
                  <CardDescription>
                    Saldo disponivel: {formatCurrency(monthData.saldo)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Quanto alocar para a Reserva? (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={monthData.saldo > 0 ? monthData.saldo : 0}
                      value={allocation}
                      onChange={(e) => setAllocation(e.target.value)}
                      className="w-full h-10 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Sugestao: {formatCurrency(monthData.goalSuggestion)}
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Saldo do mes:</span>
                      <span className="font-medium">{formatCurrency(monthData.saldo)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Alocacao meta:</span>
                      <span className="font-medium text-primary">- {formatCurrency(allocationValue)}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t pt-2 font-bold">
                      <span>Saldo apos alocacao:</span>
                      <span className={saldoAfterAllocation >= 0 ? "text-green-600" : "text-red-600"}>
                        {formatCurrency(saldoAfterAllocation)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <Button onClick={() => setStep(3)}>
                  Proximo: Confirmar <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Confirmar */}
          {step === 3 && !closed && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Resumo do Fechamento</CardTitle>
                  <CardDescription>{competenciaToLabel(competencia)}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between py-2">
                      <span>Receitas</span>
                      <span className="font-medium text-green-600">+ {formatCurrency(monthData.receitas)}</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span>Despesas</span>
                      <span className="font-medium text-red-600">- {formatCurrency(monthData.despesas)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-t">
                      <span className="font-medium">Saldo</span>
                      <span className={`font-bold ${monthData.saldo >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(monthData.saldo)}
                      </span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span>Alocacao Reserva</span>
                      <span className="font-medium text-primary">- {formatCurrency(allocationValue)}</span>
                    </div>
                    <div className="flex justify-between py-3 border-t-2 text-base font-bold">
                      <span>Saldo Final</span>
                      <span className={saldoAfterAllocation >= 0 ? "text-green-600" : "text-red-600"}>
                        {formatCurrency(saldoAfterAllocation)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <Button onClick={handleClose} disabled={closing}>
                  {closing ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-1" />
                  )}
                  Fechar Mes
                </Button>
              </div>
            </div>
          )}

          {/* Success state */}
          {closed && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center gap-4 py-8">
                  <CheckCircle className="h-16 w-16 text-green-600" />
                  <h2 className="text-xl font-bold">Mes Fechado com Sucesso!</h2>
                  <p className="text-muted-foreground text-center">
                    {competenciaToLabel(competencia)} foi fechado.
                    {allocationValue > 0 && (
                      <> {formatCurrency(allocationValue)} alocados para a Reserva de Emergencia.</>
                    )}
                  </p>
                  <Button onClick={() => setCompetencia(nextCompetencia(competencia))}>
                    Ver Proximo Mes <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* 12-month Projection Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Projecao 12 Meses</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            {projection.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={projection}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" className="text-xs" />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} className="text-xs" />
                  <Tooltip content={customTooltip} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="saldo"
                    name="Saldo Projetado"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="meta"
                    name="Meta Reserva"
                    stroke="#10b981"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Sem dados de projecao
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
