import { NextResponse } from 'next/server';
import type { ZiweiChart, Palace } from '@/lib/ziwei/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
/** 倪师断疾厄：按「杀星最集中之宫」的地支配脏腑，不用星之五行直配 */
const BRANCH_ORGAN = ['胆', '肝', '肺', '大肠', '胃', '脾', '心', '小肠', '膀胱', '肾', '心包', '三焦'];

const BASE = process.env.LLM_BASE_URL || 'http://192.168.88.8:7863/v1';
const KEY = process.env.LLM_API_KEY || '';
const MODEL = process.env.LLM_MODEL || 'deepseek-v4-flash';
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 180000);
/** 单次输出预算（含推理模型的思考 token）；推理型模型给小了会只剩思考、没有正文 */
const MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS || 8000);
const MAX_HISTORY = 12;

type Msg = { role: 'user' | 'assistant'; content: string };

const SYSTEM_PROMPT = `你是一位紫微斗数解读师，用倪海厦《天纪》体系为正统口径，结合《紫微斗数全书》讲盘。
输出要求：
1. 先给结论，再讲依据；用通俗中文，术语第一次出现时用一句话解释。
2. 围绕命格、性格、事业、财运、感情、健康六个方面，挑这张盘真正突出的三四项讲，不要面面俱到地堆术语。
3. 每个判断都要落到「可以怎么做」的具体建议；不要空泛的套话。
4. 语气平实、不吓人、不宿命；煞星要说清"有吉星同坐/有解厄就打折"。
5. 健康部分只做传统文化取象提醒，明确不构成诊断，建议体检与就医。**必须按倪师方法**：先看全盘哪一宫杀星最集中，按那一宫的地支配脏腑（资料里已给出），不要把某颗星的五行直接配脏腑（例如"贪狼属木所以看肝胆"是错法）；疾厄宫本宫只作参考。
6. 不预测生死、灾祸、官非等具体事件；不编排不存在的事实；煞星要分庙陷（入庙的煞星倪师说"反而会变成吉星"）。
7. 默认 700–1100 字，用 Markdown 小标题分段；用户追问时按问题聚焦回答，不要重复整篇。
8. 只谈命理与传统命理文化，不涉及投资建议、医疗诊断或法律意见。`;

function starText(p: Palace, major: boolean): string {
  const list = p.stars
    .filter((s) => (major ? s.type === 'major' : s.type !== 'major'))
    .map((s) => {
      const b = s.brightnessRaw ? `[${s.brightnessRaw}]` : '';
      const h = s.siHua ? `化${s.siHua}` : '';
      return `${s.name}${b}${h}`;
    });
  return list.join('、') || '无';
}

function palaceLine(p: Palace): string {
  const flags: string[] = [];
  if (p.isMingGong) flags.push('命宫');
  if (p.isShenGong) flags.push('身宫');
  if (p.isCurrentDaXian) flags.push('当前大限');
  if (p.daXianAge) flags.push(`大限${p.daXianAge[0]}-${p.daXianAge[1]}岁`);
  const empty = p.isEmpty
    ? `（空宫，借对宫${p.borrowedFromName || ''}主星${(p.borrowedStars || []).join('、') || '—'}入事）`
    : '';
  return `· ${p.name}（${BRANCHES[p.branch] || '?'}${STEMS[p.stem] || '?'}）${flags.length ? '【' + flags.join('·') + '】' : ''}：主星 ${starText(p, true)}${empty}；辅煞 ${starText(p, false)}`;
}

function buildBrief(chart: ZiweiChart): string {
  const b = chart.birthInfo;
  const ming = BRANCHES[chart.mingGongBranch] || '?';
  const shen = BRANCHES[chart.shenGongBranch] || '?';
  const hourBranch = BRANCHES[b.hour] || '?';

  const siHua: string[] = [];
  for (const p of chart.palaces) {
    for (const s of p.stars) {
      if (s.siHua) siHua.push(`${s.name}化${s.siHua}在${p.name}`);
    }
  }

  // 十二宫按「命宫起、逆时针」排列，与看图习惯一致
  const order: Palace[] = [];
  for (let i = 0; i < 12; i += 1) {
    const branch = (chart.mingGongBranch - i + 12) % 12;
    const p = chart.palaces.find((x) => x.branch === branch);
    if (p) order.push(p);
  }

  const dx = chart.daXians || [];
  const cur = dx[chart.currentDaXianIndex];
  const next = dx.slice(chart.currentDaXianIndex + 1, chart.currentDaXianIndex + 3);
  const dxLine = dx.length
    ? `当前 ${chart.currentAge} 岁${cur ? `，走 ${cur.palaceName}（${cur.startAge}–${cur.endAge} 岁）` : ''}；后续：${next
        .map((d) => `${d.palaceName} ${d.startAge}–${d.endAge} 岁`)
        .join('；')}`
    : '（无大限数据）';

  const curSihua = cur?.siHua
    ? `；该大限四化：禄${cur.siHua.lu} 权${cur.siHua.quan} 科${cur.siHua.ke} 忌${cur.siHua.ji}`
    : '';

  // 倪师断疾厄：找「杀星最集中」的宫（并列都列出），按地支给脏腑
  const shaCount = chart.palaces.map((p) => ({
    p,
    n: p.stars.filter((s) => s.type === 'sha').length,
    names: p.stars.filter((s) => s.type === 'sha').map((s) => s.name),
  }));
  const maxSha = Math.max(...shaCount.map((x) => x.n), 0);
  const worst = maxSha > 0 ? shaCount.filter((x) => x.n === maxSha) : [];
  const organLine = worst.length
    ? `杀星最集中的宫（倪师定脏腑之法）：${worst
        .map((x) => `${x.p.name}·${BRANCHES[x.p.branch]}宫（${x.names.join('、')}）→ ${BRANCH_ORGAN[x.p.branch]}（并列同参）`)
        .join('；')}`
    : '杀星分布无显著集中';
  const jiePalace = chart.palaces.find((p) => p.name === '疾厄');

  return [
    '【命盘数据】',
    `基本信息：${b.gender === 'male' ? '男' : '女'}，公历 ${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')} ${hourBranch}时（时辰序号 ${b.hour}）${chart.yinYangGender ? '，' + chart.yinYangGender + '命' : ''}`,
    `五行局：${chart.wuxingJuName}；命宫在${ming}宫；身宫在${shen}宫${chart.mingZhu ? `；命主 ${chart.mingZhu}` : ''}${chart.shenZhu ? `；身主 ${chart.shenZhu}` : ''}`,
    `生年四化：${siHua.join('、') || '无'}`,
    `大限：${dxLine}${curSihua}`,
    jiePalace ? `疾厄宫（只作参考）：${BRANCHES[jiePalace.branch]}宫，主星 ${starText(jiePalace, true)}；辅煞 ${starText(jiePalace, false)}` : '',
    `健康取象（倪师法）：${organLine}`,
    '',
    '【十二宫】（命宫起逆时针）',
    ...order.map(palaceLine),
  ].join('\n');
}

export async function POST(req: Request) {
  if (!KEY) {
    return NextResponse.json(
      { error: '本站未配置 LLM：请在 Portainer 该 Stack 的环境变量里设置 LLM_API_KEY（以及可选的 LLM_BASE_URL / LLM_MODEL），然后 Update the stack。' },
      { status: 503 },
    );
  }

  let payload: { chart?: ZiweiChart; messages?: Msg[]; focusPalace?: string | null };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: '请求体不是 JSON' }, { status: 400 });
  }

  const chart = payload.chart;
  if (!chart || !Array.isArray(chart.palaces) || chart.palaces.length !== 12) {
    return NextResponse.json({ error: '缺少有效的命盘数据（chart.palaces）' }, { status: 400 });
  }

  const history = Array.isArray(payload.messages) ? payload.messages.slice(-MAX_HISTORY) : [];
  if (history.length === 0) {
    history.push({ role: 'user', content: '请为我看这份命盘，给一份整体解读。' });
  }

  const focus = payload.focusPalace ? `\n\n【用户当前点选的宫位】${payload.focusPalace}（回答时优先结合此宫）` : '';
  const brief = buildBrief(chart);

  // ⚠️ 实测：workbuddy2api（CodeBuddy 网关）会吞掉 role=system 的消息 ——
  // 指令与盘面数据必须并入第一条 user 消息，否则模型只会看到一句"请解读"。
  const first = history[0];
  const messages = [
    {
      role: 'user' as const,
      content: `【系统指令】\n${SYSTEM_PROMPT}\n\n${brief}${focus}\n\n【用户问题】\n${first.content}`,
    },
    ...history.slice(1),
  ];

  /**
   * 调模型。推理型模型（如 deepseek-v4-flash / glm-5.3-flash）会把「思考」也计入 max_tokens，
   * 预算不足时 content 会为空、只剩下 reasoning_content —— 那段思考过程（往往是英文规划）
   * 绝不能当正文返回给用户。所以给足预算，并在 content 为空时用更大预算重试一次。
   */
  async function callModel(maxTokens: number) {
    const res = await fetch(`${BASE.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.7,
        max_tokens: maxTokens,
        reasoning_effort: 'low',
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const raw = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(raw);
    } catch {
      /* ignore */
    }

    if (!res.ok) {
      const detail = json?.error?.message || json?.error || raw.slice(0, 300);
      const text = typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 300);
      return { ok: false as const, error: `模型接口返回 ${res.status}：${text}` };
    }

    const msg = json?.choices?.[0]?.message || {};
    return {
      ok: true as const,
      content: String(msg.content || '').trim(),
      model: json?.model as string | undefined,
    };
  }

  try {
    let r = await callModel(MAX_TOKENS);
    if (r.ok && !r.content) r = await callModel(MAX_TOKENS * 3);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
    if (!r.content) {
      return NextResponse.json(
        { error: '模型只输出了思考过程、没给出正文（输出预算被思考吃掉了）。请点「重新生成」，或换一个非推理型模型（LLM_MODEL）。' },
        { status: 502 },
      );
    }
    return NextResponse.json({ content: r.content, model: r.model || MODEL });
  } catch (e: any) {
    const msg = e?.name === 'TimeoutError' ? '模型响应超时，请重试或调大 LLM_TIMEOUT_MS' : e?.message || '调用失败';
    return NextResponse.json({ error: msg }, { status: 504 });
  }
}
