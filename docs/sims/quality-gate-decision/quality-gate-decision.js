// 上线质量门禁判定 — Quality Gate Decision
// 教学目标：对六个候选版本的四项指标逐条判定是否放行，并在四条门禁约束下选出唯一可发布版本。
// 规格来源：docs/chapters/11-observability-eval/index.md 的 quality-gate-decision 规格块

// ---- 布局计算（先算再写码）----
// 控件清单：1 个下拉框（判定项）+ 1 个下拉框（判定值）+ 2 个按钮，共 2 行
// controlHeight = (2 * 35) + 10 = 80
// drawHeight = 470；canvasHeight = 470 + 80 = 550；iframeHeight = 552
// 行分配：第 1 行判定项下拉框 / 第 2 行判定值下拉框 + 按钮

let canvasWidth = 800;
let drawHeight = 470;
let controlHeight = 80;
let canvasHeight = drawHeight + controlHeight;
let margin = 25;
let defaultTextSize = 16;

// ---- 四道门禁（规格块 Rules）----
const GATE_ACC = 0.85;    // 答案正确率 >=
const GATE_HALL = 0.05;   // 幻觉率 <=
const GATE_P95 = 3.00;    // 端到端 P95 延迟 <= 秒
const GATE_COST = 0.030;  // 单次问答成本 <= 元（示意价）

// ---- 六种候选配置（规格块 Content 表）----
const VERSIONS = [
  {
    no: 1, name: 'v1.2.0 基线，不做任何改动', acc: 0.83, hall: 0.09, p95: 3.35, cost: 0.0338,
    verdict: '不合格',
    fb: '四条门禁全不达标：正确率差 0.02、幻觉率高 0.04、P95 超 0.35 秒、成本超 0.0038 元。这是发布前的原始状态，正是本章要修的对象。'
  },
  {
    no: 2, name: 'v1.3.0 全量（四项优化同时上）', acc: 0.89, hall: 0.04, p95: 2.54, cost: 0.0285,
    verdict: '合格',
    fb: '唯一四项全过的配置：正确率超出阈值 0.04，幻觉率低 0.01，P95 留出 0.46 秒余量，成本留出 0.0015 元余量。'
  },
  {
    no: 3, name: 'v1.3.0 仅优化提示词', acc: 0.88, hall: 0.05, p95: 3.28, cost: 0.0334,
    verdict: '不合格',
    fb: '提示词确实治生成，正确率 0.88 达标、幻觉率 0.05 恰好压在阈值上按通过计；但它不碰延迟也不碰 token，P95 超 0.28 秒、成本超 0.0034 元。'
  },
  {
    no: 4, name: 'v1.3.0 仅换重排模型', acc: 0.86, hall: 0.08, p95: 3.31, cost: 0.0338,
    verdict: '不合格',
    fb: '换重排模型把 11 道重排类错题救回一半，正确率 0.86 达标；但幻觉率只降了 0.01（生成侧没动），P95 和成本原地不动。'
  },
  {
    no: 5, name: 'v1.3.0 仅并行化工具调用', acc: 0.83, hall: 0.09, p95: 2.95, cost: 0.0338,
    verdict: '不合格',
    fb: '并行化只救延迟这一项，P95 2.95 秒达标；正确率与幻觉率完全没动，token 也不变所以成本不变。这是纯工程优化，不是质量优化。'
  },
  {
    no: 6, name: 'v1.3.0 激进压缩上下文', acc: 0.80, hall: 0.03, p95: 2.61, cost: 0.0271,
    verdict: '不合格',
    fb: '三项达标且幻觉率 0.03 优于合格配置，但正确率 0.80 跌破 0.85 底线——幻觉率是靠「上下文给得太少、模型不敢答」降下来的，是把风险从错误答案转成了无用答案。'
  }
];
const FINAL_ANSWER = 2;
const VERDICT_OPTS = ['合格', '不合格'];

function isQualified(v) {
  return v.acc >= GATE_ACC && v.hall <= GATE_HALL &&
         v.p95 <= GATE_P95 && v.cost <= GATE_COST;
}
function failedGates(v) {
  const out = [];
  if (v.acc < GATE_ACC) out.push('正确率');
  if (v.hall > GATE_HALL) out.push('幻觉率');
  if (v.p95 > GATE_P95) out.push('P95');
  if (v.cost > GATE_COST) out.push('成本');
  return out;
}

let itemSel, valSel;
let submitBtn, resetBtn;
let locked = {};
let revealed = false;

function finalOptions() {
  return VERSIONS.map(v => '序号 ' + v.no + '（' + v.name + '）');
}

function setup() {
  updateCanvasSize(); // 必须是 setup 的第一句
  const canvas = createCanvas(canvasWidth, canvasHeight);
  canvas.parent(document.querySelector('main')); // 绝不能用 canvas.parent('main')

  itemSel = createSelect();
  itemSel.parent(document.querySelector('main'));
  itemSel.position(110, drawHeight + 5);
  itemSel.size(canvasWidth - 120);
  for (const v of VERSIONS) itemSel.option('序号 ' + v.no + '：' + v.name, 'v' + v.no);
  itemSel.option('★ 最终发布版本', 'final');
  itemSel.attribute('aria-label', '判定项');
  itemSel.changed(refreshValues);

  submitBtn = createButton('提交判定');
  submitBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  submitBtn.position(canvasWidth - 250, drawHeight + 40);
  submitBtn.mousePressed(submitVerdict);

  resetBtn = createButton('重来');
  resetBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  resetBtn.position(canvasWidth - 150, drawHeight + 40);
  resetBtn.mousePressed(resetAll);

  refreshValues();

  describe('交互式发布评审台：四道门禁与六种候选版本配置。先逐条判定合格或不合格，' +
    '再提交最终发布版本，全部锁定后揭晓被卡住的门禁。');
}

function refreshValues() {
  const opts = itemSel.value() === 'final' ? finalOptions() : VERDICT_OPTS;
  if (typeof valSel !== 'undefined' && valSel) valSel.remove();
  valSel = createSelect();
  valSel.parent(document.querySelector('main'));
  valSel.position(150, drawHeight + 40);
  valSel.size(canvasWidth - 420);
  for (const o of opts) valSel.option(o, o);
  valSel.attribute('aria-label', '判定值');
  if (typeof submitBtn !== 'undefined' && submitBtn) {
    submitBtn.position(canvasWidth - 250, drawHeight + 40);
    resetBtn.position(canvasWidth - 150, drawHeight + 40);
  }
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
  text('上线质量门禁判定', canvasWidth / 2, 10);
  textAlign(LEFT, TOP);
  textSize(defaultTextSize);

  drawGates(44);
  drawTable(104);
  drawFeedback(322);
  drawControls();
}

function drawGates(y) {
  fill(60);
  textSize(14);
  drawWrapped('四道门禁同时生效：答案正确率 ≥ 0.85　|　幻觉率 ≤ 0.05　|　端到端 P95 延迟 ≤ 3.00 秒　|　' +
    '单次问答成本 ≤ 0.030 元（示意价）　—— 四项全过才算合格，任一项不达标即阻断发布。',
    margin, y, charsPerLine(), 18);
  fill('black');
}

function drawTable(top) {
  const xs = [28, 56, 330, 400, 466, 536, 610];
  const heads = ['序号', '版本配置', '正确率', '幻觉率', 'P95(秒)', '成本(元)', '你的判定'];
  textSize(13);
  textStyle(BOLD);
  for (let i = 0; i < heads.length; i++) text(heads[i], xs[i], top);
  stroke(200);
  line(margin, top + 18, canvasWidth - margin, top + 18);
  noStroke();
  textStyle(NORMAL);

  for (let i = 0; i < VERSIONS.length; i++) {
    const v = VERSIONS[i];
    const y = top + 26 + i * 24;
    text(String(v.no), xs[0], y);
    text(v.name, xs[1], y);
    text(v.acc.toFixed(2), xs[2], y);
    text(v.hall.toFixed(2), xs[3], y);
    text(v.p95.toFixed(2), xs[4], y);
    text(v.cost.toFixed(4), xs[5], y);
    const lk = locked['v' + v.no];
    if (lk) {
      fill(lk.ok ? 'darkgreen' : 'darkred');
      text((lk.ok ? '✓ ' : '✗ ') + lk.pick, xs[6], y);
      fill('black');
    } else { fill(130); text('待判定', xs[6], y); fill('black'); }
  }

  textSize(12);
  fill(120);
  const cpl12 = Math.max(16, Math.floor((canvasWidth - margin * 2) / 12));
  drawWrapped('边界规则：任一项恰好等于阈值（正确率 0.85、幻觉率 0.05、P95 3.00 秒、成本 0.030 元）判为通过；' +
    '序号 3 的幻觉率 0.05 按此规则通过，该行仍不合格的原因是 P95 与成本两项。豁免最多 1 条、失效 7 天、必须带处置手册链接。',
    margin, top + 26 + VERSIONS.length * 24 + 6, cpl12, 16);
}

function drawFeedback(top) {
  const cpl = charsPerLine();
  let y = top;
  textSize(14);
  fill('black');
  text('屏幕提问：六种配置，一种能发——先逐条判合格，再选版本。', margin, y);
  y += 22;

  const lk = locked['final'];
  if (lk) {
    fill(lk.ok ? 'darkgreen' : 'darkred');
    text(lk.ok
      ? 'v1.3.0 全量配置可发布：0.89 正确率、0.04 幻觉率、P95 2.54 秒、成本 0.0285 元。'
      : '分数高不等于付得起也不等于答对。', margin, y);
    fill('black');
    y += 22;
  } else {
    fill(110);
    text('逐条提交合格 / 不合格判定，再提交最终发布版本；判定锁定后才揭晓被卡住的门禁。', margin, y);
    y += 22;
  }

  const curKey = itemSel.value();
  if (curKey !== 'final') {
    const v = VERSIONS[parseInt(curKey.slice(1), 10) - 1];
    const l = locked[curKey];
    if (l && (revealed || !l.ok)) {
      y = drawWrapped('序号 ' + v.no + ' ' + v.name + '（' + l.pick + '）：' +
        (l.ok ? '判定正确：' + v.verdict + '。' : '把四项门禁逐条对着这一行过一遍，看卡在哪一条。') +
        (revealed ? '被卡住的门禁：' + (failedGates(v).length ? failedGates(v).join('、') : '无（四项全过）') + '。' : '') +
        v.fb, margin, y, cpl, 18) + 6;
    }
  }

  if (revealed) {
    fill(30);
    const nc = VERSIONS.filter(v => locked['v' + v.no] && locked['v' + v.no].ok).length;
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
  const pick = valSel.value();
  let ok;
  if (key === 'final') {
    const m = /^序号 (\d+)/.exec(pick);
    ok = !!m && parseInt(m[1], 10) === FINAL_ANSWER;
  } else {
    const v = VERSIONS[parseInt(key.slice(1), 10) - 1];
    ok = pick === v.verdict;
  }
  locked[key] = { pick: pick, ok: ok };
  let n = 0;
  for (const v of VERSIONS) if (locked['v' + v.no]) n++;
  if (n === VERSIONS.length && locked['final']) revealed = true;
}

function resetAll() {
  locked = {};
  revealed = false;
  itemSel.value('v1');
  refreshValues();
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
      if (valSel) valSel.size(Math.max(200, canvasWidth - 420));
      if (submitBtn) submitBtn.position(canvasWidth - 250, drawHeight + 40);
      if (resetBtn) resetBtn.position(canvasWidth - 150, drawHeight + 40);
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