/* 菌譜 — 細菌検査Wiki 本体
 * データは端末内だけ（localStorage + IndexedDB）。AI整理を使うときだけ本文がAIサーバーを通る。
 */
'use strict';

const LS = {
  notes: 'kinpu.notes', orgs: 'kinpu.customOrgs', verified: 'kinpu.verified',
  sir: 'kinpu.sir', recent: 'kinpu.recent', fav: 'kinpu.fav',
  theme: 'kinpu.theme', ai: 'kinpu.aiUrl',
  pin: 'kinpu.pinHash', pinSalt: 'kinpu.pinSalt', bio: 'kinpu.bioId',
  lockEach: 'kinpu.lockEach',
};
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
/* localStorage は約5MBで頭打ち。超えると例外を投げるので、黙ってノートを失わないよう捕まえる。
 * （写真はIndexedDBに逃がしてあるので、ここに来るのは文字だけ） */
let quotaWarned = false;
const save = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; }
  catch (e) {
    if (!quotaWarned) {
      quotaWarned = true;
      alert('この端末の保存容量がいっぱいです。\n\n設定 →「書き出す（JSON）」でバックアップを取ってから、\n古いノートを消してください。\n\n※ 今回の変更は保存できていません。');
    }
    return false;
  }
};
const $ = (s) => document.querySelector(s);
const el = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nl2 = (s) => esc(s).replace(/\n/g, '<br>');

/* localStorageは壊れる（別バージョン・手動編集・容量切れの中断）。
 * 壊れた1バイトでアプリが起動しないのは論外なので、読み込んだ値の型を必ず均す。 */
const asList = (v) => (Array.isArray(v) ? v : []);
const asObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const asStr = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const asStrList = (v) => (Array.isArray(v) ? v.map(asStr).filter(Boolean)
  : typeof v === 'string' && v.trim() ? [v.trim()] : []);

function sanitizeNote(n) {
  if (!n || typeof n !== 'object' || !n.id) return null;
  const t = Number(n.updatedAt) || Number(n.createdAt) || Date.now();
  return {
    id: asStr(n.id),
    kind: KINDS.some((k) => k.id === n.kind) ? n.kind : 'knowledge',
    title: asStr(n.title), body: asStr(n.body),
    ai: normAI(n.ai),
    tags: asStrList(n.tags),
    orgIds: asStrList(n.orgIds), mechIds: asStrList(n.mechIds), classIds: asStrList(n.classIds),
    photos: asStrList(n.photos), captions: asObj(n.captions),
    createdAt: Number(n.createdAt) || t, updatedAt: t,
  };
}
const sanitizeNotes = (v) => asList(v).map(sanitizeNote).filter(Boolean);

let notes = [];
let customOrgs = [];
let verified = {};
let sirState = {};
let recent = [];
let favs = [];
/* AI整理サーバー。知人が設定しなくても使えるよう既定値を入れる（設定画面で差し替え可） */
let aiUrl = load(LS.ai, 'https://kinpu-ai.aulait11-17.workers.dev');

/* ノートの種類。これ1本で SOP・トラブル・症例・機器・申し送り まで面倒を見る。
 * 新しい分類が要るならここに1行足すだけ。 */
const KINDS = [
  { id: 'knowledge', e: '🦠', jp: '細菌検査の知識', c: 'mint' },
  { id: 'sop',       e: '🛠', jp: '作業手順・SOP',  c: 'lav' },
  { id: 'trouble',   e: '🚨', jp: '機器トラブル',   c: 'red' },
  { id: 'case',      e: '📋', jp: '症例',           c: 'sun' },
  { id: 'device',    e: '🔬', jp: '機器の操作',     c: 'cool' },
  { id: 'handover',  e: '📞', jp: '申し送り・報告', c: 'pink' },
  { id: 'senpai',    e: '💡', jp: '先輩メモ',       c: 'warm' },
];
const kindOf = (id) => KINDS.find((k) => k.id === id) || KINDS[0];

const allOrgs = () => ORGANISMS.concat(customOrgs);
const orgById = (id) => allOrgs().find((o) => o.id === id);
const detOf = (id) => DETAILS[id] || {};
const mechById = (id) => MECHANISMS.find((m) => m.id === id);
const classById = (id) => DRUG_CLASSES.find((c) => c.id === id);
const drugItem = (ab) => {
  for (const c of DRUG_CLASSES) { const i = c.items.find((x) => x.abbr === ab); if (i) return { ...i, cls: c }; }
  return null;
};

/* ---------- 写真は IndexedDB ---------- */
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open('kinpu', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function putPhoto(id, d) {
  const x = await db();
  return new Promise((res, rej) => {
    const tx = x.transaction('photos', 'readwrite');
    tx.objectStore('photos').put(d, id);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
async function getPhoto(id) {
  const x = await db();
  return new Promise((res) => {
    const q = x.transaction('photos', 'readonly').objectStore('photos').get(id);
    q.onsuccess = () => res(q.result || null); q.onerror = () => res(null);
  });
}
async function delPhoto(id) {
  const x = await db();
  x.transaction('photos', 'readwrite').objectStore('photos').delete(id);
}
function shrink(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const sc = Math.min(1, 1600 / Math.max(img.width, img.height));
        const cv = el('canvas');
        cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        res(cv.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = rej; img.src = fr.result;
    };
    fr.onerror = rej; fr.readAsDataURL(file);
  });
}

/* ---------- 判定 ---------- */
function matchRules(orgId, sir) {
  const R = (d) => sir[d] === 'R', S = (d) => sir[d] === 'S';
  return RULES.filter((r) => {
    if (!r.organisms.includes(orgId)) return false;
    const w = r.when;
    if (w.allR && !w.allR.every(R)) return false;
    if (w.anyR && !w.anyR.some(R)) return false;
    if (w.S && !w.S.every(S)) return false;
    return true;
  });
}
const drugJp = (d) => (String(d).match(/（([^）]+)）/) || [, String(d)])[1];
function intrinsicConflicts(o, sir) {
  return (o.intrinsicCodes || []).filter((d) => sir[d] === 'S').map((d) => {
    const parts = drugJp(d).split(/[・／/]/);
    return { drug: d, intr: (o.intrinsic || []).find((t) => parts.some((p) => p && t.includes(p))) || '自然耐性' };
  });
}
const expectedSConflicts = (o, sir) => (o.expectedS || []).filter((e) => sir[e.d] === 'R' || sir[e.d] === 'I');

/* ---------- 最近見た / お気に入り ---------- */
function touch(type, id) {
  recent = [{ type, id, ts: Date.now() }, ...recent.filter((r) => !(r.type === type && r.id === id))].slice(0, 20);
  save(LS.recent, recent);
}
const favKey = (t, i) => `${t}:${i}`;
const isFav = (t, i) => favs.includes(favKey(t, i));
function toggleFav(t, i) {
  const k = favKey(t, i);
  favs = favs.includes(k) ? favs.filter((x) => x !== k) : [k, ...favs];
  save(LS.fav, favs);
}
function labelOf(type, id) {
  if (type === 'org') { const o = orgById(id); return o && { e: detOf(id).g === '陽性' ? '🔴' : '🔵', t: o.jp, s: o.name }; }
  if (type === 'mech') { const m = mechById(id); return m && { e: '🧬', t: m.abbr, s: m.name }; }
  if (type === 'class') { const c = classById(id); return c && { e: '💊', t: c.name, s: c.spectrum || '' }; }
  if (type === 'note') { const n = notes.find((x) => x.id === id); return n && { e: kindOf(n.kind).e, t: n.title || '(無題)', s: kindOf(n.kind).jp }; }
  return null;
}
const hrefOf = (type, id) => `#/${type}/${id}`;

/* ---------- ダッシュボード ---------- */
function miniRow(type, id) {
  const L = labelOf(type, id);
  if (!L) return null;
  const a = el('button', 'card');
  a.innerHTML = `<div style="display:flex;gap:9px;align-items:center">
    <span style="font-size:17px">${L.e}</span>
    <span style="flex:1"><b style="font-size:14.5px">${esc(L.t)}</b>
      <small style="display:block;color:var(--tx3);font-size:11.5px">${esc(L.s)}</small></span>
    <span style="color:var(--tx3)">›</span></div>`;
  a.onclick = () => (location.hash = hrefOf(type, id));
  return a;
}
function renderHome() {
  $('#h-org').textContent = allOrgs().length;
  $('#h-drug').textContent = DRUG_CLASSES.reduce((a, c) => a + c.items.length, 0);
  $('#h-mech').textContent = MECHANISMS.length;
  $('#h-note').textContent = notes.length;

  const fill = (sel, arr, empty) => {
    const b = $(sel); b.innerHTML = '';
    const rows = arr.map((x) => miniRow(x.type, x.id)).filter(Boolean).slice(0, 5);
    if (!rows.length) { b.innerHTML = `<p class="empty">${empty}</p>`; return; }
    rows.forEach((r) => b.appendChild(r));
  };
  fill('#h-recent', recent, 'まだ何も見ていない。');
  fill('#h-fav', favs.map((k) => ({ type: k.split(':')[0], id: k.split(':').slice(1).join(':') })), '⭐ を押すとここに出る。');
  fill('#h-notes', [...notes].sort((a, b) => b.updatedAt - a.updatedAt).map((n) => ({ type: 'note', id: n.id })), '右下の＋から書く。');
  renderPet();
}

/* ---------- 菌一覧（カード） ---------- */
let orgFilter = '';
function renderOrgs() {
  const q = norm($('#org-q').value);

  const fb = $('#org-filters');
  if (!fb.children.length) {
    const groups = [...new Set(ORGANISMS.map((o) => o.group))];
    const mk = (id, label, cls) => {
      const c = el('button', 'chip ' + cls);
      c.textContent = label; c.dataset.f = id;
      c.onclick = () => { orgFilter = (orgFilter === id ? '' : id); renderOrgs(); };
      fb.appendChild(c);
    };
    mk('', 'すべて', 'grey');
    mk('陽性', '🔴 グラム陽性', 'warm');
    mk('陰性', '🔵 グラム陰性', 'cool');
    groups.forEach((g) => mk('g:' + g, g, 'grey'));
  }
  fb.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.f === orgFilter));

  const box = $('#org-list'); box.innerHTML = '';
  const list = allOrgs().filter((o) => {
    const d = detOf(o.id);
    if (orgFilter.startsWith('g:') && o.group !== orgFilter.slice(2)) return false;
    if (orgFilter === '陽性' && d.g !== '陽性') return false;
    if (orgFilter === '陰性' && d.g !== '陰性') return false;
    if (!q) return true;
    return norm(orgText(o)).includes(q);   // 名前だけでなく、感染症・染色像・確認試験の中身まで舐める
  });
  if (!list.length) { box.innerHTML = '<p class="empty">見つからない。「＋ 菌を追加」で足せる。</p>'; return; }
  list.forEach((o) => box.appendChild(orgCard(o)));
}
function orgCard(o) {
  const d = detOf(o.id);
  const tone = d.g === '陽性' ? 'pos' : d.g === '陰性' ? 'neg' : '';
  const c = el('button', 'card ocard ' + tone);
  const chips = [];
  if (d.g) chips.push(`<span class="chip ${d.g === '陽性' ? 'warm' : 'cool'}">グラム${esc(d.g)}</span>`);
  if (d.s) chips.push(`<span class="chip grey">${esc(d.s)}</span>`);
  if (d.res) chips.push(`<span class="chip red">${esc(d.res)}</span>`);
  const nn = notes.filter((n) => (n.orgIds || []).includes(o.id)).length;
  if (nn) chips.push(`<span class="chip sun">📝 ${nn}</span>`);
  c.innerHTML = `<span class="jp">${esc(o.jp)}</span> <span class="sci">${esc(o.name)}</span>
    ${d.dis ? `<div class="dis">${esc(d.dis.slice(0, 3).join('・'))}</div>` : ''}
    <div class="chips">${chips.join('')}</div>`;
  c.onclick = () => (location.hash = hrefOf('org', o.id));
  return c;
}

/* ---------- 菌 詳細 ---------- */
let curOrg = null;
function renderOrg(id) {
  const o = orgById(id); if (!o) { location.hash = '#/orgs'; return; }
  curOrg = o; touch('org', id); petAct('view_org');
  const d = detOf(id);
  const tone = d.g === '陽性' ? 'pos' : d.g === '陰性' ? 'neg' : '';

  const hero = $('#od-hero'); hero.className = 'hero ' + tone;
  hero.innerHTML = `<div style="display:flex;align-items:flex-start;gap:8px">
      <div style="flex:1"><span class="jp">${esc(o.jp)}</span><span class="sci">${esc(o.name)}</span></div>
      <button class="ico" id="od-fav">${isFav('org', id) ? '⭐' : '☆'}</button></div>
    <div style="margin-top:9px">
      ${d.g ? `<span class="chip ${d.g === '陽性' ? 'warm' : 'cool'}">グラム${esc(d.g)}</span>` : ''}
      ${d.s ? `<span class="chip grey">${esc(d.s)}</span>` : ''}
      <span class="chip grey">${esc(o.group)}</span>
      ${d.res ? `<span class="chip red">${esc(d.res)}</span>` : ''}</div>
    ${o.note ? `<p style="margin:10px 0 0;font-size:13.5px;color:var(--tx2)">${esc(o.note)}</p>` : ''}`;
  $('#od-fav').onclick = (e) => { e.stopPropagation(); toggleFav('org', id); renderOrg(id); };

  /* 現場で3秒で届くバー */
  const q = $('#od-quick'); q.innerHTML = '';
  const jump = (label, target, hot) => {
    const b = el('button', hot ? 'hot' : '');
    b.textContent = label;
    b.onclick = () => { const t = document.getElementById(target); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    q.appendChild(b);
  };
  if (d.rep) jump('⚠️ 報告注意', 'sec-rep', true);
  jump('🧪 感受性を入れる', 'sec-nav');
  if ((d.mech || []).length) jump('🧬 耐性機序', 'sec-mech');
  jump('💊 効く/効かない', 'sec-susc');
  jump('📝 自分のノート', 'sec-note');

  const b = $('#od-body'); b.innerHTML = '';

  if (d.rep) b.appendChild(blk('alert', '⚠️ 報告時の注意', `<p>${nl2(d.rep)}</p>`, 'sec-rep'));

  /* 感受性ナビ */
  const nav = blk('', '🧪 感受性を入れる → 追加でやる検査', '', 'sec-nav');
  const head = el('div', 'row');
  head.innerHTML = `<span class="lede grow" style="margin:0">S / I / R を押すと、次にやるべき確認試験が出る。</span>`;
  const rst = el('button', 'quiet'); rst.textContent = 'ぜんぶ消す';
  rst.onclick = () => { delete sirState[o.id]; save(LS.sir, sirState); renderOrg(o.id); };
  const sir = sirState[o.id] || {};
  rst.hidden = !Object.keys(sir).length;
  head.appendChild(rst);
  nav.appendChild(head);

  (o.drugs || []).forEach((dr) => {
    const row = el('div', 'kvrow');
    row.style.alignItems = 'center';
    const nm = el('span', 'v'); nm.textContent = dr; nm.style.fontSize = '13.5px';
    const sw = el('span'); sw.style.cssText = 'display:flex;gap:5px;flex:none';
    ['S', 'I', 'R'].forEach((v) => {
      const bb = el('button', 'chip ' + (sir[dr] === v ? (v === 'S' ? 'mint' : v === 'I' ? 'sun' : 'red') : 'grey'));
      bb.textContent = v; bb.style.cssText += 'width:40px;height:38px;justify-content:center;font-family:var(--fnt2);font-size:14px';
      bb.onclick = () => {
        const s = sirState[o.id] = sirState[o.id] || {};
        if (s[dr] === v) delete s[dr]; else s[dr] = v;
        save(LS.sir, sirState); renderOrg(o.id);
      };
      sw.appendChild(bb);
    });
    row.appendChild(nm); row.appendChild(sw);
    nav.appendChild(row);
  });

  intrinsicConflicts(o, sir).forEach((c) => {
    const w = el('div', 'blk tip'); w.style.marginTop = '10px';
    w.innerHTML = `<h3>🤔 おかしい</h3><p><b>${esc(c.drug)}</b> は ${esc(o.jp)} の自然耐性（${esc(c.intr)}）。
      感性と出るのはおかしい。菌種同定と測定をまず疑う。</p>`;
    nav.appendChild(w);
  });
  expectedSConflicts(o, sir).forEach((e) => {
    const w = el('div', 'blk alert'); w.style.marginTop = '10px';
    w.innerHTML = `<h3>🚨 検査を疑う</h3><p><b>${esc(e.d)}</b> が非感性。${esc(e.why)}。
      菌ではなく検査を疑う。別コロニーで再検し、菌種同定をやり直す。</p>`;
    nav.appendChild(w);
  });
  const hits = matchRules(o.id, sir);
  if (Object.keys(sir).length && !hits.length) {
    const p = el('p', 'empty'); p.textContent = '該当する確認試験のルールは無い。だからといって不要とは限らない。施設のSOPで確認する。';
    nav.appendChild(p);
  }
  hits.forEach((r) => nav.appendChild(hitCard(r)));
  b.appendChild(nav);

  /* 耐性機序リンク */
  if ((d.mech || []).length) {
    const m = blk('', '🧬 関連する耐性機序', '', 'sec-mech');
    d.mech.forEach((mid) => {
      const mm = mechById(mid); if (!mm) return;
      const c = el('button', 'chip lav'); c.textContent = mm.abbr;
      c.onclick = () => (location.hash = hrefOf('mech', mid));
      m.appendChild(c);
    });
    b.appendChild(m);
  }

  /* 効く/効かない */
  const su = blk('', '💊 効く薬 / 効かない薬', '', 'sec-susc');
  if (d.susc) su.insertAdjacentHTML('beforeend', `<p style="margin-bottom:10px">${nl2(d.susc)}</p>`);
  if ((o.intrinsic || []).length) {
    su.insertAdjacentHTML('beforeend', `<h3 style="margin-top:10px">✗ 自然耐性（効かないはず）</h3><ul>${
      o.intrinsic.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`);
  }
  if ((o.expectedS || []).length) {
    su.insertAdjacentHTML('beforeend', `<h3 style="margin-top:12px">✓ 必ず感性（耐性ならおかしい）</h3><ul>${
      o.expectedS.map((e) => `<li><b>${esc(e.d)}</b> — ${esc(e.why)}</li>`).join('')}</ul>`);
  }
  b.appendChild(su);

  /* 基本情報 */
  const info = blk('', '📖 基本情報', '');
  const kv = (k, v) => v ? `<div class="kvrow"><span class="k">${k}</span><span class="v">${nl2(v)}</span></div>` : '';
  info.insertAdjacentHTML('beforeend',
    kv('学名', o.name) + kv('分類', o.group) +
    kv('グラム', d.g) + kv('形態', d.s) +
    kv('染色像', d.stain) + kv('培養', d.cult) +
    kv('主な感染症', (d.dis || []).join('・')) +
    kv('感染対策', d.ctrl) + kv('学習メモ', d.memo));
  b.appendChild(info);

  /* ノート */
  const nb = blk('', '📝 自分のノート', '', 'sec-note');
  const mine = notes.filter((n) => (n.orgIds || []).includes(o.id)).sort((a, x) => x.updatedAt - a.updatedAt);
  if (!mine.length) nb.insertAdjacentHTML('beforeend', '<p class="empty">この菌のノートはまだ無い。</p>');
  mine.forEach((n) => nb.appendChild(noteCard(n, '')));
  const add = el('button', 'quiet'); add.textContent = '＋ この菌のノートを書く';
  add.style.marginTop = '10px';
  add.onclick = () => (location.hash = '#/edit/new?org=' + o.id);
  nb.appendChild(add);
  b.appendChild(nb);
}
function blk(cls, title, html, id) {
  const d = el('div', 'blk ' + cls);
  if (id) d.id = id;
  d.innerHTML = `<h3>${title}</h3>${html}`;
  return d;
}
function hitCard(r) {
  const c = el('div', 'blk ' + (r.urgency === 'urgent' ? 'alert' : 'tip'));
  c.style.marginTop = '10px';
  const v = !!verified[r.id];
  let h = `<h3>${r.urgency === 'urgent' ? '🚨' : '🔎'} ${esc(r.title)}</h3>
    <span class="chip ${v ? 'mint' : 'sun'}">${v ? '確認済み' : '未確認 — 鵜呑みにしない'}</span>`;
  if (r.why) h += `<p style="margin-top:8px;color:var(--tx2);font-size:13px">${esc(r.why)}</p>`;
  if (r.tests?.length) h += `<h3 style="margin-top:12px">追加でやる検査</h3><ul>${r.tests.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  if (r.report?.length) h += `<h3 style="margin-top:12px">報告のしかた</h3><ul>${r.report.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  if (r.notify) h += `<div class="blk alert" style="margin-top:10px"><p>📞 ${esc(r.notify)}</p></div>`;
  h += `<p style="margin-top:10px;font-size:11.5px;color:var(--tx3)">根拠：${esc(r.source)}</p>`;
  c.innerHTML = h;
  const lab = el('label'); lab.style.cssText = 'display:flex;gap:7px;align-items:center;font-size:12.5px;cursor:pointer';
  const cb = el('input'); cb.type = 'checkbox'; cb.checked = v;
  cb.onchange = () => { if (cb.checked) { verified[r.id] = true; petAct('verify'); } else delete verified[r.id]; save(LS.verified, verified); renderOrg(curOrg.id); };
  lab.appendChild(cb); lab.appendChild(document.createTextNode('CLSI M100 と自施設のSOPで確認した'));
  c.appendChild(lab);
  return c;
}

/* ---------- 抗菌薬DB ---------- */
function renderDrugs() {
  const q = norm($('#drug-q').value);
  const box = $('#drug-list'); box.innerHTML = '';
  let n = 0;
  DRUG_CLASSES.forEach((c) => {
    const items = c.items.filter((i) => !q || norm(`${i.abbr} ${i.jp} ${i.memo} ${c.name} ${c.en} ${c.big}`).includes(q));
    const clsHit = !q || norm(`${c.name} ${c.en} ${c.big} ${c.spectrum}`).includes(q);
    if (!items.length && !clsHit) return;
    n++;
    const card = el('div', 'card flat');
    card.innerHTML = `<div style="display:flex;align-items:center;gap:7px">
        <b style="font-size:15px">${esc(c.name)}</b>
        ${c.big ? `<span class="chip grey">${esc(c.big)}</span>` : ''}</div>
      <div style="font-family:var(--fnt2);font-size:11.5px;color:var(--tx3)">${esc(c.en)}</div>
      <div class="blk" style="margin-top:9px;box-shadow:none;background:var(--card2)">
        <h3>⚙️ 作用機序</h3><p style="font-size:13px">${esc(c.note)}</p>
        <h3 style="margin-top:9px">🎯 スペクトラム</h3><p style="font-size:13px">${esc(c.spectrum || '')}</p></div>`;
    (items.length ? items : c.items).forEach((i) => {
      const d = el('div', 'ditem');
      d.innerHTML = `<span class="ab">${esc(i.abbr)}</span><span class="jp">${esc(i.jp)}</span>
        ${i.memo ? `<span class="me">${esc(i.memo)}</span>` : ''}`;
      card.appendChild(d);
    });
    const ms = MECHANISMS.filter((m) => (m.classes || []).includes(c.id));
    if (ms.length) {
      const r = el('div'); r.style.marginTop = '10px';
      r.innerHTML = '<div style="font-size:12px;color:var(--tx3);margin-bottom:4px">この系統を壊す耐性機序</div>';
      ms.forEach((m) => {
        const b = el('button', 'chip lav'); b.textContent = m.abbr;
        b.onclick = () => (location.hash = hrefOf('mech', m.id));
        r.appendChild(b);
      });
      card.appendChild(r);
    }
    box.appendChild(card);
  });
  if (!n) box.innerHTML = '<p class="empty">見つからない。</p>';
}

/* ---------- 耐性機序DB ---------- */
function renderMechs() {
  const box = $('#mech-list'); box.innerHTML = '';
  MECHANISMS.forEach((m) => {
    const c = el('button', 'card');
    c.innerHTML = `<div style="display:flex;align-items:center;gap:8px">
        <span class="chip lav" style="font-family:var(--fnt2);font-size:13px">${esc(m.abbr)}</span>
        <b style="flex:1;font-size:14.5px">${esc(m.name)}</b><span style="color:var(--tx3)">›</span></div>
      <div style="font-size:12.5px;color:var(--tx2);margin-top:6px">${esc(m.type)}</div>
      ${m.notify ? `<div style="margin-top:6px"><span class="chip red">📞 ${esc(m.notify)}</span></div>` : ''}`;
    c.onclick = () => (location.hash = hrefOf('mech', m.id));
    box.appendChild(c);
  });
}
function renderMech(id) {
  const m = mechById(id); if (!m) { location.hash = '#/mechs'; return; }
  touch('mech', id);
  const b = $('#mech-body'); b.innerHTML = '';
  const hero = el('div', 'hero');
  hero.innerHTML = `<div style="display:flex;align-items:flex-start;gap:8px">
      <div style="flex:1"><span class="jp" style="font-family:var(--fnt2)">${esc(m.abbr)}</span>
        <div style="font-size:15px;font-weight:700;margin-top:2px">${esc(m.name)}</div>
        <div class="sci">${esc(m.en)}</div></div>
      <button class="ico" id="mf">${isFav('mech', id) ? '⭐' : '☆'}</button></div>
    <div style="margin-top:9px"><span class="chip lav">${esc(m.type)}</span>
      ${m.notify ? `<span class="chip red">📞 ${esc(m.notify)}</span>` : ''}</div>`;
  b.appendChild(hero);
  hero.querySelector('#mf').onclick = () => { toggleFav('mech', id); renderMech(id); };

  b.appendChild(blk('', '📌 どういう機序か', `<p>${nl2(m.summary)}</p>`));
  b.appendChild(blk('', '🧬 原因遺伝子', `<p>${nl2(m.genes)}</p>`));
  b.appendChild(blk('', '💥 壊される薬 / 残る薬',
    `<h3>壊される</h3><p>${nl2(m.breaks)}</p><h3 style="margin-top:10px">残る</h3><p>${nl2(m.spared)}</p>`));
  b.appendChild(blk('', '🔎 検査時の注意', `<ul>${m.detect.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`));
  b.appendChild(blk('alert', '⚠️ 落とし穴・報告時の注意', `<p>${nl2(m.pitfall)}</p>`));

  const rel = blk('', '🔗 関連', '');
  rel.insertAdjacentHTML('beforeend', '<div style="font-size:12px;color:var(--tx3);margin:6px 0 4px">関連する菌</div>');
  (m.organisms || []).forEach((oid) => {
    const o = orgById(oid); if (!o) return;
    const d = detOf(oid);
    const c = el('button', 'chip ' + (d.g === '陽性' ? 'warm' : 'cool'));
    c.textContent = o.jp;
    c.onclick = () => (location.hash = hrefOf('org', oid));
    rel.appendChild(c);
  });
  rel.insertAdjacentHTML('beforeend', '<div style="font-size:12px;color:var(--tx3);margin:10px 0 4px">関連する抗菌薬の系統</div>');
  (m.classes || []).forEach((cid) => {
    const c = classById(cid); if (!c) return;
    const bb = el('button', 'chip mint'); bb.textContent = c.name;
    bb.onclick = () => { location.hash = '#/drugs'; setTimeout(() => { $('#drug-q').value = c.name; renderDrugs(); }, 60); };
    rel.appendChild(bb);
  });
  b.appendChild(rel);

  const mine = notes.filter((n) => (n.mechIds || []).includes(id));
  if (mine.length) {
    const nb = blk('', '📝 自分のノート', '');
    mine.forEach((n) => nb.appendChild(noteCard(n, '')));
    b.appendChild(nb);
  }
}

/* ---------- 同定フロー ----------
 * グラム性状・形態は DETAILS から、鑑別検査は FLOW_TAGS から取る。
 * フィルタは「その所見の値を持たない菌は除外しない」。だから候補が空になりにくく、
 * タグの付け忘れが誤除外にならない。あくまで“絞る”ための道具。 */
let flowAns = {};
const gramBucket = (g) => {
  g = g || '';
  if (g.includes('陽性')) return '陽性';
  if (g.includes('陰性')) return '陰性';
  if (g.includes('抗酸')) return '抗酸菌';
  if (g.includes('真菌')) return '真菌';
  return 'その他';
};
const shapeBucket = (s) => {
  s = s || '';
  if (s.includes('球桿')) return '球桿菌';
  if (s.includes('球')) return '球菌';
  if (s.includes('らせん') || s.includes('湾曲')) return 'らせん菌';
  if (s.includes('酵母')) return '酵母';
  if (s.includes('糸状')) return '糸状菌';
  if (s.includes('桿')) return '桿菌';
  return 'その他';
};
function flowValue(o, key) {
  const d = detOf(o.id), t = FLOW_TAGS[o.id] || {};
  /* gram/shape が「その他」に落ちる菌（gram-variable・染まらない・多形性）は、
   * その質問では判別できない＝絞り込みに使わない（null扱いで残す）。
   * これをしないと、ガードネレラ等がグラム染色を選んだ瞬間に消える。 */
  if (key === 'gram') { const g = gramBucket(d.g); return g === 'その他' ? undefined : g; }
  if (key === 'shape') { const s = shapeBucket(d.s); return s === 'その他' ? undefined : s; }
  return t[key];   // undefined なら「この検査では絞れない」＝除外しない
}
function flowCandidates() {
  return ORGANISMS.filter((o) =>
    Object.entries(flowAns).every(([k, v]) => {
      if (v === '__skip__') return true;   // 「わからない」は絞り込みに使わない
      const ov = flowValue(o, k);
      return ov == null || ov === v;       // 値を持たない菌は残す
    })
  );
}
function renderFlow() {
  const cand = flowCandidates();

  /* いま選んだ条件（外せる） */
  const ch = $('#flow-chosen'); ch.innerHTML = '';
  const steps = FLOW_STEPS;
  Object.keys(flowAns).forEach((k) => {
    const st = steps.find((s) => s.key === k);
    const opt = st && st.options.find((o) => o.v === flowAns[k]);
    const label = opt ? opt.label
      : flowAns[k] === '__skip__' ? `${st ? st.label.replace(/は？$/, '') : k}：わからない`
      : `${k}:${flowAns[k]}`;
    const c = el('button', 'chip ' + (flowAns[k] === '__skip__' ? 'grey' : 'mint'));
    c.textContent = label + ' ✕';
    c.onclick = () => { delete flowAns[k]; renderFlow(); };
    ch.appendChild(c);
  });
  if (Object.keys(flowAns).length) {
    const rs = el('button', 'chip grey'); rs.textContent = 'ぜんぶ消す';
    rs.onclick = () => { flowAns = {}; renderFlow(); };
    ch.appendChild(rs);
  }

  /* 次に聞く質問：未回答で、候補が2通り以上の値を持つ最初のステップ */
  const qbox = $('#flow-q'); qbox.innerHTML = '';
  const next = steps.find((st) => {
    if (flowAns[st.key] != null) return false;
    const vals = new Set(cand.map((o) => flowValue(o, st.key)).filter((v) => v != null));
    return vals.size >= 2 || (st.key === 'gram' && !Object.keys(flowAns).length);
  });
  if (next) {
    const card = el('div', 'blk');
    card.innerHTML = `<h3>${esc(next.label)}</h3>`;
    const row = el('div', 'row'); row.style.marginTop = '4px';
    next.options.forEach((opt) => {
      /* その選択で候補が残るものだけ出す（0件になる選択肢は見せない） */
      if (cand.length && !cand.some((o) => flowValue(o, next.key) === opt.v)) return;
      const b = el('button', 'quiet'); b.textContent = opt.label;
      b.onclick = () => { const first = !Object.keys(flowAns).length; flowAns[next.key] = opt.v; if (first) petAct('flow'); renderFlow(); };
      row.appendChild(b);
    });
    const skip = el('button', 'chip grey'); skip.textContent = 'わからない / 次へ';
    skip.style.alignSelf = 'center';
    skip.onclick = () => { flowAns[next.key] = '__skip__'; renderFlow(); };
    card.appendChild(row); card.appendChild(skip);
    qbox.appendChild(card);
  }

  /* 候補一覧 */
  const cb = $('#flow-cand'); cb.innerHTML = '';
  const h = el('h2', 'sec');
  h.innerHTML = `候補の菌 <span class="n">${cand.length}</span>`;
  cb.appendChild(h);
  if (!cand.length) {
    cb.insertAdjacentHTML('beforeend', '<p class="empty">条件に合う菌が無い。ひとつ前の条件を外すか、菌タブで直接検索する。</p>');
    return;
  }
  if (cand.length > 20 && Object.keys(flowAns).length < 2) {
    cb.insertAdjacentHTML('beforeend', '<p class="lede">まず「グラム染色」と「形」を選ぶと一気に絞れる。</p>');
  }
  cand.slice(0, 40).forEach((o) => {
    const d = detOf(o.id), t = FLOW_TAGS[o.id] || {};
    const tone = d.g && d.g.includes('陽性') ? 'pos' : d.g && d.g.includes('陰性') ? 'neg' : '';
    const c = el('button', 'card ocard ' + tone);
    const clues = (t.special || []).slice(0, 3).map((s) => `<span class="chip grey">${esc(s)}</span>`).join('');
    c.innerHTML = `<span class="jp">${esc(o.jp)}</span> <span class="sci">${esc(o.name)}</span>
      ${d.dis ? `<div class="dis">${esc(d.dis.slice(0, 2).join('・'))}</div>` : ''}
      ${clues ? `<div class="chips" style="margin-top:6px">${clues}</div>` : ''}`;
    c.onclick = () => (location.hash = hrefOf('org', o.id));
    cb.appendChild(c);
  });
}

/* ---------- 検索 ---------- */
const norm = (s) => String(s || '').toLowerCase().normalize('NFKC');
function noteText(n) {
  const a = normAI(n.ai) || {};
  return [n.title, n.body, (n.tags || []).join(' '),
    (a.points || []).join(' '), (a.cautions || []).join(' '), (a.steps || []).join(' '),
    (a.tips || []).join(' '), a.summary].join(' ');
}
/* 検索は「名前」だけでは足りない。
 * 現場で引きたいのは mCIM・Dテスト・SMA阻害試験・ニトロセフィン のような手順の名前で、
 * それは確認試験ルールと耐性機序の検出法の“中身”にしか書かれていない。そこまで舐める。 */
function ruleText(r) {
  return [r.title, r.why, r.source, r.notify,
    (r.tests || []).join(' '), (r.report || []).join(' ')].join(' ');
}
function orgText(o) {
  const d = detOf(o.id);
  const rules = RULES.filter((r) => r.organisms.includes(o.id)).map(ruleText).join(' ');
  return [o.jp, o.name, o.group, o.note,
    d.g, d.s, d.res, (d.dis || []).join(' '), d.stain, d.cult, d.susc, d.ctrl, d.rep, d.memo,
    (o.intrinsic || []).join(' '), (o.expectedS || []).map((e) => e.d + e.why).join(' '),
    (o.drugs || []).join(' '), rules].join(' ');
}
function mechText(m) {
  return [m.abbr, m.name, m.en, m.type, m.summary, m.genes, m.breaks, m.spared,
    (m.detect || []).join(' '), m.pitfall, m.notify].join(' ');
}
function classText(c) {
  return [c.name, c.en, c.big, c.spectrum, c.note,
    c.items.map((i) => `${i.abbr} ${i.jp} ${i.memo}`).join(' ')].join(' ');
}
function searchAll(q) {
  if (!q) return [];
  const t = norm(q).split(/\s+/).filter(Boolean);
  const hit = (s) => t.every((x) => norm(s).includes(x));
  const out = [];
  MECHANISMS.forEach((m) => { if (hit(mechText(m))) out.push({ type: 'mech', id: m.id }); });
  allOrgs().forEach((o) => { if (hit(orgText(o))) out.push({ type: 'org', id: o.id }); });
  DRUG_CLASSES.forEach((c) => { if (hit(classText(c))) out.push({ type: 'class', id: c.id }); });
  notes.forEach((n) => { if (hit(noteText(n))) out.push({ type: 'note', id: n.id }); });
  return out.slice(0, 40);
}
let palSel = 0;
function renderPal() {
  const q = $('#pal-q').value;
  const res = searchAll(q);
  const box = $('#pal-res'); box.innerHTML = '';
  if (!q) { box.innerHTML = '<p class="empty">菌名・薬・耐性機序・ノート・タグ、なんでも。</p>'; return; }
  if (!res.length) { box.innerHTML = '<p class="empty">見つからない。</p>'; return; }
  res.forEach((r, i) => {
    const L = labelOf(r.type, r.id); if (!L) return;
    const d = el('div', 'ri' + (i === palSel ? ' sel' : ''));
    d.innerHTML = `<span style="font-size:16px">${L.e}</span>
      <span class="t">${esc(L.t)}<small>${esc(L.s)}</small></span>`;
    d.onclick = () => { closePal(); location.hash = hrefOf(r.type, r.id); };
    box.appendChild(d);
  });
}
function openPal() { $('#pal').hidden = false; $('#pal-q').value = ''; palSel = 0; renderPal(); $('#pal-q').focus(); }
function closePal() { $('#pal').hidden = true; }

/* ---------- ノート ---------- */
let noteFilter = '';
function renderNotes() {
  const q = $('#note-q').value.trim();
  const fb = $('#note-filters');
  if (!fb.children.length) {
    const mk = (id, label, cls) => {
      const c = el('button', 'chip ' + cls); c.textContent = label; c.dataset.f = id;
      c.onclick = () => { noteFilter = (noteFilter === id ? '' : id); renderNotes(); };
      fb.appendChild(c);
    };
    mk('', 'すべて', 'grey');
    KINDS.forEach((k) => mk(k.id, `${k.e} ${k.jp}`, k.c));
  }
  fb.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.f === noteFilter));

  const box = $('#note-list'); box.innerHTML = '';
  const t = norm(q).split(/\s+/).filter(Boolean);
  const list = notes
    .filter((n) => (!noteFilter || n.kind === noteFilter) && (!t.length || t.every((x) => norm(noteText(n)).includes(x))))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  if (!list.length) { box.innerHTML = `<p class="empty">${notes.length ? '見つからない。' : 'まだノートが無い。右下の＋から書く。'}</p>`; return; }
  list.forEach((n) => box.appendChild(noteCard(n, q)));
}
function mark(s, q) {
  let h = esc(s);
  norm(q).split(/\s+/).filter(Boolean).forEach((t) => {
    h = h.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => `<mark>${m}</mark>`);
  });
  return h;
}
function noteCard(n, q) {
  const k = kindOf(n.kind);
  const c = el('button', 'card ncard');
  const sum = (n.ai && n.ai.summary) || (n.body || '').slice(0, 90);
  c.innerHTML = `<div style="display:flex;gap:8px;align-items:center">
      <span class="chip ${k.c}">${k.e} ${k.jp}</span>
      ${isFav('note', n.id) ? '<span>⭐</span>' : ''}</div>
    <div class="ttl" style="margin-top:6px">${mark(n.title || '(無題)', q)}</div>
    <div class="bd">${mark(sum, q)}</div>
    <div class="ft">${(n.tags || []).map((t) => `<span class="chip grey">${esc(t)}</span>`).join('')}
      ${new Date(n.updatedAt).toLocaleDateString('ja-JP')}${n.photos?.length ? ' ・📷' + n.photos.length : ''}</div>`;
  c.onclick = () => (location.hash = hrefOf('note', n.id));
  return c;
}

/* ---------- ノート閲覧（折りたたみ） ---------- */
let viewToken = 0;
async function renderView(id) {
  const n = notes.find((x) => x.id === id); if (!n) { location.hash = '#/notes'; return; }
  editing = n; touch('note', id);
  /* この描画の通し番号。await の後で別の描画が始まっていたら、古い方は中断する
   * （写真読込中に⭐やページ遷移で再入すると、写真が二重に追加される。静的レビュー#2） */
  const my = ++viewToken;
  const k = kindOf(n.kind), a = normAI(n.ai) || {};
  const b = $('#v-body'); b.innerHTML = '';

  const hero = el('div', 'hero');
  hero.innerHTML = `<div style="display:flex;align-items:flex-start;gap:8px">
      <div style="flex:1"><span class="chip ${k.c}">${k.e} ${k.jp}</span>
        <div class="jp" style="margin-top:6px">${esc(n.title || '(無題)')}</div></div>
      <button class="ico" id="nf">${isFav('note', id) ? '⭐' : '☆'}</button></div>
    ${a.summary ? `<p style="margin:10px 0 0;font-size:14px;color:var(--tx2)">✨ ${esc(a.summary)}</p>` : ''}
    <div style="margin-top:8px">${(n.tags || []).map((t) => `<span class="chip lav">${esc(t)}</span>`).join('')}</div>`;
  b.appendChild(hero);
  hero.querySelector('#nf').onclick = () => { toggleFav('note', id); renderView(id); };

  const fold = (title, items, open) => {
    if (!items || !items.length) return;
    const d = el('details', 'fold'); if (open) d.open = true;
    d.innerHTML = `<summary>${title}</summary><div class="body"><ul>${
      items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
    b.appendChild(d);
  };
  fold('📌 要点', a.points, true);
  fold('⚠️ 注意点', a.cautions, true);
  fold('🛠 作業手順', a.steps, true);
  fold('💡 現場のコツ・先輩メモ', a.tips, true);
  if (a.report) {
    const d = el('details', 'fold'); d.open = true;
    d.innerHTML = `<summary>📞 報告・連絡事項</summary><div class="body">${nl2(a.report)}</div>`;
    b.appendChild(d);
  }

  /* 相互リンク */
  const links = [];
  (n.orgIds || []).forEach((x) => { const o = orgById(x); if (o) links.push({ t: 'org', id: x, l: '🦠 ' + o.jp, c: detOf(x).g === '陽性' ? 'warm' : 'cool' }); });
  (n.mechIds || []).forEach((x) => { const m = mechById(x); if (m) links.push({ t: 'mech', id: x, l: '🧬 ' + m.abbr, c: 'lav' }); });
  (n.classIds || []).forEach((x) => { const c = classById(x); if (c) links.push({ t: 'class', id: x, l: '💊 ' + c.name, c: 'mint' }); });
  if (links.length) {
    const r = blk('', '🔗 関連', '');
    links.forEach((L) => {
      const bb = el('button', 'chip ' + L.c); bb.textContent = L.l;
      bb.onclick = () => (location.hash = hrefOf(L.t, L.id));
      r.appendChild(bb);
    });
    b.appendChild(r);
  }

  const raw = el('details', 'fold');
  raw.innerHTML = `<summary>📄 元のメモ</summary><div class="body" style="white-space:pre-wrap">${esc(n.body || '')}</div>`;
  b.appendChild(raw);

  for (const pid of n.photos || []) {
    const du = await getPhoto(pid);
    if (my !== viewToken) return;   // 描画が入れ替わった。この続きは捨てる
    if (!du) continue;
    const im = el('img', 'shot'); im.src = du; b.appendChild(im);
    const cap = (n.captions || {})[pid];
    if (cap) {
      const cc = el('div', 'blk'); cc.style.marginTop = '6px';
      cc.innerHTML = `<h3>👀 この写真</h3><p style="font-size:13.5px">${esc(cap)}</p>`;
      b.appendChild(cc);
    }
  }
  if (my !== viewToken) return;

  const row = el('div', 'row'); row.style.marginTop = '20px';
  const e = el('button', 'quiet'); e.textContent = '✏️ 編集する';
  e.onclick = () => (location.hash = '#/edit/' + id);
  row.appendChild(e);
  b.appendChild(row);
}

/* ---------- 編集 ---------- */
let editing = null, editPhotos = [], piiAck = false;
let linkSel = { orgIds: [], mechIds: [], classIds: [] };

async function openEdit(arg) {
  piiAck = false; $('#pii-warn').innerHTML = ''; $('#ai-out').innerHTML = '';
  /* 前のノートのAI整理結果が残ると、次のノートにくっつく。必ず捨てる。 */
  aiDraft = null;
  const [id, qs] = String(arg || 'new').split('?');
  const pre = new URLSearchParams(qs || '');
  editing = id !== 'new' ? notes.find((n) => n.id === id) : null;

  const ks = $('#e-kind'); ks.innerHTML = '';
  KINDS.forEach((k) => { const o = el('option'); o.value = k.id; o.textContent = `${k.e} ${k.jp}`; ks.appendChild(o); });

  $('#e-head').textContent = editing ? '✏️ ノートを編集' : '📝 新しいノート';
  ks.value = editing ? editing.kind : 'knowledge';
  $('#e-ttl').value = editing ? editing.title : '';
  $('#e-body').value = editing ? editing.body : '';
  $('#e-tags').value = editing ? (editing.tags || []).join(', ') : '';
  $('#btn-del').hidden = !editing;

  linkSel = {
    orgIds: editing ? [...(editing.orgIds || [])] : (pre.get('org') ? [pre.get('org')] : []),
    mechIds: editing ? [...(editing.mechIds || [])] : [],
    classIds: editing ? [...(editing.classIds || [])] : [],
  };
  if (editing && editing.ai) showAI(editing.ai);
  drawLinks();

  editPhotos = [];
  if (editing?.photos) {
    for (const pid of editing.photos) {
      const du = await getPhoto(pid);
      if (du) editPhotos.push({ id: pid, dataUrl: du, caption: (editing.captions || {})[pid] || '' });
    }
  }
  drawThumbs();
}
function drawLinks() {
  const b = $('#e-links'); b.innerHTML = '';
  const add = (label, cls, onclick) => { const c = el('button', 'chip ' + cls); c.textContent = label; c.onclick = onclick; b.appendChild(c); };
  linkSel.orgIds.forEach((x) => { const o = orgById(x); if (o) add('🦠 ' + o.jp + ' ✕', 'warm', () => { linkSel.orgIds = linkSel.orgIds.filter((y) => y !== x); drawLinks(); }); });
  linkSel.mechIds.forEach((x) => { const m = mechById(x); if (m) add('🧬 ' + m.abbr + ' ✕', 'lav', () => { linkSel.mechIds = linkSel.mechIds.filter((y) => y !== x); drawLinks(); }); });
  linkSel.classIds.forEach((x) => { const c = classById(x); if (c) add('💊 ' + c.name + ' ✕', 'mint', () => { linkSel.classIds = linkSel.classIds.filter((y) => y !== x); drawLinks(); }); });
  add('＋ 追加', 'grey', () => {
    const q = prompt('菌名・抗菌薬・耐性機序の名前を入れる');
    if (!q) return;
    const r = searchAll(q).find((x) => x.type !== 'note');
    if (!r) { alert('見つからない。'); return; }
    const key = r.type === 'org' ? 'orgIds' : r.type === 'mech' ? 'mechIds' : 'classIds';
    if (!linkSel[key].includes(r.id)) linkSel[key].push(r.id);
    drawLinks();
  });
}
function drawThumbs() {
  const b = $('#e-thumbs'); b.innerHTML = '';
  editPhotos.forEach((p, i) => {
    const wrap = el('div'); wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;align-items:center';
    const im = el('img'); im.src = p.dataUrl; im.title = 'タップで削除';
    im.onclick = () => { if (confirm('この写真を消す？')) { editPhotos.splice(i, 1); drawThumbs(); } };
    wrap.appendChild(im);
    /* 写真をAIに説明してもらう（グラム染色・コロニーの学習用） */
    const btn = el('button', 'chip lav'); btn.textContent = '👀 AI説明';
    btn.style.cssText = 'border:none;cursor:pointer;font-size:10.5px';
    btn.onclick = () => describePhoto(i);
    wrap.appendChild(btn);
    b.appendChild(wrap);
  });
}
async function describePhoto(i) {
  const p = editPhotos[i]; if (!p) return;
  if (!aiUrl) { $('#ai-out').innerHTML = '<div class="aibox">AIサーバーが未設定。⚙️設定 から。</div>'; return; }
  $('#ai-out').innerHTML = '<div class="aibox">👀 写真を見ています…</div>';
  try {
    const res = await fetch(aiUrl.replace(/\/$/, '') + '/describe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: [p.dataUrl] }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    if (d.error) throw new Error(d.error);
    const sec = (t, a) => (a && a.length) ? `<h3 style="margin-top:8px">${t}</h3><ul>${a.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
    $('#ai-out').innerHTML = `<div class="blk"><h3>👀 この写真（${esc(d.kind || '不明')}）</h3>
      ${sec('見える所見', d.findings)}${sec('矛盾しない候補', d.suspect)}${sec('次に確認する検査', d.next)}
      ${d.caution ? `<div class="blk alert" style="margin-top:8px"><p>${esc(d.caution)}</p></div>` : ''}
      <p style="margin-top:8px;font-size:11.5px;color:var(--tx3)">※ 学習の助け。菌名は断定していない。最終判断は自分と施設の同定手順で。</p></div>`;
    /* この説明を写真のキャプションとして保存できるようにしておく */
    p.caption = [d.kind, (d.findings || []).join('、')].filter(Boolean).join('：');
  } catch (e) {
    $('#ai-out').innerHTML = `<div class="aibox">うまくいかなかった（${esc(e.message)}）</div>`;
  }
}

/* ---------- 電話報告テンプレ（保存しない） ---------- */
function renderReport() {
  document.querySelectorAll('.rp').forEach((inp) => { inp.oninput = buildReport; });
  buildReport();
}
function buildReport() {
  const v = (id) => ($('#' + id).value || '').trim();
  const lines = [];
  if (v('rp-to')) lines.push(`【報告先】${v('rp-to')}`);
  if (v('rp-spec')) lines.push(`【検体】${v('rp-spec')}`);
  if (v('rp-org')) lines.push(`【菌種・所見】${v('rp-org')}`);
  if (v('rp-res')) lines.push(`【耐性・届出】${v('rp-res')}`);
  if (v('rp-note')) lines.push(`【補足】${v('rp-note')}`);
  if (v('rp-by')) lines.push(`【報告者】${v('rp-by')}`);
  lines.push('【復唱確認】済 ／ 【報告時刻】___:___');
  $('#rp-out').textContent = lines.join('\n');
}
function clearReport() {
  document.querySelectorAll('.rp').forEach((inp) => { inp.value = ''; });
  buildReport();
}

/* ---------- AI日報 ---------- */
async function makeDaily() {
  if (!aiUrl) { $('#dl-out').innerHTML = '<div class="aibox">AIサーバーが未設定。⚙️設定 から。</div>'; return; }
  /* 今日（この端末の0時以降）に更新されたノートだけ渡す */
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = notes.filter((n) => n.updatedAt >= start.getTime());
  if (!today.length) { $('#dl-out').innerHTML = '<p class="empty">今日はまだノートが無い。ノートを書くと日報がつくれる。</p>'; return; }
  $('#dl-out').innerHTML = '<div class="aibox">✨ 今日のノートから日報をつくっています…</div>';
  try {
    const res = await fetch(aiUrl.replace(/\/$/, '') + '/daily', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: today.map((n) => ({ kind: kindOf(n.kind).jp, title: n.title, body: n.body })) }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    if (d.error) throw new Error(d.error);
    const sec = (t, a) => (a && a.length) ? `<h3 style="margin-top:10px">${t}</h3><ul>${a.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
    $('#dl-out').innerHTML = `<div class="blk">
      ${d.oneline ? `<p style="font-size:15px"><b>✨ ${esc(d.oneline)}</b></p>` : ''}
      ${sec('本日やったこと', d.done)}${sec('学んだこと', d.learned)}
      ${sec('トラブルと対応', d.troubles)}${sec('明日やること', d.tomorrow)}
      <p style="margin-top:10px;font-size:11.5px;color:var(--tx3)">今日のノート${today.length}件から。ノートに書いたことだけをまとめている。</p></div>
      <div class="row" style="margin-top:10px"><button class="quiet" id="dl-copy">📋 コピー</button></div>`;
    petAct('daily');
    $('#dl-copy').onclick = () => {
      const txt = $('#dl-out .blk').innerText;
      navigator.clipboard?.writeText(txt).then(() => { $('#dl-copy').textContent = '✓ コピーした'; });
    };
  } catch (e) {
    $('#dl-out').innerHTML = `<div class="aibox">うまくいかなかった（${esc(e.message)}）</div>`;
  }
}
/* AIが配列を返すはずのところに文字列を返しても、画面を壊さない。
 * サーバー側でも矯正しているが、外部の返り値は二重に疑う。 */
const asArr = (v) => Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim())
  : (typeof v === 'string' && v.trim() ? [v.trim()] : []);
function normAI(ai) {
  if (!ai || typeof ai !== 'object') return null;
  return {
    summary: typeof ai.summary === 'string' ? ai.summary : '',
    report: typeof ai.report === 'string' ? ai.report : '',
    points: asArr(ai.points), cautions: asArr(ai.cautions),
    steps: asArr(ai.steps), tips: asArr(ai.tips),
  };
}
function showAI(raw) {
  const ai = normAI(raw);
  const o = $('#ai-out'); o.innerHTML = '';
  if (!ai) return;
  const sec = (t, items) => items.length ? `<h3 style="margin-top:10px">${t}</h3><ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  const d = el('div', 'blk');
  d.innerHTML = `<h3>✨ AIが整理した</h3>
    ${ai.summary ? `<p><b>${esc(ai.summary)}</b></p>` : ''}
    ${sec('📌 要点', ai.points)}${sec('⚠️ 注意点', ai.cautions)}
    ${sec('🛠 作業手順', ai.steps)}${sec('💡 現場のコツ', ai.tips)}
    ${ai.report ? `<h3 style="margin-top:10px">📞 報告・連絡</h3><p>${nl2(ai.report)}</p>` : ''}`;
  o.appendChild(d);
  aiDraft = ai;
}
let aiDraft = null;

async function runAI() {
  if (!aiUrl) {
    $('#ai-out').innerHTML = `<div class="aibox">AIサーバーがまだ設定されていない。⚙️設定 から Worker の URL を入れる。</div>`;
    return;
  }
  const body = $('#e-body').value.trim();
  if (!body && !editPhotos.length) { alert('本文か写真を入れてから。'); return; }
  $('#ai-out').innerHTML = '<div class="aibox">✨ 整理しています…（10秒くらい）</div>';
  try {
    const res = await fetch(aiUrl.replace(/\/$/, '') + '/organize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: body,
        images: editPhotos.map((p) => p.dataUrl).slice(0, 4),
        organisms: ORGANISMS.map((o) => ({ id: o.id, jp: o.jp, name: o.name })),
        mechanisms: MECHANISMS.map((m) => ({ id: m.id, abbr: m.abbr })),
        classes: DRUG_CLASSES.map((c) => ({ id: c.id, name: c.name })),
      }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    showAI(d);
    petAct('ai');
    if (d.title && !$('#e-ttl').value) $('#e-ttl').value = d.title;
    if (d.kind) $('#e-kind').value = d.kind;
    if (d.tags?.length) $('#e-tags').value = d.tags.join(', ');
    if (d.orgIds?.length) linkSel.orgIds = [...new Set([...linkSel.orgIds, ...d.orgIds])];
    if (d.mechIds?.length) linkSel.mechIds = [...new Set([...linkSel.mechIds, ...d.mechIds])];
    if (d.classIds?.length) linkSel.classIds = [...new Set([...linkSel.classIds, ...d.classIds])];
    if (d.captions) editPhotos.forEach((p, i) => { if (d.captions[i]) p.caption = d.captions[i]; });
    drawLinks();
  } catch (e) {
    $('#ai-out').innerHTML = `<div class="aibox">うまくいかなかった（${esc(e.message)}）。AIサーバーのURLを確認する。</div>`;
  }
}

const checkPII = (t) => PII_PATTERNS.filter((p) => p.re.test(t)).map((p) => p.label);

async function saveNote() {
  const title = $('#e-ttl').value.trim();
  const body = $('#e-body').value.trim();
  if (!title && !body && !editPhotos.length) { alert('中身が空。'); return; }

  const found = checkPII(title + '\n' + body);
  if (found.length && !piiAck) {
    $('#pii-warn').innerHTML = `<div class="pii"><b>患者情報かもしれない記述がある。</b><br>
      ${found.map((f) => '・' + esc(f)).join('<br>')}<br><br>
      本当に患者と無関係なら、もう一度「保存する」を押せば保存する。少しでも患者に紐づくなら、消してから保存する。</div>`;
    piiAck = true;
    $('#pii-warn').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const photoIds = [], captions = {};
  for (const p of editPhotos) { await putPhoto(p.id, p.dataUrl); photoIds.push(p.id); if (p.caption) captions[p.id] = p.caption; }

  const rec = {
    id: editing ? editing.id : uid(),
    kind: $('#e-kind').value,
    title, body,
    ai: aiDraft || (editing ? editing.ai : null),
    tags: $('#e-tags').value.split(',').map((s) => s.trim()).filter(Boolean),
    orgIds: linkSel.orgIds, mechIds: linkSel.mechIds, classIds: linkSel.classIds,
    photos: photoIds, captions,
    createdAt: editing ? editing.createdAt : Date.now(),
    updatedAt: Date.now(),
  };
  const prev = notes.slice();   // 保存に失敗したら巻き戻すための退避
  const wasNew = !editing;
  if (editing) notes[notes.findIndex((n) => n.id === editing.id)] = rec; else notes.unshift(rec);

  /* 保存が成功して初めて、消えた写真を削除し、画面を進める。
   * 順番を守らないと「保存は失敗したのに古い写真だけ消えた」が起きる（静的レビュー#1）。 */
  if (!save(LS.notes, notes)) {
    notes = prev;   // localStorageは変わっていない。メモリも戻す
    return;         // save() 側が容量警告を出している。画面は進めない
  }
  if (editing?.photos) for (const old of editing.photos) if (!photoIds.includes(old)) delPhoto(old);
  aiDraft = null;
  if (wasNew) petAct('note');
  if (photoIds.length && wasNew) petAct('photo');
  location.hash = hrefOf('note', rec.id);
}

/* ---------- 設定 ---------- */
function renderSet() {
  $('#s-notes').textContent = notes.length;
  $('#s-photos').textContent = notes.reduce((a, n) => a + (n.photos || []).length, 0);
  $('#s-orgs').textContent = customOrgs.length;
  $('#s-verified').textContent = `${Object.keys(verified).length} / ${RULES.length}`;
  $('#s-ai').value = aiUrl;
  renderLockSettings();
}
function renderLockSettings() {
  const on = Lock.isOn();
  $('#lk-on').checked = on;
  $('#lk-bio-row').hidden = !on;
  $('#lk-lock-row').hidden = !on;
  $('#lk-change-row').hidden = !on;
  $('#lk-bio').checked = Lock.bioEnabled();
  $('#lk-lock').checked = Lock.lockEach();
  const label = $('#lk-bio-label');
  if (!Lock.bioAvailable()) { label.textContent = 'Face ID / 指紋（この端末では使えない）'; $('#lk-bio').disabled = true; }
  else { label.textContent = 'Face ID / 指紋でも開く'; $('#lk-bio').disabled = false; }
}
async function exportAll() {
  const photos = {};
  for (const n of notes) for (const p of n.photos || []) { const d = await getPhoto(p); if (d) photos[p] = d; }
  const blob = new Blob([JSON.stringify({ v: 2, notes, customOrgs, verified, favs, photos }, null, 2)], { type: 'application/json' });
  const a = el('a'); a.href = URL.createObjectURL(blob);
  const t = new Date();
  a.download = `菌譜_${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}${String(t.getDate()).padStart(2, '0')}.json`;
  a.click(); URL.revokeObjectURL(a.href);
}
async function importAll(f) {
  let d; try { d = JSON.parse(await f.text()); } catch { alert('読めないファイル。'); return; }
  if (!Array.isArray(d.notes)) { alert('菌譜の書き出しファイルではない。'); return; }
  if (!confirm(`ノート ${d.notes.length}件を読み込む。今あるノートは置き換わる。`)) return;

  /* 読み込むデータも、起動時と同じように型を均す（壊れた/古い形式でも落ちないように。#3） */
  const incoming = sanitizeNotes(d.notes);
  const newPhotoIds = new Set(incoming.flatMap((n) => n.photos || []));
  /* 置き換えで参照されなくなる古い写真は、IndexedDBから消す（孤児化を防ぐ。#5） */
  const oldPhotoIds = new Set(notes.flatMap((n) => n.photos || []));
  for (const [k, v] of Object.entries(d.photos || {})) if (newPhotoIds.has(k)) await putPhoto(k, v);
  for (const old of oldPhotoIds) if (!newPhotoIds.has(old)) delPhoto(old);

  notes = incoming;
  customOrgs = asList(d.customOrgs); verified = asObj(d.verified); favs = asStrList(d.favs);
  save(LS.notes, notes); save(LS.orgs, customOrgs); save(LS.verified, verified); save(LS.fav, favs);
  alert('読み込んだ。'); route();
}
function addOrg() {
  const jp = prompt('菌の名前（日本語）'); if (!jp) return;
  const name = prompt('学名（分かれば）') || '';
  const group = prompt('グループ（例：グラム陰性 その他）') || 'そのほか';
  const drugs = (prompt('感受性を見る薬剤（カンマ区切り）') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const id = 'c_' + uid();
  customOrgs.push({ id, jp, name, group, drugs, intrinsic: [], intrinsicCodes: [], expectedS: [], note: '' });
  save(LS.orgs, customOrgs);
  renderOrgs();
}

/* ==================== 画面ロック ====================
 * スマホ本体を人に触られてもノートを見られないための鍵。サーバー不要。
 * PINは生のまま保存せず、端末ごとの塩を足してSHA-256でハッシュ化して保存する。
 * Face ID / 指紋は WebAuthn の platform authenticator を「ローカルの生体ゲート」として使う
 * （サーバー照合はしない。生体認証が通れば解錠、という端末内だけの用途）。 */
const Lock = (() => {
  const enc = new TextEncoder();
  const buf2b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
  const b642buf = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function sha(pin, salt) {
    const h = await crypto.subtle.digest('SHA-256', enc.encode(salt + ':' + pin));
    return buf2b64(h);
  }
  const isOn = () => !!localStorage.getItem(LS.pin);
  const lockEach = () => localStorage.getItem(LS.lockEach) === '1';
  const bioEnabled = () => !!localStorage.getItem(LS.bio);

  async function setPin(pin) {
    const salt = buf2b64(crypto.getRandomValues(new Uint8Array(16)));
    localStorage.setItem(LS.pinSalt, salt);
    localStorage.setItem(LS.pin, await sha(pin, salt));
  }
  async function verify(pin) {
    const salt = localStorage.getItem(LS.pinSalt) || '';
    return isOn() && (await sha(pin, salt)) === localStorage.getItem(LS.pin);
  }
  function disable() {
    [LS.pin, LS.pinSalt, LS.bio, LS.lockEach].forEach((k) => localStorage.removeItem(k));
  }

  const bioAvailable = () => !!(window.PublicKeyCredential && navigator.credentials);
  async function enableBio() {
    if (!bioAvailable()) throw new Error('この端末では顔認証・指紋が使えない');
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: '菌譜', id: location.hostname },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'kinpu', displayName: '菌譜' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000,
      },
    });
    if (!cred) throw new Error('登録できなかった');
    localStorage.setItem(LS.bio, buf2b64(cred.rawId));
  }
  async function tryBio() {
    if (!bioEnabled() || !bioAvailable()) return false;
    try {
      const ok = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ type: 'public-key', id: b642buf(localStorage.getItem(LS.bio)) }],
          userVerification: 'required', timeout: 60000,
        },
      });
      return !!ok;
    } catch { return false; }
  }
  function disableBio() { localStorage.removeItem(LS.bio); }

  return { isOn, lockEach, bioEnabled, bioAvailable, setPin, verify, disable, enableBio, tryBio, disableBio,
    setLockEach: (v) => v ? localStorage.setItem(LS.lockEach, '1') : localStorage.removeItem(LS.lockEach) };
})();

/* ロック画面（テンキー）。用途：unlock=解錠 / set=新規設定 / change=変更 */
let lockMode = 'unlock', lockBuf = '', lockFirst = '', lockAfter = null, lockLen = 4;
function showLock(mode, after) {
  lockMode = mode; lockBuf = ''; lockFirst = ''; lockAfter = after || null;
  $('#lockgate').hidden = false;
  buildKeypad();
  drawLockDots();
  $('#lock-title').textContent = mode === 'unlock' ? '暗証番号を入れる'
    : mode === 'set' ? '新しい暗証番号を決める（4〜6桁）' : '今の暗証番号を入れる';
  $('#lock-msg').textContent = ''; $('#lock-msg').className = 'lockmsg';
  if (mode === 'unlock' && Lock.bioEnabled() && Lock.bioAvailable()) setTimeout(() => lockBio(), 300);
}
function hideLock() { $('#lockgate').hidden = true; }
function drawLockDots() {
  const box = $('#lock-dots'); box.innerHTML = '';
  const n = Math.max(lockLen, lockBuf.length);
  for (let i = 0; i < n; i++) {
    const d = el('div', 'd' + (i < lockBuf.length ? ' on' : ''));
    box.appendChild(d);
  }
}
function buildKeypad() {
  const kp = $('#keypad'); kp.innerHTML = '';
  const canBio = lockMode === 'unlock' && Lock.bioEnabled() && Lock.bioAvailable();
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', canBio ? 'face' : 'ok', '0', 'del'];
  keys.forEach((k) => {
    const b = el('button');
    if (k === 'del') { b.textContent = '⌫'; b.onclick = () => { lockBuf = lockBuf.slice(0, -1); drawLockDots(); }; }
    else if (k === 'face') { b.textContent = '😊'; b.className = 'face'; b.onclick = lockBio; }
    else if (k === 'ok') { b.textContent = '決定'; b.className = 'wide'; b.onclick = lockSubmit; }
    else { b.textContent = k; b.onclick = () => lockPush(k); }
    kp.appendChild(b);
  });
}
function lockPush(d) {
  if (lockBuf.length >= 6) return;
  lockBuf += d; drawLockDots();
  /* 解錠モードで、設定桁数に達したら自動照合 */
  if (lockMode === 'unlock' && lockBuf.length >= 4) autoTryUnlock();
}
let unlockTimer = null;
function autoTryUnlock() {
  clearTimeout(unlockTimer);
  unlockTimer = setTimeout(lockSubmit, 250);   // 続けて押す余地を残す
}
async function lockSubmit() {
  const pin = lockBuf;
  if (lockMode === 'unlock') {
    if (pin.length < 4) return;
    if (await Lock.verify(pin)) { hideLock(); return; }
    lockBuf = ''; failLock('番号が違います'); return;
  }
  if (lockMode === 'set' || lockMode === 'change') {
    if (lockMode === 'change' && !lockFirst) {
      /* まず現在の番号を確認 */
      if (!(await Lock.verify(pin))) { lockBuf = ''; failLock('今の番号が違います'); return; }
      lockMode = 'set'; lockBuf = ''; lockFirst = '__verified__';
      $('#lock-title').textContent = '新しい暗証番号を決める（4〜6桁）';
      drawLockDots(); return;
    }
    if (pin.length < 4) { failLock('4桁以上にしてください'); return; }
    if (!lockFirst || lockFirst === '__verified__') {
      lockFirst = pin; lockBuf = '';
      $('#lock-title').textContent = 'もう一度、同じ番号を入れる';
      $('#lock-msg').textContent = ''; drawLockDots(); return;
    }
    if (pin !== lockFirst) { lockBuf = ''; lockFirst = ''; failLock('一致しません。最初から'); $('#lock-title').textContent = '新しい暗証番号を決める（4〜6桁）'; return; }
    await Lock.setPin(pin);
    lockLen = pin.length;
    hideLock();
    if (lockAfter) lockAfter();
    return;
  }
}
function failLock(msg) {
  const dots = $('#lock-dots'); dots.classList.add('err');
  setTimeout(() => dots.classList.remove('err'), 300);
  $('#lock-msg').textContent = msg; $('#lock-msg').className = 'lockmsg bad';
  drawLockDots();
}
async function lockBio() {
  $('#lock-msg').textContent = '顔認証・指紋を確認中…'; $('#lock-msg').className = 'lockmsg';
  const ok = await Lock.tryBio();
  if (ok) hideLock();
  else { $('#lock-msg').textContent = '番号でも開けます'; $('#lock-msg').className = 'lockmsg'; }
}

/* ---------- 相棒きんぺい ---------- */
let petTalkIdx = 0;
function renderPet() {
  const s = Pet.state();
  const stage = Pet.stageOf(s.xp);
  const nx = Pet.next(s.xp);
  $('#pet-fig').innerHTML = petSVG(stage.form, { size: 84, species: Pet.curSpecies(), mood: Pet.mood() });
  const named = Pet.hasName();
  $('#pet-name').innerHTML = `${esc(Pet.getName())} <span class="pet-edit">✏️</span> <span class="lv">Lv.${stage.lv} ${esc(stage.name)}</span>`;
  /* まだ名前をつけていない子には、つけてあげてね、と誘導する */
  $('#pet-word').textContent = named ? stage.word : 'タップして なまえをつけてね';
  $('#pet-word').style.color = named ? '' : 'var(--lav)';
  const pct = nx ? Math.min(100, Math.round(((s.xp - stage.need) / (nx.need - stage.need)) * 100)) : 100;
  $('#pet-bar').style.width = pct + '%';
  const zoo = Object.keys(Pet.clearedList()).length;
  $('#pet-meta').innerHTML = (nx
    ? `<span>つぎまで あと ${nx.need - s.xp}</span>`
    : `<span>さいだい！べつの子も育てられるよ</span>`)
    + `<span class="fire">🔥 ${s.streak}日</span>`
    + `<span>🎖️ ${zoo + 1}匹目</span>`;
}
/* ずかん：なかま（キャラ）と、集めたしょう */
function renderPetZukan() {
  const unlocked = Pet.unlocked();
  const cleared = Pet.clearedList();
  const cur = Pet.curSpecies();
  const maxed = Pet.isMaxed();

  const sp = $('#pet-species'); sp.innerHTML = '';
  Pet.SPECIES.forEach((s) => {
    const isUnlocked = unlocked.includes(s.id);
    const isCleared = !!cleared[s.id];
    const isCur = s.id === cur;
    const c = el('div', 'card flat'); c.style.cssText = 'display:flex;align-items:center;gap:12px' + (isCur ? ';border-color:var(--mint)' : '');
    if (isUnlocked) {
      c.innerHTML = `<div style="flex:none">${petSVG(isCur ? Pet.stageOf(Pet.state().xp).form : 'adult', { size: 56, species: s.id })}</div>
        <div style="flex:1"><b>${s.emoji} ${esc(s.label)}</b>
          <div style="font-size:12px;color:var(--tx2)">性格：${esc(traitOf(s.id))}${isCleared ? ' ・ 🎓はかせ達成' : ''}${isCur ? ' ・ いま いっしょ' : ''}</div></div>`;
      if (!isCur) {
        const b = el('button', 'chip mint'); b.textContent = 'この子にする';
        b.onclick = () => {
          const msg = maxed
            ? `いまの子を「はかせ」として ずかんに のこして、${s.label}を たまごから 育てる？`
            : `いまの子（Lv.${Pet.stageOf(Pet.state().xp).lv}）は はかせに なる前だよ。それでも ${s.label}に かえる？（いまの子の育ちは リセットされる）`;
          if (!confirm(msg)) return;
          if (Pet.switchSpecies(s.id)) { renderPetZukan(); petToast(`${s.label}、よろしくね`); }
        };
        c.appendChild(b);
      }
    } else {
      c.style.opacity = '0.55';
      c.innerHTML = `<div style="flex:none;font-size:40px;filter:grayscale(1)">❓</div>
        <div style="flex:1"><b>？？？</b>
          <div style="font-size:12px;color:var(--tx2)">いまの子を「はかせ」まで育てると あらわれる</div></div>`;
    }
    sp.appendChild(c);
  });

  /* しょう（バッジ） */
  const got = Pet.badges();
  $('#pet-badge-n').textContent = `${Object.keys(got).length} / ${Pet.BADGES.length}`;
  const bb = $('#pet-badges'); bb.innerHTML = '';
  const grid = el('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:8px';
  Pet.BADGES.forEach((bd) => {
    const have = !!got[bd.id];
    const d = el('div', 'card flat');
    d.style.cssText = 'padding:12px' + (have ? '' : ';opacity:.5');
    d.innerHTML = `<div style="font-size:24px">${have ? bd.emoji : '🔒'}</div>
      <b style="font-size:13px">${esc(bd.name)}</b>
      <div style="font-size:11.5px;color:var(--tx2)">${esc(bd.desc)}</div>`;
    grid.appendChild(d);
  });
  bb.appendChild(grid);
}
function traitOf(id) {
  return { cat: 'マイペース', rabbit: 'げんき', bear: 'のんびり', penguin: 'しっかりや' }[id] || '';
}

let petToastTimer = null;
function petToast(msg, sub, opts = {}) {
  const t = $('#pet-toast');
  $('#pet-toast-fig').innerHTML = petSVG(Pet.stageOf(Pet.state().xp).form, { size: 40 });
  $('#pet-toast-msg').innerHTML = `${esc(msg)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
  t.hidden = false;
  t.classList.toggle('levelup', !!opts.levelup);
  $('#pet-toast-fig').classList.toggle('pet-celebrate', !!opts.levelup);
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(petToastTimer);
  petToastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.hidden = true; }, 350);
  }, opts.levelup ? 3200 : 1800);
}
/* 行動を記録し、育ったら祝う。バッジ（しょう）も確認する。 */
function petAct(kind) {
  if (typeof Pet === 'undefined') return;
  if (kind === 'view_org' && curOrg) Pet.seeOrg(curOrg.id);   // 図鑑カウント（重複なし）
  const r = Pet.act(kind);

  /* しょうの達成チェック（経験値が入らなくても、条件を満たしたら出す） */
  const stats = {
    notes: notes.length,
    verified: Object.keys(verified).length,
    flowUsed: kind === 'flow' || undefined,
    aiUsed: kind === 'ai' || undefined,
  };
  const newBadges = Pet.checkBadges(stats);

  if (r && r.gained) {
    if (r.leveledTo) {
      Pet.markSeen(r.leveledTo.lv);
      petToast(`${Pet.getName()}が そだった！`, `Lv.${r.leveledTo.lv} ${r.leveledTo.name}・${r.leveledTo.word}`, { levelup: true });
    } else {
      petToast(`${r.msg}（+${r.gained}）`);
    }
  }
  /* バッジは少し遅らせて、行動トーストの後に出す */
  newBadges.forEach((bd, i) => setTimeout(() => petToast(`しょう「${bd.name}」ゲット！`, bd.desc, { levelup: true }), 1200 * (i + 1)));

  if ($('#sc-home').classList.contains('on')) renderPet();
}
/* キャラをなでる：跳ねて、性格に合わせた一言をしゃべる */
function petPat() {
  const fig = $('#pet-fig');
  fig.classList.remove('pet-celebrate'); void fig.offsetWidth; fig.classList.add('pet-celebrate');
  petTalkIdx++;
  const m = Pet.mood();
  const line = Pet.talk(petTalkIdx, m === 'lonely' ? 'lonely' : null);
  petToast(line);
}

/* ---------- テーマ ---------- */
function applyTheme() {
  const t = load(LS.theme, 'light');
  document.documentElement.dataset.theme = t;
  $('#btn-theme').textContent = t === 'dark' ? '☀️' : '🌙';
}

/* ---------- ルーティング ---------- */
const SCREENS = { home: 'sc-home', orgs: 'sc-orgs', org: 'sc-org', flow: 'sc-flow', drugs: 'sc-drugs',
  mechs: 'sc-mechs', mech: 'sc-mech', notes: 'sc-notes', note: 'sc-view', edit: 'sc-edit',
  set: 'sc-set', help: 'sc-help', report: 'sc-report', daily: 'sc-daily', pet: 'sc-pet' };

function route() {
  const h = location.hash || '#/home';
  const parts = h.slice(2).split('/');
  const part = parts[0] || 'home';
  const arg = parts.slice(1).join('/');
  const sc = SCREENS[part] || 'sc-home';
  /* 電話報告テンプレを離れたら、入力と組み上げた下書きの両方を消す（患者情報を残さない約束）。
   * 入力欄(.rp)だけでなく #rp-out にも患者情報が入っているので、そこも消す。 */
  if (part !== 'report') {
    document.querySelectorAll('.rp').forEach((inp) => { inp.value = ''; });
    const ro = $('#rp-out'); if (ro) ro.textContent = '';
  }
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === sc));
  window.scrollTo(0, 0);

  $('#btn-back').hidden = ['home', 'orgs', 'drugs', 'mechs', 'notes'].includes(part);
  $('#fab').hidden = !['home', 'notes'].includes(part);
  const tabOf = { home: 'home', help: 'home', set: 'home', report: 'home', daily: 'home', pet: 'home',
    orgs: 'orgs', org: 'orgs', flow: 'flow',
    drugs: 'drugs', mechs: 'mechs', mech: 'mechs', notes: 'notes', note: 'notes', edit: 'notes' };
  document.querySelectorAll('nav.tab button').forEach((b) => b.classList.toggle('on', b.dataset.go === tabOf[part]));

  if (part === 'home') renderHome();
  else if (part === 'orgs') renderOrgs();
  else if (part === 'org') renderOrg(arg);
  else if (part === 'flow') renderFlow();
  else if (part === 'drugs') renderDrugs();
  else if (part === 'mechs') renderMechs();
  else if (part === 'mech') renderMech(arg);
  else if (part === 'notes') renderNotes();
  else if (part === 'note') renderView(arg);
  else if (part === 'edit') openEdit(arg);
  else if (part === 'set') renderSet();
  else if (part === 'report') renderReport();
  else if (part === 'daily') { $('#dl-out').innerHTML = ''; }
  else if (part === 'pet') renderPetZukan();
}

/* ---------- 配線 ---------- */
window.addEventListener('hashchange', route);
$('#btn-back').onclick = () => history.back();
$('#btn-set').onclick = () => (location.hash = '#/set');
$('#btn-search').onclick = openPal;
$('#home-search').onclick = openPal;
/* キャラをなでる → しゃべる。名前をタップ → 改名。ずかんボタン → コレクション。 */
$('#pet-fig').onclick = petPat;
$('#pet-name').onclick = () => {
  const cur = Pet.hasName() ? Pet.getName() : '';
  const n = prompt('この子の名前をつけてあげて（12文字まで）', cur);
  if (n === null) return;
  Pet.setName(n);
  renderPet();
  if (Pet.hasName()) petToast(`${Pet.getName()}、よろしくね`);
};
$('#pet-zukan').onclick = () => (location.hash = '#/pet');
$('#go-help').onclick = () => (location.hash = '#/help');
$('#go-report').onclick = () => (location.hash = '#/report');
$('#go-daily').onclick = () => (location.hash = '#/daily');
$('#rp-copy').onclick = () => { navigator.clipboard?.writeText($('#rp-out').textContent).then(() => { $('#rp-copy').textContent = '✓ コピーした'; setTimeout(() => $('#rp-copy').textContent = '📋 コピー', 1500); }); };
$('#rp-clear').onclick = clearReport;
$('#dl-make').onclick = makeDaily;
$('#btn-theme').onclick = () => {
  save(LS.theme, load(LS.theme, 'light') === 'dark' ? 'light' : 'dark');
  applyTheme();
};
document.querySelectorAll('nav.tab button').forEach((b) => { b.onclick = () => (location.hash = '#/' + b.dataset.go); });
$('#fab').onclick = () => (location.hash = '#/edit/new');

$('#org-q').addEventListener('input', renderOrgs);
$('#drug-q').addEventListener('input', renderDrugs);
$('#note-q').addEventListener('input', renderNotes);
$('#btn-add-org').onclick = addOrg;

$('#btn-photo').onclick = () => $('#e-photo').click();
$('#e-photo').onchange = async (e) => {
  for (const f of e.target.files) {
    try { editPhotos.push({ id: uid(), dataUrl: await shrink(f), caption: '' }); }
    catch { alert('その画像は読めなかった。'); }
  }
  e.target.value = ''; drawThumbs();
};
$('#btn-ai').onclick = runAI;
$('#btn-save').onclick = saveNote;
$('#btn-del').onclick = () => {
  if (!editing || !confirm('このノートを消す？戻せない。')) return;
  (editing.photos || []).forEach(delPhoto);
  notes = notes.filter((n) => n.id !== editing.id);
  save(LS.notes, notes);
  location.hash = '#/notes';
};
/* 画面ロックの設定 */
$('#lk-on').onchange = (e) => {
  if (e.target.checked) {
    showLock('set', () => { $('#lk-msg').innerHTML = '<div class="aibox">ロックを設定した。</div>'; renderLockSettings(); });
  } else {
    if (!confirm('画面ロックを解除する？')) { e.target.checked = true; return; }
    Lock.disable(); renderLockSettings();
    $('#lk-msg').innerHTML = '<div class="aibox">ロックを解除した。</div>';
  }
};
$('#lk-bio').onchange = async (e) => {
  if (e.target.checked) {
    try { await Lock.enableBio(); $('#lk-msg').innerHTML = '<div class="aibox">Face ID / 指紋を登録した。</div>'; }
    catch (err) { e.target.checked = false; $('#lk-msg').innerHTML = `<div class="aibox">登録できなかった（${esc(err.message)}）</div>`; }
  } else { Lock.disableBio(); $('#lk-msg').innerHTML = '<div class="aibox">Face ID / 指紋を解除した。</div>'; }
  renderLockSettings();
};
$('#lk-lock').onchange = (e) => Lock.setLockEach(e.target.checked);
$('#lk-change').onclick = () => showLock('change', () => { $('#lk-msg').innerHTML = '<div class="aibox">暗証番号を変えた。</div>'; });

$('#btn-export').onclick = exportAll;
$('#btn-import').onclick = () => $('#imp').click();
$('#imp').onchange = (e) => { if (e.target.files[0]) importAll(e.target.files[0]); e.target.value = ''; };
$('#btn-ai-save').onclick = () => { aiUrl = $('#s-ai').value.trim(); save(LS.ai, aiUrl); $('#ai-test').innerHTML = '<div class="aibox">保存した。</div>'; };
$('#btn-ai-test').onclick = async () => {
  const u = $('#s-ai').value.trim();
  if (!u) { $('#ai-test').innerHTML = '<div class="aibox">URLが空。</div>'; return; }
  $('#ai-test').innerHTML = '<div class="aibox">つないでいます…</div>';
  try {
    const r = await fetch(u.replace(/\/$/, '') + '/health');
    $('#ai-test').innerHTML = `<div class="aibox">${r.ok ? '✅ つながった。' : '❌ HTTP ' + r.status}</div>`;
  } catch (e) { $('#ai-test').innerHTML = `<div class="aibox">❌ つながらない（${esc(e.message)}）</div>`; }
};
$('#btn-wipe').onclick = () => {
  if (!confirm('このスマホのノートを全部消す。書き出していないと戻せない。本当に？')) return;
  if (!confirm('もう一度確認する。全部消していい？')) return;
  [LS.notes, LS.orgs, LS.sir, LS.recent, LS.fav].forEach((k) => localStorage.removeItem(k));
  indexedDB.deleteDatabase('kinpu');
  notes = []; customOrgs = []; sirState = {}; recent = []; favs = [];
  alert('消した。'); location.hash = '#/home'; route();
};

/* Ctrl+K */
$('#pal-q').addEventListener('input', () => { palSel = 0; renderPal(); });
$('#pal').addEventListener('click', (e) => { if (e.target.id === 'pal') closePal(); });
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPal(); return; }
  if ($('#pal').hidden) return;
  const items = [...document.querySelectorAll('#pal-res .ri')];
  if (e.key === 'Escape') closePal();
  else if (e.key === 'ArrowDown') { e.preventDefault(); palSel = Math.min(palSel + 1, items.length - 1); renderPal(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); palSel = Math.max(palSel - 1, 0); renderPal(); }
  else if (e.key === 'Enter' && items[palSel]) items[palSel].click();
});

/* 保存されている値を読み込む。何が入っていても、ここで型を均してから使う。
 * （KINDS・normAI を使うので、それらが定義され終わったこの位置で行う） */
function boot() {
  notes = sanitizeNotes(load(LS.notes, []));
  customOrgs = asList(load(LS.orgs, []))
    .filter((o) => o && o.id && o.jp)
    .map((o) => ({
      id: asStr(o.id), jp: asStr(o.jp), name: asStr(o.name),
      group: asStr(o.group) || 'そのほか',
      drugs: asStrList(o.drugs), intrinsic: asStrList(o.intrinsic),
      intrinsicCodes: asStrList(o.intrinsicCodes),
      expectedS: asList(o.expectedS).filter((e) => e && e.d),
      note: asStr(o.note),
    }));
  verified = asObj(load(LS.verified, {}));
  sirState = asObj(load(LS.sir, {}));
  for (const k of Object.keys(sirState)) sirState[k] = asObj(sirState[k]);
  recent = asList(load(LS.recent, [])).filter((r) => r && r.type && r.id);
  favs = asStrList(load(LS.fav, []));
  aiUrl = asStr(aiUrl) || 'https://kinpu-ai.aulait11-17.workers.dev';
}

boot();
applyTheme();
route();

/* 起動演出を少し見せてから消す（初回の1回だけ・戻る操作では出さない） */
(() => {
  const sp = $('#splash'); if (!sp) return;
  setTimeout(() => { sp.classList.add('hide'); setTimeout(() => sp.remove(), 600); }, 1500);
})();

/* ロックが有効なら、起動時に解錠を求める（画面はz-indexで覆う） */
if (Lock.isOn()) showLock('unlock');
/* 「閉じるたびロック」がONなら、他アプリへ切り替えて戻ったとき再ロック */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && Lock.isOn() && Lock.lockEach()) showLock('unlock');
});

/* 検査室は電波が入らない。オフラインでも開けるようにする。 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
