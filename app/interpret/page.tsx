'use client';

import { useState } from 'react';
import BirthForm from '@/components/BirthForm';
import ChartBoard from '@/components/ChartBoard';
import { generateChart } from '@/lib/ziwei/algorithm';
import type { BirthInfo, ZiweiChart, Palace } from '@/lib/ziwei/types';

type Msg = { role: 'user' | 'assistant'; content: string };

const QUICK = ['整体解读', '今年（2026）运势', '事业与财运', '感情婚姻', '健康要注意什么'];

export default function InterpretPage() {
  const [chart, setChart] = useState<ZiweiChart | null>(null);
  const [focusPalace, setFocusPalace] = useState<Palace | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function ask(question: string) {
    if (!chart || loading) return;
    const q = question.trim();
    if (!q) return;
    setErr('');
    setLoading(true);
    const history: Msg[] = [...msgs, { role: 'user', content: q }];
    setMsgs(history);
    setInput('');
    try {
      const res = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chart, messages: history, focusPalace: focusPalace?.name ?? null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setMsgs([...history, { role: 'assistant', content: data.content }]);
    } catch (e: any) {
      setErr(e?.message || '请求失败');
      setMsgs(history);
    } finally {
      setLoading(false);
    }
  }

  if (!chart) {
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>紫微斗数 · AI 解读</h1>
        <p style={{ color: '#888', marginBottom: 32, fontSize: 14, lineHeight: 1.7 }}>
          输入出生信息 → 起盘 → 由本站自建的 <code>/api/interpret</code> 生成解读，可连续追问。
          <br />
          （排盘在浏览器本地完成；只有解读文本会发到本机内网的模型服务。）
        </p>
        <BirthForm onSubmit={(info: BirthInfo) => setChart(generateChart(info))} />
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => {
            setChart(null);
            setFocusPalace(null);
            setMsgs([]);
            setErr('');
          }}
          style={{ padding: '6px 14px', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 8, background: 'transparent', color: 'inherit' }}
        >
          ← 重新起盘
        </button>
        <span style={{ fontSize: 12, opacity: 0.6, alignSelf: 'center' }}>
          {chart.birthInfo.name || '未命名'} · {chart.birthInfo.year}-{String(chart.birthInfo.month).padStart(2, '0')}-{String(chart.birthInfo.day).padStart(2, '0')} ·{' '}
          {['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'][chart.birthInfo.hour]}时 ·{' '}
          {chart.birthInfo.gender === 'male' ? '男' : '女'} · {chart.wuxingJuName}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,440px)', gap: 20, alignItems: 'start' }}>
        <div>
          <ChartBoard chart={chart} onPalaceSelect={setFocusPalace} />
        </div>

        <aside style={{ border: '1px solid rgba(150,150,150,0.35)', borderRadius: 16, padding: 16, minHeight: 480 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <strong style={{ fontSize: 14 }}>✦ AI 解读</strong>
            <span style={{ fontSize: 11, opacity: 0.55 }}>倪海厦体系 · 本站自建接口</span>
          </div>

          {msgs.length === 0 && (
            <>
              <p style={{ fontSize: 13, lineHeight: 1.7, opacity: 0.8, marginBottom: 12 }}>
                命盘已起好。点下面任一问题开始；解读会结合这张盘的十二宫、四化与当前大限。
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {QUICK.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => ask(q === '整体解读' ? '请为我看这份命盘，给一份整体解读。' : q)}
                    style={{ padding: '7px 12px', borderRadius: 999, border: '1px solid rgba(150,150,150,0.4)', background: 'transparent', color: 'inherit', fontSize: 12, cursor: 'pointer' }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </>
          )}

          <div style={{ marginTop: msgs.length ? 8 : 16 }}>
            {msgs.map((m, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 12,
                  padding: '10px 12px',
                  borderRadius: 12,
                  background: m.role === 'user' ? 'rgba(90,140,220,0.12)' : 'rgba(150,150,150,0.08)',
                  fontSize: 13,
                  lineHeight: 1.8,
                  whiteSpace: 'pre-wrap',
                }}
              >
                <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 4 }}>{m.role === 'user' ? '你' : 'AI 解读'}</div>
                {m.content}
              </div>
            ))}
            {loading && <div style={{ fontSize: 12, opacity: 0.6 }}>正在解读，通常 20–60 秒…</div>}
          </div>

          {err && (
            <div style={{ margin: '8px 0', padding: '8px 10px', borderRadius: 10, background: 'rgba(220,80,80,0.12)', fontSize: 12, lineHeight: 1.6 }}>
              ⚠ {err}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  ask(input);
                }
              }}
              placeholder={focusPalace ? `追问（会结合你点选的${focusPalace.name}）…` : '继续追问…'}
              style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(150,150,150,0.4)', background: 'transparent', color: 'inherit', fontSize: 13, outline: 'none' }}
            />
            <button
              type="button"
              onClick={() => ask(input)}
              disabled={loading}
              style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: loading ? 'rgba(150,150,150,0.25)' : 'linear-gradient(135deg,#9a6210,#c88020)', color: '#fff8e8', fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              追问
            </button>
          </div>
          <p style={{ fontSize: 10, opacity: 0.45, marginTop: 10, lineHeight: 1.6 }}>
            命理解读属传统文化参考，不构成医疗、投资或法律意见；健康请以体检与医生判断为准。
          </p>
        </aside>
      </div>
    </main>
  );
}
