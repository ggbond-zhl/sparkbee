---
status: accepted
---

# 服务端自身日志使用 Render Logs 与 Sentry

SparkBee 将服务端自身日志以 Pino 结构化 JSON 输出到 `stdout/stderr`，由 Render Logs 负责保存和检索；Sentry 只负责聚合未预期的 HTTP 5xx、进程异常和后台任务故障。服务端自身日志不写入业务 PostgreSQL，也不创建本地日志文件，避免与持久化到 `actor_logs` 表的桩实例 Actor 日志混淆。该选择保留 `requestId` 等排查上下文，同时通过字段白名单、敏感键遮盖和禁用请求载荷采集控制日志与第三方错误平台的数据边界。
