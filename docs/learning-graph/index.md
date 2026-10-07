# 高级AI大模型应用开发 · 学习图

本节是本书的学习图：290 个概念、519 条依赖边、13 个分类的有向无环图（DAG）。
左侧是工程基础等前置概念（无依赖），右侧是综合项目与求职等收敛概念。
它是智能教材推荐学习路径的基础数据结构。

课程大纲版本：v261002。优先深度模块：RAG（Retrieval Knowledge Bases）、
可靠性（Runtime Reliability）；优先工具链：Daytona、LangFuse、DeepEval、Temporal。

## 课程描述

概念全部来源于 [Course Description](../course-description.md)，
课程描述按 2001 Bloom 分类法组织学习目标（课程描述质量评分 97/100）。

## 概念清单

共 290 个概念，每个标签为不超过 32 字符的短名称（中文概念名 + 通用英文工具名）。

[查看概念清单](./concept-list.md)

## 概念依赖表

DAG 提供两种格式：[CSV](learning-graph.csv)（`ConceptID,ConceptLabel,Dependencies,TaxonomyID`）
与 [JSON](learning-graph.json)（vis-network 格式，含 `metadata/groups/nodes/edges`，
每个节点带 CIS 概念影响分，可直接接入 graph-viewer）。

## 分析与文档

### 课程描述质量评估

- 课程描述字段与内容深度分析（总分 97/100，Excellent）
- 确认具备生成 200+ 概念的广度（8 大模块）与 Bloom 六层分布

[查看课程描述质量评估](course-description-assessment.md)

### 学习图质量校验

- 有效 DAG：零环依赖、零自依赖、零孤立节点、单连通分量
- 基础概念 24 个，平均依赖 1.95，最长学习路径 7 步
- CIS 榜首均为工程基础概念（边方向正确）

[查看学习图质量校验](graph-quality-cn.md)

### 概念分类体系

13 个分类（9–15 允许区间内），最大分类占比 10.3%，无分类超过 30% 阈值。

[查看概念分类体系](concept-taxonomy.md)

### 分类分布

各分类统计、占比条形图与均衡性结论。

[查看分类分布报告](taxonomy-distribution-cn.md)
