/* 菌譜 — 細菌検査Wiki 本体
 * データは端末内だけ（localStorage + IndexedDB）。AI整理を使うときだけ本文がAIサーバーを通る。
 */
'use strict';

const LS = {
  notes: 'kinpu.notes', orgs: 'kinpu.customOrgs', verified: 'kinpu.verified',
  sir: 'kinpu.sir', recent: 'kinpu.recent', fav: 'kinpu.fav',
  theme: 'kinpu.theme', ai: 'kinpu.aiUrl',
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
  curOrg = o; touch('org', id);
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
      bb.textContent = v; bb.style.cssText += 'width:32px;justify-content:center;font-family:var(--fnt2)';
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
  cb.onchange = () => { if (cb.checked) verified[r.id] = true; else delete verified[r.id]; save(LS.verified, verified); renderOrg(curOrg.id); };
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
async function renderView(id) {
  const n = notes.find((x) => x.id === id); if (!n) { location.hash = '#/notes'; return; }
  editing = n; touch('note', id);
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
    const du = await getPhoto(pid); if (!du) continue;
    const im = el('img', 'shot'); im.src = du; b.appendChild(im);
    const cap = (n.captions || {})[pid];
    if (cap) {
      const cc = el('div', 'blk'); cc.style.marginTop = '6px';
      cc.innerHTML = `<h3>👀 この写真</h3><p style="font-size:13.5px">${esc(cap)}</p>`;
      b.appendChild(cc);
    }
  }

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
    const im = el('img'); im.src = p.dataUrl; im.title = 'タップで削除';
    im.onclick = () => { if (confirm('この写真を消す？')) { editPhotos.splice(i, 1); drawThumbs(); } };
    b.appendChild(im);
  });
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
  if (editing?.photos) for (const old of editing.photos) if (!photoIds.includes(old)) delPhoto(old);

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
  if (editing) notes[notes.findIndex((n) => n.id === editing.id)] = rec; else notes.unshift(rec);
  save(LS.notes, notes);
  aiDraft = null;
  location.hash = hrefOf('note', rec.id);
}

/* ---------- 設定 ---------- */
function renderSet() {
  $('#s-notes').textContent = notes.length;
  $('#s-photos').textContent = notes.reduce((a, n) => a + (n.photos || []).length, 0);
  $('#s-orgs').textContent = customOrgs.length;
  $('#s-verified').textContent = `${Object.keys(verified).length} / ${RULES.length}`;
  $('#s-ai').value = aiUrl;
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
  if (!d.notes) { alert('菌譜の書き出しファイルではない。'); return; }
  if (!confirm(`ノート ${d.notes.length}件を読み込む。今あるノートは置き換わる。`)) return;
  for (const [k, v] of Object.entries(d.photos || {})) await putPhoto(k, v);
  notes = d.notes; customOrgs = d.customOrgs || []; verified = d.verified || {}; favs = d.favs || [];
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

/* ---------- テーマ ---------- */
function applyTheme() {
  const t = load(LS.theme, 'light');
  document.documentElement.dataset.theme = t;
  $('#btn-theme').textContent = t === 'dark' ? '☀️' : '🌙';
}

/* ---------- ルーティング ---------- */
const SCREENS = { home: 'sc-home', orgs: 'sc-orgs', org: 'sc-org', drugs: 'sc-drugs',
  mechs: 'sc-mechs', mech: 'sc-mech', notes: 'sc-notes', note: 'sc-view', edit: 'sc-edit',
  set: 'sc-set', help: 'sc-help' };

function route() {
  const h = location.hash || '#/home';
  const parts = h.slice(2).split('/');
  const part = parts[0] || 'home';
  const arg = parts.slice(1).join('/');
  const sc = SCREENS[part] || 'sc-home';
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === sc));
  window.scrollTo(0, 0);

  $('#btn-back').hidden = ['home', 'orgs', 'drugs', 'mechs', 'notes'].includes(part);
  $('#fab').hidden = !['home', 'notes'].includes(part);
  const tabOf = { home: 'home', help: 'home', set: 'home', orgs: 'orgs', org: 'orgs',
    drugs: 'drugs', mechs: 'mechs', mech: 'mechs', notes: 'notes', note: 'notes', edit: 'notes' };
  document.querySelectorAll('nav.tab button').forEach((b) => b.classList.toggle('on', b.dataset.go === tabOf[part]));

  if (part === 'home') renderHome();
  else if (part === 'orgs') renderOrgs();
  else if (part === 'org') renderOrg(arg);
  else if (part === 'drugs') renderDrugs();
  else if (part === 'mechs') renderMechs();
  else if (part === 'mech') renderMech(arg);
  else if (part === 'notes') renderNotes();
  else if (part === 'note') renderView(arg);
  else if (part === 'edit') openEdit(arg);
  else if (part === 'set') renderSet();
}

/* ---------- 配線 ---------- */
window.addEventListener('hashchange', route);
$('#btn-back').onclick = () => history.back();
$('#btn-set').onclick = () => (location.hash = '#/set');
$('#btn-search').onclick = openPal;
$('#home-search').onclick = openPal;
$('#go-help').onclick = () => (location.hash = '#/help');
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

/* 検査室は電波が入らない。オフラインでも開けるようにする。 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
