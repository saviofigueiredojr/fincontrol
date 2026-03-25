"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CreditCard,
  Upload,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle,
  FileUp,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
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

interface CreditCardInfo {
  id: string;
  name: string;
  bank: string;
  closingDay: number;
  dueDay: number;
}

interface CardTransaction {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  currentInstallment?: number;
  totalInstallments?: number;
}

interface ActiveInstallment {
  id: string;
  description: string;
  currentInstallment: number;
  totalInstallments: number;
  monthlyAmount: number;
  remainingMonths: number;
  totalRemaining: number;
}

export default function CartoesPage() {
  const [competencia, setCompetencia] = useState(getCurrentCompetencia());
  const [cards, setCards] = useState<CreditCardInfo[]>([]);
  const [selectedCard, setSelectedCard] = useState<string>("");
  const [cardTransactions, setCardTransactions] = useState<CardTransaction[]>([]);
  const [installments, setInstallments] = useState<ActiveInstallment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTx, setLoadingTx] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Import modal state
  const [importOpen, setImportOpen] = useState(false);
  const [importCard, setImportCard] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importCompetencia, setImportCompetencia] = useState(getCurrentCompetencia());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<number | null>(null);

  const fetchCards = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cards");
      if (!res.ok) throw new Error("Erro ao carregar cartoes");
      const json = await res.json();
      setCards(json.cards ?? json);
      if (json.cards?.length > 0 || json.length > 0) {
        const cardList = json.cards ?? json;
        setSelectedCard(cardList[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCardTransactions = useCallback(async () => {
    if (!selectedCard) return;
    setLoadingTx(true);
    try {
      const res = await fetch(`/api/cards/${selectedCard}/transactions?competencia=${competencia}`);
      if (!res.ok) throw new Error("Erro ao carregar faturas");
      const json = await res.json();
      setCardTransactions(json.transactions ?? json);
    } catch {
      setCardTransactions([]);
    } finally {
      setLoadingTx(false);
    }
  }, [selectedCard, competencia]);

  const fetchInstallments = useCallback(async () => {
    try {
      const res = await fetch(`/api/cards/installments?competencia=${competencia}`);
      if (!res.ok) return;
      const json = await res.json();
      setInstallments(json.installments ?? json);
    } catch {
      setInstallments([]);
    }
  }, [competencia]);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  useEffect(() => {
    fetchCardTransactions();
    fetchInstallments();
  }, [fetchCardTransactions, fetchInstallments]);

  const handleImport = async () => {
    if (!importFile || !importCard) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      formData.append("cardId", importCard);
      formData.append("competencia", importCompetencia);

      const res = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Erro ao importar fatura");
      const json = await res.json();
      setImportResult(json.count ?? 0);
      fetchCardTransactions();
      fetchInstallments();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao importar");
    } finally {
      setImporting(false);
    }
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
        <Button onClick={fetchCards}>Tentar novamente</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Cartoes de Credito</h1>
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
          <Button onClick={() => { setImportOpen(true); setImportResult(null); setImportFile(null); }}>
            <Upload className="h-4 w-4 mr-1" /> Importar Fatura
          </Button>
        </div>
      </div>

      {/* Cards List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {cards.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="py-12 text-center text-muted-foreground">
              Nenhum cartao cadastrado
            </CardContent>
          </Card>
        ) : (
          cards.map((card) => (
            <Card
              key={card.id}
              className={`cursor-pointer transition-colors ${
                selectedCard === card.id ? "border-primary ring-1 ring-primary" : "hover:border-primary/50"
              }`}
              onClick={() => setSelectedCard(card.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CreditCard className="h-5 w-5 text-primary" />
                  <Badge variant="secondary">{card.bank}</Badge>
                </div>
                <CardTitle className="text-base">{card.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Fecha dia {card.closingDay}</span>
                  <span>Vence dia {card.dueDay}</span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Card Transactions Table */}
      {selectedCard && (
        <Card>
          <CardHeader>
            <CardTitle>
              Fatura - {cards.find((c) => c.id === selectedCard)?.name ?? "Cartao"} - {competenciaToLabel(competencia)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingTx ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">Data</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">Descricao</th>
                      <th className="text-left py-3 px-2 font-medium text-muted-foreground">Categoria</th>
                      <th className="text-right py-3 px-2 font-medium text-muted-foreground">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cardTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-muted-foreground">
                          Nenhuma transacao encontrada para esta fatura
                        </td>
                      </tr>
                    ) : (
                      cardTransactions.map((tx) => (
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
                          <td className="py-3 px-2 text-right font-medium text-red-600">
                            {formatCurrency(tx.amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {cardTransactions.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2">
                        <td colSpan={3} className="py-3 px-2 font-bold">Total</td>
                        <td className="py-3 px-2 text-right font-bold text-red-600">
                          {formatCurrency(cardTransactions.reduce((sum, tx) => sum + tx.amount, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Parcelas Ativas */}
      <Card>
        <CardHeader>
          <CardTitle>Parcelas Ativas</CardTitle>
          <CardDescription>Todas as compras parceladas em andamento</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium text-muted-foreground">Descricao</th>
                  <th className="text-center py-3 px-2 font-medium text-muted-foreground">Parcela</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Valor Mensal</th>
                  <th className="text-center py-3 px-2 font-medium text-muted-foreground">Meses Restantes</th>
                  <th className="text-right py-3 px-2 font-medium text-muted-foreground">Total Restante</th>
                </tr>
              </thead>
              <tbody>
                {installments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-muted-foreground">
                      Nenhuma parcela ativa
                    </td>
                  </tr>
                ) : (
                  installments.map((inst) => (
                    <tr key={inst.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 px-2">{inst.description}</td>
                      <td className="py-3 px-2 text-center">
                        <Badge variant="secondary">
                          {inst.currentInstallment}/{inst.totalInstallments}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-right font-medium">{formatCurrency(inst.monthlyAmount)}</td>
                      <td className="py-3 px-2 text-center">{inst.remainingMonths}</td>
                      <td className="py-3 px-2 text-right font-medium text-red-600">
                        {formatCurrency(inst.totalRemaining)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {installments.length > 0 && (
                <tfoot>
                  <tr className="border-t-2">
                    <td colSpan={2} className="py-3 px-2 font-bold">Total</td>
                    <td className="py-3 px-2 text-right font-bold">
                      {formatCurrency(installments.reduce((s, i) => s + i.monthlyAmount, 0))}
                    </td>
                    <td />
                    <td className="py-3 px-2 text-right font-bold text-red-600">
                      {formatCurrency(installments.reduce((s, i) => s + i.totalRemaining, 0))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Import Modal */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar Fatura</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Cartao</label>
              <select
                value={importCard}
                onChange={(e) => setImportCard(e.target.value)}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Selecione um cartao</option>
                {cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name} - {card.bank}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Arquivo (.csv ou .ofx)</label>
              <div className="relative">
                <input
                  type="file"
                  accept=".csv,.ofx"
                  onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm file:mr-4 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-primary file:text-primary-foreground cursor-pointer"
                />
              </div>
              {importFile && (
                <p className="text-xs text-muted-foreground mt-1">
                  <FileUp className="h-3 w-3 inline mr-1" />
                  {importFile.name}
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Competencia</label>
              <input
                type="month"
                value={importCompetencia}
                onChange={(e) => setImportCompetencia(e.target.value)}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {importResult !== null && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">{importResult} transacoes importadas com sucesso!</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button variant="outline">Fechar</Button>
              </DialogClose>
              <Button onClick={handleImport} disabled={importing || !importCard || !importFile}>
                {importing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Importar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
