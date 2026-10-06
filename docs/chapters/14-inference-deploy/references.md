# 参考资料：推理服务与部署交付

本章提到的技术、工具与方法，可从以下来源深入。带 ★ 的是本章最核心的必读项。

## 官方文档

- ★ **[vLLM 文档](https://docs.vllm.ai/)** — 高吞吐推理引擎的官方文档。本章"PagedAttention 管理 KV Cache、连续批处理"这两项核心能力的官方表述以这里为准。
- **[vLLM 引擎参数](https://docs.vllm.ai/en/latest/configuration/engine_args/)** — `--tensor-parallel-size`、`--gpu-memory-utilization`、`--max-num-seqs` 等参数的完整语义。本章强调"参数名在不同版本间调整过"，差异在这一页对照。
- **[vLLM 量化支持](https://docs.vllm.ai/en/latest/features/quantization/)** — 支持的量化方法与精度档位。本章"量化选型"一节的可用范围。
- **[vLLM 自动前缀缓存](https://docs.vllm.ai/en/latest/features/automatic_prefix_caching/)** — 前缀缓存的命中条件与约束。本章"缓存语义层"讲提示词版本必须进缓存键，这条特性的行为从这里确认。
- ★ **[LiteLLM 文档](https://docs.litellm.ai/)** — 多模型网关的官方文档。本章"网关与用量统计现在就上、自建放第二步"这个结论，网关能力清单从这里核对。
- **[LiteLLM 路由](https://docs.litellm.ai/docs/routing)** — 多后端路由与重试、故障转移的配置方式，本章"多模型路由策略"与"故障转移机制"两节。

## 规范与论文

- ★ **[Efficient Memory Management for Large Language Model Serving with PagedAttention](https://arxiv.org/abs/2309.06180)** — vLLM 的原始论文。本章连续批处理、显存估算与"吞吐提升来自 KV Cache 的分页管理而非算力变强"的解释都在这里。
- ★ **[AWQ: Activation-aware Weight Quantization for LLM Compression and Acceleration](https://arxiv.org/abs/2306.00978)** — 权重量化的代表方法。本章量化选型里"精度掉得比直觉少"的结论来自这类方法。
- **[LoRA: Low-Rank Adaptation of Large Language Models](https://arxiv.org/abs/2106.09685)** — 低秩适配。本章"需要微调才自建、否则半年后还得迁"这个判断里，微调成本有多低由它决定。

## 工具仓库

- **[vllm-project/vllm](https://github.com/vllm-project/vllm)** — 引擎源码；调度器与 KV Cache 管理那几段代码，正是本章那段调度循环骨架的真实实现。
- **[BerriAI/litellm](https://github.com/BerriAI/litellm)** — 网关源码；成本统计与虚拟密钥配额的实现看这里最快。
- **[NVIDIA/TensorRT-LLM](https://github.com/NVIDIA/TensorRT-LLM)** — NVIDIA 的高吞吐推理引擎，本章多模型路由里作为异构后端时的对照选项。