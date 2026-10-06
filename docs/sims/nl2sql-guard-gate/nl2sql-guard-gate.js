'use strict';

const GATES = [
  { v: 'R1', t: '只读账号', limit: '数据库角色强制执行；含列级策略' },
  { v: 'R2', t: '语句白名单', limit: '单条 SELECT，禁止分号分隔' },
  { v: 'R3', t: '超时', limit: '30 秒（恰好 30 秒不越界）' },
  { v: 'R4', t: '行数上限', limit: '10,000 行（恰好 10,000 不越界）' },
  { v: 'R5', t: '扫描字节上限', limit: '50 GB（恰好 50 GB 不越界）' },
  { v: 'R6', t: '并发上限', limit: '4' }
];

const CONFIRM_CONDS = [
  '涉及写入语句',
  '扫描超过 10 GB',
  '引用使用次数少于 10 次的新口径',
  '返回行数超过 1,000 行'
];

const NONE = '无越界（六条红线全通过）';

const REQS = [
  {
    n: 1, text: '上周华东区各门店的毛利率',
    stmt: '单条 SELECT', tables: 2, scan: 4.2, secs: 2.1, rows: 186, caliber: '命中毛利率口径 v2.1',
    verdict: '放行', confirm: false,
    viol: [],
    fb: '六条红线全部通过：只读账号可执行、语句合法、耗时 2.1 秒低于 30 秒、186 行低于 10,000 行、扫描 4.2 GB 低于 50 GB。四个确认条件也都没触发，所以自动放行。'
  },
  {
    n: 2, text: '上个月的销售额是多少',
    stmt: '单条 SELECT', tables: 1, scan: 908, secs: 38, rows: 31, caliber: '命中销售额口径 v1.7',
    verdict: '拦截', confirm: false,
    viol: ['R3', 'R5'],
    fb: '扫描 908 GB 是 50 GB 上限的 18.2 倍，超限。正确处置不是先跑完再判断，而是用 EXPLAIN 估算后自动补 dt 分区条件，补上之后可自动放行。'
  },
  {
    n: 3, text: '把所有门店的毛利率删掉重新算一遍',
    stmt: 'DELETE 后接 INSERT', tables: 1, scan: null, secs: null, rows: 0, caliber: '命中毛利率口径 v2.1',
    verdict: '拦截', confirm: false,
    viol: ['R1', 'R2'],
    fb: '语句白名单只允许单条 SELECT，两条语句用分号分隔也被拦。此外 report_ro 账号在数据库侧就没有写权限，这是第二道防线。'
  },
  {
    n: 4, text: '查一下 13800138000 这个手机号属于哪个门店',
    stmt: '单条 SELECT', tables: 2, scan: 0.8, secs: 0.6, rows: 1, caliber: '不适用',
    verdict: '拦截', confirm: false,
    viol: ['R1'],
    fb: '调用者角色是门店店长，phone 列在其列级策略里属于不可读列，读不到的列在 SQL 生成阶段就被剔除，而不是查出来再遮。需走权限申请。'
  },
  {
    n: 5, text: '统计全量订单的用户分布',
    stmt: '单条 SELECT', tables: 1, scan: 908, secs: 42, rows: 8000000, caliber: '命中活跃用户口径 v3.2',
    verdict: '拦截', confirm: false,
    viol: ['R3', 'R4', 'R5'],
    fb: '三条红线同时越界：扫描 908 GB 超 50 GB、耗时 42 秒超 30 秒、返回 800 万行超 10,000 行。即使只越界一条也必须拦截。'
  },
  {
    n: 6, text: '对比华东和华北去年同期的毛利率',
    stmt: '单条 SELECT', tables: 4, scan: 8.6, secs: 6.4, rows: 12000, caliber: '命中毛利率口径 v2.1',
    verdict: '拦截', confirm: true,
    viol: ['R4'],
    fb: '唯一越界的是行数：12,000 行超过 10,000 行上限。但它是本组唯一同时踩到人工确认条件的请求（返回行数超过 1,000 行），所以除拦截外还要说明它若改为聚合到省份粒度（降到 10 行）即可自动放行。'
  }
];

const stage = document.getElementById('stage');
const controls = document.getElementById('controls');

const verdict = {};
const viol = {};
const confirmPick = { v: '' };
const state = { revealed: false, all: 13 };

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function gateName(v) { return v === NONE ? NONE : v + ' ' + (GATES.filter(g => g.v === v)[0] || { t: '' }).t; }
function violText(r) {
  return r.viol.length ? r.viol.map(v => v + ' ' + GATES.filter(g => g.v === v)[0].t).join('；') : NONE;
}
function sortedSel(list) { return list.slice().sort().join('|'); }

function checksOf(r) {
  const out = [];
  out.push({ g: 'R1', ok: r.viol.indexOf('R1') >= 0, txt: '只读角色可写 / 可见该列' });
  out.push({ g: 'R2', ok: r.viol.indexOf('R2') >= 0, txt: '单条 SELECT 且无分号' });
  out.push({ g: 'R3', ok: r.viol.indexOf('R3') >= 0, txt: '耗时 ' + (r.secs === null ? '不适用' : r.secs + ' 秒') + ' ≤ 30 秒' });
  out.push({ g: 'R4', ok: r.viol.indexOf('R4') >= 0, txt: '返回 ' + r.rows.toLocaleString('en-US') + ' 行 ≤ 10,000 行' });
  out.push({ g: 'R5', ok: r.viol.indexOf('R5') >= 0, txt: '扫描 ' + (r.scan === null ? '不适用' : r.scan + ' GB') + ' ≤ 50 GB' });
  out.push({ g: 'R6', ok: r.viol.indexOf('R6') >= 0, txt: '并发 ≤ 4' });
  return out;
}

function scoreOne(r) {
  return (verdict[r.n] === r.verdict ? 1 : 0) + (sortedSel(viol[r.n] || []) === sortedSel(r.viol) ? 1 : 0);
}
function scoreConfirm() { return confirmPick.v === '6' ? 1 : 0; }
function totalScore() {
  return REQS.reduce((a, r) => a + scoreOne(r), 0) + scoreConfirm();
}
function allFilled() {
  return REQS.every(r => verdict[r.n]) && confirmPick.v !== '';
}

function renderStage() {
  let h = '<h1 class="sim-title">自然语言转 SQL 安全防线判定</h1>';
  h += '<div class="fb info">屏幕提问：六条红线同时生效，六条请求逐条过——任一条越界就拦。</div>';

  h += '<h2 class="stage-h">六条安全红线（任一条越界即拦截）</h2><div class="gates">';
  GATES.forEach(g => { h += '<div class="gate"><b>' + g.v + ' ' + g.t + '</b><span class="muted">' + g.limit + '</span></div>'; });
  h += '</div>';

  h += '<h2 class="stage-h">人工确认的四个触发条件</h2><div class="card"><div class="row">';
  CONFIRM_CONDS.forEach(c => { h += '<span class="tag">' + c + '</span>'; });
  h += '</div><div class="muted">边界规则按开区间处理：恰好等于阈值（耗时恰为 30 秒、行数恰为 10,000、扫描恰为 50 GB）判为不越界、不拦截。人工确认判定独立于放行判定。</div></div>';

  h += '<h2 class="stage-h">六条请求的属性表（六项属性全部可见）</h2>';
  h += '<table><tr><th class="nowrap">序号</th><th>自然语言请求</th><th>语句类型</th><th class="nowrap">涉及表数</th><th class="nowrap">预计扫描量</th><th class="nowrap">预计耗时</th><th class="nowrap">预计返回行数</th><th>口径</th><th>判定</th></tr>';
  REQS.forEach(r => {
    let cls = '';
    if (state.revealed) cls = (verdict[r.n] === r.verdict) ? ' class="pass"' : ' class="block"';
    h += '<tr' + cls + '>';
    h += '<td>' + r.n + '</td><td>' + esc(r.text) + '</td><td>' + r.stmt + '</td><td>' + r.tables + '</td>';
    h += '<td>' + (r.scan === null ? '不适用' : r.scan + ' GB') + '</td>';
    h += '<td>' + (r.secs === null ? '不适用' : r.secs + ' 秒') + '</td>';
    h += '<td>' + r.rows.toLocaleString('en-US') + ' 行</td><td>' + r.caliber + '</td>';
    if (state.revealed) {
      h += '<td><span class="tag ' + (verdict[r.n] === r.verdict ? 'tag-ok">判定正确' : 'tag-no">判定错误') + '</span><br/>标准：<b>' + r.verdict + '</b><br/>越界：' + esc(violText(r)) + '</td>';
    } else {
      h += '<td class="muted">（锁定前隐藏）</td>';
    }
    h += '</tr>';
  });
  h += '</table>';

  if (state.revealed) {
    h += '<h2 class="stage-h">逐条红线核对与反馈</h2>';
    REQS.forEach(r => {
      const okV = verdict[r.n] === r.verdict;
      const okR = sortedSel(viol[r.n] || []) === sortedSel(r.viol);
      h += '<div class="fb ' + (okV && okR ? 'ok' : 'no') + '">';
      h += '<b>序号 ' + r.n + '</b>　' + esc(r.text) + '　';
      h += '<span class="tag">' + (okV ? '放行/拦截判定正确' : '放行/拦截判定错误（标准 ' + r.verdict + '）') + '</span> ';
      h += '<span class="tag">' + (okR ? '越界项正确' : '越界项错误（标准：' + esc(violText(r)) + '）') + '</span>';
      h += '<table style="margin-top:4px"><tr><th>红线</th><th>本行数值与阈值</th><th>是否越界</th></tr>';
      checksOf(r).forEach(c => {
        h += '<tr><td class="nowrap">' + c.g + '</td><td>' + c.txt + '</td><td>' + (c.ok ? '<b style="color:#c62828">越界</b>' : '未越界') + '</td></tr>';
      });
      h += '</table>' + esc(r.fb);
      h += '</div>';
    });
    h += '<div class="fb info">序号 1 是唯一全程无争议的放行，用来确认六条红线各自的阈值不是摆设。序号 6 是全组最值得琢磨的一条，它的语义、口径、耗时、扫描量全部合规，仅在行数上越界 20%，最容易被误判成放行。</div>';
    h += '<div class="fb info">序号 4 的列级策略由数据库角色强制执行，因此归入红线一（只读账号 / 数据库角色强制）：它拦截的原因是角色读不到该列，而不是行数、扫描或耗时越界。</div>';
  }

  stage.innerHTML = h;
}

function renderControls() {
  const sc = totalScore();
  let h = '<h2 class="stage-h">学习者操作区　<span class="muted">判定答对 ' + sc + ' / 13</span></h2>';
  h += '<div class="row">';
  h += '<button id="btnSubmit"' + (allFilled() && !state.revealed ? '' : ' disabled') + '>提交 13 项判定并揭晓</button>';
  h += '<button id="btnReset">重来</button>';
  h += '<span class="muted">' + REQS.filter(r => verdict[r.n]).length + ' / 6 条已判放行或拦截</span>';
  h += '</div>';

  REQS.forEach(r => {
    h += '<div class="req">';
    h += '<div class="row" style="justify-content:space-between"><div><b>序号 ' + r.n + '</b>　' + esc(r.text) + '</div>';
    h += '<label class="ctl">判定 ';
    h += '<select data-v="' + r.n + '"' + (state.revealed ? ' disabled' : '') + ' aria-label="序号 ' + r.n + ' 放行或拦截">';
    h += '<option value="">— 选择 —</option>';
    ['放行', '拦截'].forEach(o => { h += '<option value="' + o + '"' + (verdict[r.n] === o ? ' selected' : '') + '>' + o + '</option>'; });
    h += '</select></label></div>';
    h += '<div class="row" style="margin-top:3px"><span class="muted" style="font-size:14px">越界红线指认（可多选，全不选即视为无越界）：</span><br/>';
    GATES.forEach(g => {
      const on = (viol[r.n] || []).indexOf(g.v) >= 0 ? ' checked' : '';
      h += '<label class="gset"><input type="checkbox" data-g="' + r.n + '" data-v="' + g.v + '"' + on + (state.revealed ? ' disabled' : '') + '> ' + g.v + ' ' + g.t + '</label>';
    });
    const noneOn = (viol[r.n] || []).length === 0 ? ' checked' : '';
    h += '<label class="gset"><input type="checkbox" data-none="' + r.n + '"' + noneOn + (state.revealed ? ' disabled' : '') + '> ' + NONE + '</label>';
    h += '</div>';
    if (state.revealed) {
      h += '<div class="fb ' + ((verdict[r.n] === r.verdict && sortedSel(viol[r.n] || []) === sortedSel(r.viol)) ? 'ok' : 'no') + '">';
      h += (verdict[r.n] === r.verdict ? '判定正确：' : '六条红线逐条对着这一行过一遍，任一条越界即拦截。标准：') + r.verdict + '。';
      h += '<br/>' + (sortedSel(viol[r.n] || []) === sortedSel(r.viol) ? '越界项正确：' : '先看语句类型，再看行数与扫描量，最后看耗时。标准越界项：') + esc(violText(r)) + '。';
      h += '<br/>' + esc(r.fb);
      h += '</div>';
    }
    h += '</div>';
  });

  h += '<div class="req"><div class="row" style="justify-content:space-between"><div><b>人工确认判定</b>　哪一条即使不拦截也必须人工确认？</div>';
  h += '<label class="ctl">序号 <select id="cf" data-c="1"' + (state.revealed ? ' disabled' : '') + ' aria-label="需要人工确认的序号"><option value="">— 选择 —</option>';
  REQS.forEach(r => { h += '<option value="' + r.n + '"' + (confirmPick.v === String(r.n) ? ' selected' : '') + '>序号 ' + r.n + '</option>'; });
  h += '</select></label></div>';
  if (state.revealed) {
    h += '<div class="fb ' + (scoreConfirm() ? 'ok' : 'no') + '">' +
      (scoreConfirm() ? '序号 6：返回 12,000 行超过 1,000 行确认线。'
                       : '四个确认条件里最容易被忽略的是返回行数。序号 6 返回 12,000 行，超过 1,000 行确认线。') +
      ' 把返回行数降到 10,000 行以内需要改什么？答：改为聚合到省份粒度（降到 10 行）即可自动放行。</div>';
  }
  h += '</div>';

  if (state.revealed) {
    h += '<div class="fb ' + (sc === 13 ? 'ok' : 'no') + '">总计判定答对 <b>' + sc + ' / 13</b> 分（满分 13 分，13 分视为掌握）。六条判定与「应判定」列全部一致、且指出人工确认的那一条与标准一致时算掌握，容差为 0 条。</div>';
  }

  controls.innerHTML = h;

  controls.querySelectorAll('select[data-v]').forEach(sel => {
    sel.addEventListener('change', () => {
      const n = Number(sel.getAttribute('data-v'));
      verdict[n] = sel.value;
      renderControls();
    });
  });
  controls.querySelectorAll('select[data-c]').forEach(sel => {
    sel.addEventListener('change', () => { confirmPick.v = sel.value; renderControls(); });
  });
  controls.querySelectorAll('input[data-g]').forEach(cb => {
    cb.addEventListener('change', () => {
      const n = Number(cb.getAttribute('data-g'));
      const g = cb.getAttribute('data-v');
      if (!viol[n]) viol[n] = [];
      const i = viol[n].indexOf(g);
      if (cb.checked && i < 0) viol[n].push(g);
      if (!cb.checked && i >= 0) viol[n].splice(i, 1);
      const none = controls.querySelector('input[data-none="' + n + '"]');
      if (cb.checked && none) none.checked = false;
      renderControls();
    });
  });
  controls.querySelectorAll('input[data-none]').forEach(cb => {
    cb.addEventListener('change', () => {
      const n = Number(cb.getAttribute('data-none'));
      if (cb.checked) {
        viol[n] = [];
        controls.querySelectorAll('input[data-g="' + n + '"]').forEach(x => { x.checked = false; });
      } else {
        viol[n] = [NONE];
      }
      renderControls();
    });
  });

  const b1 = document.getElementById('btnSubmit');
  if (b1) b1.addEventListener('click', () => {
    state.revealed = true;
    renderStage();
    renderControls();
  });
  const b2 = document.getElementById('btnReset');
  if (b2) b2.addEventListener('click', () => {
    REQS.forEach(r => { delete verdict[r.n]; delete viol[r.n]; });
    confirmPick.v = '';
    state.revealed = false;
    renderStage();
    renderControls();
  });
}

renderStage();
renderControls();
