---
title: 召回条数与上下文预算的权衡
description: 拖动召回条数 K 与送模型条数 M，实时读出 recall@K 曲线、命中率与单次上下文成本，再用三道手写挑战题检验「加大 K 到底值不值」这笔账。
status: built
---

# 召回条数与上下文预算的权衡

<iframe src="main.html" height="622px" width="100%" scrolling="no"></iframe>

[全屏运行 召回条数与上下文预算的权衡](./main.html){ .md-button .md-button--primary }

## 描述

拖动召回条数 K 与送模型条数 M，实时读出 recall@K 曲线、命中率与单次上下文成本，再用三道手写挑战题检验「加大 K 到底值不值」这笔账。

- recall@K = 名次不超过 K 的题数 / 100；上下文成本 = M × 400 / 1000 × 0.004 元。

## 学习目标

学习者将根据正确块名次分布计算 recall@K，并在「送模型条数 M 的命中率不低于 0.67」的前提下选出成本最小的 M。三题标准值 recall@20 = 0.80、首次达到 0.90 的 K = 50、最小 M = 10 且成本 0.0160 元全部命中算掌握。

**Bloom 层级**：Evaluate（评价）

## 使用建议

1. 先拖 K 从 5 到 100，注意 20 之后曲线明显变平，50 才首次越过 0.90 达标线。
2. 再拖 M，观察命中率与成本同时上升：成本随 M 线性增长，命中率先快后慢。
3. 点「开始挑战」依次作答三题，每题两次机会；答案在提交后立即揭晓，答错高亮名次分布表对应区间。
4. 最后展示完整推导：recall@30 = 0.88 未达标，recall@50 = 0.93 首次达标。

## 嵌入本教材

```html
<iframe src="https://EdwardChenz.github.io/ai-course/sims/recall-topk-tradeoff/main.html" height="622" scrolling="no"></iframe>
```

## 元数据

- 作者：EdwardChenz
- 章节：03-rag-basics
- 教学法：探索曲线 → 手写作答 → 即时校验（Explore-Predict-Check）
- 前置知识：召回率 recall@K、重排后送模型条数 M、块大小 400 token、输入价格口径
- 控件：2 个滑块（K、M）、3 个按钮、4 个数字输入框
- 画布高度：470 像素绘图区 + 150 像素控件区（iframe 高度 622 像素）
