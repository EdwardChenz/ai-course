# 测验：开发基础与工程规范

检验本章 24 个概念的掌握情况。先作答，再展开答案。

---

#### 1. 本书统一推荐用哪套工具来隔离项目依赖的虚拟环境？

<div class="upper-alpha" markdown>

1. `venv` + `pip`：标准库自带，生产部署零额外依赖
2. `conda`：科学计算的二进制依赖省心，本地数据分析首选
3. `uv`：解析安装快一个数量级，任何项目都该默认使用
4. `poetry`：依赖与锁文件一把抓，CI 里比 pip 更稳定

</div>

??? question "Show Answer"
    The correct answer is **A**. 本书统一用 `venv`，理由只有一条：它在标准库里、零额外依赖，CI 镜像里一定有，线上部署不会因为装不上工具而卡住。conda 的代价是体积大、解算慢，适合本地数据分析；uv 虽然快一个数量级，但项目较年轻、部分冷门包支持滞后，除非你要加速，否则用 `uv pip` 平替 `pip` 就够，不需要换掉整个方案。

    **Concept Tested:** Python虚拟环境管理

    **See:** [章节首页](../01-dev-foundations/index.md)

---

#### 2. 关于容器中的密钥注入，下列做法哪一种是正确的？

<div class="upper-alpha" markdown>

1. 在 Dockerfile 里写 `ENV API_KEY=...`，这样镜像自带配置，部署时不用再传
2. 把密钥写进 `docker-compose.yml` 并提交到 git，方便团队共享同一份配置
3. 密钥只在运行时用 `docker run -e` 或 compose 的 `env_file` 注入，仓库里只留 `.env.example`
4. 把密钥固定打在基础镜像里，靠 `latest` 标签统一维护，比每次部署注入更可靠

</div>

??? question "Show Answer"
    The correct answer is **C**. 核心纪律是区分构建时和运行时：密钥一旦写进 Dockerfile 的 `ENV`，镜像只要泄露就等于密钥泄露，正确做法是运行时注入。仓库里只保留 `.env.example` 写字段名不写值，且 `.env` 必须进 `.gitignore`。选 B 的后果最严重——密钥进了 git 历史就只能轮换，删提交没有用。

    **Concept Tested:** Docker环境变量配置

    **See:** [章节首页](../01-dev-foundations/index.md)

---

#### 3. SSE 流式响应中，客户端靠什么标志判断这一轮流已经结束？

<div class="upper-alpha" markdown>

1. 服务端把 `Content-Length` 响应头设成 0
2. 服务端最后发一帧 `data: [DONE]`，并用空行给每一帧分界
3. 客户端读满一个固定的 8192 字节缓冲区就自动收尾
4. 服务端主动断开 TCP 连接，并返回 499 状态码

</div>

??? question "Show Answer"
    The correct answer is **B**。SSE 每行以 `data:` 开头、以空行分帧，结束帧固定是 `data: [DONE]`，客户端拼到它就收尾。漏发这一帧是最常见的联调故障：客户端不知道流已经结束，会一直转圈等到超时。另外超过 30 秒没有任何输出时要先发注释行心跳（如 `:ping`），否则网关或浏览器会把空闲连接掐掉。

    **Concept Tested:** HTTP流式传输

    **See:** [章节首页](../01-dev-foundations/index.md)

---

#### 4. `/healthz` 与 `/readyz` 这两个探针端点的分工是什么？

<div class="upper-alpha" markdown>

1. `/healthz` 跑全量业务回归，`/readyz` 只检查进程是否存活
2. 两者完全等价，编排器随机挑一个探测即可
3. `/healthz` 供人工点开排查，`/readyz` 供外部监控系统调用
4. `/healthz` 做轻量自检回答"能不能接流量"，`/readyz` 做依赖较重的就绪检查

</div>

??? question "Show Answer"
    The correct answer is **D**。健康检查回答的是"我能不能接流量"，不是"我的业务对不对"，所以 `/healthz` 只做进程存活、关键依赖连得上这类轻量自检，重检查放在 `/readyz`。上了 K8s 之后要拆成两个探针：`livenessProbe` 打 `/healthz`、`readinessProbe` 打 `/readyz`。把全量测试塞进健康检查是常见错误，会让一次偶发失败直接把实例重启掉。

    **Concept Tested:** 服务健康检查

    **See:** [章节首页](../01-dev-foundations/index.md)

---

#### 5. 为什么说 `async def` 本身并不带来并发？

<div class="upper-alpha" markdown>

1. `async def` 只是声明函数内部存在等待动作，真正把控制权交还事件循环的是 `await` 表达式
2. `async def` 会自动为函数体开启一条新线程，事件循环只负责调度这些线程
3. `async def` 内部的所有阻塞调用都会被框架自动优化成非阻塞，所以并发是免费的
4. `async def` 与普通函数执行速度相同，只是把异常包装得更漂亮

</div>

??? question "Show Answer"
    The correct answer is **A**。心智模型是"单窗口政务大厅"：窗口只有一个（单线程），办事员在你等叫号时先接待下一个人——让出 CPU 的是 `await`，不是 `async def`。反过来，凡是"算"出来的慢（大矩阵、embedding、视频编码）都不归事件循环管，那要上 `ProcessPoolExecutor` 绕开 GIL。另有一条自查铁律：被 `await` 的东西必须是协程或 Future，普通函数前面加 `await` 会直接报错。

    **Concept Tested:** Python异步编程基础

    **See:** [章节首页](../01-dev-foundations/index.md)

---

#### 6. 为什么聊天产品清一色用流式输出，而后台批量任务可以用非流式？

<div class="upper-alpha" markdown>

1. 流式能减少本次请求消耗的 token 总量
2. 流式输出的答案准确率比非流式更高
3. 流式的首字延迟只取决于第一个 token 的生成时间，非流式则要等全文生成完
4. 非流式接口无法处理长度超过一千 tokens 的请求

</div>

??? question "Show Answer"
    The correct answer is **C**。算一笔账就明白：首 token 0.6 秒、全文 2000 tokens 需要 20 秒时，非流式用户干等 20 秒才看到第一个字，流式用户 0.6 秒就能开始阅读。回答越长，差距越大，这就是流式成为聊天刚需的原因。而批量任务没有人在等首字，换成非流式反而少一层流式解析的复杂度，选型依据是场景而不是习惯。

    **Concept Tested:** FastAPI流式响应

    **See:** [章节首页](../01-dev-foundations/index.md)

---

#### 7. 指数退避的总等待时间反而比固定间隔长，为什么生产上仍然要用它？

<div class="upper-alpha" markdown>

1. 指数退避的总等待时间更短，能让用户更快拿到结果
2. 它的目的是给下游留出恢复窗口，用更长的等待换取服务不被二次打爆
3. 固定间隔无法通过任何形式的测试，只有指数退避能通过上线验收
4. 指数退避能把重试成功率提高到接近百分之百

</div>

??? question "Show Answer"
    The correct answer is **B**。固定间隔每次等 2 秒，n 次重试总等待 2n 秒；指数退避是 2×(2ⁿ−1) 秒，n=3 时就是 14 秒对 6 秒，看起来用户等得更久。但指数退避保护的是下游服务的恢复时间：n=5 时它让用户等一分钟，所以真正的结论是"重试必须配熔断，而不是加次数"。选 A 是典型的只算用户体验、不算系统存活的误判。

    **Concept Tested:** 错误重试与超时

    **See:** [章节首页](../01-dev-foundations/index.md)

---

#### 8. 封装模型 client 时为什么把 `max_retries` 设为 0？

<div class="upper-alpha" markdown>

1. 因为该参数一旦不为零，SDK 就会拒绝发送请求
2. 因为开启 SDK 重试会显著增加依赖体积和镜像体积
3. 因为 SDK 的重试配置不支持与超时参数组合使用
4. 因为 SDK 自带的重试语义不透明，生产重试要集中到自己的退避器里统一管

</div>

??? question "Show Answer"
    The correct answer is **D**。把重试收进自己的退避器，才能把指数退避、±20% 抖动、幂等键、熔断器四件事配成一套；SDK 内部的重试既看不到也关不干净，超时又得单独分层设置（连接 3 秒、读取 60 秒）。顺带记住封装的另一个目的：`base_url`、`api_key`、`timeout` 全部从环境变量读，切网关或换本地模型时只改一处。

    **Concept Tested:** 模型API调用封装

    **See:** [章节首页](../01-dev-foundations/index.md)

---

#### 9. 一次请求的输入是 1500 个中文字符，模型输出 800 tokens，按本章的教学估算公式，这次请求的费用是多少？

<div class="upper-alpha" markdown>

1. 0.0100 元
2. 0.0136 元
3. 0.0176 元
4. 0.0336 元

</div>

??? question "Show Answer"
    The correct answer is **B**。先算输入 tokens：ceil(1500 ÷ 1.5) = 1000。再按示意价计费：输入 1 × 0.004 元 + 输出 0.8 × 0.012 元 = 0.004 + 0.0096 = 0.0136 元。常见误区是只算输入不算输出——输出单价是输入的三倍，长回答才是真正的成本大头，所以每次请求前都要先把 token 账算出来。

    **Concept Tested:** Token与上下文窗口

    **See:** [章节首页](../01-dev-foundations/index.md)

---

#### 10. 服务已经改成 `StreamingResponse`，SSE 帧也能抓全，但用户反馈"点了发送要等十几秒才看到第一个字"，最可能的原因是什么？

<div class="upper-alpha" markdown>

1. 上游 Nginx 开启了 `proxy_buffering`，数据被攒够缓冲才下发给浏览器
2. 换用的模型本身首 token 变慢了
3. 客户端在异步函数里用了阻塞式的 `iter_lines`
4. 请求里的 `max_tokens` 设得太小，模型没凑够长度就结束了

</div>

??? question "Show Answer"
    The correct answer is **A**。排查顺序应该从"链路哪一段吃掉了流"入手：代理缓冲是流式名存实亡的头号原因，解法是加 `X-Accel-Buffering: no` 或关掉 `proxy_buffering`。先确认首帧是否在服务端及时产生，再逐跳看转发链路。选 B 会白白换模型——换完首字延迟不变，因为瓶颈根本不在模型侧。

    **Concept Tested:** HTTP流式传输

    **See:** [章节首页](../01-dev-foundations/index.md)

---