# Learning Graph for 高级AI大模型应用开发

本节是本书的学习图：290 个概念、519 条依赖边、13 个分类的有向无环图（DAG）。
左侧是工程基础等前置概念（无依赖），右侧是综合项目与求职等收敛概念。
它是智能教材推荐学习路径的基础数据结构。

课程大纲版本：v261002。优先深度模块：RAG（Retrieval Knowledge Bases）、
可靠性（Runtime Reliability）；优先工具链：Daytona、LangFuse、DeepEval、Temporal。

## Course Description

概念全部来源于 [Course Description](../course-description.md)，
课程描述按 2001 Bloom 分类法组织学习目标（课程描述质量评分 97/100）。

## List of Concepts

共 290 个概念，每个标签为不超过 32 字符的短名称（中文概念名 + 通用英文工具名）。

[查看概念清单](./concept-list.md)

## Concept Dependency List

DAG 提供两种格式：[CSV](learning-graph.csv)（`ConceptID,ConceptLabel,Dependencies,TaxonomyID`）
与 [JSON](learning-graph.json)（vis-network 格式，含 `metadata/groups/nodes/edges`，
每个节点带 CIS 概念影响分，可直接接入 graph-viewer）。

## Analysis & Documentation

### Course Description Quality Assessment

- 课程描述字段与内容深度分析（总分 97/100，Excellent）
- 确认具备生成 200+ 概念的广度（8 大模块）与 Bloom 六层分布

[Vew the Course Description Quality Assessment](course-description-assessment.md)

### Learning Graph Quality Validation

- 有效 DAG：零环依赖、零自依赖、零孤立节点、单连通分量
- 基础概念 24 个，平均依赖 1.95，最长学习路径 7 步
- CIS 榜首均为工程基础概念（边方向正确）

[View the Learning Graph Quality Validation](quality-metrics.md)

### Concept Taxonomy

13 个分类（9–15 允许区间内），最大分类占比 10.3%，无分类超过 30% 阈值。

[View the Concept Taxonomy](concept-taxonomy.md)

### Taxonomy Distribution

各分类统计、占比条形图与均衡性结论。

[View the Taxonomy Distribution Report](./taxonomy-distribution-report.md)
