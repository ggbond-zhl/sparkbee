# 前端列表使用 Data Table 组合

SparkBee 前端的工作型列表统一通过共享 `DataTable` 组件组合 TanStack Table 与 shadcn/ui `Table`。这样做会比直接在页面里手写 `<TableRow>` 稍重，但能把行模型、选择状态、空态和后续排序/分页等表格能力收拢到一个边界里，同时保持 `components/ui` 只存放 shadcn CLI 生成的基础组件。

`DataTable` 负责表格边框框体、行渲染、空态、选中统计和分页按钮区域；业务页面负责搜索、新增等列表工具栏动作。
