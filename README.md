# TextCreateImageTestView

一个以 **Markdown/Prompt 实验友好** 为目标的 AI 绘图前端项目：

- OpenAI 兼容图像生成（可选 LLM 提示词优化）
- NovelAI 官方流式接口（SSE/msgpack）
- 本地缓存配置与历史记录

> 默认可作为纯前端项目运行；`server/` 目录提供可选的后端示例 API。

## 功能概览

### 1) OpenAI 兼容文本画图

- 拉取 `/models` 模型列表
- 可选先走 LLM 优化提示词，再请求图像生成
- 支持参考图、遮罩、负面提示词、seed/steps/guidance
- 历史结果可回填做下一轮微调

### 2) NovelAI 流式画图

- 请求 `generate-image-stream`
- 实时解析事件流并预览中间帧
- 支持复制完整 JSON payload（便于复刻）
- 历史结果可复用为参考图

## 技术栈

- Frontend: React 19 + TypeScript + Vite + Tailwind + shadcn/ui
- Backend (optional): Node.js + Express + Prisma
- CI: GitHub Actions
- Dependency maintenance: Dependabot

## 目录结构

```text
.
├─ src/                # 前端源码
├─ server/             # 可选后端示例
├─ scripts/            # 辅助脚本（端口清理等）
└─ .github/            # CI / 模板 / 依赖更新配置
```

## 快速开始

### 仅运行前端（推荐）

```bash
npm ci
npm run dev
```

打开 <http://localhost:5173>

### 运行前后端（可选）

```bash
npm ci
npm run server:install
npm run prisma:generate
npm run full:dev
```

- Frontend: <http://localhost:5173>
- Backend: <http://localhost:3001/api>

## 环境变量

### 前端（可选）

复制 `.env.local.example` 为 `.env.local`：

```bash
cp .env.local.example .env.local
```

### 后端（可选）

复制 `server/.env.example` 为 `server/.env`：

```bash
cp server/.env.example server/.env
```

> `DATABASE_URL` 必填，且需保证数据库可访问。

## 常用脚本

```bash
npm run dev            # 启动前端开发模式
npm run build          # 构建前端
npm run lint           # 代码检查（含 server/*.ts）
npm run check          # lint + 前端构建 + 后端构建

npm run server:dev     # 启动后端开发模式
npm run server:build   # 构建后端
npm run server:start   # 运行后端产物

npm run kill:all       # 关闭常见开发端口
npm run restart        # 重启前后端开发环境
```

## 安全建议

- 不要把 API Key 提交到仓库
- 生产环境请通过反向代理或 BFF 隔离敏感密钥
- 发现安全问题请走私有通道（见 `SECURITY.md`）

## 贡献

欢迎提 Issue / PR。提交前请阅读：

- `CONTRIBUTING.md`
- `.github/pull_request_template.md`

## License

MIT
