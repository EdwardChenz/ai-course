---
title: 显存与并发容量估算器
description: 四组参数（模型档位、量化精度、上下文长度、并发路数）实时读出权重、KV、开销与显存合计，再逐条判定六组配置能否装下，并选出唯一满足「并发 ≥ 16 路且装得下」的配置。
status: built
---

# 显存与并发容量估算器

<iframe src="main.html" height="722px" width="100%" scrolling="no"></iframe>

[全屏运行 显存与并发容量估算器](./main.html){ .md-button .md-button--primary }

## 描述

四组参数（模型档位、量化精度、上下文长度、并发路数）实时读出权重、KV、开销与显存合计，再逐条判定六组配置能否装下，并选出唯一满足「并发 ≥ 16 路且装得下」的配置。

- 权重 = 参数量 × 每参数字节数；KV 合计 = 并发 × 上下文 × 每 token KV 字节数 ÷ 1024；开销 = （权重 + KV）× 10%。

## 学习目标

学习者将调节四组参数，观察显存合计与预算的实时读数，并对六组配置逐条判定能否装下、选出唯一一组满足「并发 ≥ 16 路且显存不超预算」的配置。六条判定与 Content 表一致且最终选择为序号 4 时算掌握。

**Bloom 层级**：Evaluate（评价）

## 使用建议

1. 先把并发从 24 拖到 32 路，观察显存合计从 68.2 跳到 85.8 GB 并越过 72.0 GB 预算线。
2. 再把上下文从 4,096 切到 8,192，比较 16 路与 32 路的合计完全相同——KV 只看乘积。
3. 最后把模型切到 70B 选 INT4：权重降到 35 GB 装得下，但 KV 让合计越线。逐条提交七次判定后揭晓。

## 嵌入本教材

```html
<iframe src="https://EdwardChenz.github.io/ai-course/sims/vram-capacity-planner/main.html" height="722" scrolling="no"></iframe>
```

## 元数据

- 作者：EdwardChenz
- 章节：14-inference-deploy
- 教学法：调参观察 → 逐条判定 → 锁定后揭晓（Explore-Predict-Check）
- 前置知识：权重显存、KV Cache、每 token 每 token KV 字节数、并发路数、显存预算、算子与碎片开销
- 控件：3 个下拉框（模型 / 量化 / 上下文）、1 个滑块（并发）、1 个下拉框（判定项）、1 组单选、2 个按钮
- 画布高度：570 像素绘图区 + 150 像素控件区（iframe 高度 722 像素）
