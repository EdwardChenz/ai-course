---
title: RAG 基础：检索与知识库搭建
description: 用 RagFlow 流水线搭出企业知识库：解析清洗、智能分块、层级索引、混合检索、查询改写与引用溯源
generated_by: claude skill chapter-content-generator
date: 2026-10-06 02:00:00
version: 1.11
---

# RAG 基础：检索与知识库搭建

## Summary

本章用 RagFlow 流水线讲透知识库问答：文档解析、智能分块、混合检索、查询改写与引用溯源，建成第一个可用的企业问答应用。
学完本章，读者将掌握上述主题，并能将其用于后续章节的综合项目。

## Concepts Covered

本章覆盖学习图中的以下 15 个概念：

| Concept | Concept Impact Score |
|---------|-----------------------|
| RagFlow流水线部署 | 2 |
| 文档解析与清洗 | 2 |
| 智能分块策略 | 4 |
| 层级索引构建 | 3 |
| 混合检索架构 | 6 |
| 稠密与稀疏融合 | 5 |
| 查询改写技术 | 2 |
| 假设性文档检索 | 6 |
| 上下文压缩 | 2 |
| 引用溯源展示 | 2 |
| 增量索引更新 | 3 |
| 权限过滤检索 | 2 |
| 评测集构建方法 | 5 |
| 召回率与准确率 | 3 |
| 失败案例归因 | 5 |

## Prerequisites

本章建立在以下章节的概念之上：

- [Chapter 1: 开发基础与工程规范](../01-dev-foundations/index.md)
- [Chapter 2: 模型接入与进阶过渡](../02-model-access/index.md)

---

!!! mascot-welcome "第三章，开工！"
    ![墨墨挥手欢迎](../../img/mascot/welcome.png){ class="mascot-admonition-img" }
    前两章你学会了调模型和搭骨架，这一章把它们装进一条真正的知识流水线：文档进去，带引号的答案出来。本章的落点是一个 320 篇文档的企业制度库，检索段耗时 70 毫秒，答案句句带页码。八条触手，一起开干！

本章的示例对象从头到尾只有一个：某公司 320 篇制度与流程文档，分属 3 个租户，解析后得到 12,800 个块。所有数字——召回率、延迟、token、成本——都来自这个库，这样你换一份真实资料时，知道该按什么比例去缩放，而不是去猜。

## 一、流水线与入库

### RagFlow流水线部署

RagFlow 是一套开源的知识库流水线系统，它把"解析、分块、向量化、检索、重排、生成"做成可配置的一条链。本章用它当参照系：概念讲清楚了，你换成自研管道或任何商用产品，术语一一对得上。部署前要接受一个现实——它不是一个容器，是一组互相依赖的服务，其中 Elasticsearch 是不能砍掉的那一个（稀疏检索的倒排索引就住在里面）。

| 服务 | 作用 | 最低内存 | 能不能省 |
|---|---|---|---|
| `ragflow-server` | 解析编排、检索接口、答案生成 | 4 GB | 不能 |
| Elasticsearch 8.x | 全文倒排与向量双索引 | 8 GB | 不能，换掉就要自建稀疏检索 |
| MySQL 8.0 | 知识库元数据、会话、权限表 | 2 GB | 可换 Postgres |
| MinIO | 原始文件与解析产物 | 按数据量 | 可换对象存储 |
| Redis 7 | 任务队列与结果缓存 | 1 GB | 不能 |

五个服务加起来至少 15 GB 内存。经验做法是把宿主机内存给到 16 GB，其中 Elasticsearch 的堆固定为 4 GB，剩下的留给文件系统缓存——索引查询是 IO 密集型，OS 缓存比给它更多堆更划算。

```bash
git clone https://github.com/infiniflow/ragflow.git
cd ragflow/docker
# 首次启动要拉镜像并初始化 ES 索引，视网络情况 5~8 分钟
docker compose up -d
# 看解析队列是否真的在消费：待处理任务数应当随时间下降
curl -s http://127.0.0.1:9380/api/v1/tasks | head -c 200
```

两个配置项要先说清含义再改。`DOC_ENGINE` 是解析引擎：`deepdoc` 做版面分析，能识别标题层级、表格和图注；`naive` 只抽纯文本，快但把版面拍平。制度文档一律用 `deepdoc`。`EMBEDDING_MODEL` 指定向量化模型，本章用中文模型 `zh-embed-base`，输出 1024 维向量，用余弦相似度比较。

```yaml
services:
  ragflow:
    image: infiniflow/ragflow:v0.15.1
    depends_on: [es01, mysql, minio, redis]
    environment:
      - TZ=Asia/Shanghai
      - DOC_ENGINE=deepdoc                    # 版面解析，制度文档必选
      - EMBEDDING_MODEL=zh-embed-base         # 1024 维中文嵌入模型
    ports: ["9380:9380", "80:80"]
  es01:
    image: elasticsearch:8.11.1
    environment:
      - ELASTIC_PASSWORD=ragflow_es_pass      # 演示用，生产由环境变量注入
    ulimits:
      memlock: {soft: -1, hard: -1}
    deploy:
      resources:
        limits: {memory: 8G}
```

部署完成后第一个动作不是调检索参数，是确认解析出来的文本干净：随机抽 10 个块，看首尾各 200 字符。下一节讲怎么把脏的地方认出来。

### 文档解析与清洗

解析是把 PDF、Word、扫描件变成带结构信息的文本流；清洗是把文本流里不该进知识库的东西剔掉。RAG 效果的一半死在这一步，而且症状极具迷惑性——检索召回率死活上不去，你去调嵌入模型、调块大小、调融合权重，全都没用，因为噪声在入库那一刻就已经焊死在每个块里了。

企业文档里主要有四类噪声，认全了就能修：

| 现象 | 根因 | 修法 |
|---|---|---|
| 每块开头都是同一行"某某公司 内部资料 第 N 页" | 页眉页脚没剔除 | 统计首尾各 5 行的高频行，全文出现 5 次以上就整行删 |
| 表格变成一串乱序数字 | PDF 本身不带表格语义 | 用表格抽取接口转成 Markdown 表格再入库 |
| 出现"本 程 序 仅 供 内 部"这种字间空格 | 中文抽取时插入了空白符 | 正则匹配中文字符之间的单个空白并删除 |
| 整页全是空白 | 扫描件没有文本层 | 走 OCR 通道，或直接拒收该文档 |

页眉页脚是危害最大的一类：它出现在几乎每个块的开头，等于给全库 12,800 个块都加了一段相同的文本，向量之间的差异被稀释，检索结果开始大面积串味。本章的库在清洗前有 6% 的块含页眉页脚，清洗后噪声块占比降到 4%，CJK 字间空格残留从 2.4% 降到 0.1%。

```python
import re
import pdfplumber

CJK_GAP = re.compile(r"(?<=[\u4e00-\u9fff])\s(?=[\u4e00-\u9fff])")
PAGE_NOISE = re.compile(r"^\s*(第\s*\d+\s*页|[-—]\s*\d+\s*[-—]|.*内部资料.*)\s*$")
BREAK_END = "。！？；：.!?;:"


def is_repeated_line(line: str, freq: dict, threshold: int = 5) -> bool:
    """同一行在全文出现达到 threshold 次，判定为页眉页脚"""
    return bool(line.strip()) and freq.get(line.strip(), 0) >= threshold


def merge_broken_lines(lines: list[str]) -> list[str]:
    """PDF 抽出的行常被排版截断，行尾没有句读就把下一行接上来"""
    out: list[str] = []
    for ln in lines:
        if out and out[-1] and out[-1][-1] not in BREAK_END:
            out[-1] += ln
        else:
            out.append(ln)
    return out


def clean_page(text: str, freq: dict) -> str:
    """一页文本的清洗流水线：先收拢断行，再去页眉页脚，最后压空白"""
    lines = merge_broken_lines(text.splitlines())
    kept = [ln for ln in lines if not PAGE_NOISE.match(ln) and not is_repeated_line(ln, freq)]
    return re.sub(r"\n{2,}", "\n", "\n".join(kept)).strip()


def extract_pdf(path: str) -> str:
    """PDF 抽文本，表格单独抽出来转 Markdown，避免被拦腰切断"""
    parts, tables = [], []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            parts.append(page.extract_text() or "")
            for tb in page.extract_tables():
                tables.append("| " + " | ".join((c or "").replace("\n", " ") for c in tb[0]) + " |")
    return "\n\n".join(parts + tables)
```

清洗代码里的顺序不能换：先合并断行，才能正确统计哪些行在反复出现；先去页眉页脚，再压空白，否则页码行会躲在空行后面活下来。

!!! mascot-warning "解析不干净，后面全白干"
    ![墨墨提醒注意](../../img/mascot/warning.png){ class="mascot-admonition-img" }
    这个坑我替你踩过：召回率死活上不去，回查发现每块开头都挂着同一行页眉，向量全被这串垃圾稀释了。入库前先人工扫 10 个块的首尾 200 字符，花五分钟，省掉后面几天。

### 智能分块策略

块（chunk）是索引和检索的最小单位，一个块就是一个向量。分块的核心矛盾是：块大了，噪声多、token 贵，一次塞十条进上下文互相干扰；块小了，代词悬空、"该情形"指代不明，一句话被切成两半，谁也答不了。业界没有普适最优解，只有和文档形态匹配的策略。

| 策略 | 块大小 | 适用文档 | 代价 |
|---|---|---|---|
| 定长切分 | 600 字符，重叠 90 | 纯文本、日志流水 | 会切断句子与表格 |
| 按标题递归切分 | 600 字符，重叠 90 | 制度文档、说明书 | 标题层级缺失时退化成定长 |
| 按版面分块 | 随版面而定 | PDF 合同、扫描件 | 依赖 `deepdoc`，块大小不均匀 |
| 父子块 | 子块 600，父块 1200 | 长章节技术手册 | 索引条目增加约 35% |

本章的库固定用 600 字符、重叠 90 字符（块大小的 15%）。按第一章的换算，600 个中文字符约 400 个 token，这个数字后面算成本时要用三次。重叠的作用是防止句子正好落在切口上：重叠 90 字符意味着任何 90 字符以内的句子至少完整出现在一个块里。

还有一条必须写进代码的规则：标题路径（面包屑）要拼进每个块的正文。只写"该情形经甲方确认后可变更"谁也看不懂；写成"第三章 合同变更 > 3.2 变更流程 > 该情形经甲方确认后可变更"，块脱离原文也能独立被理解。

```python
import re

HEADING = re.compile(r"^(#{1,6})\s+(.*)$")


def split_by_heading(markdown: str, size: int = 600, overlap: int = 90) -> list[dict]:
    """按标题层级递归切分；切块时把标题路径补进块首，块才 stand alone 可懂"""
    crumbs: list[str] = []      # 当前标题栈，如 ["第三章 合同变更", "3.2 变更流程"]
    buf: list[str] = []
    out: list[dict] = []

    def flush() -> None:
        if not buf:
            return
        body, crumb = "\n".join(buf), " > ".join(crumbs)
        step = size - overlap
        for i in range(0, max(len(body) - overlap, 1), step):
            piece = body[i:i + size]
            if piece.strip():
                out.append({"text": f"{crumb}\n{piece}", "breadcrumb": crumb})

    for line in markdown.splitlines():
        m = HEADING.match(line)
        if m:
            flush()                          # 遇到新标题，先把上一节切完
            buf = []
            level = len(m.group(1))          # 用标题级别裁掉标题栈尾部
            crumbs[level - 1:] = [m.group(2).strip()]
        buf.append(line)
    flush()
    return out
```

!!! mascot-tip "墨墨的小抄"
    ![墨墨提示技巧](../../img/mascot/tip.png){ class="mascot-admonition-img" }
    新库别急着调 `chunk_size`：先固定 600 字符加重叠 90 字符跑通全链路，把评测集上的召回率记成基线，再一次只动一个参数。这个坑我替你踩过，跳步会让你分不清是块大小还是嵌入模型的锅。

## 二、索引构建与维护

### 层级索引构建

层级索引是把块组织成"文档 → 章节 → 小节 → 块"四层结构。它要解决一个具体矛盾：检索要靠小块才准（块越小，向量语义越集中），回答要靠大块才全（一段话被切成两半，谁也说不清）。所以正确的模式是**小块检索、大块喂模型**——先用子块命中定位，再回溯到父块取完整上下文。

| 层级 | 存什么 | 是否入向量库 | 在查询中的作用 |
|---|---|---|---|
| L1 文档 | 标题、租户、版本、文档指纹 | 否 | 元数据过滤与权限判定 |
| L2 章节 | 标题路径 + 前 300 字符摘要卡 | 是，320 张 | 子块命中后回溯补上文 |
| L3 小节 | 语义完整的段落边界 | 否 | 决定父块的边界 |
| L4 块 | 600 字符正文（含面包屑） | 是，12,800 条 | 真正的召回单位 |

全库因此有 12,800 + 320 = 13,120 条向量，存储比平铺方案多约 35%。这笔钱换回来的是：命中子块后能拿到 1,200 字符的父块（约 800 token），模型看到的是完整段落而不是半句话。

```python
from itertools import groupby


def build_hierarchy(chunks: list[dict], doc: dict) -> list[dict]:
    """把平铺块组织成 L2 摘要卡 + L4 块，写成可直接入库的条目"""
    entries: list[dict] = []
    for crumb, group in groupby(chunks, key=lambda c: c["breadcrumb"]):
        section = list(group)
        parent_id = f"{doc['doc_id']}::{abs(hash(crumb)) % 0xFFFFFF:06x}"
        entries.append({
            "kind": "parent",                     # 摘要卡：命中子块后回溯取上文
            "doc_id": doc["doc_id"],
            "tenant_id": doc["tenant_id"],
            "text": section[0]["text"][:300],      # 只留开头，够定位主题即可
            "child_ids": [c["chunk_id"] for c in section],
        })
        for c in section:
            entries.append({
                "kind": "child",
                "doc_id": doc["doc_id"],
                "tenant_id": doc["tenant_id"],
                "text": c["text"],                 # 已含面包屑
                "parent_id": parent_id,
                "char_span": c["char_span"],       # 字符偏移，引用溯源靠它定位
                "page": c["page"],
            })
    return entries
```

`char_span` 是这里最容易被忽略、后期最值钱的一个字段：它记录块在原文中的字符区间，等到第五节做引用溯源时，要从整页里高亮出这一段，就全靠它。

### 增量索引更新

知识库不是一次性导入的。全量重建 12,800 个块要 42 分钟，改一句报销制度就让运维等 42 分钟，这种系统上线三个月就没人愿意用了。增量更新的做法是给每篇文档算一个指纹，只对指纹变化的文档重算。

增量要覆盖三种状态，漏一个就有生产事故：新增（新文档入库）、修改（先删旧块再写新块）、删除（文档下线时必须清干净，否则"已废止的旧制度"会继续被引用，而且没人发现）。判断修改还是删除的依据是内容指纹——只对正文取哈希，格式调整、元数据变动不触发重建，省下的就是真实的 embedding 成本。

```python
import hashlib


def doc_fingerprint(doc: dict) -> str:
    """对正文取指纹；格式和元数据的变化不触发重建，避免无谓的向量化开销"""
    return hashlib.sha256(doc["text"].encode("utf-8")).hexdigest()[:16]


def sync_dataset(dataset_id: str, incoming: list[dict]) -> dict:
    """一轮同步返回四类计数，可直接进监控面板"""
    known = db.get_fingerprints(dataset_id)          # {doc_id: fingerprint}
    stats = {"added": 0, "updated": 0, "deleted": 0, "unchanged": 0}
    seen = set()
    for doc in incoming:
        seen.add(doc["doc_id"])
        old, fp = known.get(doc["doc_id"]), doc_fingerprint(doc)
        if old is None:
            vector_store.add(build_hierarchy(split_by_heading(doc["text"]), doc))
            stats["added"] += 1
        elif old != fp:
            vector_store.delete(where={"doc_id": doc["doc_id"]})   # 先清后写，别留孤儿块
            vector_store.add(build_hierarchy(split_by_heading(doc["text"]), doc))
            stats["updated"] += 1
        else:
            stats["unchanged"] += 1                    # 指纹未变，零成本
    for stale in set(known) - seen:                    # 本轮未出现的文档视为已删除
        vector_store.delete(where={"doc_id": stale})
        stats["deleted"] += 1
    return stats
```

效果账很清楚：本库一次全量重建 42 分钟，改动一篇文档（40 个块）的增量同步约 25 秒，其中向量化占 8 秒左右，其余是解析与写入。同步频率按业务定，制度类文档每天一轮足够，紧急修订走一次手动触发即可。

### 权限过滤检索

企业知识库的每个块都带租户和角色标签，检索必须在召回阶段就按权限裁剪候选池。理由不是"显示得体面"，而是合规：事后过滤时，敏感块虽然没显示，却已经进了模型的上下文，模型用它推理出了这句话——信息已经出去了，只是你没看见。

| 做法 | 参与排序的候选池 | 检索耗时 | 风险 |
|---|---|---|---|
| 事后过滤 | 全库 12,800 | 70 ms | 敏感内容进入模型上下文，等同泄漏 |
| 事前过滤 | 本租户可见的 4,300（约占 34%） | 25 ms | 过滤字段必须随块落库，配错就是越权 |
| 混合（全局粗排 100 条，再在权限内精排 20 条） | 100 + 20 | 95 ms | 参数复杂，适合跨部门协作场景 |

本章的库用事前过滤。3 个租户里，示例用户可见 4,300 个块（占全库 34%），因此他的检索只在这 4,300 个块里排序，耗时从 70 毫秒降到 25 毫秒——权限过滤顺带把延迟降了一半，这是个让人意外的收益。

```python
# 过滤字段在写入时随每条块落库，查询时作为结构化条件，绝不用字符串拼接
HITS = store.similarity_search(
    vector=embed(query),
    k=20,
    filter={
        "tenant_id": ctx.tenant_id,              # 租户隔离：服务端从会话取，绝不由前端传入
        "role_tags": {"$in": ctx.role_tags},     # 任一角色命中即可见（逻辑或）
        "status": "active",                      # 已废止制度不进候选
    },
)
```

!!! mascot-warning "事后过滤是伪安全"
    ![墨墨提醒注意](../../img/mascot/warning.png){ class="mascot-admonition-img" }
    事后过滤最骗人的地方是界面看着没问题：敏感块确实没显示，但它已经进了模型的上下文，模型还拿它推理出了这句话。正确姿势是把租户和角色条件下推到索引查询里，让引擎只在该用户可见的 4,300 个块里排序。

## 三、混合检索与融合

### 混合检索架构

混合检索是同一条查询同时走两条腿：稀疏路用倒排索引按关键词匹配打分，稠密路用嵌入向量找语义最近的块，两路候选合并后统一排序。为什么要两条腿？因为它们失效的方式正好相反，这正好是第二章留下的那个软肋——向量检索不是精确匹配，编号、日期、专有名词这类硬事实它天然弱；反过来 BM25 只数关键词，对同义改写和多跳问题一窍不通。

稀疏检索用的是 BM25 打分模型，公式是查询词在文档中的词频与稀有度的加权组合：

\[ \text{BM25}(q,d) = \sum_{t \in q} \text{idf}(t) \cdot \frac{f(t,d)\,(k_1 + 1)}{f(t,d) + k_1 \left(1 - b + b \frac{|d|}{\text{avgdl}}\right)} \]

其中 \(f(t,d)\) 是词 \(t\) 在文档 \(d\) 中的出现次数，\(|d|\) 是文档长度（用 token 数），\(\text{avgdl}\) 是全库平均长度，\(k_1 = 1.5\)、\(b = 0.75\) 是两个调参旋钮。稠密路则是把查询和块各编码成 1024 维向量，用余弦相似度排序。两种分数的量纲完全不同：BM25 常见取值 0 到 12，余弦相似度落在 0 到 1，直接相加等于让稀疏路说了算。

评估两路效果需要一个共同口径，本章用**召回率 recall@K**：在评测集上，正确块排进前 K 名的查询占全部查询的比例。

\[ \text{recall@K} = \frac{\big|\{q \in E : \text{gold}(q) \in \text{TopK}(q)\}\big|}{|E|} \]

\(E\) 是评测集，\(\text{gold}(q)\) 是人工标注的那个唯一正确块，\(\text{TopK}(q)\) 是该查询的前 K 名候选。本章的评测集规模是第五节要建的 100 道有标准答案的题，K 取 20。

!!! mascot-thinking "两条腿各会输在哪儿"
    ![墨墨思考中](../../img/mascot/thinking.png){ class="mascot-admonition-img" }
    把稠密检索想成一个读过整本书、凭语感找相似段落的人，把 BM25 想成一个只认关键词出现次数和稀有度、绝不含糊的人。单打独斗各有各的输：前者答不出"工单 SO-2024-0917 归谁处理"，后者听不懂"住店的钱能报多少"。两人都叫上，再让模型读候选集当裁判，这就是混合检索。

### 稠密与稀疏融合

融合要解决的问题是两路分数不可比。正面做法有两条：一是把余弦相似度归一化到 0 到 1 后加权相加，二是干脆放弃分数、只用名次，做倒数排名融合（Reciprocal Rank Fusion，RRF）：

\[ \text{RRF}(d) = \sum_{i} \frac{w_i}{k_{\text{r}} + r_i(d)} \]

\(r_i(d)\) 是文档 \(d\) 在第 \(i\) 路里的名次（从 1 开始），\(k_{\text{r}}\) 是平滑常数，本章取 60，\(w_i\) 是各路权重，稠密路 1.0、稀疏路 0.6。稀疏路权重压低是因为它常常返回几十条"沾边但没答到点"的候选，权重高会把噪声顶上来。

选 RRF 而不是加权分数的理由是抗漂移：某个查询下稠密分数整体抬高 0.1，归一化加权会把所有候选挤到同一个区间，名次乱掉；RRF 只看名次，抬高 0.1 完全不影响排序。本章 320 篇文档的库上，召回段的总耗时是稀疏 25 毫秒加稠密 40 毫秒加融合 5 毫秒等于 70 毫秒。

```python
def rrf_fuse(rank_lists: dict[str, list[str]], k: int = 60,
             weights: dict[str, float] | None = None) -> list[tuple[str, float]]:
    """倒数排名融合：只用名次不用分数，对两路量纲差异与分数漂移免疫"""
    weights = weights or {name: 1.0 for name in rank_lists}
    fused: dict[str, float] = {}
    for name, ids in rank_lists.items():
        for rank, chunk_id in enumerate(ids, start=1):
            fused[chunk_id] = fused.get(chunk_id, 0.0) + weights[name] / (k + rank)
    return sorted(fused.items(), key=lambda kv: -kv[1])


def hybrid_search(query: str, k: int = 20) -> list[dict]:
    dense_ids = [h["chunk_id"] for h in dense_top(query, k=k)]    # 稠密：近邻检索 40 ms
    sparse_ids = [h["chunk_id"] for h in bm25_top(query, k=k)]    # 稀疏：BM25 25 ms
    fused = rrf_fuse({"dense": dense_ids, "sparse": sparse_ids},
                     weights={"dense": 1.0, "sparse": 0.6})
    return [store.get(chunk_id) for chunk_id, _ in fused[:k]]     # 取回原文交给重排
```

三种策略在同一套 100 题评测集上跑 recall@20，结果差距很大：纯 BM25 是 0.58，纯稠密是 0.60，RRF 混合是 0.80。下面的对比图把这三条曲线按查询类型拆开，你会看到 0.20 的提升并不是均匀来的。

#### Diagram: 混合检索效果对比

<iframe src="../../sims/hybrid-retrieval-compare/main.html" height="735px" width="100%" scrolling="no"></iframe>

[全屏运行混合检索效果对比](../../sims/hybrid-retrieval-compare/main.html){ .md-button .md-button--primary }

<details markdown="1">
<summary>设计说明（规格块）</summary>

本 MicroSim 已实现，上方 iframe 为实际运行的版本。下面的折叠内容是它的设计规格，供教师复用或二次开发参考。

<details markdown="1">
<summary>展开规格原文</summary>

混合检索效果对比</summary>
Type: chart
**sim-id:** hybrid-retrieval-compare<br/>
**Library:** Chart.js<br/>
**Status:** built<br/>
**Bloom Level:** Analyze<br/>
**Bloom Verb:** compare<br/>
**Learning Objective:** 学习者将比较 BM25、纯稠密、RRF 混合三种策略在五类查询上的 recall@20，并选出"工单号归谁处理"这类编号类查询上唯一得分最高的策略，判定条件是所选策略与 Content 表的"该类最优"列一致且总均值排序正确。

**Prerequisites:** 稀疏检索（BM25）、稠密检索（余弦相似度）、RRF 倒数排名融合、recall@20（均已在本块上方的"混合检索架构""稠密与稀疏融合"两节定义）。

**Evidence of Mastery:** 学习者先在不看标准值的情况下写下三类判断：编号类查询的最优策略、同义改写类查询的最优策略、总均值最高的策略；三项全部与 Content 表一致算掌握。容差 ±0.01；只看不写不算证据。

**Misconceptions:** (1) 向量检索能覆盖编号、日期这类精确匹配。(2) 混合检索就是把两路分数直接相加。(3) 混合检索在每一类查询上都优于单路。

**Instructional Rationale:** Analyze 层级的结论必须先预测后揭晓，因此三项判断全部锁定才展示标准值；编号类那一行是本块的核心——它是唯一一条混合低于单路的数据，逼学习者放弃"融合永远更好"的想当然。

**Content:**

三种策略在 100 道有标准答案的题上的 recall@20（每类 20 题）：

| 查询类型 | 题数 | BM25 | 纯稠密 | RRF 混合 | 该类最优 |
|---|---|---|---|---|---|
| 编号精确匹配 | 20 | 0.95 | 0.40 | 0.90 | BM25 |
| 术语精确匹配 | 20 | 0.85 | 0.60 | 0.90 | RRF 混合 |
| 同义改写 | 20 | 0.45 | 0.85 | 0.90 | RRF 混合 |
| 多跳聚合 | 20 | 0.30 | 0.60 | 0.65 | RRF 混合 |
| 跨文档综合 | 20 | 0.35 | 0.55 | 0.65 | RRF 混合 |
| 总体均值 | 100 | 0.58 | 0.60 | 0.80 | RRF 混合 |

答题反馈文案：编号精确匹配上 BM25 的 0.95 高于混合的 0.90，因为倒排索引对"SO-2024-0917"这类字符串是精确命中，而向量把它编码成了语义位置、编号本身根本没进入匹配；混合的 0.90 已经保住了能力，但代价是纯稠密只有 0.40。同义改写上 BM25 只有 0.45，因为"住店的钱"和"住宿标准"没有一个词重合；RRF 混合的 0.90 与纯稠密的 0.85 差距小于编号类那行，说明这一类主要靠稠密路兜底。总体均值 0.58 / 0.60 / 0.80 的分界线在 0.20，说明混合的收益主要来自把两路各自的强项拼起来，而不是某一路被调好了。

**Provenance:** 20 道编号精确匹配题的原始命中数由"编号类查询以工单号、单号、合同号为必含实体"规则生成（合成数据，随机种子 20261006）；其余四类的命中数按"同义改写与语义类偏稠密、多跳与跨文档偏混合"的规则生成（同种子）。三路总分 0.58 / 0.60 / 0.80 出自本块上方的"稠密与稀疏融合"一节；BM25 的 k1 = 1.5、b = 0.75 与 RRF 的 k = 60 来自该节与"混合检索架构"一节。

**Rules:** recall@20 = 该类命中题数 / 20，各行取两位小数。总体均值为五类命中题数之和 / 100，五类等权。判定容差 ±0.01，"该类最优"列以标准值最大者为唯一答案，两策略差值 >= 0.05 时不算并列；差值 < 0.02 时两种选择都算对。三个挑战题按固定顺序作答，每题两次机会。

**Learner Activity:**

1. 学习者看到三类判断题与完整表格，先逐题写下自己的判断并锁定，锁定前不显示标准值。
2. 三题全部锁定后揭晓，学习者对照每一行的"该类最优"列回看自己的判断。
3. 学习者应注意到两处反直觉：编号类混合低于 BM25，以及纯稠密在总体均值上只比 BM25 高 0.02。

**Feedback:** 三道判断题，固定顺序，每题两次机会。答对："正确，该类最优是 X"，并展示该行反馈文案。答错：先展示该行三路数值，再展示反馈文案，并提示差异最大的那一列是哪种策略贡献的。答错两次第 2 题后不扣分但记为失手。揭晓后展示"答对 n/3 题"，并提示：融合不是让每类都变好，而是保住纯稠密最弱的那一类。

**Starting State:** 表格显示五类查询与三路 recall@20，三道判断题的标准值隐藏。屏幕提问："混合检索把总体均值抬了 0.20，可在编号类查询上它居然不如纯 BM25——先写下三个判断，再看标准值。"

**Chapter Anchors:** recall@20 的定义与公式；BM25 的 k1 = 1.5、b = 0.75；RRF 的 k = 60 与权重（稠密 1.0、稀疏 0.6）；BM25 / 纯稠密 / RRF 混合三路的 0.58 / 0.60 / 0.80；编号精确匹配行 BM25 0.95 高于混合 0.90；同义改写行 BM25 仅 0.45；100 题评测集、每类 20 题的口径。

</details>
</details>

## 四、查询侧改写与上下文

### 查询改写技术

用户提的是自然语言，库里存的是书面语，中间隔着一层表达差异。查询改写就是把这层差异抹平——在检索之前把问题变成更适合检索的形式。三种手段各有用途：多查询扩展把一个问题改写成两三个说法再分别检索、合并去重；指代消解靠对话历史把"它要几天批"补成"报销要几天批"；元过滤化把"上个月华南区的单子"拆成结构化过滤条件加关键词查询，后者能直接把召回池从全库缩到一个分区。

```python
async def rewrite_query(question: str, history: list[dict]) -> dict:
    """一次模型调用产出结构化改写结果，避免为三种改写各花一次往返"""
    resp = await client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0,                       # 改写要确定性，不要创造力
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content":
             "把用户问题改写成检索请求，只输出 JSON："
             '{"queries": ["两条同义检索式"], "filters": ["结构化过滤条件"], '
             '"rewritten": "补全指代后的完整问题"}'},
            {"role": "user", "content": f"历史：{summarize(history)}\n问题：{question}"},
        ],
    )
    return json.loads(resp.choices[0].message.content)
```

这笔账要算清楚：改写增加约 320 毫秒延迟和 400 个输入 token（按第一章的示意价约 0.0016 元），换来的是评测集上多命中 2 题，recall@20 从 0.80 升到 0.82。值得做，但不值得每类问题都做——所以实践里只在首轮无对话历史的冷启动查询上启用。

### 假设性文档检索

假设性文档检索（Hypo-thetical Document Embeddings，HyDE）的思路很反直觉：先让模型根据问题写一段"假设库里存在这样一篇文档"的正文，再拿这段假文档去做向量检索。原理是查询和文档必须在同一个语义空间里对齐，而用户的短口语问句离书面正文最远，假文档相当于一次免费的"语体翻译"。它只用于检索，不进最终答案上下文——否则模型会把编造的实体当成资料。

代价有两个：多一次生成调用（200 个 token、约 1.2 秒，按第一章示意价约 0.0024 元），以及假文档会编造实体。第二个代价是它的失效条件——遇到编号、型号这类需要精确匹配的查询，假文档会把编号改写或干脆丢掉，检索结果反而不如原始查询。

```python
async def hyde_search(question: str, k: int = 20) -> list[dict]:
    """假文档只用于稠密路，原问题必须保留在稀疏路，两路再融合"""
    hypo = await client.chat.completions.create(
        model="gpt-4o-mini", temperature=0.7, max_tokens=200,   # 需要一点多样性
        messages=[{"role": "user", "content":
                   f"假设知识库里有一篇能回答“{question}”的制度文档，"
                   f"写出它的一段正文，不要加标题和解释。"}],
    ).choices[0].message.content
    dense_ids = [h["chunk_id"] for h in dense_top(hypo, k=k)]   # 假文档走稠密
    sparse_ids = [h["chunk_id"] for h in bm25_top(question, k=k)] # 原问题走稀疏
    fused = rrf_fuse({"dense": dense_ids, "sparse": sparse_ids},
                     weights={"dense": 1.0, "sparse": 0.6})
    return [store.get(chunk_id) for chunk_id, _ in fused[:k]]
```

#### Diagram: 假设性文档的召回增益

<iframe src="../../sims/hyde-recall-delta/main.html" height="677px" width="100%" scrolling="no"></iframe>

[全屏运行假设性文档的召回增益](../../sims/hyde-recall-delta/main.html){ .md-button .md-button--primary }

<details markdown="1">
<summary>设计说明（规格块）</summary>

本 MicroSim 已实现，上方 iframe 为实际运行的版本。下面的折叠内容是它的设计规格，供教师复用或二次开发参考。

<details markdown="1">
<summary>展开规格原文</summary>

假设性文档的召回增益</summary>
Type: microsim
**sim-id:** hyde-recall-delta<br/>
**Library:** p5.js<br/>
**Status:** built<br/>
**Bloom Level:** Analyze<br/>
**Bloom Verb:** compare<br/>
**Learning Objective:** 学习者将比较六道查询在"仅用原查询"与"用假文档替换原查询"两种做法下的前 20 名命中数，并选出唯一出现负增益的查询；判定条件是所选序号为 5，且能说出"假文档只走稠密路、原查询保留在稀疏路做双路融合"这一修法。

**Prerequisites:** 假设性文档检索、稠密检索、BM25、RRF 倒数排名融合、recall@20（均已在本块上方的"假设性文档检索"与"混合检索架构"两节定义）。

**Evidence of Mastery:** 学习者先预测哪一条查询会变差并提交，再回答工程修法；序号判定与 Content 表一致、且修法答对，两项都满足算掌握。只回答"要双路融合"但不选序号算部分掌握。

**Misconceptions:** (1) 假文档总能提升召回。(2) 假文档可以直接替换原查询。(3) 负增益只出现在长问题上。

**Instructional Rationale:** Analyze 层级要求学习者先形成预测再接受证据，因此序号判定先锁定后揭晓；把"唯一负增益"和"工程修法"绑在一起，是为了保证结论不止于现象描述。

**Content:**

| 序号 | 查询 | 仅原查询命中数 | 假文档替换后命中数 | 增益 |
|---|---|---|---|---|
| 1 | 报销要几天批下来 | 11 | 17 | +6 |
| 2 | 出差住宿标准是多少 | 12 | 16 | +4 |
| 3 | 年假怎么算 | 9 | 14 | +5 |
| 4 | 门禁卡丢了怎么办 | 10 | 16 | +6 |
| 5 | 工单 SO-2024-0917 归谁处理 | 20 | 15 | -5 |
| 6 | 合同编号规则是什么 | 14 | 18 | +4 |

合计命中数从 76 升到 86，平均每题从 12.7 升到 14.3。答题反馈文案：五道口语化查询的增益在 +4 到 +6 之间，因为假文档把口语问句翻译成了制度正文语体，稠密路的召回明显改善；序号 5 是唯一负增益，原因是工单号必须精确匹配，假文档在生成时把编号改写成了一个不存在的单号，稠密路被带偏，而原问题的 BM25 路仍能靠精确串命中。工程修法不是关掉 HyDE，而是把两条路分工：假文档只喂稠密路，原问题只喂稀疏路，再用 RRF 融合——这样既保住口语改写的增益，又保住编号匹配的能力。

**Provenance:** 六道查询与两组命中数均为合成数据，生成规则：前五道取自"口语化提问"模板集并各配一条制度正文答案，第六道取自"含必答实体编号"的模板集；随机种子 20261006。命中数为整数，按候选集 20 条的上限截断。假文档的 200 token 与 1.2 秒生成开销出自本块上方的"假设性文档检索"一节。

**Rules:** 增益 = 假文档替换后命中数 − 仅原查询命中数，单位为题。判定"变差"的阈值是增益 <= 0；只有序号 5 满足，其他五题的增益均 >= 4。判定容差为 ±0 题（整数，精确匹配）。命中数上限 20，达到上限即记为满命中。序号判定一次作答，两次机会。

**Learner Activity:**

1. 学习者看到六道查询与两组命中数，先预测哪一条会变差并提交。
2. 揭晓后学习者计算合计与平均命中数，核对整体增益。
3. 学习者应注意到负增益只出现在含精确编号的那一条，并写出双路分工的修法。

**Feedback:** 两道题，固定顺序，每题两次机会。第一题答对："正确，序号 5 是唯一负增益"，并展示反馈文案。答错：展示该题的增益列，指出唯一为负的行，再展示反馈文案。第二题答对："正确，假文档走稠密、原查询走稀疏、RRF 融合。"答错：展示"假文档会编造编号"这一句，并要求学习者说出是哪一路被带偏。揭晓后展示"答对 n/2 题"。

**Starting State:** 六行查询与两组命中数可见，增益列为空，两道判断题待作答。屏幕提问："HyDE 在五道题上都赚了，唯独有一道倒亏——先猜是哪一道，再想怎么修。"

**Chapter Anchors:** 假文档只用于检索不进答案上下文；假文档的 200 token、约 1.2 秒、约 0.0024 元开销；命中数上限 20；合计 76 升到 86、平均 12.7 升到 14.3；序号 5 的增益为 -5；双路分工修法（假文档走稠密、原问题走稀疏、RRF 融合）。

</details>
</details>

### 上下文压缩

召回回来的块不是直接塞给模型的。从"检索到 N 条"到"送进模型 M 条"之间还有一步减法，这就是上下文压缩。做减法有三种手段：抽取式只保留命中句及其前后各一句，重排式按重排分数砍掉尾部，摘要式把同一篇文档的多条合并成一段。三种都做同一件事——砍掉不承载答案的句子，同时保留溯源锚点。

本章的口径是 Top10 进上下文、压到 1,800 个 token。原始 10 个块是 4,000 个 token（每个块 400 token），压缩率 55%，按第一章的示意价算，单次上下文成本从 0.016 元降到 0.0072 元，每次省 0.0088 元。压缩还有个看不见的收益：上下文越干净，模型的首字延迟越低，本章端到端 P95 是 1.9 秒，其中生成占 1.6 秒、检索与重排占 250 毫秒。

```python
def compress_context(hits: list[dict], budget: int = 1800) -> tuple[str, list[dict]]:
    """按 token 预算做抽取式压缩，引用锚点原样带出，不在这里做截断"""
    kept: list[dict] = []
    used, cited = 0, []
    for h in sorted(hits, key=lambda x: -x["score"]):
        body = extract_sentences(h["text"], window=1)      # 命中句前后各留一句
        cost = count_tokens(body)
        if used + cost > budget:
            break                                           # 超预算就停，宁可少也不硬塞
        kept.append({**h, "text": body})
        used += cost
        cited.append({"chunk_id": h["chunk_id"], "doc_id": h["doc_id"],
                      "page": h["page"], "char_span": h["char_span"]})
    return "\n\n".join(k["text"] for k in kept), cited
```

## 五、溯源、评测与调优

### 引用溯源展示

引用溯源是给每个答案句子挂上它依据的块编号、文档名和页码，用户点一下能跳回原文并高亮那一段。它的意义不在体验，而在于把"模型说的"变成"资料里写着"——这是企业法务和审计敢让这套系统上线的唯一前提。实现上只有两条纪律：上下文里给每段编号，模型只要复述编号就算引用；映射回原始块的编号越界或不存在，一律丢弃，绝不给前端造一个点不开的假链接。

```python
import re

CITATION_PROMPT = "每个结论句后必须标注依据编号，如 [2]；无依据的句子标 [无]。"


def build_numbered_context(blocks: list[dict]) -> str:
    """编号从 1 开始，与模型输出里的方括号一一对应"""
    return "\n\n".join(
        f"[{i + 1}] 来源：{b['doc_id']} 第 {b['page']} 页\n{b['text']}"
        for i, b in enumerate(blocks)
    )


def extract_citations(answer: str, blocks: list[dict]) -> list[dict]:
    """把答案里的 [n] 映射回块，映射不到的直接丢弃"""
    out = []
    for n in sorted(set(re.findall(r"\[(\d+)\]", answer)), key=int):
        i = int(n) - 1
        if 0 <= i < len(blocks):
            out.append({"index": n, "doc_id": blocks[i]["doc_id"],
                        "page": blocks[i]["page"],
                        "char_span": blocks[i]["char_span"]})
    return out
```

本库当前实测的引用覆盖率是 87%，即 100 道评测题里 87 道的答案至少带一条可点击引用，目标是 90% 以上。剩下的 13 道不是模型不肯标，而是候选里本来就没有正确块——引用缺失本身就是召回问题的一个信号，可以直接拿它当监控指标。

### 评测集构建方法

评测集是把"感觉变好了"变成数字的唯一手段，也是后面所有调参的尺子。第二章给的起点是从真实日志抽 50 到 100 道题，本章的企业库需要 110 道：100 道有标准答案的题（五类查询形态各 20 道），加 10 道库里根本没有答案、必须拒答的题。只有召回指标在 100 道有答案的题上算，拒答题单独算正确拒答率。

标注的纪律只有一条，但必须守住：每道题标到块，不是标对或错。标"答错"没法归因，标"第 3 页第 2 段那张住宿标准表"才能在失败时倒推出是解析错了、切分错了，还是检索没召回。

```python
def build_eval_set(logs: list[dict], out_path: str) -> None:
    """从真实日志分层抽样并冻结版本；每题必须标注到块，否则无法归因"""
    cases: list[dict] = []
    for q in sample_stratified(logs, n_per_shape=20, shapes=SHAPES):
        cases.append({
            "qid": q["request_id"],
            "question": q["question"],
            "shape": q["shape"],                       # 五类查询形态之一
            "gold": {"doc_id": q["doc_id"], "page": q["page"],
                     "char_span": [q["start"], q["end"]]},   # 标注到块，不是标对错
            "expect_abstain": False,
        })
    cases.extend(build_reject_cases(logs, n=10))         # 库里无答案，必须拒答
    freeze(cases, out_path)                             # 冻结进版本库，改集必须重跑基线
```

评测集一旦冻结就不能随手加题——加了题，所有历史分数就不可比了，必须连同基线一起重跑。这一点比评测集的规模更重要：规模可以慢慢长，可比性一丢，评测就退化成感觉。

!!! mascot-encourage "标注确实枯燥"
    ![墨墨为你打气](../../img/mascot/encouraging.png){ class="mascot-admonition-img" }
    手工标 110 道题枯燥是真的枯燥，但它一次投入、长期复用，后面每一次调参都靠它当尺子。先硬着头皮标完 20 道跑通流程，剩下 90 道会快得多。慢慢来，比较快。

### 召回率与准确率

召回率和准确率必须分开看，否则调参会失去方向。召回率问的是"该找到的找到了吗"，准确率问的是"找到的里面有多少是对的"，而业务真正在意的是端到端答对率。三个指标在本库的现状：

| 指标 | 口径 | 现状 | 目标 |
|---|---|---|---|
| 召回率 recall@20 | 正确块进前 20 名的比例 | 0.80（80/100） | ≥ 0.90 |
| 准确率（送模型 5 条命中率） | 正确块排进重排后 Top5 的比例 | 0.54（54/100） | ≥ 0.70 |
| 端到端答对率 | 答案被人工判定为正确 | 0.48（48/100） | ≥ 0.65 |
| 正确拒答率 | 10 道无答案题中正确拒答 | 0.70（7/10） | ≥ 0.90 |

三个数字之间的关系比数字本身更值得记：recall@20 是 0.80，准确率只有 0.54，缺口 0.26 意味着 26 道题的正确块落在第 6 到第 20 名之间——它们进了候选，但重排阶段把它们判死了。所以这类系统的主要战场是召回和重排，不是生成模型；把 3B 的生成模型换成 70B，答对率可能只涨 0.02，而把重排模型换对，能涨 0.1 以上。

调参的顺序也有讲究：先看缺口在哪儿，再动旋钮。100 道题的正确块名次分布是：第 1 名 35 道，第 2 到 5 名 19 道，第 6 到 10 名 13 道，第 11 到 20 名 13 道，第 21 到 30 名 8 道，第 31 到 50 名 5 道，第 50 名以后 7 道。尾部 20 道是召回缺口的前沿，能救回来多少取决于你的文档里到底有没有答案；中间 26 道是重排的地盘。下面的调参模拟器把这条曲线变成可以拖的。

#### Diagram: 召回条数与上下文预算的权衡

<iframe src="../../sims/recall-topk-tradeoff/main.html" height="622px" width="100%" scrolling="no"></iframe>

[全屏运行召回条数与上下文预算的权衡](../../sims/recall-topk-tradeoff/main.html){ .md-button .md-button--primary }

<details markdown="1">
<summary>设计说明（规格块）</summary>

本 MicroSim 已实现，上方 iframe 为实际运行的版本。下面的折叠内容是它的设计规格，供教师复用或二次开发参考。

<details markdown="1">
<summary>展开规格原文</summary>

召回条数与上下文预算的权衡</summary>
Type: microsim
**sim-id:** recall-topk-tradeoff<br/>
**Library:** p5.js<br/>
**Status:** built<br/>
**Bloom Level:** Evaluate<br/>
**Bloom Verb:** 权衡<br/>
**Learning Objective:** 学习者将根据正确块名次分布计算 recall@K，并在"送模型条数 M 的命中率不低于 0.67"的前提下选出成本最小的 M；判定条件是 M 取 10 且单次上下文成本 0.0160 元，误差不超过 ±0.0001 元。

**Prerequisites:** 召回率 recall@K、重排后送模型条数 M、块大小 400 token、输入价格 0.004 元每千 token（均已在本块上方的"智能分块策略""召回率与准确率"与第一章"Token与上下文窗口"定义）。

**Evidence of Mastery:** 学习者先调节 K 与 M 观察曲线形状，再手写三道挑战题的答案；三题全部命中标准值（recall@20 = 0.80、首次达到 0.90 的 K = 50、最小 M = 10 且成本 0.0160 元）算掌握。拖动滑块探索不计入掌握。

**Misconceptions:** (1) K 越大越好，越大召回越高就该一直加大。(2) 召回率到 0.93 就算够用。(3) 送模型的条数只影响质量，不影响成本。

**Instructional Rationale:** Evaluate 层级的判断要求把召回质量与成本放到同一把尺子上权衡，因此三道题都必须先手写数字再揭晓；第 2 题的网格里 K = 30 只有 0.88，差一点到 0.90，逼学习者按数据而不是按直觉选档。

**Content:**

学习者可调节两个量：

| 量 | 最小 | 最大 | 步长 | 默认 | 单位 |
|---|---|---|---|---|---|
| 召回条数 K | 5 | 100 | 5 | 20 | 条 |
| 送模型条数 M | 1 | 20 | 1 | 5 | 条 |

正确块名次分布（100 道题，合成数据，随机种子 20261006；生成规则：按查询形态分配名次区间后随机抖动）：

| 名次区间 | 1 | 2 到 5 | 6 到 10 | 11 到 20 | 21 到 30 | 31 到 50 | 50 名以后 |
|---|---|---|---|---|---|---|---|
| 题数 | 35 | 19 | 13 | 13 | 8 | 5 | 7 |

模拟器按上表实时计算 recall@K 与命中率 recall@M，并显示单次上下文成本 = M × 400 / 1000 × 0.004 元，以及相对 K = 20 基线节省或增加的成本。

挑战题（固定顺序）：

| 序号 | 题干 | 标准值 | 答错时的提示 |
|---|---|---|---|
| 1 | K 取 20 时 recall@20 是多少 | 0.80 | 名次 1 到 20 共 35 + 19 + 13 + 13 = 80 道，80 / 100 = 0.80。 |
| 2 | 在 K 取 5、10、20、30、50、100 中，recall@K 首次达到 0.90 的 K 是多少 | 50 | K = 30 时为 88 / 100 = 0.88，未达标；K = 50 时为 93 / 100 = 0.93，首次达标。 |
| 3 | 要求命中率不低于 0.67 时，最小的 M 是多少，单次上下文成本多少元 | 10，0.0160 元 | M = 10 时命中率为 67 / 100 = 0.67，成本 = 10 × 400 / 1000 × 0.004 = 0.0160 元；M = 20 命中率升到 0.80 但成本翻倍到 0.0320 元。 |

**Provenance:** 名次分布表为合成数据（生成规则见上，随机种子 20261006），总题数 100 与"召回率与准确率"一节的 0.80（80/100）口径一致。块 400 token 来自"智能分块策略"一节；输入价格 0.004 元每千 token 来自第一章"Token与上下文窗口"，为教学用示意价。

**Rules:** recall@K = 名次不超过 K 的题数 / 100，按名次分布表精确累加，结果保留两位小数。上下文成本 = M × 400 / 1000 × 0.004 元，保留四位小数，判定容差 ±0.0001 元。达标判定用 >=：第 2 题以 0.90 为达标线，第 3 题以 0.67 为达标线。多解规则：若多个 M 同时达标，取最小 M；M 与 K 均在步长网格上，K = 5 的倍数、M 的整数步长；K = 100 时 recall@100 = 1.00 为上限；M 大于 20 的取值不参与成本计算。

**Learner Activity:**

1. 学习者拖动 K，从 5 到 100 观察 recall@K 曲线的形状，应注意到 20 之后曲线明显变平。
2. 学习者拖动 M，观察命中率与成本同时上升的读数变化，应注意到成本随 M 线性增长而命中率先快后慢。
3. 学习者依次完成三道挑战题，手写答案后提交，最后一道题结束后展示全部演算过程。

**Feedback:** 三道挑战题，固定顺序，每题两次机会，答案在提交后立即揭晓。答对："正确，<标准值>"。答错：展示该题的"答错时的提示"，并把名次分布表的相关区间高亮。两次答错记为失手。顶部累计"累计答对 n/3 题"，最后一题结束后展示完整推导。计分：满分 3 分，达到 2 分视为掌握。

**Starting State:** 滑块位于默认值（K = 20，M = 5），曲线与成本读数可见，三道挑战题折叠在下方。屏幕提问："召回率已经 0.80 了，再加大 K 到底值不值？先看曲线，再算这笔账。"

**Chapter Anchors:** recall@K 的定义；正确块名次分布（1 名 35 道、2 到 5 名 19 道、6 到 10 名 13 道、11 到 20 名 13 道、21 到 30 名 8 道、31 到 50 名 5 道、50 名以后 7 道）；recall@20 = 0.80；recall@30 = 0.88；recall@50 = 0.93；准确率 0.54 与 recall@20 之间 0.26 的缺口对应 26 道题；块 400 token；输入 0.004 元每千 token；上下文成本公式。

</details>
</details>

### 失败案例归因

"答案不对"不是结论，是起点。失败案例归因要做的是把每一道答错的题沿流水线回放一遍，记下第一个出错的环节，然后按类别聚合、按占比排序去修。这个顺序不能反：先归因、再修，是因为同一个症状在不同环节上的修法完全相反——检索没召回到，去调提示词是白费力气；召回到了却答错，那才轮到提示词和生成模型背锅。

本章 48 道答错的题归因结果如下：

| 类别 | 占比 | 典型症状 | 首要修法 |
|---|---|---|---|
| 召回 | 34% | 正确块根本没进 Top20 | 按查询形态分诊，编号类先查 BM25 路是否生效 |
| 解析与清洗 | 22% | 答案里出现页眉、乱码、表格错位 | 回去修解析规则，见第一节 |
| 分块 | 18% | 正确答案被切成两块，只召回了半截 | 加大重叠或按标题重切 |
| 生成 | 14% | 资料里有答案，模型说没有 | 收紧提示词，调拒答阈值 |
| 改写 | 12% | 改写把问题问偏了，代词指错对象 | 保留原查询做双路，改写权重降级 |

召回占比最高不代表它最重要——解析类失败的修复成本最低（改几行规则，当天上线），召回类要动索引结构。所以实践中的排序是"先做便宜的归因，再做贵的"：一轮归因做完，通常三成的失败案例能被同一处修复吃掉。

```python
from collections import Counter

STAGES = ["parse", "chunk", "retrieve", "rewrite", "generate"]


def attribute(failures: list[dict]) -> Counter:
    """沿流水线回放每道失败题，只记第一个出错的环节——后面的多半是连锁反应"""
    counter: Counter = Counter()
    for case in failures:
        trace = replay(case["qid"])              # 用冻结的检索参数回放，保证可复现
        stage = next((s for s in STAGES if not passed(trace, s)), "generate")
        counter[stage] += 1
    return counter
```

!!! mascot-thinking "找第一个错的，不是最后一个可疑的"
    ![墨墨思考中](../../img/mascot/thinking.png){ class="mascot-admonition-img" }
    归因的核心是找第一个出错的地方。检索没召回到，问题就在召回层，跟提示词和生成模型无关；召回到了却答错，才轮到提示词背锅。顺序搞反，你会花两天去调一个根本不会被调用的参数。

把这五个环节的数字串起来，这条流水线的形状就清楚了：召回率 0.80 是天花板，准确率 0.54 是当前的实际利用率，端到端答对率 0.48 是用户真正感受到的东西。三个数之间的每一段差距都对应一个可动的地方——这就是后面所有调参工作的地图。

!!! mascot-celebration "第一条流水线下线了"
    ![墨墨庆祝](../../img/mascot/celebration.png){ class="mascot-admonition-img" }
    你刚把两章的零件装成一条能交付的流水线：解析清洗、智能分块、四层索引、混合检索、查询改写、上下文压缩，答案还带可点击的引用。下一章我们把这套东西推上生产的评测与运营。八条触手，一起开干！

## 本章小结

- 检索管道是五个服务的组合，Elasticsearch 不能砍：它同时提供稀疏倒排和向量索引，少了它整套召回就塌了。
- 效果的一半死在解析与清洗，页眉页脚出现在每个块开头会让全库向量失真，入库前先人工扫 10 个块。
- 块参数起点是 600 字符加重叠 90 字符（约 400 token），标题路径必须拼进块正文，块才 stand alone 可懂。
- 层级索引按"小块检索、大块喂模型"工作，父块摘要卡入索引、`char_span` 留在块上，后者是引用溯源的地基。
- 增量更新必须覆盖新增、修改、删除三种状态，指纹只对正文取哈希；改一篇文档 25 秒，全量 42 分钟是唯一不可接受的日常操作。
- 权限过滤要做在召回之前，本库的示例用户可见 4,300 个块，顺带把检索耗时从 70 毫秒降到 25 毫秒。
- 混合检索靠 RRF 融合（\(k_{\text{r}} = 60\)，权重稠密 1.0、稀疏 0.6），因为它只用名次不用分数；总体 recall@20 从 0.58 / 0.60 提到 0.80。
- 查询侧两件武器分工明确：查询改写治同义与指代，假设性文档治口语语体，但假文档必须只走稠密路，原问题留在稀疏路兜底编号匹配。
- 上下文压缩把 Top10 的 4,000 token 压到 1,800 token，单次成本从 0.016 元降到 0.0072 元。
- 三个指标要分清：召回率 0.80、准确率 0.54、端到端答对率 0.48，中间 26 道题卡在重排，20 道题卡在召回。
- 评测集 110 道必须冻结，标注到块而不是标对错；失败归因按"第一个出错的环节"聚合，先修便宜的归因类别。