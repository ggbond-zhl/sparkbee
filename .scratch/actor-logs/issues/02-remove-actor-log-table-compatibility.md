Status: ready-for-agent

# 删除 Actor 日志旧表名兼容

## What to build

在 `actor_logs` rename migration 已部署并稳定验证后，删除 Actor 日志存储模块中针对旧物理表名的自动探测、切换和重试逻辑。最终运行代码只认识 `actor_logs`，数据库中不保留 `runtime_logs`。

## Acceptance criteria

- [ ] 数据库只存在 `actor_logs`，不存在 `runtime_logs`。
- [ ] 兼容层已确认选择 `actor_logs`。
- [ ] Actor 日志写入、查询、筛选和 7 天清理测试全部通过。
- [ ] 测试环境完整部署及冒烟测试成功。
- [ ] 删除旧表名探测、PostgreSQL `42P01` fallback 和非历史性 `runtime_logs` 引用。
- [ ] 删除兼容代码后，相关测试、类型检查和构建全部通过。

## Blocked by

- `01-rename-actor-logs-table.md`

## Comments

- 2026-07-15：发布 B 已完成。migration 成功后数据库使用 `actor_logs`，Actor 日志真实写入/查询成功，完整测试环境部署与冒烟测试通过。
