'use client';
import { useEffect, useState } from 'react';
import BirthForm from '@/components/BirthForm';
import ChartBoard from '@/components/ChartBoard';
import AiPanel from '@/components/AiPanel';
import TimeNav, { type TimeView } from '@/components/TimeNav';
import { generateChart } from '@/lib/ziwei/algorithm';
import { listRecords, saveRecord, deleteRecord, clearRecords, dropReadings, recordLabel } from '@/lib/history';
import type { BirthInfo, ZiweiChart, Palace } from '@/lib/ziwei/types';
import type { ChartRecord } from '@/lib/history';

/**
 * 命盘页 —— 开源版「排盘引擎 Demo」+ 本站补丁
 *
 * 本站补丁（相对上游）：
 *   1. 右侧占位 InsightPanel → AiPanel（原版解读·本地数据集 / AI 讲解·DeepSeek，13 主题常驻）
 *   2. 起盘记录：存浏览器 localStorage，可一键重看、单条删除/清空；
 *      解读结果（数据集原文 + AI 文本）也按盘缓存，重看时不必再查表/重新生成。
 */
export default function ChartPage() {
  const [chart, setChart] = useState<ZiweiChart | null>(null);
  const [selectedPalace, setSelectedPalace] = useState<Palace | null>(null);
  const [view, setView] = useState<TimeView>('mingpan');
  const [liunianYear, setLiunianYear] = useState(() => new Date().getFullYear());
  const [records, setRecords] = useState<ChartRecord[]>([]);

  useEffect(() => {
    setRecords(listRecords());
  }, []);

  const open = (info: BirthInfo) => {
    saveRecord(info);
    setRecords(listRecords());
    setChart(generateChart(info));
  };

  // ── 未起盘：出生信息表单 + 起盘记录 ──
  if (!chart) {
    return (
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 20px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>紫微斗数 · 开源排盘引擎（AI 增强版）</h1>
        <p style={{ color: '#888', marginBottom: 28, fontSize: 14, lineHeight: 1.7 }}>
          输入出生年月日时，开源排盘引擎即时生成命盘。
          <br />
          右侧可取「原版解读」（开源数据集原文，无需联网）或「AI 讲解」（本站自建接口）。
        </p>

        <BirthForm onSubmit={open} />

        {records.length > 0 && (
          <section style={{ marginTop: 28, border: '1px solid rgba(150,150,150,0.3)', borderRadius: 16, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <strong style={{ fontSize: 14 }}>起盘记录（{records.length}）</strong>
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm('确定清空全部起盘记录？解读缓存也会一并清掉。')) return;
                  clearRecords();
                  records.forEach((r) => dropReadings(r.birth));
                  setRecords([]);
                }}
                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(200,80,80,0.5)', background: 'transparent', color: 'inherit', cursor: 'pointer', opacity: 0.8 }}
              >
                清空全部
              </button>
            </div>

            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {records.map((r) => (
                <li
                  key={r.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 10px', borderRadius: 10, marginBottom: 6,
                    background: 'rgba(150,150,150,0.07)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => open(r.birth)}
                    style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, padding: 0 }}
                    title="点击打开这张盘（解读若已缓存会直接显示）"
                  >
                    <span style={{ fontWeight: 600 }}>{r.name || '未命名'}</span>
                    <span style={{ opacity: 0.65, marginLeft: 8 }}>
                      {recordLabel(r).split(' · ').slice(1).join(' · ')}
                    </span>
                    <span style={{ opacity: 0.4, marginLeft: 8, fontSize: 11 }}>
                      {new Date(r.updatedAt).toLocaleString()}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm(`删除「${r.name || '未命名'}」这条记录？`)) return;
                      deleteRecord(r.id);
                      dropReadings(r.birth);
                      setRecords(listRecords());
                    }}
                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(200,80,80,0.45)', background: 'transparent', color: 'inherit', cursor: 'pointer', opacity: 0.75 }}
                  >
                    删除
                  </button>
                </li>
              ))}
            </ul>
            <p style={{ fontSize: 10, opacity: 0.45, margin: '8px 0 0' }}>
              记录只存在这台设备的浏览器里（localStorage），不上传服务器；换浏览器或清缓存会丢。
            </p>
          </section>
        )}
      </main>
    );
  }

  // ── 已起盘：命盘 + 解读 ──
  return (
    <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => { setChart(null); setSelectedPalace(null); setRecords(listRecords()); }}
          style={{ padding: '6px 14px', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 8, background: 'transparent', color: 'inherit' }}
        >
          ← 重新起盘
        </button>
        <button
          type="button"
          onClick={() => {
            const key = chart.birthInfo;
            if (!window.confirm('删除当前这张盘的记录与解读缓存？')) return;
            const hit = listRecords().find((r) => recordLabel(r) && r.birth.year === key.year && r.birth.month === key.month && r.birth.day === key.day && r.birth.hour === key.hour && r.birth.gender === key.gender);
            if (hit) deleteRecord(hit.id);
            dropReadings(key);
            setRecords(listRecords());
            setChart(null);
            setSelectedPalace(null);
          }}
          style={{ padding: '6px 12px', cursor: 'pointer', border: '1px solid rgba(200,80,80,0.45)', borderRadius: 8, background: 'transparent', color: 'inherit', fontSize: 12, opacity: 0.8 }}
        >
          删除本记录
        </button>
        <span style={{ fontSize: 12, opacity: 0.55 }}>
          {chart.birthInfo.name || '未命名'} · {chart.birthInfo.year}-{String(chart.birthInfo.month).padStart(2, '0')}-{String(chart.birthInfo.day).padStart(2, '0')} · {chart.wuxingJuName}
        </span>
      </div>

      <TimeNav
        chart={chart}
        view={view}
        liunianYear={liunianYear}
        onViewChange={setView}
        onYearChange={setLiunianYear}
      />

      <div
        className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]"
        style={{ gap: 20, marginTop: 16, alignItems: 'start' }}
      >
        <ChartBoard chart={chart} onPalaceSelect={setSelectedPalace} />
        <AiPanel chart={chart} selectedPalace={selectedPalace} />
      </div>
    </main>
  );
}
