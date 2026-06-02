"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";

type CreditCardOption = {
  id: string;
  name: string;
  bank: string;
};

type PluggyAccount = {
  id: string;
  pluggyAccountId: string;
  type: string;
  subtype: string | null;
  name: string;
  marketingName: string | null;
  number: string | null;
  owner: string | null;
  balance: number | null;
  creditLimit: number | null;
  linkedCreditCardId: string | null;
  linkedCreditCard: CreditCardOption | null;
};

type PluggyItem = {
  id: string;
  pluggyItemId: string;
  connectorName: string | null;
  status: string | null;
  executionStatus: string | null;
  lastSyncedAt: string | null;
  updatedAt: string;
  accounts: PluggyAccount[];
};

type PluggySyncLog = {
  id: string;
  status: string;
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAccounts: number;
  createdBills: number;
  createdTxs: number;
  updatedTxs: number;
};

type PluggyOverview = {
  configured: boolean;
  configuredItemIds: string[];
  items: PluggyItem[];
  accounts: PluggyAccount[];
  counts: { pending: number; imported: number; ignored: number };
  logs: PluggySyncLog[];
};

type PluggyCandidate = {
  id: string;
  date: string;
  description: string;
  amount: number;
  suggestedType: "income" | "expense" | null;
  suggestedCategory: string | null;
  suggestedCompetencia: string | null;
  duplicateReason: string | null;
  importedTransactionId: string | null;
  ignoredAt: string | null;
  account: PluggyAccount;
};

const statusLabels: Record<string, string> = {
  pending: "Pendentes",
  imported: "Importadas",
  ignored: "Ignoradas",
  all: "Todas",
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erro inesperado";
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? "Requisição falhou");
  }

  return data as T;
}

function TypeBadge({ type }: { type: string | null }) {
  if (!type) return <Badge variant="outline">sem tipo</Badge>;
  const normalized = type.toUpperCase();
  const label = normalized === "CREDIT" ? "Cartão" : normalized === "BANK" ? "Conta" : normalized;
  return <Badge variant={normalized === "CREDIT" ? "warning" : "outline"}>{label}</Badge>;
}

export default function PluggyIntegrationPage() {
  const [overview, setOverview] = useState<PluggyOverview | null>(null);
  const [cards, setCards] = useState<CreditCardOption[]>([]);
  const [candidates, setCandidates] = useState<PluggyCandidate[]>([]);
  const [itemId, setItemId] = useState("");
  const [status, setStatus] = useState<"pending" | "imported" | "ignored" | "all">("pending");
  const [ownership, setOwnership] = useState<"mine" | "partner" | "joint">("joint");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedTotal = useMemo(
    () =>
      candidates
        .filter((candidate) => selectedIds.includes(candidate.id))
        .reduce((sum, candidate) => sum + candidate.amount, 0),
    [candidates, selectedIds]
  );

  const loadOverview = useCallback(async () => {
    const data = await fetchJson<PluggyOverview>("/api/pluggy");
    setOverview(data);
  }, []);

  const loadCandidates = useCallback(async () => {
    const data = await fetchJson<PluggyCandidate[]>(`/api/pluggy/candidates?status=${status}&limit=120`);
    setCandidates(data);
    setSelectedIds((current) => current.filter((id) => data.some((candidate) => candidate.id === id)));
  }, [status]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [overviewData, cardsData] = await Promise.all([
        fetchJson<PluggyOverview>("/api/pluggy"),
        fetchJson<CreditCardOption[]>("/api/cards"),
      ]);
      setOverview(overviewData);
      setCards(cardsData);
      await loadCandidates();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [loadCandidates]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function runAction(name: string, action: () => Promise<void>) {
    setBusy(name);
    setError(null);
    setMessage(null);

    try {
      await action();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function registerItem() {
    await runAction("register", async () => {
      await fetchJson("/api/pluggy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      setItemId("");
      setMessage("Conexão cadastrada. Rode a sincronização para carregar contas, saldos e importar cartões vinculados.");
      await loadOverview();
    });
  }

  async function sync(itemIdToSync?: string) {
    await runAction(itemIdToSync ? `sync-${itemIdToSync}` : "sync-all", async () => {
      await fetchJson("/api/pluggy/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(itemIdToSync ? { itemId: itemIdToSync } : {}),
      });
      setMessage("Sincronização concluída. Cartões vinculados foram importados automaticamente; revise apenas as exceções pendentes.");
      await Promise.all([loadOverview(), loadCandidates()]);
    });
  }

  async function linkAccount(pluggyAccountId: string, linkedCreditCardId: string) {
    await runAction(`link-${pluggyAccountId}`, async () => {
      await fetchJson("/api/pluggy/accounts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pluggyAccountId, linkedCreditCardId: linkedCreditCardId || null }),
      });
      setMessage("Vínculo atualizado.");
      await Promise.all([loadOverview(), loadCandidates()]);
    });
  }

  async function importSelected() {
    if (selectedIds.length === 0) return;

    await runAction("import", async () => {
      await fetchJson("/api/pluggy/candidates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, ownership }),
      });
      setMessage(`${selectedIds.length} lançamento(s) importado(s).`);
      setSelectedIds([]);
      await Promise.all([loadOverview(), loadCandidates()]);
    });
  }

  async function ignoreSelected(ignored: boolean) {
    if (selectedIds.length === 0) return;

    await runAction("ignore", async () => {
      await fetchJson("/api/pluggy/candidates", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, ignored }),
      });
      setMessage(ignored ? "Transações ignoradas." : "Transações reabertas.");
      setSelectedIds([]);
      await Promise.all([loadOverview(), loadCandidates()]);
    });
  }

  function toggleCandidate(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    );
  }

  function toggleAllVisible() {
    const importableIds = candidates
      .filter((candidate) => !candidate.importedTransactionId && !candidate.ignoredAt)
      .map((candidate) => candidate.id);
    const allSelected = importableIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : importableIds);
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">Integrações</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Pluggy / Meu Pluggy</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Sincronize cartões de crédito direto no orçamento e mantenha saldos de contas atualizados. A fila fica para exceções que exigem revisão.
          </p>
        </div>
        <Button onClick={() => sync()} disabled={busy !== null || !overview?.configured}>
          {busy === "sync-all" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Sincronizar tudo
        </Button>
      </div>

      {(message || error) && (
        <div
          className={`flex items-start gap-2 rounded-2xl border p-4 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200"
          }`}
        >
          {error ? <AlertCircle className="mt-0.5 h-4 w-4" /> : <CheckCircle2 className="mt-0.5 h-4 w-4" />}
          <span>{error ?? message}</span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Status</CardDescription>
            <CardTitle className="flex items-center gap-2 text-base">
              {overview?.configured ? <ShieldCheck className="h-4 w-4 text-emerald-500" /> : <Unplug className="h-4 w-4 text-amber-500" />}
              {overview?.configured ? "Credenciais ok" : "Sem credenciais"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {overview?.configured ? "PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET carregados." : "Configure as envs para habilitar sync."}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Conexões</CardDescription>
            <CardTitle>{overview?.items.length ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Items locais registrados no banco.</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pendentes</CardDescription>
            <CardTitle>{overview?.counts.pending ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Exceções pendentes: sem vínculo, estorno ou item que exige revisão.</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Importadas</CardDescription>
            <CardTitle>{overview?.counts.imported ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Já viraram lançamentos no orçamento.</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cadastrar conexão</CardTitle>
          <CardDescription>
            Como o Pluggy não lista todos os items pela API, informe o itemId gerado no Meu Pluggy ou use PLUGGY_ITEM_IDS.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <input
            value={itemId}
            onChange={(event) => setItemId(event.target.value)}
            placeholder="itemId da conexão Pluggy"
            className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/30"
          />
          <Button onClick={registerItem} disabled={!itemId.trim() || busy !== null}>
            {busy === "register" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cadastrar
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Conexões e contas</CardTitle>
            <CardDescription>Vincule contas tipo cartão ao cartão cadastrado no FinControl. Depois disso, o sync importa novas despesas automaticamente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {overview?.items.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma conexão registrada ainda.</p>}

            {overview?.items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-border/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{item.connectorName ?? "Conexão Pluggy"}</h3>
                      <Badge variant="outline">{item.status ?? "sem status"}</Badge>
                      {item.executionStatus && <Badge variant="outline">{item.executionStatus}</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      itemId: {item.pluggyItemId} · última sync: {item.lastSyncedAt ? formatDate(item.lastSyncedAt) : "nunca"}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => sync(item.pluggyItemId)} disabled={busy !== null}>
                    {busy === `sync-${item.pluggyItemId}` && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Sincronizar
                  </Button>
                </div>
              </div>
            ))}

            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b border-border/70 bg-muted/35 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Conta</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Saldo / limite</th>
                    <th className="px-4 py-3">Cartão vinculado</th>
                  </tr>
                </thead>
                <tbody>
                  {overview?.accounts.map((account) => (
                    <tr key={account.id} className="border-b border-border/60 last:border-b-0">
                      <td className="px-4 py-3">
                        <p className="font-medium">{account.name}</p>
                        <p className="text-xs text-muted-foreground">{account.marketingName ?? account.number ?? account.owner ?? account.pluggyAccountId}</p>
                      </td>
                      <td className="px-4 py-3"><TypeBadge type={account.type} /></td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {account.balance !== null ? formatCurrency(account.balance) : "-"}
                        {account.creditLimit !== null ? ` / ${formatCurrency(account.creditLimit)}` : ""}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={account.linkedCreditCardId ?? ""}
                          onChange={(event) => linkAccount(account.pluggyAccountId, event.target.value)}
                          className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring/30"
                          disabled={busy !== null || account.type.toUpperCase() !== "CREDIT"}
                        >
                          <option value="">Sem vínculo</option>
                          {cards.map((card) => (
                            <option key={card.id} value={card.id}>{card.name} · {card.bank}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                  {overview?.accounts.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Sincronize uma conexão para carregar contas.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Histórico de sync</CardTitle>
            <CardDescription>Últimas execuções registradas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview?.logs.length === 0 && <p className="text-sm text-muted-foreground">Ainda não há sincronizações.</p>}
            {overview?.logs.map((log) => (
              <div key={log.id} className="rounded-2xl border border-border/70 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <Badge variant={log.status === "success" ? "success" : log.status === "error" ? "destructive" : "outline"}>{log.status}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(log.startedAt)}</span>
                </div>
                <p className="mt-2 text-muted-foreground">{log.message ?? "Sem mensagem"}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  contas +{log.createdAccounts} · faturas +{log.createdBills} · transações +{log.createdTxs} / atualizadas {log.updatedTxs}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>Fila de importação</CardTitle>
              <CardDescription>Cartões vinculados entram direto; esta fila mostra exceções, ignoradas e histórico importado.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as typeof status)}
                className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
              >
                {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <select
                value={ownership}
                onChange={(event) => setOwnership(event.target.value as typeof ownership)}
                className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
              >
                <option value="joint">Casal</option>
                <option value="mine">Meu</option>
                <option value="partner">Parceiro</option>
              </select>
              <Button variant="outline" size="sm" onClick={() => loadCandidates()} disabled={busy !== null}>Atualizar</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/25 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <span className="font-medium">{selectedIds.length}</span> selecionada(s) · total {formatCurrency(selectedTotal)}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={toggleAllVisible}>Selecionar visíveis</Button>
              <Button size="sm" onClick={importSelected} disabled={selectedIds.length === 0 || busy !== null}>
                {busy === "import" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Importar
              </Button>
              <Button variant="outline" size="sm" onClick={() => ignoreSelected(true)} disabled={selectedIds.length === 0 || busy !== null}>Ignorar</Button>
              {status === "ignored" && <Button variant="outline" size="sm" onClick={() => ignoreSelected(false)} disabled={selectedIds.length === 0 || busy !== null}>Reabrir</Button>}
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="border-b border-border/70 bg-muted/35 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Sel.</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Conta</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => {
                  const disabled = Boolean(candidate.importedTransactionId || candidate.ignoredAt);
                  return (
                    <tr key={candidate.id} className="border-b border-border/60 last:border-b-0">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(candidate.id)}
                          onChange={() => toggleCandidate(candidate.id)}
                          disabled={disabled && status !== "ignored"}
                        />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(candidate.date)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{candidate.description}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {candidate.duplicateReason && <Badge variant="warning">{candidate.duplicateReason}</Badge>}
                          {candidate.importedTransactionId && <Badge variant="success">importada</Badge>}
                          {candidate.ignoredAt && <Badge variant="outline">ignorada</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{candidate.account.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant={candidate.suggestedType === "income" ? "success" : "outline"}>{candidate.suggestedType === "income" ? "Receita" : "Despesa"}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {candidate.suggestedCategory ?? "Outros"} · {candidate.suggestedCompetencia ?? "sem competência"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(candidate.amount)}</td>
                    </tr>
                  );
                })}
                {candidates.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Nenhuma transação para o filtro atual.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
