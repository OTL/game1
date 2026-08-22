// 共有ストレージのアダプタ。
//
// GitHub Pages は静的ホスティングなのでサーバを持てない。そこで
//   ・同じブラウザの別タブ  → BroadcastChannel / storage イベントで即共有
//   ・本当にみんなで共有   → JSON を GET / PUT できるエンドポイントを差せば有効
// という二段構えにしてある。エンドポイントの指定方法は README を参照。
(function (global) {
  'use strict';

  const PULL_MS = 20000;
  let url = null;
  let listeners = [];
  let pushTimer = null;
  let statusText = 'ローカル';
  let online = false;

  function readConfig() {
    const q = new URLSearchParams(location.search).get('sync');
    if (q) return q;
    if (global.MONSTER_SYNC_URL) return global.MONSTER_SYNC_URL;
    try {
      const saved = localStorage.getItem('monster.syncUrl');
      if (saved) return saved;
    } catch (e) { /* 無視 */ }
    return null;
  }

  function emit() { listeners.forEach((fn) => fn(statusText, online)); }

  let channel = null;
  try { channel = new BroadcastChannel('monster-world'); } catch (e) { channel = null; }

  const Sync = {
    onStatus: function (fn) { listeners.push(fn); fn(statusText, online); },
    status: function () { return statusText; },

    start: function (onRemote) {
      url = readConfig();
      this._onRemote = onRemote;

      if (channel) {
        channel.onmessage = (ev) => {
          if (ev.data && ev.data.type === 'state') onRemote(ev.data.state);
        };
      }
      window.addEventListener('storage', (ev) => {
        if (ev.key === 'monster.world.v1' && ev.newValue) {
          try { onRemote(JSON.parse(ev.newValue)); } catch (e) { /* 無視 */ }
        }
      });

      if (url) {
        statusText = '接続中…';
        emit();
        this.pull();
        setInterval(() => this.pull(), PULL_MS);
      } else {
        statusText = 'このブラウザ内で共有';
        emit();
      }
    },

    setUrl: function (u) {
      try { localStorage.setItem('monster.syncUrl', u || ''); } catch (e) { /* 無視 */ }
      location.reload();
    },

    pull: function () {
      if (!url) return;
      fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
        .then((data) => {
          online = true;
          statusText = 'みんなと同期中';
          emit();
          if (data && this._onRemote) this._onRemote(data);
        })
        .catch(() => {
          online = false;
          statusText = 'オフライン（ローカル保存）';
          emit();
        });
    },

    push: function (state) {
      if (channel) {
        try { channel.postMessage({ type: 'state', state: state }); } catch (e) { /* 無視 */ }
      }
      if (!url) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => {
        fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(state)
        }).then((r) => {
          online = r.ok;
          statusText = r.ok ? 'みんなと同期中' : '保存できませんでした';
          emit();
        }).catch(() => {
          online = false;
          statusText = 'オフライン（ローカル保存）';
          emit();
        });
      }, 900);
    }
  };

  global.Sync = Sync;
})(window);
