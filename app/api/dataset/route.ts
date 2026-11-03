import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import readline from 'node:readline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RELEASE = 'https://github.com/Renhuai123/ziwei-doushu/releases/download/v4.0-13d';
const DATA_DIR = process.env.ZIWEI_DATA_DIR || '/data/cache';
const MIN_YEAR = 1950;
const MAX_YEAR = 2026;

const DIMS = [
  'overview', 'personality', 'love', 'career', 'wealth', 'health',
  'family', 'children', 'move', 'friends', 'home', 'spirit', 'parents',
] as const;

/** 确保某一年的压缩数据集已缓存到本地（约 2 MB/年），没有就下载 */
async function ensureYearFile(year: string): Promise<string> {
  mkdirSync(DATA_DIR, { recursive: true });
  const file = `${DATA_DIR}/year-${year}.jsonl.zst`;
  if (existsSync(file) && statSync(file).size > 1_000_000) return file;

  const res = await fetch(`${RELEASE}/year-${year}.jsonl.zst`, {
    redirect: 'follow',
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok || !res.body) throw new Error(`下载 ${year} 年数据集失败：HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1_000_000) throw new Error(`下载的 ${year} 年数据集异常（${buf.length} 字节）`);
  await writeFile(file, buf);
  return file;
}

/** 用 zstd 流式解压，边读边找目标 key，命中即杀进程（0.7 GB 的一年数据不必全读） */
function extractRecord(file: string, key: string): Promise<any | null> {
  return new Promise((resolve, reject) => {
    const child = spawn('zstd', ['-d', '-c', '--long=27', file], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let found: any = null;
    let settled = false;
    const done = (val: any | null) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };

    const rl = readline.createInterface({ input: child.stdout });
    const needle = `"${key}"`;

    rl.on('line', (line) => {
      if (found || !line.includes(needle)) return;
      try {
        const rec = JSON.parse(line);
        if (rec && rec.k === key) {
          found = rec;
          rl.close();
          child.kill('SIGKILL');
        }
      } catch {
        /* 半行或坏行，跳过 */
      }
    });

    child.stderr.on('data', () => {});
    child.on('error', reject);
    child.on('close', () => done(found));
    rl.on('close', () => done(found));
  });
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const y = Number(p.get('y'));
  const m = Number(p.get('m'));
  const d = Number(p.get('d'));
  const h = Number(p.get('h'));
  const g = p.get('g');

  if (!Number.isInteger(y) || y < MIN_YEAR || y > MAX_YEAR) {
    return NextResponse.json({ error: `年份需在 ${MIN_YEAR}–${MAX_YEAR} 之间（数据集覆盖范围）` }, { status: 400 });
  }
  if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(d) || d < 1 || d > 31) {
    return NextResponse.json({ error: '日期不合法' }, { status: 400 });
  }
  if (!Number.isInteger(h) || h < 0 || h > 11) {
    return NextResponse.json({ error: '时辰序号需为 0–11' }, { status: 400 });
  }
  if (g !== 'male' && g !== 'female') {
    return NextResponse.json({ error: '性别需为 male / female' }, { status: 400 });
  }

  const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}-${h}-${g}`;

  try {
    const file = await ensureYearFile(String(y));
    const rec = await extractRecord(file, key);
    if (!rec) {
      return NextResponse.json(
        { error: `数据集中没有 ${key} 这条记录（该日期可能不存在，或时辰/性别不匹配）`, key },
        { status: 404 },
      );
    }
    const c = rec.c || {};
    const dims: Record<string, string> = {};
    for (const k of DIMS) if (c[k]) dims[k] = String(c[k]);
    return NextResponse.json({
      key: rec.k,
      solar: { y: rec.y, m: rec.m, d: rec.d },
      hour: rec.h,
      gender: rec.g,
      mingStar: rec.ms ?? null,
      words: rec.t ?? null,
      dims,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '查表失败' }, { status: 502 });
  }
}
