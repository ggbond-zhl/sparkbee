# Issue tracker: Local Markdown

本仓库的 Issue 和 PRD 以 Markdown 文件形式保存在 `.scratch/` 下。

## 约定

- 每个功能一个目录：`.scratch/<feature-slug>/`
- PRD 文件为：`.scratch/<feature-slug>/PRD.md`
- 实现 Issue 位于：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始编号
- Triage 状态写在每个 Issue 文件靠前位置的 `Status:` 行中
- 评论和讨论历史追加到文件底部的 `## Comments` 标题下

## 当技能要求“publish to the issue tracker”

在 `.scratch/<feature-slug>/` 下创建新文件，必要时同时创建目录。

## 当技能要求“fetch the relevant ticket”

读取用户提供路径对应的文件。通常用户会直接给出文件路径或 Issue 编号。
