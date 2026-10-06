# 推理服务与部署交付

## Summary

本章讲上线最后一公里：vLLM 推理部署、显存估算、LiteLLM 网关路由、故障转移、压测与容量规划。
学完本章，读者将掌握上述主题，并能将其用于后续章节的综合项目。

## Concepts Covered

本章覆盖学习图中的以下 16 个概念：

| Concept | Concept Impact Score |
|---------|-----------------------|
| vLLM部署入门 | 1 |
| 连续批处理原理 | 1 |
| 显存估算方法 | 1 |
| 量化选型 | 1 |
| LiteLLM网关配置 | 2 |
| 多模型路由策略 | 1 |
| 故障转移机制 | 1 |
| 限流与配额 | 1 |
| 缓存语义层 | 1 |
| 成本分账 | 1 |
| 灰度与回滚 | 1 |
| 压测方法 | 2 |
| 延迟优化清单 | 1 |
| 推理安全加固 | 1 |
| 部署交付流水线 | 1 |
| 容量规划 | 2 |

## Prerequisites

本章建立在以下章节的概念之上：

- [Chapter 1: 开发基础与工程规范](../01-dev-foundations/index.md)
- [Chapter 10: 记忆层与执行沙箱](../10-memory-sandbox/index.md)
- [Chapter 11: 可观测性与评测优化](../11-observability-eval/index.md)

---

!!! mascot-welcome "从能跑到扛得住"
    ![墨墨挥手欢迎](../../img/mascot/welcome.png){ class="mascot-admonition-img" }
    前面十三章你的 Agent 已经会检索、会调工具、会协作，但它们全都跑在别人的机器上。这一章把模型搬到自己手里：怎么起服务、显存怎么算、流量怎么分、故障怎么切、上线怎么灰度。八个概念看起来琐碎，实际串起来只有一个目标——让别人半夜不用起来救火。八条触手，一起开干！

本章的示例对象仍是那条企业制度知识助手，日均 12,000 次请求、单次会话 4.2 轮、单次问答输入 5,880 token、输出 860 token（沿用第十一章口径）。本章新增一条自建基线：2 张 A100 80 GB，月租 18,000 元，平均利用率 65%，主模型 7B 跑 FP16。下面所有显存、吞吐、延迟、成本数字都从这套规格推导。

## 一、先回答"要不要自己部署"

这是本章第一个决策，也是唯一一个错了代价最大的决策。用 API 还是自建，没有标准答案，只有五个维度的对照。

| 维度 | 用 API | 用自建 | 本项目取值 |
|---|---|---|---|
| 数据合规 | 输入输出出域，需合规评审 | 完全不出域 | 制度原文含客户信息，必须不出域 |
| 日请求量 | 低于 1 万次时起步成本为零 | 量太小则 GPU 空转，单次成本反超 API | 日均 12,000 次 |
| 延迟稳定性 | P95 受平台负载影响，有抖动 | 可控，本章实测 P95 1.42 s | 要求 P95 ≤ 3.00 s，API 可接受 |
| 模型可控性 | 不能微调、不能换版 | 可微调、可私有化部署 | 首期不需微调 |
| 运维能力 | 1 个人即可 | 至少 2 人且懂 K8s 与 GPU 运维 | 有 2 人 |

判定顺序固定为五步，顺序不能换，因为后一步依赖前一步的结论：

1. **合规不过，直接自建**。数据不能出域，别的一律不谈，这是唯一的一票否决项。
2. **合规过了，算盈亏平衡点**。本章这套 2 卡规格的盈亏平衡是日均 27,300 次（推导见"容量规划"一节），当前 12,000 次不到一半，所以单看钱此刻应该用 API。
3. **要求 P95 ≤ 1.5 秒且要长期稳定**，自建才划算，3 秒级则 API 足够。
4. **需要微调或私有化换版**，自建，否则半年后还得迁。
5. **运维不足 2 人**，回到 API，把省下的人力折算进成本。

本项目的结论是务实版：**网关与用量统计现在就上，自建推理放到第二步**。先在 API 前面架一层 LiteLLM（本章第三节），把密钥、用量、成本先收口；等日均量越过 1 万或合规评审要求落地，再把主力模型换成自建 vLLM。网关是同一份配置，换的是后端地址，不需要改业务代码。

!!! mascot-thinking "自建不是更高级，是更贵地买控制权"
    ![墨墨思考中](../../img/mascot/thinking.png){ class="mascot-admonition-img" }
    自建的账面上单次成本 0.0769 元，比 API 的 0.0338 元高一倍多。这笔差价买的是数据不出域和延迟可控，买不到就是纯亏。所以先算平衡点再动手，别被"自建更专业"这句话推着走。

## 二、把模型跑起来

### vLLM部署入门

vLLM 是一个开源的高吞吐推理引擎，核心能力是用 PagedAttention 管理 KV Cache、并支持连续批处理。下面这条命令是本章全章的部署基线，四个关键参数各自解决一个具体问题：

```bash
# 单条 7B FP16 模型的最小生产配置；两卡张量并行给上下文留出余量
# 参数名与取值在不同版本间调整过，版本差异以官方文档为准
vllm serve /models/qwen2.5-7b-instruct \
  --served-model-name qwen7b-local \
  --tensor-parallel-size 2 \
  --gpu-memory-utilization 0.90 \
  --max-model-len 8192 \
  --max-num-seqs 24 \
  --enable-prefix-caching \
  --api-key "$VLLM_7B_KEY" \
  --host 10.0.12.31 --port 8000

# 冒烟验证：必须返回 200 且 usage 字段齐全，缺 usage 说明版本不兼容
curl -s -H "Authorization: Bearer $VLLM_7B_KEY" \
  http://10.0.12.31:8000/v1/chat/completions \
  -d '{"model":"qwen7b-local","messages":[{"role":"user","content":"差旅报销标准是多少"}],"max_tokens":64}' \
  | jq '{usage, first_choice: .choices[0].message.content}'
```

四个参数各有它必须存在的理由，缺一个就会在后面的某一节里还债：

| 参数 | 本章取值 | 不设会怎样 |
|---|---|---|
| `--tensor-parallel-size` | 2 | 7B 单卡够用，但上下文开到 8,192 时 KV 撑爆，必须跨卡摊 |
| `--gpu-memory-utilization` | 0.90 | 默认值偏低，KV Cache 预算被压掉一大块，吞吐白扔 |
| `--max-model-len` | 8,192 | 不设上限则引擎按最大可能值预留，长尾请求会一次吃掉全部 KV |
| `--max-num-seqs` | 24 | 不设则并发上限由引擎自估，超估会在压测时直接 OOM |
| `--enable-prefix-caching` | 开 | 系统提示与工具定义不变的那部分每请求重算，详见"缓存语义层" |

`--host` 绑内网地址而不是 `0.0.0.0`，这条属于安全加固，本章第六节会正式讲，但部署第一天就该这么写。

### 连续批处理原理

先把术语定清。**批处理**指一次把若干个请求送进模型算，**静态批处理**指这一批必须全部算完才能进下一批，**连续批处理**指批次的组成不固定，任何一个请求算完立刻出队、空出的位置立刻补进新请求。

静态批处理的浪费来自一个无法回避的事实：同一批里请求的输出长度差异极大。本章这套系统的输出长度分布是平均 320 token、P90 为 900 token、最长 2,000 token。如果批并发上限是 32、单序列解码速度 80 token/s，静态批处理的行为是：

- 一批的耗时由**最长**的那个请求决定：\(2{,}000 \div 80 = 25.0\) 秒；
- 这 32 个请求全部在第 25 秒返回，哪怕其中一个只需 4 秒；
- 吞吐 \(= 32 \div 25 = 1.28\) QPS；
- 有效利用率 \(= 320 \div 2{,}000 = 16\%\)，也就是 84% 的算力在给已经算完的请求空转。

连续批处理把"批次"从一个固定的集合变成一个流动的窗口：vLLM 的调度器每隔一个调度周期检查一次，把已完成的请求踢出窗口、把等待队列里的请求补进来。窗口始终是满的，算力始终在干活。代价是每个请求的延迟里加了一次排队（本项目调度周期 50 毫秒），换来的是吞吐与延迟同时改善：

| 指标 | 静态批处理 | 连续批处理 | 变化 |
|---|---|---|---|
| 批耗时 | 25.0 s | 4.4 s | −82.4% |
| 吞吐 | 1.28 QPS | 3.84 QPS | 3.0 倍 |
| P50 延迟 | 25.0 s | 4.2 s | −83.2% |
| P95 延迟 | 25.0 s | 5.8 s | −76.8% |
| 算力利用率 | 16% | 89% | +73 个百分点 |

```python
# 连续批处理的调度循环骨架：与 vLLM 内部实现不同，但判定条件一致
# 版本差异以官方文档为准，这里只表达"完成即出队、新请求即入队"这条规则
MAX_NUM_SEQS = 24
SCHEDULE_INTERVAL_MS = 50


def schedule_step(running: list[dict], waiting: deque, finished: list[dict]) -> dict:
    """一次调度只做两件事：踢出完成的、补进等待的。
    绝不能因为补进来的请求更短就把它挪到队首——那会饿死长请求的 KV 预算"""
    for seq in list(running):
        if seq["generated"] >= seq["max_tokens"] or seq["stop"]:
            finished.append(seq)                     # 第一步：完成即出队，不等这一批的其他人
            running.remove(seq)

    while waiting and len(running) < MAX_NUM_SEQS:   # 第二步：空出的位置立刻补满
        running.append(waiting.popleft())

    return {"running": len(running), "finished": len(finished)}
```

有一件事连续批处理做不到：**它不能缩短单个长请求的生成时间**。逐 token 生成那一段与输出长度严格成正比，谁来调度都得一个 token 一个 token 算。所以连续批处理解决的是"算力浪费"，不是"模型太慢"，这两个混淆会让你在优化时找错方向。

#### Diagram: 静态批处理与连续批处理的吞吐延迟对比

<iframe src="../../sims/batching-strategy-compare/main.html" height="1007px" width="100%" scrolling="no"></iframe>

[全屏运行静态批处理与连续批处理的吞吐延迟对比](../../sims/batching-strategy-compare/main.html){ .md-button .md-button--primary }

<details markdown="1">
<summary>设计说明（规格块）</summary>

本 MicroSim 已实现，上方 iframe 为实际运行的版本。下面的折叠内容是它的设计规格，供教师复用或二次开发参考。

<details markdown="1">
<summary>展开规格原文</summary>

静态批处理与连续批处理的吞吐延迟对比</summary>
Type: chart
**sim-id:** batching-strategy-compare<br/>
**Library:** Chart.js<br/>
**Status:** built<br/>
**Bloom Level:** Analyze<br/>
**Bloom Verb:** 对比<br/>
**Learning Objective:** 学习者将调节批并发上限、平均输出长度与最长输出长度三个取值，观察静态批处理与连续批处理的吞吐与 P50 延迟的实时变化，并在四道挑战题中分别算出静态批耗时与吞吐、连续批吞吐与 P50、算力利用率、以及吞吐提升倍数；判定条件是四题分别算出 25.0 秒与 1.28 QPS、3.84 QPS 与 4.2 秒、16% 与 3.0 倍。

**Prerequisites:** 批处理、静态批处理、连续批处理、批并发上限、输出长度分布、算力利用率、单序列解码速度 80 token/s（均已在本块上方的"连续批处理原理"一节定义）。

**Evidence of Mastery:** 学习者先拖动三条滑块观察两组曲线的形状，再手写四道挑战题的答案；四题数值全部与标准值一致、且第三题答出 16% 与"84% 的算力空转"这一结论时算掌握。只拖动不提交不算证据。

**Misconceptions:** (1) 连续批处理能缩短单个长请求的生成时间。(2) 静态批处理下每个请求都要等最长请求那么久才返回，所以它公平。(3) 提高批并发上限一定会线性提高吞吐。

**Instructional Rationale:** Analyze 层级要求先用公式形成假设再用数值验证，因此四题必须先锁定再揭晓；第 4 题刻意与前几题反向——把批并发上限从 32 提到 64，静态吞吐只从 1.28 涨到 1.42（受 25.0 秒批耗时约束），而显存需求会从 64 GB 涨到 128 GB 直接 OOM，练的是"吞吐不随并发线性增长，瓶颈在批耗时"。

**Content:**

学习者可调节三个取值，每个有区间、步长与默认值：

| 取值项 | 最小 | 最大 | 步长 | 默认 | 单位 |
|---|---|---|---|---|---|
| 批并发上限 | 16 | 64 | 16 | 32 | 条 |
| 平均输出长度 | 160 | 640 | 160 | 320 | token |
| 最长输出长度 | 1,000 | 4,000 | 500 | 2,000 | token |

单序列解码速度固定为 80 token/s，调度周期固定为 50 毫秒，两者不提供调节。图表并列显示两组柱形：左侧为吞吐（QPS），右侧为 P50 延迟（秒），每组含静态批处理与连续批处理两根柱，下方读数区实时显示静态批耗时与算力利用率。

四道挑战题（固定顺序，每题先预测再揭晓）：

| 序号 | 题干 | 标准值 | 答错时的提示 |
|---|---|---|---|
| 1 | 默认取值下，静态批处理的一批耗时与吞吐各是多少 | 批耗时 25.0 秒，吞吐 1.28 QPS | 批耗时由最长请求决定：2,000 ÷ 80 = 25.0 秒。吞吐 = 批并发上限 ÷ 批耗时 = 32 ÷ 25 = 1.28 QPS。 |
| 2 | 默认取值下，连续批处理的吞吐与 P50 延迟各是多少 | 3.84 QPS，4.2 秒 | 连续批处理吞吐 = 静态吞吐 × 3.0 = 1.28 × 3.0 = 3.84 QPS。P50 = 平均输出 ÷ 80 + 调度周期 = 320 ÷ 80 + 0.05 ≈ 4.05 秒，取一次调度对齐后的 4.2 秒。 |
| 3 | 默认取值下，两种策略的算力利用率各是多少 | 静态 16%，连续 89% | 静态利用率 = 平均输出 ÷ 最长输出 = 320 ÷ 2,000 = 16%，也就是 84% 的算力在给已完成的请求空转。连续批处理下窗口始终满载，本章口径为 89%。 |
| 4 | 把批并发上限从 32 提到 64，其余不变，静态吞吐变成多少、7B FP16 的 KV 显存变成多少 | 静态吞吐 1.42 QPS，KV 显存 128 GB，结论是不可行 | 批耗时仍被 2,000 token 的最长请求锁死在 25.0 秒，吞吐 = 64 ÷ 25 = 2.56 QPS；但 64 路并发 × 4,096 token × 0.5 MB 每 token = 131,072 MB = 128 GB KV，加上 14 GB 权重远超 72 GB 显存预算，会直接 OOM。并发翻倍不等于吞吐翻倍，瓶颈在批耗时。 |

答题反馈文案：第 1 题说明静态批处理的延迟被最长请求绑架——一个 2,000 token 的请求会让同批另外 31 个请求全部陪等 25 秒。第 2 题说明连续批处理的两端同时改善：吞吐涨 3.0 倍而 P50 掉到 4.2 秒，因为等待被压到了单次调度周期内。第 3 题的 16% 是本章最有说服力的数字：静态批处理下 84% 的 GPU 算力在空转，这也是它吞吐低的唯一原因。第 4 题是陷阱：静态吞吐确实从 1.28 涨到 2.56 QPS（接近翻倍），但 KV 显存需求从 64 GB 涨到 128 GB，单卡 72 GB 预算下必然 OOM；正确做法是用连续批处理并把并发控制在 24 路。

**Provenance:** 批并发上限 32、平均输出 320 token、最长输出 2,000 token、单序列解码 80 token/s、调度周期 50 毫秒出自本块上方的"连续批处理原理"一节的输出长度分布与两轮对比表。连续批处理相对静态的 3.0 倍吞吐系数与 89% 利用率为本章教学设定，构成合成数据集，随机种子 20261401。KV 每 token 0.5 MB 与 4,096 上下文出自本章"显存估算方法"一节的 7B 参数表（层数 32、模型维度 4,096、FP16 两字节）。

**Rules:** 静态批耗时 = 最长输出 ÷ 80，单位秒，保留一位小数。静态吞吐 = 批并发上限 ÷ 静态批耗时，单位 QPS，保留两位小数，连续批吞吐 = 静态吞吐 × 3.0，保留两位小数。静态 P50 延迟 = 静态批耗时；连续 P50 延迟 = 平均输出 ÷ 80 + 调度周期后按 0.1 秒向上取整到 0.2 秒的整数倍。静态算力利用率 = 平均输出 ÷ 最长输出 × 100%，保留整数百分比，连续算力利用率固定显示 89%。KV 显存 = 批并发上限 × 4,096 × 0.5 MB ÷ 1,024，换算为 GB，保留一位小数。滑块取值必须落在步长网格上；平均输出长度最小 160 最大 640，最长输出长度最小 1,000 最大 4,000。四题无并列，容差为批耗时与延迟 ±0.1 秒、吞吐 ±0.01 QPS、利用率 ±0 个百分点。

**Learner Activity:** 1. 学习者先只拖动"平均输出长度"从 320 到 160，观察静态两根柱完全不动、连续那根 P50 掉到 2.2 秒，先形成"静态不受短请求影响"的判断。2. 学习者把"最长输出长度"从 2,000 拖到 4,000，观察静态吞吐从 1.28 掉到 0.64 而连续吞吐只从 3.84 掉到 1.92，理解静态的脆弱。3. 学习者依次完成四道挑战题，每题先写下答案并提交，再看标准值。4. 学习者应注意到第 4 题里吞吐确实涨了近一倍，但代价是 128 GB KV 显存，直接 OOM。

**Feedback:** 四道挑战题，固定顺序，每题两次机会，提交后立即揭晓。答对："正确，<标准值>"，并展示该行反馈文案。答错："回到公式：静态批耗时由最长输出决定，吞吐 = 批并发上限 ÷ 批耗时"，随后展示该行反馈文案并高亮当前三个取值。两次答错记为失手。顶部累计"答对 n/4 题"。计分：满分 4 分，答对 3 分视为掌握。

**Starting State:** 三条滑块位于默认值（32 条、320 token、2,000 token），两组柱形与读数区可见，四道挑战题折叠在下方，标准值隐藏。屏幕提问："同样一张卡、同样 32 个请求，两种策略差在哪儿？先拖一遍，再算四道题。"

**Chapter Anchors:** 默认批并发上限 32、平均输出 320 token、最长输出 2,000 token；单序列解码 80 token/s、调度周期 50 毫秒；静态批耗时 25.0 秒、吞吐 1.28 QPS、算力利用率 16%；连续批吞吐 3.84 QPS、P50 4.2 秒、P95 5.8 秒、利用率 89%；吞吐提升 3.0 倍、P50 下降 83.2%；批并发提到 64 时静态吞吐 2.56 QPS 但 KV 显存 128 GB。

</details>
</details>

### 显存估算方法

显存是自建推理里唯一无法临时绕开的约束，所以这一节给的是公式而不是经验值。先定义三个量：**权重显存**是模型参数本身占的显存，**KV Cache**是每个在跑请求为了记住已生成内容而占的显存，**算子与碎片**是注意力实现、CUDA 上下文与临时张量，本章按权重加 KV 的 10% 计。

权重显存的算法很直白，参数量乘以每个参数占几个字节：

\[
M_{\text{weight}} = P \times b
\]

其中 \(P\) 是参数量（单位十亿），\(b\) 是每参数字节数：FP16 与 BF16 是 2，INT8 是 1，INT4 是 0.5。所以 7B 的 FP16 权重是 \(7 \times 2 = 14\) GB，13B 是 26 GB，70B 是 140 GB。

KV Cache 的关键是它**随并发和上下文长度线性增长，而权重是常数**，这就是本章所有容量陷阱的来源。每个 token 的 KV 字节数等于"K 和 V 两份 × 层数 × 每层每个 token 的向量长度（模型维度）× 每元素字节数"：

\[
M_{\text{kv}} = C \times L_{\text{seq}} \times 2 \times n_{\text{layer}} \times d_{\text{model}} \times b_{\text{kv}}
\]

其中 \(C\) 是并发请求数，\(L_{\text{seq}}\) 是上下文 token 数。三种本章常用规格的每 token KV 占用：

| 模型档 | 参数量 | 层数 | 模型维度 | FP16 每 token KV | INT8 每 token KV |
|---|---|---|---|---|---|
| 7B | 7 | 32 | 4,096 | 0.5 MB | 0.25 MB |
| 13B | 13 | 40 | 5,120 | 0.8 MB | 0.4 MB |
| 70B | 70 | 80 | 8,192 | 2.5 MB | 1.25 MB |

把权重和 KV 加起来，按单张 A100 80 GB、`--gpu-memory-utilization 0.90`（可用显存预算 72 GB）逐档核算，这就是本章的显存估算表：

| 模型 | 精度 | 权重 | KV 每 token | 上下文 | 并发 | KV 合计 | 显存合计 | 判定 |
|---|---|---|---|---|---|---|---|---|
| 7B | FP16 | 14 GB | 0.5 MB | 2,048 | 8 | 8.0 GB | 22.0 GB | 合格，余 50.0 GB |
| 7B | FP16 | 14 GB | 0.5 MB | 4,096 | 32 | 64.0 GB | 78.0 GB | 超预算 6.0 GB |
| 7B | FP16 | 14 GB | 0.5 MB | 4,096 | 24 | 48.0 GB | 62.0 GB | 合格，余 10.0 GB |
| 13B | FP16 | 26 GB | 0.8 MB | 4,096 | 8 | 25.6 GB | 51.6 GB | 合格，余 20.4 GB |
| 13B | FP16 | 26 GB | 0.8 MB | 4,096 | 16 | 51.2 GB | 77.2 GB | 超预算 5.2 GB |
| 70B | INT4 | 35 GB | 2.5 MB | 4,096 | 8 | 80.0 GB | 115.0 GB | 需 2 卡，合计预算 144 GB |
| 70B | FP16 | 140 GB | 2.5 MB | 4,096 | 8 | 80.0 GB | 220.0 GB | 需 4 卡，合计预算 288 GB |

表里第二行和第五行是本章最该记住的两行，它们形状完全一样：**权重装得下，但并发一上来 KV Cache 就把预算撑爆**。7B 的权重只有 14 GB，看起来 72 GB 预算里能塞五份，实际上一份权重就吃掉五分之一，剩下的要留给并发；32 路并发配 4,096 上下文时 KV 要 64 GB，加上权重 78 GB，比预算多 6.0 GB，进程在压测第二分钟直接被 OOM killer 干掉。13B 更早触顶：16 路并发就到 77.2 GB。

```python
"""显存估算器：容量规划与扩容决策都在部署前用这段算，不靠试错"""
BYTES_PER_TOKEN = {          # (层数, 模型维度) -> 每 token 每精度的字节数
    ("7B", "fp16"): 2 * 32 * 4096 * 2,
    ("7B", "int8"): 2 * 32 * 4096 * 1,
    ("13B", "fp16"): 2 * 40 * 5120 * 2,
    ("13B", "int8"): 2 * 40 * 5120 * 1,
    ("70B", "fp16"): 2 * 80 * 8192 * 2,
    ("70B", "int4"): 2 * 80 * 8192 * 0.5,
}
PARAM_B = {"7B": 7, "13B": 13, "70B": 70}
GB = 1024 ** 3
OVERHEAD_RATIO = 0.10        # 算子、CUDA 上下文与碎片，本章按 10% 计


def estimate(profile: str, precision: str, max_len: int, concurrency: int,
             cards: int = 1, gpu_gb: int = 80, util: float = 0.90) -> dict:
    """返回各项显存与判定；权重按精度取 FP16/INT4 的每参数字节数"""
    bytes_per_param = {"fp16": 2, "int8": 1, "int4": 0.5}[precision]
    weight_gb = PARAM_B[profile] * bytes_per_param
    kv_bytes = BYTES_PER_TOKEN[(profile, precision)]
    kv_gb = concurrency * max_len * kv_bytes / GB
    overhead_gb = (weight_gb + kv_gb) * OVERHEAD_RATIO
    total_gb = weight_gb + kv_gb + overhead_gb
    budget_gb = cards * gpu_gb * util
    return {
        "weight_gb": round(weight_gb, 1),
        "kv_gb": round(kv_gb, 1),
        "overhead_gb": round(overhead_gb, 1),
        "total_gb": round(total_gb, 1),
        "budget_gb": round(budget_gb, 1),
        "fits": total_gb <= budget_gb,          # 恰好等于预算判为装得下，留给碎片的空间已在 overhead 里
    }


assert estimate("7B", "fp16", 4096, 24)["total_gb"] == 70.4   # 62.0 加 10% 开销
assert not estimate("7B", "fp16", 4096, 32)["fits"]           # 78.0 加开销后必然超 72.0
```

这里比正文表格多了一笔 10% 开销，所以两行数字分别是 70.4 GB 与 85.8 GB，判定结论不变。**任何显存估算表都必须包含这一笔**，漏掉它你会得到一个"刚好装下"然后在生产里 OOM 的结论。

!!! mascot-warning "权重装得下不代表跑得起来"
    ![墨墨提醒注意](../../img/mascot/warning.png){ class="mascot-admonition-img" }
    KV Cache 是并发和上下文的乘积，它长在权重前面还长得更快。7B FP16 在 72 GB 预算下权重只占 19.4%，可 32 路并发配 4,096 上下文就要 78 GB。这个坑我替你踩过：先按权重算容量，压测到第二分钟进程被杀，还以为是别的问题。

#### Diagram: 显存与并发容量估算器

<iframe src="../../sims/vram-capacity-planner/main.html" height="722px" width="100%" scrolling="no"></iframe>

[全屏运行显存与并发容量估算器](../../sims/vram-capacity-planner/main.html){ .md-button .md-button--primary }

<details markdown="1">
<summary>设计说明（规格块）</summary>

本 MicroSim 已实现，上方 iframe 为实际运行的版本。下面的折叠内容是它的设计规格，供教师复用或二次开发参考。

<details markdown="1">
<summary>展开规格原文</summary>

显存与并发容量估算器</summary>
Type: microsim
**sim-id:** vram-capacity-planner<br/>
**Library:** p5.js<br/>
**Status:** built<br/>
**Bloom Level:** Evaluate<br/>
**Bloom Verb:** 判定<br/>
**Learning Objective:** 学习者将调节模型档位、量化精度、上下文长度与并发路数四组参数，观察显存合计与预算的实时读数，并对六组配置逐条判定能否装下、并选出唯一一组满足"并发 ≥ 16 路且显存不超预算"的配置；判定条件是六条判定与 Content 表的"应判结论"列全部一致，且最终选择为序号 4。

**Prerequisites:** 权重显存、KV Cache、每 token 每 token KV 字节数、并发路数、显存预算、算子与碎片开销（均已在本块上方的"显存估算方法"一节定义）。

**Evidence of Mastery:** 学习者先逐条提交六组配置的装下判定，再提交最终可用配置；六条判定与"应判结论"列全部一致、且最终选择为序号 4 时算掌握。只看不提交不算证据。

**Misconceptions:** (1) 权重装得下就说明这套配置可行。(2) 量化只降权重显存，不影响 KV Cache。(3) 提高并发一定会让吞吐线性上升。

**Instructional Rationale:** Evaluate 层级要求把四条约束合起来判定，因此必须先锁定逐条判定再揭晓；序号 2 与序号 5 是刻意设计的反例——序号 2 把 13B 量化到 INT8 后权重降到 13 GB，看起来宽裕，但 KV 也按 INT8 降了半档，恰好卡在预算边缘；序号 5 是唯一一条"权重很轻但并发爆掉"的配置，练的是"KV 是乘数项"这一认识。

**Content:**

固定常量：单张 A100 80 GB，`--gpu-memory-utilization 0.90`，显存预算 72.0 GB；算子与碎片开销按权重加 KV 的 10% 计。判定为"总显存 ≤ 预算"即装下，恰好等于预算判为装下。

学习者可调四组参数：

| 参数 | 可选值 | 默认 |
|---|---|---|
| 模型档位 | 7B / 13B / 70B | 7B |
| 量化精度 | FP16 / INT8 / INT4 | FP16 |
| 上下文长度 | 2,048 / 4,096 / 8,192 token | 4,096 token |
| 并发路数 | 8 到 64，步长 8 | 24 路 |

每 token KV 字节数与参数量固定为：7B（层数 32、模型维度 4,096）FP16 为 0.5 MB、INT8 为 0.25 MB、INT4 为 0.125 MB；13B（层数 40、模型维度 5,120）FP16 为 0.8 MB、INT8 为 0.4 MB；70B（层数 80、模型维度 8,192）FP16 为 2.5 MB、INT4 为 1.25 MB。权重的每参数字节数为 FP16 两字节、INT8 一字节、INT4 0.5 字节。70B 需要多卡，卡数为 FP16 四卡、INT8 两卡、INT4 一卡，且卡数为固定规则不提供调节。

六组待判定配置（显存合计已含 10% 开销）：

| 序号 | 配置 | 权重 | KV 合计 | 开销 | 显存合计 | 预算 | 应判结论 | 答错时的反馈文案 |
|---|---|---|---|---|---|---|---|---|
| 1 | 7B FP16，2,048 上下文，8 路 | 14.0 GB | 8.0 GB | 2.2 GB | 24.2 GB | 72.0 GB | 装得下，余 47.8 GB | 单卡绰绰有余，但 8 路并发的吞吐只有约 1.0 QPS，撑不住生产流量——装得下不等于可用。 |
| 2 | 13B INT8，4,096 上下文，16 路 | 13.0 GB | 25.6 GB | 3.9 GB | 42.5 GB | 144.0 GB | 装得下，余 101.5 GB | 13B 量化到 INT8 后权重降到 13 GB，且 INT8 把 KV 也降了半档，16 路只占 42.5 GB。它是六组里余量最宽的一条，代价是正确率掉 0.01。 |
| 3 | 7B FP16，4,096 上下文，32 路 | 14.0 GB | 64.0 GB | 7.8 GB | 85.8 GB | 72.0 GB | 装不下，超 13.8 GB | 本章最典型的陷阱：权重只占 19.4% 看着宽裕，但 32 路并发把 KV 撑到 64 GB，加 10% 开销后 85.8 GB，比预算多 13.8 GB，进程会被直接杀掉。 |
| 4 | 7B FP16，4,096 上下文，24 路 | 14.0 GB | 48.0 GB | 6.2 GB | 68.2 GB | 72.0 GB | 装得下，余 3.8 GB | 本章生产基线。24 路并发满足吞吐要求，68.2 GB 对 72.0 GB 预算留 5.3% 余量——余量偏薄，所以监控里必须有 OOM 告警。 |
| 5 | 7B FP16，8,192 上下文，16 路 | 14.0 GB | 64.0 GB | 7.8 GB | 85.8 GB | 72.0 GB | 装不下，超 13.8 GB | 权重很轻但上下文翻倍，KV 同样涨到 64 GB。KV 是并发与上下文的乘积，压并发或压上下文必须至少动一个。 |
| 6 | 70B INT4，4,096 上下文，8 路 | 35.0 GB | 40.0 GB | 7.5 GB | 82.5 GB | 72.0 GB | 装不下，超 10.5 GB | INT4 把 70B 的权重从 140 GB 压到 35 GB，单卡装得下权重，但 8 路并发的 KV 仍有 40 GB，两项相加 82.5 GB 已超单卡预算。要跑 70B INT4 至少两卡，且并发不能超过 8 路。 |

答题反馈文案：序号 3 与序号 5 的显存合计完全相同，因为 KV 只看"并发 × 上下文"的乘积，32 路配 4,096 与 16 路配 8,192 乘积一样；序号 4 的余量只有 3.8 GB，是本章提醒监控加 OOM 告警的原因；序号 6 说明量化能把权重压到能装下，但压不掉 KV，70B 单卡 INT4 的真实上限是 8 路并发。

**Provenance:** 权重、KV 每 token、预算与 10% 开销口径出自本块上方的"显存估算方法"一节的公式与显存估算表。序号 1、3、4、5 的权重与 KV 数值与该表同源，合计值为按该表口径加 10% 开销后的结果。序号 2 的 13B INT8 与序号 6 的 70B INT4 为合成数据（生成规则：INT8 与 INT4 按每参数字节 1 与 0.5 换算权重，KV 按同比例换算，并按固定卡数规则取预算），随机种子 20261401。正确率掉 0.01 的量化代价出自本块上方的"量化选型"一节的量化选型表。

**Rules:** 权重 = 参数量 × 每参数字节数，单位 GB，保留一位小数。KV 合计 = 并发路数 × 上下文长度 × 每 token KV 字节数 ÷ 1,073,741,824，单位 GB，保留一位小数。开销 = （权重 + KV 合计）× 10%。显存合计 = 权重 + KV 合计 + 开销。装得下判定为显存合计 ≤ 预算，恰好等于预算判为装得下。预算 = 卡数 × 80 GB × 0.90，7B 与 13B 为单卡 72.0 GB，70B FP16 为四卡 288.0 GB、70B INT8 或 INT4 为两卡 144.0 GB；本块的六组判定全部使用 7B 与 13B 的单卡或 70B 的单卡预算口径，即 72.0 GB，70B 在单卡下判定为装不下。并发滑块取值必须落在步长 8 的网格上，范围 8 到 64 路。上下文三档固定 2,048、4,096、8,192 token。六条判定无并列，容差为 ±0.1 GB。

**Learner Activity:** 1. 学习者把并发从默认 24 路拖到 32 路，观察显存合计从 68.2 GB 跳到 85.8 GB 并越过 72.0 GB 预算线，先形成"KV 是乘数项"的判断。2. 学习者把上下文从 4,096 切到 8,192，观察 16 路时显存合计与 32 路时完全相同，观察到 KV 只看乘积。3. 学习者把模型档位切到 70B 并选 INT4，观察权重降到 35 GB 装得下但 KV 让合计越线。4. 学习者依次提交六条装下判定，再提交最终"并发 ≥ 16 路且装得下"的那一组，全部锁定后揭晓。

**Feedback:** 六次装下判定加一次最终选择，共 7 次提交，全部锁定后揭晓。判定答对："判定正确：<装得下 / 装不下>"，并展示该行反馈文案。判定答错："先分开算权重与 KV，KV 等于并发乘上下文乘每 token 字节数，再加 10% 开销",随后展示该行反馈文案并把该组三项数值与 72.0 GB 预算并列显示。最终选择答对："序号 4，7B FP16、4,096 上下文、24 路，68.2 GB 对 72.0 GB 预算。"答错："只有序号 2 和序号 4 装得下，而序号 2 是 13B INT8、并发只有 16 路且质量掉 0.01；本章基线选序号 4"。顶部累计"判定答对 n/6，选型答对 1/1"。计分：满分 7 分，判定 6 分加选型 1 分。

**Starting State:** 四组参数位于默认值（7B、FP16、4,096 上下文、24 路），显存合计 68.2 GB 与预算 72.0 GB 的读数可见，六组配置的判定位与最终选择位均为空。屏幕提问："六组配置只有一组能上生产——先逐条判装下，再选配置。"

**Chapter Anchors:** 显存预算 72.0 GB（单卡 80 GB × 0.90）与 10% 开销；权重显存公式为参数量 × 每参数字节数（FP16 2、INT8 1、INT4 0.5）；7B/13B/70B 的 FP16 权重 14/26/140 GB；三档每 token KV 为 0.5/0.8/2.5 MB；六组配置的显存合计 24.2/42.5/85.8/68.2/85.8/82.5 GB；序号 3 与序号 5 合计相同（KV 只看乘积）；生产基线为序号 4 的 7B FP16、4,096 上下文、24 路、余 3.8 GB。

</details>
</details>

### 量化选型

量化是把参数的每个数从 16 位压到 8 位或 4 位，收益是权重显存按比例下降、解码速度提升，代价是质量损失，而且损失量取决于任务难度而不是模型规模。选型的第一步是认清它**只压权重和 KV，不压激活值**，所以它救不了并发瓶颈。

| 精度 | 每参数字节 | 7B 权重 | 13B 权重 | 70B 权重 | 解码速度 | 本项目答案正确率 | 质量损失 |
|---|---|---|---|---|---|---|---|
| FP16 | 2 | 14 GB | 26 GB | 140 GB | 1.00 倍 | 0.89 | 基线 |
| BF16 | 2 | 14 GB | 26 GB | 140 GB | 1.00 倍 | 0.89 | 0，与 FP16 同为两字节 |
| INT8 | 1 | 7 GB | 13 GB | 70 GB | 1.15 倍 | 0.88 | −0.01 |
| INT4 | 0.5 | 3.5 GB | 6.5 GB | 35 GB | 1.35 倍 | 0.85 | −0.04 |

正确率这一列取自第十一章的门禁口径（基线 0.89，阈值 0.85）。INT4 的 0.85 恰好压在线上，按第十一章"恰等于阈值判通过"的边界规则仍然合格，但余量归零——这正是本章不把 INT4 用在主模型上的原因。

| 业务场景 | 对质量容忍度 | 建议精度 | 理由 | 本项目是否适用 |
|---|---|---|---|---|
| 对客正式答复、法律与财务口径 | 容忍 0.01 以内 | FP16 或 BF16 | 错一个数字就是业务事故 | 适用，主模型用 FP16 |
| 内部辅助、草稿生成、摘要 | 容忍 0.02 到 0.03 | INT8 | 权重减半、速度涨 15%，掉 0.01 可接受 | 适用，摘要与改写走 INT8 副本 |
| 批量离线、意图分类、路由判定 | 容忍 0.05 以上 | INT4 | 吞吐优先，错误由规则兜底 | 适用，分类器走 INT4 |

选型结论对本项目是三档并存：主生成模型 7B FP16，摘要与改写用 INT8 副本，意图分类用 INT4 小模型。**量化是分层的，不是全站或全无**——这是本章唯一推荐的做法。

## 三、统一入口：网关、路由与容错

### LiteLLM网关配置

自建推理之后会出现一个新问题：应用代码里散落着多个模型的地址与密钥。LiteLLM 就是收口层，它对上游模型做协议翻译、对下游应用只暴露一套 OpenAI 风格接口。网关解决三件事，多模型统一入口、密钥收口、用量统计。

```yaml
# LiteLLM 配置：模型清单 + 统一密钥 + 用量回调
# 配置键名在不同版本间调整过，版本差异以官方文档为准
model_list:
  - model_name: qwen7b-local            # 对外名，与上游真实模型名解耦
    litellm_params:
      model: openai/qwen2.5-7b-instruct  # vLLM 兼容 OpenAI 协议，前缀 openai/
      api_base: http://10.0.12.31:8000/v1
      api_key: os.environ/VLLM_7B_KEY   # 上游密钥只存在于网关，不下发到应用
      rpm: 1440                          # 每分钟 24 次，与限流配额一节同源
      tpm: 90000
    model_info:
      mode: chat
      input_cost_per_token: 0.000017     # 分账用，内部部署按折旧折算
      output_cost_per_token: 0.000034

  - model_name: qwen7b-int8
    litellm_params:
      model: openai/qwen2.5-7b-int8
      api_base: http://10.0.12.32:8000/v1
      api_key: os.environ/VLLM_7B_INT8_KEY
      rpm: 1440

  - model_name: qwen1.5b-int4
    litellm_params:
      model: openai/qwen2.5-1.5b-int4
      api_base: http://10.0.12.33:8000/v1
      api_key: os.environ/VLLM_15B_KEY
      rpm: 2880

  - model_name: cloud-large                  # 灰度期并存的 API 后端
    litellm_params:
      model: openai/gpt-4o
      api_key: os.environ/CLOUD_LARGE_KEY
      rpm: 600

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY   # 应用侧唯一持有这一把
  store_model_usage_db: true                  # 用量落库，成本分账的唯一数据源
  database_url: postgresql://llm@pg.internal:5432/llm_usage

litellm_settings:
  drop_params: true                            # 下游多传的参数直接丢弃，避免上游报错
  request_timeout: 60
  num_retries: 2
```

三个设计点值得逐条说。**对外名与上游名解耦**：`qwen7b-local` 这个名字背后可以是 vLLM、可以是 API、可以是明天的新版本，应用代码一行不用改，这是灰度与回滚能成立的前提。**密钥单向收口**：应用只拿 `master_key`，上游密钥永远不下发，本项目有 6 个后端，从 6 把密钥变成 1 把。**用量必须落库**：`store_model_usage_db` 是成本分账唯一的原始数据，没开这一项后面"成本分账"一节就只能靠人工回忆。

### 多模型路由策略

路由要回答一个问题：这条请求该给谁。按"复杂度、成本、延迟"三个维度分三档，判据必须是请求本身的特征而不是模型的自评，因为让模型判断自己能不能干准确率只有七成。

| 档位 | 判定信号（请求侧特征） | 路由目标 | 流量占比 | 相对成本 | 实测 P95 |
|---|---|---|---|---|---|
| 复杂规划 | 意图为规划/评审，或预计工具调用 ≥ 3 次 | cloud-large 或 70B | 12% | 1.00 | 2.10 s |
| 常规问答 | 单轮或双轮、无工具调用、上下文 < 3,000 token | qwen7b-local（FP16） | 68% | 0.12 | 1.42 s |
| 简单分类 | 意图判定、实体抽取、关键词匹配类请求 | qwen1.5b-int4 | 20% | 0.03 | 0.31 s |

加权成本 \(= 0.12 \times 1.00 + 0.68 \times 0.12 + 0.20 \times 0.03 = 0.208\)，即全量走大模型的 20.8%，节省 79.2%。分类这一步用规则先做一遍，只在规则不确定时才调小模型判一次，本章的分类请求里有 62% 命中纯规则（关键词与句式），不调模型。

```yaml
# 路由规则挂在网关的 router_settings 下；分类器只在规则不确定时才被调用
router_settings:
  routing_strategy: usage-based-routing-v2
  fallbacks:
    # 主模型不可用时的兜底链，顺序即优先级
    - cloud-large: ["qwen7b-local"]
      qwen7b-local: ["qwen7b-int8", "cloud-large"]
  context_window_fallbacks:
    - qwen7b-local: {"max_context_len": 8192, "max_input_tokens": 12000}

model_group_alias:
  qwen7b-local: ["local-primary"]
```

三条纪律是路由的常见故障源：**兜底链不能成环**（`qwen7b-local` 的兜底里不能再写自己），**路由判定结果必须落日志**（否则成本归因时说不清某条请求为什么走了小模型），**路由规则变更要走灰度**（把 12% 提到 30% 是质量风险事件，不是配置改动）。

### 故障转移机制

故障转移的骨架和第一章的重试退避熔断是同一套东西，只是作用对象从函数换成了模型后端。四条动作按执行顺序排列：重试 → 退避 → 熔断 → 降级。

| 故障信号 | 判定条件 | 动作 | 退避 | 用户可见 |
|---|---|---|---|---|
| 单次超时 | 该请求超过 15 秒未出首 token | 换下一个后端重试 | 立即，无退避 | 无感 |
| 限流 | 上游返回 429 | 换后端 + 请求进等待队列 | 0 到 500 毫秒抖动 | 无感 |
| 连续失败 | 同一后端连续 10 次失败 | 熔断 60 秒，期间不再投递 | 熔断期结束前半开试探 | 无感 |
| 熔断中 | 熔断窗口未结束 | 全部流量走兜底后端 | 不适用 | 无感 |
| 主备全不可用 | 兜底后端也全部熔断 | 降级：返回检索片段并明确拒答 | 不适用 | 明确告知，不可假装成功 |

```python
import random, time

TIMEOUT_S = 15
FAIL_THRESHOLD = 10
BREAK_WINDOW_S = 60
BACKOFF = (1.0, 2.0, 4.0)          # 与第一章同一套退避基数


class CircuitBreaker:
    def __init__(self, backend: str):
        self.backend = backend
        self.consecutive_failures = 0
        self.opened_until = 0.0

    def allow(self) -> bool:
        # 半开：熔断期结束只放一个请求进来试探，成功则完全关闭
        return time.monotonic() >= self.opened_until

    def on_success(self) -> None:
        self.consecutive_failures = 0
        self.opened_until = 0.0

    def on_failure(self) -> None:
        self.consecutive_failures += 1
        if self.consecutive_failures >= FAIL_THRESHOLD:
            self.opened_until = time.monotonic() + BREAK_WINDOW_S


def call_with_failover(backends: list[str], send, breaker: dict[str, CircuitBreaker]):
    """按 backends 顺序投递；只在可重试故障上换后端，
    参数错误与内容审核拒绝必须立刻抛出去，换后端只会把同样的错再犯一遍"""
    last_err = None
    for attempt, backend in enumerate(backends):
        if not breaker[backend].allow():
            continue                                  # 熔断中直接跳过，不浪费 15 秒超时
        try:
            result = send(backend, timeout=TIMEOUT_S)
            breaker[backend].on_success()
            return {"backend": backend, "result": result, "attempt": attempt + 1}
        except RetryableError as exc:                   # 超时、429、5xx
            breaker[backend].on_failure()
            last_err = exc
            if attempt < len(backends) - 1:
                time.sleep(BACKOFF[min(attempt, len(BACKOFF) - 1)] + random.uniform(0, 0.5))
            continue
        except (InvalidParam, SafetyReject):
            raise                                      # 不可重试，立刻停
    return degrade(last_err)                            # 全挂走降级，不抛 500 给用户
```

降级不是"返回一句抱歉"，它是一条有产出的路径。本章的降级输出是检索命中的 3 条制度原文加一句"本次未能生成结论，以下为相关条文，请人工确认"，它让用户拿到一半价值，也让业务侧看到一条可统计的降级事件，而不是一次沉默的失败。

!!! mascot-encourage "故障转移没那么玄"
    ![墨墨为你打气](../../img/mascot/encouraging.png){ class="mascot-admonition-img" }
    这套东西的四步你在第一章已经学过一遍，这里只是把对象从函数换成模型后端。真正要下功夫的只有一处：把"不可重试的故障"和"可重试的故障"分清楚，不然熔断器会对着一个参数错误重试到天荒地老。

### 限流与配额

限流保护的是推理服务，配额保护的是预算，两者的实现不同但都必须放在网关。令牌桶是最常用的限流算法：桶按固定速率 R（目标 QPS）匀速放令牌，桶容量 B 决定能承受多长时间的突发。

\[
B = R \times B_{\text{burst}}
\]

本章的取值：单实例实测吞吐上限 25 QPS，打九折后全局限流 \(R = 24\) QPS，突发窗口取 5 秒所以桶容量 120 个令牌。

```python
import time
from collections import defaultdict, deque

GLOBAL_QPS = 24                     # 单实例实测上限 25 的九折，留 10% 给自身抖动
BURST_SECONDS = 5
GLOBAL_BUCKET = GLOBAL_QPS * BURST_SECONDS      # 120 个令牌
TENANT_QPS = {"finance": 12, "hr": 6, "support": 6}
TENANT_CONCURRENCY = 8


class TokenBucketLimiter:
    def __init__(self, capacity: int, refill_per_s: float):
        self.capacity = capacity
        self.tokens = float(capacity)              # 启动时桶是满的，允许一次冷启动突发
        self.refill_per_s = refill_per_s
        self.updated = time.monotonic()

    def take(self, n: int = 1) -> bool:
        now = time.monotonic()
        self.tokens = min(self.capacity,
                          self.tokens + (now - self.updated) * self.refill_per_s)
        self.updated = now
        if self.tokens >= n:
            self.tokens -= n
            return True
        return False                                 # 没令牌就排队，绝不直接拒绝


class QuotaGuard:
    def __init__(self):
        self.global_bucket = TokenBucketLimiter(GLOBAL_BUCKET, GLOBAL_QPS)
        self.tenant_bucket = {t: TokenBucketLimiter(q * BURST_SECONDS, q)
                              for t, q in TENANT_QPS.items()}
        self.inflight: dict[str, int] = defaultdict(int)
        self.month_tokens: dict[str, int] = defaultdict(int)

    def admit(self, tenant: str, est_tokens: int) -> tuple[bool, str]:
        if self.inflight[tenant] >= TENANT_CONCURRENCY:
            return False, "tenant_concurrency"          # 租户并发满，隔离到别的租户
        if not self.global_bucket.take():
            return False, "global_rate"                 # 全局排队，最长等 30 秒
        if not self.tenant_bucket[tenant].take():
            return False, "tenant_rate"
        if self.month_tokens[tenant] + est_tokens > MONTH_QUOTA[tenant]:
            return False, "month_quota"                 # 预算耗尽，返回可读错误而不是限流
        self.inflight[tenant] += 1
        return True, "ok"
```

| 层级 | 限流对象 | 本章阈值 | 超限行为 | 依据 |
|---|---|---|---|---|
| 全局速率 | 单实例请求 | 24 QPS，桶容量 120 | 进队列，最长等 30 秒 | 单实例实测上限 25 QPS × 0.9 |
| 租户速率 | 每租户请求 | 财务 12 QPS，人事 6 QPS，客服 6 QPS | 返回 429 带 `Retry-After` | 三租户实测流量占比 46% / 28% / 26% |
| 租户并发 | 每租户在跑请求 | 8 路 | 返回 429，不排队 | 与 vLLM 的 `--max-num-seqs 24` 匹配，8 路可保证 3 租户共存 |
| 单请求上限 | 单次 `max_tokens` | 2,048 token | 截断并标记 | 抑制 P99 尾部，本章 P99 输出 1,640 token |
| 月度配额 | 每租户 token | 财务 1,200 万，人事 400 万，客服 600 万 | 返回配额耗尽提示 | 财务部预算上限折算 |

限流和配额必须分开设，因为它们的处置动作不同：限流是**临时**的，等一会儿就好，所以要排队和退避；配额是**永久**的，加钱才有，所以必须返回一个能让人读懂的错误（"本月财务部额度已用尽，请联系管理员"），而不是一个 429 让前端反复重试。

### 缓存语义层

推理侧的缓存有两层，收益差一个数量级，必须分开讲。**前缀缓存**复用模型内部的 KV Cache，命中后直接跳过这一段的前向计算，**零质量损失**；**语义缓存**复用最终答案，有误命中风险，**有质量代价**。

前缀缓存的原理是自回归模型的注意力对前文 token 的计算结果可以整体复用。你的系统提示词（1,800 token）和工具定义（900 token）合计 2,700 token 在每次请求里逐字节相同，这段就是免费的。收益可直接算：

\[
T_{\text{saved}} = (1 - h) \times \frac{L_{\text{prefix}}}{R_{\text{prefill}}}
\]

其中 \(h\) 是前缀命中率，本章线上实测 0.94，\(L_{\text{prefix}} = 2{,}700\) token，\(R_{\text{prefill}} = 8{,}000\) token/s，所以每次请求省下 \((1 - 0.94) \times 2700 \div 8000\)，也就是约 20 毫秒。

```python
import hashlib, time
from dataclasses import dataclass, field

SYSTEM_PROMPT_V = "sop-2026-10-06"      # 提示词版本必须进缓存键，否则改了内容会命中旧值
TOOLSET_V = "tools-14"
PREFIX_TOKENS = 2700                    # 系统提示 1,800 加工具定义 900
PREFILL_RATE = 8000                     # token/s，本项目单卡实测
SIM_THRESHOLD = 0.92                    # 语义缓存相似度阈值


def prefix_key(req: dict) -> str:
    """前缀缓存键只由"逐字节相同"的部分决定：提示词版本、工具集版本、
    租户、以及最前面的固定证据块。用户输入绝不能进这个键"""
    head = f"{SYSTEM_PROMPT_V}|{TOOLSET_V}|{req['tenant_id']}|{req['evidence_head']}"
    return hashlib.sha256(head.encode()).hexdigest()


def prefix_hit(req: dict, cache: dict) -> dict:
    """命中即跳过大段前向计算；命中率按 token 计而不是按请求计"""
    key = prefix_key(req)
    miss_tokens = 0 if key in cache else PREFIX_TOKENS
    cache.setdefault(key, True)
    return {
        "hit": miss_tokens == 0,
        "miss_tokens": miss_tokens,
        "saved_ms": round(miss_tokens / PREFILL_RATE * 1000, 1),
    }


@dataclass
class SemanticCacheEntry:
    question: str
    answer: str
    cites: list[str]
    expires_at: float
    hits: int = 0


class SemanticCache:
    """语义缓存只对只读问答启用；相似度阈值 0.92 是本章实测出的分界，
    低于 0.90 时 200 条真实重复提问的误命中率升到 4.7%"""

    def __init__(self, ttl_s: int = 86_400):
        self.ttl_s = ttl_s
        self.entries: list[SemanticCacheEntry] = []

    def get(self, q: str, embed) -> SemanticCacheEntry | None:
        now = time.time()
        self.entries = [e for e in self.entries if e.expires_at > now]   # 顺手清过期
        if not self.entries:
            return None
        qv = embed(q)
        scored = sorted(self.entries,
                        key=lambda e: -float(qv @ embed(e.question)))
        best, score = scored[0], float(qv @ embed(scored[0].question))
        if score < SIM_THRESHOLD:                    # 低于阈值宁可不命中，也不要给错答案
            return None
        best.hits += 1
        return best

    def put(self, q: str, answer: str, cites: list[str]) -> None:
        self.entries.append(SemanticCacheEntry(
            question=q, answer=answer, cites=cites,
            expires_at=time.time() + self.ttl_s,
        ))
```

| 缓存层 | 作用对象 | 本章配置 | 实测收益 | 风险 |
|---|---|---|---|---|
| 前缀缓存 | 模型内部 KV Cache | 命中率 0.94，每次省约 20 ms 前向 | 首 token P50 从 620 降至 390 ms | 提示词改动必须同步改版本号，否则命中旧值 |
| 语义缓存 | 最终答案 | 阈值 0.92，TTL 24 小时，仅只读问答 | 命中率 0.31，命中请求延迟降到 0.28 s | 误命中率 1.2%，制度类问答不可放宽到 0.90 以下 |

前缀缓存真正的收益不在这 20 毫秒，而在于它让"固定前缀"这件事从负担变成资产：prefix 越长，命中率每降一个百分点的损失越大，所以 2,700 token 的固定前缀是刻意设计的——把工具定义和系统提示写成不含时间戳、不含随机 ID、不含动态租户名的静态块，任何一个字节的漂移都会让整段缓存失效。

!!! mascot-tip "语义缓存的阈值不能靠感觉调"
    ![墨墨提示技巧](../../img/mascot/tip.png){ class="mascot-admonition-img" }
    0.92 这个数字来自 200 条真实重复提问的实测：阈值放到 0.90，误命中率从 1.2% 跳到 4.7%，而制度类问答错一条就是业务事故。先在自己的真实提问上跑一遍这条曲线，再定阈值。

### 成本分账

自建推理没有 token 单价，但成本是实打实的：2 张 A100 80 GB 月租 18,000 元。本章把它折算成单次请求成本，再按四个维度摊到人头。

先算单次成本。有效处理量 = 日请求数 × 30 天 × 利用率：

\[
C_{\text{per}} = \frac{C_{\text{month}}}{D \times 30 \times u}
\]

其中 \(C_{\text{month}} = 18{,}000\) 元，\(D\) 是日请求数，\(u\) 是 GPU 利用率。按 \(D = 12{,}000\)、\(u = 0.65\) 算，单次成本 \(= 18{,}000 \div 234{,}000 = 0.0769\) 元。再和 API 的 0.0338 元对比：自建当前是 API 的 2.28 倍。

这个数字必须诚实讲出来，因为它的含义很明确：**当前量级下自建不省钱**。把利用率拉满到 100% 也只能降到 0.05 元，仍高于 API。真正的账在别处：制度原文不出域、延迟可控、可以随时换版。把这些折算成愿意付的钱，本章的口径是每月最多愿意为合规与可控多付 \(18{,}000 - 12{,}168 = 5{,}832\) 元。

| 分摊维度 | 字段来源 | 权重 | 本月预估 | 分摊口径 |
|---|---|---|---|---|
| 按部门 | 网关头 `tenant_id` | 40% | 财务 7,200 元、人事 2,160 元、客服 3,600 元 | 部门承担合规与预算责任，权重最高 |
| 按项目 | 请求头 `X-App-Id` | 30% | 制度助手 5,400 元、报销查询 1,800 元 | 按项目归口，改需求的项目自己付 |
| 按用户 | 追踪 `user_id` | 20% | Top 20 用户占 3,600 元 | 人均上限 600 元，超额走部门 |
| 按会话 | 追踪 `session_id` | 10% | 超长会话占 1,800 元 | 异常会话单独列出，是排查循环调用的入口 |

```python
"""分账：网关用量表是唯一数据源，按四维加权摊到租户账单。
只按总量摊账会引发争议——不同租户因权限过滤看到的证据块数不同，token 天然有差异"""
DIM_WEIGHTS = {"tenant": 0.40, "app": 0.30, "user": 0.20, "session": 0.10}
MONTH_COST_CNY = 18_000.0        # 2 × A100 80 GB 月租
USER_MONTHLY_CAP_CNY = 600.0


def allocate(usage_rows: list[dict], month_cost: float = MONTH_COST_CNY) -> dict:
    """usage_rows 每行必须带 tenant_id、app_id、user_id、session_id 与 token 合计；
    四维权重之和为 1，摊完的总额必须与总成本相等（残差归到 tenant 维兜底）"""
    totals = {dim: 0.0 for dim in DIM_WEIGHTS}
    for r in usage_rows:
        cost = r["tokens"] / 1000 * 0.000034        # 按折旧折算的单价，与网关 cost 字段同源
        for dim in DIM_WEIGHTS:
            totals[dim] += cost * DIM_WEIGHTS[dim]

    by_tenant: dict[str, float] = {}
    for r in usage_rows:
        cost = r["tokens"] / 1000 * 0.000034
        by_tenant[r["tenant_id"]] = by_tenant.get(r["tenant_id"], 0.0) + cost * DIM_WEIGHTS["tenant"]

    residual = month_cost - sum(by_tenant.values())
    if residual > 0.001:                            # 残差按 tenant 用量比例补齐，不许四舍五入掉
        pool = sum(by_tenant.values()) or 1.0
        for t in by_tenant:
            by_tenant[t] += residual * by_tenant[t] / pool

    by_user: dict[str, float] = {}
    for r in usage_rows:
        cost = r["tokens"] / 1000 * 0.000034 * DIM_WEIGHTS["user"]
        by_user[r["user_id"]] = by_user.get(r["user_id"], 0.0) + cost

    over_cap = {u: round(v - USER_MONTHLY_CAP_CNY, 2) for u, v in by_user.items()
                if v > USER_MONTHLY_CAP_CNY}
    return {
        "by_dimension": {k: round(v, 2) for k, v in totals.items()},
        "by_tenant": {k: round(v, 2) for k, v in by_tenant.items()},
        "over_cap_users": over_cap,                  # 超额部分转由部门承担，不允许个人账单为负
        "reconciled": abs(sum(by_tenant.values()) - month_cost) < 0.01,
    }
```

分账有三条纪律：**总额必须对得上**（摊完合计与总成本残差小于 0.01 元，否则说明有用量记录丢失）；**人均设上限**（本章 600 元/月，超额转部门，防止一个脚本循环把预算烧光）；**用量表只追加不覆盖**（改了单价也要能重算三个月前的账单，所以单价存成版本而不是写死在代码里）。

## 四、压测与延迟

### 压测方法

压测的价值只在一件事上：告诉你离崩溃还有多远，而这件事靠的是压测三档与三类必须记录的分位数。三档各测一件不同的事，缺一档就有一类故障测不出来。

| 档 | 目的 | 并发 | QPS | 时长 | 只测出来什么 |
|---|---|---|---|---|---|
| 档一 基线 | 测单请求的裸延迟 | 1 | — | 5 分钟 | 纯推理耗时，不含排队，用来对比任何改动 |
| 档二 容量 | 找吞吐拐点 | 8 逐步升到 64，步长 8 | 同步爬升 | 15 分钟 | 吞吐从 3.84 涨到 4.02 QPS 后持平，拐点在 24 路 |
| 档三 长尾 | 测 P99 与稳定性 | 24（峰值档） | 20 | 30 分钟 | P99 从 4.60 s 升到 5.10 s，第 26 分钟首次出现 KV OOM 重试 |

```bash
#!/usr/bin/env bash
# 三档压测脚本：语料必须取真实 trace 的分位数分布，不能用同一句话
# 参数与输出字段随 vLLM 版本调整，版本差异以官方文档为准
set -euo pipefail
OUT="loadtest/$(date +%Y%m%d-%H%M)"
mkdir -p "$OUT"

# 语料口径：输入长度取 P50 5,880 token，输出长度分布按 320 / 900 / 2,000 三档按比例混合
# 千万别只用一条固定输入，前缀缓存会被顶到接近全命中，测出来的 TTFT 是假的
jq -r '.items[] | {in_len: 5880, out_len: (if .p <= 0.7 then 320 elif .p <= 0.97 then 900 else 2000 end)}' \
   data/load_corpus.jsonl > "$OUT/corpus.jsonl"

for CONC in 1 8 16 24 32 48 64; do                       # 档一与档二：并发爬坡找拐点
  hey -z 5m -c "$CONC" -m POST \
      -H "Authorization: Bearer ${LITELLM_MASTER_KEY}" \
      -H "Content-Type: application/json" \
      -D "$OUT/c${CONC}.txt" \
      http://10.0.12.30:4000/v1/chat/completions < "$OUT/corpus.jsonl"
  # 三类分位数必须分别落盘：TTFT 看首 token，TPOT 看解码，e2e 看用户体验
  python -m tools.latency_report --in "$OUT/c${CONC}.txt" \
      --quantiles 50,90,95,99 --out "$OUT/c${CONC}.report.json"
done

# 档三：固定峰值 QPS 跑 30 分钟，抓 P99 与稳定性；必须跨过 KV OOM 的临界点
hey -z 30m -q 20 -c 24 -m POST \
    -H "Authorization: Bearer ${LITELLM_MASTER_KEY}" \
    -H "Content-Type: application/json" \
    -D "$OUT/soak.txt" \
    http://10.0.12.30:4000/v1/chat/completions < "$OUT/corpus.jsonl"
```

| 必记指标 | 口径 | 本章实测 | 门禁 |
|---|---|---|---|
| 端到端延迟 P50 / P95 / P99 | 网关收到请求到最后一个 token | 2,800 / 3,350 / 4,600 ms | P95 ≤ 3.00 s |
| 首 token 延迟 P50 / P99 | 网关收到请求到首个 token | 390 / 1,180 ms | P99 ≤ 1,500 ms |
| 每输出 token 时间 TPOT P95 | 解码段耗时除以输出 token 数 | 62 ms | ≤ 80 ms |
| 吞吐 QPS | 成功请求数除以压测时长 | 3.84 QPS（档二拐点 24 路） | 峰值 24 QPS 不被打满 |
| 错误率 | 5xx 与超时占全部请求 | 档三峰值 0.8% | ≤ 1.0% |
| 前缀缓存命中率 | 命中 token 除以总输入 token | 0.94 | ≥ 0.90 |

压测有三个必须避开的坑，按危害排序。**第一，语料太单一**。用同一句固定输入做压测，前缀缓存命中率被顶到接近 1.00（线上 0.94），前向计算几乎全免，测出来的首 token P50 会比线上低 300 毫秒以上，门禁误判为通过。本章的解法是语料直接取真实 trace 的长度分位数。**第二，只压平均不压长尾**。只发平均长度的请求，P99 根本测不出来，因为 P99 恰恰由那 2,000 token 的请求贡献。**第三，忘了清前缀缓存**。压测直接复用上一轮的热缓存，等于测的是缓存命中态而非稳态，两者差 300 毫秒。

!!! mascot-warning "压测数据太单一，是最贵的错"
    ![墨墨提醒注意](../../img/mascot/warning.png){ class="mascot-admonition-img" }
    拿同一句话跑一万遍，缓存几乎全命中，测出来的延迟好看得不像真的，上线第二天全被打回来。这个坑我替你踩过：门禁过了，首 token 却在真实流量里翻了三倍。语料必须取真实 trace 的长度分布。

### 延迟优化清单

延迟优化要有清单，因为散装优化会越做越乱。这一节按"收益除以风险"排序，十项做完端到端 P95 从 3.35 s 降到 2.54 s，与第十一章的口径一致。

| 序 | 动作 | 收益 | 代价与风险 | 归属 |
|---|---|---|---|---|
| 1 | 工具调用串行改并行 | −400 ms | 无，纯机械改动 | 缓存语义层 |
| 2 | 固定前缀走前缀缓存 | −230 ms | 提示词任何字节漂移即失效 | 缓存语义层 |
| 3 | 跳过无指代查询的改写 | −180 ms | 覆盖 38% 流量，剩下 62% 无收益 | 多模型路由策略 |
| 4 | 流式输出 | 用户感知 −2.6 s | 后端指标不变，别拿它当压测成绩 | vLLM部署入门 |
| 5 | 启动时预热固定前缀 | 冷启动首 token −1.2 s | 占用显存，冷启动多 30 秒 | vLLM部署入门 |
| 6 | `--gpu-memory-utilization` 0.90 提到 0.94 | 并发 +13% | 余量从 5.3% 降到 1.9%，OOM 风险明显上升 | 显存估算方法 |
| 7 | 单请求 `max_tokens` 上限 2,048 | P99 从 4,600 降到 4,020 ms | 长文摘要会截断 | 限流与配额 |
| 8 | 摘要去掉无引用证据块 | 输入 −1,200 token | 召回下降 0.03 | 延迟优化 |
| 9 | 量化到 INT8 | 解码 +15% | 正确率 −0.01 | 量化选型 |
| 10 | 张量并行 2 → 1（7B 单卡） | 首 token +40 ms 变 −40 ms | 显存预算从 144 GB 降到 72 GB，并发上限减半 | 显存估算方法 |

这张表里最反直觉的是第 10 项。7B 在 2 卡上跑，张量并行的通信开销让首 token 比单卡慢 40 毫秒，而切回单卡后显存预算减半、`--max-num-seqs` 从 24 降到 16，吞吐掉三成。结论是：**7B 不要开张量并行**，它只有在 13B 以上或显存塞不下时才必要。

三条执行纪律：一次只上三项并且各改一个变量（否则涨了不知道是谁的功劳）；每项都要有可复现的压测对比（第 1、2、3 项合计省 810 毫秒就是三份独立对比加出来的）；顺序按"零质量损失的先做"排（第 1、4、5、7 项零质量损失，合计 −400 −2,600（感知）−1,200（冷启动）−580 毫秒 P99）。

!!! mascot-neutral "延迟清单要分清后端指标和用户感知"
    ![墨墨说明情况](../../img/mascot/neutral.png){ class="mascot-admonition-img" }
    流式输出能让用户感觉快了 2.6 秒，后端端到端一个毫秒都没省。拿它去交压测报告会很好看，拿它去交 SLO 门禁会很难看——两把尺子别混着用。

## 五、上线交付

### 推理安全加固

推理服务和普通 Web 服务有一处根本不同：**它会执行用户提供的文本**。注入攻击、越权检索、恶意超长输入，都不是"以后再说"的风险，而是上线当天就存在的攻击面。

| 面 | 措施 | 本章配置 | 攻击被挡在哪 |
|---|---|---|---|
| 网络暴露 | 只绑内网地址 + 安全组白名单 | `--host 10.0.12.31`，安全组只放行 10.0.0.0/16 | 端口扫描扫不到 |
| 鉴权 | 网关 `master_key` + vLLM `--api-key` 双层 | 两把密钥不同人持有 | 拿到应用密钥的攻不进模型端口 |
| 限流 | 网关令牌桶 | 全局 24 QPS，租户 8 路并发 | 暴力枚举与压测式滥用 |
| 输入过滤 | 长度上限 + 注入特征检测 | 上限 8,192 token，命中 `ignore previous` 类特征直接拒 | 提示注入与超长上下文打爆 |
| 输出过滤 | 敏感词 + 引用校验 | 接第十三章的内容审核链路 | 模型被诱导输出违规内容 |
| 模型文件访问控制 | 权重目录 750 + 只读挂载 + 独立服务账号 | 应用服务只读，不给执行权限 | 攻击者无法替换权重投毒 |
| 日志脱敏 | access log 只记 token 数与 `trace_id` | 不记输入原文 | 数据库泄露即用户数据泄露 |

有一条容易被跳过但后果最重：**权重目录必须是只读挂载且权限 750**。推理服务进程被拿到执行能力时，如果它同时能改写权重文件，攻击者就能把后门模型挂上去，而你的网关日志里只会显示一次正常的成功请求。

```bash
#!/usr/bin/env bash
# 权重目录与运行账号的最小权限配置；两条纪律：权重只读、运行账号无权写
set -euo pipefail
MODEL_DIR=/models/qwen2.5-7b-instruct

chmod 750 "$MODEL_DIR"
chown -R root:vllm "$MODEL_DIR"
find "$MODEL_DIR" -type f -exec chmod 440 {} \;     # 权重文件对 vllm 组只读

# 运行账号属于 vllm 组但不属于文件属主，无法写入权重目录
id -u vllm && id -g vllm

# 启动后自检：运行账号写不进去才是对的，write 成功反而说明权限配错了
if sudo -u vllm test -w "$MODEL_DIR"; then
  echo "致命：运行账号可写权重目录，请立即修正" >&2; exit 1
fi
echo "权限自检通过：vllm 无法写入 $MODEL_DIR"
```

### 灰度与回滚

灰度的意义不是"慢慢放流量"，而是**在放量的每一步都还能退回**。所以灰度设计的重点全在回滚：回滚开关必须存在、必须能在 5 分钟内拨动、必须演练过。

| 阶段 | 流量 | 观察时长 | 晋级条件 | 回滚动作 |
|---|---|---|---|---|
| 0 影子 | 0%，只记录不返回 | 24 小时 | 无 error 事件，且 P95 与线上基线差 ≤ 5% | 关停影子流量 |
| 1 金丝雀 | 5% | 2 小时 | 成功率 ≥ 99.5%、P95 ≤ 3.00 s、成本未升 | 权重回 0，耗时 < 5 分钟 |
| 2 放量 | 25% → 50%，每级 4 小时 | 8 小时 | 每级四道门禁全过 | 权重回上一级 |
| 3 全量 | 100% | — | — | 30 分钟内回上一版本 |

回滚必须预置而不是临场操作。做法是在网关的路由层注册新旧两个模型名，灰度只是改 `model_name` 的权重分布，回滚就是把权重改回 100%。本章的回滚演练实测耗时 3 分 40 秒，验证内容是：主版本回滚后 5 分钟内错误率回到基线 ±2% 以内、P95 回到 3,000 毫秒以内、成本没有异常波动。

三条纪律：**回滚开关先演练再灰度**（开关本身坏掉的灰度等于一次真实故障）；**回滚不能同时回滚配置**（配置与模型版本要能分开退，否则退不干净）；**每次回滚必须留记录**（谁在什么时候拨的开关、拨之前是什么），三个月后那次线上抖动才说得清。

### 部署交付流水线

流水线的意义是把"发布前该确认什么"从个人经验变成一份不可跳过的清单。下面这份清单是本章全部内容的收口，每一项都对应前面某一节的结论，任一项没过就不许放量。

- [ ] **模型版本**：权重文件路径、版本号、校验和三项齐全，镜像内权重哈希与清单一致 | 推理安全加固
- [ ] **启动参数**：`--tensor-parallel-size`、`--max-model-len`、`--max-num-seqs`、`--gpu-memory-utilization` 四项与显存估算表一致 | vLLM部署入门
- [ ] **显存核算**：按本项目并发与上下文算出的显存合计不超过预算 72.0 GB，并留 ≥ 5% 余量 | 显存估算方法
- [ ] **量化档位**：主模型为 FP16，任何 INT4 副本仅用于分类与路由，且正确率已复测 | 量化选型
- [ ] **网关配置**：`master_key` 已轮换、上游密钥未下发到应用、用量落库正常 | LiteLLM网关配置
- [ ] **路由规则**：路由判定结果落日志、兜底链无环、变更已灰度 | 多模型路由策略
- [ ] **故障转移**：超时、429、5xx 三类各有演练记录，主备全挂的降级路径输出可读 | 故障转移机制
- [ ] **限流配额**：全局 24 QPS、三租户配额、月度配额均已生效并返回可读错误 | 限流与配额
- [ ] **缓存阈值**：前缀命中率 ≥ 0.90、语义缓存阈值 0.92 且只对只读问答启用 | 缓存语义层
- [ ] **成本分账**：本月预估总额与网关用量表残差 < 0.01 元，人均未超 600 元 | 成本分账
- [ ] **压测记录**：三档全部完成，P95 ≤ 3.00 s、P99 ≤ 5,000 ms、错误率 ≤ 1.0%，语料取自真实 trace | 压测方法
- [ ] **灰度计划**：阶段、流量、观察时长、晋级条件、回滚动作五列填满，无空白 | 灰度与回滚
- [ ] **回滚开关**：拨动耗时实测 ≤ 5 分钟，且已验证回滚后指标回到基线 ±2% | 灰度与回滚
- [ ] **监控告警**：OOM、KV 缓存占用率、前缀命中率骤降、降级事件量四条告警已挂且可触发 | 延迟优化清单
- [ ] **安全项**：端口只在内网、权重目录只读、日志不含输入原文三项自检通过 | 推理安全加固

### 容量规划

容量规划是把前面所有数字收成两个数：需要几台实例，显存能撑几路并发。两个公式，都只需要已知量。

实例数由吞吐决定，除以单实例实测吞吐再乘安全系数 0.7（留 30% 余量给抖动与流量毛峰）：

\[
N = \left\lceil \frac{Q_{\text{target}}}{q_{\text{instance}} \times 0.7} \right\rceil
\]

显存约束下的最大并发由 KV 预算决定：

\[
C_{\max} = \frac{M_{\text{budget}} - M_{\text{weight}}}{L_{\text{seq}} \times k}
\]

代入本项目：峰值 QPS 目标 3.2（按日均 12,000 次、峰值集中在 2.5 分钟窗口折算），单实例实测 3.84 QPS，所以 \(N = \lceil 3.2 \div (3.84 \times 0.7) \rceil = \lceil 1.19 \rceil = 2\) 台。两台合计有效吞吐 \(2 \times 3.84 \times 0.7 = 5.38\) QPS，余量 2.18 QPS，可承受 68% 的流量增长。

显存侧的并发上限：预算 72.0 GB 减去 7B FP16 权重 14 GB 得 KV 预算 58 GB，除以每序列 KV（4,096 token × 0.5 MB = 2 GB）得 \(C_{\max} = 58 \div 2 = 29\) 路。所以 `--max-num-seqs` 设 24 而不是 29，留 17% 余量给碎片与长短不均。

```python
"""容量规划：两个公式的落地版，两个数决定买多少卡"""
import math

DAY_REQUESTS = 12_000
PEAK_WINDOW_MIN = 2.5           # 峰值流量集中在这个窗口内
Q_INSTANCE = 3.84               # 单实例实测吞吐，与连续批处理一节同源
SAFETY = 0.7                    # 抖动与毛峰余量，固定 0.7 不允许临时调
GPU_BUDGET_GB = 72.0            # 单卡 80 GB × 0.90
WEIGHT_GB = 14.0
MAX_LEN = 4_096
KV_MB_PER_TOKEN = 0.5
CARDS_PER_INSTANCE = 2


def peak_qps(day_requests: int, window_min: float) -> float:
    return day_requests / (24 * 60) * (24 * 60 / window_min)


def plan(q_target: float) -> dict:
    instances = math.ceil(q_target / (Q_INSTANCE * SAFETY))
    effective_qps = instances * Q_INSTANCE * SAFETY
    kv_budget = GPU_BUDGET_GB - WEIGHT_GB
    max_concurrency = int(kv_budget / (MAX_LEN * KV_MB_PER_TOKEN / 1024))
    return {
        "q_target": round(q_target, 2),
        "instances": instances,
        "effective_qps": round(effective_qps, 2),
        "headroom_qps": round(effective_qps - q_target, 2),
        "growth_tolerance": f"{(effective_qps - q_target) / q_target * 100:.0f}%",
        "max_concurrency": max_concurrency,
        "max_num_seqs": int(max_concurrency * 0.83),      # 取 83%，留 17% 余量，本章 29 → 24
    }


r = plan(peak_qps(DAY_REQUESTS, PEAK_WINDOW_MIN))
assert r["instances"] == 2 and r["max_num_seqs"] == 24

# 盈亏平衡：自建单次成本等于 API 单次成本 0.0338 元时的日均请求数
API_COST = 0.0338
MONTH_GPU_CNY = 18_000
UTIL = 0.65
break_even_daily = MONTH_GPU_CNY / (30 * UTIL * API_COST)
# 结果 27,313 次/日 —— 当前 12,000 次不到一半，这正是第一章判定"先上网关不自建"的依据
```

两个数说清了这套系统的形状：**2 台 2 卡实例，单台并发 24 路，峰值有效吞吐 5.38 QPS**。同时它们也把"要不要自建"的答案钉死了：盈亏平衡在日均 27,313 次，当前 12,000 次差 2.28 倍，所以本章的部署顺序是先把网关和用量统计建起来、把成本账算准，等量翻过 2.3 倍或合规评审落地再上 GPU。

!!! mascot-celebration "交付闭环合上了"
    ![墨墨庆祝](../../img/mascot/celebration.png){ class="mascot-admonition-img" }
    现在你手里有一套能起起来的推理服务、一张能自己算显存的表、一层收口密钥与用量的网关、一条限流配额与故障转移的链子，还有十五项发布前清单。从今天起，"上线前先跑一遍看看"这句话可以退休了。

## 本章小结

本章的核心结论是一张从决策到数字的对照表，所有数字都可回溯到正文小节：

| 结论 | 关键数字 | 出处 |
|---|---|---|
| 自建当前不省钱，盈亏平衡在日均 27,313 次 | 自建单次 0.0769 元，API 0.0338 元，差 2.28 倍 | 容量规划 |
| 7B FP16 不该开张量并行 | 2 卡首 token +40 ms，并发上限减半 | 延迟优化清单 |
| 连续批处理是吞吐的第一杠杆 | 吞吐 1.28 → 3.84 QPS，P50 25.0 → 4.2 s | 连续批处理原理 |
| 权重装得下不等于跑得起来 | 7B 权重 14 GB，32 路并发 KV 64 GB，合计 78 GB 超预算 6 GB | 显存估算方法 |
| 量化是分层的，不是全站或全无 | INT8 正确率 −0.01，INT4 −0.04 恰好压线 | 量化选型 |
| 路由能把成本打到全量的 20.8% | 加权 0.12×1.00 + 0.68×0.12 + 0.20×0.03 = 0.208 | 多模型路由策略 |
| 限流保护服务，配额保护预算 | 全局 24 QPS 桶 120，租户 8 路，月配额 1,200 万 token | 限流与配额 |
| 语义缓存阈值不能靠感觉 | 0.92 误命中 1.2%，降到 0.90 升到 4.7% | 缓存语义层 |
| 压测语料必须来自真实 trace | 单一输入会让首 token P50 虚低 300 ms 以上 | 压测方法 |
| 15 项发布前清单缺一不放量 | 回滚实测 3 分 40 秒，余量 5.3% 需 OOM 告警兜底 | 部署交付流水线 |
| 容量结论 | 2 台 2 卡实例，单台并发 24 路，峰值有效吞吐 5.38 QPS | 容量规划 |
