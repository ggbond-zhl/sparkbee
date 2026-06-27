# SparkBee

SparkBee 充电桩模拟器

## Quick Start

```bash
pnpm install
cp .env.example .env
pnpm dev
```

前端默认运行在 `http://localhost:3001`，后端默认运行在 `http://localhost:3000`。

## Structure

- `packages/charging-point-actor`：充电桩 Actor 核心。
- `apps/server`：Node + Hono 后端基础骨架。
- `apps/web`：React + Vite 调试台前端。
- `CONTEXT.md` 和 `docs/adr/`：领域词汇和关键架构决策。
