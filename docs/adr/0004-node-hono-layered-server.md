# Node Hono Server 采用分层结构

后端使用 Node + Hono，并按 routes、controllers、services、repositories、middlewares、validators、db 分层。这个决策把 HTTP、业务用例、运行时编排和数据库访问隔开，避免 RuntimeService、Drizzle 查询和 Hono handler 在 V1 后续快速扩展时混成一层。
