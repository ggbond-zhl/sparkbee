# 运行曲线使用结构化充电采样

运行调试台的枪口曲线图使用 `transaction.meterValue` 结构化事件中的累计电量、功率、电流和电压，而不从协议报文 JSON 中解析 MeterValues。这样图表与枪口状态摘要共享同一条运行事件边界；代价是 Actor、Server projection 和前端事件模型需要同步扩展采样字段，但可以避免图表耦合 OCPP 报文格式。
