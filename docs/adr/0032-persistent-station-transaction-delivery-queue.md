---
status: accepted
---

# 交易消息使用持久化桩级交付队列

SparkBee 将 OCPP 1.6J 的 `StartTransaction`、交易内 `MeterValues` 和 `StopTransaction` 统一建模为领域级交易交付消息，并在在线发送前先持久化。每个桩实例只有一个按实际生成先后排列的交易交付队列；队列、交付进度、稳定 OCPP 消息标识和本地授权信息必须跨 WebSocket 断开、Actor 重建、服务重启及重新部署保留。

## 决策

- 交易业务状态和协议交付状态彼此独立，但开始交易、记录采样、结束交易与创建对应交付消息必须原子提交。成功的本地开始或结束不等待 CSMS 确认；CSMS 响应异步推进交付状态。
- 交付队列保存类型化领域事实，不保存原始 OCPP JSON。现有协议报文与协议事件继续只用于观察，不作为恢复或业务判断来源。
- 所有交易消息都先进入持久化交付表，在线且没有积压时也不走绕过持久化的直发路径。非交易消息仍可直接通过 Session 发送。
- 单桩使用持久化单调序号确定唯一发送顺序。事件时间戳写入 OCPP payload，但时间同步、回拨或相同时间戳不重新排列已经形成的队列。
- 每个交付消息持有稳定 OCPP `uniqueId`，采用 at-least-once（至少一次）语义。未收到成功响应时允许使用同一标识重发，同时接受第三方 CSMS 可能重复处理的风险。
- `TransactionMessageAttempts` 表示总发送次数，`TransactionMessageRetryInterval` 按“基础间隔乘已失败发送次数”计算。尚未在线不消耗次数；消息持久化进入 `in_flight` 后计为一次尝试。最终失败保留为可观察终态并解除队头阻塞。
- `StartTransaction` 最终无法取得 CSMS transactionId 时，将该交易的 OCPP transactionId 绑定为 Errata 规定的 `-1`，后续 `MeterValues` 和 `StopTransaction` 继续按队列顺序发送。
- 普通 WebSocket 重连沿用既有 Accepted 注册状态并立即恢复交付，不重新 Boot；Actor 或服务重启后必须等待新的 `BootNotification.conf.status=Accepted`。`Pending` 或 `Rejected` 时不发送遗留交易消息。
- Local Authorization List 和 Authorization Cache 使用非易失持久化。离网授权严格遵循 `LocalAuthorizeOffline`、本地列表优先、缓存次之及 `AllowOfflineTxForUnknownId` 的协议策略，不提供 UI 强制放行入口。
- 未完成交付不设置 TTL，也不设置 V1 应用层硬容量上限。`delivered` 和 `failed` 终态保留 7 天；交易和采样清理不得删除仍被待交付消息引用的数据。
- V1 提供交付摘要、分页查询、SSE 状态变化和只读调试界面，不提供人工删除、改序、跳过或无限重试。

## 考虑过的替代方案

- **继续使用进程内 outbox**：改动较小，但进程退出后会丢失已结束交易的待发 `StopTransaction`，与已确认的跨重启保证冲突。
- **持久化原始 OCPP 帧**：可以直接重发字节，但 `MeterValues` 和 `StopTransaction` 依赖 `StartTransaction.conf` 分配的 transactionId，仍需额外状态机；同时会把观察记录错误提升为业务事实来源。
- **每笔交易独立补发**：单笔内部简单，但两笔重叠交易会违反 OCPP 1.6 §3.7 的桩级 chronological order。
- **只持久化断线后产生的消息**：无法消除发送与断线并发时的落盘竞态，也会保留在线、离线两套重试语义。

## 后果

所有交易动作增加一次强一致数据库写入，并使数据库可用性成为本地交易状态变化的前置条件。换来的收益是交易交付具备确定顺序、崩溃恢复、有限重试、失败留痕和统一观察语义。

该决策扩展 ADR-0029：交易与采样继续持久化，但必须与对应交付消息原子写入；保留 ADR-0030 的“协议观察记录不是业务事实来源”；保留 ADR-0021 的前端先鉴权再开始交易工作流；使用 ADR-0031 已持久化的 OCPP 重试与离网授权配置作为运行事实。
