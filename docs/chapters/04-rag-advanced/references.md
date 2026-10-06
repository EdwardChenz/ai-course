# 参考资料：RAG 进阶：评测运营与上线

本章提到的技术、工具与方法，可从以下来源深入。带 ★ 的是本章最核心的必读项。

## 官方文档

- ★ **[Ragas](https://docs.ragas.io/)** — RAG 评测框架的官方文档，忠实度、答案相关性、上下文精确度等指标的算法定义与取值口径。本章"忠实度 ≥ 93%"这道门禁，量的就是 Ragas 这一类指标。
- **[OpenAI 结构化输出](https://platform.openai.com/docs/guides/structured-outputs)** — 用 Schema 硬约束模型输出；本章"引用约束"那道防线要可靠，前提是模型能稳定吐出可解析的结构。
- **[OpenAI 文本生成指南](https://platform.openai.com/docs/guides/text)** — 温度、频率惩罚与输出长度等生成参数的语义。本章讲生成漂移时，"调温度"和"加阈值拒答"是两类不同的药，参数文档能帮你确认改的是哪一个。

## 规范与论文

- ★ **[Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection](https://arxiv.org/abs/2310.11511)** — 让模型自己决定"要不要检索"并批判自己的输出。本章"按意图分级开不同防线"的思路，正是把这套反思判断从训练期挪到了推理期。
- ★ **[Chain-of-Verification Reduces Hallucination in Large Language Models](https://arxiv.org/abs/2309.11495)** — 生成后再逐条核对事实的验证链；本章第三道防线"二次校验"的做法与它的结论一致。
- **[FActScore: Fine-grained Atomic Evaluation of Factual Precision in Long Form Text Generation](https://arxiv.org/abs/2305.14251)** — 把长答案拆成原子事实逐条判对错的评测方法，本章"把生成的断言逐条与证据核对"那段的论文出处。
- **[Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172)** — 证据块塞得越多不必然越好，位置偏中部的信息会被忽略。本章上下文精确率那道门禁的现实理由。

## 延伸阅读

- **[Ragas 可用指标清单](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/)** — 逐个指标的算法、所需输入与适用场景；本章四个门禁指标想换成框架原生指标时，从这里对照。

## 工具仓库

- **[explodinggradients/ragas](https://github.com/explodinggradients/ragas)** — RAG 评测框架本体。想把本章的评测集接到自动化流水线上，先读它的自定义指标接口。