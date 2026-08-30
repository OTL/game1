/* ============================================================
   COSMIC EATER - save.js
   localStorage への自動セーブ / ロード
   ============================================================ */
'use strict';

// v4: 実機フィードバック対応（第3回・エンドレスモード追加、終盤の進化しきい値変更）
// のため旧セーブ(v1〜v3)は破棄する。
const SAVE_KEY = 'cosmic-eater-save-v4';

function serializePlayer(player) {
  return {
    mass: player.mass,
    hp: player.hp,
    stageIdx: player.stageIdx,
    upgrades: player.upgrades,
    playTime: player.playTime,
    absorbedCount: player.absorbedCount,
    totalMassGained: player.totalMassGained,
    nextLevelMass: player.nextLevelMass,
    level: player.level,
    reviveUsed: player.reviveUsed,
    mode: player.mode,
    endless: !!player.endless,
    checkpointMass: player.checkpointMass,
    checkpointStageIdx: player.checkpointStageIdx,
    checkpointUpgrades: player.checkpointUpgrades,
    checkpointHp: player.checkpointHp,
    capturedSatellites: (player.capturedSatellites || []).map(s => ({
      uid: s.uid, kind: s.kind, palette: s.palette, name: s.name,
      mass: s.mass, hp: s.hp, maxHp: s.maxHp, radius: s.radius,
      dist: s.dist, speed: s.speed, hasRing: s.hasRing,
      seedBucket: s.seedBucket, irregularShape: s.irregularShape,
    })),
  };
}

function saveGame(player) {
  try {
    const data = serializePlayer(player);
    data.savedAt = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { /* localStorage不可の環境では無視 */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.mass !== 'number') return null;
    return data;
  } catch (e) { return null; }
}

function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* noop */ }
}

function hasSave() { return !!loadGame(); }
