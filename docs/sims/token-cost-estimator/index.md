---
title: Token 费用估算器
description: 交互式估算器：拖动中文字符数、英文单词数与输出 tokens，观察输入 token 数与请求费用的变化，并用三道挑战题检验计算能力。
status: built
---

# Token 费用估算器

<iframe src="main.html" height="482px" width="100%" scrolling="no"></iframe>

[全屏运行 Token 费用估算器](./main.html){ .md-button .md-button--primary }

## 描述

给学习者一个可拖动的沙盘，先看清公式，再动手算题。探索模式下三个滑块（中文字符数 C、英文单词数 W、输出 tokens O）实时显示输入 token 数与总费用；挑战模式下三道题要求学习者手写答案并提交检验，掌握标准为 3 题全对。

- **输入 tokens** = ceil(C / 1.5) + ceil(W / 0.75)
- **总费用** = 输入 tokens / 1000 × 0.004 + 输出 tokens / 1000 × 0.012（示意价）

## 学习目标

学习者将针对中英文混合提示，在给定字符数与输出 token 数条件下，算出输入 token 数与请求总费用，费用误差不超过 ±0.001 元。

**Bloom 层级**：Apply（应用）

## 使用建议

1. 先在探索模式拖动"O 输出 tokens"，注意输入不变时费用依然上涨。
2. 点"开始挑战"，第一题要求手写 1500 中文字符 + 800 输出 tokens 的费用。
3. 两次机会；第二次仍错会展示标准答案与演算过程。

## 嵌入本教材

```html
<iframe src="https://EdwardChenz.github.io/ai-course/sims/token-cost-estimator/main.html" height="482" scrolling="no"></iframe>
```

## 元数据

- 作者：EdwardChenz
- 教学法：预测 → 提交 → 校验（Predict-Commit-Check）
- 前置知识：token 与上下文窗口概念、教学估算公式
- 控件：3 个滑块、3 个按钮、2 个数字输入框