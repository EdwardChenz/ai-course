# 参考资料：模型接入与进阶过渡

本章提到的技术、工具与方法，可从以下来源深入。带 ★ 的是本章最核心的必读项。

## 官方文档

- ★ **[LangChain 概览（Python）](https://docs.langchain.com/oss/python/langchain/overview)** — LCEL 表达式、`Runnable` 抽象与组件化理念的入口；本章强调"学它的编排思想而不是把架构押在框架 API 上"，这份文档正是那套思想的第一手表述。
- ★ **[LangChain 检索（RAG）](https://docs.langchain.com/oss/python/langchain/retrieval)** — 加载、切分、嵌入、向量库、检索器的标准组装顺序；本章"中级 RAG 全流程"那段流水线的框架版长这样。
- **[LangChain 短期记忆](https://docs.langchain.com/oss/python/langchain/short-term-memory)** — 消息修剪、摘要与对话历史窗口化的官方做法，本章"对话历史管理"三策略的框架实现。
- **[LangChain 结构化输出](https://docs.langchain.com/oss/python/langchain/structured-output)** — 把 Pydantic 模型直接接进链，让"提示词里的 Schema"和"解析器的校验"共用一份定义，本章讲的分工在框架里就是这么实现的。
- **[LangChain 模型与工具](https://docs.langchain.com/oss/python/langchain/tools)** — `bind_tools`、docstring 作为工具说明书、以及"文本 or 工具调用"二选一后的分支处理，本章工具绑定一节直接对应。
- **[LangChain 流式输出](https://docs.langchain.com/oss/python/langchain/streaming)** — `.stream()`、`.astream()` 与可观测的逐块渲染；本章"链式编排三好处"里的流式那条有官方案例。
- **[OpenAI 模型列表](https://platform.openai.com/docs/models)** — 模型清单、上下文窗口与能力对比；本章"模型选型对照表"里"工程约束"一维的数据来源。
- **[OpenAI 定价](https://platform.openai.com/docs/pricing)** — 输入与输出 token 的单价口径。本章的成本公式用的是教学示意价，真实报价请以这里为准。

## 规范与论文

- ★ **[ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT](https://arxiv.org/abs/2004.12832)** — "召回要快而全、重排要准而少"这条分工的经典解释：双塔粗筛之后用交叉编码器精排，本章重排序策略的理论底座。
- **[Dense Passage Retrieval for Open-Domain Question Answering](https://arxiv.org/abs/2004.04906)** — 稠密向量检索的原始方法论文，Embedding 选型与"向量不是精确匹配"这个软肋的出处。
- **[Language Models are Few-Shot Learners](https://arxiv.org/abs/2005.14165)** — few-shot 示例为什么比十句描述更管用，本章提示词模板一节的依据。

## 工具仓库

- **[langchain-ai/langchain](https://github.com/langchain-ai/langchain)** — 框架本体。本章强调编排思想可迁移、API 会变，遇到版本差异时读源码与示例目录最准。