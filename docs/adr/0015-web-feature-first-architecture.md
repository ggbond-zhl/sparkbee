# 前端采用 feature-first 工程结构

SparkBee 前端采用 feature-first + shared infrastructure 结构：`app` 只负责路由、QueryClient 等应用装配，`features/charging-points` 承载充电桩列表相关的 API、model、UI 和 route 入口，`components/ui` 保持为 shadcn/ui 基础组件目录。这样做是为了避免路由文件同时拥有查询、表单、状态和大块 UI，同时保留 shadcn CLI 的默认生成路径。

React Query 只管理服务端状态，Zustand 只管理筛选、选中项、面板状态等本地 UI 状态；前端 API 层复用 `@spark-bee/contracts` 解析服务端响应，前端表单 schema 和 query options 放在对应 feature 的 `model` 下。
