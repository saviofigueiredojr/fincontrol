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
  FileClock,
  FileCheck,
  AlertTriangle
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
import { isPast, startOfDay } from "date-fns";

interface Credit {
  id: string;
  clientName: string;
  description: string;
  amount: number;
  dueDate: string;
  status: "unissued" | "issued" | "pending" | "paid";
}

function toFiniteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStatus(value: unknown): Credit["status"] {
  if (value === "unissued" || value === "issued" || value === "pending" || value === "paid") return value;
  // Fallbacks
  if (value === "future") return "unissued";
  if (value === "received") return "paid";
  return "pending";
}

const STATUS_CONFIG: Record<Credit["status"], { label: string; variant: "success" | "warning" | "default" | "secondary"; icon: any }> = {
  unissued: { label: "Falta Emitir", variant: "secondary", icon: FileClock },
  issued: { label: "NF Emitida", variant: "default", icon: FileCheck },
  pending: { label: "Pendente", variant: "warning", icon: Clock },
  paid: { label: "Pago", variant: "success", icon: CheckCircle },
};

const emptyForm = {
  clientName: "",
  description: "",
  amount: "",
  dueDate: new Date().toISOString().split("T")[0],
  status: "unissued" as Credit["status"],
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

      const payload = json.credits ?? [];
      const parsed = payload.map((item: any) => ({
        id: String(item.id),
        clientName: String(item.clientName),
        description: String(item.description),
        amount: toFiniteNumber(item.amount),
        dueDate: String(item.dueDate),
        status: normalizeStatus(item.status),
      }));

      setCredits(parsed);
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

  const handleStatusChange = async (id: string, newStatus: Credit["status"]) => {
    try {
      const res = await fetch(`/api/creditos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Erro ao atualizar status");
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao atualizar");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja apagar este registro?")) return;
    try {
      const res = await fetch(`/api/creditos/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Erro ao excluir");
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao excluir");
    }
  };

  const totalPaid = credits.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0);
  const totalPending = credits.filter((c) => ["unissued", "issued", "pending"].includes(c.status)).reduce((s, c) => s + c.amount, 0);

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
        <h1 className="text-2xl font-bold">Créditos PJ</h1>
        <Button onClick={() => { setForm(emptyForm); setModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Novo Faturamento
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Recebido (Pago)</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total A Receber (Aberto)</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-600">{formatCurrency(totalPending)}</p>
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
          const clientTotal = clientCredits.filter(c => c.status !== "paid").reduce((s, c) => s + c.amount, 0);
          return (
            <Card key={client}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-primary" />
                    {client}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Aberto: <Badge variant="outline">{formatCurrency(clientTotal)}</Badge></p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2 font-medium text-muted-foreground">Descrição</th>
                        <th className="text-right py-3 px-2 font-medium text-muted-foreground">Valor</th>
                        <th className="text-right py-3 px-2 font-medium text-muted-foreground">Previsão</th>
                        <th className="text-center py-3 px-2 font-medium text-muted-foreground">Etapa</th>
                        <th className="text-right py-3 px-2 font-medium text-muted-foreground">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientCredits.map((credit) => {
                        const dueDateObj = new Date(credit.dueDate);
                        // Check if it's late: past due date AND not paid
                        const isLate = credit.status !== "paid" && isPast(startOfDay(dueDateObj));

                        return (
                          <tr key={credit.id} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="py-3 px-2">
                              <div className="flex items-center gap-2">
                                {isLate && <span title="Atrasado"><AlertTriangle className="h-4 w-4 text-red-500" /></span>}
                                <span className={isLate ? "text-red-500 font-medium" : ""}>{credit.description}</span>
                              </div>
                            </td>
                            <td className="py-3 px-2 text-right font-medium">{formatCurrency(credit.amount)}</td>
                            <td className="py-3 px-2 text-right text-muted-foreground">
                              {formatDate(credit.dueDate)}
                            </td>
                            <td className="py-3 px-2 text-center">
                              <select
                                value={credit.status}
                                onChange={(e) => handleStatusChange(credit.id, e.target.value as Credit["status"])}
                                className={`text-xs rounded-full px-2 py-1 border font-semibold w-full max-w-[140px] text-center cursor-pointer outline-none focus:ring-1 focus:ring-ring
                                  ${credit.status === 'paid' ? 'bg-green-100 text-green-800 border-green-200' : ''}
                                  ${credit.status === 'pending' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : ''}
                                  ${credit.status === 'issued' ? 'bg-blue-100 text-blue-800 border-blue-200' : ''}
                                  ${credit.status === 'unissued' ? 'bg-gray-100 text-gray-800 border-gray-200' : ''}
                                `}
                              >
                                <option value="unissued">Falta Emitir</option>
                                <option value="issued">NF Emitida</option>
                                <option value="pending">Pendente</option>
                                <option value="paid">Pago</option>
                              </select>
                            </td>
                            <td className="py-3 px-2 text-right">
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(credit.id)} className="h-7 text-red-500 hover:text-red-600 hover:bg-red-50">
                                Excluir
                              </Button>
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
            <DialogTitle>Novo Faturamento PJ</DialogTitle>
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
              <label className="text-sm font-medium mb-1 block">Descricao / Projeto</label>
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
              <label className="text-sm font-medium mb-1 block">Vencimento (Previsão)</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Etapa Atual</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="unissued">Falta Emitir</option>
                <option value="issued">NF Emitida</option>
                <option value="pending">Pagamento Pendente</option>
                <option value="paid">Pago</option>
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
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
