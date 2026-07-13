/* 菌譜 — オフライン対応
 *
 * 検査室は電波が入らない。ノートは端末の中にあるのに、アプリの殻が落ちてこないせいで
 * 何も読めない、では意味がない。だから殻をキャッシュに焼いておく。
 *
 * 方針：
 *  - アプリ本体（HTML/JS/CSS）は cache-first。開くのは常に一瞬。裏で静かに更新する。
 *  - AI整理（/organize）だけは絶対にキャッシュしない。オフラインなら素直に失敗させる。
 */

const CACHE = 'kinpu-v6';
const SHELL = [
  './',
  './index.html',
  './app.js',
  './rules.js',
  './drugs.js',
  './mechanisms.js',
  './details.js',
  './flowdata.js',
  './pet.js',
  './favicon.svg',
  './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))   // 1つ失敗しても諦めない
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  /* AIサーバーは通さない。オフラインなら失敗が正しい（古い返事を返す方が害になる） */
  if (url.pathname.endsWith('/organize') || url.pathname.endsWith('/health')) return;

  /* ネットワーク優先。オンラインなら常に最新を取り、キャッシュはオフライン時の予備に徹する。
   * cache-first をやめた理由：app.js だけ先に更新され rules.js が古いまま、といった
   * 部品バージョンの食い違いが起きうる（静的レビュー#6）。オンラインで毎回最新を揃えれば起きない。 */
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) {
        const c = await caches.open(CACHE); c.put(req, res.clone()).catch(() => {});
      }
      return res;
    } catch {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      return new Response('', { status: 504, statusText: 'offline' });
    }
  })());
});
