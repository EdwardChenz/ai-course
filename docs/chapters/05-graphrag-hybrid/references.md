# 参考资料：GraphRAG 与混合检索架构

本章提到的技术、工具与方法，可从以下来源深入。带 ★ 的是本章最核心的必读项。

## 官方文档

- ★ **[Neo4j 文档](https://neo4j.com/docs/)** — 图数据库的官方文档总入口，数据模型、索引、事务与运维都在这里。本章"节点、关系、属性加属性索引"这套模型以它为准。
- ★ **[Cypher 查询手册](https://neo4j.com/docs/cypher-manual/current/)** — 查询语言的权威参考。本章讲的 `MATCH` / `WHERE` / `RETURN` / `WITH` / `UNWIND`、反向遍历 `<-[:类型]-`、定长与变长跳数，都是这一套语法。
- **[Cypher 模式（Patterns）](https://neo4j.com/docs/cypher-manual/current/patterns/)** — 节点模式、变长关系与路径模式的完整写法。本章"两跳查询 vs 变长跳数"那段性能讨论，读这一页最有用。
- **[Neo4j Graph Data Science：Louvain](https://neo4j.com/docs/graph-data-science/current/algorithms/louvain/)** — 社区发现算法的官方实现说明，`resolution` 参数与模块度的含义。
- **[Neo4j Graph Data Science：Leiden](https://neo4j.com/docs/graph-data-science/current/algorithms/leiden/)** — Louvain 的改良版算法。本章说"用 Louvain 或它的改良版 Leiden"，二者的取舍与实现差异在这一页。
- **[Neo4j Python 驱动手册](https://neo4j.com/docs/python-manual/current/)** — `GraphDatabase.driver` 单例、参数化查询、`execute_write` 事务写法的官方文档，本章那三条驱动纪律逐条对应。
- **[Neo4j 入门](https://neo4j.com/docs/getting-started/)** — Browser 界面与查询入门。本章建议"先用 Browser 玩明白再写代码"，从这里上手最快。

## 规范与论文

- ★ **[From Local to Global: A Graph RAG Approach to Query-Focused Summarization](https://arxiv.org/abs/2404.16130)** — Microsoft GraphRAG 的原始论文。本章"局部检索 vs 全局检索"这对概念，以及"把社区压成摘要再做向量检索"这条全局路线，源头就是这篇。
- **[Modularity and Community Structure in Networks](https://arxiv.org/abs/cond-mat/0308217)** — Newman 的模块度定义与谱分析理论。本章那个 \(Q\) 公式与"社区不能无限增大"的直觉解释来自这里。

## 工具仓库

- **[neo4j/neo4j](https://github.com/neo4j/neo4j)** — 数据库本体。本章提到社区版单机约可承载 200 万节点、5000 万关系，这类容量口径以官方仓库与文档为准。
- **[neo4j/neo4j-python-driver](https://github.com/neo4j/neo4j-python-driver)** — 官方 Python 驱动；本章强调的"参数化查询防止计划缓存失效"这类坑，在驱动的查询构造方式上能找到根因。
- **[neo4j/neo4j-graphrag-python](https://github.com/neo4j/neo4j-graphrag-python)** — 把图谱接入 LLM 的官方 GraphRAG 包，本章的抽取管线与图谱+向量融合可以直接对照它的实现。