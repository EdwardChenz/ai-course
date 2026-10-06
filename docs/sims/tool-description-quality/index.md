---
title: 工具描述质量与选对率
description: 同一个 query_order 工具的六个 description 版本，按时机、边界、参数格式与长度四项权重打分，与 120 道评测题的实测选对率对照，再完成四道判断题。
status: built
---

# 工具描述质量与选对率

<iframe src="main.html" height="717px" width="100%" scrolling="no"></iframe>

[全屏运行 工具描述质量与选对率](./main.html){ .md-button .md-button--primary }

## 描述

同一个 query_order 工具的六个 description 版本，按时机、边界、参数格式与长度四项权重打分，与 120 道评测题的实测选对率对照，再完成四道判断题。

- Q = 0.30×时机 + 0.30×边界 + 0.25×参数带单位格式 + 0.15×长度项。

## 学习目标

学习者将按四项权重为六个描述版本打分并与选对率对照，三道判断题标准值（最高选对率版本 E、质量分高于 D 但选对率低于 D 的版本 F、选对率低于 0.85 的版本共 4 个）全部答对，且能算出 F 的质量分 0.85。

**Bloom 层级**：Analyze（分析）

## 使用建议

1. 先照四项标准给六个版本逐项核对，再按公式手算质量分；画面右侧给出按公式重算的对照列。
2. 依次作答四题（前三题为选项题，第四题手填 F 的质量分），每题两次机会。
3. 最后点「展示对照结论」并排看质量分排序与选对率排序：E > F > D > C > A = B 对 E 0.91 > D 0.85 > F 0.83。

## 嵌入本教材

```html
<iframe src="https://EdwardChenz.github.io/ai-course/sims/tool-description-quality/main.html" height="717" scrolling="no"></iframe>
```

## 元数据

- 作者：EdwardChenz
- 章节：06-mcp-tools
- 教学法：先打分 → 再对照实际效果（Score-Then-Compare）
- 前置知识：工具 Schema 设计、description 四项标准、JSON Schema 的 pattern 与 additionalProperties
- 控件：1 个下拉框（题号）、1 组单选或 1 个数字输入框（答案）、3 个按钮
- 画布高度：600 像素绘图区 + 115 像素控件区（iframe 高度 717 像素）
