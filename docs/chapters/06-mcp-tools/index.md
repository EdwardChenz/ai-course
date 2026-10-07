---
title: MCP 工具交付
description: 用 FastMCP 把内部 API、数据库与文件系统封装成 Agent 可调用的标准工具服务，覆盖 Schema、鉴权、版本、错误码、熔断与治理
generated_by: claude skill chapter-content-generator
date: 2026-10-06 03:00:00
version: 1.0
---

# MCP 工具交付

## 本章概要

本章讲透 MCP 纵向工具观：用 FastMCP 把内部 API 封装为 Agent 可调用的工具，并覆盖鉴权、版本、熔断与工具治理。
学完本章，读者将掌握上述主题，并能将其用于后续章节的综合项目。

## 本章覆盖概念

本章覆盖学习图中的以下 22 个概念：

| 概念 | 重要度（CIS） |
|---------|-----------------------|
| MCP协议总览 | 14 |
| MCP纵向工具观 | 5 |
| FastMCP服务搭建 | 9 |
| 工具Schema设计 | 6 |
| 资源与提示模板 | 8 |
| 工具鉴权机制 | 6 |
| 工具版本管理 | 7 |
| 错误码规范 | 14 |
| 工具可观测埋点 | 8 |
| 内部API转MCP | 11 |
| 数据库查询工具 | 6 |
| 文件操作工具 | 5 |
| 搜索工具封装 | 7 |
| 代码执行工具 | 6 |
| 工具沙箱隔离 | 11 |
| 工具超时熔断 | 10 |
| 工具评测方法 | 5 |
| 工具市场选型 | 9 |
| MCP与函数调用对比 | 6 |
| MCP客户端集成 | 8 |
| 工具链编排模式 | 10 |
| 工具治理清单 | 14 |

## 前置知识

本章建立在以下章节的概念之上：

- [Chapter 1: 开发基础与工程规范](../01-dev-foundations/index.md)
- [Chapter 2: 模型接入与进阶过渡](../02-model-access/index.md)
- [Chapter 3: RAG 基础：检索与知识库搭建](../03-rag-basics/index.md)

---

!!! mascot-welcome "第六章，工具交付"
    ![墨墨挥手欢迎](../../img/mascot/welcome.png){ class="mascot-admonition-img" }
    前五章你把模型、检索和图谱都装好了，这一章解决工具怎么被别人复用：把内部 API 封装成 Agent 能调用的标准服务。落点是 12 个工具组成的一套履约服务，网关额外开销只有 12 毫秒。八条触手，一起开干！

本章的示例对象从头到尾只有一个：某公司的订单履约工具集，一套名叫 `order-mcp` 的 MCP 服务，监听 8931 端口，导出 8 个工具、3 个资源、1 个提示模板，服务 3 个租户。所有数字——延迟、成功率、错误码、退避时长、评测选对率——都来自它，这样你换成自己的系统时，知道该按什么比例缩放，而不是去猜。

前五章的隐含前提是"工具和 Agent 在同一个进程里"。第一章的 function calling 里，`search_inventory` 就是一个同进程函数；第二章的 `.bind_tools()` 把它挂到链上。但真实系统里工具住在另一个服务里、另一个团队维护、还有自己的鉴权和限流。MCP（Model Context Protocol，模型上下文协议）解决的就是这个断层：它规定了一套 JSON-RPC 2.0 报文格式，让"Agent 说要调什么"和"工具在哪里、怎么调、要什么参数"这两件事不再由某一份代码硬编码。

## 一、协议与位置

### MCP协议总览

MCP 规定了客户端与服务端之间三类交互的报文格式，传输层是 JSON-RPC 2.0 over HTTP（规范里也叫 Streamable HTTP）。要先理解两件事：报文长什么样，以及一次会话里双方按什么顺序说话。

一次典型会话只有四步。第一步客户端发 `initialize`，带上自己的协议版本与能力声明；第二步服务端回一份协议版本和自身能力清单；第三步客户端发 `notifications/initialized` 表示握手完成；此后进入日常循环，客户端可以调 `tools/list` 拿工具清单、调 `tools/call` 执行工具，第四步之外双方都还能发 `notifications/*` 做取消与进度通知。整个过程没有长连接依赖，HTTP 是无状态的，重试逻辑因此必须由客户端负责。

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "query_order",
    "arguments": {
      "order_id": "SO-2026-0417",
      "include_logistics": true
    }
  }
}
```

这段报文里最关键的是 `params.arguments`：它必须是一个对象，且每个字段都要在服务端声明的 JSON Schema 里有定义。服务端校验不过就返回错误，**不做静默截断**。本章 8 个工具全部走这条路径，`order-mcp` 的网关 P50 延迟是 180 毫秒，其中协议解析与鉴权合计 12 毫秒，占比不到 7%——协议本身不是性能瓶颈，别在这里做优化。

MCP 定义了三组方法名，分别对应三种能力：工具用 `tools/*`，资源用 `resources/*`，提示模板用 `prompts/*`。这三个名字不是术语游戏，它们决定了客户端能不能自动发现能力，也决定了服务端的方法论——写工具时按"有没有副作用"归类，写资源时按"能不能只读"归类。归错类的后果不是报错，而是模型的调用轨迹变得无法复现。

| 原语 | 语义 | 谁调用 | 有副作用 | 本章数量 |
|---|---|---|---|---|
| 工具 Tool | 可调用的函数，模型决定何时调 | 模型经客户端 | 写操作有 | 8 |
| 资源 Resource | 可读取的只读数据，按 URI 寻址 | 客户端显式读取 | 无 | 3 |
| 提示模板 Prompt | 可复用的参数化提示词 | 客户端显式取用 | 无 | 1 |

三原语本章共导出 12 项，与开篇的落点一致。下一节先把 MCP 在整张技术地图里的位置说清楚，不然很容易把它当成"更长的 function calling"。

### MCP纵向工具观

纵向工具观指的是 MCP 处理的那条轴：**Agent → 工具**。模型是上层的消费者，工具是下层的能力提供者，MCP 卡在中间把两边的契约固定下来。这条轴上有三方：模型只看得懂工具的名字、描述和参数 Schema；客户端负责发现能力并转发调用；服务端真正执行。

"纵向"这个词要跟另一个方向对照才成立。第八章的 A2A 处理的是**Agent ↔ Agent**，那是横向的：两个各自带工具的 Agent 互相发现、互相委派任务。两者的区别在信任模型——纵向轴上，工具是被授权的下属，Agent 说什么它就照做范围内的部分；横向轴上，每个 Agent 都是自主主体，需要互相协商。本章只做纵向，横向留到第八章。

纵向观带来三个直接后果，值得逐条记住：

1. **工具与消费者解耦**。同一个 `order-mcp` 可以被 Claude 桌面端、某个自研 Agent、还有一个 CI 脚本同时用，只要三者都懂 MCP。写一次工具，所有客户端共享，这就是标准协议的全部意义。
2. **能力边界由服务端声明**。工具清单在 `tools/list` 里返回，服务端说没有的，客户端就调不到。这是安全边界的物理来源——不是靠提示词说"不许用这个"。
3. **失败要能被客户端理解**。协议保留了五个错误码（下一节详述），其余错误码段位留给工具自定义。这个约定让跨进程的失败处理有了共同语言，也是第十一章做全链路追踪的前提。

反过来说，MCP 不解决的问题也很明确：它不管工具内部写得对不对、不管上游数据库快不快、不管 Agent 的规划是否合理。它是一份接线规范，不是工具的质量保证——质量得靠第五节的评测集和第六节的治理清单去保证。

## 二、服务端交付

### FastMCP服务搭建

FastMCP 是 MCP 的 Python 服务端框架，把"函数变工具"这件事缩到装饰器一行。本章的 `order-mcp` 最小可运行版本只有 32 行核心代码，能在 1.5 秒内启动并对外提供 `tools/list`。

```bash
pip install fastmcp uvicorn
# 安装后先看版本：FastMCP 与 Python SDK 大版本必须对齐，跨大版本混用会在握手阶段报 -32603
python -c "import fastmcp; print(fastmcp.__version__)"
```

```python
from fastmcp import FastMCP

mcp = FastMCP("order-mcp", host="0.0.0.0", port=8931)


@mcp.tool()
async def query_order(order_id: str, include_logistics: bool = False) -> dict:
    """按订单号查询订单状态、金额与支付方式。

    仅用于订单状态与金额查询；查商品请用 search_products，查发票请用 list_invoices。
    order_id 必须形如 SO-2026-0417，非法格式会返回 -32001。
    """
    if not order_id.startswith("SO-"):
        raise ToolError(-32001, "order_id 必须以 SO- 开头")
    return await order_service.fetch(order_id, with_logistics=include_logistics)


@mcp.tool()
async def create_refund(order_id: str, amount: float, reason: str) -> dict:
    """对指定订单发起退款，写操作，会产生真实的资金流水。

    仅在用户明确要求退款时调用；查询退款进度请用 query_order(include_logistics=True)。
    amount 单位为元，且不得超过该订单实付金额。
    """
    return await refund_service.create(order_id=order_id, amount=amount, reason=reason)


if __name__ == "__main__":
    mcp.run(transport="http")     # 生产走 HTTP，本地调试可换成 stdio
```

装饰器 `@mcp.tool()` 做了三件事：从函数签名生成 JSON Schema、从 docstring 生成 `description`、把返回值序列化成 MCP 的内容结构。**签名就是 Schema**，这意味着类型注解写错，模型看到的 Schema 就是错的——`amount: float` 写成 `amount: str`，模型就会传字符串，而服务端会静默接受并当成 0.0。这是最容易踩的一类 bug，所以类型注解必须和运行时校验一起写。

客户端侧的调用代码与第一章的 function calling 循环几乎同构，只是工具来源从本地列表变成了远端服务：

```python
import asyncio
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client


async def main() -> None:
    async with streamablehttp_client("http://127.0.0.1:8931/mcp") as (r, w, _):
        async with ClientSession(r, w) as session:
            await session.initialize()
            catalog = await session.list_tools()
            for t in catalog.tools:
                print(t.name, "->", len(t.inputSchema.get("properties", {})), "个参数")

            # 实际调用：失败时抛 ToolError，错误码已在服务端定义好
            result = await session.call_tool(
                "query_order",
                arguments={"order_id": "SO-2026-0417", "include_logistics": True},
            )
            print(result.content[0].text)


asyncio.run(main())
```

三行结构值得记住：`initialize` 建立协议版本、`list_tools` 拿能力清单、`call_tool` 执行。第七章的多 Agent 编排里，每个 Agent 的工具面就是通过第三行的等价调用动态拼出来的。

### 工具Schema设计

Schema 是模型判断"该不该调、调成什么样"的唯一依据。参数类型错了会报错，描述糊了会静默地选错工具——后者更贵，因为它不产生日志里的异常，只产生一个语义上错误的结果。所以 `description` 必须当成**写给模型的说明书**来写，而不是当成给人看的代码注释。

一条合格的工具描述要回答四件事。写之前先想清楚这四个问题，答案直接落进 description：

1. **它做什么**（动词开头，一句话）。
2. **什么时候该用它**（正面场景）。
3. **什么时候不该用它**（指向兄弟工具，这是最容易被省略也最值钱的一条）。
4. **参数的单位、格式与边界**（`amount` 是元不是分，`order_id` 形如 `SO-2026-0417`）。

判断一条描述够不够用，用这条标准：把它单独发给一个没读过代码的人，问他"用户说'帮我查下我那单到哪了'，你会选这个工具还是别的"。答错就是描述不合格。本章 120 道评测题就是这个测试的自动化版本。

```json
{
  "name": "query_order",
  "description": "按订单号查询订单状态、实付金额与支付方式。返回字段：status 取值 paid/shipped/completed/cancelled，amount 为实付金额（单位元，保留两位小数）。仅用于订单本身；查商品库存用 update_inventory，查发票用 list_invoices。order_id 形如 SO-2026-0417，格式非法返回 -32001。不支持按时间或手机号反查，遇到这类请求返回 -32003。",
  "inputSchema": {
    "type": "object",
    "properties": {
      "order_id": {
        "type": "string",
        "pattern": "^SO-\\d{4}-\\d{4}$",
        "description": "订单号，形如 SO-2026-0417，全局唯一"
      },
      "include_logistics": {
        "type": "boolean",
        "default": false,
        "description": "是否附带物流轨迹；轨迹来自承运商接口，会额外增加约 300 毫秒延迟"
      }
    },
    "required": ["order_id"],
    "additionalProperties": false
  }
}
```

三个细节值得单独指出来。`pattern` 用正则把格式约束交给服务端校验，比在 description 里写"请传形如……"可靠得多——前者模型填错会立刻收到 `-32001`，后者模型可能当耳旁风。`default` 让可选参数在 Schema 里自解释，模型不必猜 false 是什么含义。`additionalProperties: false` 防止模型幻觉出 `orderId`、`order_id` 这类大小写变体，多余字段直接报错而不是被悄悄忽略。

三条反模式要避免：在 description 里写实现细节（"调用 order-core 的 v2 接口"）会挤占模型的注意力预算；把所有兄弟工具都列进 description 会让相似工具互相干扰；参数超过 6 个时考虑拆成两个工具，因为模型填错参的出错率随参数个数明显上升。

!!! mascot-tip "墨墨的小抄"
    ![墨墨提示技巧](../../img/mascot/tip.png){ class="mascot-admonition-img" }
    description 不是给人看的注释，是模型唯一能读到的说明书。只写"查询订单"模型无从判断该不该用，补上"仅用于订单状态查询，查商品请用 search_products"才会稳。这个坑我替你踩过。

好的描述可以被打分，四项各占一个权重：时机（是否写清何时该用）、边界（是否写清何时不该用并指向兄弟工具）、参数（是否给出单位、格式与范围）、长度（是否落在可用区间）。长度项不是"越长越好"，落在可用区间记满分，明显偏短记半分，超过上限记零。

\[ Q = 0.30 \cdot w_{\text{时机}} + 0.30 \cdot w_{\text{边界}} + 0.25 \cdot w_{\text{参数}} + 0.15 \cdot w_{\text{长度}} \]

可用区间的口径是 80 到 200 字：低于 80 字说明信息不足，高于 200 字说明模型要在一堆废话里找信号。下面的模拟器把同一工具的六个描述版本摆在一起，你会看到一个关键现象——质量分最高的版本不一定是选对率最高的版本。

#### Diagram: 工具描述质量与选对率

<iframe src="../../sims/tool-description-quality/main.html" height="717px" width="100%" scrolling="no"></iframe>

[全屏运行工具描述质量与选对率](../../sims/tool-description-quality/main.html){ .md-button .md-button--primary }

<details markdown="1">
<summary>设计说明（规格块）</summary>

本 MicroSim 已实现，上方 iframe 为实际运行的版本。下面的折叠内容是它的设计规格，供教师复用或二次开发参考。

<details markdown="1">
<summary>展开规格原文</summary>

工具描述质量与选对率</summary>
Type: microsim
**sim-id:** tool-description-quality<br/>
**技术库：** p5.js<br/>
**状态：** built<br/>
**Bloom 层级：** Analyze<br/>
**Bloom 动词：** 分析
**学习目标：** 学习者将按四项权重为同一工具的六个描述版本打分，算出质量分并与 120 道评测题的选对率对照，判定条件是三道判断题的标准值全部答对（最高选对率版本为 E、质量分高于 D 但选对率低于 D 的版本为 F、选对率低于 0.85 的版本共 4 个），且能算出 F 的质量分 0.85。

**前置知识：** 工具 Schema 设计、description 四项标准（做什么、何时用、何时不用、参数单位与边界）、JSON Schema 的 pattern 与 additionalProperties（均已在本块上方的"工具Schema设计"一节定义）。

**掌握判据：** 学习者先为六个版本逐项勾选四项标准并提交质量分，再回答三道判断题。三题全部命中标准值、且手算出的 E 与 F 的质量分与 Content 表一致（1.00 与 0.85）算掌握。只看不勾不写不算证据。

**常见误区：** (1) description 写得越长质量分越高、效果越好。(2) 四项标准全部齐全就一定能拿满分。(3) 质量分高的描述，选对率一定也高。

**教学设计理由：** Analyze 层级要求学习者先形成"分数能否预测效果"的判断再接受证据，因此质量分与选对率必须先分开算再对照；版本 F 是本块的核心——它四项齐全却把长度项归零，quality 分 0.85 高于 D 的 0.75 而选对率 0.83 低于 D 的 0.85，逼学习者承认打分规则和实际效果之间存在缺口。

**题库内容：**

同一个工具 `query_order` 的六个描述版本，均已接入 120 道评测题（正例、负例、干扰各 40 道）实测选对率：

| 版本 | 描述字数 | 含使用时机 | 含反例与边界 | 参数带单位格式 | 质量分 | 选对率 |
|---|---|---|---|---|---|---|
| A | 4 | 否 | 否 | 否 | 0.08 | 0.55 |
| B | 38 | 否 | 否 | 否 | 0.08 | 0.68 |
| C | 96 | 是 | 否 | 否 | 0.45 | 0.79 |
| D | 142 | 是 | 是 | 否 | 0.75 | 0.85 |
| E | 178 | 是 | 是 | 是 | 1.00 | 0.91 |
| F | 412 | 是 | 是 | 是 | 0.85 | 0.83 |

质量分算法：时机命中记 \(w_{\text{时机}} = 1\)、边界命中记 \(w_{\text{边界}} = 1\)、参数带单位格式记 \(w_{\text{参数}} = 1\)；长度项按字数为 80 到 200 记 \(w_{\text{长度}} = 1\)，低于 80 记 0.5，超过 200 记 0。A 与 B 的质量分都是 0.075，四舍五入为 0.08，C 为 0.45，D 为 0.75，E 为 1.00，F 为 0.85。

答题反馈文案：A 的 4 个字只说了动作，模型无从判断该不该用，选对率 0.55 意味着 40 道负例里错 23 道；B 补了完整句子但仍无时机与边界，涨到 0.68，涨的是正例而不是负例；C 加了时机涨到 0.79，说明"什么时候该用"的边际收益最大；D 再加反例与边界涨到 0.85，负例准确率同步改善；E 补齐参数单位格式后到 0.91，是本章实际采用的版本；F 四项齐全但 412 字超过 200 字上限，长度项归零，质量分掉到 0.85，选对率从 E 的 0.91 回落到 0.83——多出来的 234 个字里塞的是"调用 order-core v2 接口、字段顺序、示例报文"这类实现细节，模型要在一堆无关文本里找那一句何时该用。

**来源：** 六个版本对应的字数 4 / 38 / 96 / 142 / 178 / 412 与四项勾选状态为合成数据（生成规则：按"缺一项 / 缺两项 / 补时机 / 补边界 / 补参数 / 全部补齐后追加实现细节"的递进模板生成，随机种子 20261006）。选对率 0.55 / 0.68 / 0.79 / 0.85 / 0.91 / 0.83 为按"每补齐一项标准，正例命中与负例准确率各升约 0.07 到 0.11；字数超过 200 后两项同时回落约 0.08"的规则生成（同种子）。120 道评测题的规模与三类构成出自本块上方的"工具评测方法"一节；四项权重与长度区间口径出自"工具Schema设计"一节的描述标准。

**交互规则：** 质量分 \(Q = 0.30 \cdot w_{\text{时机}} + 0.30 \cdot w_{\text{边界}} + 0.25 \cdot w_{\text{参数}} + 0.15 \cdot w_{\text{长度}}\)，保留两位小数，四舍五入。四项权重之和为 1.00，\(Q\) 的取值范围是 0.00 到 1.00。长度项判定：字数为 80 到 200 记 1，字数小于 80 记 0.5，字数大于 200 记 0。判定容差 ±0.01。挑战题判定"最高"的规则：选对率大于等于 0.90 者视为达标，只有一个；质量分并列时（版本 A 与 B 均为 0.08）两者都标为并列最低，不影响其余判定。计数题以整数精确匹配，容差 ±0 个。

**学习者活动：**

1. 学习者看到六个版本与四项标准，先逐版本勾选四项标准并手算质量分，此时选对率列可见但判断题未揭晓。
2. 质量分全部提交后揭示三道判断题的答案，学习者对照 E 与 F 两行，把质量分排序与选对率排序并排写下来。
3. 学习者应注意到两处不一致：F 的质量分 0.85 高于 D 的 0.75 却被 D 反超，以及 A 与 B 的质量分打平但选对率差 0.13。

**反馈文案：** 三道判断题，固定顺序，每题两次机会，提交后立即揭晓。答对："正确，<标准值>"，随后展示该题反馈文案。答错：展示对应行的四项勾选状态与质量分、选对率两列数值，再展示反馈文案，并指出该行的失分项是哪一项。第 1 题两次答错记为失手。计分满分 3 分，达到 2 分视为掌握。三题结束后展示六个版本的质量分排序与选对率排序的对照，以及"四项齐全不等于效果最优"这一结论。

**初始状态：** 六个描述版本的四项标准勾选框全部为空，质量分与选对率两列可见，三道判断题折叠在下方。屏幕提问："把描述写全就一定更好吗？先给六个版本打分，再看 120 道题的实际结果。"

**章节锚点：** 描述的四项标准（做什么、何时用、何时不用并指向兄弟工具、参数单位格式与边界）；质量分公式与权重（时机 0.30、边界 0.30、参数 0.25、长度 0.15）；长度项的三档口径（80 到 200 字记 1、小于 80 字记 0.5、大于 200 字记 0）；六个版本的字数 4 / 38 / 96 / 142 / 178 / 412 与质量分 0.08 / 0.08 / 0.45 / 0.75 / 1.00 / 0.85；六个版本的选对率 0.55 / 0.68 / 0.79 / 0.85 / 0.91 / 0.83；版本 E 为本章实际采用版本；版本 F 因 412 字超过 200 字上限导致选对率从 0.91 回落到 0.83；评测集 120 道、正例与负例与干扰各 40 道；`query_order` 描述重写后选择正确率从 0.68 升到 0.91、负例准确率 0.93；参数不超过 6 个否则拆工具；`pattern` 与 `additionalProperties: false` 两条 Schema 纪律。

</details>
</details>

### 资源与提示模板

资源和提示模板是 MCP 相对 function calling 独有的两块能力，也是"一份 MCP 服务比一串本地函数更值钱"的原因所在。

资源是**可读取的只读数据**，用 URI 寻址而非参数寻址。选择标准就一条：有没有副作用。读订单详情是资源，创建退款是工具——把读操作做成工具会让模型的调用轨迹里塞满本可以避免的 `tools/call`，而把写操作做成资源则可能出现"读一下就把钱退了"，这是不可接受的语义倒退。

本章 3 个资源的 URI 与用途：

| URI | 内容 | 谁该读 |
|---|---|---|
| `orders://{order_id}` | 单个订单的完整快照 | 需要完整字段而非摘要时 |
| `schema://refund-reason` | 退款原因枚举表 | 模型要填 `reason` 参数前 |
| `policy://refund-window` | 各品类的退款期限政策 | 判断订单能不能退 |

```python
from fastmcp import FastMCP

mcp = FastMCP("order-mcp")


@mcp.resource("orders://{order_id}")
async def order_detail(order_id: str) -> str:
    """单个订单的完整快照，仅 GET 语义，不做任何写入。"""
    return await order_service.fetch_raw(order_id)


@mcp.resource("schema://refund-reason")
async def refund_reason_enum() -> str:
    """退款原因枚举表，模型填写 reason 参数前应先读取本资源。"""
    return "quality,damaged,not_delivered,duplicate,other"
```

提示模板解决的是另一类问题：团队里那些每次都要重写一遍的提示词——退款话术、异常订单的排查步骤、客服升级模板。存成服务端资源的好处是可版本化、可被多个 Agent 共用、改一次全网生效。

```python
@mcp.prompt()
async def refund_progress_notice(order_id: str, reason: str) -> str:
    """退款进度通知模板。reason 必须是 schema://refund-reason 里的枚举值之一。"""
    return (
        f"你的订单 {order_id} 的退款申请已收到，退款原因：{reason}。"
        "款项将在 1-3 个工作日内原路退回，可在本页查看进度。"
    )
```

注意 `schema://refund-reason` 这个资源的存在价值：`reason` 是一个需要枚举约束的字段，把枚举值单独做成资源而不是硬塞进参数 Schema，好处是枚举变了不用改 Schema 版本，客户端读一次就是最新的。

!!! mascot-neutral "三原语的归类标准"
    ![墨墨表情平静](../../img/mascot/neutral.png){ class="mascot-admonition-img" }
    资源和工具的边界不是随手定的：读操作做成资源，写操作做成工具。三原语用错会让模型的调用轨迹变得难以复现。

### 工具鉴权机制

鉴权回答一个问题：**这个请求是谁发起的、有权做这件事吗**。MCP 本身不带鉴权规范，它只负责把请求送到服务端，身份认定得由服务端自己做。生产上最常见的做法是标准 Bearer 令牌，本章用的是 JWT。

MCP 规范推荐 OAuth 2.1 这一类标准流程；对服务端到服务端这类场景，直接用签发的长期令牌（JWT）更省事，因为它不需要浏览器跳转。`order-mcp` 用的是 HS256 签名的 JWT：载荷里放 `sub`（服务账号）、`tid`（租户 ID）、`scopes`（权限范围）、`exp`（过期时间），密钥每 24 小时轮换一次。

四种常见做法的取舍：

| 方式 | 鉴权强度 | 运维成本 | 适用 |
|---|---|---|---|
| 无鉴权 | 无 | 无 | 只在本地调试用 |
| 静态 API Key | 中，看泄露面 | 低 | 单租户内部服务 |
| JWT 短期令牌 | 高，可精确到租户与权限 | 中 | 多租户 SaaS，本章采用 |
| OAuth 2.1 授权流 | 最高，含用户级授权 | 高 | 需要代表用户操作的场景 |

关键纪律是**租户身份只能从服务端解析出的令牌里取，绝不从参数里取**。如果 `query_order` 有一个 `tenant_id` 参数，那么模型只要填错或被诱导填别人的值，就是一次越权。正确做法是服务端从 JWT 的 `tid` 声明里读，`order_service.fetch()` 内部把它拼进 SQL 的 `WHERE tenant_id = ?`。

```python
import jwt
from fastmcp.exceptions import ToolError

JWT_SECRET = "从环境变量注入，绝不写进代码"
ALLOWED_ALG = "HS256"          # 白名单：不做算法协商，防止 alg=none 攻击


class TenantContext:
    """请求级身份容器，由服务端从令牌构造，绝不由客户端参数填充。"""

    def __init__(self, sub: str, tid: str, scopes: list[str]):
        self.sub, self.tid, self.scopes = sub, tid, scopes


def auth_middleware(ctx, call_next):
    """FastMCP 中间件：校验令牌并把租户身份挂到请求上下文上。"""
    header = ctx.request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise ToolError(-32002, "缺少 Bearer 令牌")
    try:
        claims = jwt.decode(header[7:], JWT_SECRET, algorithms=[ALLOWED_ALG])
    except jwt.ExpiredSignatureError:
        raise ToolError(-32002, "令牌已过期，请重新获取")
    if not claims.get("scopes"):
        raise ToolError(-32002, "令牌未声明任何权限范围")
    ctx.state.tenant = TenantContext(claims["sub"], claims["tid"], claims["scopes"])
    return call_next(ctx)


mcp = FastMCP("order-mcp")
mcp.add_middleware(auth_middleware)
```

`algorithms=[ALLOWED_ALG]` 这个参数不能省：省略它等于接受令牌自己声明的算法，这是 JWT 最经典的漏洞。另外两个必做项是——令牌只放身份信息不放业务数据（业务数据放不进令牌是因为它会被日志记录），以及写类工具（`create_refund`、`update_inventory`）要单独校验 `scopes` 里有没有对应权限，读类工具不需要。

!!! mascot-warning "租户身份不能来自参数"
    ![墨墨提醒注意](../../img/mascot/warning.png){ class="mascot-admonition-img" }
    租户身份永远从服务端解析出的令牌里取，绝不接受参数传进来的 tenant_id。客户端传什么就信什么，等于把越权开关交给模型。

### 工具版本管理

工具的版本问题比库的版本问题更麻烦：库升级会编译报错，工具升级会**静默地改变模型的调用习惯**。比如 `query_order` 悄悄把 `order_id` 改名为 `orderNo`，客户端不报错，模型开始大面积调用失败，而服务端日志里只有一堆 `-32602` 参数错误。

管理规则用三条判定，标准是**破坏性变更才升主版本**：

| 变更类型 | 版本动作 | 例子 |
|---|---|---|
| 新增可选参数 | 次版本 2.4.0 → 2.5.0 | 加一个 `include_notes` |
| 新增工具 / 资源 | 次版本 | 加 `list_refunds` |
| 描述文字修订 | 次版本 | 把"不含物流"改成"轨迹可能延迟" |
| 删除参数、必填化、类型变更 | 主版本 2.x → 3.0.0 | `amount` 从 float 改成 string |

再加一条并行的机器判据：**Schema 指纹**。对每个工具的 `inputSchema` 取 SHA-256 存进清单，指纹变了就意味着 Schema 变了。客户端在 `initialize` 之后拿到的工具清单里带上指纹，SDK 会自动比对，服务端能立刻拒绝不兼容的旧客户端，而不是让它撞一堵看不见的墙。

```yaml
# order-mcp 的版本清单，随服务一起发布
service: order-mcp
version: 2.5.0
api_version: "2025-06-18"      # MCP 协议版本，与 Python SDK 对齐
tools:
  - name: query_order
    schema_fingerprint: "3f9a1c7e20b4"     # SHA-256 前 12 位
    since: "1.0.0"
    deprecated_since: null
  - name: query_order_v1          # 保留一个主版本的过渡期
    schema_fingerprint: "88c1d0a54f7e"
    since: "1.0.0"
    deprecated_since: "2.0.0"
    remove_after: "3.0.0"
  - name: create_refund
    schema_fingerprint: "b21e77c9a310"
    since: "2.0.0"                # 写操作从 2.0.0 起要求 refunds:write 权限
```

主版本迁移的实际做法是双轨：一个主版本内并存新旧两个工具名（旧名标 `deprecated` 并回一条提示，告诉模型优先用新名），跨一个大版本后删掉。过渡期至少给一个季度，因为客户端升级的节奏不由你控制。本章 `order-mcp` 目前是 2.5.0，`query_order` 已经历 4 次次版本、1 次主版本迁移，`query_order_v1` 计划在 3.0.0 移除。

### 错误码规范

MCP 沿用 JSON-RPC 2.0 的错误码体系，其中前五个是协议保留段位，不允许挪作他用：

| 错误码 | 协议含义 | 谁的问题 |
|---|---|---|
| `-32700` | 解析错误 | 报文不是合法 JSON |
| `-32600` | 请求无效 | 缺 `method` 或 `id` |
| `-32601` | 方法不存在 | 调了服务端没导出的工具 |
| `-32602` | 参数无效 | Schema 校验没过 |
| `-32603` | 内部错误 | 服务端崩了 |
| `-32099` 到 `-32000` | 工具自定义段位 | 本章的作业区 |

把自定义段位一次分完类，比每次临时编一个数字重要得多，因为客户端要靠它决定**要不要重试**。本章的错误码约定表：

| 错误码 | 类别 | 含义 | 典型触发 | 客户端应重试 |
|---|---|---|---|---|
| `-32001` | 参数非法 | Schema 校验失败 | `order_id` 格式不对 | 否，重试无用 |
| `-32002` | 鉴权失败 | 令牌缺失或过期 | JWT `exp` 已过 | 否 |
| `-32003` | 资源不存在 | 订单号或发票号查无此项 | 用户给错单号 | 否，应换参数 |
| `-32004` | 限流 | 超出单租户配额 | 单租户超 100 QPS | 是，退避后重试 |
| `-32005` | 上游超时 | 支付网关或承运商无响应 | 上游 3 秒未返回 | 是，退避后重试 |
| `-32006` | 内部错误 | 数据库连接池耗尽等 | 池上限 20 被占满 | 是，最多 1 次 |

这张表同时是第十一章埋点的字段设计依据：按错误码分组统计失败率，才能区分"模型调错了"（`-32001`、`-32003` 偏高）和"服务端不稳"（`-32005`、`-32006` 偏高），这两类的修法完全不同。

```python
from fastmcp.exceptions import ToolError

# 错误码集中定义，禁止在业务代码里散落裸数字
ERR = {
    "INVALID_PARAM": -32001,
    "UNAUTHORIZED": -32002,
    "NOT_FOUND": -32003,
    "RATE_LIMITED": -32004,
    "UPSTREAM_TIMEOUT": -32005,
    "INTERNAL": -32006,
}


def call_upstream(fn, *, retries: int = 1) -> dict:
    """把上游故障翻译成本章错误码；注意只有超时与限流才值得重试。"""
    try:
        return fn()
    except TimeoutError:
        raise ToolError(ERR["UPSTREAM_TIMEOUT"], "上游支付网关未在 3000 毫秒内响应")
    except RateLimitError as exc:
        raise ToolError(ERR["RATE_LIMITED"], f"触发限流，{exc.retry_after_ms} 毫秒后可重试")
    except LookupError:
        raise ToolError(ERR["NOT_FOUND"], "订单号不存在")
    except Exception:
        raise ToolError(ERR["INTERNAL"], "服务内部异常")
```

### 工具可观测埋点

工具调用是黑盒：用户看到的是"助手说查一下订单"，日志里看到的是一次 HTTP 200，中间的模型选了什么、参数填了什么、服务端跑到哪一步，全是空的。埋点要解决的就是这个断层——让每一次工具调用都能被还原。

本章的埋点契约是：一次工具调用产生 4 个 span（span 是链路追踪里的一个工作段），每个 span 必带 5 个字段。字段是 `trace_id`（贯穿 Agent 到上游的链路 ID）、`tool`（工具名）、`tid`（租户）、`latency_ms`（耗时）、`outcome`（`ok` 或错误码）。缺任何一项，这条 span 就没法在后面的聚合里用。

```python
import time
from opentelemetry import trace

tracer = trace.get_tracer("order-mcp")


@mcp.tool()
async def update_inventory(sku: str, delta: int) -> dict:
    """按 SKU 调整库存，delta 为增量（正数入库、负数出库）。"""
    # 第 1 个 span：模型决策后的工具调用整体
    with tracer.start_as_current_span("tool.update_inventory") as span:
        span.set_attribute("tool", "update_inventory")
        span.set_attribute("tid", ctx.state.tenant.tid)          # 租户从令牌取
        t0 = time.perf_counter()
        try:
            result = await inventory_service.adjust(sku, delta)
        except Exception as exc:
            span.set_attribute("outcome", getattr(exc, "code", -32006))
            raise
        finally:
            span.set_attribute("latency_ms", round((time.perf_counter() - t0) * 1000, 1))
        span.set_attribute("outcome", "ok")
        return result
```

对外要盯的指标是 5 个，按重要性排：调用量（按工具名切片）、成功率（`ok` 占比）、P95 延迟、错误码分布、每次成功调用消耗的模型 token 与成本。第三个指标最有诊断价值——`create_refund` 的 P95 是 1.9 秒，`query_order` 是 620 毫秒，差 3 倍；这个差值如果不量出来，你会以为整个服务都慢，然后把优化资源平摊到 8 个工具上。

本章 `order-mcp` 灰度两周的实测：8 个工具共调用 41.3 万次，总成功率 0.964，其中 `-32001`（参数非法）占全部失败的 38%——这个比例直接证明了前面的判断，**模型调错参数是工具失败的第一大原因，比服务端故障高出 3 倍**。所以治理的第一优先级是改 description 和收紧 Schema，而不是扩容。

## 三、封装已有系统

### 内部API转MCP

把已有 HTTP API 包成 MCP 工具，是最省事也最容易做糙的一类工作。糙在哪：直接照抄路径和参数名，把 OpenAPI 的字段原样倒给模型。结果是模型面对一个 40 个字段的接口，不知道该传哪些，绝大多数调用都缺参数。

正确的拆法是先按"一次业务动作"切工具，而不是按"一个接口"切工具。`order-core` 里那 11 个 HTTP 接口，收敛成本章的 3 个工具：`query_order`（读订单，合并了 4 个读接口）、`create_refund`（写退款，合并了退款申请与审批预检）、`send_notice`（发通知，后面因为调用量低被砍掉了）。

```python
import httpx
from fastmcp.exceptions import ToolError

BASE_URL = "https://order-core.internal"
_client = httpx.AsyncClient(timeout=httpx.Timeout(3.0), trust_env=False)


async def _call(path: str, params: dict, tid: str) -> dict:
    """统一的上游出口：租户走请求头注入，绝不放进 params。"""
    resp = await _client.get(f"{BASE_URL}{path}", params=params,
                             headers={"X-Tenant-Id": tid})
    if resp.status_code == 404:
        raise ToolError(-32003, f"上游不存在：{path}")
    if resp.status_code == 429:
        raise ToolError(-32004, "上游限流")
    if resp.status_code >= 500:
        raise ToolError(-32006, "上游服务异常")
    return resp.json()


@mcp.tool()
async def query_order(order_id: str, include_logistics: bool = False) -> dict:
    """按订单号查询订单状态、实付金额与支付方式。参数只有这两个，其余字段服务端补全。"""
    tid = ctx.state.tenant.tid
    order = await _call(f"/orders/{order_id}", {"fields": "core"}, tid)
    if include_logistics:
        try:                                    # 物流是可选增强，失败不该让整个工具失败
            order["logistics"] = await _call(f"/logistics/{order_id}", {}, tid)
        except ToolError as exc:
            order["logistics"] = {"available": False, "reason": exc.message}
    return order
```

三个做法值得直接抄。第一是**参数只暴露模型需要判断的**，上游要什么内部补全：模型不该决定 `fields` 字段列表，那是服务端的事。第二是**降级而非失败**：物流接口挂了就把 `available` 置为 false 返回，让模型告诉用户"物流信息暂不可用"，比整次调用失败好。第三是**合并而不是转发**：4 个读接口合成 1 个工具，模型选错工具的概率随之下降。

### 数据库查询工具

数据库工具是最危险的一类，因为模型会把自然语言翻译成 SQL，而自然语言里一个"上个月"就能生成出全表扫描。下面这个只读查询工具做了四层收窄。

```python
import re

FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|truncate|grant|create)\b",
    re.IGNORECASE,
)


@mcp.tool()
async def run_sql_readonly(sql: str, max_rows: int = 200) -> dict:
    """对只读副本执行单条 SELECT 查询。表名限 orders/order_items/products。

    仅用于统计与核对（如"上月订单量"）；查单个订单详情请用 query_order，结果更完整。
    禁止任何写操作，会被拒绝返回 -32001。结果最多返回 200 行。
    """
    if not sql.lstrip().upper().startswith("SELECT"):
        raise ToolError(-32001, "只接受 SELECT 语句")
    if FORBIDDEN.search(sql):
        raise ToolError(-32001, "语句中包含被禁止的关键字")
    if not re.search(r"\bLIMIT\b", sql, re.IGNORECASE):
        sql += " LIMIT 200"                    # 没有 LIMIT 一律补上，防止全表拉回
    with await readonly_pool.acquire() as conn:
        rows = await conn.fetch(sql, timeout=2.0)     # 服务端侧 2 秒超时
    return {"rows": [dict(r) for r in rows[:max_rows]], "truncated": len(rows) > max_rows}
```

四层收窄分别是：只连只读副本（数据库层的物理保证）、只接受单条 `SELECT`（关键字黑名单）、强制 `LIMIT`（防止结果集爆炸）、服务端侧 2 秒超时（防止慢查询占满连接池）。任何一层单独都不够——只有提示词约束说"不要删数据"是最没用的做法，因为模型看到的 SQL 是它自己生成的。

本章上线三个月，这个工具被调用 2.1 万次，其中 `-32001` 占 1,340 次，全部是模型试图拼 `UPDATE` 或漏了 `LIMIT`。有意思的是漏 `LIMIT` 的次数（890 次）远多于写操作（450 次），因为模型生成 `SELECT COUNT(*)` 时习惯性省略 `LIMIT`。

### 文件操作工具

文件工具的复杂度几乎全在路径上。模型会生成 `../../etc/passwd`、绝对路径、中文路径、Windows 路径，这四类都得处理。解法是**路径规范化加根目录锁定**：所有路径先 `realpath` 解析符号链接，再验证它在允许的根目录之内。

```python
from pathlib import Path

ROOTS = {"contract": Path("/data/contracts").resolve(),
         "invoice": Path("/data/invoices").resolve()}
MAX_BYTES = 20 * 1024 * 1024            # 单文件上限 20 MB


@mcp.tool()
async def read_document(kind: str, filename: str) -> dict:
    """读取合同或发票文件的纯文本内容。kind 取 contract 或 invoice。

    仅用于读取已归档的单个文件；查文件名请用 search_documents，返回的是匹配清单而非全文。
    单文件上限 20 MB，二进制文件（PDF、图片）请改用 extract_document_text。
    """
    root = ROOTS.get(kind)
    if root is None:
        raise ToolError(-32001, "kind 只能是 contract 或 invoice")
    target = (root / filename).resolve()          # 解析符号链接后才能判是否越界
    if not target.is_relative_to(root):           # 挡住 ../ 与绝对路径两种越界写法
        raise ToolError(-32001, "路径越界，文件名不能包含目录跳转")
    if not target.exists():
        raise ToolError(-32003, "文件不存在")
    if target.stat().st_size > MAX_BYTES:
        raise ToolError(-32001, f"文件超过 {MAX_BYTES // 1048576} MB 上限")
    return {"kind": kind, "name": target.name, "text": target.read_text("utf-8")}
```

`is_relative_to` 这个检查必须放在 `resolve()` **之后**——先 resolve 再判才能挡住符号链接攻击，只做字符串前缀判断的话，服务目录里放一个指向 `/etc` 的软链就绕过了。另外注意工具命名：本章只导出了 `read_document` 一个文件工具，写文件（`write_document`）**故意没有提供**——文件写入需要人工确认流程，不适合交给模型自主触发。

### 搜索工具封装

搜索工具封装最容易踩的坑是把搜索和读取合成一个动作，导致模型每次只想确认"有没有这个文件"时，都被塞进一整份文档。本章拆成两个：`search_documents` 返回标题与片段，`read_document` 返回全文。参数上有个关键设计——`max_results` 有上限，模型无法要求"把所有结果都给我"。

```python
@mcp.tool()
async def search_documents(query: str, kind: str = "contract",
                           max_results: int = 5) -> dict:
    """在合同或发票归档中做关键词检索，返回标题与命中片段，不返回全文。

    用于"找一份看起来相关的文件"；确认是哪一份之后再用 read_document 取全文。
    kind 取 contract 或 invoice。max_results 上限 20。
    """
    if max_results > 20:                       # 模型给的越界值直接夹紧，不报错
        max_results = 20
    hits = await es.search(index=f"docs-{kind}", query=query,
                           size=max_results, highlight={"fields": {"body": {}}})
    return {"total": hits.total, "hits": [
        {"doc_id": h.meta["doc_id"], "title": h.meta["title"],
         "snippet": h.highlight["body"][0] if h.highlight.get("body") else ""}
        for h in hits
    ]}
```

这三条参数纪律（返回条数有上限、超界夹紧不报错、检索与读取分离）同时也适用于第三章的检索接口。本章把它复述一遍是因为同一个错误在两个章节会以不同面貌出现：向量检索那边是 `TopK` 没夹紧，这边是 `size` 没夹紧。

### 代码执行工具

代码执行工具给模型一片临时空间去算数、变换数据。它是本章唯一一个"必须"配沙箱的工具，没有例外。

```python
@mcp.tool()
async def exec_python(code: str, timeout_s: int = 30) -> dict:
    """在隔离沙箱中执行一段 Python 代码，用于计算与数据变换。

    仅用于对已获取的数据做计算（求和、排序、格式化）；查订单请用 query_order，
    跑 SQL 请用 run_sql_readonly。不要用它读写文件或发起网络请求，那两项被沙箱禁止。
    标准库可用，第三方库仅 pandas 与 numpy。超时上限 30 秒。
    """
    if len(code) > 4000:
        raise ToolError(-32001, "代码长度超过 4000 字符上限")
    return await sandbox.run(
        language="python", code=code,
        limits={"cpu": 2, "memory_mb": 4096, "wall_clock_s": min(timeout_s, 30),
                "network": "egress-whitelist"},
    )
```

沙箱的具体形态（Daytona 那一类）留到第十章讲，这里只守住三条接口纪律：入参长度上限、超时上限用 `min` 夹紧、网络出口用白名单而不是黑名单。三条都能被模型绕过——`min(timeout_s, 30)` 挡不住模型写 `while True`，但墙钟超时会由沙箱侧强杀，这是双保险的意义。

### 工具沙箱隔离

沙箱隔离是把不可信的模型生成的代码关进一个资源受限、环境可控、事后可查的容器里。隔离能力按强度分四层，代码执行工具至少要达到第三层。

| 隔离层 | 手段 | 能挡住 | 本章是否使用 |
|---|---|---|---|
| 第一层 语言级 | 在代码里 try/except 与黑名单 | 语法错误、部分异常 | 是，不够 |
| 第二层 库替换 | 换掉 `open`、`eval` 等危险实现 | 简单的文件与反射访问 | 是，不够 |
| 第三层 进程与命名空间 | 非特权容器、只读根文件系统、禁 `ptrace` | 宿主文件、提权、逃逸尝试 | 是 |
| 第四层 微型虚拟机 | 每个执行独立的内核与网络命名空间 | 容器逃逸与侧信道 | 否，成本太高 |

本章 `exec_python` 的第三层配置写在这里，因为它就是可运行的规格说明：

```yaml
sandbox:
  runtime: daytona          # 第十章会深入这个执行沙箱方案
  image: python:3.12-slim
  limits:
    cpu: 2
    memory_mb: 4096
    ephemeral_disk_mb: 512
    wall_clock_s: 30        # 硬超时，到点强杀，不是靠代码自己退出
  filesystem:
    root: read-only         # 根文件系统只读
    tmp: tmpfs,size=512mb   # 唯一的可写区，用完即销毁
    network: none
  network:
    egress_whitelist: ["api.bank.example.com", "pypi.org"]
    deny_all_other: true
  identity:
    privileged: false
    capabilities: []        # 不给任何额外 capability
    no_new_privs: true
```

四条不能省的设置：只读根文件系统（挡住往系统目录写东西）、`network` 主开关设为 none 再按白名单放行（黑名单会被 DNS 重绑定绕过）、`no_new_privs`（挡住 setuid 提权）、容器用完即销毁（不做实例复用，否则上一段代码能看到这一段的环境变量）。

!!! mascot-warning "没有沙箱的代码执行工具等于裸奔"
    ![墨墨提醒注意](../../img/mascot/warning.png){ class="mascot-admonition-img" }
    能跑代码的工具必须有沙箱，这不是可选项。一个没隔离的 exec_python 等于把生产数据库口令递给了模型。这个坑我替你踩过。

## 四、可靠性与选型

### 工具超时熔断

超时的默认值不该照抄别人的文章，本章给的起点是：读类工具 800 毫秒，写类工具 3000 毫秒。分档的依据是工具调用的下游链路长度——`query_order` 打的是本地只读库，`create_refund` 要串订单服务、支付网关、账务三跳，后者给 800 毫秒会误杀大量正常请求。

超时要和重试一起看，因为它们的花销会叠加。设单次失败率 \(p = 0.30\)、重试 \(k\) 次，那么最终成功率是：

\[ P_{\text{ok}} = 1 - p^{\,k+1} \]

退避（失败后等待再重试）用等比数列，本章基数 200 毫秒、倍数 4、抖动 ±25%：

\[ t_i = t_0 \cdot m^{\,i-1} \cdot (1 + \xi_i), \qquad \xi_i \sim U(-0.25,\, 0.25) \]

把四种方案的总耗时上限算出来（每次调用超时上限 800 毫秒），结论才清楚：

| 方案 | 调用次数 | 退避等待 | 总耗时上限 | 成功率 |
|---|---|---|---|---|
| A 不重试 | 1 | 0 | 800 ms | 0.700 |
| B 重试 2 次 | 3 | 200 + 800 = 1000 ms | 3400 ms | 0.910 |
| C 重试 3 次 | 4 | 200 + 800 + 3200 = 4200 ms | 7400 ms | 0.973 |
| D 重试 2 次 + 熔断联动 | 3 | 同 B，但熔断打开时为 0 | 3400 ms / 熔断时 800 ms | 0.910 |

用户等待预算按 5 秒算。方案 C 的成功率最高（0.973）但总耗时 7400 毫秒超预算，用户已经关掉页面了——**超时的意义是保护服务，不是提高成功率**。方案 D 是本章的实际选择：熔断打开时直接快速失败，不再白等 3 次。

熔断的判定条件必须同时满足样本量与失败率两个门槛，否则低流量工具会因一次偶发失败就熔断：

```python
class CircuitBreaker:
    """60 秒滚动窗口；样本 >= 20 且失败率 >= 50% 才打开。"""

    def __init__(self, window_s: int = 60, min_samples: int = 20,
                 threshold: float = 0.5, half_open_probes: int = 10):
        self.window_s, self.min_samples = window_s, min_samples
        self.threshold, self.probes_needed = threshold, half_open_probes
        self.state = "closed"          # closed 开路 / open 熔断 / half_open 半开试探

    def allow(self) -> bool:
        return self.state != "open" or self._probe_ok()

    def record(self, ok: bool) -> None:
        # 半开态连续成功 10 次才回到 closed，否则立刻重新打开
        ...
```

本章的三个熔断器配置：读类工具 60 秒窗口 / 20 样本 / 50% 阈值，写类工具 60 秒窗口 / 10 样本 / 30% 阈值（写操作不能容忍失败），支付网关单独一个 120 秒窗口 / 30 样本 / 40% 阈值（上游抖动大，窗口拉长降低误熔断）。

退避和熔断的收益账要靠算，不能靠感觉。下面这个模拟器让你调节"重试次数"与"熔断是否联动"两个量，观察成功率、总耗时上限与熔断误伤率三者的变化，然后回答三道必须算的题。

#### Diagram: 重试次数与熔断联动的收益账

<iframe src="../../sims/tool-retry-backoff/main.html" height="652px" width="100%" scrolling="no"></iframe>

[全屏运行重试次数与熔断联动的收益账](../../sims/tool-retry-backoff/main.html){ .md-button .md-button--primary }

<details markdown="1">
<summary>设计说明（规格块）</summary>

本 MicroSim 已实现，上方 iframe 为实际运行的版本。下面的折叠内容是它的设计规格，供教师复用或二次开发参考。

<details markdown="1">
<summary>展开规格原文</summary>

重试次数与熔断联动的收益账</summary>
Type: microsim
**sim-id:** tool-retry-backoff<br/>
**技术库：** p5.js<br/>
**状态：** built<br/>
**Bloom 层级：** Evaluate<br/>
**Bloom 动词：** 权衡
**学习目标：** 学习者将调节重试次数与熔断联动开关，算出四种方案的总耗时上限与最终成功率，并在 5000 毫秒用户等待预算下选出方案 B，判定条件是所选方案为 B、其总耗时 3400 毫秒、成功率 0.910，三项全部一致（容差 ±0.001）。

**前置知识：** 工具超时熔断、单次失败率、退避等比数列、熔断状态机（均已在本块上方的"工具超时熔断"一节定义）。

**掌握判据：** 学习者先在不看标准值的情况下写出四种方案的总耗时上限与成功率，再回答三道判断题；三题标准值全部命中（预算内最优为方案 B、方案 C 成功率 0.973 但超时、最优方案的等待占比 0.294）算掌握。只拖动不看题不算证据。

**常见误区：** (1) 重试次数越多越好，3 次比 2 次总是更好。(2) 熔断只是省资源，不影响成功率与耗时。(3) 超时的目的是提高成功率。

**教学设计理由：** Evaluate 层级的判断必须把成功率与耗时放到同一把预算上权衡，因此三题都要先手写数字再揭晓；方案 C 是本块的核心——它成功率最高（0.973）却在 5 秒预算外，学习者必须承认"超时保护的是服务而不是成功率"。

**题库内容：**

学习者可调节两个量：

| 量 | 最小 | 最大 | 步长 | 默认 | 单位 |
|---|---|---|---|---|---|
| 重试次数 k | 0 | 3 | 1 | 2 | 次 |
| 熔断联动 | 关 | 开 | 1 | 开 | 无 |

固定参数：单次调用超时上限 800 毫秒，单次失败率 0.30，退避基数 200 毫秒、倍数 4、抖动上下 25%，用户等待预算 5000 毫秒，熔断条件为 60 秒窗口内样本不少于 20 且失败率不低于 50%。

四种方案的计算结果：

| 方案 | 重试次数 k | 调用次数 | 退避等待 | 总耗时上限 | 最终成功率 |
|---|---|---|---|---|---|
| A | 0 | 1 | 0 毫秒 | 800 ms | 0.700 |
| B | 2 | 3 | 200 + 800 = 1000 毫秒 | 3400 ms | 0.910 |
| C | 3 | 4 | 200 + 800 + 3200 = 4200 毫秒 | 7400 ms | 0.973 |
| D | 2（熔断联动） | 3 | 1000 毫秒，熔断打开时为 0 | 3400 ms / 熔断时 800 ms | 0.910 |

最终成功率 = 1 − 0.30 的（k + 1）次方。总耗时上限 = 调用次数 × 800 毫秒 + 退避等待之和。熔断联动打开时，熔断器打开的那段时间内第一次调用即返回 800 毫秒超时，不再进入重试。

挑战题（固定顺序）：

| 序号 | 题干 | 标准值 | 答错时的提示 |
|---|---|---|---|
| 1 | 在 5000 毫秒用户等待预算下，本章应选哪个方案，写出它的总耗时上限与最终成功率 | 方案 B，3400 毫秒，0.910 | 方案 C 成功率更高但总耗时 7400 毫秒已超预算；方案 B 为 3 次调用 × 800 毫秒加 1000 毫秒退避等于 3400 毫秒，成功率为 1 − 0.30 的 3 次方即 0.910。 |
| 2 | 四个方案里成功率最高的是哪个，它的总耗时上限是多少，是否可以用 | 方案 C，0.973，7400 毫秒，不可用 | 1 − 0.30 的 4 次方等于 0.973，是四者最高；但 4 次调用 × 800 毫秒加 4200 毫秒退避等于 7400 毫秒，超过 5000 毫秒预算 2400 毫秒。 |
| 3 | 方案 B 的总耗时中，退避等待占比是多少，保留三位小数 | 0.294 | 1000 毫秒除以 3400 毫秒等于 0.294，说明近三成时间花在等而不是在执行。 |

答题反馈文案：重试把成功率从 0.700 抬到 0.910，代价是耗时从 800 毫秒涨到 3400 毫秒；第三次重试还能再捞 0.063 的成功率（0.910 到 0.973），但要多花 4000 毫秒，这笔买卖在任何交互式场景里都不划算。方案 B 有一个常被忽略的属性：它 3400 毫秒里有 1000 毫秒是纯等待，占比 0.294，把这部分消掉能直接换来首字延迟的改善——所以本地重试优于把等待丢给上游队列。方案 D 的价值不在正常路径，而在故障路径：熔断打开时 800 毫秒就能返回错误，避免 60 秒窗口内每一次调用都白等 3400 毫秒。

**来源：** 单次失败率 0.30、退避基数 200 毫秒与倍数 4、抖动 25%、单次超时上限 800 毫秒、熔断的 60 秒窗口 / 20 样本 / 50% 阈值、超时与熔断的读写类配置，均出自本块上方的"工具超时熔断"一节。四种方案的总耗时上限与最终成功率由这些固定参数按 Content 中的公式直接算出，非独立假设值。用户等待预算 5000 毫秒为教学用设定值，示意来源为交互式会话的单轮等待容忍度。

**交互规则：** 最终成功率 = 1 − 0.30 的（k + 1）次方，保留三位小数。总耗时上限 = 调用次数 × 800 毫秒 + 退避等待之和；退避等待第 i 次为 200 × 4 的（i − 1）次方毫秒。预算内判定用 <=：总耗时上限小于或等于 5000 毫秒即为预算内。熔断联动打开且熔断条件满足（60 秒窗口内样本不少于 20 且失败率不低于 50%）时，第一次调用 800 毫秒即返回，不进入重试。判定容差：成功率 ±0.001，耗时 0 毫秒，比值 ±0.001。抖动上下 25% 只影响实际等待的分布，不改变上表的上限取值，上限按无抖动取整数计算。重试次数 k 在 0 到 3 的整数步长上变化，取值必须落在该区间；k 大于 3 的取值不参与计算。

**学习者活动：**

1. 学习者拖动重试次数从 0 到 3，观察成功率曲线与总耗时上限读数同步变化，应注意到成功率每次只涨一点而耗时每次多跳一截。
2. 学习者开关熔断联动，观察熔断打开后总耗时上限骤降到 800 毫秒的原因，应注意到熔断省的是等待不是成功率。
3. 学习者依次完成三道挑战题，手写答案后提交，最后一题结束后展示四个方案的完整推导。

**反馈文案：** 三道挑战题，固定顺序，每题两次机会，答案在提交后立即揭晓。答对："正确，<标准值>"，随后展示该题反馈文案。答错：展示该题的方案表对应行与计算过程，再展示反馈文案。两次答错记为失手。计分满分 3 分，达到 2 分视为掌握。顶部累计显示"累计答对 n/3 题"，最后一题结束后展示"预算内选 B、成功率最高选 C"这两个并不相同的结论。

**初始状态：** 重试次数位于默认值 2、熔断联动为开，四种方案的表格与三道挑战题可见，读数区显示当前组合的总耗时上限与最终成功率。屏幕提问："多试一次总能多救回一点吧？先算这四个方案的总耗时，再决定要不要重试。"

**章节锚点：** 读类超时 800 毫秒、写类超时 3000 毫秒的分档依据（下游链路长度）；单次失败率 0.30；重试最终成功率公式 1 − p 的（k + 1）次方；退避基数 200 毫秒、倍数 4、抖动 25%；用户等待预算 5000 毫秒；方案 A / B / C / D 的总耗时上限 800 / 3400 / 7400 / 3400 毫秒与最终成功率 0.700 / 0.910 / 0.973 / 0.910；方案 B 的退避等待 1000 毫秒与占比 0.294；方案 C 成功率最高但超预算 2400 毫秒；熔断判定双门槛（60 秒窗口、样本不少于 20、失败率不低于 50%）；读类熔断 60 秒 / 20 样本 / 50%、写类 60 秒 / 10 样本 / 30%、支付网关 120 秒 / 30 样本 / 40%；超时保护服务而不提高成功率这一结论。

</details>
</details>

### 工具评测方法

工具好不好用不能用"感觉挺准"来判断，本章的判据是三个数字，全部在 120 道评测题上算：工具选择正确率（该选 A 时有没有选 A）、参数填充正确率（选对了，参数填对没有）、整体任务成功率（工具层没掉链子的情况下任务有没有完成）。

评测集 120 题，三类各 40 道，缺一类这套评测就是废的：

| 题类 | 题数 | 考什么 | 典型陷阱 |
|---|---|---|---|
| 正例 | 40 | 该调这个工具时调不调 | 描述含糊导致选了兄弟工具 |
| 负例 | 40 | 不该调时会不会乱调 | 模型拿工具当搜索引擎 |
| 干扰 | 40 | 多个工具都沾边时选哪个 | 描述相似导致选错 |

```json
{
  "qid": "tool-eval-0087",
  "user": "帮我看下 SO-2026-0417 到哪了",
  "expected_tool": "query_order",
  "expected_args": {"order_id": "SO-2026-0417", "include_logistics": true},
  "category": "正例",
  "note": "查询物流轨迹，include_logistics 必须为 true，只查状态算部分正确"
}
```

`expected_args` 必须精确到字段值，否则"选对工具但参数错"和"完全选对"分不开——而这两种失败对应完全不同的修法：前者改 Schema 约束，后者改 description。

本章的评测结果很能说明问题。工具上线前，`query_order` 的工具选择正确率是 0.68，40 道负例里错 19 道——模型在没有必要时也在调它。修法不是删工具，是把描述补全（见第五节的四项标准），重写后正例涨到 0.91、负例准确率涨到 0.93。现在全套 8 个工具的整体选择正确率是 0.89，参数填充正确率是 0.83。

!!! mascot-encourage "标 120 道题确实枯燥"
    ![墨墨为你打气](../../img/mascot/encouraging.png){ class="mascot-admonition-img" }
    写完 120 道工具评测题那天你会觉得这个活儿没完，但它一次投入长期复用，是唯一能证明工具好用的尺子。先硬着头皮标完 40 道跑通流程。慢慢来，比较快。

### 工具市场选型

社区里现成的 MCP 服务不少，但"能跑"和"敢上生产"之间有一道很宽的沟。三个必查项，缺一项就先放下：权限面（它要什么权限，能不能只读）、可观测性（调不动的时候有没有日志）、活跃度（最近 90 天有没有提交）。

| 候选 | 权限面 | 日志 | 近 90 天提交 | 结论 |
|---|---|---|---|---|
| 社区文件系统服务 | 宿主机全盘读写 | 无 | 0 次 | 不用，要求写全盘 |
| 社区搜索服务 | 无鉴权、无限流 | 仅 print | 3 次 | 仅本地调试 |
| 官方 registry 的 PostgreSQL 服务 | 只读账号，可限定 schema | 结构化 | 41 次 | 采纳，限定只读 |
| 私有自建（本节做法） | 三租户隔离 + JWT | 4 个 span | 持续 | 作为核心工具 |

判断权限面有一个实用技巧：看它默认配置里有没有"只读"这个选项。没有只读选项的服务，意味着你在自己的安全评审里只能二选一——要么给它全权限，要么不用。

!!! mascot-thinking "先问权限，再问功能"
    ![墨墨思考中](../../img/mascot/thinking.png){ class="mascot-admonition-img" }
    现成的 MCP 服务别急着抄，先问它要什么权限、留不留日志。能列出权限面的服务才敢上生产，只有 README 的先放下。

## 五、集成与对比

### MCP与函数调用对比

这是本章最需要掰开的一对概念。第一章的 function calling 和 MCP 解决的是两个不同层次的问题：前者是**模型与代码之间的一次握手**，后者是**工具与进程之间的长期契约**。它们不是替代关系，MCP 的工具照样用 function calling 报给模型。

| 维度 | function calling | MCP |
|---|---|---|
| 谁发起 | 模型输出 `tool_calls`，应用代码执行 | 模型输出 `tool_calls`，客户端经协议转发给远端服务端 |
| Schema 谁提供 | 应用在每次请求里手写进 `tools` 参数 | 服务端在 `tools/list` 里返回，客户端自动获取 |
| 是否跨进程 | 通常不跨，同进程函数或同机 HTTP | 跨进程、跨机器、跨团队 |
| 发现机制 | 硬编码在应用里，改工具要改代码并重新部署 | 握手后动态发现，加工具不用改客户端 |
| 能力面 | 只有工具 | 工具、资源、提示模板三类原语 |
| 适用场景 | 单应用内、工具少（10 个以内）、快速迭代 | 工具要复用给多个客户端、要交给别的团队维护 |

从上表能读出一条清晰的边界：**工具在 10 个以内、只服务一个应用、迭代频繁**，用 function calling 更省事；一旦工具要跨应用复用、或者维护权在别的团队，MCP 的收益就盖过它的成本了。本章 `order-mcp` 用 MCP 的核心理由是第二条——它的维护在订单团队，调用方有 4 个。

!!! mascot-thinking "别把 MCP 当更长的函数调用"
    ![墨墨思考中](../../img/mascot/thinking.png){ class="mascot-admonition-img" }
    函数调用解决的是模型和代码之间的一次握手，MCP 解决的是工具和进程之间的长期约定。把 MCP 当成更长的函数调用，就错过了它真正的价值。

### MCP客户端集成

客户端集成的核心动作是**发现 + 命名空间**。多个服务器接入时，工具名会撞——两个服务器都提供 `search`，模型选哪个就是抛硬币。本章的解法是加前缀：`order__search`、`knowledge__search`。

```python
from mcp import ClientSession

SERVERS = {
    "order": "http://order-mcp:8931/mcp",
    "knowledge": "http://kb-mcp:9102/mcp",
}


async def build_catalog() -> list[dict]:
    """把所有服务器的工具汇成一张带命名空间的清单，并按工具数做上下文预算。"""
    catalog: list[dict] = []
    for ns, url in SERVERS.items():
        async with streamablehttp_client(url) as (r, w, _):
            async with ClientSession(r, w) as s:
                await s.initialize()
                for t in (await s.list_tools()).tools:
                    catalog.append({
                        "name": f"{ns}__{t.name}",           # 命名空间，杜绝撞名
                        "description": t.description,
                        "inputSchema": t.inputSchema,
                        "server": ns,
                        "schema_fingerprint": t.meta.get("fingerprint"),
                    })
    return catalog
```

拿到清单后有两件事必须在客户端做。一是**预算裁剪**：工具描述是要进模型上下文的，本章 2 个服务器共 34 个工具、全量描述约 21,000 token，超出可接受范围；按服务器相关性裁到 12 个工具、约 7,400 token 才是能上线的配置。二是**指纹校验**：把 `schema_fingerprint` 和本地期望值比对，不一致就打日志告警，让服务端改坏 Schema 时能第一时间发现，而不是等用户报"工具调不通"。

一次完整的客户端调用循环，和第一章的 function calling 循环对比如下——骨架完全一样，差的是工具从哪来、结果怎么校验：

```python
async def agent_step(session_msgs, catalog, max_steps: int = 5) -> str:
    """工具来源从本地列表换成了远端清单；失败时按错误码决定要不要重试。"""
    history = list(session_msgs)
    for _ in range(max_steps):
        msg = await llm.ainvoke(history, tools=catalog)     # 第一章的同款调用
        history.append(msg)
        if not msg.tool_calls:
            return msg.content
        for call in msg.tool_calls:
            ns, _, tool = call.name.partition("__")          # 拆回命名空间选服务器
            try:
                out = await invoke_with_retry(ns, tool, call.args)   # 800 ms 超时 + 两次退避
            except ToolError as exc:
                history.append(tool_msg(call.id, {"error_code": exc.code,
                                                  "message": exc.message}))
                continue
            history.append(tool_msg(call.id, out))
    return "达到步数上限，未收敛"
```

注意 `continue` 那一支：工具失败时把结构化错误回给模型而不是抛异常终止，让模型自己决定是换参数还是换工具。这个设计是第二十六行 `except ToolError` 那三行存在的理由——错误信息写得越具体（错误码 + 一句话原因），模型自我修正的成功率越高。

### 工具链编排模式

单个工具是砖，一串工具才是能力。本章总结四种编排模式，选哪种取决于工具之间的依赖关系：有没有先后、有没有分支、要不要收敛。

| 模式 | 结构 | 适用 | 本章实例 |
|---|---|---|---|
| 顺序链 | A → B → C，后一个的入参来自前一个 | 有数据依赖 | 查订单 → 查物流 → 生成退款话术 |
| 并行扇出 | 同时跑多个，汇总 | 各自独立 | 同时查订单、发票、库存 |
| 路由分派 | 先判断再选一个分支 | 意图差异大 | 判断问题类型后分给"查询"或"写入"工具 |
| 循环收敛 | 反复调用直到满足条件或触上限 | 迭代求解 | 逐页抓取直到取完 |

```python
import asyncio

async def orchestrate(user_msg: str, cat: list[dict]) -> dict:
    """路由分派 + 并行扇出 + 循环收敛的组合；每个工具都带独立超时。"""
    intent = await classify(user_msg)                      # 路由分派：一次轻量判定
    if intent == "write":
        return await invoke_with_retry("order", "create_refund", parse_amount(user_msg))

    # 并行扇出：三个工具互不依赖，同时发，耗时取最慢的那个而非三者之和
    names = [("order", "query_order"), ("order", "list_invoices"),
             ("order", "search_documents")]
    results = await asyncio.gather(
        *[invoke_with_retry(ns, n, args_for(n, user_msg), timeout=0.8) for ns, n in names],
        return_exceptions=True,                            # 一个挂掉不拖垮另外两个
    )
    return {name: (r if isinstance(r, dict) else {"error": str(r)})
            for (ns, name), r in zip(names, results)}
```

并行扇出的收益要算清楚：三个工具的 P50 分别约 180、240、310 毫秒，串行是 730 毫秒，并行后端到端约 340 毫秒（多出来的是并发连接开销），省 390 毫秒。这个差别在多轮对话里会累加——用户感知到的是"每次问都要等"，而不是"这工具有点慢"。

循环收敛必须硬性带上界。本章的规则是：步数上限 5、累计 token 上限 8000、同一工具签名连续调用 3 次即中止。三条任一触发就把当前状态交回模型总结，而不是继续跑。

!!! mascot-tip "先并行，再串行"
    ![墨墨提示技巧](../../img/mascot/tip.png){ class="mascot-admonition-img" }
    三个互不依赖的工具串起来跑等于把延迟加了三倍。先看清依赖关系，无依赖就并行，有依赖才串行。这条经验在第九章的后端集成里还会再用到一次。

## 六、治理收口

### 工具治理清单

前面二十一个概念最后落到一件事上：让这套工具在人员轮换、模型升级、需求变更之后依然可用。治理靠的是一张逐条勾的清单，而不是靠某个人的记性。下面这份是本章 `order-mcp` 上线前的实际版本，21 项全过。

- [ ] 每个工具都有明确的正反两面描述：写清什么时候用、什么时候不用并指向兄弟工具
- [ ] 每个参数都有类型注解、单位说明与格式约束，不靠 description 里的君子协定
- [ ] `additionalProperties` 设为 `false`，多余字段直接报错而非静默忽略
- [ ] 参数个数不超过 6 个，超过就考虑拆工具
- [ ] 读操作导出为资源，写操作导出为工具，没有例外
- [ ] 租户身份只从令牌解析得到，全仓搜不到任何从参数读 `tenant_id` 的代码
- [ ] 写类工具单独校验权限范围，读类工具不校验
- [ ] JWT 解码显式指定算法白名单，不做算法协商
- [ ] 错误码集中在错误码表里定义，业务代码里没有裸数字
- [ ] 每个错误码都能回答"客户端要不要重试"这个问题
- [ ] 每次工具调用产生 4 个 span，5 个必带字段一个不缺
- [ ] 按错误码分组统计失败率，能区分"模型调错"和"服务端不稳"
- [ ] 读类超时 800 毫秒、写类超时 3000 毫秒，按下游链路长度分别设定
- [ ] 重试配等比退避且带抖动，最多重试 2 次，总耗时在用户等待预算内
- [ ] 熔断同时卡样本量与失败率两个门槛，低流量工具不因偶发失败熔断
- [ ] 代码执行工具跑在第三层以上隔离的沙箱里，根文件系统只读
- [ ] 沙箱网络默认 deny，出口走白名单，容器用完即销毁
- [ ] 数据库工具连只读副本、强制 `LIMIT`、带服务端侧超时
- [ ] 文件工具先 `resolve()` 再判根目录，`is_relative_to` 检查不可省
- [ ] 每个工具的 Schema 指纹登记进版本清单，破坏性变更升主版本
- [ ] 评测集 120 题三类齐全，冻结进版本库，改集必须重跑基线

清单的价值在于它把"应该做"变成了"已做"。第 6 项和第 10 项是安全底线，破了就是事故；第 11、12 项是可观测底线，破了就会变成"用户报障但查不出原因"；剩下的多数可以在赶工期时延后，但延后时要写进工单并定下日期。

!!! mascot-celebration "工具能交付了"
    ![墨墨庆祝](../../img/mascot/celebration.png){ class="mascot-admonition-img" }
    你现在有一套能交付的工具服务了：8 个工具、3 个资源、1 个提示模板，鉴权、版本、熔断、埋点、治理清单全部到位。下一章我们把这套工具交给多个 Agent 同时用。八条触手，一起开干！

## 本章小结

- MCP 是纵向的"Agent → 工具"协议，解决的是工具住在别的进程、别的团队这件事；它管接线，不管工具内部质量。第八章的 A2A 管的是横向的 Agent 与 Agent。
- 会话只有四步：`initialize` → 能力清单 → `notifications/initialized` → 日常循环；传输是无状态 HTTP，重试责任在客户端。
- MCP 有三类原语：工具可调用、资源可读取、提示模板可复用。归类标准只有一条——有没有副作用，本章共 12 项。
- 描述写四条：做什么、何时用、何时不用（指向兄弟工具）、参数单位与边界。`pattern` 交给服务端校验，`additionalProperties: false` 挡住幻觉字段。
- 鉴权用 JWT，`algorithms` 白名单不能省；租户身份只从令牌取，写类工具单独校验权限范围。
- 版本规则是破坏性变更才升主版本，Schema 指纹提供机器判据；`query_order_v1` 计划在 3.0.0 移除。
- 错误码分五类，客户端是否重试是分类的第一原则；`-32001` 参数非法占全部失败的 38%，远高于服务端故障。
- 一次调用 4 个 span、5 个必带字段，对外盯调用量、成功率、P95、错误码分布、单次成本五项。
- 封装已有系统时按业务动作切工具而非按接口切；11 个 HTTP 接口收敛成 3 个工具，砍掉调用量低的那个。
- 数据库工具四层收窄（只读副本、只接受 `SELECT`、强制 `LIMIT`、侧超时）；文件工具先 `resolve()` 再判根目录。
- 沙箱四层隔离，代码执行工具至少第三层：只读根文件系统、网络默认 deny 加白名单、`no_new_privs`、用完即销毁。
- 超时按链路长度分档（读 800 毫秒、写 3000 毫秒）；重试 2 次的 3400 毫秒在 5 秒预算内，重试 3 次的 7400 毫秒就超了——超时保护的是服务，不是成功率。
- 熔断卡两个门槛：60 秒窗口内样本 ≥ 20 且失败率 ≥ 50% 才打开，避免低流量工具误熔断。
- 评测集 120 题（正例、负例、干扰各 40 道），`expected_args` 要精确到字段值；重写描述后选择正确率从 0.68 升到 0.91。
- 工具市场选型三个必查项：权限面、可观测性、近 90 天活跃度；没有只读选项的服务等于让你在安全评审里二选一。
- function calling 是模型与代码的一次握手，MCP 是工具与进程的长期契约；工具少于 10 个且只服务一个应用，用前者更省事。
- 客户端集成两件必做：加 `server__tool` 命名空间防撞名，按预算裁剪工具描述进上下文（34 个工具 21,000 token 裁到 12 个 7,400 token）。
- 工具链四模式：顺序链、并行扇出、路由分派、循环收敛；无依赖就并行，本章三个工具串行 730 毫秒降到并行 340 毫秒。
- 21 条治理清单是前二十个概念的落点：安全底线（租户身份、算法白名单）、可观测底线（span 与字段）、其余可延后但要写进工单定日期。