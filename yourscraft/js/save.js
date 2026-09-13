/* YoursCraft — 自動セーブ
 *
 * 地形は seed から再現できるので、保存するのは
 *   ・メタ情報（seed / プレイヤー位置 / 時刻 / ホットバー / 設定）
 *   ・プレイヤーが置いた・壊したブロックだけ（チャンクごとの差分）
 * これだけ。IndexedDB が使えない環境では localStorage に落とす。
 */
(function (global) {
  'use strict';
  var YC = global.YC || (global.YC = {});

  var DB_NAME = 'yourscraft';
  var DB_VER = 1;
  var STORE = 'world';
  var LS_KEY = 'yourscraft:save';

  function Save() {
    this.db = null;
    this.mode = 'none';
  }

  Save.prototype.open = function () {
    var self = this;
    return new Promise(function (resolve) {
      var idb = global.indexedDB;
      if (!idb) { self.mode = 'local'; resolve('local'); return; }
      var req;
      try { req = idb.open(DB_NAME, DB_VER); } catch (e) { self.mode = 'local'; resolve('local'); return; }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () {
        self.db = req.result;
        self.mode = 'idb';
        resolve('idb');
      };
      req.onerror = function () { self.mode = 'local'; resolve('local'); };
      req.onblocked = function () { self.mode = 'local'; resolve('local'); };
      setTimeout(function () {
        if (self.mode === 'none') { self.mode = 'local'; resolve('local'); }
      }, 2500);
    });
  };

  Save.prototype._localAll = function () {
    try {
      var raw = global.localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  };
  Save.prototype._localWrite = function (obj) {
    try { global.localStorage.setItem(LS_KEY, JSON.stringify(obj)); return true; } catch (e) { return false; }
  };

  Save.prototype.put = function (key, value) {
    var self = this;
    if (this.mode === 'idb') {
      return new Promise(function (resolve, reject) {
        var tx = self.db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    }
    var all = this._localAll();
    all[key] = value && value.i ? { i: Array.from(value.i), b: Array.from(value.b) } : value;
    this._localWrite(all);
    return Promise.resolve();
  };

  Save.prototype.putMany = function (entries) {
    var self = this;
    if (this.mode === 'idb') {
      return new Promise(function (resolve, reject) {
        var tx = self.db.transaction(STORE, 'readwrite');
        var st = tx.objectStore(STORE);
        for (var i = 0; i < entries.length; i++) st.put(entries[i][1], entries[i][0]);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    }
    var all = this._localAll();
    for (var j = 0; j < entries.length; j++) {
      var v = entries[j][1];
      all[entries[j][0]] = (v && v.i) ? { i: Array.from(v.i), b: Array.from(v.b) } : v;
    }
    this._localWrite(all);
    return Promise.resolve();
  };

  Save.prototype.get = function (key) {
    var self = this;
    if (this.mode === 'idb') {
      return new Promise(function (resolve) {
        var tx = self.db.transaction(STORE, 'readonly');
        var r = tx.objectStore(STORE).get(key);
        r.onsuccess = function () { resolve(r.result === undefined ? null : r.result); };
        r.onerror = function () { resolve(null); };
      });
    }
    var all = this._localAll();
    return Promise.resolve(all[key] === undefined ? null : all[key]);
  };

  /* チャンクの差分をまとめて読む */
  Save.prototype.loadAllEdits = function () {
    var self = this;
    if (this.mode === 'idb') {
      return new Promise(function (resolve) {
        var out = new Map();
        var tx = self.db.transaction(STORE, 'readonly');
        var st = tx.objectStore(STORE);
        var req = st.openCursor();
        req.onsuccess = function () {
          var cur = req.result;
          if (!cur) { resolve(out); return; }
          if (typeof cur.key === 'string' && cur.key.indexOf('c:') === 0) {
            out.set(cur.key.slice(2), cur.value);
          }
          cur.continue();
        };
        req.onerror = function () { resolve(out); };
      });
    }
    var all = this._localAll();
    var out2 = new Map();
    Object.keys(all).forEach(function (k) {
      if (k.indexOf('c:') === 0) out2.set(k.slice(2), all[k]);
    });
    return Promise.resolve(out2);
  };

  Save.prototype.clearAll = function () {
    var self = this;
    if (this.mode === 'idb') {
      return new Promise(function (resolve) {
        var tx = self.db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
      });
    }
    try { global.localStorage.removeItem(LS_KEY); } catch (e) { /* 無視 */ }
    return Promise.resolve();
  };

  YC.Save = new Save();
  YC.SaveKeys = { meta: 'meta', chunk: function (cx, cz) { return 'c:' + cx + ',' + cz; } };
})(typeof window !== 'undefined' ? window : globalThis);
