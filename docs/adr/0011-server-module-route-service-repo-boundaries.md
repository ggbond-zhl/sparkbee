# 后端业务模块采用 route、service 和可选 repo 边界

后端业务模块默认由 `route` 和 `service` 组成；只要模块访问数据库，就必须通过本模块的 `repo`。`route` 负责 HTTP 和 OpenAPI 适配，`service` 负责用例编排、业务规则和错误映射，`repo` 负责本模块需要的数据访问视图。

这个规则会带来少量样板代码，尤其是 CRUD 模块的 service 在第一版可能只是薄委托。但统一边界能让用例逻辑有稳定归属，避免 route 直接膨胀，也避免 service 穿透调用其他模块的 repo。对于 `runtimeOperation` 这类运行操作模块，即使它不是一个持久化主资源，只要需要读取数据库，也创建本模块 repo 来封装操作 API 所需的数据视图。

如果某个业务模块确实没有数据访问，可以没有 repo；但 route 仍然不直接访问数据库或 actor 等运行时细节。这个决策细化了早期后端目标结构：`chargingPoint` 保持桩实例配置管理，启动、停止、运行状态查询、枪口运行动作和交易运行动作归属独立的 `runtimeOperation` 模块。
