# 参考资料：多模态应用开发

本章提到的技术、工具与方法，可从以下来源深入。带 ★ 的是本章最核心的必读项。

## 官方文档

- ★ **[FFmpeg 官方文档](https://www.ffmpeg.org/documentation.html)** — 本章"硬核"一节的权威参考。本章强调"60% 以上的多模态线上事故在合成环节、而合成环节的问题最终都落在 ffmpeg 上"，参数语义从这里查。
- ★ **[ffmpeg 滤镜文档](https://www.ffmpeg.org/ffmpeg-filters.html)** — `scale`、`pad`、`setsar`、`subtitles`、`blackdetect`、`ebur128` 等滤镜的官方说明。本章"滤镜链顺序即执行顺序""黑帧探测阈值"这些细节的标准出处。
- **[ffprobe 文档](https://www.ffmpeg.org/ffprobe.html)** — 流信息探测工具。本章"拼接之前必须先探测流参数"那条纪律靠的就是这个工具。
- **[Realtime API 指南](https://platform.openai.com/docs/guides/realtime)** — 实时语音交互接口的事件模型与打断语义。本章"有些实时接口只帮你停输出、不帮你清空已排队的音频"这类提醒，与这份文档的实际能力边界对照。
- **[Realtime 会话指南](https://platform.openai.com/docs/guides/realtime-conversations)** — 会话建立、音频格式与事件流的具体约定，本章六段链路的接口形态参考它。

## 规范与论文

- ★ **[Robust Speech Recognition via Large-Scale Weak Supervision](https://arxiv.org/abs/2212.04356)** — Whisper 论文，本章 ASR 一段的口径，以及"16 kHz 单声道是识别甜点区间"这一采样率约定的技术背景。
- **[Video Diffusion Models](https://arxiv.org/abs/2204.03458)** — 视频生成的扩散模型基础工作。本章讲"文本生视频控制力弱、图生视频一致性好"的差异根源在这一层。
- **[Make-A-Video: Text-to-Video Generation without Text-Video Data](https://arxiv.org/abs/2209.14792)** — 视频生成的时空一致性改进。本章"首帧图规范五条"和跨镜头一致性问题的技术背景。
- **[Tacotron: Towards End-to-End Speech Synthesis](https://arxiv.org/abs/1703.10135)** — 端到端 TTS 的经典架构。本章"TTS 必须流式出首包"以及音色档位与音质取舍的工程前提。

## 工具仓库

- **[FFmpeg/FFmpeg](https://github.com/FFmpeg/FFmpeg)** — 源码与编译说明；本章提到"`-fps_mode` 是较新写法、旧版本用 `-vsync`，以官方文档为准"，这个版本差异在仓库的提交历史里能查到。