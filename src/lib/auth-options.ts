import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

const loginAttempts = new Map<string, { count: number; blockedUntil: number }>();

function checkRateLimit(email: string): { allowed: boolean; retryAfter?: number } {
  const key = email.toLowerCase();
  const record = loginAttempts.get(key);
  const now = Date.now();

  if (record) {
    if (record.blockedUntil > now) {
      return { allowed: false, retryAfter: Math.ceil((record.blockedUntil - now) / 1000) };
    }
    if (record.count >= 5) {
      record.blockedUntil = now + 30 * 60 * 1000; // 30 min block
      return { allowed: false, retryAfter: 1800 };
    }
  }

  return { allowed: true };
}

function recordAttempt(email: string, success: boolean) {
  const key = email.toLowerCase();
  if (success) {
    loginAttempts.delete(key);
    return;
  }
  const record = loginAttempts.get(key) || { count: 0, blockedUntil: 0 };
  record.count += 1;
  loginAttempts.set(key, record);
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const rateCheck = checkRateLimit(credentials.email);
        if (!rateCheck.allowed) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) {
          recordAttempt(credentials.email, false);
          return null;
        }

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);

        if (!isValid) {
          recordAttempt(credentials.email, false);
          return null;
        }

        recordAttempt(credentials.email, true);
        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id: string }).id = token.id as string;
        (session.user as { role: string }).role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
};
