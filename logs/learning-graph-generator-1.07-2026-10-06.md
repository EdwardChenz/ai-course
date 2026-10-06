# Session Log — learning-graph-generator v1.07 — 2026-10-06

## Inputs

- `docs/course-description.md`（质量分 97/100，已 ≥85，跳过 Step 1 重评）
- 课程大纲 v261002（思维导图）：8 大模块，优先工具 Daytona / LangFuse / DeepEval / Temporal
- 用户选定规模：240–300 概念 → 实际 290

## Outputs

- `docs/learning-graph/concept-list.md` — 290 概念，13 分类
- `docs/learning-graph/learning-graph.csv` — `ConceptID,ConceptLabel,Dependencies,TaxonomyID`，519 边
- `docs/learning-graph/concept-taxonomy.md` — 13 分类定义
- `docs/learning-graph/taxonomy-names.json` — ID→可读名映射
- `docs/learning-graph/metadata.json` — Dublin Core 元数据
- `docs/learning-graph/color-config.json` — 13 分类配色
- `docs/learning-graph/learning-graph.json` — vis-network 完整图（含 node.cis）
- `docs/learning-graph/quality-metrics.md` — DAG 零环/零孤立/单连通，最长路径 7
- `docs/learning-graph/taxonomy-distribution-report.md` — 最大分类 10.3%
- `docs/learning-graph/index.md` — 学习图首页（已按本书定制）

## Script versions

- `analyze-graph.py` / `csv-to-json.py` v1.04（含 CIS）/ `taxonomy-distribution.py` /
  `validate-learning-graph.py` — 均复制自 `$BK_HOME/skills/learning-graph-generator/`（ibook-skills，
  与 `book-installer` 同源），运行于 `docs/learning-graph/`。
- 概念与依赖由生成脚本（`gen_graph.py`，位于临时目录，已按“依赖只能指向更小 ID”构造 DAG，
  后删除临时脚本，CSV 为准）批量产生，非逐条手写。

## Notable fixes

- taxonomy ID `A2A` 含数字，不满足 schema `^[A-Z]+$`，已更名为 `XAP`（Cross Agent Protocols），
  CSV / JSON / 配色 / 文档同步更新，`validate-learning-graph.py` 复检通过。
- 初版 longest-path 出现弱语义边（知识库运营指标→图谱增量更新），已收紧 GRAPH/MCO/REL/DEP/WORK
  的依赖池：GRAPH 取 RAG 技术段、WORK 收敛 DATA/MULTI/DEP，长路径现为
  FastAPI流式→LangChain记忆→MCP客户端→规划者执行者→能力发现→LangSmith→连续批处理。

## Gates

- DAG 有效（0 环）✅
- JSON schema 校验通过（290 nodes / 519 edges / 0 orphaned）✅
- 分类均衡（最大 10.3% < 30%）✅
- `mkdocs build --strict` 通过 ✅

## Revision 2026-10-06 — ORCA 移组（用户评审意见）

- 138 ORCA开发范式：TaxonomyID `MCO`→`WORK`（ConceptID 保留 138，避免牵连依赖引用），
  concept-list 移入 WORK 分组（紧随 273 Agentic编码总览），taxonomy 两组计数更新（MCO 25 / WORK 19）。
- 137 Herd协作思路：保留在 MCO（内容即多智能体协作）。
- 重跑 csv-to-json + analyze + distribution + validate：290 nodes / 519 edges / 0 环 / 0 孤立，
  CIS 榜首仍为工程基础，分布最大 10.3%，`mkdocs build --strict` 通过。

## Next

- 请作者评审 `concept-list.md`（增删概念现在最便宜），再跑 `book-chapter-generator`（Phase 2.1）。
- 可选：`book-installer` feature 23（learning-graph-viewer）把 JSON 变成可交互图。
