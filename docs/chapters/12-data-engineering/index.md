---
title: 企业数据工程
description: 用 Temporal 把长任务做成可续跑的编排，用 Dagster 管住数据资产血缘，再用 Polaris、Iceberg、Trino 与自然语言转 SQL 把 Agent 接到企业数据之上
generated_by: claude skill chapter-content-generator
date: 2026-10-06 02:00:00
version: 1.11
---

# 企业数据工程

## 本章概要

本章讲数据分析 Agent 的底座：Temporal 编排持久化、Dagster 资产管理、Polaris 加 Iceberg 数据湖与 Trino 分布式查询。
学完本章，读者将掌握上述主题，并能将其用于后续章节的综合项目。

## 本章覆盖概念

本章覆盖学习图中的以下 22 个概念：

| 概念 | 重要度（CIS） |
|---------|-----------------------|
| Temporal编排入门 | 1 |
| Temporal优先实践 | 2 |
| 工作流持久化 | 2 |
| 断点续跑机制 | 1 |
| 定时与重试策略 | 1 |
| 长任务拆分 | 1 |
| Dagster资产管理 | 1 |
| 资产血缘追踪 | 1 |
| 调度监控大盘 | 2 |
| Polaris数据湖搭建 | 2 |
| Iceberg表格式 | 1 |
| 分区与压缩策略 | 1 |
| 数据质量校验 | 1 |
| Trino分布式查询 | 1 |
| 自然语言转SQL | 1 |
| 查询结果缓存 | 2 |
| 报表Agent实战 | 2 |
| 指标口径管理 | 1 |
| 取数权限管控 | 1 |
| 数据回填流程 | 1 |
| 湖仓一体演进 | 1 |
| 数据成本优化 | 2 |

## 前置知识

本章建立在以下章节的概念之上：

- [Chapter 1: 开发基础与工程规范](../01-dev-foundations/index.md)
- [Chapter 2: 模型接入与进阶过渡](../02-model-access/index.md)
- [Chapter 9: AI 应用后端集成](../09-backend-integration/index.md)
- [Chapter 11: 可观测性与评测优化](../11-observability-eval/index.md)

---

!!! mascot-welcome "把 Agent 接到企业数据之上"
    ![墨墨挥手欢迎](../../img/mascot/welcome.png){ class="mascot-admonition-img" }
    前十一章你造出了一个能推理、能调工具、能被评测的 Agent，但它回答"上个月华东区毛利率多少"时会告诉你它不知道——因为答案在数据湖里，不在向量库里。这一章把数据层的地基铺上：任务不丢、数据可追溯、口径有人管、SQL 有关卡。八条触手，一起开干！

先说本章的核心论点，它决定了后面所有小节的顺序。企业里 Agent 要回答的绝大多数问题——这个月哪个区域毛利下滑、库存周转有没有变差、渠道新增了多少用户——答案不在向量库那 12,800 个文档块里，而在数据湖的 47 张表里。向量库装的是"制度说该怎么做"，数据湖装的是"事情实际怎么样"，两者不能互相替代。

而大模型在这件事上的能力边界必须说在前面：**LLM 不会做 SUM，它只会写 SQL。** 让它算 1,850 万行订单的销售额，唯一路径是让它生成一条 `SELECT SUM(amount) ...`，再交给某个查询引擎执行。这意味着两件事同时成立——LLM 的价值在"把中文变成对的 SQL"，而 Agent 的可靠性上限由数据层决定：表结构不对、指标口径不一致、权限没管住、查询太贵被限流，任何一项出问题，模型生成的 SQL 再漂亮也拿不到可信答案。所以第十一章那套"用门禁守住模型质量"的做法，在这里要往前推一层——**先守住数据层，再谈模型质量**。

本章的示例对象从头到尾只有一个：某零售集团的报表 Agent，日均 2,400 次自然语言取数请求，跑在 8 个 worker 的 Trino 集群上，湖里 47 张 Iceberg 表、4.6 TB 压缩后数据、3 年订单历史。所有数字都来自这一套系统，你可以按同样口径缩放到自己的规模。

## 一、Temporal：让长任务跑得完

### Temporal编排入门

Temporal 是一个持久化工作流引擎，它解决的是一个具体问题：**任务状态存在进程内存里，进程一挂，进度就归零。** 企业里的长任务恰好特别怕这件事——月度经营分析要跑 41 分钟，中间要调 Spark、调 Trino、发通知，你不可能保证 41 分钟里机器不被重启、不被扩缩容、不被滚动发布打断。

Temporal 的核心抽象是两个角色的分离。**workflow（工作流）**承载编排逻辑：调用顺序、条件分支、循环、等待、补偿，它自己只做决策，不碰外部世界。**activity（活动）**承载业务动作：查库、跑 SQL、调用 Spark、发通知，每一次 activity 都是一次可能失败、可能超时的外部调用。两者的分离不是风格问题，而是可靠性问题：workflow 代码必须**确定性**，因为它会被反复重放——Temporal 靠重放历史来还原执行位置，如果 workflow 里直接读了当前时间或者调了随机数，重放出来的状态就和第一次不一致，整个机制崩掉。

| 角色 | 职责 | 必须确定性 | 典型代码量（本章示例） |
|---|---|---|---|
| workflow | 编排：顺序、分支、等待、补偿 | 是 | 68 行 |
| activity | 业务动作：SQL、Spark、通知 | 否 | 每个 20 到 40 行，共 6 个 |
| client | 启动工作流、查询状态、发信号 | 否 | 15 行 |

本章的月度经营分析工作流有 6 个步骤，顺序执行合计 41 分钟：

| 步骤 | 名称 | 耗时（分钟） | 产生的副作用 |
|---|---|---|---|
| 1 | 抽取订单增量到 raw 层 | 12 | 写入 `raw.orders` 当日分区 |
| 2 | 维度对齐（门店、商品） | 6 | 写入 `stg.dim_store`、`stg.dim_product` |
| 3 | 计算订单明细宽表 | 9 | 写入 `dwd.order_detail` 当日分区 |
| 4 | 口径对齐校验 | 4 | 写入 `ads.metric_definition_check` |
| 5 | 生成 12 张报表草稿 | 7 | 写 12 张草稿表，发出 2 个通知 |
| 6 | 发布报表并刷新看板 | 3 | 草稿转正，看板快照前移 |
| 合计 | | 41 | |

这张表是本章后面所有数字的共同底稿，请记住两个数：**41 分钟**（全量重跑的代价）和 **6 个步骤**（拆分的粒度）。

### Temporal优先实践

优先实践指的是一条具体的纪律：**先建模状态，再写编排；先落事件历史，再接业务。** 它的反面是很多人第一次用 Temporal 时的写法——把整个脚本包成一个 activity，编排逻辑塞在 activity 内部。这个写法能跑通第一次，但第二次出问题时你什么都查不到，因为历史里只有一个 activity 的失败记录，看不出它内部走到哪一步。

本章选 Temporal 而不是 Airflow 或 Prefect 的理由有三条，都和"Agent 要接数据"这件事直接相关：

| 维度 | 为什么对本章重要 | Temporal 的做法 |
|---|---|---|
| 触发方式 | 报表 Agent 的取数请求既定时也随叫随到 | 同时支持 cron 定时与 client 手动启动，落到同一条历史里 |
| 人工干预 | Agent 生成的 SQL 被业务方打回后，要从中间某步改参数重跑 | 支持 signal 往运行中的工作流注入修改，不重启 |
| 与 Agent 的集成 | Agent 的每一次取数都应该留一条可回放的历史 | 每次取数就是一条 workflow 历史，可用 `workflow_id` 与 Agent 的 `trace_id` 对齐 |

第三条尤其重要，它把第十一章的 trace 与本章的历史接到了一起：**一个 `trace_id` 展开就是一次工作流重放**。出问题时你不需要猜"那条 SQL 当时是在第几步、用的什么参数生成的"，历史里有。

```python
from datetime import timedelta

from temporalio import activity, workflow
from temporalio.common import RetryPolicy

# workflow 的沙箱会拦截 I/O，把需要用到的模块显式放行。
# 不同 Python SDK 版本沙箱默认放行的模块列表不同，此处为手工列举，
# 版本差异以官方文档为准。
with workflow.unsafe.imports_passed_through():
    import datetime as dt


@activity.defn
async def extract_orders(day: str) -> int:
    """activity 只负责"干活"并返回可序列化的结果。
    这里返回的是写入行数，不是连接对象——workflow 的历史里不能存句柄。"""
    rows = await spark_run_sql(f"INSERT OVERWRITE raw.orders SELECT * FROM ext.orders "
                               f"WHERE dt = '{day}'")
    return int(rows)


@activity.defn
async def build_order_detail(day: str) -> int:
    return int(await spark_run_sql(
        f"INSERT OVERWRITE dwd.order_detail PARTITION (dt = '{day}') "
        f"SELECT o.order_id, o.user_id, s.region_code, p.category_l1, "
        f"       o.amount - o.refund_amount AS net_amount "
        f"FROM raw.orders o "
        f"JOIN stg.dim_store s ON o.store_id = s.store_id "
        f"JOIN stg.dim_product p ON o.product_id = p.product_id "
        f"WHERE o.dt = '{day}'"
    ))


@workflow.defn
class MonthlyReportWorkflow:
    """月度经营分析编排。workflow 里只出现控制流和数据，
    任何 I/O 都必须经由 activity。"""

    @workflow.run
    async def run(self, period: str) -> dict:
        # 每个 activity 的重试策略独立设置：抽取订单可以重试 5 次，
        # 因为它是覆盖写天然幂等；发通知只允许重试 0 次，理由见长任务拆分一节。
        rows = await workflow.execute_activity(
            extract_orders,
            args=[period],
            start_to_close_timeout=timedelta(minutes=20),   # 12 分钟实际耗时，留 8 分钟余量
            retry_policy=RetryPolicy(
                initial_interval=dt.timedelta(seconds=1),
                backoff_coefficient=2.0,                  # 退避序列 1/2/4/8/16 秒
                maximum_attempts=5,
            ),
        )
        await workflow.execute_activity(
            build_order_detail, args=[period],
            start_to_close_timeout=dt.timedelta(minutes=15),
            retry_policy=RetryPolicy(initial_interval=dt.timedelta(seconds=1),
                                     backoff_coefficient=2.0, maximum_attempts=3),
        )
        # ... 第 4 到第 6 步见下一段的完整实现
        return {"period": period, "extracted_rows": rows}
```

时间预算怎么定也有讲究。`start_to_close_timeout` 是单次尝试的上限，`workflow_run_timeout` 是整条工作流的上限。本章的取法是**单次上限按实测的 1.4 到 1.7 倍，整条上限按全量耗时 41 分钟的 1.5 倍即 60 分钟**——两者分开设，因为"某一步变慢"和"整体不该再跑了"是两件不同的事，用一个超时值管两件事时，运维收到的告警永远说不清是哪种。

### 工作流持久化

工作流持久化指的就是开头那句话的反面：状态不放在进程里，放在服务端。Temporal 服务端为每条工作流维护一条**事件历史**（event history），按顺序记录"工作流启动了""第 3 个 activity 调度了""第 3 个 activity 失败了""重试第 2 次""第 4 个 activity 调度了"这样的事件。worker 重启后从服务端拉回这段历史重放，重放出第 4 个 activity 正在等待，然后接着往下走。

```python
import asyncio

from temporalio import workflow
from temporalio.client import Client


async def main() -> None:
    client = await Client.connect("localhost:7233")

    # 启动工作流。workflow_id 选业务语义而非随机 UUID，
    # 因为 Temporal 用它做去重：同一个 id 已存在时不会开第二条。
    handle = await client.start_workflow(
        MonthlyReportWorkflow.run,
        args=["2026-09"],
        id="monthly-report-2026-09",           # 幂等键的一部分
        task_queue="monthly-report",
        execution_timeout=workflow.timedelta(minutes=60),   # 整条工作流上限
    )

    # 查状态：返回的是服务端持久化后的真实状态，不是进程内变量
    desc = await handle.describe()
    print(desc.status.name)                     # RUNNING / COMPLETED / FAILED
    print(desc.raw_info.get("history_length"))  # 历史事件条数，排查时第一条要看它

    # 拿结果并显式处理异常，而不是让异常把 worker 带崩
    try:
        result = await handle.result()
        print("完成：", result)
    except Exception as exc:
        # 失败时 result() 把最后一次失败作为异常抛出；
        # 工作流本身仍停在服务端，可以由运维从历史恢复或修复后重放
        print("失败原因：", exc)
        await handle.terminate(reason=f"人工终止：{exc}")


if __name__ == "__main__":
    asyncio.run(main())
```

持久化带来两个可以量化的变化。第一个是**恢复时间**：改造前进程重启后平均恢复 41 分钟（从头重跑，且没有任何记录说明上一步到底做完没有，只能人肉去查 Spark 的历史）；改造后从崩溃点继续，本系统在第 4 步崩溃的场景下只需 14 分钟。第二个是**重复副作用**：改造前第 5 步的 2 个通知会在重跑时再发一遍，业务方收到四条通知；改造后如果 activity 声明了幂等键，重复调用会被识别并直接返回上次的结果。

```bash
# 最小可运行栈：Temporal Server + 管理界面 + 命令行工具
git clone https://github.com/temporalio/docker-compose.git
cd docker-compose
docker compose up -d          # temporal、temporal-ui、temporal-admin-tools
# 健康检查：Temporal Server 的 gRPC 端口
curl -s http://127.0.0.1:8233/health | head -c 100
# 列出最近 10 条工作流，验证历史真的落在服务端
docker compose exec temporal-admin-tools \
  workflow list --query "WorkflowType='MonthlyReportWorkflow'" --limit 10
```

`workflow_id` 的选择是这段代码里最容易被忽略但最重要的一行。本章的规则是：**id 必须由业务语义拼成**（`monthly-report-2026-09`），因为它是幂等的唯一依据。用随机 UUID 的话，重试时会被当成新工作流开一条，于是同一个月份跑出两条报表，最后没人说得清哪条是对的。

### 断点续跑机制

断点续跑（resume from failure）是持久化真正兑现价值的地方。区别只在一个词：不是"从失败的地方重试"，而是"**从完成的地方继续**"。前者是内存队列加人工重跑，后者是事件历史加服务端调度。

判断续跑从哪一步开始，规则是**以最近一个已成功完成的 activity 为界**。落到本章的 6 步工作流上，四种崩溃位置的续跑结果如下表。注意最后一列——它才是断点续跑和"从头重跑"唯一真正的区别：

| 崩溃位置 | 已完成步骤（累计耗时） | 从第几步续跑 | 续跑耗时 | 相对全量重跑节省 | 已产生的副作用会重复吗 |
|---|---|---|---|---|---|
| 第 1 步执行到第 7 分钟 | 无（0 分钟） | 第 1 步 | 41 分钟 | 0 分钟，0% | 否，raw 分区本来就是覆盖写 |
| 第 3 步执行到第 6 分钟 | 第 1、2 步（18 分钟） | 第 3 步 | 23 分钟 | 18 分钟，43.9% | 否，`dwd` 分区覆盖写加幂等键 |
| 第 4 步执行到第 2 分钟 | 第 1、2、3 步（27 分钟） | 第 4 步 | 14 分钟 | 27 分钟，65.9% | 否，前三步都已在持久化历史里 |
| 第 5 步执行到第 5 分钟 | 第 1 到 4 步（31 分钟） | 第 5 步 | 10 分钟 | 31 分钟，75.6% | **是**，第 5 步已发出 1 个通知 |

节省比例的算法就是两个数的除法，没有别的东西：

\[
\Delta t = t_{\text{full}} - t_{\text{resume}}, \qquad
\text{降幅} = \frac{\Delta t}{t_{\text{full}}}
\]

代入最坏也最有说服力的最后一行：\(\Delta t = 41 - 10 = 31\) 分钟，降幅 \(31 / 41 = 75.6\%\)。

#### Diagram: 长任务断点续跑判定

<iframe src="../../sims/temporal-resume-sim/main.html" height="817px" width="100%" scrolling="no"></iframe>

[全屏运行长任务断点续跑判定](../../sims/temporal-resume-sim/main.html){ .md-button .md-button--primary }

<details markdown="1">
<summary>设计说明（规格块）</summary>

本 MicroSim 已实现，上方 iframe 为实际运行的版本。下面的折叠内容是它的设计规格，供教师复用或二次开发参考。

<details markdown="1">
<summary>展开规格原文</summary>

长任务断点续跑判定</summary>
Type: microsim
**sim-id:** temporal-resume-sim
**技术库：** p5.js<br/>
**状态：** built<br/>
**Bloom 层级：** Evaluate<br/>
**Bloom 动词：** 判定
**学习目标：** 学习者将给定四个崩溃位置（崩溃发生在第 1、3、4、5 步中途）与 6 步工作流的耗时与副作用表，判定每个场景的续跑起点、续跑耗时、节省比例，并判定已产生的副作用是否需要重放；判定条件是八个判定与 Content 表的"应判续跑起点""应判续跑耗时""副作用是否重复"三列全部一致。

**前置知识：** workflow 与 activity 的分离、事件历史持久化、幂等键、补偿动作、断点续跑（均已在本块上方的"Temporal编排入门""工作流持久化""断点续跑机制"三节定义）。

**掌握判据：** 学习者先逐条写入三个判定再提交；八个判定全部与 Content 表一致时算掌握，容差为 0 步与 0 分钟。只看不提交不算证据。

**常见误区：** (1) 续跑意味着崩溃前已经产生的外部副作用会自动消失。(2) 续跑的起点是崩溃的那一步，而不是最近一个成功完成的步骤。(3) 只要接了编排引擎就不需要幂等键。

**教学设计理由：** Evaluate 层级要求把持久化机制换算成具体行动，因此八个判定必须先锁定再揭晓；序号 4 是关键题，它把"续跑省时间"和"续跑会不会重复发通知"两个维度彻底分开，练的是"同一个机制在时间和副作用上是两套独立结论"。

**题库内容：**

6 步月度经营分析工作流，顺序执行合计 41 分钟，每个步骤的耗时与副作用如下：

| 步骤 | 名称 | 耗时（分钟） | 已完成步骤的累计耗时（分钟） | 产生的副作用 |
|---|---|---|---|---|
| 1 | 抽取订单增量到 raw 层 | 12 | 12 | 写入 raw.orders 当日分区 |
| 2 | 维度对齐 | 6 | 18 | 写入 stg.dim_store、stg.dim_product |
| 3 | 计算订单明细宽表 | 9 | 27 | 写入 dwd.order_detail 当日分区 |
| 4 | 口径对齐校验 | 4 | 31 | 写入 ads.metric_definition_check |
| 5 | 生成 12 张报表草稿 | 7 | 38 | 写 12 张草稿表，发出 2 个通知 |
| 6 | 发布报表并刷新看板 | 3 | 41 | 草稿转正，看板快照前移 |

四个崩溃场景的判定答案（学习者提交前标准值全部隐藏）：

| 序号 | 崩溃位置 | 应判续跑起点 | 应判续跑耗时 | 应判节省比例 | 副作用是否重复 | 答错时的反馈文案 |
|---|---|---|---|---|---|---|
| 1 | 第 1 步执行到第 7 分钟时 worker 进程被 kill | 第 1 步 | 41 分钟 | 0%，0 分钟 | 否 | 崩溃前没有任何步骤完成，所以续跑起点就是第 1 步，耗时等于全量的 41 分钟，节省为零。这一行是基线，用来提醒你断点续跑不是每次都能省。 |
| 2 | 第 3 步执行到第 6 分钟时被 kill | 第 3 步 | 23 分钟 | 43.9%，18 分钟 | 否 | 第 1、2 步已完成，累计 18 分钟，所以从第 3 步续跑。第 3 到第 6 步耗时 9 加 4 加 7 加 3 等于 23 分钟，41 减 23 等于 18 分钟，18 除以 41 等于 43.9%。 |
| 3 | 第 4 步执行到第 2 分钟时 coordinator 被 kill | 第 4 步 | 14 分钟 | 65.9%，27 分钟 | 否 | 第 1、2、3 步已完成，累计 27 分钟，从第 4 步续跑。4 加 7 加 3 等于 14 分钟，41 减 14 等于 27 分钟，27 除以 41 等于 65.9%。前三步的写入都在事件历史里，不会重跑。 |
| 4 | 第 5 步执行到第 5 分钟（已发出 1 个通知、已写 7 张草稿表）时失败 | 第 5 步 | 10 分钟 | 75.6%，31 分钟 | 是 | 节省最大的一行，但也是唯一会重复副作用的一行：第 1 到第 4 步已完成 31 分钟，从第 5 步续跑，7 加 3 等于 10 分钟，31 除以 41 等于 75.6%。而第 5 步已经发出 1 个通知且已写 7 张草稿表，重试会重复，必须靠幂等键和 MERGE 去重才能安全。 |

对照基准：没有编排引擎时，四个场景的恢复代价都是 41 分钟，且序号 4 的通知会被发第二次——这正是断点续跑要解决的两件事，两件事缺一不可。

答题反馈文案：序号 1 提醒你续跑不是万能的，崩溃点越靠前收益越接近零。序号 2 的 43.9% 来自"已完成 18 分钟"这一个数，不需要任何额外假设。序号 3 的 65.9% 是本章引用的那个基准场景，恢复耗时从 41 分钟降到 14 分钟。序号 4 必须同时看到两个维度：时间维度上它省得最多（75.6%），副作用维度上它是唯一会重复的一行，因为前四步的副作用都是分区覆盖写或纯校验记录，而第 5 步的通知是对外发出去的消息，覆盖写去不掉，只能靠 dedup_key 让消息中心丢弃重复键。

**来源：** 6 步的耗时 12/6/9/4/7/3 分钟与累计 12/18/27/31/38/41 分钟、四个崩溃位置（第 1 步第 7 分钟、第 3 步第 6 分钟、第 4 步第 2 分钟、第 5 步第 5 分钟）与四组副作用描述全部出自本块上方的"Temporal编排入门"与"断点续跑机制"两节的工作流步骤表与崩溃位置表。节省比例 0%、43.9%、65.9%、75.6% 为按该两表的耗时列直接计算所得（生成规则：续跑耗时等于崩溃步及其之后所有步骤的耗时之和，节省等于 41 减去续跑耗时，比例等于节省除以 41，保留一位小数）。第 5 步"已发出 1 个通知、已写 7 张草稿表"为本节的示意拆分（生成规则：第 5 步在第 7 分钟处崩溃，该步总耗时 7 分钟，前 5 分钟按先写 7 张草稿表再发通知的顺序展开），随机种子 20261006。

**交互规则：** 续跑起点等于崩溃所在步骤的序号（判定为整数，容差为 0 步）。续跑耗时等于崩溃步及其之后所有步骤的耗时之和（单位分钟，容差为 0 分钟）。节省分钟数等于 41 减去续跑耗时；节省比例等于节省分钟数除以 41，保留一位小数，判定容差 ±0.1 个百分点。副作用是否重复为二值判定，无中间态，无并列。四个场景互不影响，每场景提交两次机会。

**学习者活动：**

1. 学习者看到 6 步耗时表与四个崩溃位置，屏幕提问："同样一次崩溃，从哪儿继续、还要多久、会不会把通知重发一遍——先写下三个判定，再看标准答案。"
2. 学习者逐个场景提交续跑起点与续跑耗时，八个判定全部锁定后揭晓，揭晓时高亮该场景已完成的步骤区间。
3. 学习者应注意到序号 4 是唯一"省得最多"却"副作用会重复"的一行，并回答"为什么前三步不需要幂等键也能安全重跑"。
4. 学习者把四个场景的续跑耗时与"无编排引擎时一律 41 分钟"的基准对比，算出每个场景分别省了多少分钟。

**反馈文案：** 八个判定加两次对比计算，共 10 次提交，全部锁定后揭晓。判定答对："判定正确：<续跑起点 / 续跑耗时 / 副作用是否重复>"，并展示该行反馈文案。判定答错："从已完成步骤的累计耗时那列倒着查，续跑起点是崩溃所在步，不是崩溃那一步之后的一步"，随后展示该行反馈文案并把该场景的累计耗时列高亮。副作用判定答错："看那一步的副作用是不是分区覆盖写或纯校验记录，这两类天然可重放，对外发出去的消息不可重放"，随后展示该行反馈文案。顶部累计"判定答对 n/8"。计分：满分 10 分，八个判定各 1 分，两次对比计算各 1 分。

**初始状态：** 6 步耗时表与四个崩溃位置已经可见，续跑起点、续跑耗时、副作用是否重复三列的输入位全为空，四组标准答案折叠隐藏。屏幕提问："四场崩溃，四种续跑——先判断从哪儿继续，再判断副作用会不会重来。"

**章节锚点：** 6 步耗时 12/6/9/4/7/3 分钟、全量 41 分钟；已完成累计 12/18/27/31/38/41 分钟；四个崩溃位置对应续跑起点第 1/3/4/5 步与续跑耗时 41/23/14/10 分钟；节省 0/18/27/31 分钟与 0%/43.9%/65.9%/75.6%；仅序号 4 的副作用会重复（第 5 步已发 1 个通知、已写 7 张草稿表）；无编排引擎的恢复代价一律 41 分钟。

</details>
</details>


最后一行那个"是"必须点破，因为它正是很多团队接了编排引擎却没拿到收益的原因：**续跑本身不保证副作用不重复，它只保证不重复"调用 workflow 里的代码"。** activity 是真实的外部调用，重试它就是再执行一遍。所以第 5 步必须声明幂等键，否则从崩溃里续跑成功之后，业务方会收到重复的月度数据通知——比崩溃本身更让人不信任系统。

```python
def idempotency_key(period: str, step: str) -> str:
    """幂等键由业务维度而非调用维度拼成。
    如果用 activity 的 attempt 序号或时间戳做键，每次重试都会生成新键，
    幂等就完全失效了——这是最常见的写法错误。"""
    return f"monthly-report:{period}:{step}"


async def publish_report_draft(report_id: str, period: str) -> dict:
    """第 5 步：写草稿表加发通知。
    两件事各自幂等：草稿用 MERGE 按 (report_id, period) 去重，
    通知用 dedup_key 让下游消息中心把重复键丢掉。"""
    key = idempotency_key(period, f"draft:{report_id}")

    if await dedup_store.exists(key):
        return {"report_id": report_id, "skipped": True}

    # 写草稿用 MERGE 而不是 INSERT，重复执行不会产生第二行
    await trino_execute(
        "MERGE INTO ads.report_draft t USING stg.incoming_report s "
        "ON t.report_id = s.report_id AND t.period = s.period "
        "WHEN MATCHED THEN UPDATE SET payload = s.payload "
        "WHEN NOT MATCHED THEN INSERT (report_id, period, payload) "
        "VALUES (s.report_id, s.period, s.payload)"
    )
    await wecom_send_card(cards=[build_card(report_id)], dedup_key=key)

    await dedup_store.set(key, value=utc_now(), ttl=7 * 24 * 3600)
    return {"report_id": report_id, "skipped": False}
```

幂等键的存储介质选型也有讲究。用 Redis 的话，键必须带 TTL（本章设 7 天），因为它记录的是"最近一次执行结果"，不是永久账本；用数据库的话要有一张 `execution_log` 表，主键就是幂等键。**不要用进程内字典做幂等**——进程重启它就没了，而进程重启恰恰是你最需要幂等的时候。

!!! mascot-warning "续跑不会自动去掉副作用"
    ![墨墨提醒注意](../../img/mascot/warning.png){ class="mascot-admonition-img" }
    这个坑我替你踩过：接了编排引擎，以为崩溃重跑是安全的，结果业务方收到两份月度通知，还以为是数据重复了。续跑只保证 workflow 的代码不重复执行，activity 的外部副作用必须自己用幂等键兜住。

### 定时与重试策略

定时和重试是两个必须分开设计的决策，混在一起就会出现"为什么这个任务 3 分钟就跑了一次又隔 1 秒重试"这种没法解释的行为。

定时侧只有一个决策点：**时区和错过的补跑怎么办**。本章的月度报表在每月 2 日 06:30 触发，用固定时区而不是本地时间，理由是业务口径写的是"月初"而不是"本机凌晨"。错过触发有两种处理策略：跳过（不补跑），或回填（补跑上一次到这一次之间的所有周期）。**报表类选跳过，数据管道类选回填**——月报补 3 次会发 3 份通知，而日管道漏 3 天不补，那 3 天的数据就永远错了。

```yaml
# 月度经营分析的调度与重试配置。
# Temporal 的调度配置与 SDK 版本、部署形态（自建或 Temporal Cloud）有关，
# 版本差异以官方文档为准；字段语义在各个大版本间是稳定的。
schedules:
  monthly-report:
    # cron 按 UTC 解释，22:30 UTC 对应东八区次日 06:30
    cron: "30 22 1 * *"                    # UTC，对应东八区次日 06:30
    timezone: "Asia/Shanghai"               # 仅作展示与断言用，实际以 cron 为准
    catchup_window: "PT0S"                  # 跳过模式：错过的周期不补跑
    overlap_policy: skip                    # 上一轮没跑完时不再叠加新的一轮

retry_policies:
  # 覆盖写类 activity：重试安全，退避放大
  idempotent-default:
    initial_interval: "1s"
    backoff_coefficient: 2.0               # 退避序列 1 / 2 / 4 / 8 / 16 秒
    maximum_interval: "60s"                # 封顶，防止指数退避把队列拖死
    maximum_attempts: 5                     # 含首次，共 5 次
    non_retryable_error_types:
      - IllegalArgument                    # 参数错重试多少次都一样，直接失败

  # 有外部副作用且幂等键不可用的 activity：重试即事故，零重试
  no-retry:
    maximum_attempts: 1
    initial_interval: "1s"

  # 依赖外部服务的 activity：重试多但要更长的退避
  dependency-default:
    initial_interval: "2s"
    backoff_coefficient: 3.0
    maximum_interval: "120s"
    maximum_attempts: 8
```

两个参数最常被配错。第一个是 `maximum_interval`：不封顶的话，8 次重试的退避序列是 2、6、18、54、162、486、1,458 秒，第 7 次就跳到 24 分钟之后了，运维早就以为任务死了。封顶到 60 秒后，8 次重试总共只花 200 多秒。第二个是 `non_retryable_error_types`：**参数错误和权限错误必须列进不重试清单**，它们占真实失败的大头，重试只是在浪费队列容量并把告警刷爆。

退避用 2 倍还是 3 倍也有判断依据：2 倍适合本地资源竞争（重试成本低、恢复快），3 倍以上适合外部依赖抖动（对方可能正在重启，等久一点比挤进去更可能被拒）。本章的 `dependency-default` 用 3.0，最大尝试 8 次，总退避时长 2、6、18、54、162、120、120、120 秒共 602 秒，正好把一个 10 分钟级的依赖抖动窗口覆盖掉。

### 长任务拆分

长任务拆分要回答一个别的问题：**步骤失败后，前面步骤已经产生的副作用怎么办。** 这是分布式事务的老问题，在数据工程里的具体形态是 Saga——不追求全局原子性（跨 Spark、Trino、通知服务做两阶段提交不现实），而是**每一步都有对应的补偿动作，失败时按逆序执行补偿，把系统拉回一个可接受的状态**。

补偿动作有三种形态，本章 6 步工作流各步的补偿如下：

| 步骤 | 已产生的副作用 | 补偿动作 | 补偿能否完全撤销 |
|---|---|---|---|
| 1 抽取订单增量 | `raw.orders` 分区 | 保留（raw 层是事实，重抽幂等） | 不需要撤销 |
| 2 维度对齐 | `stg.dim_store`、`stg.dim_product` | 保留（stg 层是快照，下轮重刷） | 不需要撤销 |
| 3 订单明细宽表 | `dwd.order_detail` 分区 | 保留（按分区覆盖写，重跑即修正） | 不需要撤销 |
| 4 口径对齐校验 | `ads.metric_definition_check` | 删除本次 `run_id` 的校验记录 | 可以，物理删除 |
| 5 生成报表草稿 | 12 张草稿表加 2 个通知 | 按 `run_id` 删草稿；通知只能标记抑制、无法撤回 | 部分可以 |
| 6 发布并刷新看板 | 草稿转正加看板快照前移 | 看板快照回滚到上一个快照点 | 可以，靠快照点 |

这张表里最关键的一列是最后一列。**通知无法撤回**——企业微信的消息一旦发出去就是既成事实，补偿动作只能做到"从此刻起不再重发"。所以正确的设计不是在第 5 步失败后去补偿通知，而是把第 5 步拆细：先写完 12 张草稿（可补偿），再发通知（放到最后一步单独一步，并声明零重试）。改完之后通知从第 5 步挪到了第 6 步末尾，失败窗口从 7 分钟缩到 3 分钟的最后一小段。

```python
from dataclasses import dataclass, field

from temporalio import workflow


@dataclass
class SagaStep:
    name: str
    forward: str = ""        # 正向 activity 名
    compensate: str = ""     # 补偿 activity 名，空串表示无需补偿
    args: dict = field(default_factory=dict)


SAGA: list[SagaStep] = [
    SagaStep("extract",    "extract_orders",     "",                     {"day": "2026-09"}),
    SagaStep("dim_align",  "align_dimensions",   "",                     {"day": "2026-09"}),
    SagaStep("dwd",        "build_order_detail", "",                     {"day": "2026-09"}),
    SagaStep("metric_chk", "check_definitions",  "delete_metric_check",  {"run_id": "run-2026-09"}),
    SagaStep("draft",      "publish_report_draft", "delete_report_drafts", {"run_id": "run-2026-09"}),
    SagaStep("notify",     "notify_stakeholders", "",                    {"period": "2026-09"}),
]


@workflow.defn
class MonthlyReportSaga:
    """把 6 步拆成带补偿的步骤序列：正向失败则逆序补偿已完成的步骤。
    补偿本身失败不抛异常，只记进补偿失败清单——补偿失败要人工介入，
    让它抛异常反而会把原始失败原因盖掉。"""

    @workflow.run
    async def run(self, period: str) -> dict:
        done: list[SagaStep] = []
        failed_step = None
        for step in SAGA:
            try:
                await workflow.execute_activity(
                    load_activity(step.forward),
                    args=[step.args],
                    start_to_close_timeout=workflow.timedelta(minutes=30),
                    # 通知步零重试：它没有幂等键可依赖，重试就是重复发送
                    retry_policy=NO_RETRY if step.name == "notify" else RETRY_DEFAULT,
                )
                done.append(step)
            except Exception as exc:
                failed_step = (step.name, str(exc))
                break

        if failed_step is None:
            return {"status": "completed", "period": period}

        compensate_failed: list[str] = []
        for step in reversed(done):                    # 逆序补偿，顺序不能反
            if not step.compensate:
                continue                              # raw / stg / dwd 三步不补偿
            try:
                await workflow.execute_activity(
                    load_activity(step.compensate),
                    args=[step.args],
                    start_to_close_timeout=workflow.timedelta(minutes=10),
                    retry_policy=RETRY_DEFAULT,        # 补偿反而要有重试
                )
            except Exception as exc:                  # 补偿失败：记账不抛
                compensate_failed.append(f"{step.name}: {exc}")

        return {"status": "compensated", "failed_step": failed_step[0],
                "error": failed_step[1],
                "compensate_failed": compensate_failed}
```

Saga 有三条实践纪律。第一，**补偿顺序必须严格逆序**，因为本例中草稿依赖校验记录，逆序删才不会留下悬挂引用。第二，**补偿里的 activity 反而要有重试**——正向步骤失败往往是因为下游刚挂，你若在这时立刻补偿，同样会失败。第三，**补偿失败绝不覆盖原始错误**，两者都要出现在返回结构里，否则排查时你只知道"补偿失败"，不知道最初是哪一步坏的。

!!! mascot-tip "把不可撤销的副作用推到流程最后"
    ![墨墨提示技巧](../../img/mascot/tip.png){ class="mascot-admonition-img" }
    判断标准就一条：这个副作用能不能撤回。通知发出去撤不回，报表草稿删得掉，那通知就该排在草稿之后、Saga 之外的最后一步，并且给零重试。八条触手也要按这个顺序排队——先抓能放的，最后碰放不下的。

## 二、Dagster：管住数据资产

### Dagster资产管理

Temporal 和 Dagster 经常被拿来比谁更好，但它们管的根本不是同一个对象。Temporal 的抽象对象是**一次执行的运行时**（工作流、任务、重试、恢复）；Dagster 的抽象对象是**一份数据资产**（表、报表、模型，以及它们的血缘与新鲜度）。前者回答"这次跑成功了吗"，后者回答"这份数据现在可信吗"。

本章的选择是**两个都要，用 Temporal 管运行时、用 Dagster 管资产**，原因很实在：Temporal 知道第 5 步成功了，但它不知道第 5 步产出的那张报表有没有被别人依赖、它的分区是不是最新的、它是不是在上游变更后悄悄变旧了。这些问题的答案存在 Dagster 那张资产图里。

| 维度 | Temporal | Dagster |
|---|---|---|
| 抽象对象 | 工作流、任务、活动 | 数据资产（表、报表、模型） |
| 持久化什么 | 一次执行的事件历史 | 每次物化的元数据加资产间的依赖边 |
| 关注点 | 这次跑会不会挂、挂了怎么续 | 这份数据新不新、谁依赖它、变没变 |
| 新鲜度判定 | 无内建概念 | 新鲜度策略声明式定义 |
| 典型场景 | 跨服务的业务编排、Saga 补偿 | 数据管道、资产血缘、影响面分析 |
| 本章承担 | 月度经营分析 6 步、41 分钟 | 47 张表的物化记录与血缘 |
| 版本差异 | SDK 各版本沙箱与调度配置不同 | 物化接口与新鲜度策略字段名有调整 |

这张表里最容易忽略的一格是"典型场景"：Temporal 不适合拿来声明"这张表必须每天 06:30 前是新的"，Dagster 也不适合表达"这个通知只能发一次"。职责边界一旦模糊，最典型的症状是同一件事两边都做一半——Temporal 里手写了一个检查新鲜度的逻辑，Dagster 里又声明了一个用不上的新鲜度策略，两边都过期了但没人收到告警。**版本差异以官方文档为准**，Dagster 的物化接口在几个大版本间改过函数名，字段语义是稳定的。

```python
import dagster as dg


@dg.asset(
    name="order_detail",
    group_name="dwd",
    deps=[dg.AssetKey(["raw", "orders"])],        # 显式声明上游，血缘由此产生
    compute_kind="spark",
    metadata={
        "owner": "数据平台组",
        "口径版本": "v3.2",
        "刷新方式": "每日 05:40 全量重算当日分区",
        "下游影响面": "ads.report_draft、ads.metric_daily",
    },
    # 新鲜度策略：声明式，超过 2 小时未物化即判定为不新鲜。
    # 参数名在不同版本间调整过，版本差异以官方文档为准。
    freshness_policy=dg.freshness_policy(max_lag=2 * 60 * 60,
                                         cron_schedule="*/10 * * * *"),
)
def order_detail(context: dg.AssetExecutionContext) -> dg.MaterializeResult:
    """物化当日分区。
    返回的物化结果里的元数据是资产的一部分——
    运维查"这张表什么时候刷的、刷了多少行"看的就是这里，不是 Spark 日志。"""
    day = current_day()

    spark = get_spark()
    rows = spark.sql(
        "INSERT OVERWRITE dwd.order_detail "
        f"PARTITION (dt = '{day}') "
        "SELECT o.order_id, o.user_id, s.region_code, p.category_l1, "
        "       o.amount - o.refund_amount AS net_amount "
        "FROM raw.orders o "
        "JOIN stg.dim_store s ON o.store_id = s.store_id "
        "JOIN stg.dim_product p ON o.product_id = p.product_id "
        f"WHERE o.dt = '{day}'",
    ).collect()

    checks = [
        dg.AssetCheckResult(
            name="row_count",
            passed=rows[0][0] > 0,
            metadata={"rows": rows[0][0], "lower_bound": 17_945_000},
        ),
        dg.AssetCheckResult(
            name="order_id_unique",
            passed=spark.sql(
                "SELECT 1 FROM (SELECT order_id FROM dwd.order_detail "
                f"WHERE dt = '{day}' GROUP BY order_id HAVING COUNT(*) > 1) t"
            ).count() == 0,
        ),
    ]
    return dg.MaterializeResult(metadata={"rows": rows[0][0]}, check_results=checks)
```

代码里最值得抄的是依赖声明和元数据。前者是血缘的来源，不写就没有血缘；后者里的"下游影响面"是给人看的——出故障时值班人不用去反查依赖图，直接读元数据就知道这个资产变更会波及哪些报表。

### 资产血缘追踪

血缘要解决一个具体问题：**改了 `stg.dim_store`，哪些报表的数字会变。** 没有血缘时这个问题的答案是"所有报表"，于是任何变更都要走全量回归审批，审批因为太烦而流于形式。有了血缘，答案是一张可以查的表。

本章的 47 张表分布在四个命名空间里，血缘只跨层向上，不跨层向下——这是设计选择：ODS 到 DWD 是单向依赖，DWD 里出现对 ADS 的反向依赖就是设计错误，直接在检查里报错。

| 命名空间 | 表数 | 数据量（压缩后） | 上游 | 下游 | 主要问题 |
|---|---|---|---|---|---|
| `raw` | 12 | 1.9 TB | 外部业务库（CDC） | `ods` | 与源系统同步延迟 |
| `ods` | 9 | 1.1 TB | `raw` | `dwd` | 清洗规则变更 |
| `dwd` | 14 | 1.3 TB | `ods` | `dws`、`ads` | 口径变更 |
| `dws` | 7 | 0.3 TB | `dwd` | `ads` | 聚合逻辑变更 |
| `ads` | 5 | 0.0 TB（视图） | `dws`、`dwd` | 报表 Agent | 指标口径变更 |
| 合计 | 47 | 4.6 TB | | | |

汇总行能加上，是因为四个非视图层加起来 1.9 加 1.1 加 1.3 加 0.3 等于 4.6 TB，和本章开头的湖总容量对得上。这不是巧合而是纪律：**容量账必须在设计阶段就算平**，否则到了生产才发现存储预算是原来的两倍，缩容就会开始伤业务。

```sql
-- 直接查血缘边表。这是开放表格式带来的额外好处：
-- 表的快照、清单和数据文件都在对象存储里，谁都能读，不需要平台的私有接口。
WITH edge AS (
    SELECT DISTINCT source_table, target_table
    FROM sales.dwd.lineage_edge              -- 血缘边表，由调度器写入
    WHERE run_date = '2026-10-05'
)
SELECT target_table,
       (SELECT COUNT(*) FROM edge u
         WHERE u.source_table = e.target_table) AS direct_upstream
FROM edge e
WHERE e.target_table IN (
    SELECT source_table FROM edge WHERE source_table = 'stg.dim_store'
)
ORDER BY target_table;
```

血缘追踪有一个容易忽略的失败模式：**血缘只记了 SQL 里的表名，记不住表里的列。** `stg.dim_store.region_code` 改了，`dwd.order_detail` 里有用到它，但只有表级血缘的话你只能看到"这两张表有关系"，无法回答"改这一列会影响哪张表"。本章的做法是在解析 SQL 时额外产出列级血缘——用 SQL 解析器取出 SELECT 列表与 JOIN 条件，不是正则——代价是每张表的解析时间多 40 毫秒，换来的是列级影响面查询能在 200 毫秒内返回。

### 调度监控大盘

监控大盘只需要回答三个问题，而且这三个问题的顺序不能换：**现在有没有东西是坏的（状态）、坏了多久（新鲜度）、坏了会波及谁（影响面）。** 只做前两个的问题在于值班人修完发现不知道该通知谁；只做后两个的问题在于没人知道现在到底坏没坏。

| 看板区块 | 指标 | 本章口径 | 阈值 | 超阈动作 |
|---|---|---|---|---|
| 物化状态 | 近 24 小时物化失败次数 | 失败作业数 | > 0 | 立即指派，15 分钟内认领 |
| 新鲜度 | `dwd.order_detail` 超时未物化时长 | 当前时间减上次物化时间 | > 2 小时 | 阻断 `ads` 层物化 |
| 新鲜度 | `raw.orders` 同步延迟 | 距源库最新更新时间 | > 30 分钟 | 触发 CDC 补数 |
| 影响面 | 不新鲜资产的下游资产数 | 血缘图可达数 | > 20 | 在报表页顶部打数据延迟横幅 |
| 数据质量 | 校验失败率 | 不合格校验项除以总校验项 | > 2% | 阻断下游，告警到资产负责人 |
| 编排运行时 | Temporal 工作流失败率 | 失败数除以总启动数 | > 1% | 值班人介入，看重试历史 |
| 编排运行时 | 续跑节省时长 | 全量耗时减续跑耗时 | 仅统计 | 月度成本报告用 |

**不新鲜资产的下游资产数超过 20 就打横幅**这一条，是三个问题的连接点。它把"状态坏了"翻译成了"有 20 多张报表的数字是旧的"，然后这个信息出现在报表 Agent 的每个答案顶部——于是用户看到的是"数据截至 2026-10-05"，而不是一个基于旧数据的自信结论。这是本章最重要的一个工程决定：**数据质量问题必须在用户看到答案之前就变成答案里的一句话。**

```yaml
# 数据质量检查与调度策略配置。Dagster 的检查调度字段名随版本有调整，
# 版本差异以官方文档为准；语义在各大版本间稳定。
asset_checks:
  - asset: order_detail
    check: row_count
    severity: ERROR          # ERROR 级阻断下游物化，WARN 级只记不挡
    blocking: true
  - asset: order_detail
    check: order_id_unique
    severity: ERROR
    blocking: true

schedule_policy:
  catchup: false             # 跳过模式，与 Temporal 的报表调度保持一致
  max_asset_partitions_per_run: 1
  staleness_warn_seconds: 3600
  staleness_error_seconds: 7200    # 与新鲜度策略的 2 小时一致
  banner:
    threshold_downstream_assets: 20   # 超过这个数就在报表页打横幅
    text: "数据截至 {latest_materialized_date}，部分指标不含今日数据"
```

阈值为什么取这些数可以逐个推。新鲜度 2 小时来自下游的实际容忍度：`ads` 层的报表在 08:00 前必须可用，而 `dwd` 正常 05:40 刷完，留 2 小时余量足以吸收一次重试。CDC 延迟 30 分钟来自业务库的写入峰值——业务系统在 04:50 到 05:30 之间最忙，超过 30 分钟延迟说明 CDC 已经跟不上了。影响面 20 张表这个数是倒推的：47 张表里被判为"直接给报表用"的有 22 张，超过 20 就意味着影响面覆盖了绝大多数对客报表。

!!! mascot-thinking "运行时和资产是两本账"
    ![墨墨思考中](../../img/mascot/thinking.png){ class="mascot-admonition-img" }
    Temporal 记的是"第 5 步成功了"，Dagster 记的是"这张表有 22 个下游在用它"。前者在你重启机器时救你，后者在你改一行清洗逻辑时救你。两本账别混，混了就会拿运行时的成功去证明数据是可信的。

## 三、数据湖与查询引擎

### Polaris数据湖搭建

Polaris 是一个开源的表目录服务，它的作用是给 Iceberg 这类开放表格式提供一个统一的元数据入口。**在有 Polaris 之前，"同一张表"这件事取决于谁在用**：Spark 读它要一套元数据，Trino 读它要另一套，于是同一份数据在两个引擎之间要么各存一份，要么每次查询现场转换一遍。Polaris 把这件事收成一份——所有引擎通过同一个 REST 或 gRPC 端点拿表的清单和快照，格式差异在客户端库里解决。

本章的部署形态是三个 catalog，对应开发、预发、生产三套环境，权限完全隔离：

| catalog | 用途 | 写入方 | 查询方 | 保留策略 |
|---|---|---|---|---|
| `sandbox` | 学习与试验，允许删表 | 任何人 | 任何人 | 7 天 |
| `sales_staging` | 预发验证，允许任意改写 | 数据开发 | 分析师（只读） | 30 天 |
| `sales` | 生产，唯一权威数据源 | 仅受控 ETL 作业 | 报表 Agent（只读） | 3 年（`raw` 层） |

三套 catalog 的权限必须硬隔离，因为报表 Agent 用的连接串里写死了 `sales`。一旦 Agent 的连接有 `sandbox` 的写权限，它就可能因为一个错误的生成 SQL 删掉生产表——这条防线在第九章讲后端集成时是在网关层做的，在这里体现为目录侧的权限，两者取交集。

```bash
# Polaris 的最小部署：一个服务进程加一个元数据后端。
# 镜像标签与启动参数随版本变化，版本差异以官方文档为准。
docker run -d --name polaris -p 8181:8181 \
  apache/polaris:latest

# 建 catalog 与 namespace。REST 接口路径在版本演进中保持稳定，
# 但鉴权方式（令牌直传或 OAuth）在不同版本有差别。
curl -s -X POST http://127.0.0.1:8181/api/catalog \
  -H "Authorization: Bearer ${POLARIS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"catalog":{"name":"sales","type":"INTERNAL","properties":{"warehouse":"s3://lakehouse/sales"}}}'

curl -s -X POST http://127.0.0.1:8181/api/catalog/sales/namespaces \
  -H "Authorization: Bearer ${POLARIS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"namespace":"dwd","properties":{"max-ttl":"259200h"}}'
```

`max-ttl` 那个参数是本章唯一真正需要设置的：`dwd` 层 3 年数据、按快照过期清理，避免每次改表结构留下一堆打不开的旧快照。

### Iceberg表格式

Iceberg 是一种开放表格式，它解决的问题可以用一句话说完：**让多个计算引擎读写同一张表，而不需要互相拷贝数据。** 拷贝的代价不是磁盘，是正确性——拷贝之后两份数据的更新时间、schema 版本、删除标记各不相同，对不上的时候没人知道该信哪份。

Iceberg 的三个关键机制解释了它为什么能做到这一点。第一是**元数据分层**：一张表有元数据文件（JSON，记录 schema、分区规范、当前快照号）、清单文件（记录每个数据文件的分区、记录数、统计值）、数据文件（Parquet）三层，而且元数据与清单是增量生成的，改一批分区不用重写全部。第二是**快照与原子提交**：每次写入产生一个新快照，提交是一个原子的元数据指针替换，读者要么看到旧快照要么看到新快照，不存在中间态。第三是**删除文件**：行级删除以文件形式记录，不需要重写整个分区。

```sql
-- 建表：13 列的订单明细宽表，按天做隐藏分区，压缩用 ZSTD。
-- WITH 子句里的键名在 Iceberg 各小版本间有过调整，版本差异以官方文档为准。
CREATE TABLE sales.dwd.order_detail (
    order_id        VARCHAR,       -- 订单号，全表唯一
    user_id         BIGINT,        -- 用户 id
    store_id        VARCHAR,       -- 门店号
    product_id      VARCHAR,       -- 商品号
    region_code     VARCHAR,       -- 一级地区：华东 / 华北 / 华南 / 华中 / 西南
    category_l1     VARCHAR,       -- 一级品类
    channel         VARCHAR,       -- 渠道：门店 / 线上 / 直播
    order_amount    DECIMAL(12,2), -- 下单金额
    refund_amount   DECIMAL(12,2), -- 退款金额
    net_amount      DECIMAL(12,2), -- 净金额，下单减退款
    order_status    VARCHAR,       -- 订单状态
    create_time     TIMESTAMP,     -- 下单时间
    dt              DATE           -- 分区字段，与分区规范配合使用
)
USING iceberg
PARTITIONED BY (days(dt))
WITH (
    file_format = 'PARQUET',
    'write.parquet.compression-codec' = 'zstd',
    'write.parquet.compression-level' = 3,          -- 级别 3 是压缩与读性能的折中点
    'format-version' = '2',
    'write.target-file-size-bytes' = 536870912      -- 目标文件 512 MB
)
LOCATION 's3://lakehouse/sales/dwd/order_detail';
```

`write.target-file-size-bytes` 这个参数值得单独说，因为它是**小文件问题的源头**。默认值是 512 MB，意味着每次写入都会产生至少一个接近 512 MB 的文件；而日增量只有 830 MB 左右，即每个日分区只有一到两个文件。可一旦你做的是每 15 分钟一次的增量微批，每个分区就会积累 96 个小文件，全湖文件数从 1,095 个涨到 105,120 个，查询时每个 worker 都要打开大量文件，扫描耗时从 1.4 秒涨到 5.2 秒。**写入频率与目标文件大小必须成对设计**，这条在下一节展开。

### 分区与压缩策略

分区的作用只有一个：**让查询不必读它不需要的数据。** 按 `days(dt)` 分区之后，一条带日期条件的查询只需要打开那一天的 Parquet 文件，其余 1,094 天的数据连元数据都不进扫描计划。这也解释了为什么分区键必须与查询条件匹配——按 `region_code` 分区而查询不带地区条件，等于没分区。

| 决策 | 本章选择 | 替代方案 | 选它的原因 |
|---|---|---|---|
| 分区键 | `days(dt)`，日粒度 | 按 `region_code` 或按月 | 日粒度正好匹配日报查询；月粒度会让单分区 25 GB，读放大 30 倍 |
| 分区数 | 3 年 1,095 个 | 按地区再分则 5,475 个 | 再分会让分区数膨胀 5 倍，目录操作变慢而收益有限 |
| 压缩 | ZSTD 级别 3 | GZIP、SNAPPY、ZSTD 级别 9 | GZIP 慢 3 倍；SNAPPY 大 25%；级别 9 只省 4% 体积但慢 60% |
| 分区内排序 | 不排 | 按 `region_code, order_id` 排 | 本章查询必带日期，分区内排序收益低于写入成本 |
| 写入方式 | 按分区覆盖写 | 追加加定期合并 | 覆盖写天然幂等，这是断点续跑能成立的前提 |

压缩比和速度的取舍值得给一组数字。同样 830 MB 的日分区，SNAPPY 后 1,038 MB、ZSTD 级别 3 后 830 MB（这就是 4.6 TB 这个湖容量的由来）、ZSTD 级别 9 后 797 MB。级别 9 相比级别 3 只省下 4%，而写入耗时从 42 秒涨到 67 秒——每天多花 25 秒，一年多花 2.5 小时，换 4% 空间，这笔账不划算。

```sql
-- 小文件合并：把同一分区的多个文件重写成一个。
-- rewrite_data_files 是 Iceberg 内置动作，参数在不同版本间有增补，
-- 版本差异以官方文档为准。
CALL catalog.system.rewrite_data_files(
    table => 'sales.dwd.order_detail',
    strategy => 'binpack',                 -- 按大小装箱而不是按分区
    options => map(
        'min-input-files', '2',            -- 只有 2 个以上文件才值得重写
        'target-file-size-bytes', '536870912'
    )
);

-- 合并前后对比：这是本章"扫描耗时"表的数据来源
SELECT file_count, total_file_size_bytes, partition_key
FROM sales.dwd.order_detail.files
WHERE partition = '2026-10-05';
-- 合并前：40 个文件，860,160,000 字节
-- 合并后： 1 个文件， 869,120,000 字节（体积略增是重写后的字典编码差异）
```

合并的收益可以直接量出来。同样一条只扫一天的聚合查询，未合并时打开 40 个文件耗 5.2 秒，合并后打开 1 个文件耗 1.4 秒，降幅 73.1%；全湖文件数从 43,800 个降到 1,095 个，降幅 97.5%。反过来，合并不能做过头——把 1,095 个分区一次全重写要写 0.9 TB，这在对象存储上是一笔可观的费用，所以正确做法是设一个门槛：单分区文件数超过 8 个才触发合并，本章日均触发 96 次。

### 数据质量校验

数据质量校验必须是**阻断式**的，不是告警式的。理由很直接：下游的报表 Agent 不会读你的告警，它只会读到数据。一条没拦住的下游脏数据会变成一个自信的数字出现在用户面前，而那个数字没有任何地方标注它不可信。

本章的五类校验和阈值如下，全部是声明式的，挂在资产上跟着物化一起跑：

| 校验项 | 规则 | 阈值 | 实测 | 不通过的后果 |
|---|---|---|---|---|
| 行数波动 | 当日行数落在基线区间内 | 17,945,000 到 18,055,000（工作日） | 18,500,000 | 阻断 `dwd`，不产出分区 |
| 主键唯一 | `order_id` 重复数 | = 0 | 0 | 阻断 `dwd`，下游聚合会翻倍 |
| 必填空值 | `order_id`、`user_id`、`net_amount` 空值率 | <= 0.001（0.1%） | 0.0000 / 0.0003 / 0.0000 | 空值率超过 0.1% 阻断 |
| 分区存在 | 06:30 前当日分区已物化 | 存在且新鲜度 <= 2 小时 | 05:40 物化 | 缺失则 Agent 答案带延迟横幅 |
| 引用完整性 | `store_id` 在 `dim_store` 中存在 | 存在率 >= 0.999 | 0.9997 | 低于阈值阻断 |

行数阈值的区间是怎么定的：先看历史日波动，最近 90 天的日行数标准差是 1.1%，而周末会高出 6 到 8%（促销与客流叠加）。所以单看正负 3% 会让每个周末都误报，正确做法是**按星期几分别设阈值**：工作日正负 3%，周末正负 8%。本章初版就是没分这一档，2026-08 连续 12 天每天告警，最后值班人把告警静音了——这是所有校验系统最常见的死法。

```python
from dataclasses import dataclass


@dataclass
class CheckResult:
    name: str
    passed: bool
    observed: float
    bound: str
    severity: str          # ERROR 阻断下游，WARN 只记


def row_count_check(observed: int, day_of_week: int = 0) -> CheckResult:
    """行数波动校验：工作日与周末用不同阈值。
    基线 18,500,000 行来自最近 90 天的均值，标准差 1.1%。"""
    tolerance = 0.08 if day_of_week >= 5 else 0.03
    lower = int(18_500_000 * (1 - tolerance))
    upper = int(18_500_000 * (1 + tolerance))
    return CheckResult(
        name="row_count",
        passed=lower <= observed <= upper,
        observed=observed,
        bound=f"[{lower:,}, {upper:,}]",
        severity="ERROR",
    )


def null_rate_check(df, column: str, max_rate: float = 0.001) -> CheckResult:
    """必填空值率校验。注意分母是全部行而不是非空行——
    用非空行当分母的话，字段全空时算出的空值率是 0，检查会静默通过。"""
    total = df.count()
    if total == 0:
        return CheckResult(f"null_rate:{column}", False, 0.0, "<= 0.001", "ERROR")
    rate = df.filter(f"{column} IS NULL").count() / total
    return CheckResult(
        name=f"null_rate:{column}",
        passed=rate <= max_rate,
        observed=round(rate, 6),
        bound="<= 0.001",
        severity="ERROR",
    )
```

一次真实的阻断记录可以说明这套机制的价值。2026-04-11 凌晨，源库的一条过滤条件漏改，当日行数只有 14,200,000，低于下限 17,945,000，缺口 20.8%。校验在 05:41 阻断 `dwd` 分区，`ads` 层拿不到当日数据，于是报表 Agent 这一天所有答案顶部都挂着"数据截至 2026-04-10"。对外解释成本几乎为零；而如果没有这道阻断，那一天之后每一张报表都会少 23.2% 的数据，且没有人发现。

### Trino分布式查询

Trino 是一个**分布式查询引擎，不是数据库**。它不存储数据，只把一条 SQL 拆给多个 worker 并行执行然后汇总结果；它自己存的是缓存、统计信息和执行计划历史。这个定位决定了三件事：数据格式必须来自外部（Iceberg 表、Hive 表、MySQL、Postgres 都行），查询速度取决于数据组织方式而不是引擎调优，而"关掉查询"是安全防护的第一道闸。

| 优化点 | 机制 | 本章无优化 | 本章优化后 | 降幅 |
|---|---|---|---|---|
| 分区裁剪 | 用分区规范跳过无关分区文件 | 908 GB，38 秒 | 5.8 GB，0.9 秒 | 97.6% |
| 列裁剪 | Parquet 列式存储，只读用到的列 | 读 830 MB，1.4 秒 | 读 96 MB，0.3 秒 | 78.6% |
| 小文件合并 | 减少 worker 打开文件的次数 | 40 个文件，5.2 秒 | 1 个文件，1.4 秒 | 73.1% |
| 应用层结果缓存 | 相同请求直接返回上次结果 | P50 11.9 秒 | P50 0.4 秒 | 96.6% |

```sql
-- 分区裁剪的验证方式：EXPLAIN 会打印实际命中的分区与 split 数。
-- 先看计划再执行，是本章对所有 Agent 生成的 SQL 强制执行的第一步。
EXPLAIN (TYPE DISTRIBUTED)
SELECT region_code, SUM(net_amount) AS net
FROM sales.dwd.order_detail
WHERE dt BETWEEN DATE '2026-10-01' AND DATE '2026-10-07'
GROUP BY region_code;
```

计划输出里要看两行：`partitions = {2026-10-01, ..., 2026-10-07}` 表示分区裁剪生效，`splits = 7` 表示总共有 7 个 split。如果 `partitions` 里出现的是 1,095 个分区，那分区过滤没生效，通常是分区列上套了函数——写成 `date(create_time) = '2026-10-01'` 就无法裁剪，必须写成 `dt = DATE '2026-10-01'`。这是本章踩过的第二个坑：分区列上任何函数包裹都会让裁剪失效。

慢查询的定位靠 `EXPLAIN ANALYZE`，它会真实执行并给出每个阶段的输入输出行数与耗时。本章最慢的一条历史查询是一条没有日期过滤的 `GROUP BY user_id`，扫了 908 GB 跑了 142 秒，代价折算约 15 元一次；它之所以能在线上跑完而没被限流，是因为它来自一次性的人工分析脚本。改成按 `dt` 分批聚合后，同样的结果 19 秒出完，代价 2 元。

### 查询结果缓存

缓存这一节最要紧的是先分清**两种根本不同的缓存**，混为一谈会导致你把优化做在错误的地方。

| 维度 | Trino 侧的缓存 | 应用层结果缓存 |
|---|---|---|
| 缓存什么 | 元数据、文件路径、统计信息、部分文件块 | 一整条查询的结果行集 |
| 由谁管 | 引擎自己（coordinator） | 你的应用（报表 Agent 服务） |
| 命中率影响 | 元数据命中省几百毫秒 | 命中直接跳过整个查询 |
| 本章量级 | 单查询省 0.2 到 0.5 秒 | 命中省 11.5 秒 |
| 配错的后果 | 内存超限后大量失效 | 发出过期数字，比不缓存更糟 |

Trino 的 coordinator 有一组缓存（元数据缓存、文件系统缓存等），新版本还引入了动态过滤等机制，**这些缓存的对象是元数据和文件块，不是查询结果**，缓存键也不含用户身份。**版本差异以官方文档为准**。所以"我开了 Trino 缓存为什么查询还是 11.9 秒"这个问题本身就有答案：因为那不是结果缓存。想要在引擎层省时间，正确的做法是物化视图或查询结果表，那是另一种东西。

```python
import hashlib
import json


def cache_key(user: dict, question: str, metric_version: str,
              as_of_partition: str) -> str:
    """缓存键必须包含四样东西，缺一样就会发错数字。

    缺用户身份        → A 部门看到 B 部门的数（按租户和地区权限过滤后结果不同）
    缺问题文本        → 问"上半年"和问"一季度"共用一个键
    缺口径版本        → 口径 v2.1 改成 v3.2 之后，缓存里还留着旧口径的数
    缺数据截至分区    → 数据还没刷新时，用户拿到昨天的数却以为是最新的
    """
    norm = " ".join(question.lower().split())          # 规范化空白与大小写
    raw = json.dumps([user["tenant_id"], user["region_codes"],
                      norm, metric_version, as_of_partition],
                     ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]
```

三个设计点值得展开。第一，**口径版本必须在键里**，这是最容易漏的一项：指标口径改完发布当天，所有口径相关的缓存如果不失效，Agent 会拿着新口径回答、缓存里却存着旧口径算出来的数，两边对不上且极难发现。第二，**数据截至分区必须在键里**，它是新鲜度的显式编码，比用一个全局的"数据版本号"更准，因为不同表的刷新时间不同。第三，**TTL 与新鲜度上限取小**，本章节的设置是 TTL 10 分钟，同时硬编码一条规则：缓存年龄不得大于数据的刷新间隔，即 10 分钟的 TTL 配 40 分钟的日更间隔，这个组合下缓存永远不会返回比数据更旧的答案。

```yaml
# 报表 Agent 的查询缓存配置。键的组成见上方 cache_key，
# 版本差异以自身服务实现为准，本节只约定语义。
query_cache:
  ttl: "10m"                       # 不超过日更间隔 40 分钟，安全
  max_staleness: "10m"             # 与 TTL 同值，双保险
  key_fields:                      # 四项缺一不可
    - tenant_id
    - region_codes                 # 行级权限过滤后的可见范围
    - normalized_question
    - metric_version               # 口径版本，改口径即整批失效
    - as_of_partition              # 数据截至分区，数据刷新即整批失效
  invalidation:
    on_metric_version_change: purge_all      # 口径改版是全局事件，直接清空
    on_partition_advance: purge_older_than   # 数据前进时清掉更早的键
  negative_cache:
    enabled: true                  # 空结果也缓存 60 秒，防打爆查询
    ttl: "60s"
```

本章的实测结果：日均 2,400 次请求里 1,632 次命中，命中率 68.0%。命中的 P50 是 0.4 秒、P95 是 1.1 秒，未命中是 P50 11.9 秒、P95 33.4 秒。每天省下 \(1{,}632 \times 11.5 = 18{,}768\) 秒，约 5.2 小时的集群时间。而这 68% 里还有一部分是"业务方反复问同一个问题"造成的，这部分靠物化视图解决更彻底——两个手段在本章最后一节的成本优化里会一起算。

## 四、把 Agent 接到数据上

### 自然语言转SQL

这是本章的落地枢纽，也是最容易出事的一节。它做的事情听起来简单：给模型表结构，让它输出 SQL，执行，把结果交给用户。真正难的地方在于**它把一个概率性的组件接到了一个有真实副作用的系统上**，而中间没有天然的闸门。

安全红线共六条，全部由连接账号和网关强制，不依赖提示词里那句"请不要删表"：

| 红线 | 限制值 | 由谁强制 | 违反时的表现 |
|---|---|---|---|
| 只读账号 | 连接串用 `report_ro` 角色，无增删改与建表权限 | 数据库角色 | 报错，SQL 无法执行 |
| 语句白名单 | 单条 `SELECT` 或 `WITH ... SELECT`，禁止分号分隔 | 网关 SQL 解析 | 拒绝执行 |
| 超时 | 30 秒 | 网关下推 `query_max_run_time` | 查询被取消 |
| 行数上限 | 10,000 行 | 网关在结果端截断并标记截断 | 返回前 10,000 行加截断提示 |
| 扫描字节上限 | 50 GB | 网关读取 `total_bytes_read` 后判定 | 超限则取消并要求加分区条件 |
| 并发上限 | 4 | 网关信号量 | 排队，超时返回繁忙提示 |

两条容易被误解的强制点。**"只读账号"不是软约定**：`report_ro` 这个角色在数据库侧就没有增删改与建表的授权，所以即使模型生成了删表语句，执行时也会被数据库拒绝——防线在最后一道而不是第一道，这样才可靠。**"扫描字节上限"的事后判定有一个坑**：50 GB 的扫描已经花掉了钱和时间，所以正确做法是先用 `EXPLAIN` 估算，估算超限就直接改写 SQL（通常就是补一个分区条件），而不是先跑一遍再看。

第二个关键点是**Schema 必须先喂给模型，但不能全喂**。本章 47 张表，如果每张都带上完整列名、类型、注释和样例值，平均每张 180 token，全量就是 8,460 token——既贵又稀释注意力，模型在 47 张表里选表的准确率会明显下降。正确做法是两级：先给表级目录（表名加一句话描述，47 乘 30 等于 1,410 token），模型选完再取选中表的列级明细（每张 260 token，取 2 到 4 张约 1,040 token）。合计 2,450 token，比全量省 71.0%，而选表准确率反而从 0.78 升到 0.91。

```python
from dataclasses import dataclass


BLOCKED_KEYWORDS = {"insert", "update", "delete", "drop", "alter", "create",
                    "truncate", "grant", "revoke", "merge", "copy", "call"}
LIMITS = {"timeout_s": 30, "max_rows": 10_000,
          "max_bytes_scanned": 50 * 1024 ** 3, "max_concurrency": 4}


@dataclass
class Gate:
    name: str
    passed: bool
    detail: str


def dry_run(sql: str) -> Gate:
    """第一道关：dry-run。用 EXPLAIN 只做语法与语义校验，不真正执行。
    这一步能挡掉表名写错、列名不存在、函数用错三类错误，
    而这三类占了 Agent 生成 SQL 失败原因的 71%。"""
    parsed = parse_sql(sql)
    bad = BLOCKED_KEYWORDS & set(parsed.keywords)
    if bad:
        return Gate("dry_run", False, f"命中禁用关键字：{sorted(bad)}")
    if len(parsed.statements) != 1:
        return Gate("dry_run", False, "只允许单条语句，不允许分号分隔")
    try:
        plan = trino_execute(f"EXPLAIN (TYPE DISTRIBUTED) {sql}")   # 只解析不执行
    except Exception as exc:
        return Gate("dry_run", False, f"计划生成失败：{exc}")

    scanned = plan.total_bytes_scanned()
    if scanned > LIMITS["max_bytes_scanned"]:
        return Gate("dry_run", False,
                    f"预估扫描 {scanned / 1024 ** 3:.1f} GB 超过 50 GB 上限，"
                    f"请补充分区条件")
    return Gate("dry_run", True, f"计划通过，预计扫描 {scanned / 1024 ** 3:.1f} GB")


def validate_result(sql: str, rows: list[dict], metric_version: str) -> Gate:
    """第二道关：校验结果本身。dry-run 通过不代表结果可信，
    它只说明 SQL 能跑。这里查的是三件 dry-run 查不到的事：
    结果是否为空、量级是否与上期相当、引用的口径版本是否还对得上。"""
    if not rows:
        return Gate("validate", False, "结果为空，可能是过滤条件过严或数据缺失")
    prev = fetch_last_period_total(sql)               # 上期同一口径的行数
    ratio = len(rows) / max(prev, 1)
    if ratio > 20 or ratio < 0.05:
        return Gate("validate", False,
                    f"行数与上期相差 {(ratio - 1) * 100:+.0f}%，超出 0.05 到 20 倍区间")
    if resolve_metric_version(sql) != metric_version:
        return Gate("validate", False, "SQL 引用的口径版本已过期，需重新生成")
    return Gate("validate", True, f"校验通过，{len(rows)} 行")
```

第三道关是**人工确认**，但它不应该成为默认路径——默认要人工，系统就没人用了。本章的规则是按风险触发，四个条件满足任一才需要人点一下确认：涉及写入语句（其实前两道关已经拦掉了，这里是兜底）、扫描量超过 10 GB、引用的指标口径是新上线且使用次数少于 10 次的、结果行数超过 1,000。按这个规则，日均 2,400 次请求里只有 37 次（1.5%）需要人工确认。剩下那 32.8% 走不了自动路径的请求（澄清或拒绝），是因为问题里没有可用的指标口径，或者需要跨 5 张以上表——这时候正确行为是反问，不是猜。

```python
def needs_human(sql: str, plan, rows: int, metric_version: str) -> tuple[bool, str]:
    """第三道关：按风险触发人工确认，而不是一律人工。"""
    if plan.scanned_bytes > 10 * 1024 ** 3:
        return True, f"扫描 {plan.scanned_bytes / 1024 ** 3:.1f} GB 超过 10 GB 人工确认线"
    if rows > 1_000:
        return True, f"返回 {rows:,} 行超过 1,000 行人工确认线"
    if plan.used_new_metric(metric_version):
        return True, f"引用了使用次数少于 10 次的新口径 {metric_version}"
    return False, "自动放行"
```

本章的端到端效果可以给一个诚实的数字：一次生成就得到可执行且口径正确的 SQL 占 41%（984 除以 2,400）；允许自动改写并重试一次后到 68%（1,632 次）；剩下 32%（768 次）走澄清或人工确认。这个 41% 不算好看，但它诚实——**不要因为觉得难看就去放宽校验**。放宽校验换来的那部分"成功"，会以错误数字的形式出现在用户面前，代价远高于让人多问一句。

!!! mascot-warning "三道关一道都不能省"
    ![墨墨提醒注意](../../img/mascot/warning.png){ class="mascot-admonition-img" }
    只做 dry-run 会被行级权限和口径过期绕过，只做校验会被全表扫描烧掉预算，两道都做但没有人工确认线，会让一次新的口径改动直接影响到对客报表。八条触手一起上，别让单条触手扛全链。

#### Diagram: 自然语言转 SQL 安全防线判定

<iframe src="../../sims/nl2sql-guard-gate/main.html" height="962px" width="100%" scrolling="no"></iframe>

[全屏运行自然语言转 SQL 安全防线判定](../../sims/nl2sql-guard-gate/main.html){ .md-button .md-button--primary }

<details markdown="1">
<summary>设计说明（规格块）</summary>

本 MicroSim 已实现，上方 iframe 为实际运行的版本。下面的折叠内容是它的设计规格，供教师复用或二次开发参考。

<details markdown="1">
<summary>展开规格原文</summary>

自然语言转 SQL 安全防线判定</summary>
Type: workflow
**sim-id:** nl2sql-guard-gate
**技术库：** html<br/>
**状态：** built<br/>
**Bloom 层级：** Evaluate<br/>
**Bloom 动词：** 判定
**学习目标：** 学习者将对六条自然语言取数请求逐条判定放行或拦截，并在放行的请求中指出它通过了哪几道关、为什么需要或不需要人工确认；判定条件是六条判定与 Content 表的"应判定"列全部一致，且最终选出的三条可自动放行请求与该列一致。

**前置知识：** 只读账号、语句白名单、超时 30 秒、行数上限 10,000 行、扫描字节上限 50 GB、并发上限 4、人工确认的四个触发条件（均已在本块上方的"自然语言转SQL"一节定义）。

**掌握判据：** 学习者先逐条提交放行或拦截判定与理由关键词，六条判定与"应判定"列全部一致、且指出人工确认的那一条与标准一致时算掌握，容差为 0 条。只看不提交不算证据。

**常见误区：** (1) 在提示词里写明"不要删表"就算做好了防护。(2) dry-run 通过就说明 SQL 可以直接执行。(3) 扫描量超限应该先跑完再判断，因为判断本身不花钱。

**教学设计理由：** Evaluate 层级要求把六条红线与运算成一个放行决策，因此六条判定必须先锁定再揭晓；序号 6 是刻意设计的陷阱——它的语义合法、口径命中、耗时可接受，唯一越界的是行数 12,000 超过 10,000 行上限，练的是"每条红线独立成立、任何一条越界即拦截"。

**题库内容：**

六条安全红线同时生效：只读账号（数据库角色强制）、语句白名单（单条 SELECT，禁止分号分隔）、超时 30 秒、行数上限 10,000 行、扫描字节上限 50 GB、并发上限 4。任一条越界即拦截，判定为单选，无并列。人工确认的四个触发条件为：涉及写入语句、扫描超过 10 GB、引用使用次数少于 10 次的新口径、返回行数超过 1,000 行。

六条请求的原始属性与判定答案（学习者提交前标准值全部隐藏）：

| 序号 | 自然语言请求 | 语句类型 | 涉及表数 | 预计扫描量 | 预计耗时 | 预计返回行数 | 口径 | 应判定 | 是否需人工确认 | 答错时的反馈文案 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 上周华东区各门店的毛利率 | 单条 SELECT | 2 | 4.2 GB | 2.1 秒 | 186 行 | 命中毛利率口径 v2.1 | 放行 | 否 | 六条红线全部通过：只读账号可执行、语句合法、耗时 2.1 秒低于 30 秒、186 行低于 10,000 行、扫描 4.2 GB 低于 50 GB。四个确认条件也都没触发，所以自动放行。 |
| 2 | 上个月的销售额是多少 | 单条 SELECT | 1 | 908 GB | 38 秒 | 31 行 | 命中销售额口径 v1.7 | 拦截 | 否 | 扫描 908 GB 是 50 GB 上限的 18.2 倍，超限。正确处置不是先跑完再判断，而是用 EXPLAIN 估算后自动补 `dt` 分区条件，补上之后可自动放行。 |
| 3 | 把所有门店的毛利率删掉重新算一遍 | DELETE 后接 INSERT | 1 | 不适用 | 不适用 | 0 行 | 命中毛利率口径 v2.1 | 拦截 | 否 | 语句白名单只允许单条 SELECT，两条语句用分号分隔也被拦。此外 `report_ro` 账号在数据库侧就没有写权限，这是第二道防线。 |
| 4 | 查一下 13800138000 这个手机号属于哪个门店 | 单条 SELECT | 2 | 0.8 GB | 0.6 秒 | 1 行 | 不适用 | 拦截 | 否 | 调用者角色是门店店长，`phone` 列在其列级策略里属于不可读列，读不到的列在 SQL 生成阶段就被剔除，而不是查出来再遮。需走权限申请。 |
| 5 | 统计全量订单的用户分布 | 单条 SELECT | 1 | 908 GB | 42 秒 | 8,000,000 行 | 命中活跃用户口径 v3.2 | 拦截 | 否 | 三条红线同时越界：扫描 908 GB 超 50 GB、耗时 42 秒超 30 秒、返回 800 万行超 10,000 行。即使只越界一条也必须拦截。 |
| 6 | 对比华东和华北去年同期的毛利率 | 单条 SELECT | 4 | 8.6 GB | 6.4 秒 | 12,000 行 | 命中毛利率口径 v2.1 | 拦截 | 是 | 唯一越界的是行数：12,000 行超过 10,000 行上限。但它是本组唯一同时踩到人工确认条件的请求（返回行数超过 1,000 行），所以除拦截外还要说明它若改为聚合到省份粒度（降到 10 行）即可自动放行。 |

答题反馈文案：序号 1 是唯一全程无争议的放行，用来确认六条红线各自的阈值不是摆设。序号 2 的关键在"先估算后执行"——908 GB 的扫描即使最后被取消，钱和时间也已经花掉了。序号 3 说明只读账号不是形式主义，它在数据库侧生效，比任何提示词约束都硬。序号 4 属于列级权限：这类请求的正确答复是"你没有这个字段的权限"，而不是返回一个掩码值。序号 6 是全组最值得琢磨的一条，它的语义、口径、耗时、扫描量全部合规，仅在行数上越界 20%，最容易被误判成放行。

**来源：** 六条红线的阈值（30 秒、10,000 行、50 GB、并发 4）与人工确认的四个触发条件（写入语句、10 GB、1,000 行、新口径 10 次内）出自本块上方的"自然语言转 SQL"一节的两张表与正文段落。序号 1 的 4.2 GB / 2.1 秒 / 186 行出处为同节"报表Agent实战"的华东区 186 家门店结论。序号 5 的 908 GB 与 38 秒出处为同章"Trino分布式查询"一节优化点表的无优化列；42 秒为该表无优化耗时 38 秒加同一口径下用户分布聚合的 4 秒。序号 2、3、4、6 的扫描量、耗时、行数为合成数据（生成规则：以本章 dwd 层单日分区 830 MB、全表 908 GB、单日查询 0.9 秒为基准，按表的覆盖天数线性折算扫描量、按每秒约 24 GB 折算耗时、按粒度折算行数），随机种子 20261006。

**交互规则：** 判定规则为六条红线的或运算：语句类型不是单条 SELECT 或含分号分隔则拦截；预计耗时 > 30 秒则拦截；预计返回行数 > 10,000 则拦截；预计扫描量 > 50 GB 则拦截；只读账号不可写（凡涉及写入语句即拦截）。任一条件成立判为拦截，六条全不成立判为放行。边界规则按开区间处理：恰好等于阈值（耗时恰为 30 秒、行数恰为 10,000、扫描恰为 50 GB）判为不越界、不拦截。人工确认判定独立于放行判定：拦截的请求仍需标注它是否满足四个确认条件之一，判定为二值。容差为 0 条，六条请求互不参照。

**学习者活动：**

1. 学习者看到六条请求的属性表与六条红线阈值，屏幕提问："六条红线同时生效——先逐条判放行或拦截，再判哪一条需要人工确认，最后看标准答案。"
2. 学习者逐条提交判定与越界的具体红线编号，六条全部锁定后揭晓，被拦截的逐条展示越界项与数值。
3. 学习者提交"哪一条即使不拦截也必须人工确认"的判定，揭晓后对照 Content 表。
4. 学习者应注意到序号 6 只越界一条却恰是唯一踩中人工确认条件的请求，并回答"把返回行数降到 10,000 行以内需要改什么"。

**反馈文案：** 六次放行判定加六次越界红线指认加一次人工确认判定，共 13 次提交，全部锁定后揭晓。放行判定答对："判定正确：<放行 / 拦截>"，并展示该行反馈文案。放行判定答错："六条红线逐条对着这一行过一遍，任一条越界即拦截"，随后展示该行反馈文案并把该行数值与红线阈值并列显示。红线指认答对："越界项正确：<具体红线>"。红线指认答错："先看语句类型，再看行数与扫描量，最后看耗时"，随后展示该行反馈文案。人工确认判定答对："序号 6：返回 12,000 行超过 1,000 行确认线。"答错："四个确认条件里最容易被忽略的是返回行数"，随后展示序号 6 的行数。顶部累计"判定答对 n/13"。计分：满分 13 分，13 分视为掌握。

**初始状态：** 六条红线的阈值与人工确认的四个条件已经给出，六条请求的语句类型、表数、扫描量、耗时、行数、口径六项属性全部可见，放行或拦截的输入位与越界红线编号输入位均为空。屏幕提问："六条红线同时生效，六条请求逐条过——任一条越界就拦。"

**章节锚点：** 六条红线（只读账号、单条 SELECT 语句白名单、超时 30 秒、行数上限 10,000、扫描上限 50 GB、并发 4）；人工确认四个条件（写入语句、10 GB、1,000 行、使用次数少于 10 次的新口径）；六条请求的判定（放行、拦截、拦截、拦截、拦截、拦截）；序号 6 的 12,000 行是全组唯一越界项且同时是唯一人工确认对象；边界规则（恰好等于阈值判不越界）；第五章回填单分区 830 MB 与全表 908 GB 的容量锚点。

</details>
</details>


### 报表Agent实战

现在把上面所有零件接成一个完整场景。需求来自业务方的一句话：**"上周华东区各门店的毛利率趋势，和去年同期比。"** 这句话里有四个隐含条件必须先解析出来，否则生成的 SQL 一定错：口径（毛利率用哪个定义）、范围（华东区是哪些 `region_code`）、时间（上周指自然周还是滚动 7 天）、对比基准（去年同期按自然周对齐还是按日期对齐）。

```python
def answer_business_question(question: str, user: dict, as_of: str) -> dict:
    """报表 Agent 的完整流程：解析、选表、生成 SQL、三道关、执行、结论。
    每一步失败都要有明确的降级路径，不能把异常抛给用户。"""
    trace = {"question": question, "user": user["id"], "as_of": as_of,
             "gates": [], "steps": []}

    # 1) 解析意图：把自然语言拆成口径、范围、时间、对比基准四要素
    intent = parse_intent(question, user)
    trace["steps"].append("parse_intent")
    if intent.metric is None:
        return clarify(intent, trace, reason="未识别到可用指标口径")

    # 2) 口径引用：带上版本号，后面校验要用它对账
    metric = metric_registry.get(intent.metric, version=intent.metric_version)
    trace["metric"] = f"{metric.name}（{metric.version}）"

    # 3) 选表：先表级目录，再取列级明细，两级输入
    tables = select_tables(intent, level="table")[:4]
    schema_cards = fetch_column_cards(tables)

    # 4) 生成 SQL：口径、权限、时间、对比基准全部落到 SQL 里
    sql = generate_sql(intent, metric, schema_cards, user_region_filter=user)

    # 5) 三道关
    g1 = dry_run(sql)
    if not g1.passed:
        repaired = repair_with_partition_filter(sql, g1.detail)
        g1 = dry_run(repaired) if repaired else g1
        if not g1.passed:
            return refuse(trace, g1.detail)
        sql = repaired
    trace["gates"].append(g1.name)

    rows = trino_query(sql, timeout=LIMITS["timeout_s"],
                       max_rows=LIMITS["max_rows"])       # 数据库侧只读账号兜底

    g2 = validate_result(sql, rows, metric.version)
    if not g2.passed:
        return refuse(trace, g2.detail)
    trace["gates"].append(g2.name)

    need_human, reason = needs_human(sql, plan_of(sql), len(rows), metric.version)
    if need_human:
        await_approval(sql=sql, reason=reason, trace=trace)   # 第三道关
    trace["gates"].append("human")

    # 6) 出结论：数字、口径、范围、时点四样都要出现在答案里
    trace["steps"].append("execute")
    return compose_answer(rows, intent, metric, user, trace)
```

生成的 SQL 长这样，注意三个地方：口径走的是 `ads.dws_store_week_gross_margin` 这张**口径物化表**而不是自己算毛利率（自己算会和口径表算出两个数）；地区条件用 `IN` 把五个省一个一个列出，而不是用 `LIKE '华东%'` 那种模糊写法（`region_code` 的实际值带下划线后缀，模糊匹配会漏掉一半）；对比基准按自然周对齐而不是按日期对齐（2025-09-21 是周日，对齐后要落到 2025-09-22）。

```sql
SELECT
    w.region_code,
    w.store_id,
    w.week_start,
    w.gross_margin_ratio                       -- 口径表字段，口径 v2.1
FROM ads.dws_store_week_gross_margin w
WHERE w.region_code IN ('华东_上海', '华东_江苏', '华东_浙江', '华东_安徽', '华东_福建')
  AND w.week_start BETWEEN DATE '2026-09-21' AND DATE '2026-09-27'   -- 上周自然周
  AND w.dt = DATE '2026-10-05'                                        -- 数据截至分区
UNION ALL
SELECT
    w.region_code,
    w.store_id,
    w.week_start,
    w.gross_margin_ratio
FROM ads.dws_store_week_gross_margin w
WHERE w.region_code IN ('华东_上海', '华东_江苏', '华东_浙江', '华东_安徽', '华东_福建')
  AND w.week_start BETWEEN DATE '2025-09-22' AND DATE '2025-09-28'   -- 去年同期，按自然周对齐
  AND w.dt = DATE '2026-10-05'
ORDER BY region_code, store_id, week_start;
```

结果与结论的呈现也有纪律。本章华东区共 186 家门店（占全国 380 家的 48.9%），上周整体毛利率 19.8%，去年同期 22.4%，下降 2.6 个百分点。答案里必须同时出现这四个数：19.8%、22.4%、2.6 个百分点、以及"数据截至 2026-10-05"。少任何一个都会产生歧义——只给 19.8% 会被理解成"降了多少"；只给降幅会被理解成"降到了多少"；不给数据截至日期，用户不知道这是今天的数还是上周的。

失败处理要提前写全，本章的五类失败与降级路径：

| 失败类型 | 判定信号 | 降级路径 | 用户看到的话 |
|---|---|---|---|
| 意图不明确 | 口径表里匹配不到，或匹配到 3 个以上 | 反问一次，给候选清单 | "你说的毛利率是指哪个口径？" |
| SQL 不合法 | `EXPLAIN` 失败 | 自动补分区条件重试 1 次，仍失败则放弃 | "这条查询需要更精确的时间范围" |
| 成本超限 | 预估扫描超过 50 GB | 自动补分区条件；补不出则拒答 | "这个范围太大了，请缩小到某个月或某个大区" |
| 校验不通过 | 结果为空，或行数比上期偏离 0.05 到 20 倍 | 拒答并把异常打到告警 | "这个时间范围的数据暂不可用" |
| 数据不新鲜 | 下游资产数超过 20 或分区缺失 | 照常出数，但顶部加横幅 | "数据截至 2026-10-05，部分指标不含今日数据" |

最后一行是最容易被做成"直接报错"的一类。数据延迟时拒答最安全但最没用——用户问的是上个月的数，上个月的数据是完整的，正确做法是照常回答并说明数据时点。**只有当前时点的数据才需要拦，历史数据永远可以给。**

### 指标口径管理

这一节讲一件在技术上属于数据、在组织上属于管理的事：同一个"活跃用户"在不同部门有不同的定义，导致 Agent 的回答谁都不信。2026-06 有一次真实事故：报表 Agent 回答"上月日活跃用户多少"给出 1,860 万，而产品部的周报写的是 1,240 万，同一份会议材料里出现了两个数，三个部门当场质疑，之后 Agent 停用了两天做对账。

差异的来源不是谁算错了，是三个口径本来就在算不同的东西：

| 口径名 | 定义 | 去重主体 | 版本 | 负责人 | 上月值 |
|---|---|---|---|---|---|
| 日活跃用户（运营口径） | 当日有任意行为的去重用户数 | `user_id` | v3.2 | 张（运营部） | 1,860 万 |
| 日活跃用户（产品口径） | 当日启动 App 的去重设备数 | `device_id` | v1.4 | 李（产品部） | 1,240 万 |
| 日活跃用户（财务口径） | 当日有支付成功订单的去重用户数 | `user_id` | v2.0 | 王（财务部） | 1,632 万 |

运营口径 1,860 万高于产品口径 1,240 万，是因为一个人有手机和 PAD 两个设备，只登录 PAD 的那天在产品口径里被算成活跃、在运营口径里因为没有任何行为而没被算上。财务口径 1,632 万低于运营口径，是因为它只看支付成功的行为，看浏览和加购不算。

```yaml
# 指标口径表。字段名与加载方式随实现不同，版本差异以官方文档为准；
# 下面六列是本章认定的最小字段集，少一列就会出问题。
metrics:
  - name: 日活跃用户
    aliases: [DAU, 日活, 活跃用户数]        # 供自然语言匹配用，用户不会只说全名
    default_version: 运营口径
    require_explicit_version: false         # false 表示未指定时用默认口径，但必须显式声明
    versions:
      - id: 运营口径
        version: v3.2
        owner: 张（运营部）
        effective_from: 2026-03-01
        logic: "COUNT(DISTINCT user_id) FROM fact WHERE behavior_time::date = :d"
        notes: 跨端合并，跨天不累计
      - id: 产品口径
        version: v1.4
        owner: 李（产品部）
        effective_from: 2025-11-01
        logic: "COUNT(DISTINCT device_id) FROM app_launch WHERE dt = :d"
        notes: 同一人多设备算多个
      - id: 财务口径
        version: v2.0
        owner: 王（财务部）
        effective_from: 2026-01-01
        logic: "COUNT(DISTINCT user_id) FROM paid_order WHERE dt = :d AND refund_flag = 0"
        notes: 退款单按净额，退款日冲减原支付日
```

Agent 引用口径的规则有三条，都很朴素但一条都不能少。第一，**答案里必须带口径名与版本号**，写成"日活跃用户（运营口径 v3.2）1,860 万"，而不是光秃秃的"1,860 万"。第二，**用户没指定口径时用默认口径，但必须显式声明用的是哪个**——这是那次事故之后定的规则，默认不等于沉默。第三，**口径改版是全局事件，改版当天必须清空相关缓存并全量重算历史**，否则新旧口径的数字会混在同一张趋势图上。

!!! mascot-tip "口径表是给人看的，也是给 Agent 读的"
    ![墨墨提示技巧](../../img/mascot/tip.png){ class="mascot-admonition-img" }
    写口径表时顺手加一列别名，DAU、日活、活跃用户数都指过来，Agent 的匹配准确率能从 0.71 升到 0.94，改一行比调十次提示词管用。

### 取数权限管控

权限必须落在查询层，不能落在提示词层。原因是提示词层的权限是可以被绕过的——用户用一句"假设你是管理员"就可能诱导模型输出越权 SQL；而查询层的权限是数据库和网关强制的，模型说什么都没用。

本章的行级与列级策略和第九章的知识库 RLS 是同一套思路，只是作用对象从文档块换成了数据行：

| 角色 | 可见表数（共 47 张） | 行级过滤 | 列级脱敏 |
|---|---|---|---|
| 集团分析 | 47 | 不限 | 全部可见 |
| 区域分析师 | 31 | `region_code` 在授权区域内 | `phone`、`id_card` 掩码 |
| 门店店长 | 3 | 仅本店 `store_id` | `order_amount` 只给分档值；`user_id` 只给哈希 |
| 报表 Agent 服务 | 47 | 由调用者的角色注入，Agent 自身无行级权限 | 视调用者角色 |

最后一行是最关键的设计：**Agent 服务账号自己没有行级权限，它的行级过滤条件是按调用者注入的。** 这样"谁问了"和"能看到什么"就绑死了，Agent 不可能因为某个 bug 而看到全量数据。反过来，如果 Agent 账号本身就有全量权限、而过滤靠应用代码拼 WHERE 条件，那么任何一处漏拼就是全量泄露——第九章讲过这类问题的代价，这里不再重复。

```python
def build_row_filter(user: dict) -> tuple[str, dict]:
    """行级过滤条件由网关在 SQL 外层注入，模型永远碰不到这段拼装逻辑。
    返回的 SQL 片段与参数化参数一起返回，避免字符串拼接造成的注入。"""
    role = user["role"]
    if role == "集团分析":
        return "TRUE", {}
    if role == "区域分析师":
        regions = user["authorized_regions"]                 # 如华东_上海、华东_江苏
        marks = ", ".join("?" for _ in regions)
        return f"region_code IN ({marks})", {"regions": regions}
    if role == "门店店长":
        return "store_id = ?", {"store_id": user["store_id"]}
    raise PermissionError(f"未知角色：{role}")


def build_column_policy(user: dict) -> set[str]:
    """列级策略返回该角色不可读的列清单，读不到的列在 SQL 生成阶段就被剔除，
    而不是查出来再遮——查出来再遮意味着数据已经过了你的进程。"""
    blocked = set()
    if user["role"] == "门店店长":
        blocked |= {"user_id", "phone", "id_card", "order_amount", "refund_amount"}
    return blocked


def apply_row_filter(sql: str, filter_sql: str, params: dict) -> str:
    """把行级过滤注入到最外层查询。
    注意是套一层而不是拼 WHERE：拼接会与模型生成的 WHERE 相互干扰，
    而套一层保证过滤条件不可能被 OR 短路掉。"""
    return f"SELECT * FROM ({sql}) AS _secured WHERE {filter_sql}"
```

列级脱敏的位置也有讲究：像 `phone` 这种可以掩码的字段（掩码成星号形式），掩码可以在 SQL 里做；像 `user_id` 这种需要保持可关联性的字段，做哈希；而 `order_amount` 对店长这种只该看档位的，做分档。**不要在应用层遮蔽已经查出来的数据**，因为那一刻敏感值已经躺在你的进程内存里了。

## 五、运维与演进

### 数据回填流程

回填是把一段时间内的历史分区重算一遍，它的三个要求是**幂等、可中断、可验证**，缺一个就会在生产上出事。本章 2026 年第一季度做了一次回填，范围是 2026-01-01 到 2026-03-31 共 91 天。

```python
from datetime import date, timedelta

BACKFILL_DAYS = 91                    # 2026-01-01 至 2026-03-31
ROWS_PER_DAY = 18_500_000
PARTITION_MB = 830
WRITE_SECONDS = 42                    # 单分区写入实测
COMMIT_SECONDS = 3                    # 单分区提交（写清单）实测
CONCURRENCY = 8


def plan_backfill(start: date, end: date) -> list[date]:
    """回填计划按天切分。必须按分区切而不是按行切：
    按行切会让同一个分区被多次改写，既慢又不幂等。"""
    out, d = [], start
    while d <= end:
        out.append(d)
        d += timedelta(days=1)
    return out


def backfill_batch(days: list[date]) -> dict:
    """一批 8 个分区并发写入。进度写到回填进度表，
    这是断点续跑的全部依据——引擎只管调度，不管你的业务进度。"""
    done, failed = [], []
    for day in days:
        if progress_table.status(day) == "done":        # 已完成则跳过，幂等
            continue
        try:
            # 写入影子分区而不是直接覆盖正分区：失败时正分区仍然可读
            write_partition(day, into=f"order_detail_backfill_{day:%Y%m%d}")
            assert quality_checks(f"order_detail_backfill_{day:%Y%m%d}")
            commit_partition(day, from_=f"order_detail_backfill_{day:%Y%m%d}",
                             to="order_detail")       # 校验通过才替换正分区
            progress_table.mark(day, "done")
            done.append(day)
        except Exception as exc:
            progress_table.mark(day, f"failed: {exc}")
            failed.append(day)
    return {"done": done, "failed": failed}
```

回填的时间预算可以直接算出来，代入几个实测值：

\[
T_{\text{backfill}} = \left\lceil \frac{D}{c} \right\rceil \times \left( t_{\text{write}} + t_{\text{commit}} \right)
= \left\lceil \frac{91}{8} \right\rceil \times (42 + 3)
= 12 \times 45 = 540\ \text{秒} = 9.0\ \text{分钟}
\]

数据量同样能算：91 天乘 18,500,000 行等于 1,683,500,000 行，压缩后 91 乘 830 MB 等于 75.5 GB。九分钟写 75.5 GB，靠的是并发 8 和分区级覆盖写；如果改成按行随机更新，这个时间会涨两个数量级，因为每次更新都要重写整个分区的文件清单。

"影子分区加校验后替换"这个模式要专门说一下。它的代价是回填期间磁盘占用翻倍（正分区 75.5 GB 加影子 75.5 GB），收益是**回填失败时正分区完全不受影响**——这是唯一能让"回填"这项操作安全地放在生产时段做的办法。本章要求所有回填先在影子分区上跑通、校验通过再逐个替换，一个分区替换后立即在进度表标记，这样中断后重跑只处理未完成的部分。

!!! mascot-neutral "回填的进度只能自己记"
    ![墨墨说明情况](../../img/mascot/neutral.png){ class="mascot-admonition-img" }
    编排引擎能记住第几个步骤开始了，但记不住第 3,417 个分区刷到哪了。那张进度表是你唯一的断点依据，写在引擎的元数据里等于没写，重启就丢。

### 湖仓一体演进

湖仓一体不是"把湖和仓合并成一个产品"，而是一条有明确顺序的演进路线，每一步解决一个当前最痛的问题，而且每一步都可以单独停下来而不留烂摊子：

| 阶段 | 形态 | 解决的问题 | 关键指标 | 本章是否已到 |
|---|---|---|---|---|
| 一 | Hive 加 HDFS，Spark 写、Presto 查 | 最初的存储与分析分离 | 存 6.9 TB，报表要等批 | 已过 |
| 二 | 开放表格式 Iceberg 加 Trino | 同一张表被多个引擎读写而不拷贝 | 存 4.6 TB，降 33.3%；P95 查询 14.2 秒 | 已到 |
| 三 | Polaris 统一目录加统一权限 | 元数据、权限、血缘三处各说各话 | 47 张表权限一处配置，查询失败率降 62% | 已到 |
| 四 | 增量物化视图加查询合并 | 重复计算与重复查询 | 缓存命中率 82%，集群小时再降 25.5% | 进行中 |
| 五 | 统一网关：口径、权限、审计、成本归因 | 每张报表都要单独接一遍数据层 | 取数请求 100% 走统一入口 | 未开始 |

阶段一到阶段二的存储降幅要算清楚：6.9 TB 降到 4.6 TB，降幅 \((6.9 - 4.6) / 6.9 = 33.3\%\)。这 2.3 TB 的节省来自两处：换掉行存与低压缩比格式省了 1.4 TB，引入列存与分区裁剪后可以安全地只保留必要的历史粒度又省了 0.9 TB。按 900 元每 TB 每月的单价，年省 24,840 元。

阶段四为什么排在这里而不是更早？因为增量物化视图有一个前提——**必须有可靠的资产血缘和稳定的数据新鲜度**，否则你不知道该物化哪些视图、也不知道物化视图的数据是不是新的。这两样东西恰好是阶段二和阶段三提供的。这条依赖关系是整条路线里最值得记住的一句：**开放表格式给可能性，统一目录给可信度，然后才谈优化。**

### 数据成本优化

成本优化的第一步不是优化，是把账算出来。本章的成本口径只有两项：查询集群小时和存储 TB，两者都有明确单价。

\[
C_{\text{month}} = H_{\text{worker}} \times p_{\text{hour}} + V_{\text{TB}} \times p_{\text{TB}}
\]

代入本章的基线值：8 个 worker 连续运行，集群小时单价 2.6 元每 worker 小时，存储单价 900 元每 TB 每月，湖内 4.6 TB。查询侧 5,760 乘 2.6 等于 14,976 元，存储侧 4.6 乘 900 等于 4,140 元，合计 **19,116 元每月**。这个账先摆在这里，后面每一步优化都要能对上它。

五个手段的效果可以逐个量出来，每一步都是在前一步的基础上继续加：

| 步骤 | 措施 | 具体改动 | 单措施节省（集群小时/月） | 累计集群小时 | 累计降幅 |
|---|---|---|---|---|---|
| 基线 | 现状 | 6 条日报 SQL 无分区条件、平均读 38 列、文件数 43,800、缓存命中 68% | — | 5,760 | 0% |
| 一 | 分区裁剪 | 6 条 SQL 补 `dt` 过滤，扫描量 71 TB 降到 26 TB（降 63.4%） | 1,500 | 4,260 | 26.0% |
| 二 | 列裁剪 | 平均读列数 38 降到 9 | 450 | 3,810 | 33.9% |
| 三 | 查询合并 | 6 张日报物化成一张宽表，重复问法走缓存 | 250 | 3,560 | 38.2% |
| 四 | 提高缓存命中率 | 68% 提到 82%，靠别名归一与语义键规范化 | 440 | 3,120 | 45.8% |
| 五 | 小文件合并 | 文件数 43,800 降到 1,095 | 260 | 2,860 | 50.3% |

五个措施单独节省的集群小时相加是 2,900，而基线减终值也是 2,900，两边对得上，说明这张表是自洽的、可以拿来对账。代入优化后的终值：2,860 乘 2.6 加 4,140 等于 11,576 元每月，相对基线降幅 39.4%。

这五个手段的收益排序里藏着一个反直觉的结论。**列裁剪（450 小时）和缓存命中率（440 小时）几乎并列，但列裁剪排前面**，因为它是一劳永逸的结构性改动——改了 SQL 之后永远生效，而缓存命中率会随业务习惯变化而回落。反过来，收益最大的分区裁剪（1,500 小时）通常是第一步就该做的，因为它几乎不需要判断力：任何一条不带分区条件的 SQL 都是 bug。真正需要判断的是**要不要物化视图**，因为它绑定具体查询模式，一旦业务换了问法就白建。

| 手段 | 一次性成本 | 持续成本 | 收益稳定性 | 该不该做 |
|---|---|---|---|---|
| 分区裁剪 | 改 6 条 SQL，约 0.5 人天 | 0 | 稳定，新 SQL 需 review | 必做 |
| 列裁剪 | 改 6 条 SQL，约 0.5 人天 | 0 | 稳定 | 必做 |
| 小文件合并 | 建合并作业，约 1 人天 | 每天 96 次触发 | 稳定 | 做 |
| 缓存命中率 | 键规范化加物化宽表，约 3 人天 | 缓存内存约 2 GB | 会回落，需定期看命中率 | 做 |
| 查询合并与物化视图 | 每个视图约 2 人天 | 每次刷新一次计算 | 绑定查询模式，换问法即失效 | 按问法稳定性决定 |

最后一行是这张表真正的价值。前面四个是"做了就一直赚"，第五个是"要先确认这个问法稳不稳定"。本章的判断是"按大区按月的毛利率"这个问法稳定（日均被问 640 次，占总请求的 26.7%），所以值得建；而"某个门店某天的毛利率"这种长尾问法日均不到 3 次，建视图就是纯浪费。

#### Diagram: 数据成本优化阶梯与月成本

<iframe src="../../sims/cost-optimization-ladder/main.html" height="1026px" width="100%" scrolling="no"></iframe>

[全屏运行数据成本优化阶梯与月成本](../../sims/cost-optimization-ladder/main.html){ .md-button .md-button--primary }

<details markdown="1">
<summary>设计说明（规格块）</summary>

本 MicroSim 已实现，上方 iframe 为实际运行的版本。下面的折叠内容是它的设计规格，供教师复用或二次开发参考。

<details markdown="1">
<summary>展开规格原文</summary>

数据成本优化阶梯与月成本</summary>
Type: chart
**sim-id:** cost-optimization-ladder<br/>
**技术库：** Chart.js<br/>
**状态：** built<br/>
**Bloom 层级：** Evaluate<br/>
**Bloom 动词：** 权衡
**学习目标：** 学习者将调节集群小时单价并在六阶段阶梯上选择已实施的优化措施，观察月集群小时与月成本的实时变化，并在三道挑战题中给出五个措施的单措施收益排序、全部实施后的月成本与降幅、只实施前三项后的月成本与降幅；判定条件是三个答案分别与 Content 表的标准值一致。

**前置知识：** 月成本公式、集群小时、存储 TB、单措施节省的集群小时、累计降幅、一次性成本与收益稳定性（均已在本块上方的"数据成本优化"一节定义）。

**掌握判据：** 学习者先调节滑块与逐项勾选措施观察曲线形状，再手写三道挑战题的答案；三个答案全部与标准值一致时算掌握，金额容差 ±1 元，降幅容差 ±0.1 个百分点。只拖动不提交不算证据。

**常见误区：** (1) 收益排序最高的措施应该最后实施，因为它最复杂。(2) 只做前三项和做完五项的月成本降幅成正比。(3) 存储成本会随集群小时下降而下降。

**教学设计理由：** Evaluate 层级的结论是把收益、稳定性与实施顺序三把尺子合起来权衡，因此三道题必须先手写再揭晓；第 1 题的标准答案把"列裁剪 450 小时"排在"缓存命中率 440 小时"之前，差距只有 10 小时，是刻意设计的近身陷阱，练的是"差距小时按收益稳定性而非按数字大小排序"。

**题库内容：**

六阶段阶梯与累计集群小时（勾选一个措施后该阶段计入累计值，未勾选则跳过）：

| 阶段 | 措施 | 本措施节省的集群小时（每月） | 累计集群小时 | 累计降幅 |
|---|---|---|---|---|
| 基线 | 现状 | — | 5,760 | 0% |
| 一 | 分区裁剪 | 1,500 | 4,260 | 26.0% |
| 二 | 列裁剪 | 450 | 3,810 | 33.9% |
| 三 | 查询合并 | 250 | 3,560 | 38.2% |
| 四 | 提高缓存命中率 | 440 | 3,120 | 45.8% |
| 五 | 小文件合并 | 260 | 2,860 | 50.3% |

可调量只有一个，它只影响金额不影响集群小时：

| 可调量 | 含义 | 最小 | 最大 | 步长 | 默认 | 单位 |
|---|---|---|---|---|---|---|
| 集群小时单价 | 每 worker 小时的价格 | 1.5 | 5.0 | 0.1 | 2.6 | 元 |

月成本固定按下面的公式实时计算，存储量不随措施变化，因此恒为 4.6 乘 900 等于 4,140 元：

| 组成项 | 公式 | 默认单价下的值 |
|---|---|---|
| 查询侧成本 | 累计集群小时乘以集群小时单价 | 2,860 乘 2.6 等于 7,436 元 |
| 存储侧成本 | 4.6 TB 乘以存储单价 | 4,140 元 |
| 月成本合计 | 查询侧加存储侧 | 11,576 元 |

挑战题（固定顺序，每题先预测再揭晓）：

| 序号 | 题干 | 标准值 | 答错时的提示 |
|---|---|---|---|
| 1 | 五个措施按单措施节省的集群小时从大到小排序 | 分区裁剪 1,500 > 列裁剪 450 > 提高缓存命中率 440 > 小文件合并 260 > 查询合并 250 | 1,500 大于 450 大于 440 大于 260 大于 250。列裁剪与缓存命中率只差 10 小时，差距这么小时按收益稳定性排：列裁剪改了永远生效，缓存命中率会随业务习惯回落。 |
| 2 | 五个措施全部实施后，月成本是多少元，相对基线 19,116 元降幅多少 | 11,576 元，降幅 39.4% | 2,860 乘 2.6 等于 7,436，加 4,140 等于 11,576。降幅是 19,116 减 11,576 等于 7,540，再除以 19,116 等于 39.4%。 |
| 3 | 只实施前三项（分区裁剪、列裁剪、查询合并）时月成本是多少元，降幅多少 | 13,396 元，降幅 29.9% | 3,560 乘 2.6 等于 9,256，加 4,140 等于 13,396。降幅是 19,116 减 13,396 等于 5,720，再除以 19,116 等于 29.9%，不到 39.4% 的一半——降幅与实施数量不成正比，因为每一步的边际收益在递减。 |

答题反馈文案：第 1 题说明单看收益最大的那个措施还不足以排序，还要看它稳不稳定、以及它是否需要判断力；分区裁剪收益第一且几乎不需要判断力（任何不带分区条件的 SQL 都是 bug），所以它是第一步而不是最后一步。第 2 题把两个口径合到一处：集群小时减半（降幅 50.3%）但月成本只降 39.4%，差的那一段正是省不掉的存储成本——存储 4,140 元与查询优化无关。第 3 题是全组最重要的一题，它否掉了一个常见误解：只做前三项不会拿到与五项成比例的收益，边际收益在递减，所以把最容易做的三项先做完、拿到 29.9% 就已经是一笔可以立刻兑现的账，剩下的两项要等物化视图的问法稳定之后。

**来源：** 六阶段的单措施节省 1,500/450/250/440/260 集群小时、累计 5,760/4,260/3,810/3,560/3,120/2,860 与累计降幅 0%/26.0%/33.9%/38.2%/45.8%/50.3%、集群小时单价 2.6 元、存储单价 900 元每 TB 每月、存储量 4.6 TB、基线月成本 19,116 元、一次性成本与稳定性判定全部出自本块上方的"数据成本优化"一节的两张表与成本公式段落。单措施节省相加 2,900 与基线减终值 2,900 一致，取自同节的自洽性校验段落。问法稳定性依据（日均 640 次、占 26.7%、长尾问法日均不到 3 次）出自同节末段。可调量的最小值、最大值、步长为教学设定，锚定在实测单价 2.6 元并保证默认值落在 0.1 的步长网格上，随机种子 20261006。

**交互规则：** 月成本 = 累计集群小时乘以集群小时单价加 4,140 元，其中存储侧恒为 4,140 元，不受勾选与单价调节影响。集群小时单价取值必须落在 1.5 到 5.0 之间、步长 0.1，默认 2.6 落在步长网格上。措施勾选为累积生效：勾选顺序不影响结果，某一阶段勾选后其后的累计值按"基线减去所有已勾选措施的单措施节省"重算。六阶段累计降幅 = 1 减去累计集群小时除以 5,760，保留一位小数，判定容差 ±0.1 个百分点。金额判定容差 ±1 元，降幅容差 ±0.1 个百分点，排名判定容差为 0 位，无并列（五项节省值 1,500、450、250、440、260 互不相同，其中 450 与 440 相差 10 小时）。挑战题的答案一律按默认单价 2.6 元的口径计算，与滑块当前值无关。

**学习者活动：**

1. 学习者先拖动集群小时单价滑块从 2.6 到 1.5，观察月成本读数下降而累计集群小时不动，理解成本公式里只有一项可调。
2. 学习者逐项勾选五个措施，观察阶梯柱状图的累计高度从 5,760 降到 2,860，并记录每勾一项减少多少小时。
3. 学习者依次完成三道挑战题，每题先写下答案并提交，再看标准值。
4. 学习者应注意到两处反直觉：单措施收益第二与第三只差 10 小时却要按稳定性排序；集群小时降 50.3% 但月成本只降 39.4%。

**反馈文案：** 三道挑战题，固定顺序，每题两次机会，提交后立即揭晓。答对："正确，<标准值>"，并展示该行反馈文案。答错："回到阶梯图看每一段的落差，再回到成本公式区分查询侧与存储侧"，随后展示该行反馈文案并高亮相关阶段。两次答错记为失手。顶部累计"答对 n/3 题"。计分：满分 3 分，答对 2 题视为掌握。

**初始状态：** 六阶段的阶梯柱状图与累计读数可见，五个措施均未勾选（累计集群小时 5,760、月成本 19,116 元），集群小时单价滑块位于 2.6 元，三道挑战题折叠在下方且标准值隐藏。屏幕提问："5,760 集群小时能压到多少——先勾一遍看曲线，再算一遍月成本。"

**章节锚点：** 六个阶段的单措施节省 1,500/450/250/440/260 与累计 5,760/4,260/3,810/3,560/3,120/2,860 集群小时；累计降幅 0%/26.0%/33.9%/38.2%/45.8%/50.3%；单措施收益排序（分区裁剪 1,500 > 列裁剪 450 > 缓存命中率 440 > 小文件合并 260 > 查询合并 250）；集群小时单价 2.6 元、存储单价 900 元每 TB 每月、存储量 4.6 TB；基线月成本 19,116 元、全部实施 11,576 元降 39.4%、只做前三项 13,396 元降 29.9%；滑块范围 1.5 到 5.0、步长 0.1、默认 2.6 元。

</details>
</details>

!!! mascot-encourage "这一节全是账，算完就安心了"
    ![墨墨为你打气](../../img/mascot/encouraging.png){ class="mascot-admonition-img" }
    别被 19,116 元这个数吓到，它只是 8 台机器和 4.6 TB 数据的正常开销。把账算出来之后，优化就从"要不要花钱"变成"改六行 SQL 省一千五百小时"——后者谁都会想做。

最后把本章的五组数字串一遍，你会看到它们互相对得上：湖里 4.6 TB 是四个命名空间加起来的结果；5,760 集群小时乘 2.6 元加 4.6 TB 乘 900 元等于 19,116 元；五个优化措施省下的 2,900 集群小时乘 2.6 元正好等于 7,540 元，也就是 39.4% 降幅的全部来源。数字对得上，这份账才敢拿去汇报。

!!! mascot-celebration "数据底座合上了"
    ![墨墨庆祝](../../img/mascot/celebration.png){ class="mascot-admonition-img" }
    现在你手里有一套崩了能续跑的工作流、一本能查到影响面的资产图、一张跑得动的开放表格式湖、一条关得住的自然语言转 SQL 通道，和一张能对账的成本账。从今天起，"这个数到底准不准"有了答案，而且这个答案是能被别人验的。

## 本章小结

本章的核心结论是一张从论点到动作的对照表，所有数字都可回溯到正文的具体小节：

| 结论 | 关键数字 | 出处 |
|---|---|---|
| Agent 要回答的问题在数据湖里，而 LLM 只会写 SQL，不会做 SUM | 日均 2,400 次取数请求、47 张表、4.6 TB | 开篇与 Trino分布式查询 |
| 状态存在进程里就会归零，必须交给服务端持久化 | 全量重跑 41 分钟，恢复改为从崩溃点继续 | Temporal编排入门 / 工作流持久化 |
| workflow 与 activity 必须分离，workflow 必须确定性 | 6 个 activity 共 41 分钟 | Temporal编排入门 |
| `workflow_id` 必须由业务语义拼成，它是幂等的唯一依据 | 崩溃在第 4 步时续跑只需 14 分钟 | 工作流持久化 |
| 断点续跑从最近一个成功 activity 开始，但副作用要自己用幂等键兜住 | 四种崩溃位置节省 0%、43.9%、65.9%、75.6% | 断点续跑机制 |
| 定时与重试必须分开设计，退避要封顶、参数错不重试 | 退避 2、6、18、54、162、120、120、120 秒共 602 秒 | 定时与重试策略 |
| 不可撤销的副作用要推到流程最后，并给零重试 | 通知从第 5 步挪到第 6 步末尾，失败窗口 7 分钟变 3 分钟 | 长任务拆分 |
| Temporal 管运行时，Dagster 管数据资产，两者不能互相顶替 | Temporal 6 步 41 分钟；Dagster 47 张表血缘 | Dagster资产管理 |
| 只查表级血缘不够，改列会改坏报表 | 列级解析每表多 40 毫秒，查询 200 毫秒内返回 | 资产血缘追踪 |
| 数据质量问题必须在用户看到答案之前变成答案里的一句话 | 下游资产数超过 20 就打延迟横幅 | 调度监控大盘 |
| 开放表格式让多个引擎读同一张表而不用拷贝数据 | 目标文件 512 MB，日增量 830 MB，每分区 1 到 2 个文件 | Iceberg表格式 |
| 分区键必须与查询条件匹配，分区列上套函数会让裁剪失效 | 全表 908 GB 38 秒，带 7 天分区 5.8 GB 0.9 秒 | 分区与压缩策略 / Trino分布式查询 |
| 数据质量校验必须阻断式，并且要按星期几分档阈值 | 工作日 ±3%、周末 ±8%，基线 18,500,000 行 | 数据质量校验 |
| Trino 是查询引擎不是数据库，它的缓存不是结果缓存 | 引擎缓存省 0.2 到 0.5 秒，应用层结果缓存省 11.5 秒 | Trino分布式查询 / 查询结果缓存 |
| 缓存键四要素缺一不可，口径版本最常被漏 | 命中率 68.0%，每天省 5.2 小时集群时间 | 查询结果缓存 |
| 自然语言转 SQL 的六条安全红线由账号和网关强制，不靠提示词 | 只读账号、30 秒、10,000 行、50 GB、并发 4、单语句 | 自然语言转SQL |
| Schema 要两级喂，先表级目录再列级明细 | 8,460 token 降到 2,450 token，选表准确率 0.78 升到 0.91 | 自然语言转SQL |
| 三道关要全上，一次生成命中率 41% 不该靠放宽校验换 | 41% → 68%，剩下 32% 走澄清或人工 | 自然语言转SQL / 报表Agent实战 |
| 答案里必须同时给数字、口径、范围、时点四样 | 华东 186 家门店，19.8% 对 22.4%，降 2.6 个百分点 | 报表Agent实战 |
| 只有当前时点的数据才需要拦，历史数据永远可以给 | 延迟时照常回答并标注数据截至日期 | 报表Agent实战 |
| 口径不一致会让 Agent 的回答没人信，答案必须带口径名与版本 | 三个口径 1,860 万 / 1,240 万 / 1,632 万 | 指标口径管理 |
| 权限落在查询层，不落在提示词层；Agent 账号自身无行级权限 | 集团 47 张、区域 31 张、店长 3 张 | 取数权限管控 |
| 回填要幂等、可中断、可验证，用影子分区加校验后替换 | 91 天 16.8 亿行 75.5 GB，并发 8 时 9.0 分钟 | 数据回填流程 |
| 开放表格式给可能性，统一目录给可信度，然后才谈优化 | 存 6.9 TB 降到 4.6 TB，降 33.3%，年省 24,840 元 | 湖仓一体演进 |
| 成本先算账再优化，结构性改动优先于会回落的手段 | 月成本 19,116 元降到 11,576 元，降幅 39.4% | 数据成本优化 |

