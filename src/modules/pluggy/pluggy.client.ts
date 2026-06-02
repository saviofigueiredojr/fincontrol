import { env } from "@/lib/env";

const DEFAULT_BASE_URL = "https://api.pluggy.ai";
const API_KEY_TTL_MS = 110 * 60 * 1000;

let cachedApiKey: { value: string; expiresAt: number } | null = null;

export interface PluggyItemResponse {
  id: string;
  connector?: { id?: number; name?: string };
  connectorId?: number;
  connectorName?: string;
  status?: string;
  executionStatus?: string;
  error?: { code?: string; message?: string } | null;
  lastUpdatedAt?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  [key: string]: unknown;
}

export interface PluggyAccountResponse {
  id: string;
  type: string;
  subtype?: string | null;
  name?: string | null;
  marketingName?: string | null;
  number?: string | null;
  owner?: string | null;
  currencyCode?: string | null;
  balance?: number | null;
  creditData?: { creditLimit?: number | null; [key: string]: unknown } | null;
  [key: string]: unknown;
}

export interface PluggyBillResponse {
  id: string;
  dueDate?: string | null;
  closeDate?: string | null;
  totalAmount?: number | null;
  minimumPayment?: number | null;
  status?: string | null;
  [key: string]: unknown;
}

export interface PluggyTransactionResponse {
  id: string;
  date: string;
  description: string;
  amount: number;
  type?: string | null;
  status?: string | null;
  category?: string | { id?: string; description?: string; name?: string } | null;
  categoryId?: string | null;
  merchant?: { name?: string | null } | null;
  merchantName?: string | null;
  paymentData?: unknown;
  creditCardMetadata?: unknown;
  [key: string]: unknown;
}

interface PluggyListResponse<T> {
  results?: T[];
  accounts?: T[];
  transactions?: T[];
  bills?: T[];
  next?: string | null;
}

export function isPluggyConfigured() {
  return Boolean(env.PLUGGY_CLIENT_ID && env.PLUGGY_CLIENT_SECRET);
}

function getBaseUrl() {
  return (env.PLUGGY_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
}

async function requestJson<T>(path: string, init: RequestInit = {}, apiKey?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");

  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  if (apiKey) {
    headers.set("X-API-KEY", apiKey);
  }

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Pluggy API ${response.status}: ${body || response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export async function getPluggyApiKey() {
  if (!env.PLUGGY_CLIENT_ID || !env.PLUGGY_CLIENT_SECRET) {
    throw new Error("Credenciais Pluggy não configuradas");
  }

  if (cachedApiKey && cachedApiKey.expiresAt > Date.now()) {
    return cachedApiKey.value;
  }

  const response = await requestJson<{ apiKey: string }>("/auth", {
    method: "POST",
    body: JSON.stringify({
      clientId: env.PLUGGY_CLIENT_ID,
      clientSecret: env.PLUGGY_CLIENT_SECRET,
    }),
  });

  cachedApiKey = {
    value: response.apiKey,
    expiresAt: Date.now() + API_KEY_TTL_MS,
  };

  return response.apiKey;
}

export async function getPluggyItem(itemId: string) {
  const apiKey = await getPluggyApiKey();
  return requestJson<PluggyItemResponse>(`/items/${encodeURIComponent(itemId)}`, {}, apiKey);
}

export async function updatePluggyItem(itemId: string) {
  const apiKey = await getPluggyApiKey();
  return requestJson<PluggyItemResponse>(`/items/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    body: JSON.stringify({}),
  }, apiKey);
}

export async function listPluggyAccounts(itemId: string) {
  const apiKey = await getPluggyApiKey();
  const response = await requestJson<PluggyListResponse<PluggyAccountResponse>>(
    `/accounts?itemId=${encodeURIComponent(itemId)}`,
    {},
    apiKey
  );

  return response.results ?? response.accounts ?? [];
}

export async function listPluggyBills(accountId: string) {
  const apiKey = await getPluggyApiKey();
  const response = await requestJson<PluggyListResponse<PluggyBillResponse>>(
    `/bills?accountId=${encodeURIComponent(accountId)}`,
    {},
    apiKey
  );

  return response.results ?? response.bills ?? [];
}

export async function listPluggyTransactions(
  accountId: string,
  options: { dateFrom?: string; dateTo?: string; createdAtFrom?: string; ids?: string[] } = {}
) {
  const apiKey = await getPluggyApiKey();
  const transactions: PluggyTransactionResponse[] = [];
  let after: string | null | undefined;

  do {
    const params = new URLSearchParams({ accountId });
    if (options.dateFrom) params.set("dateFrom", options.dateFrom);
    if (options.dateTo) params.set("dateTo", options.dateTo);
    if (options.createdAtFrom) params.set("createdAtFrom", options.createdAtFrom);
    if (options.ids?.length) params.set("ids", options.ids.join(","));
    if (after) params.set("after", after);

    const response = await requestJson<PluggyListResponse<PluggyTransactionResponse>>(
      `/v2/transactions?${params.toString()}`,
      {},
      apiKey
    );

    transactions.push(...(response.results ?? response.transactions ?? []));
    after = response.next;
  } while (after);

  return transactions;
}
