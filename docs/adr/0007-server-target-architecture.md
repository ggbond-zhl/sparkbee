# 后端业务恢复后的目标结构

SparkBee 后端当前仍保持基础骨架；当 `apps/server` 重新承载业务时，目标上采用 Hono + Drizzle 的模块化结构：HTTP 入口、配置、中间件、路由聚合、数据库访问、业务模块和进程内运行态管理分开。`chargingPoint` 模块作为 V1 主要用户操作入口，负责配置、启动、停止和运行状态等用例编排；运行中的模拟实例由独立 runtime registry 管理，Drizzle 配置和迁移文件归属 `apps/server`；前后端共享的 Zod API 契约放入 `@spark-bee/contracts`，不包含数据库表结构或后端内部类型。在第一个后端业务用例出现前，architecture test 只约束不要提前创建这些目标目录；目标结构的完整约束等业务模块落地时再加入测试。
