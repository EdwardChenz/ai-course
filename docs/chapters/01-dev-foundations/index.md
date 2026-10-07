---
title: 开发基础与工程规范
description: Python 异步、FastAPI 服务、容器协作与模型调用基本功
generated_by: claude skill chapter-content-generator
date: 2026-10-06 00:40:00
version: 1.11
---

# 开发基础与工程规范

## 本章概要

本章夯实 AI 应用的工程地基：Python 异步、FastAPI 服务、Linux 排查、Docker 与 Git 协作，以及模型调用基本功，为全书提供零依赖起点。

学完本章，读者将掌握上述主题，并能将其用于后续章节的综合项目。

## 本章覆盖概念

本章覆盖学习图中的以下 24 个概念：

| 概念 | 重要度（CIS） |
|---------|-----------------------|
| Python虚拟环境管理 | 19 |
| Python异步编程基础 | 97 |
| FastAPI路由与校验 | 4 |
| FastAPI流式响应 | 76 |
| Linux日志排查 | 70 |
| Shell脚本自动化 | 94 |
| Docker镜像构建 | 8 |
| Docker环境变量配置 | 46 |
| Docker卷与网络 | 71 |
| Git分支协作流程 | 2 |
| 提示词工程基础 | 31 |
| 模型API调用封装 | 58 |
| Token与上下文窗口 | 20 |
| 结构化输出解析 | 51 |
| 函数调用基础 | 29 |
| 错误重试与超时 | 78 |
| 日志与配置管理 | 3 |
| 服务健康检查 | 68 |
| 环境变量安全管理 | 70 |
| 依赖锁定与复现 | 29 |
| HTTP流式传输 | 33 |
| JSON Schema校验 | 73 |
| 后端分页与缓存 | 70 |
| 本地开发联调 | 2 |

## 前置知识

本章只需要[课程描述](../../course-description.md)中列出的前置知识。

---

!!! mascot-welcome "墨墨来报到！"
    ![墨墨挥手欢迎](../../img/mascot/welcome.png){ class="mascot-admonition-img" }
    大家好，我是墨墨，一只写代码的章鱼，热情靠谱，满嘴工程师黑话。在这本书里，我只干六件事：

    1. **欢迎**——开篇告诉你学完这一章能造出什么。
    2. **点破**——关键处帮你建立心智模型。
    3. **支招**——顺手塞一条省时的捷径。
    4. **排雷**——提前喊住你，别踩我踩过的坑。
    5. **打气**——难啃的地方陪你扛过去。
    6. **庆祝**——通关时陪你复盘战果。

    如果我没在干这六件事中的一件，那我就不该出现在这章里。八条触手，一起开干！

本章是全书的地基。后面所有章节默认你已经会：用虚拟环境隔离依赖、看懂异步代码、用 FastAPI 暴露接口、用 Docker 把服务跑起来、调用模型 API 并处理流式输出。这些内容不难，但缺一块，后面调试时会十倍奉还。本章按"环境 → 服务 → 排障 → 容器 → 调模型 → 保可靠"的顺序讲，每节都给出能直接跑的代码。

## 一、Python 工程环境

### Python虚拟环境管理

虚拟环境是把项目依赖隔离开的目录。不同项目要不同版本的同一个库时，虚拟环境让它们互不干扰，这是多人协作和线上部署的前提。

标准做法只用标准库的 `venv`，不需要第三方工具：

```bash
python -m venv .venv
source .venv/bin/activate      # Windows 用 .venv\Scripts\activate
pip install fastapi uvicorn openai
pip freeze > requirements.txt
```

!!! mascot-tip "墨墨的小抄"
    ![墨墨提示技巧](../../img/mascot/tip.png){ class="mascot-admonition-img" }
    建完 venv 第一件事就是把 `.venv/` 写进 `.gitignore`，第二件事是 `pip freeze` 留档。环境出问题时删了 `.venv` 重建，别在里面修修补补。

虚拟环境工具有三家，选型只看一行结论：本书统一用 `venv`，因为它在标准库里、零额外依赖，除非你有明确理由：

| 工具 | 优势 | 代价 | 适合 |
|---|---|---|---|
| `venv` + `pip` | 标准库自带，CI 镜像里一定有 | 装包速度一般 | 本书默认，生产部署 |
| `conda` | 科学计算包（二进制依赖）省心 | 体积大、解算慢 | 本地做数据分析 |
| `uv` | 解析安装快一个数量级 | 年轻，部分冷门包支持滞后 | 想加速可用 `uv pip` 平替 `pip` |

### 依赖锁定与复现

`requirements.txt` 记录依赖，但 `pip freeze` 记的是当前环境实际装的版本，时间久了会出现"我机器上能跑"的经典问题。可靠的做法是区分直接依赖和锁定文件：手写 `requirements.in` 只声明直接依赖，用 `pip-tools` 生成带哈希的锁定文件，部署时用 `--require-hashes` 安装：

```bash
echo "fastapi>=0.110" > requirements.in
pip-compile --generate-hashes requirements.in -o requirements.lock
pip install --require-hashes -r requirements.lock
```

锁文件要提交进 git，它就是环境的"资产负债表"。配 Docker 时先 `COPY requirements.lock` 再装包（见第四节），依赖没变时构建直接命中缓存。复现环境的检查清单只有三条：Python 小版本一致、锁定文件一致、安装命令一致。

### Python异步编程基础

异步是本章最重要的概念，后面讲流式响应、多 Agent 并发时处处用到。先建立正确的心智模型：`async` 函数本身不执行并发，它只是声明"我里面有等待动作"；真正让出 CPU 的是 `await` expression。事件循环像一个大堂经理，手里一叠单子，谁在等水开（IO）就先去办别人的事，水开了再回来。

下面这段代码是全书并发的最小模板，读懂它再往下走：

```python
import asyncio

async def fetch_one(client, url):
    # await 把控制权交还事件循环：等网络时去干别的
    resp = await client.get(url, timeout=10)
    return resp.status_code

async def main(urls):
    # gather 把多个协程排进同一事件循环，总体耗时约等于最慢的一个
    return await asyncio.gather(*(fetch_one(u) for u in urls))
```

裸奔的并发等于自杀：几百个请求同时打向模型网关，触发限流后集体重试，雪崩就是这么来的。生产代码永远加信号量封顶，后面章节批量调模型全靠这一行：

```python
SEM = asyncio.Semaphore(5)  # 最多 5 路并发，保护下游不被打爆

async def fetch_bounded(client, url):
    async with SEM:
        return await fetch_one(client, url)
```

什么时候用线程、什么时候用异步，记住这张分工表，选错的代价是"改了没效果"：

| 场景 | 正确工具 | 原因 |
|---|---|---|
| 等网络、等模型返回 | `asyncio` | 瓶颈在等待，单线程事件循环足够 |
| 调本地大模型、跑 embedding | 多进程（`ProcessPoolExecutor`） | 瓶颈在计算，要绕开 GIL |
| 读写本地小文件、调 C 扩展 | 同步直写 | 开销小于调度成本，别过度设计 |

!!! mascot-thinking "关键心智模型"
    ![墨墨思考中](../../img/mascot/thinking.png){ class="mascot-admonition-img" }
    把事件循环想成单窗口的政务大厅：窗口只有一个（单线程），但办事员会在你等叫号时先接待下一个人。凡是"等"出来的并发都归它管，凡是"算"出来的慢（大矩阵、视频编码）都不归它管，后者要上多进程。

异步代码的调试也有固定动作：先用 `asyncio.run(main(...))` 跑最小复现，确认是逻辑错还是并发错；怀疑死锁时，把 `gather` 换成逐个 `await`，看哪一个挂住不动。大部分"异步 bug"其实是普通 bug，只是报错被事件循环包了一层。

!!! mascot-encourage "异步确实绕"
    ![墨墨为你打气](../../img/mascot/encouraging.png){ class="mascot-admonition-img" }
    第一次觉得 `async/await` 别扭太正常了，大部分人都要写坏两三个死锁才开窍。记住一条就能自查：凡是 `await` 的东西，必须是协程或 Future，普通函数前面加 `await` 会直接报错。

## 二、FastAPI 服务

### FastAPI路由与校验

路由是 URL 到函数的映射，FastAPI 用装饰器声明。它的杀手功能是声明式校验：用 Pydantic 模型描述请求体，框架在入口处自动校验并返回 422，不用手写 `if`。下面的聊天接口定义了全书统一的请求形状，后面章节会反复复用它：

```python
from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI()

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    session_id: str
    stream: bool = True

@app.post("/chat")
async def chat(req: ChatRequest):
    ...
```

校验失败时 FastAPI 自动返回 422 和详细的字段级错误，客户端能直接定位到是哪个字段；业务异常则用 `HTTPException` 带状态码抛出，不要 `return {"error": ...}` 混在 200 里——监控和网关都只认状态码：

```python
from fastapi import HTTPException

if not session_exists(req.session_id):
    raise HTTPException(status_code=404, detail="session not found")
```

### FastAPI流式响应与 HTTP流式传输

流式响应和 HTTP 流式传输是一体两面：前者是服务端写法，后者是传输机制。核心事实是：HTTP 响应体可以分多次写，客户端每收到一块就能先渲染，用户感知到的首字延迟（TTFT）从"等全文生成完"变成"等第一个 token 生成完"。

服务端用 `StreamingResponse` 逐块 yield，传输层用分块传输编码（chunked transfer encoding），两者配合。下面的 SSE（Server-Sent Events）是 AI 聊天最常用的流格式：每行以 `data:` 开头，以空行分帧，最后发一个 `[DONE]` 告诉客户端结束：

```python
from fastapi.responses import StreamingResponse

async def token_stream(prompt: str):
    # 假设 call_model_chunk 每次返回一个增量文本块
    async for chunk in call_model_chunk(prompt):
        yield f"data: {chunk}\n\n"
    yield "data: [DONE]\n\n"

@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    return StreamingResponse(
        token_stream(req.message),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

!!! mascot-thinking "为什么流式是刚需"
    ![墨墨思考中](../../img/mascot/thinking.png){ class="mascot-admonition-img" }
    注意这个不等式：流式的 TTFT 只取决于第一个 token 的时间，而非流式的等待时间取决于全文长度。大模型回答越长，流式的体验优势越大，这就是为什么聊天产品清一色用流，而后台批量任务可以用非流。

流式响应的另一半在客户端：用支持流的 HTTP 客户端逐行读，拼 `[DONE]` 结束。注意 `iter_lines` 是同步写法，异步客户端用 `aiter_lines`，别在 `async` 函数里调阻塞 API 把事件循环卡住：

```python
import httpx

with httpx.stream("POST", "http://127.0.0.1:8000/chat/stream",
                  json={"message": "你好", "session_id": "s1", "stream": True},
                  timeout=None) as r:          # 流式请求不要设总超时，用空闲超时
    for line in r.iter_lines():
        if not line.startswith("data: "):
            continue                          # 心跳注释行直接跳过
        payload = line[len("data: "):]
        if payload == "[DONE]":
            break
        render(payload)                       # 逐块渲染，用户先看到字
```

算一笔 TTFT 的账就知道流式为什么是刚需：假设首 token 0.6 秒生成，全文 2000 tokens 需要 20 秒。非流式用户等 20 秒才看到第一个字；流式用户 0.6 秒就开始阅读，感知延迟只取决于首 token。回答越长，差距越大。

"流"有三种形态，别混用。分块传输是地基（HTTP/1.1 的 chunked 编码），SSE 是其上的文本帧协议（单向、断线自动重连），WebSocket 是全双工通道（ overhead 大、要自己管心跳和 sticky 会话）。选型结论：AI 聊天输出用 SSE，对讲机式实时语音才上 WebSocket（见第十三章）。

两个容易错的细节放在一张表里，后面联调时对照查：

| 细节 | 正确做法 | 错了会怎样 |
|---|---|---|
| 代理缓冲 | Nginx 加 `X-Accel-Buffering: no`，或关闭 `proxy_buffering` | 首字延迟回到全文长度，流式名存实亡 |
| 结束帧 | 固定发 `data: [DONE]` | 客户端不知道流结束，一直转圈等待超时 |
| 心跳 | 超过 30 秒无输出先发注释行 `:ping` | 网关或浏览器中途掐掉空闲连接 |

## 三、日志与排障

### 日志与配置管理

日志与配置是同一枚硬币的两面：日志记录程序说了什么，配置决定程序怎么运行。工程规范只有两条：日志打结构化（JSON 一行一条，带 `request_id` 和 `session_id`），配置全部走环境变量，代码里不许出现裸字符串密钥。Python 用标准库 `logging` 加 JSON 格式化器即可，不要自己拼字符串写文件，那样既不好查也轮转不了。服务启动时用一份 `dictConfig` 统一日志形状，避免每个模块各打各的：

```python
import logging.config

logging.config.dictConfig({
    "version": 1,
    "formatters": {"json": {"format": '{"ts":"%(asctime)s","level":"%(levelname)s","msg":%(message)s}'}},
    "handlers": {"out": {"class": "logging.StreamHandler", "formatter": "json"}},
    "root": {"handlers": ["out"], "level": "INFO"},
})
```

### Linux日志排查

线上排障九成时间花在找日志上。先记住三个命令的分工：`grep` 负责按关键字过滤，`tail -f` 负责实时跟踪，`journalctl` 负责看 systemd 托管的服务。组合起来就是标准动作：先用时间范围缩小，用 `grep -E` 同时命中错误码和会话 ID，再用 `-C 5` 看上下文：

```bash
# 看最近 500 行里某会话的报错，前后各带 5 行上下文
journalctl -u ai-app --since "30 min ago" | grep -E "ERROR|Traceback" | grep "sess_9f31" -C 5
```

只看一条报错不够，要看"哪个错最多"。结构化日志的红利在这里：用 `awk` 按错误码分组计数，一眼定位主犯，而不是被最后一条报错带偏：

```bash
# 统计过去一小时出现次数最多的 10 种错误
journalctl -u ai-app --since "1 hour ago" \
  | grep -oE '"code":"[A-Z_]+"' | sort | uniq -c | sort -rn | head -10
```

!!! mascot-tip "墨墨的排障起手式"
    ![墨墨提示技巧](../../img/mascot/tip.png){ class="mascot-admonition-img" }
    先问三个问题再动手：什么时候开始坏的（对应哪次发布）、只坏一部分还是全坏（缩小 blast radius）、日志里最早的报错是哪一条（后面的多半是连锁反应）。顺序反了，查两小时都是常见事。

### Shell脚本自动化

Shell 脚本的价值不在语法，在于把"每次发布都要敲的十条命令"变成一条。写脚本只守三条纪律：首行 `set -euo pipefail` 让任何一步失败就停下；变量全部加双引号防止空格炸开；脚本只做编排，复杂逻辑交给 Python。下面是一个发版检查脚本的骨架，后面章节的部署都会复用这个形状：

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/srv/ai-app"
cd "$APP_DIR"
git pull --ff-only
docker compose up -d --build
sleep 5
curl -fsS http://127.0.0.1:8000/healthz || { echo "health check failed"; exit 1; }
echo "deploy ok"
```

同文件里再沉淀一个日志归档函数，发布前先把旧日志打包，避免磁盘被撑爆——这是线上最常见的"非业务"宕机原因：

```bash
archive_logs() {
  local stamp
  stamp=$(date +%Y%m%d-%H%M%S)
  tar -czf "/var/log/ai-app/app-${stamp}.tgz" /var/log/ai-app/*.log
  : > /var/log/ai-app/app.log   # 截断而非删除，写死的句柄不断
  find /var/log/ai-app -name "*.tgz" -mtime +14 -delete
}
```

### 服务健康检查

健康检查是给编排器和负载均衡看的"心跳"。规范做法是暴露 `/healthz` 端点，只做轻量自检（进程活着、关键依赖连得上），重检查走 `/readyz`。上面的发版脚本最后一步就是调它：返回非 200 就判定发布失败并退出，后面接回滚。记住它的判断标准：健康检查回答的是"我能不能接流量"，不是"我的业务对不对"，别在里面跑全量测试。上了 K8s 之后要拆成两个探针：`liveness` 只查进程是否僵死（失败就重启），`readiness` 查依赖是否就绪（失败就摘流量不重启），混成一个探针会导致"数据库抖一下，Pod 全被重启"的惨案：

```yaml
livenessProbe:
  httpGet: {path: /healthz, port: 8000}
  periodSeconds: 10
readinessProbe:
  httpGet: {path: /readyz, port: 8000}
  periodSeconds: 5
```

## 四、容器与协作

### Docker镜像构建

镜像是"环境快照加启动说明"。Dockerfile 按层缓存：把变化慢的放前面（装依赖），变化快的放后面（拷代码），这样每次构建只重做最后一两层。AI 应用镜像有一条铁律：模型权重和大文件不要打进镜像，用卷或对象存储挂载，否则镜像几个 GB，发布一次传半小时：

```dockerfile
FROM python:3.11-slim
WORKDIR /srv/app
COPY requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock
COPY ./app ./app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

依赖重、构建慢的项目用多阶段构建：第一阶段装编译工具链并打出 wheel，第二阶段只拷 wheel 和运行时，最终镜像里不留 gcc，体积和攻击面一起下来：

```dockerfile
FROM python:3.11-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends gcc
COPY requirements.lock ./
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.lock

FROM python:3.11-slim
COPY --from=builder /wheels /wheels
RUN pip install --no-cache-dir /wheels/*.whl
COPY ./app ./app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

!!! mascot-warning "别用 latest 当版本"
    ![墨墨提醒注意](../../img/mascot/warning.png){ class="mascot-admonition-img" }
    基础镜像必须钉死小版本（如 `python:3.11-slim`），绝不能写 `latest`。这个坑的发作方式是：半年后重构建，基础镜像悄悄升级，你的代码挂在一个完全无关的报错上，而你 diff 自己的提交什么都没改。

### Docker环境变量配置与环境变量安全管理

环境变量是容器传配置的标准通道，但有两个配套纪律。第一，区分构建时和运行时：密钥只在运行时注入（`docker run -e` 或 compose 的 `env_file`），绝不写进 Dockerfile 的 `ENV`，镜像一旦泄露等于密钥泄露。第二，本地开发用 `.env` 文件，`.env` 必须进 `.gitignore`，仓库里只放 `.env.example` 写清字段名不写值。变量来源多了会打架，记住 compose 的优先级（后者覆盖前者）：`Dockerfile ENV` < `env_file` < `environment` < `docker run -e`，排障时按这个顺序查是谁覆盖了谁。

### Docker卷与网络

卷解决"容器删了数据还在"，网络解决"容器之间怎么互相找到"。记住两个默认行为：匿名卷随容器删除而丢失，生产数据必须用命名卷或绑定挂载；默认 bridge 网络下容器互访要用服务名（compose 里就是服务名），`localhost` 在容器里指的是自己，不是宿主机——联调时一半的"连不上"都是这一条。

```yaml
services:
  api:
    build: .
    environment:
      - DATABASE_URL
    volumes:
      - app-data:/srv/app/data   # 命名卷：容器重建数据不丢
    networks: [backend]
  worker:
    build: .
    networks: [backend]          # 同一网络下 worker 用 http://api:8000 访问

volumes:
  app-data:
networks:
  backend:
```

容器"连不上"时别猜，按三板斧排查：先 `docker compose ps` 看容器是不是活着，再 `docker exec -it api sh` 进容器里 `wget -qO- http://worker:8000/healthz` 验证服务名解析和端口，最后 `docker inspect` 看两个容器是否真在同一个网络。九成连通性问题死在这三步的第一步——容器根本没起来，日志里写着端口被占用。

### Git分支协作流程与本地开发联调

分支模型用最简的主干开发：`main` 永远可发布，功能分支做完提 PR，CI 过了合入。AI 项目多一条：提示词和评测集的变更也要走 PR，别在聊天框里改完直接上线——提示词就是代码。每个 PR 对照这张清单自查，省下来的返工时间比写清单多一个数量级：

| 检查项 | 不做的后果 |
|---|---|
| 锁文件同步更新 | CI 装出和你本地不一样的依赖 |
| `.env.example` 同步新字段 | 同事和线上少配一个变量，启动即崩 |
| 提示词变更附评测前后对比 | 线上效果回退无人知晓 |
| 冒烟流录屏或日志 | "我本地是好的"扯皮三小时 |

本地联调的顺序固定为：先 `docker compose up` 起依赖，再跑单测，最后用真实模型 key 跑一条冒烟流；冒烟用的 key 必须是测试 key，额度单独控制，免得生产 key 被刷爆。冒烟清单只有四条：健康检查 200、非流聊天出一句完整话、流式收到 `[DONE]`、超长输入返回明确的截断错误而不是空回复。

## 五、模型调用基础

### 提示词工程基础

提示词是给模型的"需求文档"，写得越像需求文档，输出越稳定。固定用三段式：角色（你是谁，限定知识边界）、任务（要产出什么，格式是什么）、约束（不能做什么、超纲时怎么说）。光讲格式不够看，加一个 few-shot 例子胜过十句描述——给模型看一两个输入输出样例，它模仿得比听指令准得多：

```text
你是电商客服质检员。把对话判为【通过】或【打回】，只输出标签。
示例1：客服辱骂用户 → 打回
示例2：客服承诺了查不到的库存 → 打回
现在判断：客服说"已为您登记，三天内专人回电"，用户表示接受 →
```

凡是线上跑的提示词，必须进版本管理，和代码同评审、同回滚，聊天框里调完直接上线的提示词，是生产事故预备役。

### 模型API调用封装

不要在业务代码里散落 `OpenAI()` 构造。封装一个单例 client：`base_url`、`api_key`、`timeout` 全部从环境变量读，超时默认 60 秒，重试逻辑集中到第六节讲的退避器里。这样换兼容接口（切网关、切本地模型）时只改一处：

```python
from openai import AsyncOpenAI
import os

client = AsyncOpenAI(
    base_url=os.environ["MODEL_BASE_URL"],
    api_key=os.environ["MODEL_API_KEY"],
    timeout=60.0,
    max_retries=0,  # 重试自己管，见第六节；SDK 自带重试语义不透明
)
```

超时要分层：连接超时设短（3 秒，连不上就是网络或 DNS 问题，等再久也没用），读取超时设长（60 秒，给模型留足生成时间）。混成一个总数，要么误杀慢回答，要么在网络故障时空等：

```python
import httpx

timeout = httpx.Timeout(connect=3.0, read=60.0, write=10.0, pool=5.0)
client = AsyncOpenAI(
    base_url=os.environ["MODEL_BASE_URL"],
    api_key=os.environ["MODEL_API_KEY"],
    timeout=timeout,
    max_retries=0,
)
```

### Token与上下文窗口

Token 是模型计费和截断的基本单位，中文大约 1.5 个字符折 1 个 token，英文大约 0.75 个单词折 1 个 token。上下文窗口是"输入加输出"能容纳的 token 上限，超了模型会直接截断或报错，所以每次请求前都要会算账。本章用一套教学估算公式（价格为示意价，不是真实厂商报价）：

输入 tokens = 中文字符数 / 1.5 向上取整 + 英文单词数 / 0.75 向上取整，费用 = 输入千 tokens 数 × 0.004 元 + 输出千 tokens 数 × 0.012 元。

举例：1500 个中文字符的输入折 1000 tokens，800 tokens 的输出，费用 = 1 × 0.004 + 0.8 × 0.012 = 0.0136 元。先心算，再用下面的估算器验证手感。

窗口超了不能靠运气，有三种标准处理，按推荐顺序排：

| 策略 | 做法 | 代价 |
|---|---|---|
| 截断 | 只保留最近 N 轮或前 N 字符 | 丢上下文，多轮对话失忆 |
| 滑动窗口加摘要 | 旧轮次压缩成一段摘要再拼回去 | 要多一次模型调用，摘要可能失真 |
| 检索回填 | 历史存向量库，需要时按相关性取回 | 架构最重，效果最好（第三章展开） |

#### 图：Token 成本估算器

<iframe src="../../sims/token-cost-estimator/main.html" height="482px" width="100%" scrolling="no"></iframe>

[全屏运行Token 费用估算器](../../sims/token-cost-estimator/main.html){ .md-button .md-button--primary }

<details markdown="1">
<summary>设计说明（规格块）</summary>

本 MicroSim 已实现，上方 iframe 为实际运行的版本。下面的折叠内容是它的设计规格，供教师复用或二次开发参考。

<details markdown="1">
<summary>展开规格原文</summary>

Token 费用估算器</summary>
Type: microsim
**sim-id:** token-cost-estimator<br/>
**技术库：** p5.js<br/>
**状态：** built<br/>
**Bloom 层级：** Apply<br/>
**Bloom 动词：** calculate<br/>
**学习目标：** 学习者将针对中英文混合提示，在给定字符数与输出 token 数条件下，算出输入 token 数与请求总费用，费用误差不超过 ±0.001 元。

**前置知识：** token、上下文窗口、教学估算公式、示意价格（均已在本块上方的“Token与上下文窗口”一节定义）。

**掌握判据：** 每道挑战题，学习者先手写输入 token 数与总费用再提交；token 数精确命中、费用误差在 ±0.001 元内算对；3 题全对为掌握。拖滑块看数字变化属于探索，不计入掌握。

**常见误区：** (1) token 就是字符数。(2) 输出不计费。(3) 上下文窗口只限制输入长度。

**教学设计理由：** Apply 层级的计算必须先承诺数字再校验，因此学习者先手写后揭晓。滑块探索在前（公式可见），挑战锁定在后。

**题库内容：**

学习者可调节三个量：

| 量 | 最小 | 最大 | 步长 | 默认 | 单位 |
|---|---|---|---|---|---|
| 中文字符数 C | 0 | 20000 | 100 | 1500 | 字符 |
| 英文单词数 W | 0 | 5000 | 50 | 200 | 单词 |
| 输出 tokens O | 0 | 8000 | 100 | 800 | tokens |

模拟器持续显示：输入 tokens = ceil(C/1.5) + ceil(W/0.75)，费用 = 输入tokens/1000×0.004 + O/1000×0.012，两个加项分开展示。价格标注为示意价。

挑战题（固定顺序）：

| 序号 | C | W | O | 输入 tokens | 总费用（元） | 答错时的提示 |
|---|---|---|---|---|---|---|
| 1 | 1500 | 0 | 800 | 1000 | 0.0136 | ceil(1500/1.5) = 1000；费用 = 1×0.004 + 0.8×0.012 = 0.0136。 |
| 2 | 0 | 600 | 1200 | 800 | 0.0176 | ceil(600/0.75) = 800；费用 = 0.8×0.004 + 1.2×0.012 = 0.0176。输出同样计费。 |
| 3 | 3000 | 300 | 2000 | 2400 | 0.0336 | ceil(3000/1.5) + ceil(300/0.75) = 2000 + 400 = 2400；费用 = 2.4×0.004 + 2×0.012 = 0.0336。 |

**来源：** 公式、两个示意价格（每千 tokens 0.004 元与 0.012 元）、挑战题 1 的数字（1500 字符→1000 tokens→0.0136 元）出自本块上方的“Token与上下文窗口”一节。挑战题 2、3 的值由 Rules 计算得出。

**交互规则：** input_tokens = ceil(C/1.5) + ceil(W/0.75)，C 为 >= 0 的整数，W 为 >= 0 的整数。cost = input_tokens/1000×0.004 + O/1000×0.012，O 为 >= 0 的整数。费用显示保留 4 位小数；判定用 ±0.001 元容差。零 token 请求费用为 0.0000。

**学习者活动：**

1. 学习者拖动三个量，观察输入 token 数与费用读数变化。应注意到：输入不变时，输出 tokens 照样推高费用。
2. 学习者打开挑战题 1，手写输入 token 数与费用并提交，模拟器逐项判对错。
3. 按顺序完成挑战题 2、3。第三题结束后，全部正确答案与演算过程展示。

**反馈文案：** 三道挑战题，固定顺序，每题两次机会。答对：“正确：输入 <tokens> tokens，费用 <cost> 元。”答错：展示该题“答错时的提示”。第二次答错后展示标准值与演算过程，该题记为失手。顶部累计“累计答对 n/3 题”。

**初始状态：** 滑块位于默认值（C = 1500，W = 200，O = 800），输入 token 数与费用可见。屏幕提问：“1500 个中文字符加 800 输出 tokens，要花多少钱？先手算，再开挑战验证。”

**章节锚点：** 教学公式（ceil(C/1.5) + ceil(W/0.75)）；示意价格每千 tokens 0.004 元与 0.012 元；正文演算示例 1500 字符→1000 tokens→0.0136 元。

</details>
</details>

### 结构化输出解析与 JSON Schema校验

让模型"自由发挥"写 JSON，线上一定会遇到缺字段、多嵌套、类型错。正确姿势是两层：先用 `response_format: {"type": "json_object"}` 约束模型只出 JSON，再用 JSON Schema 在本地硬校验。Schema 只写三样东西：字段类型、必填字段、枚举值，校验跑在业务逻辑之前，不通过直接重试或转人工，绝不把脏数据喂给下游：

```python
schema = {
    "type": "object",
    "required": ["city", "days"],
    "properties": {
        "city": {"type": "string"},
        "days": {"type": "integer", "minimum": 1, "maximum": 14},
        "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]},
    },
}
```

参数结构一复杂就拆子模型，用 `$ref` 引用，避免一个 Schema 几百行没法看。子模型同样可以复用到 tools 的参数定义里，一处改、处处生效：

```python
class DateRange(BaseModel):
    start: str  # YYYY-MM-DD
    end: str

class WeatherQuery(BaseModel):
    city: str
    date_range: DateRange
    unit: str = "celsius"

print(WeatherQuery.model_json_schema())  # 自动生成带 $ref 的标准 Schema
```

记住顺序：校验先行，业务断后。Schema 是模型的"交货验收单"，不是事后补的文档。校验失败要有退路：先修一次（把错误信息拼回提示词让模型重出，最多两次），还不行就降级——记日志、转人工、给用户一个明确的"稍后再试"，绝不能把脏数据喂给下游：

```python
import json

def parse_or_retry(raw: str, schema: dict, retry_call) -> dict:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = json.loads(retry_call(f"只输出合法 JSON，不要解释：{raw}"))
    validate_against_schema(data, schema)  # 不通过抛异常，走降级通道
    return data
```

### 函数调用基础

函数调用（function calling / tools）是本章最后一个基础概念，也是全书的起点：模型不再只返回文本，而是返回结构化的"函数名加参数"，真正执行的是你的代码。关键分工要刻进脑子：模型只负责"决定调哪个函数、填什么参数"，执行和结果回填都是你的程序干的。给出 tools 的参数 Schema（就是上一节的 JSON Schema 写法），收到 `tool_calls` 后调用本地函数，再把结果塞回对话让模型组织最终答复。完整循环长这样，注意第二轮请求必须带上全部历史（含工具结果），否则模型会"失忆"重复调用：

```python
tools = [{"type": "function", "function": {
    "name": "get_weather",
    "description": "查询指定城市未来 N 天天气",
    "parameters": {"type": "object",
                   "required": ["city", "days"],
                   "properties": {"city": {"type": "string"},
                                  "days": {"type": "integer"}}}}}]

first = await client.chat.completions.create(
    model="gpt-4o-mini", messages=[{"role": "user", "content": "北京未来 3 天天气？"}],
    tools=tools, tool_choice="auto")
msg = first.choices[0].message
if msg.tool_calls:  # 模型决定调函数：只出参数，不执行
    call = msg.tool_calls[0]
    result = get_weather(**json.loads(call.function.arguments))  # 你执行
    second = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "北京未来 3 天天气？"},
                  msg,  # 第一轮（含 tool_calls）必须回填
                  {"role": "tool", "tool_call_id": call.id,
                   "content": json.dumps(result)}])
    answer = second.choices[0].message.content
```

MCP（第六章）就是把这套机制标准化的协议。

## 六、调用可靠性收尾

### 错误重试与超时

网络请求一定会失败，重试是刚需，但无脑重试等于拿服务器的前途开玩笑。生产级重试四件套：指数退避（第 k 次重试等 2×2^k 秒，即 2、4、8……秒）、抖动（实际等待加减 20% 随机，避免所有客户端同时重试打爆服务）、幂等键（重试请求带同一个 ID，服务端去重，否则下单可能扣两次钱）、熔断器（连续失败超过阈值就直接短路，不再发请求）。

指数退避和固定间隔到底差多少？固定间隔每次等 2 秒，n 次重试总等待 2n 秒；指数退避总等待 2×(2^n−1) 秒。n=3 时是指数 14 秒对固定 6 秒。直觉上指数退避"越等越久"，它保护的是下游服务的恢复时间，而不是你的等待体验——这笔账要在下面算清楚。

#### Diagram: 重试退避阶梯

<iframe src="../../sims/retry-backoff-ladder/main.html" height="737px" width="100%" scrolling="no"></iframe>

[全屏运行重试退避阶梯](../../sims/retry-backoff-ladder/main.html){ .md-button .md-button--primary }

<details markdown="1">
<summary>设计说明（规格块）</summary>

本 MicroSim 已实现，上方 iframe 为实际运行的版本。下面的折叠内容是它的设计规格，供教师复用或二次开发参考。

<details markdown="1">
<summary>展开规格原文</summary>

重试退避阶梯</summary>
Type: microsim
**sim-id:** retry-backoff-ladder<br/>
**技术库：** p5.js<br/>
**状态：** built<br/>
**Bloom 层级：** Analyze<br/>
**Bloom 动词：** compare<br/>
**学习目标：** 学习者将对比固定间隔与指数退避在六种重试次数下的总等待，并为每种次数选出等待更短的策略。

**前置知识：** 指数退避、固定间隔、总等待公式、熔断器（均已在本块上方的“错误重试与超时”一节定义）。

**掌握判据：** 学习者对六种重试次数逐一选出总等待更短的策略；与 Content 表 Correct 列一致算对，n = 1 打平时选任一策略都算对；单次作答答对 >= 5 题为掌握。不经预测直接看答案不计入。

**常见误区：** (1) 指数退避恢复得更快。(2) 重试次数越多，可靠性越高。

**教学设计理由：** Analyze 层级的对比必须先预测后揭晓，因此学习者锁定全部六行选择后才展示答案。n = 1 的打平迫使注意力放在交叉点上，而不是死记一条笼统规则。

**题库内容：**

两种策略的基准延迟都是 2 秒。学习者预测后展示总等待：

| 重试次数 n | 固定间隔总等待 | 指数退避总等待 | 正确项 | 原因（答后反馈） |
|---|---|---|---|---|
| 1 | 2 s | 2 s | 固定或指数 | n = 1 时两者都是首个 2 秒延迟，打平。 |
| 2 | 4 s | 6 s | 固定 | 指数第二阶跳到 4 秒，总和 2 + 4 = 6，已超过固定的 4。 |
| 3 | 6 s | 14 s | 固定 | 指数三阶总和 2 + 4 + 8 = 14，是固定的两倍多。 |
| 4 | 8 s | 30 s | 固定 | 2 + 4 + 8 + 16 = 30，等待体验差距继续拉大。 |
| 5 | 10 s | 62 s | 固定 | 五次重试下指数退避让用户等一分钟，基本不可接受。 |
| 6 | 12 s | 126 s | 固定 | 六次重试指数总和破两分钟：重试必须配熔断，而不是加次数。 |

**来源：** 基准延迟 2 秒、两个总等待公式、n = 3 示例（2 + 4 + 8 = 14）出自本块上方的“错误重试与超时”一节。其余行数值由 Rules 计算得出。延迟常量为教学用示意值。

**交互规则：** total_fixed(n) = 2n 秒；total_exp(n) = 2×(2^n − 1) 秒；n 为 1..6 的整数。打平规则：n = 1 时两种策略都算对。模型是确定性的，不含抖动，模拟器会声明真实部署需加 ±20% 抖动。结果均为整数，不涉及舍入。

**学习者活动：**

1. 学习者看到六行，每行只显示重试次数 n，逐行预测哪种策略总等待更短。
2. 六行预测全部锁定后揭晓答案，每行展示两个总数与原因。
3. 学习者应注意到交叉点：n = 1 打平，之后固定间隔全胜，且从 n = 4 起差距爆炸式拉大。

**反馈文案：** 六个判断，一次作答，预测锁定后揭晓。答对：“正确”加该行原因；答错：“再看一下总和”加该行原因。揭晓后展示“答对 n/6 题”，并提醒：重试要配熔断，而不是加次数。

**初始状态：** 六行显示 n = 1..6，预测位为空，每行有两个策略按钮。屏幕提问：“同样重试 6 次，哪种策略让用户等得更短？先全猜一遍再揭晓。”

**章节锚点：** 基准延迟 2 秒；两个总等待公式；n = 3 演算示例（2 + 4 + 8 = 14 秒）；重试必须配熔断的结论。

</details>
</details>

退避管"等多久"，熔断管"还等不等"。一个能直接用的极简熔断器只有三个状态：关闭（正常放行）、打开（直接拒绝，保护下游）、半开（放一个探路，成了就关闭）。生产实现（如 `pybreaker`）也是这个骨架，阈值按接口调：

```python
import time

class Breaker:
    def __init__(self, fail_max=5, reset_s=30):
        self.fail_max, self.reset_s = fail_max, reset_s
        self.fails, self.opened_at = 0, 0.0

    def call(self, fn, *a, **k):
        if self.fails >= self.fail_max:          # 打开态
            if time.time() - self.opened_at < self.reset_s:
                raise RuntimeError("breaker open")
            self.fails = 0                        # 半开：放一个探路
        try:
            return fn(*a, **k)
        except Exception:
            self.fails += 1
            if self.fails >= self.fail_max:
                self.opened_at = time.time()
            raise
```

### 环境变量安全管理

密钥管理的红线只有一条：密钥一旦进过 git 历史，就视为已泄露，必须轮换，而不是删掉提交了事。配套动作有三：仓库只留 `.env.example`；CI 的密钥走平台的 secret 存储，绝不写进构建日志；线上定期轮换并保留吊销清单。方案按团队规模选，小团队别上重型 Vault：

| 阶段 | 密钥放哪里 | 说明 |
|---|---|---|
| 个人开发 | `.env` + 密码管理器 | `.env` 永不进 git |
| 小团队 CI | GitHub Actions Secrets / 云厂商 KMS | 日志自动脱敏，PR fork 拿不到 |
| 生产多环境 | Vault 或云 Secret Manager + 定期轮换 | 审计谁在何时读过哪个密钥 |

配合上一节的熔断器一起看：安全和可靠都是"失败时怎么办"的学问。

!!! mascot-warning "密钥进 git 等于裸奔"
    ![墨墨提醒注意](../../img/mascot/warning.png){ class="mascot-admonition-img" }
    这个坑的恶毒之处在于延迟发作：`git push` 当时什么都不发生，三个月后有人翻历史、扫密钥、撞库，一气呵成。凡是含密钥的提交，正确处理只有轮换密钥，没有"revert 一下就好"这种选项。

### 后端分页与缓存

列表接口必须分页，游标分页优先于 offset：offset 越往后翻越慢（数据库要数完前面所有行），游标用"上一页最后一条的 ID"定位，复杂度稳定。缓存只缓存"算得贵、变得慢"的东西，key 里必须带版本号（`weather:v3:{city}`），发版改逻辑时升版本，旧缓存自然失效，比逐条删 key 可靠得多。缓存的读写形状固定为"先查缓存、没有再算、算完回填"，并给回填加随机过期防雪崩：

```python
import random

async def get_weather_cached(city: str):
    key = f"weather:v3:{city}"
    if (hit := await redis.get(key)) is not None:
        return json.loads(hit)
    data = await call_model_weather(city)
    await redis.setex(key, 600 + random.randint(0, 120), json.dumps(data))
    return data
```

这两招配上健康检查和重试，第一章的地基就完整了。

!!! mascot-celebration "地基完工！"
    ![墨墨庆祝](../../img/mascot/celebration.png){ class="mascot-admonition-img" }
    你刚亲手搭起 AI 应用的地基：隔离环境、异步模板、流式接口、容器编排，还有带退避和熔断的模型调用。下一章咱们把这些零件组装成真正的 RAG 系统。八条触手，一起开干！

