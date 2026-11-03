'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ZiweiChart, Palace } from '@/lib/ziwei/types';
import { chartKey, loadReadings, saveDatasetReading, saveAiReading, saveThread, type ThreadMsg } from '@/lib/history';

type Mode = 'dataset' | 'ai';

const TOPICS: { key: string; label: string }[] = [
  { key: 'overview', label: '命格' },
  { key: 'personality', label: '性格' },
  { key: 'love', label: '感情' },
  { key: 'career', label: '事业' },
  { key: 'wealth', label: '财运' },
  { key: 'health', label: '健康' },
  { key: 'family', label: '兄弟' },
  { key: 'children', label: '子女' },
  { key: 'move', label: '迁移' },
  { key: 'friends', label: '人际' },
  { key: 'home', label: '田宅' },
  { key: 'spirit', label: '福德' },
  { key: 'parents', label: '父母' },
];

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

function topicQuestion(key: string): string {
  const label = TOPICS.find((t) => t.key === key)?.label || '整体';
  return key === 'overview'
    ? '请为我看这份命盘，给一份整体解读。'
    : `请专门讲这张盘的【${label}】这一项：结合相关宫位的星曜、亮度和四化讲清它的特点与走势，并给出两三条具体建议。不要重复其他维度。`;
}

export default function AiPanel({ chart, selectedPalace }: { chart: ZiweiChart; selectedPalace?: Palace | null }) {
  const [mode, setMode] = useState<Mode>('dataset');
  const [topic, setTopic] = useState<string>('overview');
  const [dims, setDims] = useState<Record<string, string> | null>(null);
  const [matched, setMatched] = useState<string>('');
  const [threads, setThreads] = useState<Record<string, ThreadMsg[]>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const b = chart.birthInfo;
  const key = chartKey(b);
  const query = `y=${b.year}&m=${b.month}&d=${b.day}&h=${b.hour}&g=${b.gender}`;

  // 换盘：捞缓存（数据集 13 维 + 各主题对话）
  useEffect(() => {
    const saved = loadReadings(b);
    setDims(saved.dataset?.dims ?? null);
    setMatched(saved.dataset ? saved.dataset.key : '');
    const seeded: Record<string, ThreadMsg[]> = {};
    if (saved.threads) {
      for (const [k, v] of Object.entries(saved.threads)) {
        if (Array.isArray(v) && v.length) seeded[k] = v;
      }
    }
    // 兼容旧缓存：只有最后一条回答、没有对话记录的主题
    if (saved.ai) {
      for (const [k, text] of Object.entries(saved.ai)) {
        if (!seeded[k] && text) seeded[k] = [{ role: 'user', content: topicQuestion(k) }, { role: 'assistant', content: text }];
      }
    }
    setThreads(seeded);
    setTopic('overview');
    setErr('');
    setInput('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [threads, topic, loading]);

  /* ---------------- 数据集查表 ---------------- */

  const loadDataset = useCallback(
    async (force = false) => {
      if (!force && (dims || loading)) return;
      setLoading(true);
      setErr('');
      try {
        const res = await fetch(`/api/dataset?${query}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        setDims(data.dims || {});
        setMatched(typeof data.key === 'string' ? data.key : '');
        saveDatasetReading(b, { key: data.key, dims: data.dims || {} });
      } catch (e: any) {
        setErr(e?.message || '查表失败');
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dims, loading, query],
  );

  /* ---------------- AI 对话 ---------------- */

  const ask = useCallback(
    async (topicKey: string, msgs: ThreadMsg[]) => {
      setThreads((prev) => ({ ...prev, [topicKey]: msgs }));
      saveThread(b, topicKey, msgs);
      setLoading(true);
      setErr('');
      try {
        const res = await fetch('/api/interpret', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chart,
            messages: msgs,
            focusPalace: selectedPalace?.name ?? null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        const next: ThreadMsg[] = [...msgs, { role: 'assistant', content: data.content }];
        setThreads((prev) => ({ ...prev, [topicKey]: next }));
        saveThread(b, topicKey, next);
        saveAiReading(b, topicKey, data.content);
      } catch (e: any) {
        setErr(e?.message || '生成失败');
        // 失败时把这次的提问撤回，避免留下孤零零的 user 消息
        setThreads((prev) => ({ ...prev, [topicKey]: msgs.slice(0, -1) }));
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chart, selectedPalace],
  );

  const startTopic = useCallback(
    (topicKey: string, force = false) => {
      const existing = threads[topicKey];
      if (existing?.length && !force) return;
      const first: ThreadMsg[] = [{ role: 'user', content: topicQuestion(topicKey) }];
      void ask(topicKey, first);
    },
    [ask, threads],
  );

  const followUp = () => {
    const text = input.trim();
    if (!text || loading) return;
    const base = threads[topic] || [];
    if (!base.length) {
      // 还没有初始讲解：把追问当成开场
      setInput('');
      void ask(topic, [{ role: 'user', content: topicQuestion(topic) }, { role: 'user', content: text }]);
      return;
    }
    setInput('');
    void ask(topic, [...base, { role: 'user', content: text }]);
  };

  // 切到数据集模式且没缓存 → 自动查表；切到 AI 模式且该主题没对话 → 自动开讲
  useEffect(() => {
    if (mode === 'dataset' && !dims) void loadDataset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, dims, query]);

  const onTopic = (k: string) => {
    const prev = topic;
    setTopic(k);
    setErr('');
    setInput('');
    if (mode === 'dataset') void loadDataset();
    else if (prev !== k) {
      // 有缓存就直接显示，没有就自动开讲
      if (!threads[k]?.length) startTopic(k);
    }
  };

  const refresh = () => {
    if (mode === 'dataset') void loadDataset(true);
    else startTopic(topic, true);
  };

  const thread = threads[topic] || [];
  const datasetBody = dims?.[topic];

  return (
    <aside style={{ border: '1px solid rgba(150,150,150,0.3)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column' }}>
      {/* 模式切换 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {([
          ['dataset', '原版解读 · 本地数据'],
          ['ai', 'AI 讲解 · DeepSeek'],
        ] as [Mode, string][]).map(([m, label]) => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setErr('');
                if (m === 'ai' && !threads[topic]?.length) startTopic(topic);
              }}
              style={{
                flex: 1,
                padding: '9px 10px',
                borderRadius: 12,
                fontSize: 12,
                cursor: 'pointer',
                border: `1px solid ${active ? 'rgba(212,168,67,0.7)' : 'rgba(150,150,150,0.35)'}`,
                background: active ? 'rgba(212,168,67,0.12)' : 'transparent',
                color: 'inherit',
                fontWeight: active ? 600 : 400,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* 点选宫位信息 */}
      {selectedPalace && (
        <div
          style={{
            border: '1px solid rgba(212,168,67,0.35)',
            background: 'rgba(212,168,67,0.07)',
            borderRadius: 12,
            padding: '8px 11px',
            fontSize: 12,
            lineHeight: 1.7,
            marginBottom: 10,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            当前点选：{selectedPalace.name}（{BRANCHES[selectedPalace.branch]}宫）
            {selectedPalace.daXianAge ? ` · 大限 ${selectedPalace.daXianAge[0]}–${selectedPalace.daXianAge[1]} 岁` : ''}
          </div>
          <div style={{ opacity: 0.85 }}>
            主星：
            {selectedPalace.stars.filter((s) => s.type === 'major').map((s) => `${s.name}${s.brightnessRaw ? `[${s.brightnessRaw}]` : ''}${s.siHua ? `化${s.siHua}` : ''}`).join('、') || '无（空宫）'}
            {selectedPalace.borrowedStars?.length ? `（借对宫 ${selectedPalace.borrowedStars.join('、')}）` : ''}
          </div>
          <div style={{ opacity: 0.7 }}>
            辅煞：
            {selectedPalace.stars.filter((s) => s.type !== 'major').map((s) => `${s.name}${s.siHua ? `化${s.siHua}` : ''}`).join('、') || '无'}
          </div>
          <div style={{ opacity: 0.55, marginTop: 2 }}>AI 提问会带上这个宫位。</div>
        </div>
      )}

      {/* 主题按钮：常驻，换主题不用重新输入 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {TOPICS.map((t) => {
          const active = topic === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onTopic(t.key)}
              style={{
                padding: '6px 11px',
                borderRadius: 999,
                fontSize: 12,
                cursor: 'pointer',
                border: `1px solid ${active ? 'rgba(212,168,67,0.8)' : 'rgba(150,150,150,0.35)'}`,
                background: active ? 'rgba(212,168,67,0.15)' : 'transparent',
                color: 'inherit',
                fontWeight: active ? 600 : 400,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, opacity: 0.55 }}>
          {mode === 'dataset'
            ? matched
              ? `已匹配：${matched}`
              : `查表键：${key}（数据集 v4.0，未调 AI）`
            : `AI 讲解 · 可继续追问${selectedPalace ? ` · 带宫位「${selectedPalace.name}」` : ''}`}
        </span>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          style={{ fontSize: 11, padding: '3px 9px', borderRadius: 8, border: '1px solid rgba(150,150,150,0.4)', background: 'transparent', color: 'inherit', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 0.8 }}
        >
          {mode === 'dataset' ? '重新查表' : '重新生成'}
        </button>
      </div>

      {err && (
        <div style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(220,80,80,0.12)', fontSize: 12, lineHeight: 1.6, marginBottom: 10 }}>
          ⚠ {err}
        </div>
      )}

      {/* 内容区 */}
      <div ref={scrollRef} style={{ maxHeight: 560, overflowY: 'auto', fontSize: 13, lineHeight: 1.85 }}>
        {mode === 'dataset' ? (
          <div style={{ whiteSpace: 'pre-wrap' }}>
            {loading && <div style={{ opacity: 0.6 }}>正在查表（首次查某一年会先下载约 2 MB 数据）…</div>}
            {!loading && datasetBody ? datasetBody : null}
            {!loading && !datasetBody && !err && (
              <div style={{ opacity: 0.55, fontSize: 12 }}>
                点上面任一主题按钮开始。数据来自作者开源的 674,976 张命盘解读数据集，不调模型、不烧额度。
              </div>
            )}
          </div>
        ) : (
          <div>
            {thread.length === 0 && !loading && (
              <div style={{ opacity: 0.55, fontSize: 12 }}>点上面任一主题按钮开始讲解；回答出来后可在下方继续追问。</div>
            )}
            {thread.map((m, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 10,
                  padding: '9px 12px',
                  borderRadius: 12,
                  background: m.role === 'user' ? 'rgba(90,140,220,0.12)' : 'rgba(150,150,150,0.08)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 3 }}>{m.role === 'user' ? '你' : 'AI 讲解'}</div>
                {m.content}
              </div>
            ))}
            {loading && <div style={{ opacity: 0.6, fontSize: 12 }}>正在解读，通常 5–20 秒…</div>}
          </div>
        )}
      </div>

      {/* 追问输入：只在 AI 模式显示 */}
      {mode === 'ai' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                followUp();
              }
            }}
            placeholder={`就「${TOPICS.find((t) => t.key === topic)?.label}」继续追问…`}
            style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(150,150,150,0.4)', background: 'transparent', color: 'inherit', fontSize: 13, outline: 'none' }}
          />
          <button
            type="button"
            onClick={followUp}
            disabled={loading}
            style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: loading ? 'rgba(150,150,150,0.25)' : 'linear-gradient(135deg,#9a6210,#c88020)', color: '#fff8e8', fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            追问
          </button>
        </div>
      )}

      <p style={{ fontSize: 10, opacity: 0.4, marginTop: 10, lineHeight: 1.6 }}>
        解读与对话会缓存到本机浏览器（每主题保留最近 10 条），下次打开同一张盘点主题即可接着聊。
        <br />
        「原版解读」数据来源：Renhuai123/ziwei-doushu 开源解读数据集 v4.0（CC BY 4.0，作者 王多鱼AI）。
        <br />
        命理属传统文化参考，不构成医疗、投资或法律意见。
      </p>
    </aside>
  );
}
