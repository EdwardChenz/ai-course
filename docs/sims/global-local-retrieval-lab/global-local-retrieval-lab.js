// 全局与局部检索对比台 — Global vs Local Retrieval Lab
// 教学目标：对六个真实提问逐题判定该走局部检索还是全局检索，并预测注入上下文的块数与总延迟，
// 6 题中至少 5 题路线与块数全对算掌握。
// 规格来源：docs/chapters/05-graphrag-hybrid/index.md 的 global-local-retrieval-lab 规格块

// ---- 布局计算（先算再写码）----
// 控件清单：2 个滑块（C / K）+ 1 个下拉框（题号）+ 3 个下拉/输入 + 2 个按钮，共 4 行
// controlHeight = (4 * 35) + 10 = 150
// drawHeight = 560；canvasHeight = 560 + 150 = 710；iframeHeight = 712
// 行分配：第 1 行滑块 C / 第 2 行滑块 K / 第 3 行题号 + 路线 + 块数 + 延迟
//         第 4 行按钮

let canvasWidth = 800;
let drawHeight = 560;
let controlHeight = 150;
let canvasHeight = drawHeight + controlHeight;
let margin = 25;
let sliderLeftMargin = 150;
let defaultTextSize = 16;

// ---- 延迟口径（规格块 Rules；教学示意值，单位秒）----
const T_QUERY = 0.4;   // 一次图查询
const T_SUMMARY = 0.6;  // 单次社区摘要调用
const T_GEN = 0.8;      // 一次生成
const T_AGG = 1.1;      // 全局汇总阶段
const T_LOCAL = T_QUERY + T_GEN;                 // 1.2 秒
function localLatency() { return T_LOCAL; }
function globalLatency(K) { return T_QUERY + K * T_SUMMARY + T_AGG; }

// ---- 六道挑战题（规格块 Content 表，固定顺序）----
const QUESTIONS = [
  {
    no: 1, q: '宁德时代 2025 年的产能增速是多少？', route: '局部', blocks: 3, latency: 1.2,
    hint: '答案就是单个实体的单个指标值，1 跳读到边上的 value 即可；走全局等于用 96 份社区摘要找一个数字。'
  },
  {
    no: 2, q: '宁德时代的电池材料供应商有哪些？', route: '局部', blocks: 4, latency: 1.2,
    hint: '要沿「公司到供应商」的关系取邻居集合，是典型的局部多跳，2 跳以内。'
  },
  {
    no: 3, q: '过去一年动力电池行业的主要风险集中在哪些环节？', route: '全局', blocks: 5, latency: 4.5,
    hint: '问题没有指定起点实体，要跨几十份研报归纳共性，只能靠社区摘要汇总。'
  },
  {
    no: 4, q: '我们现有的供应网络里有哪些单点故障？', route: '全局', blocks: 5, latency: 4.5,
    hint: '问的是整个网络的结构性风险而不是某个实体的邻居，必须先按社区切块再汇总。'
  },
  {
    no: 5, q: '华泰证券研究所覆盖了哪些公司？', route: '局部', blocks: 3, latency: 1.2,
    hint: '起点明确、关系单一，逆一条 COVERS 边、1 跳就能列出清单。'
  },
  {
    no: 6, q: '比亚迪的经营风险画像是什么？', route: '全局', blocks: 5, latency: 4.5,
    hint: '判别边界题：「画像」要的是跨年度跨指标的归纳而不是某一个值，必须先由社区摘要给出维度再归纳；按局部做只会拿到一堆孤立片段。'
  }
];

const ROUTE_OPTS = ['（未选）', '局部', '全局'];

let cSlider, kSlider;
let qSel, routeSel, blockInput, latInput;
let submitBtn, resetBtn;

let locked = {};          // no -> {route, blocks, lat, okRoute, okBlock, okLat}
let revealed = false;

function setup() {
  updateCanvasSize(); // 必须是 setup 的第一句
  const canvas = createCanvas(canvasWidth, canvasHeight);
  canvas.parent(document.querySelector('main')); // 绝不能用 canvas.parent('main')

  cSlider = createSlider(4, 96, 96, 4);
  cSlider.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  cSlider.position(sliderLeftMargin, drawHeight + 5);
  cSlider.size(canvasWidth - sliderLeftMargin - margin);
  cSlider.attribute('aria-label', '社区总数 C');

  kSlider = createSlider(1, 12, 5, 1);
  kSlider.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  kSlider.position(sliderLeftMargin, drawHeight + 40);
  kSlider.size(canvasWidth - sliderLeftMargin - margin);
  kSlider.attribute('aria-label', '全局取前 K 个社区');

  qSel = createSelect();
  qSel.parent(document.querySelector('main'));
  qSel.position(10, drawHeight + 78);
  qSel.size(120);
  for (const q of QUESTIONS) qSel.option('第 ' + q.no + ' 题', String(q.no));
  qSel.attribute('aria-label', '题号');
  qSel.changed(() => { blockInput.value(''); latInput.value(''); routeSel.selected('（未选）'); });

  routeSel = createSelect();
  routeSel.parent(document.querySelector('main'));
  routeSel.position(155, drawHeight + 78);
  routeSel.size(120);
  for (const o of ROUTE_OPTS) routeSel.option(o, o);
  routeSel.attribute('aria-label', '路线预测');

  blockInput = createInput('', 'number');
  blockInput.parent(document.querySelector('main'));
  blockInput.position(320, drawHeight + 79);
  blockInput.size(70);
  blockInput.attribute('aria-label', '注入块数预测');
  blockInput.attribute('placeholder', '块数');

  latInput = createInput('', 'number');
  latInput.parent(document.querySelector('main'));
  latInput.position(430, drawHeight + 79);
  latInput.size(80);
  latInput.attribute('aria-label', '总延迟预测，单位秒');
  latInput.attribute('placeholder', '秒');

  submitBtn = createButton('提交本题预测');
  submitBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  submitBtn.position(10, drawHeight + 114);
  submitBtn.mousePressed(submitQ);

  resetBtn = createButton('重来');
  resetBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  resetBtn.position(140, drawHeight + 114);
  resetBtn.mousePressed(resetAll);

  describe('交互式对比台：拖动社区总数与全局取前 K 个社区，观察局部与全局两条路线的调用链与延迟，' +
    '再对六道题逐题预测路线、注入块数与总延迟。');
}

function draw() {
  updateCanvasSize();

  fill('aliceblue');
  stroke('silver');
  rect(0, 0, canvasWidth, drawHeight);
  fill('white');
  rect(0, drawHeight, canvasWidth, controlHeight);

  fill('black');
  noStroke();
  textSize(24);
  textAlign(CENTER, TOP);
  text('全局与局部检索对比台', canvasWidth / 2, 10);
  textAlign(LEFT, TOP);
  textSize(defaultTextSize);

  drawReadouts(48);
  drawChains(126);
  drawQuestions(230);
  drawFeedback(440);
  drawControls();
}

function drawReadouts(y) {
  const C = cSlider.value(), K = kSlider.value();
  const g = globalLatency(K), l = localLatency();
  textSize(14);
  fill(60);
  text('社区总数 C = ' + C + ' 个 level 2 社区；全局检索固定取相关度前 K = ' + K +
       ' 个社区（社区总数只影响候选池规模，不计入单次延迟）。', margin, y);
  fill('black');
  textSize(16);
  text('局部检索：0.4（一次图查询）+ 0.8（一次生成）= ' + l.toFixed(1) + ' 秒，共 2 次调用', margin, y + 24);
  text('全局检索：0.4 + K×0.6 + 1.1 = 0.4 + ' + K + '×0.6 + 1.1 = ' + g.toFixed(1) +
       ' 秒，共 ' + (2 + K) + ' 次调用', margin, y + 48);
  if (C === 4 && K === 1) {
    fill(150);
    text('C 与 K 同时取最小值时全局延迟 2.1 秒，仍高于局部 1.2 秒。', margin, y + 72);
    fill('black');
  }
}

function drawChains(y) {
  const K = kSlider.value();
  textSize(13);
  textStyle(BOLD);
  text('局部检索调用链（2 次）', margin, y);
  text('全局检索调用链（' + (2 + K) + ' 次）', margin + 300, y);
  textStyle(NORMAL);
  noStroke();
  fill(40);
  text('1 次图查询 → 实体邻居 → 1 次生成', margin, y + 20);
  fill(40);
  text('1 次图查询 → ' + K + ' 次社区摘要 → 汇总 1.1 秒 → 1 次生成', margin + 300, y + 20);
  fill('black');
}

function drawQuestions(y) {
  const cur = QUESTIONS[parseInt(qSel.value(), 10) - 1];
  textSize(14);
  fill('black');
  text('屏幕提问：六个问题，先猜路线再揭晓——判据只有一条：问题里有没有点名一个起点实体。', margin, y);
  textSize(16);
  text('当前第 ' + cur.no + ' 题：' + cur.q, margin, y + 22);

  const startY = y + 52;
  textSize(13);
  const heads = ['序号', '提问', '路线', '注入块数', '总延迟(秒)', '判定'];
  const xs = [28, 66, 430, 500, 578, 660];
  textStyle(BOLD);
  for (let i = 0; i < heads.length; i++) text(heads[i], xs[i], startY);
  stroke(200);
  line(margin, startY + 17, canvasWidth - margin, startY + 17);
  noStroke();
  textStyle(NORMAL);

  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    const ry = startY + 24 + i * 21;
    text(String(q.no), xs[0], ry);
    text(q.q, xs[1], ry);
    const lk = locked[q.no];
    if (lk) {
      text(lk.route, xs[2], ry);
      text(String(lk.blocks), xs[3], ry);
      text(lk.lat.toFixed(1), xs[4], ry);
      const ok = lk.okRoute && lk.okBlock;
      fill(ok ? 'darkgreen' : 'darkred');
      text(ok ? '✓ 正确' : '✗ 路线或块数错', xs[5], ry);
      fill('black');
    } else {
      fill(130);
      text('待预测', xs[2], ry);
      text('—', xs[3], ry);
      text('—', xs[4], ry);
      text('—', xs[5], ry);
      fill('black');
    }
  }
}

function drawFeedback(y) {
  const cpl = charsPerLine();
  let cy = y;
  textSize(14);
  const cur = QUESTIONS[parseInt(qSel.value(), 10) - 1];
  const lk = locked[cur.no];

  if (lk && (revealed || !lk.okRoute || !lk.okBlock)) {
    if (!lk.okRoute) cy = drawWrapped('第 ' + cur.no + ' 题路线判错：' + cur.hint, margin, cy, cpl, 18) + 6;
    if (!lk.okBlock) {
      cy = drawWrapped('第 ' + cur.no + ' 题块数判错：注入块数由问题涉及的子图规模决定，不随 K 变化。' +
        '局部 ' + '0.4 + 0.8 = 1.2 秒（2 次调用），全局 0.4 + K×0.6 + 1.1 = ' +
        globalLatency(kSlider.value()).toFixed(1) + ' 秒（' + (2 + kSlider.value()) + ' 次调用）。',
        margin, cy, cpl, 18) + 6;
    }
    if (!lk.okLat) cy = drawWrapped('第 ' + cur.no + ' 题延迟接近但未落在 ±0.1 秒容差内。',
                                    margin, cy, cpl, 18) + 6;
  }
  if (revealed) {
    const nc = QUESTIONS.filter(q => locked[q.no] && locked[q.no].okRoute && locked[q.no].okBlock).length;
    fill(30);
    text('答对 ' + nc + ' / 6 题（路线与块数两项全对才算该题正确；6 题中至少 5 题算掌握）。',
         margin, cy + 2);
  }
}

function drawControls() {
  fill('black');
  noStroke();
  textAlign(LEFT, CENTER); // 控件区标签按行垂直居中，避免压住 HTML 控件
  textSize(14);
  text('社区总数 C: ' + cSlider.value(), 10, drawHeight + 15);
  text('全局取前 K 个社区: ' + kSlider.value(), 10, drawHeight + 50);
  // 标签画在输入框左侧的空隙里，避免与 HTML 输入框重叠
  text('路线', 120, drawHeight + 88);
  text('块数', 285, drawHeight + 88);
  text('延迟', 390, drawHeight + 88);
  textAlign(LEFT, TOP); // 还原为顶端对齐

}

function submitQ() {
  if (revealed) return;
  const no = parseInt(qSel.value(), 10);
  const q = QUESTIONS[no - 1];
  const route = routeSel.value();
  const bRaw = blockInput.value().trim();
  const lRaw = latInput.value().trim();
  const b = parseInt(bRaw, 10);
  const l = parseFloat(lRaw);
  const okBlock = bRaw !== '' && !isNaN(b) && b === q.blocks;
  const okRoute = route === q.route;
  const okLat = lRaw !== '' && !isNaN(l) && Math.abs(l - q.latency) <= 0.1;
  locked[no] = {
    route: (route === '（未选）' ? '未选' : route),
    blocks: okBlock ? b : (isNaN(b) ? 0 : b),
    lat: isNaN(l) ? 0 : l,
    okRoute: okRoute, okBlock: okBlock, okLat: okLat
  };
  if (Object.keys(locked).length === QUESTIONS.length) revealed = true;
}

function resetAll() {
  locked = {};
  revealed = false;
  qSel.value('1');
  routeSel.selected('（未选）');
  blockInput.value('');
  latInput.value('');
  cSlider.value(96);
  kSlider.value(5);
}

function windowResized() {
  updateCanvasSize();
  resizeCanvas(canvasWidth, canvasHeight);
}

function updateCanvasSize() {
  const container = document.querySelector('main');
  if (container) {
    canvasWidth = container.offsetWidth;
    // setup() 的第一句会调用本函数，那时滑块尚未创建，必须守卫
    if (typeof cSlider !== 'undefined' && cSlider) {
      const w = canvasWidth - sliderLeftMargin - margin;
      cSlider.size(w);
      kSlider.size(w);
    }
  }
}

function charsPerLine() {
  return Math.max(16, Math.floor((canvasWidth - margin * 2) / 14));
}

function wrapCJK(str, n) {
  const out = [];
  let line = '';
  for (const ch of String(str)) {
    line += ch;
    if (line.length >= n) { out.push(line); line = ''; }
  }
  if (line) out.push(line);
  return out;
}

function drawWrapped(str, x, y, n, lineH) {
  noStroke();
  const lines = wrapCJK(str, n);
  for (let i = 0; i < lines.length; i++) text(lines[i], x, y + i * lineH);
  return y + lines.length * lineH;
}