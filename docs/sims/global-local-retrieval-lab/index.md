---
title: 全局与局部检索对比台
description: 拖动社区总数 C 与全局取前 K 个社区，观察两条路线的调用链与延迟，再对六道题逐题预测路线、注入块数与总延迟。判据只有一条：问题里有没有点名一个起点实体。
status: built
---

# 全局与局部检索对比台

<iframe src="main.html" height="712px" width="100%" scrolling="no"></iframe>

[全屏运行 全局与局部检索对比台](./main.html){ .md-button .md-button--primary }

## 描述

拖动社区总数 C 与全局取前 K 个社区，观察两条路线的调用链与延迟，再对六道题逐题预测路线、注入块数与总延迟。判据只有一条：问题里有没有点名一个起点实体。

- 局部延迟 = 0.4 + 0.8 = 1.2 秒；全局延迟 = 0.4 + K × 0.6 + 1.1。

## 学习目标

学习者将对六个真实提问逐题判定该走局部检索还是全局检索，并预测注入上下文的块数与总延迟，6 题中至少 5 题路线与块数全对算掌握。

**Bloom 层级**：Analyze（分析）

## 使用建议

1. 先拖 C 与 K，观察全局路线的候选池与延迟变化；C 与 K 同取最小值时全局仍要 2.1 秒，高于局部 1.2 秒。
2. 对 6 题逐题提交路线、块数与延迟；六题全部锁定后自动揭晓。
3. 关键观察：题 1、2、5 走局部各 1.2 秒，题 3、4、6 走全局要 4.5 秒，差别不在准不准，在有没有点名起点实体。

## 嵌入本教材

```html
<iframe src="https://EdwardChenz.github.io/ai-course/sims/global-local-retrieval-lab/main.html" height="712" scrolling="no"></iframe>
```

## 元数据

- 作者：EdwardChenz
- 章节：05-graphrag-hybrid
- 教学法：先探索 → 逐题承诺 → 全部锁定后揭晓（Explore-Promise-Reveal）
- 前置知识：局部检索、全局检索、社区摘要、map-reduce、Top5 社区
- 控件：2 个滑块（C、K）、2 个下拉框（题号 / 路线）、2 个数字输入框（块数 / 延迟）、2 个按钮
- 画布高度：560 像素绘图区 + 150 像素控件区（iframe 高度 712 像素）
