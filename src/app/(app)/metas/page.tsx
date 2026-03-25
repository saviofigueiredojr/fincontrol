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
} from "recharts";
import {
  Target,
  TrendingUp,
  Calendar,
  DollarSign,
  Loader2,
  AlertCircle,
  Plus,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/modal";
import {
  formatCurrency,
  competenciaToLabel,
} from "@/lib/utils";

interface GoalData {
  id: string;
  name: string;
  currentAmount: number;
  targetAmount: number;
  percentage: number;
  monthlyTarget: number;
  projectedCompletionDate: string;
  history: {
    competencia: string;
    label: string;
    amount: number;
    cumulative: number;
  }[];
}

function toFiniteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeGoalData(payload: any): GoalData | null {
  const raw = Array.isArray(payload)
    ? payload[0]
    : Array.isArray(payload?.goals)
    ? payload.goals[0]
    : payload?.goal ?? payload;

  if (!raw || typeof raw !== "object" || !raw.id) return null;

  const targetAmount = toFiniteNumber(raw.targetAmount ?? raw.target);
  const currentAmount = toFiniteNumber(raw.currentAmount ?? raw.current);
  const percentage = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;
  const remaining = Math.max(targetAmount - currentAmount, 0);

  let monthlyTarget = toFiniteNumber(raw.monthlyTarget);
  const deadline = raw.deadline ? new Date(raw.deadline) : null;
  if (monthlyTarget <= 0) {
    if (deadline && !isNaN(deadline.getTime())) {
      const now = new Date();
      const monthsLeft = Math.max(
        1,
        (deadline.getFullYear() - now.getFullYear()) * 12 +
          (deadline.getMonth() - now.getMonth()) +
          1
      );
      monthlyTarget = remaining / monthsLeft;
    } else {
      monthlyTarget = remaining > 0 ? remaining / 12 : 0;
    }
  }

  let projectedCompletionDate = "";
  if (raw.projectedCompletionDate) {
    const match = String(raw.projectedCompletionDate).match(/^(\d{4}-\d{2})/);
    projectedCompletionDate = match?.[1] ?? "";
  }
  if (!projectedCompletionDate && monthlyTarget > 0 && remaining > 0) {
    const monthsToGoal = Math.ceil(remaining / monthlyTarget);
    const d = new Date();
    d.setMonth(d.getMonth() + monthsToGoal);
    projectedCompletionDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  const historySource = Array.isArray(raw.history) ? raw.history : [];
  const history = historySource.map((entry: any, index: number) => {
    const competencia = String(entry?.competencia ?? entry?.month ?? "");
    const label =
      typeof entry?.label === "string" && entry.label
        ? entry.label
        : /^\d{4}-\d{2}$/.test(competencia)
        ? competenciaToLabel(competencia)
        : `Mes ${index + 1}`;

    const amount = toFiniteNumber(entry?.amount ?? entry?.value);
    const cumulative = toFiniteNumber(entry?.cumulative ?? entry?.total ?? amount);

    return {
      competencia,
      label,
      amount,
      cumulative,
    };
  });

  return {
    id: String(raw.id),
    name: String(raw.name ?? "Reserva de Emergencia"),
    currentAmount,
    targetAmount,
    percentage,
    monthlyTarget,
    projectedCompletionDate,
    history,
  };
}

export default function MetasPage() {
  const [goal, setGoal] = useState<GoalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Allocate modal
  const [allocateOpen, setAllocateOpen] = useState(false);
  const [allocateAmount, setAllocateAmount] = useState("");
  const [allocating, setAllocating] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/goals");
      if (!res.ok) throw new Error("Erro ao carregar metas");
      const json = await res.json();
      setGoal(normalizeGoalData(json.goal ?? json));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAllocate = async () => {
    if (!goal || !allocateAmount) return;
    const parsedAmount = parseFloat(allocateAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return;

    setAllocating(true);
    try {
      const res = await fetch("/api/goals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: goal.id,
          currentAmount: goal.currentAmount + parsedAmount,
        }),
      });
      if (!res.ok) throw new Error("Erro ao alocar valor");
      setAllocateOpen(false);
      setAllocateAmount("");
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao alocar");
    } finally {
      setAllocating(false);
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

  if (!goal) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Target className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Nenhuma meta cadastrada</p>
      </div>
    );
  }

  const remaining = goal.targetAmount - goal.currentAmount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Metas</h1>
      </div>

      {/* Main Goal Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                {goal.name}
              </CardTitle>
              <CardDescription className="mt-1">
                Reserva de Emergencia - 6 meses de despesas
              </CardDescription>
            </div>
            <Button onClick={() => { setAllocateOpen(true); setAllocateAmount(""); }}>
              <Plus className="h-4 w-4 mr-1" /> Alocar Valor
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Large Progress */}
          <div className="space-y-2">
            <div className="flex items-end justify-between">
              <span className="text-4xl font-bold text-primary">{goal.percentage.toFixed(1)}%</span>
              <span className="text-sm text-muted-foreground">
                {formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}
              </span>
            </div>
            <Progress
              value={Math.min(goal.percentage, 100)}
              className="h-4"
              indicatorClassName="bg-green-500"
            />
            <p className="text-sm text-muted-foreground">
              Faltam {formatCurrency(remaining > 0 ? remaining : 0)}
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
              <DollarSign className="h-8 w-8 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Aporte Mensal Sugerido</p>
                <p className="text-lg font-bold">{formatCurrency(goal.monthlyTarget)}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
              <Calendar className="h-8 w-8 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Previsao de Conclusao</p>
                <p className="text-lg font-bold">
                  {goal.projectedCompletionDate
                    ? competenciaToLabel(goal.projectedCompletionDate)
                    : "N/A"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
              <TrendingUp className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-xs text-muted-foreground">Total Acumulado</p>
                <p className="text-lg font-bold text-green-600">{formatCurrency(goal.currentAmount)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Evolucao da Meta</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            {goal.history && goal.history.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={goal.history}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" className="text-xs" />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} className="text-xs" />
                  <Tooltip content={customTooltip} />
                  <Line
                    type="monotone"
                    dataKey="cumulative"
                    name="Acumulado"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    name="Aporte"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Sem dados de historico
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* History Table */}
      <Card>
        <CardHeader>
          <CardTitle>Historico de Aportes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">Competencia</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Aporte</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {!goal.history || goal.history.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-12 text-center text-muted-foreground">
                      Nenhum aporte registrado
                    </td>
                  </tr>
                ) : (
                  [...goal.history].reverse().map((entry, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 px-2 font-medium">{entry.label}</td>
                      <td className="py-3 px-2 text-right">
                        <Badge variant="success">{formatCurrency(entry.amount)}</Badge>
                      </td>
                      <td className="py-3 px-2 text-right font-medium">{formatCurrency(entry.cumulative)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Allocate Modal */}
      <Dialog open={allocateOpen} onOpenChange={setAllocateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alocar Valor para a Meta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder={String(goal.monthlyTarget)}
                value={allocateAmount}
                onChange={(e) => setAllocateAmount(e.target.value)}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Sugestao: {formatCurrency(goal.monthlyTarget)}
              </p>
            </div>

            {allocateAmount && parseFloat(allocateAmount) > 0 && (
              <div className="p-3 rounded-md bg-muted/50 text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Valor atual:</span>
                  <span className="font-medium">{formatCurrency(goal.currentAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Aporte:</span>
                  <span className="font-medium text-green-600">+ {formatCurrency(parseFloat(allocateAmount))}</span>
                </div>
                <div className="flex justify-between border-t pt-1">
                  <span>Novo total:</span>
                  <span className="font-bold">{formatCurrency(goal.currentAmount + parseFloat(allocateAmount))}</span>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button variant="outline">Cancelar</Button>
              </DialogClose>
              <Button onClick={handleAllocate} disabled={allocating || !allocateAmount || parseFloat(allocateAmount) <= 0}>
                {allocating && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Alocar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
