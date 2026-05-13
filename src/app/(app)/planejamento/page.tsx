"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Download,
  FileText,
  Loader2,
  Save,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface PlanningDocument {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}

type ViewMode = "edit" | "preview";

function renderMarkdownPreview(content: string) {
  const listItems: string[] = [];
  const nodes: React.ReactNode[] = [];

  const flushList = (key: string) => {
    if (!listItems.length) return;
    nodes.push(
      <ul key={key} className="my-3 space-y-2 pl-5 text-sm leading-6">
        {listItems.map((item, index) => (
          <li key={`${key}-${index}`} className="list-disc">
            {item}
          </li>
        ))}
      </ul>
    );
    listItems.splice(0, listItems.length);
  };

  content.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    const key = `line-${index}`;

    if (trimmed.startsWith("- ")) {
      listItems.push(trimmed.slice(2));
      return;
    }

    flushList(`${key}-list`);

    if (!trimmed) {
      nodes.push(<div key={key} className="h-3" />);
      return;
    }

    if (trimmed.startsWith("# ")) {
      nodes.push(
        <h1 key={key} className="mb-4 mt-2 font-display text-3xl font-semibold tracking-tight">
          {trimmed.slice(2)}
        </h1>
      );
      return;
    }

    if (trimmed.startsWith("## ")) {
      nodes.push(
        <h2 key={key} className="mb-3 mt-6 text-xl font-semibold tracking-tight">
          {trimmed.slice(3)}
        </h2>
      );
      return;
    }

    if (trimmed.startsWith("### ")) {
      nodes.push(
        <h3 key={key} className="mb-2 mt-5 text-base font-semibold">
          {trimmed.slice(4)}
        </h3>
      );
      return;
    }

    nodes.push(
      <p key={key} className="my-2 text-sm leading-7 text-muted-foreground">
        {line}
      </p>
    );
  });

  flushList("tail-list");
  return nodes;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sem data";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export default function PlanejamentoPage() {
  const [planningDoc, setPlanningDoc] = useState<PlanningDocument | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mode, setMode] = useState<ViewMode>("edit");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isDirty = useMemo(() => {
    if (!planningDoc) return false;
    return planningDoc.title !== title || planningDoc.content !== content;
  }, [content, planningDoc, title]);

  const fetchDocument = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/planning", { cache: "no-store" });
      if (!response.ok) throw new Error("Erro ao carregar planejamento");
      const payload = (await response.json()) as PlanningDocument;
      setPlanningDoc(payload);
      setTitle(payload.title);
      setContent(payload.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocument();
  }, [fetchDocument]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/planning", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Erro ao salvar planejamento");
      }

      setPlanningDoc(payload);
      setTitle(payload.title);
      setContent(payload.content);
      setMessage("Planejamento salvo no banco.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !planningDoc) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-destructive">{error}</p>
        <Button onClick={fetchDocument}>Tentar novamente</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div className="space-y-2">
          <Badge variant="outline" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Rascunho vivo
          </Badge>
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              Planejamento
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Um documento editável, salvo no Supabase e legível para humanos e
              agents. Use como memória de decisões, cenários e próximos passos.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={mode === "edit" ? "default" : "outline"}
            onClick={() => setMode("edit")}
          >
            Editar
          </Button>
          <Button
            variant={mode === "preview" ? "default" : "outline"}
            onClick={() => setMode("preview")}
          >
            Visualizar
          </Button>
          <a
            className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
            href="/api/planning/docx"
          >
            <Download className="h-4 w-4" />
            DOCX
          </a>
          <Button onClick={handleSave} disabled={saving || !isDirty} className="gap-2">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar
          </Button>
        </div>
      </div>

      {(error || message || isDirty) && (
        <div
          className={cn(
            "rounded-2xl border px-4 py-3 text-sm",
            error
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/35 dark:bg-red-950/25 dark:text-red-300"
              : isDirty
              ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/35 dark:bg-amber-950/25 dark:text-amber-300"
              : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/35 dark:bg-emerald-950/25 dark:text-emerald-300"
          )}
        >
          {error ?? (isDirty ? "Há alterações ainda não salvas." : message)}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border/60">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Documento de planejamento
            </CardTitle>
            <CardDescription>
              Escreva em Markdown simples: títulos com #, seções com ## e listas
              iniciadas por hífen.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {mode === "edit" ? (
              <div className="space-y-4 p-5">
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Título</span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="w-full rounded-xl border border-border/80 bg-background px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                    placeholder="Planejamento financeiro"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Conteúdo</span>
                  <textarea
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    className="min-h-[560px] w-full resize-y rounded-xl border border-border/80 bg-background px-4 py-3 font-mono text-sm leading-6 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                    placeholder="# Planejamento financeiro"
                  />
                </label>
              </div>
            ) : (
              <article className="min-h-[640px] bg-background/55 p-6">
                <div className="mx-auto max-w-3xl rounded-2xl border border-border/70 bg-card px-6 py-7 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.7)]">
                  {renderMarkdownPreview(content)}
                </div>
              </article>
            )}
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Como usar</CardTitle>
              <CardDescription>
                Pense nele como um AGENT.md financeiro da casa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>1. Registre premissas e decisões antes de mexer no orçamento.</p>
              <p>2. Salve o documento para persistir no Supabase.</p>
              <p>3. Baixe o DOCX quando quiser compartilhar uma versão limpa.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Origem</span>
                <Badge variant="secondary">Banco</Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Formato</span>
                <Badge variant="outline">Markdown + DOCX</Badge>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground">Última atualização</span>
                <p className="font-medium">
                  {planningDoc ? formatUpdatedAt(planningDoc.updatedAt) : "sem data"}
                </p>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
