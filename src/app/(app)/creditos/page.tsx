"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Loader2,
  AlertCircle,
  Briefcase,
  Clock,
  CheckCircle,
  CalendarClock,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/modal";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Credit {
  id: string;
  clientName: string;
  description: string;
  amount: number;
  dueDate: string;
  status: "received" | "pending" | "future";
}

function toFiniteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStatus(value: unknown): Credit["status"] {
  if (value === "received" || value === "pending" || value === "future") return value;
  return "pending";
}

function normalizeCredits(payload: any): Credit[] {
  if (!Array.isArray(payload)) return [];

  // API can return grouped items: { clientName, transactions: [...] }
  if (payload.some((item) => Array.isArray(item?.transactions))) {
    return payload.flatMap((group: any) => {
      const clientName = String(group?.clientName ?? "Cliente");
      const txs = Array.isArray(group?.transactions) ? group.transactions : [];

      return txs.map((tx: any) => ({
        id: String(tx?.id ?? `${clientName}-${tx?.date ?? Math.random()}`),
        clientName,
        description: String(tx?.detail ?? tx?.description ?? clientName),
        amount: toFiniteNumber(tx?.amount),
        dueDate: String(tx?.dueDate ?? tx?.date ?? new Date().toISOString()),
        status: normalizeStatus(tx?.status),
      }));
    });
  }

  // Flat fallback shape
  return payload.map((item: any) => ({
    id: String(item?.id ?? ""),
    clientName: String(item?.clientName ?? item?.description ?? "Cliente"),
    description: String(item?.description ?? item?.detail ?? "Crédito"),
    amount: toFiniteNumber(item?.amount),
    dueDate: String(item?.dueDate ?? item?.date ?? new Date().toISOString()),
    status: normalizeStatus(item?.status),
  }));
}

const STATUS_CONFIG: Record<string, { label: string; variant: "success" | "warning" | "default"; icon: typeof CheckCircle }> = {
  received: { label: "Recebido", variant: "success", icon: CheckCircle },
  pending: { label: "Pendente", variant: "warning", icon: Clock },
  future: { label: "Futuro", variant: "default", icon: CalendarClock },
};

const emptyForm = {
  clientName: "",
  description: "",
  amount: "",
  dueDate: new Date().toISOString().split("T")[0],
  status: "pending" as "received" | "pending" | "future",
};

export default function CreditosPage() {
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/creditos");
      if (!res.ok) throw new Error("Erro ao carregar creditos");
      const json = await res.json();
      setCredits(normalizeCredits(json.credits ?? json));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/creditos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: form.clientName,
          description: form.description,
          amount: parseFloat(form.amount),
          dueDate: form.dueDate,
          status: form.status,
        }),
      });
      if (!res.ok) throw new Error("Erro ao salvar credito");
      setModalOpen(false);
      setForm(emptyForm);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const totalReceived = credits.filter((c) => c.status === "received").reduce((s, c) => s + c.amount, 0);
  const totalPending = credits.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0);
  const totalFuture = credits.filter((c) => c.status === "future").reduce((s, c) => s + c.amount, 0);

  // Group credits by client
  const clientGroups = credits.reduce<Record<string, Credit[]>>((acc, credit) => {
    if (!acc[credit.clientName]) acc[credit.clientName] = [];
    acc[credit.clientName].push(credit);
    return acc;
  }, {});

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Creditos PJ</h1>
        <Button onClick={() => { setForm(emptyForm); setModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Novo Credito
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Recebido</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalReceived)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Pendente</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-600">{formatCurrency(totalPending)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Futuro</CardTitle>
            <CalendarClock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">{formatCurrency(totalFuture)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Credits Table Grouped by Client */}
      {Object.keys(clientGroups).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum credito cadastrado</p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(clientGroups).map(([client, clientCredits]) => {
          const clientTotal = clientCredits.reduce((s, c) => s + c.amount, 0);
          return (
            <Card key={client}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-primary" />
                    {client}
                  </CardTitle>
                  <Badge variant="outline">{formatCurrency(clientTotal)}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2 font-medium text-muted-foreground">Descricao</th>
                        <th className="text-right py-3 px-2 font-medium text-muted-foreground">Valor</th>
                        <th className="text-right py-3 px-2 font-medium text-muted-foreground">Vencimento</th>
                        <th className="text-center py-3 px-2 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientCredits.map((credit) => {
                        const config = STATUS_CONFIG[credit.status];
                        return (
                          <tr key={credit.id} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="py-3 px-2">{credit.description}</td>
                            <td className="py-3 px-2 text-right font-medium">{formatCurrency(credit.amount)}</td>
                            <td className="py-3 px-2 text-right text-muted-foreground">
                              {formatDate(credit.dueDate)}
                            </td>
                            <td className="py-3 px-2 text-center">
                              <Badge variant={config.variant}>{config.label}</Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}

      {/* New Credit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Credito PJ</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Nome do Cliente</label>
              <input
                type="text"
                placeholder="Ex: Empresa ABC"
                value={form.clientName}
                onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Descricao</label>
              <input
                type="text"
                placeholder="Ex: Consultoria Março/2026"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Vencimento</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="received">Recebido</option>
                <option value="pending">Pendente</option>
                <option value="future">Futuro</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button variant="outline">Cancelar</Button>
              </DialogClose>
              <Button
                onClick={handleSave}
                disabled={saving || !form.clientName || !form.description || !form.amount}
              >
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Criar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
