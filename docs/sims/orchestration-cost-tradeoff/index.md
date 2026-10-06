---
title: 单 Agent 与多 Agent 的编排成本对比
description: 三个旋钮（角色数 N、每角色调用次数 C、上下文重读倍数 R）实时算出多 Agent 单任务成本，并求出使成本首次不超过 0.10 元的 R 值。
status: built
---

# 单 Agent 与多 Agent 的编排成本对比

<iframe src="main.html" height="687px" width="100%" scrolling="no"></iframe>

[全屏运行 单 Agent 与多 Agent 的编排成本对比](./main.html){ .md-button .md-button--primary }

## 描述

三个旋钮（角色数 N、每角色调用次数 C、上下文重读倍数 R）实时算出多 Agent 单任务成本，并求出使成本首次不超过 0.10 元的 R 值。

- T = N × C；输入 token = T × 2000 × R；成本 = 输入 token/1000×0.004 + 输出 token/1000×0.012。

## 学习目标

学习者将根据三个旋钮计算多 Agent 单任务成本，并求出使成本首次不超过 0.10 元的上下文重读倍数。三题答案 0.1568 元与 4.5 倍、R = 1.0 与 0.0928 元、省 0.0640 元与 40.8% 全部命中才算掌握。

**Bloom 层级**：Evaluate（评价）

## 使用建议

1. 先拖 N 看倍数如何近似线性增长，再拖 C 看成本翻倍。
2. 把 R 从 2.0 拖到 1.0，注意成本只降约 40.8%——重读倍数是独立的一项乘数。
3. 依次作答三题，每题两次机会；结束后展示完整演算与「预算内选 B、成功率最高选 C」式的取舍结论。

## 嵌入本教材

```html
<iframe src="https://EdwardChenz.github.io/ai-course/sims/orchestration-cost-tradeoff/main.html" height="687" scrolling="no"></iframe>
```

## 元数据

- 作者：EdwardChenz
- 章节：07-multi-agent
- 教学法：调节读数 → 手写作答 → 即时校验（Explore-Predict-Check）
- 前置知识：单任务成本公式、上下文重读倍数、单 Agent 基线 0.0348 元、成本上限 0.10 元
- 控件：3 个滑块、1 个下拉框（题号）、3 个按钮、2 个数字输入框
- 画布高度：500 像素绘图区 + 185 像素控件区（iframe 高度 687 像素）
