# SparkBee

SparkBee 是一个充电桩模拟与调试工作台，用于创建充电桩实例、配置枪口、连接中心系统，并在前端观察 OCPP 运行状态、报文和运行事件。

## 功能概览

- 充电桩实例管理：创建、查询、编辑和删除充电桩配置。
- 枪口管理：维护枪口编号、接口类型、功率类型和运行配置。
- 运行控制：启动/停止桩实例，插枪/拔枪，发起鉴权、启动充电和停止充电。
- 运行观测：查看运行摘要、OCPP 报文、运行事件和最近异常。
- API 文档：后端自动暴露 OpenAPI 3.1 文档和 Scalar API Reference。

## 技术栈

- Monorepo：pnpm workspace
- 语言：TypeScript
- 后端：Node.js、Hono、Drizzle ORM、PostgreSQL、Zod OpenAPI、Scalar
- 前端：React、Vite、TanStack Router、TanStack Query、shadcn/ui、Tailwind CSS
- 充电桩运行时：`@spark-bee/charging-point-actor`
- 测试：Vitest、PGlite

## 目录结构

```text
apps/
  server/                 后端 API、数据库迁移和运行控制服务
  web/                    前端调试台
packages/
  charging-point-actor/   充电桩 Actor 和 OCPP 运行时
  contracts/              前后端共享 Zod schema 与类型
docs/
  adr/                    架构决策记录
CONTEXT.md                领域上下文和统一语言
```

## 环境要求

- Node.js 24，见 `.nvmrc`
- pnpm 10.23.0，见 `package.json` 的 `packageManager`
- Docker，用于启动本地 PostgreSQL

## 快速开始

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres
pnpm db:migrate
pnpm dev
```

默认访问地址：

- 前端调试台：http://localhost:3001
- 后端 API：http://localhost:3000/api
- 后端就绪检查：http://localhost:3000/api/ready
- OpenAPI JSON：http://localhost:3000/api/openapi.json
- Scalar API 文档：http://localhost:3000/api/docs

前端开发服务器会把 `/api` 代理到 `http://localhost:3000`。

## 环境变量

本地环境变量从 `.env` 读取，可从 `.env.example` 复制：

```env
PORT=3000
DATABASE_URL=postgres://sparkbee:sparkbee@localhost:5432/sparkbee
CORS_ALLOWED_ORIGIN=http://localhost:3001
LOG_LEVEL=debug
# SENTRY_DSN=https://public@example.ingest.sentry.io/project-id
```

服务端开发环境默认输出易读日志，生产环境输出单行 JSON 到标准输出。`LOG_LEVEL`
可选值为 `trace`、`debug`、`info`、`warn`、`error`、`fatal`；仅配置
`SENTRY_DSN` 时启用 Sentry 错误追踪。

Cloudflare Pages 构建前端时通过 `VITE_API_BASE_URL` 指向 Render 后端；本地未配置时继续使用 Vite 的 `/api` proxy。

## 常用命令

```bash
pnpm dev          # 同时启动后端和前端开发服务
pnpm build        # 构建所有 workspace 包
pnpm test         # 运行所有测试
pnpm test:unit    # 运行所有单元测试
pnpm typecheck    # 运行 TypeScript 类型检查
pnpm db:migrate   # 执行后端数据库迁移
```

按包执行命令：

```bash
pnpm --filter @spark-bee/server test:unit
pnpm --filter @spark-bee/web test:unit
pnpm --filter @spark-bee/contracts test:unit
pnpm --filter @spark-bee/charging-point-actor test:unit
```

## API 文档规范

新增或修改后端接口时，需要同步维护 OpenAPI/Scalar 文档：

- 业务资源路径使用小写 kebab-case，例如 `/charging-points`。
- 接口级 `summary`、`description` 和响应说明写在后端 route 的 `createRoute` metadata 中，并使用中文。
- 请求参数、请求体和响应字段说明优先写在 `@spark-bee/contracts` 的 Zod schema metadata 中，并使用中文。
- 测试需要覆盖关键接口是否出现在 `/api/openapi.json`，以及重要中文说明是否存在。

## 开发约定

- 采用测试驱动开发：先用测试明确目标，再实现功能。
- 前端优先使用 shadcn/ui 组件，再进行轻量业务组合。
- 领域术语和上下文维护在 `CONTEXT.md`。
- 架构决策记录维护在 `docs/adr/`。
- Issue 和 PRD 使用本仓库内的本地 Markdown 文件管理，详见 `docs/agents/issue-tracker.md`。

## Git 工作流

- `main`：生产稳定分支，只合入已发布或可发布代码。
- `develop`：日常集成分支和测试环境来源，允许完成验证后直接推送。
- `feature/*`：可选功能分支，较大或需要独立审查的改动从 `develop` 拉出，完成后合回 `develop`。
- `release/*`：发布分支，从 `develop` 拉出，只修 bug、改配置和补文档。
- `hotfix/*`：生产紧急修复，从 `main` 拉出，修复后同时合入 `main` 和 `develop`。

Commit 格式：

```text
type: 中文简短说明
```

`type` 可选：`feat`、`fix`、`refactor`、`perf`、`style`、`docs`、`test`、`chore`。
