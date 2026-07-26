# OCPP 离网交易与断线补发：协议事实

> 研究日期：2026-07-24
> 范围：OCPP 1.6J 为主要事实基线；OCPP 2.0.1 Edition 4 仅用于说明迁移差异。
> 边界：本文只记录 OCA（Open Charge Alliance，开放充电联盟）一手规范、Errata（勘误）和官方测试用例中的事实，不记录任何产品或架构决策。

## 1. 证据与规范词

本文核对了以下 OCA 官方下载包中的原文：

- [OCPP 1.6 官方完整下载包](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)：`OCPP 1.6 Edition 2`、`OCPP 1.6 Errata Sheet`、`OCPP-J 1.6 Specification`、`OCPP-J 1.6 Errata Sheet`；
- [OCPP 2.0.1 Edition 4 官方完整下载包](https://openchargealliance.org/download/caaab79c63336ff203104d9940c8eba29adb7d324c384e0578f7f3b7265e03ac/)：Part 2 Specification、Part 4 JSON over WebSockets、Part 6 Test Cases、Errata 2026-06；
- [OCA 的 OCPP 官方概览页](https://openchargealliance.org/protocols/open-charge-point-protocol/)。

规范原文同时使用 `MUST`、`SHALL`、`SHOULD`、`MAY`。本文保留原强度：`MUST/SHALL` 表示强制，`SHOULD` 表示除非有充分理由否则应遵守，`MAY` 表示允许或可选。单纯说明文字没有被提升为强制要求。

## 2. 版本差异总览

| 主题 | OCPP 1.6J | OCPP 2.0.1 Edition 4 | 一手来源 |
| --- | --- | --- | --- |
| 交易消息 | `StartTransaction`、交易内 `MeterValues`、`StopTransaction` | 统一为 `TransactionEvent`，以 `Started`、`Updated`、`Ended` 区分 | [1.6 §3.7](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)，[2.0.1 E04/E08/E12](https://openchargealliance.org/download/caaab79c63336ff203104d9940c8eba29adb7d324c384e0578f7f3b7265e03ac/) |
| transactionId | CSMS 在 `StartTransaction.conf` 分配；最终取不到时后续消息使用 `-1` | Charging Station（充电站）生成，生命周期内不应复用；推荐 UUID | [1.6 Errata §3.18](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)，[2.0.1 E §1.2](https://openchargealliance.org/download/caaab79c63336ff203104d9940c8eba29adb7d324c384e0578f7f3b7265e03ac/) |
| 离线标识 | 没有专用字段；CSMS 只能从历史时间戳等信息推断 | 离线期间发生的 `TransactionEventRequest` 必须令 `offline=true` | [1.6 §3.7](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)，[2.0.1 E04.FR.03、E12.FR.02](https://openchargealliance.org/download/caaab79c63336ff203104d9940c8eba29adb7d324c384e0578f7f3b7265e03ac/) |
| 顺序与完整性 | 交易消息 `SHOULD` 尽快按 chronological order（时间顺序）交付；新交易消息 `SHALL` 等旧队列清空 | 明确允许消息到达顺序不同于事件发生顺序，以每笔交易的 `seqNo` 检查完整性 | [1.6 §3.7](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)，[2.0.1 E §1.3.2](https://openchargealliance.org/download/caaab79c63336ff203104d9940c8eba29adb7d324c384e0578f7f3b7265e03ac/) |
| 失败重试 | `TransactionMessageAttempts`、`TransactionMessageRetryInterval` | `MessageAttempts[TransactionEvent]`、`MessageAttemptInterval[TransactionEvent]` | [1.6 §3.7.1、§9.1.31–32](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)，[2.0.1 E13、Referenced Components §2.1.10–11](https://openchargealliance.org/download/caaab79c63336ff203104d9940c8eba29adb7d324c384e0578f7f3b7265e03ac/) |
| 全消息队列 | 规范只强制交易相关消息离线入队 | 可选 `QueueAllMessages`；默认 `false` 时仍只保证交易消息及其他另有要求的消息 | [1.6 §3.7](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)，[2.0.1 Referenced Components §2.1.9](https://openchargealliance.org/download/caaab79c63336ff203104d9940c8eba29adb7d324c384e0578f7f3b7265e03ac/) |
| 查询待发状态 | 没有标准操作 | `GetTransactionStatus` 可查询指定交易或全站是否还有待发交易消息 | [2.0.1 E14](https://openchargealliance.org/download/caaab79c63336ff203104d9940c8eba29adb7d324c384e0578f7f3b7265e03ac/) |

## 3. OCPP 1.6J 事实基线

### 3.1 离网授权和离线开始交易

1. 充电桩在通信或 Central System（中心系统）不可用时被视为 offline（离线）。充电桩 `MAY` 使用 Authorization Cache（授权缓存）和/或 Local Authorization List（本地授权列表）做本地授权；`LocalAuthorizeOffline` 控制离线时是否以这两类本地信息开始交易。`LocalPreAuthorize` 则控制在线时是否可不等待中心系统响应，不应与离网授权混为一项。[OCPP 1.6 Edition 2 §3.5、§9.1.12–13](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

2. Authorization Cache 是可选能力。若实现，缓存语义 `SHOULD` 包含最新收到的有效和无效标识；收到 `Authorize.conf`、`StartTransaction.conf`、`StopTransaction.conf` 中的 `IdTagInfo` 时更新；条目到期后 `SHALL` 转为 expired；缓存值 `SHOULD` 使用非易失存储并跨 reboot、reset 和断电保留。[OCPP 1.6 Edition 2 §3.5.1；OCPP 1.6 Errata §3.4](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

3. Local Authorization List 由中心系统通过 `SendLocalList` 同步。充电桩 `SHALL NOT` 以其他方式修改该协议列表；列表 `SHOULD` 放在非易失存储并跨 reboot 和断电保留。若列表与缓存都存在，同一标识的列表项 `SHALL` 优先于缓存项，列表中的标识 `SHALL NOT` 再加入缓存。[OCPP 1.6 Edition 2 §3.5.2–3.5.3](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

4. Unknown Offline Authorization（未知标识离线授权）是可选能力，由可选配置键 `AllowOfflineTxForUnknownId` 表示。启用后，真正未被本地列表或缓存明确识别的标识 `MAY` 被离线放行；本地列表中状态为 `Invalid`、`Blocked`、`Expired` 的项，以及因时间经过而已过期的项，`MUST` 被拒绝。[OCPP 1.6 Edition 2 §3.5.4、§9.1.1](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

5. 连接恢复后，充电桩 `SHALL` 为每笔离线授权的交易发送 `StartTransaction.req`。若返回的 `StartTransaction.conf.idTagInfo.status` 不是 `Accepted` 且交易仍在进行，规范根据 `StopTransactionOnInvalidId` 等配置给出停止或仅停止能量输送的处理分支；离线放行不等于恢复后忽略中心系统授权结果。[OCPP 1.6 Edition 2 §3.5.4](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

### 3.2 离线结束交易和强制入队范围

`StartTransaction.req`、`StopTransaction.req`、periodic（周期）或 clock-aligned（时钟对齐）的 `MeterValues.req` 被规范统称为 transaction-related messages（交易相关消息）。离线时，充电桩 `MUST` 把所有本来在线会发送的这些消息入队；因此，交易在断网期间开始、继续采样或结束，都不会免除相应交易消息的生成和补发义务。[OCPP 1.6 Edition 2 §3.7](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

该强制集合不包括所有 OCPP 消息。队列存在积压时，新产生的非交易消息 `MAY` 立即发送，不必等交易队列清空；规范举例包括 `Authorize` 和通知类请求。[OCPP 1.6 Edition 2 §3.7](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

### 3.3 队列顺序和重连补发

1. 充电桩 `SHOULD` 尽快按 chronological order 交付交易相关消息。只要交易消息队列尚未清空，新产生的交易消息就 `SHALL` 等待，以保证交易消息始终按时间顺序交付。[OCPP 1.6 Edition 2 §3.7](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

2. §3.7 使用充电桩级的单数 `transaction-related message queue`，且没有把顺序要求限定为“每笔交易内部”。它同时要求所有新的交易消息等待旧队列清空。规范没有另行定义“先完整回放一笔交易、再回放下一笔交易”的例外。[OCPP 1.6 Edition 2 §3.7](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

3. 中心系统收到长时间排队的历史消息时，除旧时间戳等线索外不会得到专用 offline 标志；中心系统 `SHOULD` 像处理其他同类消息一样处理它。[OCPP 1.6 Edition 2 §3.7](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

4. OCPP-J 的 reconnecting 条款说，单纯 WebSocket 重连时，若 `BootNotification` 的元素自上次连接后未改变，充电桩不应再次发送 `BootNotification`。与之不同，真正 boot/reboot 后必须发送 `BootNotification`；在成功完成规定的注册阶段前，不得先发送遗留缓存消息。[OCPP-J 1.6 §5.4；OCPP 1.6 Edition 2 §4.2](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

5. `StatusNotification` 有独立的离线恢复规则，并不属于上述交易队列：重连后，状态在离线期间改变时充电桩 `SHOULD` 报当前状态，`MAY` 报离线期间发生的错误，`SHOULD NOT` 重放既不反映当前状态也不报告错误的历史状态变化；实际发送的状态通知 `MUST` 按其描述事件的发生顺序发送。[OCPP 1.6 Edition 2 §4.9](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

### 3.4 `TransactionMessageAttempts` 与 `TransactionMessageRetryInterval`

1. 两个键都是 OCPP 1.6 Core Profile 的 required 配置键。`TransactionMessageAttempts` 是中心系统无法处理交易消息时充电桩提交该消息的总尝试次数；`TransactionMessageRetryInterval` 是重新提交前的基础等待秒数。[OCPP 1.6 Edition 2 §9.1.31–9.1.32](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

2. 第一次失败后，只要同一消息继续得到 failure to process（处理失败），且尚未达到 attempts 上限，充电桩 `SHOULD` 再发。每次重发前的等待为 `TransactionMessageRetryInterval × 此前已经发送该消息的次数`。[OCPP 1.6 Edition 2 §3.7.1](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

3. 官方示例为 attempts=3、interval=60：首次发送失败后等 60 秒重发；第二次失败后等 120 秒进行第三次、也是最终尝试；最终仍失败时，充电桩 `SHOULD` 丢弃该消息并继续下一条。因此 attempts=3 表示总共三次发送，不是“首次发送外再重试三次”。[OCPP 1.6 Edition 2 §3.7.1](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

4. OCPP 1.6 §3.7.1 同时提到 response 和 failure to respond，并把判定交给 OCPP-J/OCPP-S 文档。OCPP-J 1.6 Errata 补充：服务器需要主动报告 failure to process 时 `SHALL` 使用 `CALLERROR`；原 OCPP-J 规范另行定义 request timeout 为“未收到响应且实现自行选定的超时已过去”，超时时长由实现选择。两处联读表明 timeout 是规范预期的 failure-to-respond 场景，但 1.6 没有一句独立的 `MUST/SHALL` 明说 timeout 必须消耗一次 `TransactionMessageAttempts`。[OCPP 1.6 Edition 2 §3.7.1；OCPP-J 1.6 Errata §3.3；OCPP-J 1.6 §4.1.1](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

### 3.5 无法取得 transactionId 的异常路径

正常情况下，中心系统在 `StartTransaction.conf` 中分配 transactionId。若 `StartTransaction.req` 经反复尝试仍无法交付，或中心系统无法交付 `StartTransaction.conf`，充电桩无法取得 transactionId；此时充电桩 `SHALL` 令该交易后续的交易相关消息使用 `transactionId=-1`，中心系统 `SHALL` 像这些消息引用有效 transactionId 一样响应，避免充电桩被永久阻塞。[OCPP 1.6 Errata §3.18](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

`-1` 是上述最终无法取得中心系统 transactionId 时的 fallback（后备路径），不是所有离线交易的通用临时 transactionId。[OCPP 1.6 Errata §3.18、§3.54](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

### 3.6 重发 Message ID、重复消息与幂等边界

1. 2025-04 的 OCPP-J 1.6 Errata 要求，一个新 `CALL` 的 Message ID 必须不同于同一发送者针对同一充电站标识在任意 WebSocket 连接上使用过的其他 `CALL` Message ID；但 retried message（重试消息，例如超时未收到响应）`MAY` 复用原 Message ID。`CALLRESULT`/`CALLERROR` 的 ID 必须等于对应 `CALL` 的 ID。[OCPP-J 1.6 Errata §3.1](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

2. 上述条款只规定 RPC 关联标识的生成和允许复用。已核对的 OCPP 1.6、OCPP-J 1.6 及其 Errata 没有规定中心系统必须以 Message ID 对 `StartTransaction`、`MeterValues`、`StopTransaction` 实现跨连接的业务级 deduplication（去重），也没有给这些消息增加独立 idempotency key（幂等键）。因此不能把“重试复用 Message ID”表述为“协议保证不会重复执行业务”。[OCPP-J 1.6 §4.1.4、§4.2；OCPP-J 1.6 Errata §3.1](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

3. 若请求已被中心系统处理、但响应在网络中丢失，发送方仅凭 timeout 不能区分“请求未到达”和“请求已执行但响应丢失”。OCPP-J 允许此时重试，却没有在 1.6 中给出端到端 exactly-once（恰好一次）保证。[OCPP-J 1.6 §4.1.1；OCPP-J 1.6 Errata §3.1](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

### 3.7 MeterValues、`transactionData` 与容量降级

1. `MeterValueSampleInterval` 和/或 `ClockAlignedDataInterval` 大于 0 时，充电桩 `SHALL` 按相应间隔发送 `MeterValues`；这些周期或时钟对齐消息在离线时属于必须入队的交易消息。[OCPP 1.6 Errata §3.15；OCPP 1.6 Edition 2 §3.7](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

2. sampled 和 clock-aligned readings `MAY` 作为交易期间的独立 `MeterValues.req` 报告，也可放进 `StopTransaction.req.transactionData`。`StopTxnSampledData` 和 `StopTxnAlignedData` 决定后者包含哪些 measurand（测量量）；两者都为空字符串时，充电桩 `SHALL NOT` 在 `StopTransaction.req` 中放 meter values。[OCPP 1.6 Edition 2 §3.16；OCPP 1.6 Errata §3.14.5](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

3. 若支持 Errata 新增的可选 `StopTransactionMaxMeterValues`，当收集量超过该上限时充电桩 `MAY` 丢弃中间值；start 和 stop meter values `SHALL` 永不丢弃。Errata 还 `RECOMMENDED` 在配置 transactionData 时总是提供各配置 measurand 的 `Transaction.Begin` 和 `Transaction.End` 值。[OCPP 1.6 Errata §3.16.6、§3.91](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

4. `transactionData` 是规范允许的交易结束汇总载体，但没有废除第 1 条中已配置的独立周期/时钟对齐 `MeterValues` 发送义务。[OCPP 1.6 Edition 2 §3.7、§3.16；OCPP 1.6 Errata §3.15](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

### 3.8 ClockAlignedData 与本地时间

1. `ClockAlignedDataInterval` 把一天从 `00:00:00` 起划分为等长聚合区间；值为 0 表示不传 clock-aligned data。区间由 ISO 8601 的开始时间及可选 duration 标识，区间数据在区间结束时发送并携带区间开始时间戳。[OCPP 1.6 Edition 2 §3.16.2、§9.1.5](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

2. OCPP 1.6 不强制一种时区，但为互操作性强烈建议所有时间使用 UTC。实现 `MUST` 使用 ISO 8601；接收方必须能处理小数秒和时区偏移。[OCPP 1.6 Edition 2 §3.14–3.15](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

3. `BootNotification.conf` 和 `Heartbeat.conf` 都提供中心系统 `currentTime`。Boot Accepted 后 `RECOMMENDED` 用该时间同步内部时钟；OCPP-J 说明 WebSocket Ping/Pong 不能替代此功能，并建议至少每天保留一次 OCPP Heartbeat 以保证时钟正确。[OCPP 1.6 Edition 2 §4.2、§6.5；OCPP-J 1.6 §5.3](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

4. 已核对条款没有规定：离线期间本地时钟错误时如何重写已经记录的历史时间戳、时钟同步发生跳变时如何重排旧消息，或相同时间戳消息的稳定排序规则。

### 3.9 与离网数据有关的安全边界

1. OCPP-J 1.6 要求通信始终依赖安全网络，或使用 OCPP-J over TLS；中心系统 `SHOULD NOT` 从互联网接受未加密 OCPP-J。HTTP Basic 认证被定义为用于 TLS 已加密连接，若在明文连接上使用，观察网络流量的人可取得凭据并冒充充电桩。[OCPP-J 1.6 §6–6.2.2](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

2. OCPP-J 1.6 明确其安全范围是充电桩与中心系统之间连接的认证和加密；它不保证 meter value 从电表到中心系统全链路未被篡改，也不处理驾驶员认证和物理篡改。[OCPP-J 1.6 §6.2.3](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

3. OCPP 1.6 对 Authorization Cache 和 Local Authorization List 有非易失保留建议，但已核对的离线队列条款没有规定队列落盘格式、静态加密、密钥管理或访问控制，也没有强制交易消息队列必须使用哪一种持久化介质。[OCPP 1.6 Edition 2 §3.5、§3.7](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)

## 4. OCPP 2.0.1：仅列迁移差异

### 4.1 统一交易事件与离线标志

- Charging Station 自己生成 transactionId；它对该站必须唯一，整个设备生命周期内不应复用，规范 `RECOMMENDED` 使用 UUID。[OCPP 2.0.1 Edition 4 Part 2，E §1.2](https://openchargealliance.org/download/caaab79c63336ff203104d9940c8eba29adb7d324c384e0578f7f3b7265e03ac/)
- 离线开始生成 `TransactionEvent(eventType=Started)`，离线期间的更新生成 `Updated`，离线结束生成 `Ended`。离线时 Charging Station `MUST` 将本来要发送的全部 `TransactionEventRequest` 入队；恢复后 `MUST` 发送，并对离线期间发生的事件令 `offline=true`。[OCPP 2.0.1 E04.FR.01–04、E08.FR.04–08、E12.FR.01–02](https://openchargealliance.org/download/caaab79c63336ff203104d9940c8eba29adb7d324c384e0578f7f3b7265e03ac/)
- 若 Charging Station 在已有未发消息时转为 offline，仍在队列中的每条消息 `SHALL` 标为 Offline。[OCPP 2.0.1 E11.FR.07](https://openchargealliance.org/download/caaab79c63336ff203104d9940c8eba29adb7d324c384e0578f7f3b7265e03ac/)

### 4.2 顺序、完整性和重试

- 2.0.1 明确承认重试会导致 `TransactionEventRequest` 的到达顺序不同于事件发生顺序。每个 EVSE 维护序号；交易开始时 `SHOULD` 从 `seqNo=0` 开始（持续递增实现也允许），每生成一条 TransactionEvent 后 `SHALL` 加 1。CSMS 可用 Started、Ended 及中间连续 seqNo 检查信息完整性。[OCPP 2.0.1 E §1.3.2–1.3.2.1](https://openchargealliance.org/download/caaab79c63336ff203104d9940c8eba29adb7d324c384e0578f7f3b7265e03ac/)
- `MessageAttempts[TransactionEvent]` 和 `MessageAttemptInterval[TransactionEvent]` 是 required 变量。E13 把“CSMS 不接受”和“MessageTimeout 内不响应”都纳入重试场景；等待同样是基础间隔乘以前序发送次数。最终失败时 Charging Station `SHALL` 丢弃该消息并继续下一条，强度高于 1.6 的 `SHOULD discard`。[OCPP 2.0.1 E13、Referenced Components §2.1.10–11](https://openchargealliance.org/download/caaab79c63336ff203104d9940c8eba29adb7d324c384e0578f7f3b7265e03ac/)
- 官方 Part 6 用 `TC_E_41_CS`/`TC_E_42_CS` 测试无响应 timeout 重试，用 `TC_E_50_CS`/`TC_E_51_CS` 测试 `CALLERROR` 重试；测试明确校验发送总次数等于配置 attempts，并校验线性递增间隔。[OCPP 2.0.1 Edition 4 Part 6 Test Cases；Errata 2026-06 §6.2.11](https://openchargealliance.org/download/caaab79c63336ff203104d9940c8eba29adb7d324c384e0578f7f3b7265e03ac/)
- OCPP-J 2.0.1 与更新后的 1.6J Errata 一样：新 CALL 的 Message ID 跨同一充电站标识的连接必须唯一；重试消息 `MAY` 复用原 ID。它仍是 RPC 关联规则，不是业务级 exactly-once 保证。[OCPP 2.0.1 Part 4 §4.1.4](https://openchargealliance.org/download/caaab79c63336ff203104d9940c8eba29adb7d324c384e0578f7f3b7265e03ac/)

### 4.3 队列容量和可查询性

- `QueueAllMessages` 是可选变量，默认 `false`。为 `true` 时所有消息都会排队直到交付；为 `false` 时只保证 Transaction-related 及其他条款另行要求的消息。内存不足时，`TransactionEvent` 必须最后丢；丢计量数据时必须先丢中间值，不能丢 start/end 值。[OCPP 2.0.1 Referenced Components §2.1.9](https://openchargealliance.org/download/caaab79c63336ff203104d9940c8eba29adb7d324c384e0578f7f3b7265e03ac/)
- `GetTransactionStatus` 允许 CSMS 查询指定 transactionId 是否仍有消息在队列，也允许不带 transactionId 查询全站是否存在待发交易消息。[OCPP 2.0.1 E14](https://openchargealliance.org/download/caaab79c63336ff203104d9940c8eba29adb7d324c384e0578f7f3b7265e03ac/)

### 4.4 授权、时间和安全

- Authorization Cache、Local Authorization List、Unknown Offline Authorization 仍存在，变量分别变为 `AuthCacheEnabled`、`LocalAuthList*`、`OfflineTxForUnknownIdEnabled`。列表项对同标识仍 `SHALL` 优先于缓存项。2.0.1 另外 `RECOMMENDED` 安全存储缓存中的个人信息，例如只存 idToken 哈希。[OCPP 2.0.1 C §1.3–1.5](https://openchargealliance.org/download/caaab79c63336ff203104d9940c8eba29adb7d324c384e0578f7f3b7265e03ac/)
- 2.0.1 时间值 `SHALL` 使用 RFC 3339，强烈 `RECOMMENDED` 使用带 `Z` 的 UTC。`ClockCtrlr.TimeSource` 是 required 变量，可列出 Heartbeat、NTP、GPS、RTC、移动网络等来源；本地 `TimeZone`/`TimeOffset` 主要用于显示和 `useLocalTime=true` 的 charging profile。[OCPP 2.0.1 Part 2 §3.1、Referenced Components §2.1.24–32](https://openchargealliance.org/download/caaab79c63336ff203104d9940c8eba29adb7d324c384e0578f7f3b7265e03ac/)
- 2.0.1 定义三种 Security Profile：Profile 1 为明文传输加 Basic Auth，只应在可信网络使用；Profile 2 为 TLS 加 Basic Auth；Profile 3 为 TLS 双向证书认证。没有实现安全措施的 OCPP 2.0.1 不被视为有效实现；设备时间不正确会妨碍服务器证书校验。[OCPP 2.0.1 Part 2 A §1.3](https://openchargealliance.org/download/caaab79c63336ff203104d9940c8eba29adb7d324c384e0578f7f3b7265e03ac/)

## 5. 规范没有替实现者决定的事项

以下结论是“在已核对的一手材料中没有相应规则”，不是实现建议：

1. OCPP 1.6 没有规定交易消息队列的数据库结构、持久化介质、崩溃一致性、容量值或 dead-letter（死信）格式；只规定离线入队、顺序和失败后的处理语义。[OCPP 1.6 Edition 2 §3.7–3.7.1](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)
2. OCPP 1.6 没有定义相同时间戳交易消息的 tie-breaker（决胜规则），也没有定义独立的生成序号。`seqNo` 是 2.0.1 的机制，不能反称为 1.6 的协议要求。[1.6 §3.7](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)，[2.0.1 E §1.3.2](https://openchargealliance.org/download/caaab79c63336ff203104d9940c8eba29adb7d324c384e0578f7f3b7265e03ac/)
3. OCPP 1.6 §3.7.1 提到 failure to respond，OCPP-J 又定义 timeout，因此可以联读为 timeout 是预期重试场景；但已核对的 1.6 文本没有直接规定 timeout 必须计入 `TransactionMessageAttempts`。2.0.1 E13 和官方测试才明确把 timeout 纳入相应 attempts 机制。[OCPP 1.6 Edition 2 §3.7.1；OCPP-J 1.6 §4.1.1](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)，[2.0.1 E13/Part 6](https://openchargealliance.org/download/caaab79c63336ff203104d9940c8eba29adb7d324c384e0578f7f3b7265e03ac/)
4. OCPP 1.6J 没有提供跨断线重试的业务级幂等保证，也没有规定第三方 CSMS 必须以 Message ID 去重交易操作。[OCPP-J 1.6 §4.1.4、§4.2；Errata §3.1](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)
5. OCPP 1.6 没有规定离线时钟漂移、恢复同步后的历史时间戳修正或重排算法。[OCPP 1.6 Edition 2 §3.14–3.16、§4.2](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)
6. OCPP 1.6 没有专门规定离线交易队列的静态加密；OCPP-J 的 TLS 只覆盖传输中的连接安全。[OCPP-J 1.6 §6.2.3；OCPP 1.6 Edition 2 §3.7](https://openchargealliance.org/download/7b06ab293c68fb6b4f4ae0960e502579c1c5516aa2b7acf0fdcedba585b9ea7f/)
