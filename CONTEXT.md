# SparkBee

SparkBee 是一个可自部署的充电桩模拟调试台，用于让少量虚拟充电桩长期连接到 CSMS，并人工完成 OCPP 充电调试流程。

## Language

**CSMS**:
充电桩通过 OCPP 连接的中心系统，负责接收桩上报并下发远程命令。
_Avoid_: 平台、中心端、后台平台

**桩实例**:
SparkBee 中一个长期存在、可启动或停止的虚拟充电桩，英文上下文统一称为 chargingPoint。它包含 OCPP 协议、CSMS 地址、桩身份和枪口拓扑。
_Avoid_: station、设备、模拟器、充电桩配置

**桩身份**:
桩实例连接 CSMS 时使用的 charge point identity，并参与生成最终 WebSocket 地址。
_Avoid_: 设备编号、桩编号、连接路径

**枪口**:
用户在 V1 前端直接管理的充电连接点。V1 不要求用户理解 EVSE，内部可以映射到协议核心的 EVSE/connector 模型。
_Avoid_: connector、EVSE、插座

**运行状态**:
当前进程中桩实例实际所处的生命周期状态，例如 starting、running 或 stopped。starting 覆盖用户已发起启动但尚未进入 running 的全过程，包括连接中和首次 BootNotification 处理中。
_Avoid_: 连接状态、实时状态

**协议事件**:
协议核心产生的结构化状态变化，例如桩状态、会话状态、授权状态、交易状态和表值事件。
_Avoid_: 日志、回调、消息

**桩事件流**:
某个桩实例对外提供的实时协议事件序列，用于让前端按桩实例观察状态变化和协议交互；即使桩实例当前 stopped，订阅也代表观察它后续的运行变化，删除桩实例会终止这个事件流。
_Avoid_: 全局事件流、SSE 分组、事件频道

**协议报文**:
桩实例与 CSMS 之间收发的 OCPP JSON 消息帧记录。
_Avoid_: 消息、日志、payload

**运行诊断记录**:
SparkBee 为开发和测试排查桩实例内部运行过程而保留的诊断信息，关注内部行为、错误和关键决策点，不作为业务状态来源。
_Avoid_: 日志、协议事件、协议报文

**交易**:
一次从开始充电到结束充电的 OCPP transaction。SparkBee 记录交易用于调试和回看，不把它称为 session。
_Avoid_: 会话、充电会话

**交易交付**:
交易相关协议动作被送达 CSMS 的过程，包括在线送达、离线暂存和恢复连接后的补送。它描述交易如何到达 CSMS，不等同于交易本身。
_Avoid_: 交易同步、报文发送、现场恢复
