# MicroSim 批量实现指南（已验证管线）

本文件是给后续 agent 用的施工说明。第一个 sim `token-cost-estimator` 已按此流程
端到端验证通过（浏览器实测：探索模式、挑战模式、判题、反馈、自动进题）。

## 0. 铁律（违反必出 bug）

1. **`updateCanvasSize()` 必须是 `setup()` 第一句**，但那时滑块还不存在。
   函数体内**必须守卫**：`if (typeof cSlider !== 'undefined' && cSlider) { ... }`。
   不加守卫 = `TypeError: Cannot read properties of undefined (reading 'size')` 白屏。
2. **`canvas.parent(document.querySelector('main'))`** — 绝不能写 `canvas.parent('main')`。
   p5 的字符串形式查的是 `id="main"`，而 `<main>` 标签没有 id，会 null error。
   同理所有 createInput 也要 `.parent(document.querySelector('main'))`。
3. **画布上的 `text()` 与 HTML 输入框不能放在同一坐标**。画布标签留出间隙，
   例如输入框在 x=360，标签文字画在 x=330。
4. **按钮不得与滑块同行**。行数 = 控件行数，`controlHeight = 行数×35 + 10`。
   滑块各占一行，按钮+输入框占最后一行。
5. **iframe 高度 = drawHeight + controlHeight + 2**，且必须与 `index.md` 里的
   `height="NNNpx"` 完全一致。

## 1. 目录与文件

```
docs/sims/<sim-id>/
├── index.md              # frontmatter(status: built) + iframe + 描述 + 学习目标 + 嵌入代码
├── main.html             # p5 CDN + <main></main>（无 id）+ 引 JS
├── <sim-id>.js           # 全部逻辑，命名与目录一致
└── metadata.json         # Dublin Core + 控件清单 + 模型公式 + 局限
```

## 2. main.html 模板

```html
<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>中文标题 MicroSim</title>
    <script src="https://cdn.jsdelivr.net/npm/p5@2.3.2/lib/p5.js"></script>
    <style>
        body { margin: 0px; padding: 0px; font-family: Arial, Helvetica, sans-serif; }
    </style>
    <script src="<sim-id>.js"></script>
</head>
<body>
    <main></main>
    <br/>
    <a href=".">返回文档</a>
</body>
</html>
```

## 3. JS 骨架

```javascript
let canvasWidth = 800;
let drawHeight = 330;
let controlHeight = <行数×35+10>;
let canvasHeight = drawHeight + controlHeight;
let margin = 25;
let sliderLeftMargin = 150;
let defaultTextSize = 16;

function setup() {
  updateCanvasSize();                    // 第一句
  const canvas = createCanvas(canvasWidth, canvasHeight);
  canvas.parent(document.querySelector('main'));
  // 控件全部在此创建，先创建再定位
  describe('屏幕阅读器描述');
}

function draw() {
  updateCanvasSize();
  fill('aliceblue'); stroke('silver'); rect(0, 0, canvasWidth, drawHeight);  // 绘图区
  fill('white');  rect(0, drawHeight, canvasWidth, controlHeight);            // 控件区
  // 标题（画在背景之后）
  fill('black'); textSize(24); textAlign(CENTER, TOP); noStroke();
  text('标题', canvasWidth / 2, 10);
  textAlign(LEFT, CENTER); textSize(defaultTextSize);
  // 主内容…
  // 控件区标签：每行 text 之前 noStroke()
}

function windowResized() {
  updateCanvasSize();
  resizeCanvas(canvasWidth, canvasHeight);
}

function updateCanvasSize() {
  const container = document.querySelector('main');
  if (container) {
    canvasWidth = container.offsetWidth;
    if (typeof <任一slider> !== 'undefined' && <任一slider>) {   // 必须守卫
      <所有 slider>.size(canvasWidth - sliderLeftMargin - margin);
    }
  }
}
```

## 4. 交互判定（Apply / Analyze / Evaluate 层通用）

规格块的 `Content` 表给出题目与标准答案，`Evidence of Mastery` 给出判定规则。
实现为「先预测 → 提交 → 揭晓」：

```javascript
let mode = 'explore';      // explore | challenge
let idx = -1;              // 当前题号
let attempts = 0;          // 当前题已用次数（规格块通常给 2 次）
let correctCount = 0;
let feedback = '';
let feedbackOk = false;

// 判定：数值给容差，文本精确匹配
const okNum = (raw, expect, tol) => {
  const v = parseFloat(raw);
  return raw.trim() !== '' && !isNaN(v) && Math.abs(v - expect) <= tol;
};
const okInt = (raw, expect) => {
  const v = parseInt(raw, 10);
  return raw.trim() !== '' && !isNaN(v) && v === expect;
};
```

Analyze / Evaluate 层规格块要求「先预测再揭晓」：两遍循环，第一遍收集全部
作答锁定后才揭示答案，不要一题一题立刻判。

## 5. 自检清单（逐条确认后才算完成）

- [ ] 浏览器实测无 console error（favicon 404 可忽略）
- [ ] `setup()` 第一句是 `updateCanvasSize()`，且该函数有 undefined 守卫
- [ ] 截图确认：滑块、按钮、输入框**无重叠**；400/800/1200px 三档宽度不破版
- [ ] 点一次主按钮，确认状态机切换正确（探索→挑战→完成）
- [ ] 手输一次正确答案，确认判对、计数 +1、自动进下一题
- [ ] 手输一次错误答案，确认反馈文案来自规格块 Content 的「答错时提示」
- [ ] `index.md` 的 iframe 高度 == drawHeight + controlHeight + 2
- [ ] `metadata.json` 能被 `json.load` 解析
- [ ] `python -m mkdocs build --strict` 退出 0

## 6. 验证命令

```bash
cd /c/Users/Chen/Documents/git_repo/ai-course
python -m mkdocs build --strict
# 浏览器验证：起本地服务后用 Playwright 打开 sims/<sim-id>/main.html
#   注意：python -m http.server 对无扩展名目录返回 404，需进入 sim 目录再起服务，
#   或直接访问 <sim-dir>/main.html 的完整路径。
```
