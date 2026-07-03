# 前端基础组件采用受控 shadcn 重装

SparkBee 前端重装 shadcn/ui 时采用受控重建：保留 `app/ui`、`features/**/ui` 和 `components/data-table` 等业务组合代码，只允许重建 `components/ui` 中的 shadcn 基础组件，并保持当前 `radix-nova`、Radix、Tailwind v4、lucide、neutral 和 Geist 配置不变。这样避免把业务逻辑混入可再生成层，也避免通过卸载 `shadcn` 依赖破坏 `src/styles.css` 对 `shadcn/tailwind.css` 的依赖；重装后必须通过前端 typecheck、test 和 build 验证。
