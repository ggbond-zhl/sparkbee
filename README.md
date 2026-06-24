# SparkBee

SparkBee 是一个单用户自部署的 CSMS 调试台，用于长期运行少量 OCPP 1.6J 虚拟充电桩，并在前端手动完成插枪、授权、开始交易、上报表值和结束交易。

## Quick Start

```bash
pnpm install
docker compose up -d
cp .env.example .env
pnpm --filter @spark-bee/server db:generate
pnpm --filter @spark-bee/server db:migrate
pnpm dev
```

前端默认运行在 `http://localhost:3001`，后端默认运行在 `http://localhost:3000`。

## Structure

- `packages/simulator-core`：OCPP 1.6J 模拟核心、协议 codec、validator、session 和 transport。
- `apps/server`：Node + Hono 后端，按 routes/controllers/services/repositories 分层。
- `apps/web`：React + Vite 调试台前端。
- `CONTEXT.md` 和 `docs/adr/`：领域词汇和关键架构决策。
