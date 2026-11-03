'use client';

import { useState, type FormEvent } from 'react';

export default function LoginPage() {
  const [pwd, setPwd] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setErr('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      // 用整页跳转，确保新写入的 cookie 一定带上
      const next = new URLSearchParams(window.location.search).get('next') || '/chart';
      window.location.href = next.startsWith('/') ? next : '/chart';
    } catch (e: any) {
      setErr(e?.message || '登录失败');
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '96px 20px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>紫微斗数 · 开源排盘引擎（AI 增强版）</h1>
      <p style={{ fontSize: 14, opacity: 0.65, lineHeight: 1.7, marginBottom: 24 }}>
        本站设有访问口令，请输入后继续。
      </p>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          type="password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          placeholder="访问口令"
          autoFocus
          style={{
            padding: '11px 14px',
            borderRadius: 12,
            border: '1px solid rgba(150,150,150,0.4)',
            background: 'transparent',
            color: 'inherit',
            fontSize: 15,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '11px 16px',
            borderRadius: 12,
            border: 'none',
            background: loading ? 'rgba(150,150,150,0.25)' : 'linear-gradient(135deg,#9a6210,#c88020)',
            color: '#fff8e8',
            fontSize: 15,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '验证中…' : '进入'}
        </button>
      </form>
      {err && <p style={{ marginTop: 14, fontSize: 13, color: '#e06a6a' }}>⚠ {err}</p>}
      <p style={{ marginTop: 28, fontSize: 11, opacity: 0.4, lineHeight: 1.7 }}>
        口令由站点管理员设置；进入后会记住 30 天。命理解读属传统文化参考，不构成医疗、投资或法律意见。
      </p>
    </main>
  );
}
