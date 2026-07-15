Status: ready-for-agent

# 将 Actor 日志物理表重命名为 actor_logs

## What to build

在发布 A 的表名兼容版本已经部署并验证后，将 PostgreSQL 中保存 Actor 日志的物理表从 `runtime_logs` 直接重命名为 `actor_logs`。迁移必须保留已有数据、索引、外键、RLS 和权限边界，并允许发布 A 在迁移发生时自动切换到新表名，使部署失败时仍可回滚到兼容版本。

## Acceptance criteria

- [ ] 发布 A 已在测试环境产生并通过 `/charging-points/{id}/actor-logs` 查询 Actor 日志。
- [ ] 兼容层已确认使用旧物理表，且没有 Actor 日志持久化或查询错误。
- [ ] 新增独立 Drizzle migration，将表、索引和外键约束统一重命名为 `actor_logs` 命名。
- [ ] 迁移前后的 Actor 日志数据保持完整。
- [ ] 迁移期间仍在线的兼容版本能够在遇到表不存在后自动切换并重试。
- [ ] 测试环境部署及 Actor 日志冒烟测试成功。

## Blocked by

- 发布 A：ActorLog 全套命名与双表名兼容版本完成部署验证。

## Comments

- 2026-07-15：发布 A 已部署到测试环境。真实桩启动产生 4 条 Actor 日志，`/actor-logs` 返回 200，旧 `/runtime-logs` 返回 404；数据库未执行新 migration，因此成功写入证明兼容层已选择 `runtime_logs`。
- 2026-07-15：发布 B 的 `0003_rename_actor_logs` migration、Render 部署和业务冒烟均成功。数据库 rename 后、Render 新版本切换前，仍在线兼容版本成功写入并查询 3 条 Actor 日志。
