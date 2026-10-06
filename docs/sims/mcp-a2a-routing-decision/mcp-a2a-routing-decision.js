'use strict';

const ROUTES = [
  { v: 'direct', t: '直接调用' },
  { v: 'http', t: '内部 HTTP 适配' },
  { v: 'fw', t: '框架内交接' },
  { v: 'mcp', t: 'MCP（向下）' },
  { v: 'a2a', t: 'A2A（向右）' },
  { v: 'a2aaudit', t: 'A2A 加契约加审计' }
];

const CONDS = [
  { v: 'c1', t: '调用方在运行时才知道需要什么能力' },
  { v: 'c2', t: '双方不在同一部署且不能共享内存' },
  { v: 'c3', t: '调用频率与复杂度足以抵消协议开销' }
];

const REQS = [
  {
    n: 1, text: '在你自己的 Python 进程内计算保费',
    ans: 'direct', fb: '同一进程内的函数调用不需要任何协议，套一层 MCP 只会增加序列化开销与失败面',
    hit: '三条都不命中'
  },
  {
    n: 2, text: '调用外部机构提供的合同审查 Agent，它自己调内部规则库',
    ans: 'a2a', fb: '对方是另一家机构的独立 Agent，契约与身份只能靠 A2A 承载',
    hit: null
  },
  {
    n: 3, text: '运行时才知道需要什么能力，且对方是独立服务',
    ans: 'a2a', fb: '能力未知意味着必须先做能力发现，这是 A2A 卡片机制存在的理由',
    hit: null
  },
  {
    n: 4, text: '调用自家部署的合同库检索能力',
    ans: 'mcp', fb: '连接对象是工具而非 Agent，方向自上而下，属于第六章的 MCP 范畴',
    hit: null
  },
  {
    n: 5, text: '同公司同部署的两个 Agent 之间交接任务',
    ans: 'fw', fb: '三条判定条件只满足一条（同部署），零网络开销更划算，套 A2A 是净增复杂度',
    hit: '只命中第二条'
  },
  {
    n: 6, text: '需要对方给结论并承诺截止时间与失败回报',
    ans: 'a2a', fb: '截止时间与失败回报是委托契约字段，只有 A2A 委托体承载它们',
    hit: null
  },
  {
    n: 7, text: '调用一个只暴露固定 HTTP 接口的内部服务',
    ans: 'http', fb: '能力固定且不需要发现机制，目录加一层适配比完整 A2A 更省',
    hit: '三条都不命中'
  },
  {
    n: 8, text: '跨组织协作，需要身份、隔离与结算',
    ans: 'a2aaudit', fb: '跨组织还要审计与计费归属，纯 A2A 信封不足以覆盖这些条款',
    hit: null
  }
];

const stage = document.getElementById('stage');
const controls = document.getElementById('controls');

const picked = {};
const basis = {};
const state = { locked: false, revealed: false, follow: false };
const submitted = { explain: '' };

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function routeText(v) {
  const r = ROUTES.filter(x => x.v === v)[0];
  return r ? r.t : '（未选择）';
}
function allPicked() {
  return REQS.every(r => picked[r.n]);
}
function basisCount(n) {
  return (basis[n] || []).length;
}

function renderStage() {
  let h = '<h1 class="sim-title">MCP 与 A2A 分工路由决策</h1>';
  h += '<div class="fb info">屏幕提问：同一进程内的函数、跨公司的 Agent、自家的工具，三者该走哪条路？先锁定八条，再看标准答案。</div>';

  h += '<div class="flow" style="margin:6px 0">';
  h += '<div class="node"><b>你的应用 / Agent</b></div><div class="arrow">→</div>';
  h += '<div class="node">同一进程内函数调用<br/><span class="muted">直接调用</span></div>';
  h += '<div class="arrow">↓</div>';
  h += '<div class="node"><b>MCP 向下</b><br/><span class="muted">工具与服务</span></div>';
  h += '<div class="arrow">→</div>';
  h += '<div class="node"><b>A2A 向右</b><br/><span class="muted">同侪 Agent 与外部机构</span></div>';
  h += '<div class="arrow">→</div>';
  h += '<div class="node"><b>跨组织：契约 + 审计</b></div>';
  h += '</div>';

  h += '<h2 class="stage-h">判定所依据的三个条件（任一需求至少命中两个才算依据充分）</h2>';
  h += '<div class="card" style="margin-bottom:6px">';
  CONDS.forEach(c => { h += '<div>· ' + c.t + '</div>'; });
  h += '<div class="muted">规格给定：序号 1 与 7 三条都不命中；序号 5 只命中第二条。</div>';
  h += '</div>';

  h += '<h2 class="stage-h">八条需求（路由取值限定为六项）</h2>';
  REQS.forEach(r => {
    const ok = state.revealed && picked[r.n] === r.ans;
    h += '<div class="req"' + (state.revealed ? (ok ? ' style="border-color:#2e7d32"' : ' style="border-color:#c62828"') : '') + '>';
    h += '<div class="row" style="justify-content:space-between">';
    h += '<div><b>序号 ' + r.n + '</b>　' + esc(r.text) + '</div>';
    h += '<div class="row">';
    h += '<label class="ctl">路由 <select data-n="' + r.n + '"' + (state.locked ? ' disabled' : '') + ' aria-label="序号 ' + r.n + ' 路由">';
    h += '<option value="">— 选择路由 —</option>';
    ROUTES.forEach(o => {
      const sel = picked[r.n] === o.v ? ' selected' : '';
      h += '<option value="' + o.v + '"' + sel + '>' + o.t + '</option>';
    });
    h += '</select></label>';
    if (state.revealed) {
      h += '<span class="tag ' + (ok ? 'tag-ok">正确' : 'tag-no">错误') + '</span>';
      h += '<span class="muted">你的：' + esc(routeText(picked[r.n])) + '　标准：<b>' + esc(routeText(r.ans)) + '</b></span>';
    }
    h += '</div>';
    h += '</div>';
    h += '<div class="row" style="margin-top:3px"><span class="muted" style="font-size:14px">判定依据：</span>';
    CONDS.forEach(c => {
      const on = (basis[r.n] || []).indexOf(c.v) >= 0 ? ' checked' : '';
      h += '<label class="ctl" style="font-size:14px"><input type="checkbox" data-b="' + r.n + '" data-c="' + c.v + '"' + on + (state.locked ? ' disabled' : '') + '> ' + c.v + '</label>';
    });
    h += '<span class="muted" style="font-size:14px">你勾选 ' + basisCount(r.n) + ' / 3';
    if (state.revealed) {
      h += '　规格给定：' + esc(r.hit || '未给出命中数');
    }
    h += '</span></div>';
    h += '</div>';
  });

  if (state.revealed) {
    h += '<h2 class="stage-h">逐条反馈</h2>';
    REQS.forEach(r => {
      const ok = picked[r.n] === r.ans;
      h += '<div class="fb ' + (ok ? 'ok' : 'no') + '"><b>序号 ' + r.n + '</b>　' +
        (ok ? '正确，序号 ' + r.n + ' 应路由到 ' + esc(routeText(r.ans)) + '。'
            : '先看连接对象、是否需要能力发现、是否需要契约字段，再定路由。你的：' + esc(routeText(picked[r.n])) + '；标准：' + esc(routeText(r.ans)) + '。') +
        '<br/>' + esc(r.fb) + '</div>';
    });
  }
  stage.innerHTML = h;

  stage.querySelectorAll('select[data-n]').forEach(sel => {
    sel.addEventListener('change', () => {
      const n = Number(sel.getAttribute('data-n'));
      if (sel.value === '') { delete picked[n]; } else { picked[n] = sel.value; }
      renderStage();
      renderControls();
    });
  });
  stage.querySelectorAll('input[data-b]').forEach(cb => {
    cb.addEventListener('change', () => {
      const n = Number(cb.getAttribute('data-b'));
      const c = cb.getAttribute('data-c');
      if (!basis[n]) basis[n] = [];
      const i = basis[n].indexOf(c);
      if (cb.checked && i < 0) basis[n].push(c);
      if (!cb.checked && i >= 0) basis[n].splice(i, 1);
      renderStage();
      renderControls();
    });
  });
}

function renderControls() {
  const ready = allPicked();
  let h = '<h2 class="stage-h">学习者操作区</h2>';
  h += '<div class="row">';
  h += '<button id="btnLock"' + (ready && !state.locked ? '' : ' disabled') + '>锁定八条路由并提交</button>';
  h += '<button id="btnReset">重来</button>';
  h += '<span class="muted">已选 ' + REQS.filter(r => picked[r.n]).length + ' / 8 条</span>';
  h += '</div>';

  if (state.revealed) {
    const score = REQS.filter(r => picked[r.n] === r.ans).length;
    const partialOk = REQS.filter(r => basisCount(r.n) >= 2).length;
    const maxBasis = REQS.reduce((a, r) => Math.max(a, basisCount(r.n)), 0);
    h += '<div class="fb ' + (score === 8 ? 'ok' : (score >= 7 ? 'info' : 'no')) + '">答对 <b>' + score + ' / 8</b> 分（满分 8 分，' +
      (score === 8 ? '八条全部正确，掌握。' : (score >= 7 ? '达到 7 分视为掌握；答对七条且有一条能指出正确依据为部分掌握。' : '少于 7 分需重做。')) + '</div>';
    h += '<div class="fb info">你勾选的判定依据最多命中 <b>' + maxBasis + ' / 3</b> 条，勾选数达到 2 条及以上（依据充分）的需求共 <b>' + partialOk + ' / 8</b> 条。' +
      '规格只为序号 1、5、7 给出了标准命中数，其余需求以左侧各条反馈文案为准，不做额外推断。</div>';
    h += '<div class="fb info">请特别回看序号 5 与序号 7：这两条的正确答案都是“不上 A2A”。逐条反馈见上方内容区。</div>';

    h += '<h2 class="stage-h">追问：序号 5 为什么不选 A2A（不计分，自评对照）</h2>';
    h += '<div class="row"><input type="text" id="explain" placeholder="用一句话说明理由" aria-label="序号 5 为什么不选 A2A" value="' + esc(submitted.explain) + '">';
    h += '<button id="btnFollow">对照标准反馈</button></div>';
    h += '<div id="followResult"></div>';
    if (state.follow) {
      const r5 = REQS.filter(x => x.n === 5)[0];
      h += '<div class="fb info">标准反馈：' + esc(r5.fb) + '。规格给定的命中情况为“' + esc(r5.hit) + '”，也就是说它连“依据充分”的两个条件都凑不齐。</div>';
    }
  }

  controls.innerHTML = h;

  const b1 = document.getElementById('btnLock');
  if (b1) b1.addEventListener('click', () => {
    state.locked = true;
    state.revealed = true;
    renderStage();
    renderControls();
  });
  const b2 = document.getElementById('btnReset');
  if (b2) b2.addEventListener('click', () => {
    REQS.forEach(r => { delete picked[r.n]; delete basis[r.n]; });
    state.locked = false; state.revealed = false; state.follow = false;
    submitted.explain = '';
    renderStage();
    renderControls();
  });
  const b3 = document.getElementById('btnFollow');
  if (b3) b3.addEventListener('click', () => {
    const el = document.getElementById('explain');
    submitted.explain = el ? el.value : '';
    state.follow = true;
    renderControls();
  });
}

renderStage();
renderControls();
