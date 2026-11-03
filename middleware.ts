import { NextResponse, type NextRequest } from 'next/server';

/**
 * 访问口令网关（可选）
 *
 * - 未设置环境变量 ACCESS_PASSWORD 时：完全放行（本地/内网使用不受影响）
 * - 设置之后：所有页面与接口要求 cookie 里带着由该口令派生的令牌，否则跳 /login。
 *   这样无论站点以后通过 Cloudflare 隧道、Tailscale 还是 VPS 反代暴露到公网，
 *   都会先经过这道门，避免别人拿到链接就白用你的模型额度。
 *
 * cookie 里放的是口令的 SHA-256 派生值，不是口令本身；算法与 app/api/login/route.ts 保持一致。
 */
const COOKIE_NAME = 'ziwei_auth';

async function tokenFor(secret: string): Promise<string> {
  const data = new TextEncoder().encode(`ziwei-doushu::${secret}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function middleware(req: NextRequest) {
  const secret = process.env.ACCESS_PASSWORD;
  if (!secret) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === '/login' || pathname === '/api/login') return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (token && token === (await tokenFor(secret))) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // 静态资源不拦（拦了页面会没样式）
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
