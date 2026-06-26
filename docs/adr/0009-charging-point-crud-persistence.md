# ChargingPoint CRUD 的持久化边界

第一阶段后端先实现 chargingPoint 与 connector 两套管理 API：chargingPoint 可以先创建基本配置，connector 通过 `/charging-points/:id/connectors` 单独增删查改，单个 connector 使用 `/charging-points/:id/connectors/:connectorId`。`chargingPoints` 保存 UUID 主键、identity、protocol、centralSystemUrl、厂商型号和可选固件/序列号；`connectors` 保存 UUID 主键、chargingPointId、evseId、connectorId、type、format、powerType、额定电压/电流/功率和 sortOrder。运行态、可用性、协议事件、协议报文和交易历史不进入第一阶段 CRUD 表。

`identity` 不做唯一约束；`centralSystemUrl` 保存 CSMS 基础地址，入库前校验为 `ws://` 或 `wss://`、禁止 query/hash，并去掉路径末尾所有 `/`，不保存也不返回最终 WebSocket URL。`protocol` 使用数据库 enum，当前只包含 `OCPP16J`；connector 的 `type` 使用非空文本，`format` 与 `powerType` 沿用 simulator enum，额定值使用整数 V/A/W。列表接口使用简单分页、按 `createdAt desc` 排序，keyword 只匹配 identity、vendor 和 model；错误响应结构放入 `@spark-bee/contracts`，错误码使用全大写 snake_case，message 使用英文，只有 `VALIDATION_FAILED` 在第一阶段允许返回字段级 details，编号冲突使用 `CONNECTOR_CONFLICT`。

管理 API 阶段不判断 chargingPoint 是否可启动，因此允许 chargingPoint 没有 connector，也允许删除最后一个 connector。chargingPoint 更新允许修改除 `id`、`createdAt`、`updatedAt`、`deletedAt` 之外的基本字段；connector 更新允许修改除 `id`、`chargingPointId`、`sortOrder`、`createdAt`、`updatedAt`、`deletedAt` 之外的配置字段。
