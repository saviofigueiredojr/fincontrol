import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth-options";

export interface SessionUser {
  id: string;
  role: string;
  email?: string | null;
  name?: string | null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return null;
  }

  return {
    id: (session.user as { id: string }).id,
    role: (session.user as { role: string }).role,
    email: session.user.email,
    name: session.user.name,
  };
}
