// 任务编排状态机演示 — Orchestration State Machine
// 教学目标：学习者逐步推演 12 条事件序列，预测终态并找出全部非法转移
// 规格来源：docs/chapters/07-multi-agent/index.md 的 orchestration-state-machine 规格块
// 五个状态与 11 条合法转移定义于正文"任务状态机"一节

// ---- 布局计算（先算再写码）----
// 控件：状态图区（无控件）+ 控件区 2 行（按钮 + 两题输入）
// controlHeight = (2 * 35) + 10 = 80
// drawHeight = 380；canvasHeight = 380 + 80 = 460；iframeHeight = 462

let canvasWidth = 900;
let drawHeight = 380;
let controlHeight = 80;
let canvasHeight = drawHeight + controlHeight;
let margin = 20;
let defaultTextSize = 15;

// ---- 五个状态 ----
const STATES = ['待执行', '执行中', '阻塞待人', '已完成', '已失败'];
const STATE_KEY = { '待执行': 'pending', '执行中': 'running', '阻塞待人': 'blocked', '已完成': 'done', '已失败': 'failed' };

// ---- 11 条合法转移（正文表格）----
const LEGAL = {
  'pending': ['running', 'blocked', 'failed'],
  'running': ['running', 'done', 'blocked', 'failed'],
  'blocked': ['running', 'failed'],
  'failed':  ['pending'],
  'done':    ['running']
};

// ---- 12 条事件序列（规格块 Content，合成数据种子 20261006）----
// legal: null 表示规格块给的合法性；after: 转移后状态；illegal: 真实判定非法
const EVENTS = [
  { no: 1,  ev: '任务创建',                        before: '初始',     legal: true,  after: '待执行',   why: '新任务一律从待执行开始，不存在直接进执行中的入口。' },
  { no: 2,  ev: '编排器直接标记任务完成，跳过执行者', before: '待执行',   legal: false, after: '待执行',   why: '待执行不能直接到已完成，中间必须有执行者领取并通过交接单校验。' },
  { no: 3,  ev: '执行者领取任务',                    before: '待执行',   legal: true,  after: '执行中',   why: '领取时要抢租约，防止两个执行者领同一个任务。' },
  { no: 4,  ev: '反思重做',                        before: '执行中',   legal: true,  after: '执行中',   why: '自转移合法，且不消耗重试计数，这是它与重试的关键区别。' },
  { no: 5,  ev: '交接单校验失败，缺验收标准字段',      before: '执行中',   legal: true,  after: '已失败',   why: '校验失败属于结构失败，直接判失败并保留原始交接单供排查。' },
  { no: 6,  ev: '人工重排，重试计数清零',            before: '已失败',   legal: true,  after: '待执行',   why: '重排必须清零计数，否则重排后的任务一失败就再也起不来。' },
  { no: 7,  ev: '计划者请求人工确认执行范围',        before: '待执行',   legal: true,  after: '阻塞待人', why: '阻塞态不占并发额度，但必须带超时，超时按默认选项放行。' },
  { no: 8,  ev: '人工放行',                        before: '阻塞待人', legal: true,  after: '执行中',   why: '每次裁决都要留痕，事后可统计人工裁决与模型判断的一致率。' },
  { no: 9,  ev: '交接单通过校验',                   before: '执行中',   legal: true,  after: '已完成',   why: '只有校验通过才能进已完成，这是状态机唯一通向完成的边。' },
  { no: 10, ev: '合规审稿人打回，违反禁止事项第 2 条', before: '已完成',   legal: true,  after: '执行中',   why: '已完成回退到执行中只属于审稿人模式，其他模式应把这条边关掉。' },
  { no: 11, ev: '重试次数耗尽，已用 3 次',          before: '执行中',   legal: true,  after: '已失败',   why: '耗尽必须转人工，不能靠继续重试掩盖根因。' },
  { no: 12, ev: '失败任务被直接标记完成',            before: '已失败',   legal: false, after: '已失败',   why: '已失败唯一能去的地方是待执行，不存在直达已完成的边。' }
];

const ANSWER_TERMINAL = '已失败';
const ANSWER_ILLEGAL = [2, 12];

let lockBtn, checkBtn, resetBtn, termInput, illegalInput;
let locked = false;
let revealed = false;
let attempts = 0;
let correctCount = 0;
let feedback = '';
let feedbackOk = false;
let marks = {};   // 逐条推演的勾选结果：{no: true/false}

function setup() {
  updateCanvasSize(); // 必须第一句
  const canvas = createCanvas(canvasWidth, canvasHeight);
  canvas.parent(document.querySelector('main'));

  lockBtn = createButton('锁定我的预测');
  lockBtn.position(10, drawHeight + 5);
  lockBtn.mousePressed(lockPredictions);

  checkBtn = createButton('检查答案');
  checkBtn.position(140, drawHeight + 5);
  checkBtn.mousePressed(checkAnswers);

  resetBtn = createButton('重来');
  resetBtn.position(250, drawHeight + 5);
  resetBtn.mousePressed(resetAll);

  termInput = createInput('', 'text');
  termInput.parent(document.querySelector('main'));
  termInput.position(120, drawHeight + 42);
  termInput.size(110);
  termInput.attribute('aria-label', '预测终态');
  termInput.attribute('placeholder', '终态');

  illegalInput = createInput('', 'text');
  illegalInput.parent(document.querySelector('main'));
  illegalInput.position(330, drawHeight + 42);
  illegalInput.size(150);
  illegalInput.attribute('aria-label', '预测非法转移序号，用逗号分隔');
  illegalInput.attribute('placeholder', '非法序号，如 2, 12');

  describe('任务编排状态机演示：先预测 12 步后的终态与两条非法转移，锁定后逐条推演验证。');
}

function draw() {
  updateCanvasSize();

  fill('aliceblue');
  stroke('silver');
  rect(0, 0, canvasWidth, drawHeight);
  fill('white');
  rect(0, drawHeight, canvasWidth, controlHeight);

  fill('black');
  textSize(22);
  textAlign(CENTER, TOP);
  noStroke();
  text('任务编排状态机演示', canvasWidth / 2, 8);
  textAlign(LEFT, CENTER);
  textSize(defaultTextSize);

  drawStateGraph();
  drawEventTable();
  drawFeedback();
}

function drawStateGraph() {
  // 五状态横向排开，高亮当前推演到的状态
  const w = Math.min(110, (canvasWidth - 2 * margin) / 5 - 10);
  const gap = (canvasWidth - 2 * margin - 5 * w) / 4;
  const y = 42;
  const cur = revealed ? EVENTS[Math.min(11, stepIndex())].before : null;

  for (let i = 0; i < STATES.length; i++) {
    const x = margin + i * (w + gap);
    const isCur = (cur === STATES[i]);
    fill(isCur ? 'navy' : 'white');
    stroke('darkslategray');
    rect(x, y, w, 30, 8);
    fill(isCur ? 'white' : 'black');
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(14);
    text(STATES[i], x + w / 2, y + 16);
    textAlign(LEFT, CENTER);
    textSize(defaultTextSize);
  }

  // 合法转移集合提示
  noStroke();
  fill(70);
  text('合法转移：' + STATES.map(s => s + '→' + LEGAL[STATE_KEY[s]].map(k => k).join('/')).join('　'), margin, 86);
  textSize(13);
  text('（running→running 是反思重做，不消耗重试计数；done→running 只属于审稿人模式）', margin, 106);
  textSize(defaultTextSize);
}

function stepIndex() {
  for (let i = EVENTS.length - 1; i >= 0; i--) {
    if (marks[EVENTS[i].no] !== undefined) return i;
  }
  return 0;
}

function drawEventTable() {
  const top = 126;
  const rowH = 19;
  noStroke();
  textSize(14);
  fill('black');
  text('事件序列（状态列与合法性列在锁定前隐藏）', margin, top);

  textSize(13);
  for (let i = 0; i < EVENTS.length; i++) {
    const e = EVENTS[i];
    const y = top + 22 + i * rowH;
    if (y > drawHeight - 6) break;
    const isIllegal = !e.legal;
    const marked = marks[e.no];
    // 未揭晓前不按合法性着色，否则等于提前泄露答案（先预测是本章的核心设计）
    const showMark = revealed;
    fill(!revealed ? (i % 2 ? 'white' : 'aliceblue')
          : (isIllegal ? 'mistyrose' : (i % 2 ? 'white' : 'aliceblue')));
    stroke('lightgray');
    rect(margin, y - 8, canvasWidth - 2 * margin, rowH - 2, 4);

    fill(!revealed ? 'black' : (isIllegal ? 'darkred' : 'black'));
    noStroke();
    textAlign(LEFT, CENTER);
    text(String(e.no), margin + 6, y);
    textAlign(LEFT, CENTER);
    text(e.ev, margin + 26, y);

    // 状态列：锁定并揭晓后显示
    if (revealed) {
      textAlign(CENTER, CENTER);
      fill(isIllegal ? 'darkred' : 'darkgreen');
      text(e.before + ' → ' + e.after, margin + 430, y);
      text(isIllegal ? '非法' : '合法', margin + 610, y);
    } else if (locked) {
      fill(120);
      text('（已隐藏）', margin + 430, y);
    } else {
      fill(120);
      text('（待预测）', margin + 430, y);
    }
    textAlign(LEFT, CENTER);

    // 学习者的逐条推演勾选
    if (locked && !revealed) {
      fill('black');
      text(marked === undefined ? '○ 未判' : (marked ? '● 合法' : '○ 非法'),
           margin + 700, y);
    }
  }
  textSize(defaultTextSize);
}

function drawFeedback() {
  if (!feedback) return;
  // 反馈画在控件区顶部，避免压住事件表最后一行
  noStroke();
  fill(feedbackOk ? 'darkgreen' : 'darkred');
  textSize(14);
  textAlign(LEFT, CENTER);
  text(feedback.slice(0, 90), margin, drawHeight + 68);
  textSize(defaultTextSize);
}

function lockPredictions() {
  locked = true;
  feedback = '';
  feedbackOk = false;
}

function checkAnswers() {
  if (!locked) { feedback = '请先点"锁定我的预测"，锁定后才揭晓。'; feedbackOk = false; return; }
  if (revealed) return;
  attempts++;

  const termRaw = termInput.value().trim();
  const illRaw = illegalInput.value().trim();
  const termOk = termRaw === ANSWER_TERMINAL;
  // 非法序号解析：允许 2,12 / 2、12 / 2 12
  const illParsed = illRaw.split(/[,，\s]+/).filter(s => s !== '').map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
  const illOk = illParsed.length === ANSWER_ILLEGAL.length &&
                illParsed.every((v, i) => v === ANSWER_ILLEGAL[i]);

  if (termOk && illOk) {
    correctCount = 2;
    feedbackOk = true;
    feedback = '正确：终态是已失败；非法转移在序号 2 与 12。判据：已失败任务不能直接跳到已完成。';
    revealed = true;
  } else if (attempts >= 2) {
    correctCount = termOk ? 1 : 0;
    feedbackOk = false;
    feedback = '两次机会已用完，本题记为失手。标准答案：终态 已失败；非法序号 2 与 12。';
    revealed = true;
  } else {
    feedbackOk = false;
    if (!termOk && !illOk) {
      feedback = '终态与非法序号都不对。看第 11 步重试耗尽之后还能去哪一格，还有 1 次机会。';
    } else if (!termOk) {
      feedback = '终态不对。第 11 步重试耗尽转已失败，第 12 步没有合法出路，还有 1 次机会。';
    } else {
      feedback = '终态对了，但非法序号不对。逐条看：哪两步的目标状态不在合法转移集合内？还有 1 次机会。';
    }
  }
}

function resetAll() {
  locked = false; revealed = false; attempts = 0; correctCount = 0;
  feedback = ''; feedbackOk = false; marks = {};
  termInput.value(''); illegalInput.value('');
}

function windowResized() {
  updateCanvasSize();
  resizeCanvas(canvasWidth, canvasHeight);
}

function updateCanvasSize() {
  const container = document.querySelector('main');
  if (container) {
    canvasWidth = container.offsetWidth;
  }
}