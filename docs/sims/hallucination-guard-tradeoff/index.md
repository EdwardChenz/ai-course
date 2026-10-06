---
title: 幻觉抑制策略效果对比
description: 四道质量门禁与六种幻觉抑制配置。逐行给出合格或不合格判定，再提交最终上线配置，全部锁定后才揭晓门禁明细。
status: built
---

# 幻觉抑制策略效果对比

<iframe src="main.html" height="567px" width="100%" scrolling="no"></iframe>

[全屏运行 幻觉抑制策略效果对比](./main.html){ .md-button .md-button--primary }

## 描述

四道质量门禁与六种幻觉抑制配置。逐行给出合格或不合格判定，再提交最终上线配置，全部锁定后才揭晓门禁明细。

- 合格 = 忠实度 ≥ 93% 且 拒答准确率 ≥ 90% 且 P95 ≤ 4.5 秒且 成本 ≤ 0.02 元，四项与运算、无权重。

## 学习目标

学习者将根据四道门禁（忠实度、拒答准确率、P95 延迟、每次成功问答成本）逐条评判六种配置的合格性，并在四条门禁约束下选出唯一可上线的一种配置。六条判定与 Content 表全部一致且最终选择为配置 6 时算掌握。

**Bloom 层级**：Evaluate（评价）

## 使用建议

1. 先看顶部四道门禁，再逐行判合格或不合格（不合格要说出被哪条门禁卡住）。
2. 六条判定与最终配置共 7 次提交，全部锁定后才揭晓；画面只展示当前判定项的明细。
3. 关键观察：配置 5 的质量指标优于配置 6，却因 P95 与成本被否——评测与上线是两件事。

## 嵌入本教材

```html
<iframe src="https://EdwardChenz.github.io/ai-course/sims/hallucination-guard-tradeoff/main.html" height="567" scrolling="no"></iframe>
```

## 元数据

- 作者：EdwardChenz
- 章节：04-rag-advanced
- 教学法：逐条判定 → 锁定后揭晓 → 合成结论（Judge-Lock-Conclude）
- 前置知识：召回 Top50、重排 Top5、阈值拒答、引用约束、二次校验、忠实度、拒答准确率、P95 延迟
- 控件：2 个下拉框（判定项 / 判定值）、2 个按钮
- 画布高度：450 像素绘图区 + 115 像素控件区（iframe 高度 567 像素）
