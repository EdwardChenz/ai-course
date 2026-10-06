---
title: Trace 根因定位判定器
description: 六条失败 trace 的 span 观测值。逐条判定第一个出错环节（检索未召回 / 重排 / 上下文压缩 / 生成没答对），再逐条选出该层对应的首要动作，十二项全部锁定后才揭晓。
status: built
---

# Trace 根因定位判定器

<iframe src="main.html" height="742px" width="100%" scrolling="no"></iframe>

[全屏运行 Trace 根因定位判定器](./main.html){ .md-button .md-button--primary }

## 描述

六条失败 trace 的 span 观测值。逐条判定第一个出错环节（检索未召回 / 重排 / 上下文压缩 / 生成没答对），再逐条选出该层对应的首要动作，十二项全部锁定后才揭晓。

- 判定按顺序短路：gold 不在 retrieval 候选 → 检索未召回；在候选不在 top5 → 重排；在 top5 不在 compressed → 上下文压缩；三处都在 → 生成没答对。

## 学习目标

学习者将根据六条失败 trace 的 span 观测值判定每条的第一个出错环节，并说出该层对应的首要动作。六条判定与 Content 表的「应判归因层」列全部一致，且至少四条的首要动作答对时算掌握。

**Bloom 层级**：Analyze（分析）

## 使用建议

1. 先按 retrieval → rerank_top5 → compressed → generation 的顺序短路，找 gold 第一次消失的环节。
2. 判定项下拉框共 12 项：六条归因层判定 + 六条首要动作匹配，每项一次提交。
3. 关键观察：序号 1 与 6 标签相同（检索未召回）但动作完全不同——6 是嵌入服务超时后降级返回空数组的依赖故障。

## 嵌入本教材

```html
<iframe src="https://EdwardChenz.github.io/ai-course/sims/trace-root-cause-locator/main.html" height="742" scrolling="no"></iframe>
```

## 元数据

- 作者：EdwardChenz
- 章节：11-observability-eval
- 教学法：逐条判定 → 全部锁定后揭晓（Judge-Lock-Reveal）
- 前置知识：trace 与 span 的父子关系、gold 块、召回未召回、重排、上下文压缩、生成没答对
- 控件：2 个下拉框（判定项 / 判定值）、2 个按钮
- 画布高度：660 像素绘图区 + 80 像素控件区（iframe 高度 742 像素）
