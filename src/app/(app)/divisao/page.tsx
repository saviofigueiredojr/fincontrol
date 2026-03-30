"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  ArrowLeftRight,
  Percent,
  SlidersHorizontal,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  createFallbackHouseholdDisplayContext,
  getPartnerDisplayName,
  getSelfDisplayName,
  type HouseholdDisplayContext,
} from "@/lib/household-display";
import {
  DEFAULT_PARTNER_BENEFIT,
  DEFAULT_PARTNER_INCOME,
  DEFAULT_PRIMARY_INCOME,
} from "@/lib/app-defaults";
import {
  formatCurrency,
  getCurrentCompetencia,
  competenciaToLabel,
  nextCompetencia,
  prevCompetencia,
} from "@/lib/utils";

interface Transaction {
  id: string;
  userId: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  ownership: "mine" | "partner" | "joint";
  category: string;
}

interface Settings {
  myIncome: number;
  partnerIncome: number;
}

function isMonthlyIncome(tx: Transaction) {
  if (tx.type !== "income") {
    return false;
  }

  const normalizedCategory = tx.category.trim().toLowerCase();
  const normalizedDescription = tx.description.trim().toLowerCase();

  if (normalizedCategory === "saldo anterior") {
    return false;
  }

  if (normalizedDescription.includes("saldo inicial")) {
    return false;
  }

  return true;
}

export default function DivisaoPage() {
  const [competencia, setCompetencia] = useState(getCurrentCompetencia());
  const [mode, setMode] = useState<"equal" | "proportional" | "custom">("proportional");
  const [customPercent, setCustomPercent] = useState(50);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<Settings>({
    myIncome: DEFAULT_PRIMARY_INCOME,
    partnerIncome: DEFAULT_PARTNER_INCOME + DEFAULT_PARTNER_BENEFIT,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [householdContext, setHouseholdContext] = useState<HouseholdDisplayContext>(
    createFallbackHouseholdDisplayContext()
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [txRes, settingsRes, contextRes] = await Promise.all([
        fetch(`/api/transactions?competencia=${competencia}`),
        fetch("/api/settings"),
        fetch("/api/household/context"),
      ]);

      if (!txRes.ok) throw new Error("Erro ao carregar lancamentos");
      const txJson = await txRes.json();
      const txList = txJson.transactions ?? txJson;
      setTransactions(txList);

      if (settingsRes.ok) {
        const sJson = await settingsRes.json();
        const myMonthlyIncome = txList
          .filter((tx: Transaction) => isMonthlyIncome(tx) && tx.ownership === "mine")
          .reduce((sum: number, tx: Transaction) => sum + Number(tx.amount || 0), 0);
        const partnerMonthlyIncome = txList
          .filter((tx: Transaction) => isMonthlyIncome(tx) && tx.ownership === "partner")
          .reduce((sum: number, tx: Transaction) => sum + Number(tx.amount || 0), 0);
        const hasMonthlyIncomeData = myMonthlyIncome > 0 || partnerMonthlyIncome > 0;

        if (hasMonthlyIncomeData) {
          setSettings({
            myIncome: myMonthlyIncome,
            partnerIncome: partnerMonthlyIncome,
          });
        } else {
          const myIncome = parseFloat(
            sJson.primary_income ||
              sJson.savio_income ||
              String(DEFAULT_PRIMARY_INCOME)
          );
          const partnerBase = parseFloat(
            sJson.partner_income || String(DEFAULT_PARTNER_INCOME)
          );
          const partnerVa = parseFloat(sJson.partner_va || String(DEFAULT_PARTNER_BENEFIT));
          setSettings({ myIncome, partnerIncome: partnerBase + partnerVa });
        }
      }

      if (contextRes.ok) {
        const contextJson = await contextRes.json();
        setHouseholdContext({
          self: {
            id: String(contextJson?.self?.id ?? ""),
            name: String(contextJson?.self?.name ?? ""),
          },
          partner: contextJson?.partner
            ? {
                id: String(contextJson.partner.id ?? ""),
                name: String(contextJson.partner.name ?? ""),
              }
            : null,
        });
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

  const totalIncome = settings.myIncome + settings.partnerIncome;
  const myPercentage = totalIncome > 0 ? (settings.myIncome / totalIncome) * 100 : 50;
  const partnerPercentage = totalIncome > 0 ? (settings.partnerIncome / totalIncome) * 100 : 50;
  const selfDisplayName = getSelfDisplayName(householdContext);
  const partnerDisplayName = getPartnerDisplayName(householdContext);
  const jointExpenses = transactions.filter((tx) => tx.type === "expense" && tx.ownership === "joint");
  const myIndividualExpenses = transactions.filter(
    (tx) =>
      tx.type === "expense" &&
      tx.ownership === "mine"
  );
  const partnerIndividualExpenses = transactions.filter(
    (tx) =>
      tx.type === "expense" &&
      tx.ownership === "partner"
  );

  const totalJoint = jointExpenses.reduce((sum, tx) => sum + tx.amount, 0);
  const totalMyIndividual = myIndividualExpenses.reduce((sum, tx) => sum + tx.amount, 0);
  const totalPartnerIndividual = partnerIndividualExpenses.reduce((sum, tx) => sum + tx.amount, 0);

  const mySharePercent = mode === "equal" ? 50 : mode === "custom" ? customPercent : myPercentage;
  const partnerSharePercent = mode === "equal" ? 50 : mode === "custom" ? (100 - customPercent) : partnerPercentage;

  const myShareJoint = (totalJoint * mySharePercent) / 100;
  const partnerShareJoint = (totalJoint * partnerSharePercent) / 100;

  const myFreeBalance = settings.myIncome - myShareJoint - totalMyIndividual;
  const partnerFreeBalance = settings.partnerIncome - partnerShareJoint - totalPartnerIndividual;
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Divisao de Despesas</h1>
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

      {/* Mode toggle */}
      <div className="space-y-3">
        <div className="flex rounded-md border overflow-hidden w-fit">
          <button
            onClick={() => setMode("equal")}
            className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
              mode === "equal" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
            }`}
          >
            <ArrowLeftRight className="h-4 w-4" />
            50/50
          </button>
          <button
            onClick={() => setMode("proportional")}
            className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
              mode === "proportional" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
            }`}
          >
            <Percent className="h-4 w-4" />
            Proporcional
          </button>
          <button
            onClick={() => setMode("custom")}
            className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
              mode === "custom" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Personalizado
          </button>
        </div>

        {mode === "custom" && (
          <Card className="max-w-md">
            <CardContent className="pt-4 pb-4 space-y-3">
              <div className="flex justify-between text-sm font-medium">
                <span>{selfDisplayName}: {customPercent.toFixed(0)}%</span>
                <span>{partnerDisplayName}: {(100 - customPercent).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={customPercent}
                onChange={(e) => setCustomPercent(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary dark:bg-gray-700"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Income cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Renda {selfDisplayName}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">{formatCurrency(settings.myIncome)}</p>
            {mode === "proportional" && (
              <Badge variant="outline" className="mt-2">{myPercentage.toFixed(1)}%</Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Renda {partnerDisplayName}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">{formatCurrency(settings.partnerIncome)}</p>
            {mode === "proportional" && (
              <Badge variant="outline" className="mt-2">{partnerPercentage.toFixed(1)}%</Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Renda Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalIncome)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Joint Expenses Table */}
      <Card>
        <CardHeader>
          <CardTitle>Despesas Conjuntas</CardTitle>
          <CardDescription>
            Divisao {mode === "equal" ? "igualitaria (50/50)" : mode === "custom" ? `personalizada (${customPercent.toFixed(0)}% / ${(100 - customPercent).toFixed(0)}%)` : `proporcional (${myPercentage.toFixed(1)}% / ${partnerPercentage.toFixed(1)}%)`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">Descricao</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Valor Total</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Parte {selfDisplayName}</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Parte {partnerDisplayName}</th>
                </tr>
              </thead>
              <tbody>
                {jointExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-muted-foreground">
                      Nenhuma despesa conjunta neste mes
                    </td>
                  </tr>
                ) : (
                  jointExpenses.map((tx) => {
                    const myPart = (tx.amount * mySharePercent) / 100;
                    const partnerPart = (tx.amount * partnerSharePercent) / 100;
                    return (
                      <tr key={tx.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-3 px-2">{tx.description}</td>
                        <td className="py-3 px-2 text-right font-medium">{formatCurrency(tx.amount)}</td>
                        <td className="py-3 px-2 text-right text-primary">{formatCurrency(myPart)}</td>
                        <td className="py-3 px-2 text-right text-primary">{formatCurrency(partnerPart)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {jointExpenses.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 font-bold">
                    <td className="py-3 px-2">Total</td>
                    <td className="py-3 px-2 text-right">{formatCurrency(totalJoint)}</td>
                    <td className="py-3 px-2 text-right text-primary">{formatCurrency(myShareJoint)}</td>
                    <td className="py-3 px-2 text-right text-primary">{formatCurrency(partnerShareJoint)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Despesas Conjuntas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-red-600">{formatCurrency(totalJoint)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Contribuicao {selfDisplayName}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-primary">{formatCurrency(myShareJoint)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              + {formatCurrency(totalMyIndividual)} individuais
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Contribuicao {partnerDisplayName}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-primary">{formatCurrency(partnerShareJoint)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              + {formatCurrency(totalPartnerIndividual)} individuais
            </p>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2 lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Saldos Livres</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm">{selfDisplayName}</span>
              <span className={`text-base font-bold ${myFreeBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(myFreeBalance)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">{partnerDisplayName}</span>
              <span className={`text-base font-bold ${partnerFreeBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(partnerFreeBalance)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
