# 迁移旧 simulator core 而不是重写

SparkBee 复用旧 SparkSim 的模型、codec、validator、session 和 OCPP 1.6 runtime，并将它们迁入 `packages/simulator-core`。直接重写会让协议行为和离线/远程命令细节重新冒险；迁移后再替换 Node transport，可以把新项目风险集中在服务化编排层。
