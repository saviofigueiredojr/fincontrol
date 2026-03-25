import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const DUMMY_HASH = "$2a$10$dummyhashfortimingsafetydummyhashfortixx";
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
  return normalized.length > 0 ? normalized : null;
}

export function extractClientIp(req?: AuthRequestLike): string {
  if (!req?.headers) {
    return "unknown";
  }

  const forwarded = req.headers["x-forwarded-for"];
  const realIp = req.headers["x-real-ip"];

  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof forwardedValue === "string") {
    const firstIp = forwardedValue
      .split(",")
      .map((value) => normalizeIpCandidate(value))
      .find((value): value is string => value !== null);

    if (firstIp) {
      return firstIp;
    }
  }

  const realIpValue = Array.isArray(realIp) ? realIp[0] : realIp;
  if (typeof realIpValue === "string") {
    const normalized = normalizeIpCandidate(realIpValue);
    if (normalized) {
      return normalized;
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
  const recentFailures = await prisma.loginAttempt.findMany({
    where: {
      email: email.toLowerCase(),
      ip,
      success: false,
    },
    orderBy: { createdAt: "desc" },
    take: MAX_FAILED_ATTEMPTS,
  });

  if (recentFailures.length < MAX_FAILED_ATTEMPTS) {
    return null;
  }

  const latestAttempt = recentFailures[0];
  const oldestAttempt = recentFailures[MAX_FAILED_ATTEMPTS - 1];

  if (latestAttempt.createdAt.getTime() - oldestAttempt.createdAt.getTime() > FAILURE_WINDOW_MS) {
    return null;
  }

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

  await recordLoginAttempt(normalizedCredentials.email, ip, true);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}
