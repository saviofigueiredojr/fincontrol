import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/lancamentos/:path*",
    "/cartoes/:path*",
    "/divisao/:path*",
    "/metas/:path*",
    "/fechar-mes/:path*",
    "/creditos/:path*",
    "/api/transactions/:path*",
    "/api/cards/:path*",
    "/api/goals/:path*",
    "/api/months/:path*",
    "/api/settings/:path*",
    "/api/dashboard/:path*",
    "/api/import/:path*",
  ],
};
