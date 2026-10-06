// 幻觉抑制策略效果对比 — Hallucination Guard Tradeoff
// 教学目标：按四道质量门禁逐条评判六种配置的合格性，并选出唯一可上线的一种配置。
// 规格来源：docs/chapters/04-rag-advanced/index.md 的 hallucination-guard-tradeoff 规格块

// ---- 布局计算（先算再写码）----
// 控件清单：1 个下拉框（判定项）+ 1 组单选（判定值）+ 2 个按钮，共 3 行
// controlHeight = (3 * 35) + 10 = 115
// drawHeight = 450；canvasHeight = 450 + 115 = 565；iframeHeight = 567
// 行分配：第 1 行判定项下拉框 / 第 2 行判定值单选组 / 第 3 行按钮

let canvasWidth = 800;
let drawHeight = 450;
let controlHeight = 115;
let canvasHeight = drawHeight + controlHeight;
let margin = 25;
let controlLeft = 150;
let defaultTextSize = 16;

// ---- 四道门禁（规格块 Rules）----
const GATE_FID = 0.93;      // 忠实度 >=
const GATE_ABSTAIN = 0.90;  // 拒答准确率 >=
const GATE_P95 = 4.5;       // P95 延迟 <= 秒
const GATE_COST = 0.02;     // 每次成功问答成本 <= 元（示意价）

// ---- 六种配置（规格块 Content 表）----
const CONFIGS = [
  {
    no: 1, name: '裸 RAG', fid: 0.82, abst: 0.55, p95: 3.2, cost: 0.011,
    verdict: '不合格',
    fb: '忠实度 82% 差 11 个百分点、拒答准确率 55% 差 35 个百分点，两条门禁都没过；延迟与成本虽在预算内但换不来任何质量。'
  },
  {
    no: 2, name: '只加引用约束', fid: 0.89, abst: 0.55, p95: 3.3, cost: 0.012,
    verdict: '不合格',
    fb: '引用约束只把忠实度从 82% 抬到 89%，仍差 4 个百分点；拒答准确率完全没动，因为它约束的是「怎么说」而不是「该不该说」。'
  },
  {
    no: 3, name: '只加阈值拒答', fid: 0.82, abst: 0.81, p95: 3.2, cost: 0.011,
    verdict: '不合格',
    fb: '阈值拒答把拒答准确率从 55% 抬到 81%，是单项收益最大的一招，但离 90% 还差 9 个百分点；忠实度一行都没变。'
  },
  {
    no: 4, name: '只加二次校验', fid: 0.94, abst: 0.88, p95: 4.6, cost: 0.019,
    verdict: '不合格',
    fb: '忠实度 94% 达标，但 P95 4.6 秒超 4.5 秒，拒答准确率 88% 还差 2 个百分点——二次校验只核对已有答案，管不到该不该开口。'
  },
  {
    no: 5, name: '三层全开', fid: 0.96, abst: 0.92, p95: 4.9, cost: 0.021,
    verdict: '不合格',
    fb: '两条质量门禁都过了，但 P95 4.9 秒超 0.4 秒、成本 0.021 元超 0.001 元，效果最好的配置卡在预算上，不能直接上线。'
  },
  {
    no: 6, name: '按意图分级开关', fid: 0.94, abst: 0.92, p95: 3.9, cost: 0.016,
    verdict: '合格',
    fb: '唯一四项全过的配置：高风险意图承担全部校验成本，其余意图只走便宜的引用约束加阈值拒答，成本比配置 5 低 0.005 元而质量指标持平。'
  }
];
const FINAL_ANSWER = 6;
const VERDICT_OPTS = ['合格', '不合格'];

let itemSel, verdictSel;
let submitBtn, resetBtn;
let locked = {};        // key -> {pick, ok}
let revealed = false;

function isQualified(c) {
  return c.fid >= GATE_FID && c.abst >= GATE_ABSTAIN &&
         c.p95 <= GATE_P95 && c.cost <= GATE_COST;
}

function finalOptions() {
  return CONFIGS.map(c => '配置 ' + c.no + '（' + c.name + '）');
}

function setup() {
  updateCanvasSize(); // 必须是 setup 的第一句
  const canvas = createCanvas(canvasWidth, canvasHeight);
  canvas.parent(document.querySelector('main')); // 绝不能用 canvas.parent('main')

  itemSel = createSelect();
  itemSel.parent(document.querySelector('main'));
  itemSel.position(110, drawHeight + 5);
  itemSel.size(canvasWidth - 120);
  for (const c of CONFIGS) itemSel.option('行' + c.no + '：' + c.name, 'row' + c.no);
  itemSel.option('★ 最终上线配置', 'final');
  itemSel.attribute('aria-label', '判定项');
  itemSel.changed(refreshOptions);

  submitBtn = createButton('提交判定');
  submitBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  submitBtn.position(10, drawHeight + 78);
  submitBtn.mousePressed(submitVerdict);

  resetBtn = createButton('重来');
  resetBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  resetBtn.position(130, drawHeight + 78);
  resetBtn.mousePressed(resetAll);

  refreshOptions();

  describe('交互式评测台：四道质量门禁与六种幻觉抑制配置。先逐行给出合格或不合格判定，再提交最终上线配置。');
}

function refreshOptions() {
  const isFinal = itemSel.value() === 'final';
  const opts = isFinal ? finalOptions() : VERDICT_OPTS;
  if (typeof verdictSel !== 'undefined' && verdictSel) verdictSel.remove();
  verdictSel = createSelect();
  verdictSel.parent(document.querySelector('main'));
  verdictSel.position(controlLeft, drawHeight + 40);
  verdictSel.size(canvasWidth - controlLeft - margin);
  for (const o of opts) verdictSel.option(o, o);
  verdictSel.attribute('aria-label', '判定值');
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
  text('幻觉抑制策略效果对比', canvasWidth / 2, 10);
  textAlign(LEFT, TOP);
  textSize(defaultTextSize);

  drawGates(48);
  drawTable(104);
  drawFeedback(308);
  drawControls();
}

function drawGates(y) {
  fill(60);
  textSize(14);
  drawWrapped('四道门禁同时生效：忠实度 ≥ 93%　|　拒答准确率 ≥ 90%　|　P95 延迟 ≤ 4.5 秒　|　' +
    '每次成功问答成本 ≤ 0.02 元（示意价）　—— 四项全过才算合格，任一项不达标即不合格。',
    margin, y, charsPerLine(), 18);
}

function drawTable(top) {
  const xs = [28, 64, 208, 288, 396, 480, 560];
  const heads = ['序号', '配置', '忠实度', '拒答准确率', 'P95(秒)', '成本(元)', '你的判定'];
  textSize(13);
  textStyle(BOLD);
  for (let i = 0; i < heads.length; i++) text(heads[i], xs[i], top);
  stroke(200);
  line(margin, top + 18, canvasWidth - margin, top + 18);
  noStroke();
  textStyle(NORMAL);

  for (let i = 0; i < CONFIGS.length; i++) {
    const c = CONFIGS[i];
    const y = top + 26 + i * 24;
    text(String(c.no), xs[0], y);
    text(c.name, xs[1], y);
    text(pct(c.fid), xs[2], y);
    text(pct(c.abst), xs[3], y);
    text(c.p95.toFixed(1), xs[4], y);
    text(c.cost.toFixed(3), xs[5], y);

    const lk = locked['row' + c.no];
    if (lk) {
      const ok = lk.ok;
      fill(ok ? 'darkgreen' : 'darkred');
      text((ok ? '✓ ' : '✗ ') + lk.pick + (revealed ? '（标准：' + c.verdict + '）' : ''), xs[6], y);
      fill('black');
    } else {
      fill(130);
      text('待判定', xs[6], y);
      fill('black');
    }
  }

  // 门禁逐项标红
  textSize(12);
  fill(150);
  text('门禁对照：忠实度低于 93% 或拒答准确率低于 90% 或 P95 高于 4.5 秒或成本高于 0.02 元，任一成立即不合格。',
       margin, top + 26 + CONFIGS.length * 24 + 8);
}

function pct(v) { return Math.round(v * 100) + '%'; }

function drawFeedback(top) {
  const cpl = charsPerLine();
  let y = top;
  fill('black');
  textSize(14);
  text('屏幕提问：四道门禁、零超标才算合格。哪一条配置能真的放出去？', margin, y);
  y += 22;

  const lk = locked['final'];
  if (lk) {
    fill(lk.ok ? 'darkgreen' : 'darkred');
    text('最终选择 ' + lk.pick + (lk.ok ? ' —— 配置 6 可上线：94% 忠实度、92% 拒答准确率、P95 3.9 秒、成本 0.016 元，四项门禁全过。'
                                       : ' —— 效果最好的配置未必付得起。'), margin, y);
    fill('black');
    y += 22;
  } else {
    fill(110);
    text('逐行提交合格 / 不合格判定，再提交最终上线配置；判定锁定后才揭晓门禁明细。', margin, y);
    y += 22;
  }

  // 只展示当前判定项的明细，避免一次铺开六段长文案
  const curKey = itemSel.value();
  if (curKey !== 'final') {
    const c = CONFIGS[parseInt(curKey.slice(3), 10) - 1];
    const l = locked[curKey];
    if (l && (revealed || !l.ok)) {
      y = drawWrapped('行 ' + c.no + ' ' + c.name + '（' + l.pick + '）：' +
        (l.ok ? '判定正确：' + c.verdict + '。' : '再看一眼被卡住的那条门禁。') +
        (revealed ? '（忠实度 ' + pct(c.fid) + '、拒答准确率 ' + pct(c.abst) + '、P95 ' +
          c.p95.toFixed(1) + ' 秒、成本 ' + c.cost.toFixed(3) + ' 元）' : '') +
        c.fb, margin, y, cpl, 18) + 6;
    }
  }
  if (revealed) {
    fill(30);
    const nc = Object.keys(locked).filter(k => k !== 'final' && locked[k].ok).length;
    text('判定答对 ' + nc + ' / 6，选型答对 ' + (lk && lk.ok ? 1 : 0) + ' / 1', margin, y + 4);
  }
}

function drawControls() {
  fill('black');
  noStroke();
  textAlign(LEFT, CENTER); // 控件区标签按行垂直居中，避免压住 HTML 控件
  textSize(14);
  text('判定项 →', 10, drawHeight + 15);
  text('判定值 →', 10, drawHeight + 50);
  textAlign(LEFT, TOP); // 还原为顶端对齐

}

function submitVerdict() {
  if (revealed) return;
  const key = itemSel.value();
  const pick = verdictSel.value();
  const isFinal = key === 'final';
  let ok;
  if (isFinal) {
    const m = /^配置 (\d+)/.exec(pick);
    ok = !!m && parseInt(m[1], 10) === FINAL_ANSWER;
  } else {
    const c = CONFIGS[parseInt(key.slice(3), 10) - 1];
    ok = pick === c.verdict;
  }
  locked[key] = { pick: pick, ok: ok };
  checkAllLocked();
}

function checkAllLocked() {
  let n = 0;
  for (const c of CONFIGS) if (locked['row' + c.no]) n++;
  if (n === CONFIGS.length && locked['final']) revealed = true;
}

function resetAll() {
  locked = {};
  revealed = false;
  itemSel.value('row1');
  refreshOptions();
}

function windowResized() {
  updateCanvasSize();
  resizeCanvas(canvasWidth, canvasHeight);
}

function updateCanvasSize() {
  const container = document.querySelector('main');
  if (container) {
    canvasWidth = container.offsetWidth;
    // setup() 的第一句会调用本函数，那时控件尚未创建，必须守卫
    if (typeof itemSel !== 'undefined' && itemSel) {
      itemSel.size(canvasWidth - 120);
      if (verdictSel) verdictSel.size(canvasWidth - controlLeft - margin);
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