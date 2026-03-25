import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: [
    /*
     * Protege TUDO exceto:
     * - /login
     * - /api/auth (NextAuth)
     * - /_next/static, /_next/image (assets do Next.js)
     * - /favicon.ico
     * - Arquivos com extensão (fonts, imagens, scripts estáticos, etc.)
     */
    "/((?!login|api/auth|_next/static|_next/image|favicon\\.ico|.*\\..*).*)",
  ],
};
