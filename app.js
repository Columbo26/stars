'use strict';
const SVGNS = 'http://www.w3.org/2000/svg';
const STORE = 'stars-event-v1';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let state = load() || defaultState();
const ui = { player: state.players[0]?.id || null, cons: null, rolling: null, tab: 'players' };
const undoStack = [];

function load() {
  try { return normalize(JSON.parse(localStorage.getItem(STORE))); } catch { return null; }
}

// Приводит загруженные/импортированные данные к ожидаемой форме, отбрасывая всё лишнее.
function normalize(d) {
  if (!d || !Array.isArray(d.constellations) || !Array.isArray(d.players)) throw new Error('bad data');
  const def = defaultState();
  const arr = v => Array.isArray(v) ? v : [];
  const str = (v, f = '') => typeof v === 'string' ? v.slice(0, 300) : f;
  const num = (v, f = 0) => Number.isFinite(Number(v)) ? Number(v) : f;
  const col = (v, f) => /^#[0-9a-f]{6}$/i.test(v) ? v : f;
  const ident = (v, f) => /^[\w-]{1,40}$/.test(v) ? v : f;
  const difficulties = (arr(d.difficulties).length ? d.difficulties : def.difficulties).map((x, i) => ({
    id: ident(x?.id, 'd' + i), name: str(x?.name, '?'), color: col(x?.color, '#888888'), duration: str(x?.duration), currency: num(x?.currency),
  }));
  const dids = new Set(difficulties.map(x => x.id));
  const dOk = v => dids.has(v) ? v : difficulties[0].id;
  const pools = {};
  difficulties.forEach(x => pools[x.id] = arr(d.pools?.[x.id]).map(g => str(g)).filter(Boolean));
  const constellations = d.constellations.map((c, i) => {
    const stars = arr(c?.stars).map(st => ({ x: num(st?.x), y: num(st?.y), d: dOk(st?.d) }));
    const edges = Array.isArray(c?.edges)
      ? c.edges.filter(e => Array.isArray(e) && e.length === 2 && e.every(k => Number.isInteger(k) && k >= 0 && k < stars.length)) : null;
    return { id: ident(c?.id, 'c' + i), name: str(c?.name, '?'), reward: str(c?.reward), bonus: num(c?.bonus), stars, edges };
  }).filter(c => c.stars.length);
  const consById = new Map(constellations.map(c => [c.id, c]));
  const games = a => arr(a).map(g => ({ name: str(g?.name), d: dOk(g?.d) }));
  const players = d.players.map((p, i) => {
    const c = consById.get(p?.active?.cid);
    const active = c ? {
      cid: c.id, progress: Math.max(0, Math.min(c.stars.length - 1, Math.floor(num(p.active.progress)))),
      game: p.active.game ? str(p.active.game) : null, games: games(p.active.games),
    } : null;
    return {
      id: ident(p?.id, 'p' + i), name: str(p?.name, 'Игрок'), color: col(p?.color, PLAYER_COLORS[i % PLAYER_COLORS.length]),
      balance: num(p?.balance), active, done: arr(p?.done).filter(x => consById.has(x?.cid)).map(x => ({ cid: x.cid, games: games(x.games) })),
    };
  });
  const st = d.settings || {};
  return {
    version: 1,
    settings: {
      currencyName: str(st.currencyName, def.settings.currencyName), currencyIcon: str(st.currencyIcon, def.settings.currencyIcon),
      exclusive: st.exclusive === undefined ? true : !!st.exclusive, title: str(st.title, def.settings.title),
    },
    difficulties, pools, constellations, players,
    log: arr(d.log).filter(l => typeof l?.text === 'string').slice(0, 200)
      .map(l => ({ t: num(l.t), color: col(l.color, '#8ab4ff'), name: str(l.name), text: str(l.text) })),
  };
}
function save() { localStorage.setItem(STORE, JSON.stringify(state)); }
function commit(fn) {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > 60) undoStack.shift();
  fn();
  save();
  render();
}
function undo() {
  if (!undoStack.length) return toast('Нечего отменять');
  state = JSON.parse(undoStack.pop());
  ui.rolling = null;
  save(); render();
  if (!$('#modal').classList.contains('hidden')) renderSettings();
  toast('Последнее действие отменено');
}

// ---------- helpers ----------
const diff = id => state.difficulties.find(d => d.id === id) || state.difficulties[0];
const getPlayer = id => state.players.find(p => p.id === id);
const getCons = id => state.constellations.find(c => c.id === id);
const cur = () => state.settings.currencyIcon;
const moneyText = n => `${Number(n)} ${cur()}`;
const money = n => esc(moneyText(n));
const edgesOf = c => c.edges || c.stars.slice(1).map((_, i) => [i, i + 1]);
const activeOn = cid => state.players.filter(p => p.active?.cid === cid);
const capturedBy = cid => state.players.filter(p => p.done.some(d => d.cid === cid));

function availability(p, c) {
  if (!p) return 'Сначала выберите игрока';
  if (p.active) return `${p.name} ещё не закончил «${getCons(p.active.cid)?.name}»`;
  if (p.done.some(d => d.cid === c.id)) return `${p.name} уже собрал это созвездие`;
  if (state.settings.exclusive) {
    const a = activeOn(c.id)[0] || capturedBy(c.id)[0];
    if (a) return `Созвездие занято: ${a.name}`;
  }
  return null;
}

function log(p, text) {
  state.log.unshift({ t: Date.now(), color: p?.color || '#8ab4ff', name: p?.name || '', text });
  state.log = state.log.slice(0, 200);
}

// ---------- background ----------
function drawStarfield() {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let h = '';
  for (let i = 0; i < 420; i++) {
    const r = rnd() < .93 ? rnd() * 1.1 + .3 : rnd() * 1.6 + 1.1;
    h += `<circle class="bgstar" cx="${(rnd() * 1600).toFixed(1)}" cy="${(rnd() * 1000).toFixed(1)}" r="${r.toFixed(2)}" fill="#fff" style="--t:${(2 + rnd() * 4).toFixed(1)}s;animation-delay:-${(rnd() * 5).toFixed(1)}s"/>`;
  }
  $('#starfield').innerHTML = h;
}

// ---------- map ----------
function starShape(R, color) {
  const a = R * 2.1, b = R * .32;
  return `<circle r="${R * 2.4}" fill="${color}" opacity=".28" filter="url(#glow)"/>
    <polygon points="0,${-a} ${b},${-b} ${a},0 ${b},${b} 0,${a} ${-b},${b} ${-a},0 ${-b},${-b}" fill="${color}" opacity=".9"/>
    <circle class="core" r="${R * .75}" fill="#fff"/>
    <circle r="${R * .75}" fill="${color}" opacity=".45"/>`;
}
const radius = d => 6 + state.difficulties.findIndex(x => x.id === d) * 1.6;

function renderMap() {
  const sel = getPlayer(ui.player);
  let h = '';
  for (const c of state.constellations) {
    const actives = activeOn(c.id);
    const captors = capturedBy(c.id);
    const lead = actives.sort((a, b) => b.active.progress - a.active.progress)[0];
    const owner = captors[0] || lead;
    const prog = captors.length ? c.stars.length : lead ? lead.active.progress : 0;
    const pc = owner?.color || '#8ab4ff';
    const isMine = sel?.active?.cid === c.id;
    const dim = sel?.active && !isMine && ui.cons !== c.id;
    const cls = ['cons', ui.cons === c.id && 'selected', isMine && 'mine', dim && 'dim'].filter(Boolean).join(' ');
    h += `<g class="${cls}" data-cid="${c.id}" style="--pc:${pc}">`;

    const E = edgesOf(c);
    for (const [a, b] of E) {
      const A = c.stars[a], B = c.stars[b];
      h += `<line class="hit" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`;
    }
    for (const [a, b] of E) {
      const A = c.stars[a], B = c.stars[b];
      const lit = a < prog && b < prog;
      const next = !lit && lead && !captors.length && ((a < prog && b === prog) || (b < prog && a === prog));
      h += `<line class="edge ${lit ? 'lit' : ''} ${next ? 'next' : ''}" x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}"/>`;
    }

    c.stars.forEach((s, i) => {
      const d = diff(s.d), R = radius(s.d);
      const done = i < prog;
      const here = actives.filter(p => p.active.progress === i);
      let tip = `${c.name} · звезда ${i + 1}/${c.stars.length}\n${d.name} сложность (${d.duration}) · +${moneyText(d.currency)}`;
      const games = [...captors.map(p => p.done.find(x => x.cid === c.id).games[i]), ...actives.map(p => p.active.games[i])].filter(Boolean);
      games.forEach(g => tip += `\nПройдено: ${g.name}`);
      here.forEach(p => tip += `\nСейчас: ${p.name}${p.active.game ? ' — ' + p.active.game : ''}`);
      h += `<g class="star ${done ? 'done' : 'locked'}" transform="translate(${s.x},${s.y})"><title>${esc(tip)}</title>
        <circle r="${R + 14}" fill="transparent"/>
        <g class="shape">${starShape(R, d.color)}</g>
        ${done ? `<circle class="ring" r="${R + 5}" stroke="${pc}"/>` : ''}
        ${here.map((p, k) => `<circle class="token" r="${R + 9 + k * 5}" stroke="${p.color}" style="animation-delay:-${k * .3}s"/>`).join('')}
        <text class="num" x="${R + 5}" y="${-R - 3}">${i + 1}</text>
      </g>`;
    });

    const minY = Math.min(...c.stars.map(s => s.y));
    const cx = (Math.min(...c.stars.map(s => s.x)) + Math.max(...c.stars.map(s => s.x))) / 2;
    h += `<text class="label" x="${cx}" y="${minY - 30}">${esc(c.name)}</text>`;
    const tags = [
      ...captors.map(p => `<tspan fill="${p.color}">★ ${esc(p.name)}</tspan>`),
      ...actives.map(p => `<tspan fill="${p.color}">${esc(p.name)} ${p.active.progress}/${c.stars.length}</tspan>`),
    ];
    if (tags.length) h += `<text class="owner" x="${cx}" y="${minY - 12}">${tags.join('<tspan fill="#666"> · </tspan>')}</text>`;
    h += `</g>`;
  }
  $('#map').innerHTML = h;
}

// ---------- side panels ----------
function renderPlayers() {
  $('#players').innerHTML = state.players.map(p => {
    const c = p.active && getCons(p.active.cid);
    const status = c ? `${c.name} · ${p.active.progress}/${c.stars.length}${p.active.game ? ' · ' + p.active.game : ''}`
      : `свободен · собрано: ${p.done.length}`;
    return `<div class="player ${ui.player === p.id ? 'sel' : ''}" data-player="${p.id}" style="--pc:${p.color}">
      <span class="dot"></span>
      <div class="info"><div class="name">${esc(p.name)}</div><div class="status">${esc(status)}</div></div>
      <span class="bal">${money(p.balance)}</span></div>`;
  }).join('') || '<p class="muted">Добавьте игроков</p>';
}

function renderPlayerPanel() {
  const p = getPlayer(ui.player);
  const el = $('#player-panel');
  if (!p) { el.innerHTML = '<h3>Ход игрока</h3><p class="muted">Выберите игрока в списке выше.</p>'; return; }
  el.style.setProperty('--pc', p.color);
  if (!p.active) {
    el.innerHTML = `<h3>Ход игрока</h3><div class="row"><span class="dot"></span><b>${esc(p.name)}</b></div>
      <p class="muted">Свободен. Кликните по созвездию на карте и нажмите «Выбрать созвездие».</p>
      ${p.done.length ? `<p class="muted">Собрано: ${p.done.map(d => esc(getCons(d.cid)?.name)).join(', ')}</p>` : ''}`;
    return;
  }
  const c = getCons(p.active.cid);
  const s = c.stars[p.active.progress], d = diff(s.d);
  const rolling = ui.rolling?.pid === p.id;
  const game = rolling ? ui.rolling.text : p.active.game;
  el.innerHTML = `<h3>Ход игрока</h3>
    <div class="row"><span class="dot"></span><b>${esc(p.name)}</b><span class="muted" style="margin-left:auto">${esc(c.name)}</span></div>
    <div class="progress" style="--dc:${d.color}">${c.stars.map((st, i) =>
      `<span class="${i < p.active.progress ? 'ok' : i === p.active.progress ? 'cur' : ''}" style="--dc:${diff(st.d).color}" title="${esc(diff(st.d).name)}"></span>`).join('')}</div>
    <div class="task" style="--dc:${d.color}">
      <span class="chip">Звезда ${p.active.progress + 1}/${c.stars.length} · ${esc(d.name)} · ${esc(d.duration)}</span>
      <div class="game ${rolling ? 'rolling' : ''}">${game ? esc(game) : '<span class="muted">Игра не выбрана</span>'}</div>
      <div class="muted">Награда за звезду: +${money(d.currency)}</div>
    </div>
    <div class="actions">
      ${p.active.game
        ? `<button class="primary" data-act="complete" ${rolling ? 'disabled' : ''}>✔ Пройдено</button>
           <button data-act="roll" ${rolling ? 'disabled' : ''} title="Выбрать другую игру">↻ Реролл</button>`
        : `<button class="primary" data-act="roll" ${rolling ? 'disabled' : ''}>🎲 Крутить игру</button>`}
    </div>
    <form class="row" id="manual-game" style="margin-top:8px">
      <input name="g" placeholder="или вписать игру вручную" list="pool-list" autocomplete="off">
      <datalist id="pool-list">${(state.pools[s.d] || []).map(g => `<option value="${esc(g)}">`).join('')}</datalist>
      <button>OK</button>
    </form>
    <div class="actions"><button class="ghost danger" data-act="abandon" title="Админ: снять игрока с созвездия">Снять с созвездия</button></div>`;
}

function renderConsPanel() {
  const el = $('#cons-panel');
  const c = getCons(ui.cons);
  if (!c) { el.innerHTML = '<h3>Созвездие</h3><p class="muted">Кликните по созвездию на карте, чтобы увидеть звёзды и награды.</p>'; return; }
  const p = getPlayer(ui.player);
  const reason = availability(p, c);
  const total = c.stars.reduce((a, s) => a + diff(s.d).currency, 0);
  const people = [...capturedBy(c.id).map(x => `<span style="color:${x.color}">★ ${esc(x.name)}</span>`),
    ...activeOn(c.id).map(x => `<span style="color:${x.color}">${esc(x.name)} (${x.active.progress}/${c.stars.length})</span>`)];
  el.style.setProperty('--pc', p?.color || '#8ab4ff');
  el.innerHTML = `<h3>Созвездие</h3>
    <div style="font-size:20px;font-weight:700">${esc(c.name)}</div>
    <div class="muted">${c.stars.length} звёзд · ${people.length ? people.join(', ') : 'свободно'}</div>
    <ul class="starlist">${c.stars.map((s, i) => {
      const d = diff(s.d);
      return `<li style="--dc:${d.color}"><span class="chip">${i + 1}. ${esc(d.name)}</span><span class="muted">${esc(d.duration)}</span><span class="g">+${money(d.currency)}</span></li>`;
    }).join('')}</ul>
    <div class="reward">🏆 ${esc(c.reward || '—')}<br>Бонус за всё созвездие: <b>+${money(c.bonus)}</b><br><span class="muted">Всего с учётом звёзд: ${money(total + Number(c.bonus))}</span></div>
    <div class="actions">
      <button class="primary" data-act="choose" ${reason ? 'disabled' : ''}>${p ? `Выбрать для «${esc(p.name)}»` : 'Выбрать созвездие'}</button>
    </div>
    ${reason ? `<p class="muted">${esc(reason)}</p>` : ''}`;
}

function renderLog() {
  const f = t => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  $('#log').innerHTML = state.log.map(l => `<li style="--pc:${l.color}"><span class="muted">${f(l.t)}</span> <b>${esc(l.name)}</b> ${esc(l.text)}</li>`).join('')
    || '<li class="muted" style="list-style:none">Пока пусто</li>';
}

function renderLegend() {
  $('#legend').innerHTML = state.difficulties.map(d =>
    `<span class="chip" style="--dc:${d.color}">● ${esc(d.name)} · ${esc(d.duration)} · +${d.currency}${esc(cur())}</span>`).join('');
}

function render() {
  $('#title').textContent = state.settings.title;
  document.title = `${state.settings.title} — Созвездия`;
  if (!getPlayer(ui.player)) ui.player = state.players[0]?.id || null;
  renderMap(); renderPlayers(); renderPlayerPanel(); renderConsPanel(); renderLog(); renderLegend();
}

// ---------- actions ----------
function choose() {
  const p = getPlayer(ui.player), c = getCons(ui.cons);
  if (!c || availability(p, c)) return;
  commit(() => {
    p.active = { cid: c.id, progress: 0, game: null, games: [] };
    log(p, `выбрал созвездие «${c.name}»`);
  });
  c.stars.forEach((s, i) => setTimeout(() => fxRing(s.x, s.y, p.color, 60), i * 120));
  banner(`<b>${esc(p.name)}</b> выбирает «${esc(c.name)}»`, p.color, `${c.stars.length} звёзд · бонус +${moneyText(c.bonus)}`);
}

function roll() {
  const p = getPlayer(ui.player);
  if (!p?.active || ui.rolling) return;
  const c = getCons(p.active.cid), s = c.stars[p.active.progress], d = diff(s.d);
  const pool = state.pools[s.d] || [];
  if (!pool.length) return toast(`Пул «${d.name}» пуст — добавьте игры в настройках`);
  const played = new Set([...p.done.flatMap(x => x.games.map(g => g.name)), ...p.active.games.map(g => g.name)]);
  let options = pool.filter(g => !played.has(g) && g !== p.active.game);
  if (!options.length) options = pool;
  const pick = options[Math.floor(Math.random() * options.length)];
  ui.rolling = { pid: p.id, text: pool[0] };
  const start = performance.now(), dur = 1800;
  let k = 0;
  const step = () => {
    const t = performance.now() - start;
    if (t >= dur) {
      ui.rolling = null;
      commit(() => {
        p.active.game = pick;
        log(p, `получает игру «${pick}» (${d.name})`);
      });
      fxRing(s.x, s.y, d.color, 70); fxBurst(s.x, s.y, d.color);
      banner(`<b>${esc(p.name)}</b>: ${esc(pick)}`, p.color, `${d.name} · ${d.duration}`);
      return;
    }
    ui.rolling.text = pool[k++ % pool.length];
    renderPlayerPanel();
    fxRing(s.x, s.y, d.color, 30, 400);
    setTimeout(step, 60 + (t / dur) ** 2 * 260);
  };
  step();
}

function setManualGame(name) {
  const p = getPlayer(ui.player);
  if (!p?.active || !name.trim()) return;
  commit(() => {
    p.active.game = name.trim();
    log(p, `берёт игру «${name.trim()}»`);
  });
}

function complete() {
  const p = getPlayer(ui.player);
  if (!p?.active?.game) return;
  const c = getCons(p.active.cid), i = p.active.progress, s = c.stars[i], d = diff(s.d);
  const finished = i + 1 >= c.stars.length;
  commit(() => {
    p.balance += Number(d.currency);
    p.active.games.push({ name: p.active.game, d: s.d });
    log(p, `прошёл «${p.active.game}» — +${d.currency} ${cur()}`);
    p.active.progress++;
    p.active.game = null;
    if (finished) {
      p.balance += Number(c.bonus);
      p.done.push({ cid: c.id, games: p.active.games });
      p.active = null;
      log(p, `собрал созвездие «${c.name}»! ${c.reward} · +${c.bonus} ${cur()}`);
    }
  });
  fxBurst(s.x, s.y, p.color); fxRing(s.x, s.y, p.color, 80);
  fxText(s.x, s.y - 20, `+${d.currency}${cur()}`, '#ffd23f');
  if (finished) {
    c.stars.forEach((st, k) => setTimeout(() => { fxBurst(st.x, st.y, p.color); fxRing(st.x, st.y, '#fff', 90); }, 300 + k * 140));
    banner(`<b>${esc(p.name)}</b> собрал «${esc(c.name)}»!`, p.color, `🏆 ${c.reward} · +${moneyText(c.bonus)}`, true, 5);
  } else {
    banner(`<b>${esc(p.name)}</b> зажигает звезду ${i + 1}/${c.stars.length}`, p.color, `${d.name} · +${moneyText(d.currency)}`);
  }
}

function abandon() {
  const p = getPlayer(ui.player);
  if (!p?.active) return;
  const c = getCons(p.active.cid);
  if (!confirm(`Снять ${p.name} с созвездия «${c.name}»? Прогресс по нему пропадёт (валюта останется).`)) return;
  commit(() => { p.active = null; log(p, `снят с созвездия «${c.name}»`); });
}

// ---------- fx ----------
function svgEl(tag, attrs) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  $('#fx').appendChild(e);
  return e;
}
function fxRing(x, y, color, r = 60, dur = 900) {
  const e = svgEl('circle', { cx: x, cy: y, r, fill: 'none', stroke: color, 'stroke-width': 3 });
  e.style.transformOrigin = `${x}px ${y}px`;
  e.animate([{ transform: 'scale(.1)', opacity: 1 }, { transform: 'scale(1)', opacity: 0 }], { duration: dur, easing: 'ease-out' }).onfinish = () => e.remove();
}
function fxBurst(x, y, color) {
  for (let i = 0; i < 16; i++) {
    const a = Math.PI * 2 * i / 16 + Math.random() * .3, dist = 40 + Math.random() * 50;
    const e = svgEl('circle', { cx: x, cy: y, r: 2 + Math.random() * 2.5, fill: color });
    e.animate([{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${Math.cos(a) * dist}px,${Math.sin(a) * dist}px)`, opacity: 0 }],
      { duration: 800 + Math.random() * 500, easing: 'cubic-bezier(.1,.8,.3,1)' }).onfinish = () => e.remove();
  }
}
function fxText(x, y, text, color) {
  const e = svgEl('text', { x, y, fill: color, 'font-size': 26, 'font-weight': 800, 'text-anchor': 'middle', stroke: '#05060f', 'stroke-width': 4, 'paint-order': 'stroke' });
  e.textContent = text;
  e.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-50px)', opacity: 0 }], { duration: 1600, easing: 'ease-out' }).onfinish = () => e.remove();
}
function banner(html, color, sub, big = false, life = 3) {
  const e = document.createElement('div');
  e.className = 'banner' + (big ? ' big' : '');
  e.style.setProperty('--pc', color);
  e.style.setProperty('--life', life + 's');
  e.innerHTML = html + (sub ? `<small>${esc(sub)}</small>` : '');
  const box = $('#overlay');
  box.appendChild(e);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => e.remove(), (life + .6) * 1000);
}
const toast = text => banner(esc(text), '#8ab4ff', '', false, 2);

// ---------- settings ----------
const TABS = { players: 'Игроки', diffs: 'Сложности и валюта', pools: 'Пул игр', cons: 'Созвездия', data: 'Данные' };
function openSettings(tab = ui.tab) { ui.tab = tab; $('#modal').classList.remove('hidden'); renderSettings(); }
function closeSettings() { $('#modal').classList.add('hidden'); render(); }

function renderSettings() {
  $('#tabs').innerHTML = Object.entries(TABS).map(([k, v]) => `<button data-tab="${k}" class="${ui.tab === k ? 'on' : ''}">${v}</button>`).join('');
  const b = $('#modal-body');
  const S = state.settings;
  if (ui.tab === 'players') {
    b.innerHTML = `<div class="grid players"><span></span><span class="hdr">Имя</span><span class="hdr">Баланс ${esc(cur())}</span><span></span>
      ${state.players.map((p, i) => `<input type="color" data-k="players.${i}.color" value="${p.color}">
        <input data-k="players.${i}.name" value="${esc(p.name)}">
        <input type="number" data-k="players.${i}.balance" value="${p.balance}">
        <button class="danger" data-del-player="${p.id}">Удалить</button>`).join('')}</div>
      <p><button data-add-player>+ Добавить игрока</button></p>`;
  } else if (ui.tab === 'diffs') {
    b.innerHTML = `<div class="field"><span>Название ивента</span><input data-k="settings.title" value="${esc(S.title)}"></div>
      <div class="row"><div class="field" style="flex:1"><span>Название валюты</span><input data-k="settings.currencyName" value="${esc(S.currencyName)}"></div>
      <div class="field"><span>Значок</span><input data-k="settings.currencyIcon" value="${esc(S.currencyIcon)}" style="width:70px"></div></div>
      <label class="check"><input type="checkbox" data-k="settings.exclusive" ${S.exclusive ? 'checked' : ''}> Одно созвездие — только для одного игрока (собранное остаётся за ним)</label>
      <h4>Сложности</h4>
      <div class="grid diffs"><span></span><span class="hdr">Название</span><span class="hdr">Длительность</span><span class="hdr">Награда за звезду</span>
      ${state.difficulties.map((d, i) => `<input type="color" data-k="difficulties.${i}.color" value="${d.color}">
        <input data-k="difficulties.${i}.name" value="${esc(d.name)}">
        <input data-k="difficulties.${i}.duration" value="${esc(d.duration)}">
        <input type="number" data-k="difficulties.${i}.currency" value="${d.currency}">`).join('')}</div>`;
  } else if (ui.tab === 'pools') {
    b.innerHTML = `<p class="muted">Одна игра на строку. При «Крутить игру» выбирается случайная игра из пула сложности текущей звезды (без повторов для игрока, пока есть варианты).</p>
      <div class="pools">${state.difficulties.map(d => `<div style="--dc:${d.color}"><span class="chip">${esc(d.name)} · ${(state.pools[d.id] || []).length} игр</span>
        <textarea data-pool="${d.id}">${esc((state.pools[d.id] || []).join('\n'))}</textarea></div>`).join('')}</div>`;
  } else if (ui.tab === 'cons') {
    b.innerHTML = `<p class="muted">Звёзды проходятся по порядку. Цвет звезды = сложность игры.</p>` +
      state.constellations.map((c, i) => `<div class="cons-edit">
        <div class="field"><span>Название</span><input data-k="constellations.${i}.name" value="${esc(c.name)}"></div>
        <div class="field"><span>Награда за всё созвездие</span><input data-k="constellations.${i}.reward" value="${esc(c.reward)}"></div>
        <div class="field"><span>Бонус ${esc(cur())}</span><input type="number" data-k="constellations.${i}.bonus" value="${c.bonus}"></div>
        <div class="stars">${c.stars.map((s, j) => `<select data-k="constellations.${i}.stars.${j}.d" style="--dc:${diff(s.d).color}" title="Звезда ${j + 1}">
          ${state.difficulties.map(d => `<option value="${d.id}" ${d.id === s.d ? 'selected' : ''}>${j + 1}. ${esc(d.name)}</option>`).join('')}</select>`).join('')}</div>
      </div>`).join('');
  } else if (ui.tab === 'data') {
    b.innerHTML = `<p class="muted">Всё хранится в браузере (localStorage). Экспортируйте JSON, чтобы перенести ивент на другой ПК или в OBS.</p>
      <div class="actions"><button data-data="export">⬇ Экспорт JSON</button>
      <label><button data-data="import">⬆ Импорт JSON</button><input type="file" id="import-file" accept=".json" hidden></label></div>
      <h4>Сброс</h4>
      <div class="actions"><button class="danger" data-data="reset-progress">Сбросить прогресс (игроки и настройки остаются)</button>
      <button class="danger" data-data="reset-all">Полный сброс к стандартным</button></div>`;
  }
}

function setPath(path, value) {
  const keys = path.split('.');
  let o = state;
  keys.slice(0, -1).forEach(k => o = o[k]);
  o[keys.at(-1)] = value;
}

function onSettingsChange(e) {
  const t = e.target;
  if (t.dataset.k) {
    const v = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Number(t.value) || 0 : t.value;
    commit(() => setPath(t.dataset.k, v));
    if (t.tagName === 'SELECT') t.style.setProperty('--dc', diff(t.value).color);
  } else if (t.dataset.pool) {
    commit(() => state.pools[t.dataset.pool] = t.value.split('\n').map(s => s.trim()).filter(Boolean));
    renderSettings();
  } else if (t.id === 'import-file' && t.files[0]) {
    t.files[0].text().then(txt => {
      try {
        const data = normalize(JSON.parse(txt));
        commit(() => state = data);
        renderSettings(); toast('Данные импортированы');
      } catch { alert('Не удалось прочитать файл'); }
    });
  }
}

function onSettingsClick(e) {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.tab) { ui.tab = t.dataset.tab; renderSettings(); }
  else if ('addPlayer' in t.dataset) { commit(() => state.players.push(newPlayer(`Игрок ${state.players.length + 1}`, PLAYER_COLORS[state.players.length % PLAYER_COLORS.length]))); renderSettings(); }
  else if (t.dataset.delPlayer) {
    const p = getPlayer(t.dataset.delPlayer);
    if (confirm(`Удалить игрока ${p.name}?`)) { commit(() => state.players = state.players.filter(x => x !== p)); renderSettings(); }
  } else if (t.dataset.data === 'export') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    a.download = `stars-event-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  } else if (t.dataset.data === 'import') { $('#import-file').click(); }
  else if (t.dataset.data === 'reset-progress') {
    if (confirm('Сбросить весь прогресс и балансы?')) commit(() => { state.players.forEach(p => { p.active = null; p.done = []; p.balance = 0; }); state.log = []; });
  } else if (t.dataset.data === 'reset-all') {
    if (confirm('Вернуть всё к стандартным настройкам?')) { commit(() => state = defaultState()); renderSettings(); }
  }
}

// ---------- events ----------
$('#map').addEventListener('click', e => {
  const g = e.target.closest('[data-cid]');
  if (!g) return;
  ui.cons = g.dataset.cid;
  render();
});
$('#sky').addEventListener('click', e => { if (!e.target.closest('[data-cid]')) { ui.cons = null; render(); } });
$('#players').addEventListener('click', e => {
  const el = e.target.closest('[data-player]');
  if (!el) return;
  ui.player = el.dataset.player;
  const p = getPlayer(ui.player);
  if (p.active) ui.cons = p.active.cid;
  render();
});
$('#add-player').addEventListener('submit', e => {
  e.preventDefault();
  const name = e.target.name.value.trim();
  if (!name) return;
  commit(() => {
    const p = newPlayer(name, PLAYER_COLORS[state.players.length % PLAYER_COLORS.length]);
    state.players.push(p);
    ui.player = p.id;
  });
  e.target.reset();
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  ({ choose, roll, complete, abandon })[b.dataset.act]?.();
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'manual-game') return;
  e.preventDefault();
  setManualGame(e.target.g.value);
});
$('#btn-undo').onclick = undo;
$('#btn-settings').onclick = () => openSettings();
$('#btn-stream').onclick = () => { document.body.classList.toggle('stream'); toast('Режим трансляции: H — вернуть панель'); };
$('#modal-close').onclick = closeSettings;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeSettings(); });
$('#modal-body').addEventListener('change', onSettingsChange);
$('#modal').addEventListener('click', onSettingsClick);
document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea, select')) return;
  if (e.key === 'h' || e.key === 'H' || e.key === 'р' || e.key === 'Р') document.body.classList.toggle('stream');
  if (e.key === 'Escape') closeSettings();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
});

drawStarfield();
render();
