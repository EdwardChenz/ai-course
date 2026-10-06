# 参考资料：可观测性与评测优化

本章提到的技术、工具与方法，可从以下来源深入。带 ★ 的是本章最核心的必读项。

## 官方文档

- ★ **[LangFuse 文档](https://langfuse.com/docs)** — 可观测与评测平台的官方文档。trace / span / score 三层模型、`@lf.observe` 装饰器、采样与脱敏配置，本章六条实践逐条对应。
- **[LangFuse Python SDK](https://langfuse.com/docs/sdk/python)** — 装饰器与手动开 span 的用法。本章提醒"嵌套装饰器的父子归属在不同版本里行为有过调整"，这个提示就来自这份 SDK 文档的版本说明。
- ★ **[DeepEval（Confident AI）文档](https://docs.confident-ai.com/getting-started)** — LLM 评测框架，`LLMTestCase`、各项 Metric 与批量运行的写法，本章"DeepEval 评测接入"一节的 API 来源。
- **[Ragas 文档](https://docs.ragas.io/)** — 本章的对照评测框架。RAG 场景的忠实度、相关性等指标口径，以及免参考答案的评测思路。
- **[LangSmith](https://docs.langchain.com/langsmith)** — 托管式追踪与评测平台，本章"LangSmith 对照实践"里那张对比表的能力项以它为准。
- **[OpenTelemetry 文档](https://opentelemetry.io/docs/)** — 厂商中立的可观测标准。span 语义、上下文传播与 `trace_id` 贯穿全链路的做法，本章"trace_id 必须三处都在"的纪律源自这套规范。
- **[OpenTelemetry Trace 信号](https://opentelemetry.io/docs/concepts/signals/traces/)** — span 的父子关系与耗时语义，本章那张 14 个 span 的耗时表就是按这套模型拆的。

## 规范与论文

- ★ **[Ragas: Automated Evaluation of Retrieval Augmented Generation](https://arxiv.org/abs/2309.15217)** — RAG 自动评测的原始论文，忠实度与答案相关性的无参考评测方法。本章评测指标体系的出处。
- **[Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena](https://arxiv.org/abs/2306.05685)** — 用模型给模型打分的有效性与偏置分析。本章"二次校验用便宜模型判定蕴含关系"这类做法的风险与收益，这篇讲得最清楚。

## 工具仓库

- **[langfuse/langfuse](https://github.com/langfuse/langfuse)** — 自托管追踪平台本体。本章 docker compose 起三容器、`/api/public/health` 健康检查这套流程直接看仓库的 docker 目录。
- **[confident-ai/deepeval](https://github.com/confident-ai/deepeval)** — 评测框架源码；自定义指标与并发控制想改行为时读它最快。
- **[explodinggradients/ragas](https://github.com/explodinggradients/ragas)** — RAG 评测框架源码，本章"DeepEval 与 Ragas 怎么选"的差异在两边的指标实现里。