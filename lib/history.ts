'use client';

import type { BirthInfo } from '@/lib/ziwei/types';

/** 一条起盘记录（存浏览器 localStorage，不上服务器） */
export interface ChartRecord {
  id: string;
  name?: string;
  birth: BirthInfo;
  createdAt: number;
  updatedAt: number;
}

export interface DatasetReading {
  key: string;
  dims: Record<string, string>;
}

export interface ThreadMsg {
  role: 'user' | 'assistant';
  content: string;
}

export interface Readings {
  dataset?: DatasetReading;
  /** 兼容旧缓存：每个主题的最后一条回答 */
  ai?: Record<string, string>;
  /** 每个主题的多轮对话（追问上下文） */
  threads?: Record<string, ThreadMsg[]>;
}

const RECORDS_KEY = 'ziwei.history.v1';
const READINGS_PREFIX = 'ziwei.readings.v1:';
const MAX_RECORDS = 50;
const MAX_READING_SETS = 20;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // 配额满：清掉最旧的一批解读缓存再试一次
    try {
      pruneReadings(MAX_READING_SETS / 2);
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
}

/** 同一份生日 + 性别 视为同一条记录 */
export function chartKey(b: BirthInfo): string {
  return `${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}-${b.hour}-${b.gender}`;
}

export function listRecords(): ChartRecord[] {
  const all = readJson<ChartRecord[]>(RECORDS_KEY, []);
  return Array.isArray(all) ? [...all].sort((a, b) => b.updatedAt - a.updatedAt) : [];
}

export function saveRecord(birth: BirthInfo): ChartRecord {
  const all = listRecords();
  const key = chartKey(birth);
  const now = Date.now();
  const idx = all.findIndex((r) => chartKey(r.birth) === key);
  let rec: ChartRecord;
  if (idx >= 0) {
    rec = { ...all[idx], birth, name: birth.name || all[idx].name, updatedAt: now };
    all[idx] = rec;
  } else {
    rec = {
      id: `${key}-${now.toString(36)}`,
      name: birth.name,
      birth,
      createdAt: now,
      updatedAt: now,
    };
    all.unshift(rec);
  }
  const trimmed = all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_RECORDS);
  writeJson(RECORDS_KEY, trimmed);
  return rec;
}

export function deleteRecord(id: string): void {
  const all = listRecords().filter((r) => r.id !== id);
  writeJson(RECORDS_KEY, all);
}

export function clearRecords(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(RECORDS_KEY);
  } catch {
    /* ignore */
  }
}

/* ---------------- 解读结果缓存（按 chartKey） ---------------- */

function readingsKey(b: BirthInfo): string {
  return `${READINGS_PREFIX}${chartKey(b)}`;
}

export function loadReadings(b: BirthInfo): Readings {
  const r = readJson<Readings>(readingsKey(b), {});
  return r && typeof r === 'object' ? r : {};
}

export function saveDatasetReading(b: BirthInfo, dataset: DatasetReading): void {
  const cur = loadReadings(b);
  writeJson(readingsKey(b), { ...cur, dataset });
}

export function saveAiReading(b: BirthInfo, topic: string, text: string): void {
  const cur = loadReadings(b);
  const ai = { ...(cur.ai || {}), [topic]: text };
  writeJson(readingsKey(b), { ...cur, ai });
}

/** 保存某个主题的多轮对话（保留最近 10 条消息，控制体积） */
export function saveThread(b: BirthInfo, topic: string, msgs: ThreadMsg[]): void {
  const cur = loadReadings(b);
  const threads = { ...(cur.threads || {}), [topic]: msgs.slice(-10) };
  writeJson(readingsKey(b), { ...cur, threads });
}

export function dropReadings(b: BirthInfo): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(readingsKey(b));
  } catch {
    /* ignore */
  }
}

/** 只保留最近 keep 份解读缓存（按写入顺序的粗略裁剪：删掉不在最近记录里的键） */
function pruneReadings(keep: number): void {
  if (typeof window === 'undefined') return;
  const recent = listRecords().slice(0, Math.max(1, Math.floor(keep)));
  const keepKeys = new Set(recent.map((r) => readingsKey(r.birth)));
  const drop: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(READINGS_PREFIX) && !keepKeys.has(k)) drop.push(k);
  }
  for (const k of drop) {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

/** 新增/更新记录时顺带刷新主题标题 */
export function recordLabel(r: ChartRecord): string {
  const b = r.birth;
  const branches = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const date = `${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`;
  return `${r.name || '未命名'} · ${date} · ${branches[b.hour]}时 · ${b.gender === 'male' ? '男' : '女'}`;
}
