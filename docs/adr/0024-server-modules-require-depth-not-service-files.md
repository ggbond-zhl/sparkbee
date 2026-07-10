# 后端业务模块要求 depth 而非固定 service 文件

后端继续由 route 负责 HTTP 与 OpenAPI adapter，访问数据库时继续通过本 module 的 repo；但不再要求每个业务 module 固定存在 service 文件。只有当用例编排、业务规则或错误映射能形成有 depth 的 module 时才建立该 seam，纯 CRUD 的一对一委托直接删除，避免把 hypothetical seam 和 pass-through implementation 固化为架构要求。本决策取代 ADR-0011。
