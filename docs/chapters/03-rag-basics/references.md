# 参考资料：RAG 基础：检索与知识库搭建

本章提到的技术、工具与方法，可从以下来源深入。带 ★ 的是本章最核心的必读项。

## 官方文档

- ★ **[Elasticsearch 参考手册](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html)** — 倒排索引、分词器、`bool` 查询与向量检索的完整语义。本章说"稀疏路是这套流水线上砍不掉的那一个"，理由全在这里。
- **[Elasticsearch 文档](https://www.elastic.co/elasticsearch)** — 产品概览与部署形态说明，本章部署章节里 ES 8.x 的内存与角色划分可以对照它。
- **[OpenAI 结构化输出](https://platform.openai.com/docs/guides/structured-outputs)** — `json_object` 响应模式与 Schema 约束的官方行为；本章查询改写与实体抽取那几处 `response_format` 的正确用法。

## 规范与论文

- ★ **[Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/abs/2005.11401)** — RAG 的原始论文。它给出的经典双阶段（检索 + 生成）正是本章整条流水线的骨架。
- ★ **[Precise Zero-Shot Dense Retrieval without Relevance Labels（HyDE）](https://arxiv.org/abs/2212.10511)** — 假设性文档检索的方法论文，原标题为 *When Not to Trust Language Models: Investigating Effectiveness of Parametric and Non-Parametric Memories*。本章"假文档只用于检索、不进答案上下文"这条纪律直接来自它。
- **[SPLADE: Sparse Lexical and Expansion Model for First Stage Retrieval](https://arxiv.org/abs/2107.05720)** — 把稀疏检索从"纯 BM25"推进到"词项扩展"的代表作，本章讲稀疏路的能力边界时可以对照它看还有哪些提升空间。
- **[Reciprocal Rank Fusion（Elastic 官方实现说明）](https://www.elastic.co/guide/en/elasticsearch/reference/current/rrf.html)** — RRF 公式、参数含义与"只用名次不用分数、从而免疫分数漂移"的工程理由，本章融合策略选型的依据。

## 延伸阅读

- **[Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172)** — 上下文里位置偏中部的信息最容易被忽略。本章"小块检索、大块喂模型"和"上下文压缩压到 1800 token"两处决策的实证依据。

## 工具仓库

- **[infiniflow/ragflow](https://github.com/infiniflow/ragflow)** — 本章的参照系统。`deepdoc` 版面解析、`DOC_ENGINE` 与 `EMBEDDING_MODEL` 等配置项都在仓库的 docker 目录里。
- **[elastic/elasticsearch](https://github.com/elastic/elasticsearch)** — 检索引擎本体源码，遇到分词器或查询执行的行为细节时读它比读文档快。
- **[UKPLab/beir](https://github.com/UKPLab/beir)** — 零样本检索评测基准。本章"别拿公开榜单选嵌入模型、拿自己的查询集测"这条建议的反面教材就来自这类榜单。