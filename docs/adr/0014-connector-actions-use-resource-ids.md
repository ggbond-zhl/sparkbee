# Connector actions use resource ids

插枪和拔枪 API 使用枪口资源 UUID 作为路径参数，而不是直接暴露协议拓扑中的 EVSE 编号和 OCPP connectorId。前端面向的是 SparkBee 的枪口资源，服务端负责把资源 UUID 映射到协议核心需要的数字编号；这样能避免把协议拓扑细节泄露到用户工作流里，同时保留运行结果中的协议 connectorId 供调试查看。
