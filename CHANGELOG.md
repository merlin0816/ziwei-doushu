# CHANGELOG

## v0.1.0 — 2026-11-03

基于上游 [ziwei-doushu](https://github.com/Renhuai123/ziwei-doushu) `main`（2026-11-02 快照）。

### 新增

- **原版解读 · 本地数据集查表**：`GET /api/dataset`
  - 按 `YYYY-MM-DD-时辰序号-性别` 从解读数据集 v4.0 取 13 维原文，不调用模型
  - 按年分片按需下载（2 MB/年）到 `ZIWEI_DATA_DIR`，`zstd --long=27` 流式解压、命中即终止（首次约 15 s，之后约 2 s）
  - 界面内置 CC BY 4.0 署名
- **AI 讲解 · 多轮追问**：`POST /api/interpret` + `app/interpret/page.tsx`
  - 命盘压成结构化简报（基本信息 / 生年四化 / 十二宫含亮度与辅煞 / 当前大限与该限四化 / 健康取象）
  - 每个主题（13 维）一条独立对话，可连续追问；对话持久化（每主题最近 10 条）
  - 健康取象按「杀星最集中之宫 → 地支 → 脏腑」，禁用星之五行直配
  - 盘面简报并入第一条 user 消息（规避部分网关丢弃 system 角色）
- **起盘记录**：`lib/history.ts`
  - localStorage 记录（上限 50 条，按生日+时辰+性别去重），支持重开 / 单条删除 / 清空
  - 解读结果与对话按盘缓存，重看秒开、可接着追问
  - 配额满时自动淘汰最旧盘的解读缓存
- **部署资产**：`Dockerfile`（多阶段，node:22-slim + zstd）、`docker-compose.yml`、`.env.example`、`docs/部署说明.md`、`docs/本站增补说明.md`、`.github/workflows/build.yml`

### 修改

- `app/chart/page.tsx`
  - 右侧占位面板 `InsightPanel` → `AiPanel`（原版解读 / AI 讲解 双模式 + 13 主题常驻 + 宫位详情）
  - 表单下方增加「起盘记录」列表
  - 盘页顶部增加「删除本记录」

### 未包含

- 上游断语库、商业站前端、账号与支付
- 解读数据集本体与倪海厦原话语料（仅在运行时按需下载 / 不涉及）
