# Domain Docs

工程技能探索代码库时，按本文件约定读取本仓库的领域文档。

## 探索前读取这些文件

- 根目录的 `CONTEXT.md`
- 根目录的 `docs/adr/`

如果这些文件不存在，静默继续。不要因为缺少这些文件而主动报错，也不要提前建议创建它们。`domain-modeling` 技能会在术语或决策真正明确时按需创建。

## 文件结构

本仓库使用 single-context 布局：

```text
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-example-decision.md
│   └── 0002-example-decision.md
└── src/
```

## 使用 glossary 中的词汇

当输出内容命名领域概念时，例如 Issue 标题、重构建议、假设或测试名称，应使用 `CONTEXT.md` 中定义的术语。不要漂移到 glossary 明确避免的同义词。

如果需要的概念还没有出现在 glossary 中，这通常是一个信号：要么正在发明项目没有使用的语言，需要重新考虑；要么确实存在领域词汇缺口，可以交给 `domain-modeling` 处理。

## 标出 ADR 冲突

如果输出内容与已有 ADR 冲突，应明确指出，不要静默覆盖。
