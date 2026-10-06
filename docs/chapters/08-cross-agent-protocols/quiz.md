# 测验：跨 Agent 协议互联

检验本章 20 个概念的掌握情况。先作答，再展开答案。

---

#### 1. Agent 身份标识的格式是什么？各段分别用来做什么？

<div class="upper-alpha" markdown>

1. `did:组织:部门:Agent名:版本`，如 `did:acme:claims:channel:v2`；组织段用于跨组织准入判断，部门段用于权限授予与计费归集，版本段用于判断能力卡片要不要重新拉取
2. `服务名:版本`，如 `channel:v2`；服务名用于路由，版本用于滚动更新
3. `组织:Agent名`，如 `acme:channel`；两段足够，权限由调用方本地判断
4. 一个 UUID 就够，结构化标识只影响日志可读性

</div>

??? question "Show Answer"
    The correct answer is **A**。用可解析的结构化标识而不是随手起的别名，是因为下游要干三件事：从标识解析出所属组织决定是否允许跨组织调用、从版本段判断卡片是否要重取、把标识写进日志做全链路归因。缺段的后果很具体：只有服务名，日志里出现两个同名实例时无法归因；只有组织名，同一家不同 Agent 的权限就没法分开授予。

    **Concept Tested:** Agent身份标识

    **See:** [章节首页](../08-cross-agent-protocols/index.md)

---

#### 2. 委托体的"五问"是哪五个？`retryable` 列表在本章是怎么定的？

<div class="upper-alpha" markdown>

1. 谁委托、委托什么、期望交付什么、什么时候要、失败怎么回报；五类错误都可以重试一次
2. 谁委托、委托什么、用什么模型、谁付钱、失败怎么回报
3. 谁委托、委托什么、期望交付什么、什么时候要（`deadline_ms`）、失败怎么回报（`failure_report`）；本章只有 `RATE_LIMITED` 允许重试一次，其余一律上报人工
4. 五问同上，但 `DEADLINE_EXCEEDED` 最该重试，因为用户还在等

</div>

??? question "Show Answer"
    The correct answer is **C**。把"能不能重试"写进契约，而不是让编排侧的模型临场判断——本章理赔链路只有 `RATE_LIMITED` 允许重试一次。选 D 的理由站不住：`DEADLINE_EXCEEDED` 重试等于让用户多等 2 秒，而已经发出去的核保请求会重复扣 1.5 分。少写后两问是最常见的扯皮来源：没有截止时间委托方只能干等，没有失败回报对接方觉得"你已经超时了别怪我"。

    **Concept Tested:** 任务委托协议

    **See:** [章节首页](../08-cross-agent-protocols/index.md)

---

#### 3. 跨框架会话迁移的三种策略是什么？本章的默认是哪一种，数字是多少？

<div class="upper-alpha" markdown>

1. 默认整段复制：上下文 9,800 token，恢复精度完整
2. 默认摘要加尾窗：前 14 轮压成 200 字以内摘要、保留最近 6 轮原文，上下文从 9,800 token 降到 2,100 token、降幅 79%；指针引用只用于同组织且对方有回调凭证的场景
3. 默认指针引用：上下文 200 token，零依赖
4. 三种策略等价，按团队习惯任选

</div>

??? question "Show Answer"
    The correct answer is **B**。指针引用最省，但它引入了反向依赖——原编排器一重启，被引用的会话就没了，所以只用在同组织内、对方有回调凭证的场景。迁移必须带三样东西：`resume_token`、`origin_task_id`、`transferred_context`。少带 `origin_task_id` 是最常见的坑：对面 Agent 不知道这是接手，会当成新任务重新问一遍全部背景，员工看到的是把话又说一遍。

    **Concept Tested:** 会话迁移机制

    **See:** [章节首页](../08-cross-agent-protocols/index.md)

---

#### 4. MCP 与 A2A 的分工关系是什么？在本章这条理赔链路上各管哪一段？

<div class="upper-alpha" markdown>

1. A2A 是 MCP 的升级版，所有 MCP 工具都应改造成 A2A Agent
2. 两者可以互相替代，选一个就够了
3. A2A 向下管工具，MCP 向右管平级 Agent
4. MCP 向下管工具、A2A 向右管同侪，是同一棵调用树上的两个层级；渠道 Agent 用 MCP 调查保单、查条款、写工单三个工具，用 A2A 委托核保、法务合规、财务三个外部 Agent

</div>

??? question "Show Answer"
    The correct answer is **D**。两者不是竞争关系，能力边界就落在 Agent 与工具之间，这条线画准了互联才不会做成一锅粥。选 A 是被"协议更新"这件事带偏了：跨框架或跨组织必须走 A2A，因为对端不会解析你的框架私有对象；但同组织、同一部署内的 Agent 用框架内交接，零网络开销还能共享对象，套一层 A2A 是净增复杂度。

    **Concept Tested:** MCP与A2A互补模型

    **See:** [章节首页](../08-cross-agent-protocols/index.md)

---

#### 5. 能力发现有哪三种实现方式？本章的缓存 TTL 取 300 秒是怎么权衡出来的？

<div class="upper-alpha" markdown>

1. 三种是静态注册、注册中心查询、描述文件抓取；TTL 300 秒是折中——能力变更最坏 5 分钟生效，每次委托省掉约 60 毫秒的一次往返；发现结果必须带版本号入缓存
2. 三种里只有注册中心查询可用，静态注册会导致服务无法升级
3. TTL 应设成 0，保证每次委托都拿到最新卡片
4. TTL 越长越好，设成 24 小时可以省掉全部发现开销

</div>

??? question "Show Answer"
    The correct answer is **A**。三种方式的角色分工是固定的：同组织内的 Agent 走静态注册，跨组织协作方走注册中心，新接入的框架适配走描述文件抓取。选 C 会把 P95 延迟直接打上去——故障排查表里"延迟 P95 从 0.8 秒涨到 2.4 秒"的根因正是缓存过期后每次委托都重拉卡片。选 D 的代价是对方升级能力你还在用旧卡片，失败方式极难排查。

    **Concept Tested:** 能力发现机制

    **See:** [章节首页](../08-cross-agent-protocols/index.md)

---

#### 6. 任务状态同步为什么要求"状态机只许前进"？

<div class="upper-alpha" markdown>

1. 状态事件按到达顺序处理即可，重复事件无害
2. 状态机允许回退，因为对方的实现可能需要修正状态
3. 幂等靠 `(delegator, idempotency_key)` 唯一、重复投递返回首次结果；乱序到达的 `running` 晚于 `completed` 必须丢弃并记审计日志，否则已完成的核保请求会被跑两遍
4. `rejected` 应并入 `failed` 一起统计，这样成功率口径更统一

</div>

??? question "Show Answer"
    The correct answer is **C**。回退与幂等重复是两件不同的事：回退会把终态拉回执行中，触发真实的重执行和重复扣费；幂等重复只是同一条事件再来一次，返回首次结果即可。选 D 的代价是把"对方因限流当场拒收"混进失败统计，成功率会被限流波动带偏。另外 `rejected` 不计入成功率分母本身就是有意的设计。

    **Concept Tested:** 任务状态同步

    **See:** [章节首页](../08-cross-agent-protocols/index.md)

---

#### 7. 联邦评测测出段内成功率 0.95、跨段衔接 0.925、端到端 0.85。`handoff_loss` 是多少？它指向什么改动？

<div class="upper-alpha" markdown>

1. 0.10，指向核保 Agent 自己的规则与模型要重做
2. 0.95 减 0.85 等于 0.10，这 0.10 全是衔接损耗；段内几乎没掉而端到端掉了，说明问题出在衔接，改协议对齐字段比换模型划算
3. 0.05，说明端到端优于段内，评测口径有问题
4. 0.20，说明跨段字段可用率是主要瓶颈

</div>

??? question "Show Answer"
    The correct answer is **B**。联邦评测的真正价值就是把"端到端掉了 0.10"这句抱怨，变成一句可以执行的改动：段内几乎没掉说明各段能力没问题，改协议对齐字段；段内指标自己掉才改那一段。选 A 是把衔接损耗误算到核保 Agent 头上，会让团队去调一个本来没问题的模型。做法是任务集统一出题 40 条、各 Agent 所有者只标注自己那一段，再汇总成端到端指标。

    **Concept Tested:** 联邦评测方法

    **See:** [章节首页](../08-cross-agent-protocols/index.md)

---

#### 8. 一次理赔调用共 9,900 token（编排器 2,100、外部三个 Agent 合计 7,800），按 0.004 元每千 token 折算。计费归属怎么定？

<div class="upper-alpha" markdown>

1. 只定一种方案：委托方全额承担，对外结算和内部预算都用这一张表
2. 各付各的，提供方按 `unit_price_cents` 收固定单价，内部也按单价分摊
3. 平台按 8% 抽佣，其余归各自 Agent，内部照此执行
4. 对外先定委托方全额（渠道部门付 0.0396 元），内部再按调用来源二次分摊到理赔业务线 60%、合规 25%、财务 15%；对外结算与内部预算必须分开谈

</div>

??? question "Show Answer"
    The correct answer is **D**。最容易出事的做法是拿一个方案同时对外谈和对内摊：合同签了"各付各的"，内部却按全额记到编排方头上，月底一算超支谁也说不清是谁付的钱。把两件事拆成两张表分别签字，比事后解释便宜一百倍。选 B 的毛病是与实际用量脱钩——重活干得多但收得一样，提供方没有版本迭代动力。

    **Concept Tested:** 计费归属划分

    **See:** [章节首页](../08-cross-agent-protocols/index.md)

---

#### 9. 把三章拼成一条真实链路时，混合编排的配置该怎么写？

<div class="upper-alpha" markdown>

1. 编排侧 `framework: openai_agents`，自己的工具走 MCP、平级 Agent 走 A2A，框架差异集中在 `adapter` 段；`retry.only_on` 把重试限制在一种错误上、不重试 `DEADLINE_EXCEEDED`；三个 peer 的卡片抓取失败即阻止编排器进入就绪状态
2. 为了统一，Agent 之间全部走 A2A，包括同部署的那几个
3. 把同部署 Agent 的接口包装成 MCP 工具，就不必再上 A2A
4. 每次委托都重新拉取对方能力卡片，保证拿到最新契约

</div>

??? question "Show Answer"
    The correct answer is **A**。两个关键设计：`retry.only_on` 把重试限制在可重试的那一种错误上，`adapter` 字段把框架差异集中在三行里，换掉一个框架只改一处。选 B 违反了协议选型的三个判断条件——同部署、共享内存时上 A2A 是纯增复杂度。选 D 会把 P95 从 0.8 秒推到 2.4 秒，这正是故障排查表里那条"延迟突然翻三倍"的根因。

    **Concept Tested:** 混合编排实战

    **See:** [章节首页](../08-cross-agent-protocols/index.md)

---

#### 10. 交付物被判 `SCHEMA_INVALID`，按"沿链路回放记第一个出错环节"的排查法，第一个出错环节在哪里？该怎么修？

<div class="upper-alpha" markdown>

1. 在委托方，是它把 `schema_version` 传错了
2. 在被委托方，是对方的 Schema 生成有 bug，要让对方修
3. 在两侧之间：一侧升级了 `schema_version` 未通知；修法是卡片带版本，编排侧版本不匹配即降级
4. 在编排器本身，说明升级了编排器没有同步升级适配层

</div>

??? question "Show Answer"
    The correct answer is **C**。四个高频故障各有明确根因，不能按表象改：`SCHEMA_INVALID` 属于两侧之间的契约漂移，卡片带 `schema_version`、编排侧不匹配即降级；重复扣费的根因在委托方没带 `idempotency_key`；"委托一直 200 但没有状态推进"的根因是被委托方事件推送被中间层缓冲。选 B 找错了环节，等于把一次契约问题推给了对端开发。

    **Concept Tested:** 互联故障排查

    **See:** [章节首页](../08-cross-agent-protocols/index.md)

---