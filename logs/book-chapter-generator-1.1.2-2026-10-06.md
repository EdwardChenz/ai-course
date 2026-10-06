# Session Log — book-chapter-generator v1.1.2 — 2026-10-06

## Inputs

- `docs/course-description.md`（质量分 97）
- `docs/learning-graph/learning-graph.json`（290 nodes / 519 edges / 13 groups，含 cis）
- `docs/learning-graph/concept-taxonomy.md`（13 分类，ORCA 修订后 MCO 25 / WORK 19）

## Step 1 验证

- 边方向：`prereqs[from].add(to)`，24 个根基概念全是 FOUND 1–24（Python/ FastAPI / Linux / Docker / Git），方向正确。
- CIS 非全 1（1–97），无需回退到 dependents count。
- DAG 无环（沿用 quality-metrics.md 结论）。

## 设计（用户已批准）

16 章，290 概念各出现一次，每章 9–25 个，依赖零违反（脚本严格检查通过）：

| # | 章 | 概念 |
|---|---|---|
| 1 | 开发基础与工程规范 | 24（FOUND） |
| 2 | 模型接入与进阶过渡 | 18（MACC） |
| 3 | RAG 基础 | 15（43–57） |
| 4 | RAG 进阶 | 15（58–72） |
| 5 | GraphRAG 混合检索 | 24（GRAPH） |
| 6 | MCP 工具交付 | 22（MCP） |
| 7 | 多智能体协作编排 | 25（MCO，含 Herd） |
| 8 | 跨 Agent 协议互联 | 20（XAP） |
| 9 | 后端集成 | 16（BACK） |
| 10 | 记忆层与执行沙箱 | 11（181–191） |
| 11 | 可观测与评测 | 19（192–210） |
| 12 | 数据工程 | 22（DATA） |
| 13 | 多模态应用 | 24（MULTI） |
| 14 | 推理与部署 | 16（DEP） |
| 15 | AI 辅助开发工作流 | 9（138 ORCA + 273–280） |
| 16 | 综合项目与求职 | 10（281–290） |

RAG / REL 按 30 超 25 上限拆分为两章；WORK 拆为工作流（模块 7）与项目求职（模块 8），对齐大纲 v261002 的 8 大模块。

## Outputs

- `docs/chapters/index.md`（总览 + 使用指南）
- 16 个 `docs/chapters/NN-slug/index.md`：Summary + Concepts Covered（Concept / Concept Impact Score 表）+ 真实依赖计算的 Prerequisites + TODO 占位
- `mkdocs.yml` nav：16 章条目（数字编号惯例），`mkdocs build --strict` 通过

## Next

- `chapter-content-generator`（Phase 3.1）填充正文。注意各章 CIS 已就位， Elaboration Budget 可直接用。
