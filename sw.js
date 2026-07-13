/* 菌譜 — オフライン対応
 *
 * 検査室は電波が入らない。ノートは端末の中にあるのに、アプリの殻が落ちてこないせいで
 * 何も読めない、では意味がない。だから殻をキャッシュに焼いておく。
 *
 * 方針：
 *  - アプリ本体（HTML/JS/CSS）は cache-first。開くのは常に一瞬。裏で静かに更新する。
 *  - AI整理（/organize）だけは絶対にキャッシュしない。オフラインなら素直に失敗させる。
 */

const CACHE = 'kinpu-v3';
const SHELL = [
  './',
  './index.html',
  './app.js',
  './rules.js',
  './drugs.js',
  './mechanisms.js',
  './details.js',
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

  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });

    /* 裏で更新を取りに行く。取れたら次回に効く。取れなくても黙って諦める。 */
    const fresh = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) {
        caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(() => {});
      }
      return res;
    }).catch(() => null);

    if (cached) return cached;

    const res = await fresh;
    if (res) return res;

    /* オフラインで、キャッシュにも無い。ページ遷移ならアプリの殻を返す（ハッシュ遷移なので中身は動く） */
    if (req.mode === 'navigate') {
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    return new Response('', { status: 504, statusText: 'offline' });
  })());
});
