# 后端回到基础骨架

SparkBee 暂时清空后端业务实现和数据库模型，只保留 Node + Hono 基础骨架、配置加载、日志/错误中间件和 `/health` 路由。相比继续在旧分层服务、PostgreSQL schema 和运行意图恢复上迭代，先把后端收回到可验证的空骨架，可以避免旧模型继续约束下一轮业务边界设计；协议模拟能力继续留在独立的 `packages/charging-point-actor` 包中。
