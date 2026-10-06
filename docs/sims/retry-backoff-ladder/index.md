---
title: 重试退避阶梯
description: 六行重试次数，每行只显示 n，学习者先逐行预测哪种策略总等待更短；六行全部选择后揭晓两种策略的总数与交叉点。
status: built
---

# 重试退避阶梯

<iframe src="main.html" height="737px" width="100%" scrolling="no"></iframe>

[全屏运行 重试退避阶梯](./main.html){ .md-button .md-button--primary }

## 描述

六行重试次数，每行只显示 n，学习者先逐行预测哪种策略总等待更短；六行全部选择后揭晓两种策略的总数与交叉点。

- total_fixed(n) = 2n 秒；total_exp(n) = 2 × (2^n − 1) 秒；n = 1 时两者打平。

## 学习目标

学习者将对比固定间隔与指数退避在六种重试次数下的总等待，并为每种次数选出等待更短的策略。与 Content 表 Correct 列一致算对，n = 1 打平时选任一策略都算对；单次作答答对 ≥ 5 题为掌握。

**Bloom 层级**：Analyze（分析）

## 使用建议

1. 先不做任何计算，直接为 n = 1 到 6 各选一种策略——这一步就是预测。
2. 六行全部选择后自动揭晓，逐行给出两个总数与原因。
3. 关键观察：交叉点在 n = 1 打平，之后固定间隔全胜，且从 n = 4 起差距爆炸式拉大（30 秒对 8 秒）。

## 嵌入本教材

```html
<iframe src="https://EdwardChenz.github.io/ai-course/sims/retry-backoff-ladder/main.html" height="737" scrolling="no"></iframe>
```

## 元数据

- 作者：EdwardChenz
- 章节：01-dev-foundations
- 教学法：全预测后一次性揭晓（Predict-All-Then-Reveal）
- 前置知识：指数退避、固定间隔、总等待公式、熔断器
- 控件：12 个策略按钮（6 行 × 2 列）、2 个按钮（揭晓全部 / 重来）
- 画布高度：480 像素绘图区 + 255 像素控件区（iframe 高度 737 像素）
