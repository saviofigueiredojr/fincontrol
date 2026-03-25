"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/modal";
import {
  formatCurrency,
  formatDate,
  getCurrentCompetencia,
  competenciaToLabel,
  nextCompetencia,
  prevCompetencia,
} from "@/lib/utils";

interface Transaction {
  id: string;
  date: string;
  description: string;
  category: string;
  type: "income" | "expense";
  ownership: "mine" | "partner" | "joint";
  amount: number;
  currentInstallment?: number;
  totalInstallments?: number;
}

const CATEGORIES = [
  "Moradia",
  "Alimentacao",
  "Transporte",
  "Lazer",
  "Saude",
  "Educacao",
  "Comunicacao",
  "Cartao de Credito",
  "Salario",
  "Receita Extra",
  "Outros",
];

const OWNERSHIP_LABELS: Record<string, string> = {
  mine: "Meu",
  partner: "Dele",
  joint: "Conjunto",
};

const OWNERSHIP_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  mine: "default",
  partner: "secondary",
  joint: "outline",
};

const emptyForm = {
  date: new Date().toISOString().split("T")[0],
  description: "",
  category: "Outros",
  amount: "",
  type: "expense" as "income" | "expense",
  ownership: "mine" as "mine" | "partner" | "joint",
  currentInstallment: "",
  totalInstallments: "",
};

export default function LancamentosPage() {
  const [competencia, setCompetencia] = useState(getCurrentCompetencia());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Filters
  const [ownershipFilter, setOwnershipFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ competencia });
      if (ownershipFilter !== "all") params.set("ownership", ownershipFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (searchQuery) params.set("search", searchQuery);
      const res = await fetch(`/api/transactions?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar lancamentos");
      const json = await res.json();
      setTransactions(json.transactions ?? json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [competencia, ownershipFilter, typeFilter, categoryFilter, searchQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setForm({
      date: tx.date.split("T")[0],
      description: tx.description,
      category: tx.category,
      amount: String(tx.amount),
      type: tx.type,
      ownership: tx.ownership,
      currentInstallment: tx.currentInstallment ? String(tx.currentInstallment) : "",
      totalInstallments: tx.totalInstallments ? String(tx.totalInstallments) : "",
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        date: form.date,
        description: form.description,
        category: form.category,
        amount: parseFloat(form.amount),
        type: form.type,
        ownership: form.ownership,
        currentInstallment: form.currentInstallment ? parseInt(form.currentInstallment) : null,
        totalInstallments: form.totalInstallments ? parseInt(form.totalInstallments) : null,
        competencia,
      };

      const url = editingId ? `/api/transactions/${editingId}` : "/api/transactions";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Erro ao salvar");
      setModalOpen(false);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao excluir");
      setDeletingId(null);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao excluir");
    }
  };

  const filtered = transactions;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Lancamentos</h1>
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

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar descricao..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-md border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Ownership filter */}
            <div className="flex rounded-md border overflow-hidden">
              {[
                { value: "all", label: "Todos" },
                { value: "mine", label: "Meus" },
                { value: "partner", label: "Dele" },
                { value: "joint", label: "Conjuntos" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setOwnershipFilter(opt.value)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    ownershipFilter === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Type filter */}
            <div className="flex rounded-md border overflow-hidden">
              {[
                { value: "all", label: "Todos" },
                { value: "income", label: "Receitas" },
                { value: "expense", label: "Despesas" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTypeFilter(opt.value)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    typeFilter === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Category filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">Todas categorias</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            {/* New button */}
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Novo Lancamento
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-destructive text-sm">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchData}>Tentar novamente</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground">Data</th>
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground">Descricao</th>
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground">Categoria</th>
                    <th className="text-center py-3 px-2 font-medium text-muted-foreground">Tipo</th>
                    <th className="text-center py-3 px-2 font-medium text-muted-foreground">Titular</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Valor</th>
                    <th className="text-right py-3 px-2 font-medium text-muted-foreground">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-muted-foreground">
                        Nenhum lancamento encontrado
                      </td>
                    </tr>
                  ) : (
                    filtered.map((tx) => (
                      <tr key={tx.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-3 px-2 whitespace-nowrap">{formatDate(tx.date)}</td>
                        <td className="py-3 px-2">
                          {tx.description}
                          {tx.totalInstallments && (
                            <span className="text-xs text-muted-foreground ml-1">
                              ({tx.currentInstallment}/{tx.totalInstallments})
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-2">{tx.category}</td>
                        <td className="py-3 px-2 text-center">
                          <Badge variant={tx.type === "income" ? "success" : "destructive"}>
                            {tx.type === "income" ? "Receita" : "Despesa"}
                          </Badge>
                        </td>
                        <td className="py-3 px-2 text-center">
                          <Badge variant={OWNERSHIP_BADGE_VARIANT[tx.ownership]}>
                            {OWNERSHIP_LABELS[tx.ownership]}
                          </Badge>
                        </td>
                        <td className={`py-3 px-2 text-right font-medium ${tx.type === "income" ? "text-green-600" : "text-red-600"}`}>
                          {formatCurrency(tx.amount)}
                        </td>
                        <td className="py-3 px-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(tx)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeletingId(tx.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Lancamento" : "Novo Lancamento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Data</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Descricao</label>
              <input
                type="text"
                placeholder="Ex: Aluguel, Supermercado..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Categoria</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
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
              <label className="text-sm font-medium mb-1 block">Tipo</label>
              <div className="flex rounded-md border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, type: "expense" })}
                  className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                    form.type === "expense" ? "bg-red-500 text-white" : "bg-background hover:bg-muted"
                  }`}
                >
                  Despesa
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, type: "income" })}
                  className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                    form.type === "income" ? "bg-green-500 text-white" : "bg-background hover:bg-muted"
                  }`}
                >
                  Receita
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Titular</label>
              <select
                value={form.ownership}
                onChange={(e) => setForm({ ...form, ownership: e.target.value as any })}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="mine">Meu</option>
                <option value="partner">Dele</option>
                <option value="joint">Conjunto</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Parcela Atual</label>
                <input
                  type="number"
                  min="1"
                  placeholder="Ex: 3"
                  value={form.currentInstallment}
                  onChange={(e) => setForm({ ...form, currentInstallment: e.target.value })}
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Total Parcelas</label>
                <input
                  type="number"
                  min="1"
                  placeholder="Ex: 12"
                  value={form.totalInstallments}
                  onChange={(e) => setForm({ ...form, totalInstallments: e.target.value })}
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button variant="outline">Cancelar</Button>
              </DialogClose>
              <Button onClick={handleSave} disabled={saving || !form.description || !form.amount}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {editingId ? "Salvar" : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusao</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-2">
            Tem certeza que deseja excluir este lancamento? Esta acao nao pode ser desfeita.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeletingId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deletingId && handleDelete(deletingId)}>
              Excluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
