请始终使用简体中文沟通，除非我明确要求使用英文。
如果引用英文术语，请保留英文术语并用中文解释。

# SparkBee

## 采用测试驱动开发

## Git 分支管理

- `main`：生产稳定分支，只能合入已发布或可发布代码，禁止直接提交。
- `develop`：日常集成分支，作为测试环境来源，允许直接提交和推送；推送前必须完成相关测试、类型检查和构建验证。
- `feature/*`：可选功能分支，从 `develop` 拉出；较大或需要独立审查的改动通过 Squash merge 合入 `develop`，合入后删除分支。
- `release/*`：发布分支，从 `develop` 拉出，只允许修复 bug、修改配置和补充文档；使用 Merge commit 合入 `main`，必要时同步合入 `develop`。
- `hotfix/*`：生产紧急修复分支，从 `main` 拉出；使用 Merge commit 分别合入 `main` 和 `develop`，合入后删除分支。

禁止使用 Rebase merge 合入分支。

### 分支命名规范

feature/功能名
release/版本号
hotfix/紧急问题名

### Git Commit 规范

type: subject

subject 要求：

- 使用中文
- 简短清晰，建议不超过 30 个字符

type 可选值：feat,fix,refactor,perf,style,docs,test,chore

## 后端 API 文档规范

- 业务资源路径使用小写 kebab-case，例如 `/charging-points`，不要使用 camelCase。
- 路径参数中父资源主键使用 `{id}`；同一路径出现子资源主键时，使用 `{资源名Id}` 避免重名，例如 `/charging-points/{id}/connectors/{connectorId}`。
- 新增或修改后端接口时，必须同步维护 OpenAPI/Scalar 文档。
- 接口级 `summary`、`description` 和响应说明使用中文，写在后端 route 的 `createRoute` metadata 中。
- 请求参数、请求体和响应字段说明使用中文，优先写在 `@spark-bee/contracts` 的 Zod schema metadata 中。
- 测试需要覆盖关键接口是否出现在 `/openapi.json`，以及重要中文说明是否存在。

## 前端 UI 规范

- 能使用 shadcn/ui 组件时优先使用 shadcn/ui 组件，再进行轻量业务组合。

## 四个原则

### 1. 编码前思考

**不要假设。不要隐藏困惑。呈现权衡。**

LLM 经常默默选择一种解释然后执行。这个原则强制明确推理：

- **明确说明假设** — 如果不确定，询问而不是猜测
- **呈现多种解释** — 当存在歧义时，不要默默选择
- **适时提出异议** — 如果存在更简单的方法，说出来
- **困惑时停下来** — 指出不清楚的地方并要求澄清

### 2. 简洁优先

**用最少的代码解决问题。不要过度推测。**

对抗过度工程的倾向：

- 不要添加要求之外的功能
- 不要为一次性代码创建抽象
- 不要添加未要求的"灵活性"或"可配置性"
- 不要为不可能发生的场景做错误处理
- 如果 200 行代码可以写成 50 行，重写它

**检验标准：** 资深工程师会觉得这过于复杂吗？如果是，简化。

### 3. 精准修改

**只碰必须碰的。只清理自己造成的混乱。**

编辑现有代码时：

- 不要"改进"相邻的代码、注释或格式
- 不要重构没坏的东西
- 匹配现有风格，即使你更倾向于不同的写法
- 如果注意到无关的死代码，提一下 —— 不要删除它

当你的改动产生孤儿代码时：

- 删除因你的改动而变得无用的导入/变量/函数
- 不要删除预先存在的死代码，除非被要求

**检验标准：** 每一行修改都应该能直接追溯到用户的请求。

### 4. 目标驱动执行

**定义成功标准。循环验证直到达成。**

将指令式任务转化为可验证的目标：

| 不要这样做... | 转化为...                            |
| ------------- | ------------------------------------ |
| "添加验证"    | "为无效输入编写测试，然后让它们通过" |
| "修复 bug"    | "编写重现 bug 的测试，然后让它通过"  |
| "重构 X"      | "确保重构前后测试都能通过"           |

对于多步骤任务，说明一个简短的计划：

```
1. [步骤] → 验证: [检查]
2. [步骤] → 验证: [检查]
3. [步骤] → 验证: [检查]
```

## Agent skills

### Issue tracker

Issue 和 PRD 使用本仓库内的 Local markdown 文件管理；外部 PR 不作为 triage 入口。详见 `docs/agents/issue-tracker.md`。

### Triage labels

使用五个默认 triage 标签：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。详见 `docs/agents/triage-labels.md`。

### Domain docs

使用 single-context 布局：根目录 `CONTEXT.md` 和 `docs/adr/`。详见 `docs/agents/domain.md`。
