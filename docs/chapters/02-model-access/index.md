---
title: 模型接入与进阶过渡
description: 从 LangChain 中级过渡到可交付的检索与代理骨架
generated_by: claude skill chapter-content-generator
date: 2026-10-06 01:10:00
version: 1.11
---

# 模型接入与进阶过渡

## 本章概要

本章完成从 LangChain 中级到高级的过渡：链式编排、文档切分、向量库操作、工具绑定与代理循环，把能调模型升级为能建系统。
学完本章，读者将掌握上述主题，并能将其用于后续章节的综合项目。

## 本章覆盖概念

本章覆盖学习图中的以下 18 个概念：

| 概念 | 重要度（CIS） |
|---------|-----------------------|
| LangChain链式编排 | 27 |
| LangChain记忆组件 | 46 |
| 提示词模板管理 | 14 |
| 输出解析器进阶 | 37 |
| 文档加载与切分 | 12 |
| Embedding模型选型 | 29 |
| 向量库基础操作 | 14 |
| TopK召回调参 | 21 |
| 重排序策略 | 48 |
| 对话历史管理 | 15 |
| 工具绑定基础 | 19 |
| 代理执行循环 | 25 |
| 成本与用量监控 | 36 |
| 评估集初建 | 12 |
| 中级RAG全流程 | 26 |
| 从Demo到服务封装 | 72 |
| 并发与限流控制 | 17 |
| 模型选型对照表 | 25 |

## 前置知识

本章会用到以下章节的概念：

- [Chapter 1: 开发基础与工程规范](../01-dev-foundations/index.md)

---

!!! mascot-welcome "从 Demo 到系统"
    ![墨墨挥手欢迎](../../img/mascot/welcome.png){ class="mascot-admonition-img" }
    上一章你搭好了地基，这一章开始组装零件：把模型、文档、检索、工具串成一条能上线的链路。结尾你会拿到一个带记忆、带工具、能评测的检索代理骨架——这正是第三章 RagFlow、第六章 MCP、第七章多 Agent 的共同底座。先跑起来，再讲道理。

本章只做一件事：把"能调模型"升级成"能建系统"。上一章的 `client.post()` 是裸调用，写完就扔；本章开始，每一步都要考虑可替换、可评测、可观测。LangChain 在这里不是信仰，而是一层帮你省掉胶水代码的脚手架——学它的编排思想，而不是把架构押在框架的 API 上。

## 一、链式编排

### LangChain链式编排

链式编排是把一个复杂任务拆成顺序固定的若干步骤，每步只干一件事，输入输出都是结构化的对象。经典形态是"提示词 → 模型 → 解析器"这条三段链，LangChain 用 LCEL（表达式语言）把它写成一行管道：

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

chain = (
    ChatPromptTemplate.from_template("用一句话回答：{question}")
    | model          # 第 2 步：模型
    | StrOutputParser()   # 第 3 步：解析成纯字符串
)
answer: str = chain.invoke({"question": "什么是 Embedding？"})
```

LCEL 的三个好处值得记住：每一步都能单独 `.invoke()` 调试，中间结果可以 `.stream()` 流出来，整条链能 `batch()` 批量跑。链式编排真正的价值是"结构可替换"——今天把模型 A 换成模型 B、把解析器换成结构化解析，改动只在一个位置，下游代码一行不动。

链和链之间也能串：检索链的输出作为生成链的输入，就是 RAG 的骨架。后面所有编排方式，都是在这个骨架上替换环节。

### 提示词模板管理

模板管理的目标是"把提示词从代码里抽出来，变成可版本化、可复用、可测试的资产"。LangChain 的模板分三层，从简单到复杂：`PromptTemplate`（纯字符串插值）、`ChatPromptTemplate`（带角色）、`MessagesPlaceholder`（塞对话历史）。多轮对话必须用占位符接收历史，否则模型看不到上文：

```python
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是客服助手，只依据给定资料回答，不足则说明。"),
    MessagesPlaceholder("history"),     # 多轮历史从这里进
    ("human", "{question}"),
])
chain = prompt | model | StrOutputParser()
```

!!! mascot-tip "墨墨的模板习惯"
    ![墨墨提示技巧](../../img/mascot/tip.png){ class="mascot-admonition-img" }
    模板变量一多就容易漏传。把模板和变量定义放进一个 Pydantic 模型，用 `prompt | model` 前先 `.input_schema` 检查一遍，比线上才发现少个变量再重试便宜一百倍。

### 输出解析器进阶

解析器是把模型的自由文本变成程序能用的结构。基础 `StrOutputParser` 只做剥壳，进阶解析器要处理模型的不听话。真实模型会在 JSON 外面裹代码块、加解释文字、漏字段、给错类型，所以解析器要做三件事：抽取（正则或代码块围栏捞出目标段）、宽松解析（单双引号、尾逗号都容错）、失败兜底（重试或转人工）。

```python
from langchain_core.output_parsers import PydanticOutputParser
from pydantic import BaseModel, Field

class Plan(BaseModel):
    """执行计划"""
    goal: str = Field(description="一句话目标")
    steps: list[str] = Field(description="按序执行步骤，最多 5 条")

parser = PydanticOutputParser(pydantic_object=Plan)
plan: Plan = parser.parse(raw_text)     # 校验失败会抛异常，由调用方兜底
```

把格式说明塞进提示词、解析器只管校验，是分工：提示词里的 Schema 是给模型看的"交货说明"，解析器是给程序看的"验收标准"。两者用同一个 Pydantic 模型生成（`model_json_schema()`），避免两边漂移。

### LangChain记忆组件

记忆组件是"跨轮次保存信息"的容器，跑在对话链式编排之上。先分清三种记忆，别混用：

| 组件 | 存什么 | 适合 |
|---|---|---|
| 缓冲记忆 | 最近 N 条消息原文 | 短对话、上下文够用 |
| 摘要记忆 | 旧消息压缩成一段摘要 | 长对话，容忍细节丢失 |
| 摘要加窗口 | 最近消息原文 + 旧消息摘要 | 生产默认，成本与效果折中 |

LangChain 早期用 `ConversationBufferMemory` 这类对象实现，实际工程里更常见的做法是让模型或数据库当记忆，框架只保留"拼历史"这一步——因为记忆要跨进程、跨请求、跨重启，这是数据库的活，不是内存对象的活。第十章讲的 Mem0 就是把这件事做成了产品。

### 文档加载与切分

RAG 的质量有一半死在切分上。加载器把 PDF、Markdown、HTML 变成纯文本，切分器再把文本切成"块"（chunk），每块独立向量化。切分的矛盾在于：块太大则噪声多、召回不准；块太小则上下文断裂、代词悬空。业界默认起点是按语义边界切分并让相邻块重叠：

```python
from langchain_text_splitters import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=800,      # 每块目标字符数
    chunk_overlap=120,   # 相邻重叠，避免句子被切断
    separators=["\n\n", "\n", "。", "！", "？", " "],  # 优先按段落切
)
docs = splitter.split_documents(raw_pages)
```

分隔符的顺序就是优先级：先按空行（段落），再按换行，再按中文句号，最后才按空格——这样块边界落在语义完整的地方。重叠量取块大小的 15% 左右是常见起点。三个立刻要避的坑：表格被拦腰切断（先转 Markdown 或 HTML 再切）、标题和正文分离（把标题拼进每个块）、纯页眉页脚混入（加载阶段就过滤掉）。

!!! mascot-warning "切分是最贵的偷懒"
    ![墨墨提醒注意](../../img/mascot/warning.png){ class="mascot-admonition-img" }
    新手最爱用默认参数硬调 `chunk_size` 到召回率好看，但根因常常是解析脏了。顺序永远是：先确认解析出来的文本干净，再调块大小，最后才动重叠。跳步的结果是参数怎么调都不稳。

### Embedding模型选型

Embedding 模型把文本映射成固定长度的向量（向量检索的基础），语义相近的文本在向量空间里距离近。选型看三件事：语言覆盖（中文必须选中文优化过的模型）、维度（维度越高存储和检索越贵，效果提升递减）、是否支持"非对称检索"（查询短、文档长时表现好）。选型不是一步到位的，正确姿势是拿自己的真实查询集测，而不是看公开榜单。

换模型有个硬约束：**同一个库里的向量必须来自同一个模型和同一个版本**。换了模型，旧向量全废，必须重建索引。把这一点写进部署检查单，避免某天静默地"检索变差"却查不出原因。

### 向量库基础操作

向量库做的是"给一个查询向量，找出最相似的 TopK 个向量及其原文"。四个基本操作：建索引（add）、检索（similarity_search）、按元数据过滤（filter）、删除更新（delete/update）。选型看数据量与运维负担：十万级以内 Faiss 够用，百万级要 pgvector（已有 Postgres 就用它），再大才上专用向量库。

```python
from langchain_community.vectorstores import FAISS

store = FAISS.from_documents(docs, embed_model)          # 建索引
hits = store.similarity_search("怎么申请退款？", k=5)      # 相似度检索
hits = store.similarity_search("怎么申请退款？", k=5,
       filter=lambda d: d.metadata["tenant"] == "acme") # 元数据过滤
```

!!! mascot-thinking "向量检索不是精确匹配"
    ![墨墨思考中](../../img/mascot/thinking.png){ class="mascot-admonition-img" }
    向量检索的本质是"找相似的文字块"，不是"找正确答案"。它天然有两个软肋：问法太短或太长时向量不稳定；同义不同词、精确的编号和日期这类硬事实，向量反而不如关键词。所以生产系统基本都是"向量 + 关键词"混合检索，下一节的 TopK 和再后面的混合架构都是为这个软肋打的补丁。

### TopK召回调参

TopK 是召回阶段捞多少条进候选集。K 是召回率与精度的直接旋钮：K 太小，正确答案根本没进候选，后面再强的重排也救不回来（召回天花板）；K 太大，噪声进来，重排也排不干净，还白白花算力。经验起点是 K = 20~50，然后靠重排收敛到最终 3~5 条给模型。

调 K 的正确方法是配合评测集（第五节的"评估集初建"）：先在 K=10、20、50、100 各跑一遍，看"正确块是否进入候选"这个指标何时饱和。指标饱和后再加 K 就是纯浪费。

### 重排序策略

重排序（rerank）解决"召回进来了但排不到前面"的最后一公里。召回阶段用 embedding 做粗筛，为了速度用的是双塔结构（查询和文档各自编码）；重排阶段把候选对（查询，文档）一起送进交叉编码器算相关性分数，贵但准。分工：召回要快而全，重排要准而少。

标准流水线是"粗召回 50 条 → 重排 → 取 Top5 给模型"，用 LangChain 表达就是先检索再接一个 reranker 模型重打分。收益非常实在——很多系统的答案质量提升主要来自这一步，而不是换更大的生成模型。代价是每次查询多一次模型调用，所以只对候选集重排，绝不对全库重排。

### 对话历史管理

历史管理和记忆组件是两件事：历史是"这一轮对话的原始消息序列"，记忆是"跨会话的长期知识"。历史管理只解决一个问题——每轮请求要带哪些历史进去。三种策略对应三种成本：

| 策略 | 带上什么 | 适用 |
|---|---|---|
| 全量 | 全部历史 | 短会话，最简单 |
| 滑动窗口 | 最近 K 轮 | 长会话，控制成本 |
| 摘要加窗口 | 最近原文 + 旧文摘要 | 超长会话，成本与效果折中 |

拼历史时要定死一个上限，否则窗口会被悄悄撑爆。工程规范：按 token 预算截断而不是按轮数截断（不同语言每轮 token 数差异极大），并且**永远保留 system 消息和用户的第一个问题**——后者常含任务背景，丢了模型就不知道自己在干什么。

### 工具绑定基础

工具绑定把第一章的 function calling 接进链式编排：把工具的 Schema 挂到模型上，模型决定调用哪个、填什么参数。LangChain 里就是 `.bind_tools([...])`，输出从"一段文本"变成"文本或工具调用"二选一，于是链路需要分支处理。

```python
from langchain_core.tools import tool

@tool
def search_inventory(sku: str) -> str:
    """按 SKU 查询库存数量"""
    return f"SKU {sku}: 库存 42 件"

chain = prompt | model.bind_tools([search_inventory]) | StrOutputParser()
```

注意 `bind_tools` 之后，模型返回的可能不是文本而是工具调用请求，所以不能直接接解析器，要先判断 `tool_calls` 是否存在（第一章的完整循环已经演示过这个分支）。工具的 docstring 就是模型看到的说明书，写清楚"什么时候该用我"比写清楚"我怎么实现"重要得多。

### 代理执行循环

代理（agent）是链式编排加上一个循环：模型不只回答，还能决定"再调一次工具"，循环直到它给出最终答案。最小实现就是一个 while 循环，每轮把历史给模型，看它是要调工具还是要收尾：

```python
async def run_agent(messages, tools, max_steps=5):
    history = list(messages)
    for step in range(max_steps):
        msg = await llm.ainvoke(history, tools=tools)   # 异步调用
        history.append(msg)
        if not msg.tool_calls:
            return msg.content                              # 模型收尾
        for call in msg.tool_calls:
            result = await tools[call.name].ainvoke(call.args)
            history.append({"role": "tool", "name": call.name,
                            "content": str(result)})
    return "达到步数上限，未收敛"       # 必须有退出条件，否则死循环
```

代理循环有三个必备的"保险"，缺一个就可能烧钱：步数上限（`max_steps`）、成本预算（每步记 token，超预算就停）、工具超时熔断（第一章那套）。生产还要处理"同一个工具被反复调用"的死循环——记录已调用过的工具签名，重复三次就中止并让模型直接总结。

!!! mascot-encourage "代理循环是最容易写错的一段"
    ![墨墨为你打气](../../img/mascot/encouraging.png){ class="mascot-admonition-img" }
    循环类代码天生难调：日志不打印就永远不知道它在哪打转。别灰心，两步就好用——每轮把"第几步、调了什么工具、花了多少 token"打进日志，跑三次就能看出规律。这是调代理的第一工具。

### 并发与限流控制

把代理放到服务端，并发就变成第一问题。第一章的信号量在这里升级为令牌桶限流：所有请求先过桶，桶里每固定时间补 N 个令牌，没令牌就排队或快速失败。批量调模型时三个参数要一起定：并发路数、每分钟请求上限、每分钟 token 上限——只限并发不够，因为一次请求的 token 量可以差一个数量级。

```python
class TokenBucket:
    def __init__(self, rate_per_sec, capacity):
        self.rate, self.cap = rate_per_sec, capacity
        self.tokens, self.last = capacity, time.monotonic()

    async def acquire(self, cost=1):
        while True:
            now = time.monotonic()
            self.tokens = min(self.cap,
                              self.tokens + (now - self.last) * self.rate)
            self.last = now
            if self.tokens >= cost:
                self.tokens -= cost
                return
            await asyncio.sleep((cost - self.tokens) / self.rate)
```

超限时的行为也要显式设计：等（用户体验好但会堆积）、快速失败（把错误暴露给调用方、配合重试）、降级（换小模型或转缓存）。别让默认行为变成"无限排队直到内存爆掉"。

## 三、可交付：评测与运维

### 成本与用量监控

没有监控的模型调用就是烧钱。监控分三层，缺一层就会漏：

- **调用层**：请求数、失败率、TTFT（首 token 延迟）、总延迟 P50/P95/P99。
- **Token 层**：输入/输出 token 数、缓存命中 token 数（长上下文场景省钱的大头）。
- **成本层**：按模型和场景归集的花费，以及"每个成功请求的平均成本"。

只有第三层的"每次成功请求成本"能真正指导优化：它能暴露"重试太多导致成本翻倍""召回太多导致输入膨胀""代理绕圈导致步数失控"。用法监控和成本监控必须能按 `session_id`、`场景标签` 切片，否则只能看到总账，看不出钱花在哪。

### 评估集初建

评估集是后面所有优化的地基，也是本书后面章节反复提到的依赖：RAG 调参、提示词迭代、模型换型全都要在评估集上量。先建一个最小可用版本，别追求完美：

1. 从真实日志抽 50~100 个有代表性的问题，人工标注"正确块在哪个文件哪一段"（不要只标"对/错"，要标到块，否则没法归因）。
2. 覆盖三类：典型问题、边界问题（信息不全、问法模糊）、**该拒答的问题**（库里没有答案，必须学会说不知道）。
3. 冻结版本，进 git。改了评估集，评测结果就不能和旧结果直接比。

评估指标先要两个就够：召回命中率（正确块是否进了候选，量重排前的天花板）和最终答案正确率（端到端效果）。第三章会把这两个指标扩成完整的评测体系。

### 模型选型对照表

选模型不要看榜单，要看"在你的任务上"的表现。四个决定性维度，按重要性排：

| 维度 | 为什么重要 | 怎么量 |
|---|---|---|
| 任务实测效果 | 榜单和你的任务分布不同 | 在评估集上跑正确率 |
| 成本 | 直接决定能否规模化 | 单任务 token 成本 × 调用量 |
| 延迟 | 交互场景卡首 token | TTFT P95 |
| 工程约束 | 决定能不能真的上 | 流式支持、函数调用、上下文长度、合规 |

常见的组合策略是"大模型做规划、小模型做执行"：需要推理和决策的环节用强模型，分类、改写、摘要这类高频低难度的用便宜的小模型。第十二章的数据湖查询和第五章的意图判定都适用这个分工。选型结论要写进文档（哪个模型、为什么、评测数据是多少），半年后你自己会感谢这条记录。

#### Diagram: 模型选型评分卡

<iframe src="../../sims/model-selection-scorecard/main.html" height="922px" width="100%" scrolling="no"></iframe>

[全屏运行模型选型评分卡](../../sims/model-selection-scorecard/main.html){ .md-button .md-button--primary }

<details markdown="1">
<summary>设计说明（规格块）</summary>

本 MicroSim 已实现，上方 iframe 为实际运行的版本。下面的折叠内容是它的设计规格，供教师复用或二次开发参考。

<details markdown="1">
<summary>展开规格原文</summary>

模型选型评分卡</summary>
Type: diagram
**sim-id:** model-selection-scorecard<br/>
**技术库：** html<br/>
**状态：** built<br/>
**Bloom 层级：** Evaluate<br/>
**Bloom 动词：** 评分
**学习目标：** 学习者将按四项维度（任务实测效果、成本、TTFT P95、工程约束）为四个候选模型加权打分，并选出总分最高者。

**前置知识：** 评估集、成本与用量监控、TTFT（均已在本块上方的“成本与用量监控”“评估集初建”“模型选型对照表”三节定义）。

**掌握判据：** 学习者为四个候选模型各填入四项维度分并提交总分；总分计算正确（各维度按权重加权求和）、且选出的最高分模型与 Content 表一致时算掌握。四个模型中至少答对最高分模型的选择；只浏览不动手不算证据。

**常见误区：** (1) 榜单排名最高的模型在自己的任务上一定最好。(2) 只看效果不看成本的选型能规模化。(3) 延迟可以等上线再优化。

**教学设计理由：** Evaluate 层级的判断需要把多维证据合成一个可辩护的结论，因此必须先锁定全部打分再揭晓，且错选时回放具体是哪个维度拉了分。

**题库内容：**

四个候选模型，权重固定为：任务实测效果 0.4、成本 0.2、延迟 0.2、工程约束 0.2。各维度 0~5 分，5 分最好：

| 候选模型 | 任务实测效果 | 成本 | 延迟 | 工程约束 | 标准总分 | 反馈原因 |
|---|---|---|---|---|---|---|
| A（旗舰大模型） | 5 | 1 | 3 | 5 | 3.8 | 效果满分且工具调用稳定，但单价最高，TTFT 偏高，不适合批量高 QPS。 |
| B（均衡中型） | 4 | 3 | 4 | 4 | 3.8 | 与 A 同为 3.8 分：效果 0.2 落后，成本与延迟各赚 0.2、0.2，正好打平。 |
| C（轻量小模型） | 2 | 5 | 5 | 3 | 3.4 | 便宜且快，但检索问答效果差 2 分，复杂指令遵循差，长任务不可靠。 |
| D（多模态中型） | 3 | 2 | 3 | 2 | 2.6 | 带图像输入但纯文本问答并无增益，工程约束最弱（不支持流式工具调用）。 |

反馈文案要点：总分为 3.8 的 A 与 B 打平不是巧合——评测集在这两个维度上的差距刚好被其他维度抵消；正确结论是"按场景分工"（复杂规划走 A，批量执行走 B），而不是勉强选一个。

**来源：** 权重、四个模型的四项分数、标准总分与反馈原因出自本块上方的“模型选型对照表”一节与“模型选型评分卡”设计；分数为教学用示意值，不代表任何厂商真实数据。

**交互规则：** 总分 = 0.4×效果 + 0.2×成本 + 0.2×延迟 + 0.2×工程约束，结果保留 1 位小数。单项得分范围 0~5 的整数。最高分并列时，全部并列模型同时标记为“推荐”，学习者需选择“按场景分工”作为结论而非强行单选。A 与 B 总分相等（均为 3.8）时，判定规则要求学习者明确说明分工结论才算掌握。

**学习者活动：**

1. 学习者看到四个候选模型和四项维度，先逐项打分并查看总分是否符合预期（探索阶段）。
2. 学习者确认全部打分后提交，模拟器标出标准总分与推荐结论。
3. 学习者应注意到 A 与 B 的 3.8 分打平，以及为什么正确结论是分工而不是单选。

**反馈文案：** 四次打分，一次提交，打分锁定后才揭晓标准总分。答对推荐结论：“正确：A 与 B 并列 3.8 分，实际按场景分工——复杂规划用 A，批量执行用 B。”答错：“再看看是哪一维拉开了差距。”随后展示标准总分与该模型的反馈原因，并要求学习者指出贡献最大的两个维度。

**初始状态：** 四个候选模型的卡片，每张四个维度打分为空，权重与总分公式可见。屏幕提问：“同样 3.8 分，A 和 B 该怎么用？先给四个模型打分，再看推荐结论。”

**章节锚点：** 正文给出的四项维度权重（效果 0.4、成本 0.2、延迟 0.2、工程约束 0.2）；“大模型做规划、小模型做执行”的组合策略；A 与 B 总分打平的分工结论。

</details>
</details>

## 四、组装成系统

### 中级RAG全流程

把前面的零件串起来，就是一个完整的中级 RAG：加载并切分文档 → 向量化入库 → 用户提问 → 混合召回 TopK → 重排 → 拼进提示词 → 模型生成 → 流式返回。LangChain 把它表达成一条显式流水线，便于在每一步之间插入自己的逻辑：

```python
async def rag_answer(question: str, session_id: str):
    history = load_history(session_id, k=5)             # 对话历史管理
    query = rewrite_query(question, history)            # 用历史把问题补全
    candidates = await store.similarity_search(query, k=30)   # 召回
    candidates = await rerank(query, candidates, top_n=5)     # 重排
    if not candidates:
        return "资料库里没有相关内容，换个问法试试。"        # 拒答也是能力
    prompt = build_prompt(question, candidates, history)      # 模板管理
    return await llm.astream(prompt)                        # 流式输出
```

这段代码里有本章十四个概念在协同工作。中间那句拒答分支是很多新手会漏的：检索不到就硬答，模型会编，这在生产里是幻觉事故的主要来源（第四章会专门治理）。第三章开始，我们会把这条流水线换成 RagFlow 这类成熟管道，本章的重点是让你看懂它的每一行在干什么。

!!! mascot-thinking "RAG 的本质是给模型开小灶"
    ![墨墨思考中](../../img/mascot/thinking.png){ class="mascot-admonition-img" }
    换个视角：RAG 不是"给模型加了个搜索引擎"，而是把模型的回答约束在你指定的一小片资料里。约束带来两个后果——好的方面是知识可更新、可溯源；坏的方面是资料没覆盖到的事它必然答错。所以知识库的覆盖率，和模型能力一样，是系统效果的上限。

### 从Demo到服务封装

这是本章的收官，也是全书的分水岭：把能跑的 Notebook 变成能扛生产的服务。四个必须完成的改造，按优先级：

1. **配置外置**：所有 key、URL、开关走环境变量，代码里零硬编码。
2. **并发封装**：接口用 `async`，配信号量与令牌桶限流；同步代码一律包进线程池。
3. **统一错误处理**：分 4xx（参数错）、5xx（服务错）、429（限流）三类返回，语义要能指导客户端重试。
4. **可观测**：每请求一个 `request_id` 贯穿日志；延迟、token、成本按请求上报。

```python
@app.post("/ask", response_model=AskResponse)
async def ask(req: AskRequest, request_id: str = Header(default_factory=lambda: uuid4().hex)):
    async with limiter.semaphore:
        try:
            answer, usage = await rag_answer(req.question, req.session_id)
        except ModelRateLimit:
            raise HTTPException(429, "model busy, retry later")
        except Exception as exc:
            log.error("ask failed", extra={"request_id": request_id})
            raise HTTPException(500, "internal error")
    log.info("ask done", extra={"request_id": request_id,
                                "tokens": usage.total, "elapsed_ms": usage.elapsed})
    return AskResponse(answer=answer, request_id=request_id)
```

这三章的内容到这里正好闭环：第一章给你工程地基（环境、异步、容器、可靠性），第二章给你系统骨架（编排、检索、工具、评测），第三章开始换上工业级的检索管道 RagFlow。

!!! mascot-celebration "骨架搭好了！"
    ![墨墨庆祝](../../img/mascot/celebration.png){ class="mascot-admonition-img" }
    你刚把"能调模型"升级成了"能建系统"：链式编排、混合召回加重排、工具绑定的代理循环、评估集和成本监控，最后封装成带限流和可观测的服务。这套骨架能直接长出后面每一章：RagFlow 知识库、GraphRAG 图谱、MCP 工具、多 Agent 协作。八条触手，一起开干！