---
title: RLS 漏配导致的数据越权
description: 八张业务表的本租户应有行数与当前配置逐张列出，先猜越权多少行、零行属于哪类故障、补策略但不开启会怎样，三题锁定后揭晓实际可见行数。
status: built
---

# RLS 漏配导致的数据越权

<iframe src="main.html" height="637px" width="100%" scrolling="no"></iframe>

[全屏运行 RLS 漏配导致的数据越权](./main.html){ .md-button .md-button--primary }

## 描述

八张业务表的本租户应有行数与当前配置逐张列出，先猜越权多少行、零行属于哪类故障、补策略但不开启会怎样，三题锁定后揭晓实际可见行数。

- 越权泄漏行数 = 实际可见行数 − 本租户应有行数，仅对实际值大于应有值的行求和。

## 学习目标

学习者将逐表预测 8 张业务表在当前配置下普通客服能读到的行数，并算出合计泄漏行数。泄漏行数答为 338,000 行、越权表数为 2 张，且能指出 attachments 的 0 行属于失败即拒绝而非越权。

**Bloom 层级**：Analyze（分析）

## 使用建议

1. 先只看「本租户应有行数」与「当前配置」两列，逐表猜实际可见行数与故障类型。
2. 三道题依次作答：泄漏表数与行数、零行故障归类、补策略但不开启的后果；每题两次机会。
3. 关键观察：漏开启的表不产生任何报错，比写错的表危险得多。

## 嵌入本教材

```html
<iframe src="https://EdwardChenz.github.io/ai-course/sims/rls-misconfig-leak/main.html" height="637" scrolling="no"></iframe>
```

## 元数据

- 作者：EdwardChenz
- 章节：09-backend-integration
- 教学法：先预测 → 三题锁定 → 揭晓（Predict-Lock-Reveal）
- 前置知识：行级安全策略、enable row level security、USING 与 WITH CHECK、auth.current_tenant_id()、失败即拒绝
- 控件：1 个下拉框（题号）、1 组单选（表数 / 故障归类）、1 到 2 个数字输入框、2 个按钮
- 画布高度：520 像素绘图区 + 115 像素控件区（iframe 高度 637 像素）
