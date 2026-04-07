import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const DUMMY_HASH = "$2a$10$KzXQ11E068aChyrwtTD3cOlRjIEFASuROtzY5I.lXwT7GbrnJq/Ji";
const MAX_FAILED_ATTEMPTS = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const BLOCK_DURATION_MS = 30 * 60 * 1000;

type AuthHeaders = Record<string, string | string[] | undefined>;

interface AuthRequestLike {
  headers?: AuthHeaders;
}

interface CredentialsInput {
  email?: string | null;
  password?: string | null;
}

interface AuthorizedUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

function normalizeIpCandidate(value: string): string | null {
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === "unknown") {
    return null;
  }

  return normalized;
}

function getHeaderValue(
  headers: AuthHeaders,
  headerName: string
): string | undefined {
  const rawValue = headers[headerName];
  return Array.isArray(rawValue) ? rawValue[0] : rawValue;
}

export function extractClientIp(req?: AuthRequestLike): string {
  if (!req?.headers) {
    return "unknown";
  }

  const trustedHeaders = [
    "x-vercel-forwarded-for",
    "x-real-ip",
  ] as const;

  for (const headerName of trustedHeaders) {
    const trustedValue = getHeaderValue(req.headers, headerName);
    if (typeof trustedValue === "string") {
      const normalized = normalizeIpCandidate(trustedValue);
      if (normalized) {
        return normalized;
      }
    }
  }

  const forwardedValue = getHeaderValue(req.headers, "x-forwarded-for");
  if (typeof forwardedValue === "string") {
    const firstIp = forwardedValue
      .split(",")
      .map((value) => normalizeIpCandidate(value))
      .find((value): value is string => value !== null);

    if (firstIp) {
      return firstIp;
    }
  }

  return "unknown";
}

async function recordLoginAttempt(email: string, ip: string, success: boolean) {
  await prisma.loginAttempt.create({
    data: {
      email: email.toLowerCase(),
      ip,
      success,
    },
  });
}

async function getBlockingClusterExpiry(email: string, ip: string): Promise<Date | null> {
  const now = new Date();
  const failureWindowStart = new Date(now.getTime() - FAILURE_WINDOW_MS);
  const recentFailures = await prisma.loginAttempt.findMany({
    where: {
      email: email.toLowerCase(),
      ip,
      success: false,
      createdAt: {
        gte: failureWindowStart,
      },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_FAILED_ATTEMPTS,
  });

  if (recentFailures.length < MAX_FAILED_ATTEMPTS) {
    return null;
  }

  const latestAttempt = recentFailures[0];

  return new Date(latestAttempt.createdAt.getTime() + BLOCK_DURATION_MS);
}

async function checkRateLimit(email: string, ip: string) {
  const blockExpiry = await getBlockingClusterExpiry(email, ip);

  if (!blockExpiry) {
    return { allowed: true as const };
  }

  const now = new Date();
  if (now >= blockExpiry) {
    return { allowed: true as const };
  }

  return {
    allowed: false as const,
    retryAfter: Math.ceil((blockExpiry.getTime() - now.getTime()) / 1000),
  };
}

function normalizeCredentials(credentials?: CredentialsInput | null) {
  const email = credentials?.email?.trim().toLowerCase();
  const password = credentials?.password ?? "";

  if (!email || !password) {
    return null;
  }

  return { email, password };
}

export async function authorizeCredentials(
  credentials?: CredentialsInput | null,
  req?: AuthRequestLike
): Promise<AuthorizedUser | null> {
  const normalizedCredentials = normalizeCredentials(credentials);

  if (!normalizedCredentials) {
    return null;
  }

  const ip = extractClientIp(req);
  const rateCheck = await checkRateLimit(normalizedCredentials.email, ip);
  if (!rateCheck.allowed) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedCredentials.email },
  });

  if (!user) {
    await bcrypt.compare(normalizedCredentials.password, DUMMY_HASH);
    await recordLoginAttempt(normalizedCredentials.email, ip, false);
    return null;
  }

  const isValid = await bcrypt.compare(
    normalizedCredentials.password,
    user.passwordHash
  );

  if (!isValid) {
    await recordLoginAttempt(normalizedCredentials.email, ip, false);
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}
