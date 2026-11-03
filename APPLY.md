# 怎么把这个目录合并进你的 fork

这个目录**不是一个完整仓库**，只是一份"覆盖层"：里面只有本站新增/修改的文件 + 部署文档。
上游其余文件保持原样。

## 一次性操作（在你自己电脑上）

```bash
# 1) 先在你的 GitHub 上点 Fork（保留上游历史）
# 2) 克隆你的 fork
git clone https://github.com/<你的账号>/ziwei-doushu.git
cd ziwei-doushu

# 3) 把本目录的全部内容覆盖进去（保持相对路径）
#    Windows: 直接把这个文件夹里的东西拖进去，同名覆盖
#    macOS/Linux:
cp -r /path/to/ziwei-doushu-fork/. .

# 4) 检查：这几个文件应该存在
ls app/api/interpret/route.ts app/api/dataset/route.ts app/interpret/page.tsx \
   components/AiPanel.tsx lib/history.ts Dockerfile docker-compose.yml \
   docs/部署说明.md docs/本站增补说明.md NOTICE CHANGELOG.md

# 5) 把 README-增补段.md 的内容贴到 README.md 的最顶部（上游 README 很长，别动它正文）

# 6) 忽略本地产物
cat >> .gitignore <<'EOF'

# 本站增补
.env
.env.local
data/
EOF

# 7) 提交并推送
git checkout -b feat/local-ai-panel
git add -A
git commit -m "feat: local dataset lookup, AI interpretation panel and chart history"
git push -u origin feat/local-ai-panel
# 或者直接推 main：git push origin main
```

## 文件清单（本目录里有什么）

| 路径 | 性质 | 说明 |
|---|---|---|
| `app/chart/page.tsx` | **覆盖**上游同名文件 | 右侧面板换成 AiPanel、加起盘记录 |
| `components/AiPanel.tsx` | 新增 | 解读面板（原版解读 / AI 讲解 / 主题切换 / 追问） |
| `lib/history.ts` | 新增 | 起盘记录与解读缓存（localStorage） |
| `app/api/interpret/route.ts` | 新增 | AI 讲解接口 |
| `app/api/dataset/route.ts` | 新增 | 数据集本地查表接口 |
| `app/interpret/page.tsx` | 新增 | 独立 AI 对话页（可留可删，删了不影响 `/chart`） |
| `Dockerfile` | 新增 | 多阶段构建（node:22-slim + zstd） |
| `docker-compose.yml` / `.env.example` | 新增 | 通用部署 |
| `docs/部署说明.md` / `docs/本站增补说明.md` | 新增 | 文档 |
| `NOTICE` / `CHANGELOG.md` / `README-增补段.md` | 新增 | 署名、改动清单、README 增补段 |
| `.github/workflows/build.yml` | 新增 | CI：typecheck + 上游引擎测试 + docker build |

## 验证

```bash
mkdir -p data
cp .env.example .env      # 填 LLM_API_KEY（只验排盘和原版解读可以不填）
docker compose up -d --build
# 打开 http://localhost:8899/chart
```

验收三条：

1. 填生日 → 出盘 → 右侧「原版解读」点任一主题出原文（首次约 15 秒，之后约 2 秒）
2. 切「AI 讲解」→ 点主题出解读 → 在底部输入框追问，能接着上下文回答
3. 回「← 重新起盘」→ 表单下方能看到刚起的记录；点它直接回到那张盘；点删除能删掉

## 需要同时更新 `package.json` 吗？

不需要。增补代码只用到已有的 `next` / `react` 依赖与 Node 内置模块（`node:child_process`、`node:fs`、`node:readline`）。
`zstd` 是**系统包**，已在 `Dockerfile` 的 runner 阶段 `apt-get install`；本地开发方式下若要用「原版解读」需自行安装 `zstd`。
