import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 与 middleware.ts 保持同一算法：cookie 里只放口令的派生值 */
const COOKIE_NAME = 'ziwei_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

async function tokenFor(secret: string): Promise<string> {
  const data = new TextEncoder().encode(`ziwei-doushu::${secret}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function POST(req: Request) {
  const secret = process.env.ACCESS_PASSWORD;
  if (!secret) {
    return NextResponse.json({ ok: true, note: '未启用访问口令' });
  }

  let body: { password?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体不是 JSON' }, { status: 400 });
  }

  const given = (body.password || '').trim();
  if (!given) return NextResponse.json({ error: '请输入口令' }, { status: 400 });
  if (given !== secret) {
    await new Promise((r) => setTimeout(r, 600)); // 拖慢撞库
    return NextResponse.json({ error: '口令不正确' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, await tokenFor(secret), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
    // 本地 http 不加 secure；走 HTTPS（隧道/反代）时自动加
    secure: new URL(req.url).protocol === 'https:',
  });
  return res;
}
