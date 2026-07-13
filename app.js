/* 菌譜 — アプリ本体
 * データはこの端末の中だけに置く（localStorage ＋ IndexedDB）。外へは一切送らない。
 */
'use strict';

const LS = {
  notes: 'kinpu.notes',
  orgs: 'kinpu.customOrgs',
  verified: 'kinpu.verified',
  sir: 'kinpu.sir',
};

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const $ = (s) => document.querySelector(s);
const el = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let notes = load(LS.notes, []);
let customOrgs = load(LS.orgs, []);
let verified = load(LS.verified, {});
let sirState = load(LS.sir, {});   // { orgId: { drug: 'S'|'I'|'R' } }

const allOrgs = () => ORGANISMS.concat(customOrgs);
const orgById = (id) => allOrgs().find((o) => o.id === id);

/* ---------- 写真は IndexedDB（localStorageの5MB上限にすぐ当たるため） ---------- */
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open('kinpu', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function putPhoto(id, dataUrl) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction('photos', 'readwrite');
    tx.objectStore('photos').put(dataUrl, id);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
async function getPhoto(id) {
  const d = await db();
  return new Promise((res) => {
    const rq = d.transaction('photos', 'readonly').objectStore('photos').get(id);
    rq.onsuccess = () => res(rq.result || null);
    rq.onerror = () => res(null);
  });
}
async function delPhoto(id) {
  const d = await db();
  const tx = d.transaction('photos', 'readwrite');
  tx.objectStore('photos').delete(id);
}

/* スマホの写真はそのままだと数MB。長辺1600pxのJPEGへ落としてから保存する。 */
function shrink(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1600;
        const sc = Math.min(1, max / Math.max(img.width, img.height));
        const cv = el('canvas');
        cv.width = Math.round(img.width * sc);
        cv.height = Math.round(img.height * sc);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        res(cv.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = rej;
      img.src = fr.result;
    };
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

/* ---------- ルール判定 ---------- */
function matchRules(orgId, sir) {
  const isR = (d) => sir[d] === 'R';
  const isS = (d) => sir[d] === 'S';
  return RULES.filter((r) => {
    if (!r.organisms.includes(orgId)) return false;
    const w = r.when;
    if (w.allR && !w.allR.every(isR)) return false;
    if (w.anyR && !w.anyR.some(isR)) return false;
    if (w.S && !w.S.every(isS)) return false;
    return true;
  });
}

/* 自然耐性の薬が「感性」と出ていたら、それ自体が異常のサイン */
function intrinsicConflicts(org, sir) {
  if (!org.intrinsic || !org.intrinsic.length) return [];
  const out = [];
  for (const drug of Object.keys(sir)) {
    if (sir[drug] !== 'S') continue;
    for (const intr of org.intrinsic) {
      const key = drug.split('（')[0].split('/')[0].trim();
      if (key && intr.includes(key)) out.push({ drug, intr });
    }
  }
  return out;
}

/* ---------- 検索（日本語は部分一致で十分。形態素解析は要らない） ---------- */
const norm = (s) => String(s || '').toLowerCase().normalize('NFKC');
function hitNote(n, q) {
  if (!q) return true;
  const hay = norm([n.title, n.body, (n.tags || []).join(' '), (orgById(n.orgId) || {}).jp, (orgById(n.orgId) || {}).name].join(' '));
  return norm(q).split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
}
function mark(text, q) {
  const out = esc(text);
  if (!q) return out;
  const terms = norm(q).split(/\s+/).filter(Boolean);
  let html = out;
  for (const t of terms) {
    const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    html = html.replace(re, (m) => `<mark>${m}</mark>`);
  }
  return html;
}

/* ================= 画面 ================= */

function renderOrgList() {
  const q = norm($('#org-q').value);
  const box = $('#org-list');
  box.innerHTML = '';
  const groups = {};
  for (const o of allOrgs()) {
    const hay = norm(`${o.jp} ${o.name} ${o.group}`);
    if (q && !hay.includes(q)) continue;
    (groups[o.group] = groups[o.group] || []).push(o);
  }
  const keys = Object.keys(groups);
  if (!keys.length) { box.innerHTML = '<p class="empty">見つからない。「＋ 菌を追加する」で自分で足せる。</p>'; return; }
  for (const g of keys) {
    const h = el('div', 'grp'); h.textContent = g; box.appendChild(h);
    for (const o of groups[g]) {
      const b = el('button', 'org');
      const cnt = notes.filter((n) => n.orgId === o.id).length;
      const nR = RULES.filter((r) => r.organisms.includes(o.id)).length;
      const bits = [];
      if (cnt) bits.push(`ノート <b>${cnt}</b>`);
      if (nR) bits.push(`確認試験 <b>${nR}</b>`);
      if (o.intrinsic && o.intrinsic.length) bits.push(`自然耐性 <b>${o.intrinsic.length}</b>`);
      b.innerHTML = `<span class="jp">${esc(o.jp)}</span><span class="sci">${esc(o.name)}</span>
        <div class="meta">${bits.join('　/　') || '未整理'}</div>`;
      b.onclick = () => (location.hash = `#/org/${o.id}`);
      box.appendChild(b);
    }
  }
}

let curOrg = null;

function renderOrg(id) {
  const o = orgById(id);
  if (!o) { location.hash = '#/orgs'; return; }
  curOrg = o;
  $('#od-jp').textContent = o.jp;
  $('#od-sci').textContent = o.name;
  const nt = $('#od-note');
  nt.textContent = o.note || '';
  nt.hidden = !o.note;

  const sir = sirState[o.id] || {};
  const dl = $('#drug-list');
  dl.innerHTML = '';
  const drugs = o.drugs || [];
  if (!drugs.length) {
    dl.innerHTML = '<p class="empty">この菌には薬剤が登録されていない。設定から菌を編集して薬剤を足す。</p>';
  }
  for (const d of drugs) {
    const row = el('div', 'drug');
    const nm = el('span', 'nm'); nm.textContent = d;
    const sw = el('span', 'sir');
    for (const v of ['S', 'I', 'R']) {
      const b = el('button');
      b.dataset.v = v; b.textContent = v;
      if (sir[d] === v) b.classList.add('on');
      b.onclick = () => {
        const s = sirState[o.id] = sirState[o.id] || {};
        if (s[d] === v) delete s[d]; else s[d] = v;
        save(LS.sir, sirState);
        renderOrg(o.id);
      };
      sw.appendChild(b);
    }
    row.appendChild(nm); row.appendChild(sw);
    dl.appendChild(row);
  }

  /* 自然耐性なのに感性、の警告 */
  const conf = intrinsicConflicts(o, sir);
  const iw = $('#intrinsic-warn');
  if (conf.length) {
    iw.innerHTML = `<div class="warn-intrinsic">${conf.map((c) =>
      `<b>${esc(c.drug)}</b> は ${esc(o.jp)} の自然耐性（${esc(c.intr)}）。感性と出るのはおかしい。菌種同定と測定をまず疑う。`).join('<br>')}</div>`;
  } else iw.innerHTML = '';

  /* 判定 */
  const hits = matchRules(o.id, sir);
  const hb = $('#hits');
  hb.innerHTML = '';
  if (!Object.keys(sir).length) {
    hb.innerHTML = '<p class="empty">薬剤の S / I / R を押すと、追加で必要な検査が出る。</p>';
  } else if (!hits.length) {
    hb.innerHTML = '<p class="empty">今の組み合わせに該当する確認試験のルールは無い。だからといって不要とは限らない。施設のSOPで確認する。</p>';
  }
  for (const r of hits) hb.appendChild(hitCard(r));
}

function hitCard(r) {
  const c = el('div', 'hit' + (r.urgency === 'urgent' ? ' urgent' : ''));
  const isV = !!verified[r.id];
  let h = `<div class="ttl">${esc(r.title)}</div>
    <span class="${isV ? 'badge-v' : 'badge-unv'}">${isV ? '施設SOPで確認済み' : '未確認 — 鵜呑みにしない'}</span>`;
  if (r.why) h += `<p class="why">${esc(r.why)}</p>`;
  if (r.tests && r.tests.length) h += `<h4>追加でやる検査</h4><ul>${r.tests.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  if (r.report && r.report.length) h += `<h4>報告のしかた</h4><ul>${r.report.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  if (r.notify) h += `<div class="notify">${esc(r.notify)}</div>`;
  h += `<div class="src">根拠：${esc(r.source)}</div>`;
  c.innerHTML = h;

  const lab = el('label', 'vchk');
  const cb = el('input'); cb.type = 'checkbox'; cb.checked = isV;
  cb.onchange = () => {
    if (cb.checked) verified[r.id] = true; else delete verified[r.id];
    save(LS.verified, verified);
    renderOrg(curOrg.id);
  };
  lab.appendChild(cb);
  lab.appendChild(document.createTextNode('CLSI M100 と自施設のSOPで確認した'));
  c.querySelector('.src').appendChild(lab);
  return c;
}

function renderIntr() {
  const o = curOrg;
  const box = $('#intr-list');
  box.innerHTML = '';
  const list = o.intrinsic || [];
  if (!list.length) { box.innerHTML = '<p class="empty">この菌に登録された自然耐性は無い。</p>'; return; }
  for (const i of list) {
    const d = el('div', 'intr'); d.textContent = i; box.appendChild(d);
  }
}

function renderOrgNotes() {
  const box = $('#org-notes');
  box.innerHTML = '';
  const list = notes.filter((n) => n.orgId === curOrg.id).sort((a, b) => b.updatedAt - a.updatedAt);
  if (!list.length) {
    box.innerHTML = '<p class="empty">この菌のノートはまだ無い。右下の＋で書く。</p>';
  }
  for (const n of list) box.appendChild(noteRow(n, ''));
}

function noteRow(n, q) {
  const d = el('div', 'note');
  const o = orgById(n.orgId);
  d.innerHTML = `<div class="ttl">${mark(n.title || '(無題)', q)}</div>
    <div class="bd">${mark((n.body || '').slice(0, 120), q)}</div>
    <div class="ft">${(n.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}
      ${o ? esc(o.jp) + '　' : ''}${new Date(n.updatedAt).toLocaleDateString('ja-JP')}
      ${n.photos && n.photos.length ? '　写真' + n.photos.length : ''}</div>`;
  d.onclick = () => (location.hash = `#/note/${n.id}`);
  return d;
}

function renderNotes() {
  const q = $('#note-q').value.trim();
  const f = $('#note-filter').value;
  const box = $('#note-list');
  box.innerHTML = '';
  const list = notes
    .filter((n) => (!f || n.orgId === f) && hitNote(n, q))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  if (!list.length) {
    box.innerHTML = notes.length
      ? '<p class="empty">見つからない。</p>'
      : '<p class="empty">まだノートが無い。菌を選んで＋から書く。</p>';
  }
  for (const n of list) box.appendChild(noteRow(n, q));
}

function fillOrgSelect(sel, withAll) {
  sel.innerHTML = withAll ? '<option value="">すべての菌</option>' : '';
  for (const o of allOrgs()) {
    const op = el('option'); op.value = o.id; op.textContent = `${o.jp}（${o.name}）`;
    sel.appendChild(op);
  }
  if (!withAll) {
    const op = el('option'); op.value = 'other'; op.textContent = '菌に紐づかない（培地・染色・機器 など）';
    sel.appendChild(op);
  }
}

/* ---------- 編集 ---------- */
let editing = null;
let editPhotos = [];   // {id, dataUrl}
let piiAck = false;

async function openEdit(id) {
  piiAck = false;
  $('#pii-warn').innerHTML = '';
  editing = id ? notes.find((n) => n.id === id) : null;
  fillOrgSelect($('#e-org'), false);
  $('#edit-title').textContent = editing ? 'ノートを編集' : '新しいノート';
  $('#e-org').value = editing ? editing.orgId : (curOrg ? curOrg.id : 'other');
  $('#e-ttl').value = editing ? editing.title : '';
  $('#e-body').value = editing ? editing.body : '';
  $('#e-tags').value = editing ? (editing.tags || []).join(', ') : '';
  $('#btn-del').hidden = !editing;
  editPhotos = [];
  if (editing && editing.photos) {
    for (const pid of editing.photos) {
      const du = await getPhoto(pid);
      if (du) editPhotos.push({ id: pid, dataUrl: du });
    }
  }
  drawThumbs();
}

function drawThumbs() {
  const box = $('#e-thumbs');
  box.innerHTML = '';
  editPhotos.forEach((p, i) => {
    const im = el('img'); im.src = p.dataUrl;
    im.title = 'タップで削除';
    im.onclick = () => {
      if (!confirm('この写真を消す？')) return;
      editPhotos.splice(i, 1);
      drawThumbs();
    };
    box.appendChild(im);
  });
}

function checkPII(text) {
  return PII_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.label);
}

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

  const photoIds = [];
  for (const p of editPhotos) {
    await putPhoto(p.id, p.dataUrl);
    photoIds.push(p.id);
  }
  if (editing && editing.photos) {
    for (const old of editing.photos) if (!photoIds.includes(old)) delPhoto(old);
  }

  const rec = {
    id: editing ? editing.id : uid(),
    orgId: $('#e-org').value,
    title, body,
    tags: $('#e-tags').value.split(',').map((s) => s.trim()).filter(Boolean),
    photos: photoIds,
    createdAt: editing ? editing.createdAt : Date.now(),
    updatedAt: Date.now(),
  };
  if (editing) notes[notes.findIndex((n) => n.id === editing.id)] = rec;
  else notes.unshift(rec);
  save(LS.notes, notes);
  location.hash = `#/note/${rec.id}`;
}

async function renderView(id) {
  const n = notes.find((x) => x.id === id);
  if (!n) { location.hash = '#/notes'; return; }
  editing = n;
  const o = orgById(n.orgId);
  $('#v-ttl').textContent = n.title || '(無題)';
  $('#v-meta').innerHTML = `${(n.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}
    ${o ? esc(o.jp) + '　' : ''}${new Date(n.updatedAt).toLocaleString('ja-JP')}`;
  $('#v-body').textContent = n.body || '';
  const pb = $('#v-photos');
  pb.innerHTML = '';
  for (const pid of n.photos || []) {
    const du = await getPhoto(pid);
    if (!du) continue;
    const im = el('img', 'shot'); im.src = du;
    pb.appendChild(im);
  }
}

/* ---------- 設定 ---------- */
function renderSet() {
  $('#s-notes').textContent = notes.length;
  $('#s-photos').textContent = notes.reduce((a, n) => a + (n.photos || []).length, 0);
  $('#s-orgs').textContent = customOrgs.length;
  $('#s-verified').textContent = `${Object.keys(verified).length} / ${RULES.length}`;
}

async function exportAll() {
  const photos = {};
  for (const n of notes) for (const pid of n.photos || []) {
    const du = await getPhoto(pid);
    if (du) photos[pid] = du;
  }
  const blob = new Blob([JSON.stringify({ v: 1, notes, customOrgs, verified, photos }, null, 2)], { type: 'application/json' });
  const a = el('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date();
  a.download = `菌譜_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importAll(file) {
  const txt = await file.text();
  let d;
  try { d = JSON.parse(txt); } catch { alert('読めないファイル。'); return; }
  if (!d.notes) { alert('菌譜の書き出しファイルではない。'); return; }
  if (!confirm(`ノート ${d.notes.length}件を読み込む。今あるノートは置き換わる。`)) return;
  for (const [pid, du] of Object.entries(d.photos || {})) await putPhoto(pid, du);
  notes = d.notes; customOrgs = d.customOrgs || []; verified = d.verified || {};
  save(LS.notes, notes); save(LS.orgs, customOrgs); save(LS.verified, verified);
  alert('読み込んだ。');
  route();
}

function addOrg() {
  const jp = prompt('菌の名前（日本語）\n例：カンピロバクター');
  if (!jp) return;
  const name = prompt('学名（分かれば）\n例：Campylobacter jejuni') || '';
  const group = prompt('グループ\n例：グラム陰性桿菌（その他）') || 'そのほか';
  const drugs = (prompt('感受性を見る薬剤（カンマ区切り、あとで足せる）\n例：EM, CPFX, GM') || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const intrinsic = (prompt('自然耐性（カンマ区切り、無ければ空のまま）') || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  customOrgs.push({ id: 'c_' + uid(), jp, name, group, drugs, intrinsic, note: '' });
  save(LS.orgs, customOrgs);
  renderOrgList();
}

/* ---------- ルーティング ---------- */
function show(sc) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === sc));
  window.scrollTo(0, 0);
}

function route() {
  const h = location.hash || '#/orgs';
  const [, part, arg] = h.split('/');
  $('#btn-back').hidden = (part === 'orgs' || part === 'notes' || part === 'set');
  /* 「＋」は薬剤のRボタンと重なって誤タップを招くので、耐性ナビの上には出さない */
  $('#fab').hidden = (part !== 'notes');

  document.querySelectorAll('nav.tabbar button').forEach((b) => {
    const on = (b.dataset.go === 'orgs' && (part === 'orgs' || part === 'org'))
      || (b.dataset.go === 'notes' && (part === 'notes' || part === 'note' || part === 'edit'))
      || (b.dataset.go === 'set' && part === 'set');
    b.classList.toggle('on', on);
  });

  if (part === 'org') { show('sc-org'); renderOrg(arg); switchPane('p-nav'); }
  else if (part === 'notes') { show('sc-notes'); fillOrgSelect($('#note-filter'), true); renderNotes(); }
  else if (part === 'note') { show('sc-view'); renderView(arg); }
  else if (part === 'edit') { show('sc-edit'); openEdit(arg === 'new' ? null : arg); }
  else if (part === 'set') { show('sc-set'); renderSet(); }
  else { show('sc-orgs'); renderOrgList(); }
}

function switchPane(id) {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.pane === id));
  document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.id === id));
  $('#fab').hidden = (id !== 'p-notes');
  if (id === 'p-intr') renderIntr();
  if (id === 'p-notes') renderOrgNotes();
}

/* ---------- 配線 ---------- */
window.addEventListener('hashchange', route);

$('#org-q').addEventListener('input', renderOrgList);
$('#note-q').addEventListener('input', renderNotes);
$('#note-filter').addEventListener('change', renderNotes);
$('#btn-add-org').onclick = addOrg;
$('#btn-back').onclick = () => history.back();

document.querySelectorAll('.tabs button').forEach((b) => { b.onclick = () => switchPane(b.dataset.pane); });
document.querySelectorAll('nav.tabbar button').forEach((b) => {
  b.onclick = () => { location.hash = '#/' + b.dataset.go; };
});

$('#fab').onclick = () => (location.hash = '#/edit/new');
$('#btn-photo').onclick = () => $('#e-photo').click();
$('#e-photo').onchange = async (e) => {
  for (const f of e.target.files) {
    try {
      const du = await shrink(f);
      editPhotos.push({ id: uid(), dataUrl: du });
    } catch { alert('その画像は読めなかった。'); }
  }
  e.target.value = '';
  drawThumbs();
};
$('#btn-save').onclick = saveNote;
$('#btn-del').onclick = () => {
  if (!editing || !confirm('このノートを消す？戻せない。')) return;
  for (const pid of editing.photos || []) delPhoto(pid);
  notes = notes.filter((n) => n.id !== editing.id);
  save(LS.notes, notes);
  location.hash = '#/notes';
};
$('#btn-edit').onclick = () => (location.hash = `#/edit/${editing.id}`);
$('#btn-export').onclick = exportAll;
$('#btn-import').onclick = () => $('#imp').click();
$('#imp').onchange = (e) => { if (e.target.files[0]) importAll(e.target.files[0]); e.target.value = ''; };
$('#btn-wipe').onclick = () => {
  if (!confirm('このスマホのノートを全部消す。書き出していないと戻せない。本当に？')) return;
  if (!confirm('もう一度だけ確認する。全部消していい？')) return;
  localStorage.removeItem(LS.notes);
  localStorage.removeItem(LS.orgs);
  localStorage.removeItem(LS.sir);
  indexedDB.deleteDatabase('kinpu');
  notes = []; customOrgs = []; sirState = {};
  alert('消した。');
  location.hash = '#/orgs';
  route();
};

route();
