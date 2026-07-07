# 弃用枪口 maxPower 配置并使用电压电流派生模拟功率

SparkBee V1 不在枪口配置中表达相数，也不把 `maxPower` 作为用户可配置项；用户必须维护枪口额定电压和枪口额定电流，运行时用二者相乘派生用于 `MeterValues` 的模拟功率和电量递增。OCPP `MeterValues` 表达的是 `Power.Active.Import`、`Current.Import`、`Voltage` 等采样值，而不是一个可配置的 connector `maxPower`；保留旧数据库和响应字段仅为兼容，运行时和界面不再主动依赖它。这个简化会低估部分三相 AC 场景，但符合 SparkBee V1 作为调试台而非物理仿真器的边界。

## Consequences

- 新增和编辑枪口时，枪口额定电压和枪口额定电流必须由写入契约保证非空。
- 历史枪口仍可读取；如果历史数据缺少电压或电流，保存时必须补齐。
- `maxPower` 暂不从数据库和响应中删除，也不改成计算字段；后续可通过独立迁移清理。
