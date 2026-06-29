# 桩实例运行诊断记录写入文件

SparkBee V1 为开发和测试排查桩实例内部运行过程，引入按桩实例划分的运行诊断记录。Actor 通过创建参数注入的 `diagnosticSink` 产生结构化 diagnostics，不负责文件路径、磁盘写入或保留策略；server 负责将每个桩实例的诊断记录写成 JSON Lines 文件，目录运行时可配置，默认使用 `logs/diagnostics`，且 V1 不暴露查询 API。

OCPP 1.6 runtime 会把 protocol actions 与 inbound commands 作为内部诊断分类写入 diagnostics。每次 action/command 记录 `started` 和终态 `completed`、`rejected` 或 `failed`，同一组记录共享 `operationId`，终态记录包含 `durationMs`。为了支持复盘桩实例内部运行过程，actions/commands diagnostics 允许写入完整函数输入、函数结果和命令响应 payload；这覆盖“不写完整 OCPP body”的默认边界，但仍不要求记录底层 WebSocket raw frame。

**Considered Options**

- 复用 `actor.events`：会污染面向桩事件流的协议事件语义，让内部诊断信息被误认为业务状态来源。
- 暴露 `actor.diagnostics.subscribe(...)`：会把内部诊断通道做成更像公共事件总线的 API，增加被非诊断模块依赖的风险。
- 在 actor package 内直接写文件：会把协议运行核心绑定到运行环境细节，后续切换数据库或测试收集器的成本更高。

**Consequences**

- V1 不做诊断记录脱敏，开发和测试环境需要自行避免把带凭据的连接信息写入可共享文件或 CI artifact。
- 高频动作例如 Heartbeat 和周期 MeterValues 也会全量写入 diagnostics，因此文件增长由部署环境通过目录权限、清理任务或后续保留策略控制。
