/* ============================================================
   COSMIC EATER - save.js
   localStorage への自動セーブ / ロード
   ============================================================ */
'use strict';

const SAVE_KEY = 'cosmic-eater-save-v2'; // v2: レベルアップ必要質量カーブ変更のため旧セーブ(v1)は破棄

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
    checkpointMass: player.checkpointMass,
    checkpointStageIdx: player.checkpointStageIdx,
    checkpointUpgrades: player.checkpointUpgrades,
    checkpointHp: player.checkpointHp,
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
