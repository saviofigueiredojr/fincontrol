"use client";

import { Fragment, useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Lock,
  CreditCard,
  ChevronsUpDown,
  TrendingUp,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
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
import {
  createFallbackHouseholdDisplayContext,
  getOwnershipDisplayLabel,
  getPartnerDisplayName,
  getSelfDisplayName,
  type HouseholdDisplayContext,
} from "@/lib/household-display";

interface Transaction {
  id: string;
  userId: string;
  date: string;
  description: string;
  category: string;
  type: "income" | "expense";
  ownership: "mine" | "partner" | "joint";
  amount: number;
  isSecret?: boolean;
  isRecurring?: boolean;
  recurringId?: string | null;
  currentInstallment?: number;
  totalInstallments?: number;
  source?: string | null;
  cardStatementId?: string | null;
  cardId?: string | null;
  cardName?: string | null;
  cardBank?: string | null;
}

interface CreditCardOption {
  id: string;
  name: string;
  bank: string;
}

interface StatementGroupRow {
  id: string;
  cardId: string;
  cardName: string;
  cardBank?: string | null;
  date: string;
  amount: number;
  ownership: "mine" | "partner" | "joint" | "mixed";
  items: Transaction[];
}

type DisplayRow =
  | { kind: "statement"; group: StatementGroupRow }
  | { kind: "transaction"; transaction: Transaction };

function toFiniteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTransactions(payload: any): Transaction[] {
  if (!Array.isArray(payload)) return [];

  return payload.map((tx: any) => ({
    id: String(tx?.id ?? ""),
    userId: String(tx?.userId ?? ""),
    date: String(tx?.date ?? new Date().toISOString()),
    description: String(tx?.description ?? ""),
    category: String(tx?.category ?? "Outros"),
    type: tx?.type === "income" ? "income" : "expense",
    ownership:
      tx?.ownership === "partner" ? "partner" : tx?.ownership === "joint" ? "joint" : "mine",
    amount: toFiniteNumber(tx?.amount),
    isSecret: !!tx?.isSecret,
    isRecurring: !!tx?.isRecurring,
    recurringId: typeof tx?.recurringId === "string" ? tx.recurringId : null,
    currentInstallment: tx?.currentInstallment ?? tx?.installmentCurrent ?? undefined,
    totalInstallments: tx?.totalInstallments ?? tx?.installmentTotal ?? undefined,
    source: typeof tx?.source === "string" ? tx.source : null,
    cardStatementId: typeof tx?.cardStatementId === "string" ? tx.cardStatementId : null,
    cardId: typeof tx?.cardStatement?.card?.id === "string" ? tx.cardStatement.card.id : null,
    cardName: typeof tx?.cardStatement?.card?.name === "string" ? tx.cardStatement.card.name : null,
    cardBank: typeof tx?.cardStatement?.card?.bank === "string" ? tx.cardStatement.card.bank : null,
  }));
}

function isCardStatementTransaction(transaction: Transaction) {
  return (
    transaction.type === "expense" &&
    !!transaction.cardStatementId &&
    !!transaction.cardId &&
    !!transaction.cardName
  );
}

function getGroupedOwnership(transactions: Transaction[]): StatementGroupRow["ownership"] {
  const ownerships = Array.from(new Set(transactions.map((transaction) => transaction.ownership)));

  if (ownerships.length === 1) {
    return ownerships[0];
  }

  return "mixed";
}

function buildDisplayRows(transactions: Transaction[]): DisplayRow[] {
  const statementGroups = new Map<string, StatementGroupRow>();

  for (const transaction of transactions) {
    if (!isCardStatementTransaction(transaction)) {
      continue;
    }

    const statementId = transaction.cardStatementId!;
    const existing = statementGroups.get(statementId);

    if (existing) {
      existing.items.push(transaction);
      existing.amount += transaction.amount;
      continue;
    }

    statementGroups.set(statementId, {
      id: statementId,
      cardId: transaction.cardId!,
      cardName: transaction.cardName!,
      cardBank: transaction.cardBank,
      date: transaction.date,
      amount: transaction.amount,
      ownership: transaction.ownership,
      items: [transaction],
    });
  }

  for (const group of Array.from(statementGroups.values())) {
    group.ownership = getGroupedOwnership(group.items);
  }

  const seenStatements = new Set<string>();
  const rows: DisplayRow[] = [];

  for (const transaction of transactions) {
    if (!isCardStatementTransaction(transaction)) {
      rows.push({ kind: "transaction", transaction });
      continue;
    }

    const statementId = transaction.cardStatementId!;
    if (seenStatements.has(statementId)) {
      continue;
    }

    seenStatements.add(statementId);
    rows.push({
      kind: "statement",
      group: statementGroups.get(statementId)!,
    });
  }

  return rows;
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

const OWNERSHIP_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  mine: "default",
  partner: "secondary",
  joint: "outline",
};

const GROUP_OWNERSHIP_BADGE_VARIANT: Record<StatementGroupRow["ownership"], "default" | "secondary" | "outline"> = {
  mine: "default",
  partner: "secondary",
  joint: "outline",
  mixed: "outline",
};

const emptyForm = {
  date: new Date().toISOString().split("T")[0],
  description: "",
  category: "Outros",
  amount: "",
  type: "expense" as "income" | "expense",
  ownership: "mine" as "mine" | "partner" | "joint",
  isSecret: false,
  isRecurring: false,
  recurringId: null as string | null,
  recurringEndDate: "",
  currentInstallment: "",
  totalInstallments: "",
  paymentMethod: "other" as "other" | "credit_card",
  cardId: "",
};

export default function LancamentosPage() {
  const [competencia, setCompetencia] = useState(getCurrentCompetencia());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [householdContext, setHouseholdContext] = useState<HouseholdDisplayContext>(
    createFallbackHouseholdDisplayContext()
  );
  const [cards, setCards] = useState<CreditCardOption[]>([]);
  const [applyToSeries, setApplyToSeries] = useState(false);

  const [ownershipFilter, setOwnershipFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [deleteScope, setDeleteScope] = useState<"single" | "series">("single");
  const [expandedStatementIds, setExpandedStatementIds] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ competencia });
      if (ownershipFilter !== "all") params.set("ownership", ownershipFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (searchQuery) params.set("search", searchQuery);

      const [transactionsRes, contextRes] = await Promise.all([
        fetch(`/api/transactions?${params}`),
        fetch("/api/household/context"),
      ]);

      if (!transactionsRes.ok) throw new Error("Erro ao carregar lancamentos");

      const transactionsJson = await transactionsRes.json();
      setTransactions(normalizeTransactions(transactionsJson.transactions ?? transactionsJson));

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
  }, [competencia, ownershipFilter, typeFilter, categoryFilter, searchQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const fetchCards = async () => {
      try {
        const res = await fetch("/api/cards");
        if (!res.ok) return;

        const json = await res.json();
        const cardList = (json.cards ?? json) as any[];
        if (!Array.isArray(cardList)) return;

        setCards(
          cardList.map((card) => ({
            id: String(card?.id ?? ""),
            name: String(card?.name ?? ""),
            bank: String(card?.bank ?? ""),
          }))
        );
      } catch {
        setCards([]);
      }
    };

    fetchCards();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setApplyToSeries(false);
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
      isSecret: tx.isSecret ?? false,
      isRecurring: tx.isRecurring ?? false,
      recurringId: tx.recurringId ?? null,
      recurringEndDate: "",
      currentInstallment: tx.currentInstallment ? String(tx.currentInstallment) : "",
      totalInstallments: tx.totalInstallments ? String(tx.totalInstallments) : "",
      paymentMethod: tx.cardId ? "credit_card" : "other",
      cardId: tx.cardId ?? "",
    });
    setApplyToSeries(Boolean(tx.isRecurring && tx.recurringId));
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (
        form.type === "expense" &&
        form.paymentMethod === "credit_card" &&
        !form.cardId
      ) {
        throw new Error("Selecione o cartão de crédito para este lançamento");
      }

      if (!editingId && form.isRecurring) {
        const recurringPayload = {
          description: form.description,
          category: form.category,
          amount: parseFloat(form.amount),
          type: form.type,
          ownership: form.ownership,
          dayOfMonth: new Date(form.date).getDate(),
          startDate: competencia,
          endDate: form.recurringEndDate || undefined,
          cardId:
            form.type === "expense" && form.paymentMethod === "credit_card"
              ? form.cardId
              : null,
        };

        const recurringRes = await fetch("/api/recurring", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(recurringPayload),
        });

        if (!recurringRes.ok) {
          const recurringJson = await recurringRes.json().catch(() => ({}));
          throw new Error(recurringJson?.error || "Erro ao criar recorrencia");
        }

        setModalOpen(false);
        fetchData();
        return;
      }

      const body = {
        date: form.date,
        description: form.description,
        category: form.category,
        amount: parseFloat(form.amount),
        type: form.type,
        ownership: form.ownership,
        isSecret: form.isSecret,
        installmentCurrent: form.isRecurring ? null : form.currentInstallment ? parseInt(form.currentInstallment, 10) : null,
        installmentTotal: form.isRecurring ? null : form.totalInstallments ? parseInt(form.totalInstallments, 10) : null,
        applyToSeries: editingId && form.isRecurring ? applyToSeries : undefined,
        competencia,
        cardId:
          form.type === "expense" && form.paymentMethod === "credit_card"
            ? form.cardId
            : null,
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

  const openDeleteDialog = (transaction: Transaction) => {
    setDeletingTransaction(transaction);
    setDeleteScope("single");
  };

  const handleDelete = async (transaction: Transaction, scope: "single" | "series") => {
    try {
      const query = scope === "series" ? "?scope=series" : "";
      const res = await fetch(`/api/transactions/${transaction.id}${query}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao excluir");
      setDeletingTransaction(null);
      setDeleteScope("single");
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao excluir");
    }
  };

  const selfDisplayName = getSelfDisplayName(householdContext);
  const partnerDisplayName = getPartnerDisplayName(householdContext);
  const displayRows = useMemo(() => buildDisplayRows(transactions), [transactions]);
  const summary = useMemo(() => {
    const receitas = transactions
      .filter((transaction) => transaction.type === "income")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const despesas = transactions
      .filter((transaction) => transaction.type === "expense")
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    return {
      receitas,
      despesas,
      saldo: receitas - despesas,
    };
  }, [transactions]);

  const toggleStatement = (statementId: string) => {
    setExpandedStatementIds((current) =>
      current.includes(statementId)
        ? current.filter((id) => id !== statementId)
        : [...current, statementId]
    );
  };

  const renderTransactionRow = (tx: Transaction, options?: { nested?: boolean }) => (
    <tr
      key={tx.id}
      className={`border-b last:border-0 hover:bg-muted/50 ${options?.nested ? "bg-muted/20" : ""}`}
    >
      <td className={`py-3 px-2 whitespace-nowrap ${options?.nested ? "pl-6" : ""}`}>
        {options?.nested ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-px w-4 bg-border" />
            {formatDate(tx.date)}
          </span>
        ) : (
          formatDate(tx.date)
        )}
      </td>
      <td className="py-3 px-2">
        <span className="flex items-center gap-1.5">
          {tx.isSecret && (
            <span title="Secreto" className="flex">
              <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            </span>
          )}
          {tx.description}
          <Badge variant={tx.isRecurring ? "outline" : "secondary"} className="ml-2">
            {tx.isRecurring ? "Recorrente" : "Avulso"}
          </Badge>
          {tx.cardName && !options?.nested && (
            <Badge variant="outline" className="ml-1">
              <CreditCard className="mr-1 h-3 w-3" />
              {tx.cardName}
            </Badge>
          )}
          {tx.totalInstallments && (
            <span className="text-xs text-muted-foreground ml-1">
              ({tx.currentInstallment}/{tx.totalInstallments})
            </span>
          )}
        </span>
      </td>
      <td className="py-3 px-2">{tx.category}</td>
      <td className="py-3 px-2 text-center">
        <Badge variant={tx.type === "income" ? "success" : "destructive"}>
          {tx.type === "income" ? "Receita" : "Despesa"}
        </Badge>
      </td>
      <td className="py-3 px-2 text-center">
        <Badge variant={OWNERSHIP_BADGE_VARIANT[tx.ownership]}>
          {getOwnershipDisplayLabel(tx.ownership, tx.userId, householdContext)}
        </Badge>
      </td>
      <td
        className={`py-3 px-2 text-right font-medium ${
          tx.type === "income" ? "text-green-600" : "text-red-600"
        }`}
      >
        {formatCurrency(tx.amount)}
      </td>
      <td className="py-3 px-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => openEdit(tx)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => openDeleteDialog(tx)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="space-y-6">
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

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="flex h-9 min-w-[200px] flex-1 items-center rounded-md border bg-background px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar descricao..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-full w-full bg-transparent text-sm focus:outline-none"
              />
            </div>

            <div className="flex rounded-md border overflow-hidden">
              {[
                { value: "all", label: "Todos" },
                { value: "mine", label: selfDisplayName },
                { value: "partner", label: partnerDisplayName },
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

            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Novo Lancamento
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="text-sm text-muted-foreground">Receitas na visualização</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-700">
                {formatCurrency(summary.receitas)}
              </p>
            </div>
            <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="text-sm text-muted-foreground">Despesas na visualização</p>
              <p className="mt-1 text-2xl font-semibold text-rose-700">
                {formatCurrency(summary.despesas)}
              </p>
            </div>
            <div className="rounded-lg bg-rose-100 p-2 text-rose-700">
              <TrendingDown className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="text-sm text-muted-foreground">Saldo da visualização</p>
              <p
                className={`mt-1 text-2xl font-semibold ${
                  summary.saldo >= 0 ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {formatCurrency(summary.saldo)}
              </p>
            </div>
            <div className="rounded-lg bg-slate-200 p-2 text-slate-700">
              <Wallet className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>
      </div>

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
                  {displayRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-muted-foreground">
                        Nenhum lancamento encontrado
                      </td>
                    </tr>
                  ) : (
                    displayRows.map((row) => {
                      if (row.kind === "transaction") {
                        return renderTransactionRow(row.transaction);
                      }

                      const isExpanded = expandedStatementIds.includes(row.group.id);
                      const ownershipLabel =
                        row.group.ownership === "mixed"
                          ? "Misto"
                          : getOwnershipDisplayLabel(
                              row.group.ownership,
                              row.group.items[0]?.userId ?? "",
                              householdContext
                            );

                      return (
                        <Fragment key={row.group.id}>
                          <tr
                            className="border-b bg-slate-50/80 hover:bg-slate-100/80 dark:bg-slate-900/40 dark:hover:bg-slate-900/70"
                          >
                            <td className="py-3 px-2 whitespace-nowrap">{formatDate(row.group.date)}</td>
                            <td className="py-3 px-2">
                              <button
                                type="button"
                                onClick={() => toggleStatement(row.group.id)}
                                className="flex w-full items-center gap-2 text-left"
                              >
                                <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <span className="font-medium">Fatura {row.group.cardName}</span>
                                <Badge variant="outline">
                                  {row.group.items.length} {row.group.items.length === 1 ? "item" : "itens"}
                                </Badge>
                                <Badge variant="secondary" className="hidden sm:inline-flex">
                                  {row.group.cardBank}
                                </Badge>
                              </button>
                            </td>
                            <td className="py-3 px-2">Cartão de Crédito</td>
                            <td className="py-3 px-2 text-center">
                              <Badge variant="destructive">Despesa</Badge>
                            </td>
                            <td className="py-3 px-2 text-center">
                              <Badge variant={GROUP_OWNERSHIP_BADGE_VARIANT[row.group.ownership]}>
                                {ownershipLabel}
                              </Badge>
                            </td>
                            <td className="py-3 px-2 text-right font-medium text-red-600">
                              {formatCurrency(row.group.amount)}
                            </td>
                            <td className="py-3 px-2 text-right">
                              <Button variant="ghost" size="sm" onClick={() => toggleStatement(row.group.id)}>
                                {isExpanded ? "Ocultar" : "Ver compras"}
                              </Button>
                            </td>
                          </tr>
                          {isExpanded &&
                            row.group.items.map((transaction) =>
                              renderTransactionRow(transaction, { nested: true })
                            )}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
                  onClick={() =>
                    setForm({
                      ...form,
                      type: "income",
                      paymentMethod: "other",
                      cardId: "",
                    })
                  }
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
                onChange={(e) => {
                  const ownership = e.target.value as "mine" | "partner" | "joint";
                  setForm({
                    ...form,
                    ownership,
                    paymentMethod:
                      ownership === "partner" ? "other" : form.paymentMethod,
                    cardId: ownership === "partner" ? "" : form.cardId,
                  });
                }}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="mine">{selfDisplayName}</option>
                <option value="partner">{partnerDisplayName}</option>
                <option value="joint">Conjunto</option>
              </select>
            </div>

            {form.type === "expense" && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Forma de Pagamento</label>
                  <div className="flex rounded-md border overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, paymentMethod: "other", cardId: "" })}
                      className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                        form.paymentMethod === "other"
                          ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                          : "bg-background hover:bg-muted"
                      }`}
                    >
                      Conta / Outro
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (form.ownership === "partner") {
                          return;
                        }

                        setForm({ ...form, paymentMethod: "credit_card" });
                      }}
                      disabled={form.ownership === "partner"}
                      className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                        form.paymentMethod === "credit_card"
                          ? "bg-primary text-primary-foreground"
                          : "bg-background hover:bg-muted"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      Cartão de Crédito
                    </button>
                  </div>
                  {form.ownership === "partner" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Por enquanto, o vínculo com cartão está disponível para lançamentos seus ou conjuntos.
                    </p>
                  )}
                </div>

                {form.paymentMethod === "credit_card" && form.ownership !== "partner" && (
                  <div>
                    <label className="text-sm font-medium mb-1 block">Cartão</label>
                    <select
                      value={form.cardId}
                      onChange={(e) => setForm({ ...form, cardId: e.target.value })}
                      className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">Selecione um cartão</option>
                      {cards.map((card) => (
                        <option key={card.id} value={card.id}>
                          {card.name} - {card.bank}
                        </option>
                      ))}
                    </select>
                    {cards.length === 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Nenhum cartão disponível para vincular.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 py-1">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isSecret}
                  onChange={(e) => setForm({ ...form, isSecret: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-amber-500"></div>
              </label>
              <div>
                <span className="text-sm font-medium flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" /> Secreto
                </span>
                <p className="text-xs text-muted-foreground">Oculta este lancamento do outro titular</p>
              </div>
            </div>

            {!editingId && (
              <div className="flex items-center gap-3 py-1">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isRecurring}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        isRecurring: e.target.checked,
                        currentInstallment: e.target.checked ? "" : form.currentInstallment,
                        totalInstallments: e.target.checked ? "" : form.totalInstallments,
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 rounded-full bg-gray-200 peer dark:bg-gray-700 peer-checked:bg-primary" />
                </label>
                <div>
                  <span className="text-sm font-medium">Lancamento recorrente</span>
                  <p className="text-xs text-muted-foreground">
                    Cria a recorrencia e gera as proximas ocorrencias automaticamente.
                  </p>
                </div>
              </div>
            )}

            {!editingId && form.isRecurring && (
              <div className="rounded-lg border border-border/70 bg-muted/40 p-3 space-y-3">
                <p className="text-sm font-medium">Configuracao da recorrencia</p>
                <p className="text-xs text-muted-foreground">
                  A recorrencia comeca nesta competencia e materializa os proximos meses automaticamente.
                </p>
                <div>
                  <label className="text-sm font-medium mb-1 block">Encerrar em</label>
                  <input
                    type="month"
                    value={form.recurringEndDate}
                    onChange={(e) => setForm({ ...form, recurringEndDate: e.target.value })}
                    className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Deixe em branco para manter ativa por padrao nos proximos meses.
                  </p>
                </div>
              </div>
            )}

            {editingId && form.isRecurring && (
              <div className="rounded-lg border border-border/70 bg-muted/40 p-3">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={applyToSeries}
                    onChange={(e) => setApplyToSeries(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-border"
                  />
                  <div>
                    <p className="text-sm font-medium">Aplicar na serie recorrente</p>
                    <p className="text-xs text-muted-foreground">
                      Atualiza este lancamento e as proximas ocorrencias da mesma recorrencia.
                    </p>
                  </div>
                </label>
              </div>
            )}

            <div className={`grid grid-cols-2 gap-3 ${form.isRecurring && !editingId ? "opacity-50" : ""}`}>
              <div>
                <label className="text-sm font-medium mb-1 block">Parcela Atual</label>
                <input
                  type="number"
                  min="1"
                  placeholder="Ex: 3"
                  value={form.currentInstallment}
                  onChange={(e) => setForm({ ...form, currentInstallment: e.target.value })}
                  disabled={form.isRecurring && !editingId}
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
                  disabled={form.isRecurring && !editingId}
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

      <Dialog
        open={!!deletingTransaction}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingTransaction(null);
            setDeleteScope("single");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusao</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-2">
            {deletingTransaction?.isRecurring
              ? "Escolha se deseja remover apenas este mês ou apagar toda a recorrência."
              : "Tem certeza que deseja excluir este lancamento? Esta acao nao pode ser desfeita."}
          </p>
          {deletingTransaction?.isRecurring && deletingTransaction.recurringId && (
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={() => setDeleteScope("single")}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  deleteScope === "single"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background hover:bg-muted/40"
                }`}
              >
                <p className="text-sm font-medium">Apenas este mês</p>
                <p className="text-xs text-muted-foreground">
                  Exclui somente esta ocorrência e mantém os demais meses da recorrência.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setDeleteScope("series")}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  deleteScope === "series"
                    ? "border-destructive bg-destructive/5"
                    : "border-border bg-background hover:bg-muted/40"
                }`}
              >
                <p className="text-sm font-medium">Excluir toda a recorrência</p>
                <p className="text-xs text-muted-foreground">
                  Remove o template recorrente e todas as ocorrências já geradas.
                </p>
              </button>
            </div>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setDeletingTransaction(null);
                setDeleteScope("single");
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deletingTransaction && handleDelete(deletingTransaction, deleteScope)
              }
            >
              Excluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
