/* YoursCraft — プレイヤーの動きと当たり判定
 * 速度や重力はマイクラの数値に近づけてある（歩き 4.3 / ダッシュ 5.6 m/s など）。
 */
(function (global) {
  'use strict';
  var YC = global.YC || (global.YC = {});
  var B = YC.Blocks, ID = B.ID, G = YC.Gen;

  var WIDTH = 0.6, HEIGHT = 1.8, EYE = 1.62;
  var GRAVITY = 30;
  var JUMP_V = 8.6;

  function Player(world) {
    this.world = world;
    this.x = 0; this.y = 50; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.pitch = 0;
    this.onGround = false;
    this.flying = true;       /* クリエイティブは最初から飛べる */
    this.sprinting = false;
    this.inWater = false;
    this.headInWater = false;
    this.bob = 0;
    this.stepOffset = 0;
    this.walked = 0;          /* 足音のため */
    this.lastStep = 0;
  }

  Player.prototype.eyeY = function () { return this.y + EYE - this.stepOffset - (this.sneaking ? 0.22 : 0); };

  Player.prototype.blockAt = function (x, y, z) {
    return this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
  };

  /* AABB がブロックに重なっているか */
  Player.prototype.collides = function (x, y, z) {
    var hw = WIDTH / 2;
    var x0 = Math.floor(x - hw), x1 = Math.floor(x + hw);
    var y0 = Math.floor(y), y1 = Math.floor(y + HEIGHT - 0.001);
    var z0 = Math.floor(z - hw), z1 = Math.floor(z + hw);
    for (var yy = y0; yy <= y1; yy++) {
      for (var zz = z0; zz <= z1; zz++) {
        for (var xx = x0; xx <= x1; xx++) {
          var id = this.world.getBlock(xx, yy, zz);
          if (!B.isSolid(id)) continue;
          /* ベッドのような背の低いブロックは、その高さまでしかぶつからない */
          var bh = B.heightOf(id);
          if (bh >= 1 || y < yy + bh) return true;
        }
      }
    }
    return false;
  };

  /* 足もとが地面か（0.08 下げて判定） */
  Player.prototype.checkGround = function () {
    return this.collides(this.x, this.y - 0.08, this.z);
  };

  Player.prototype.update = function (dt, ctrl, opts) {
    if (dt > 0.05) dt = 0.05;      /* コマ落ちしても飛び抜けないように */
    var self = this;

    /* --- 水の中か --- */
    var feetBlock = this.blockAt(this.x, this.y + 0.1, this.z);
    var eyeBlock = this.blockAt(this.x, this.eyeY(), this.z);
    this.inWater = feetBlock === ID.WATER || feetBlock === ID.LAVA;
    this.headInWater = eyeBlock === ID.WATER;

    /* --- 進みたい方向 --- */
    var mx = ctrl.moveX, mz = ctrl.moveZ;
    var mag = Math.sqrt(mx * mx + mz * mz);
    if (mag > 1) { mx /= mag; mz /= mag; mag = 1; }
    var cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    /* yaw=0 のとき視線は -Z 方向。
       前向きベクトル F = (-sin yaw, 0, -cos yaw)、右向きベクトル R = (cos yaw, 0, -sin yaw)。
       mz は「手前に引く = +」なので、進む向きは R*mx + F*(-mz) になる。 */
    var dirX = mx * cy + mz * sy;
    var dirZ = -mx * sy + mz * cy;

    var speed;
    this.sneaking = !this.flying && !!ctrl.sneak && this.onGround;
    if (this.flying) speed = this.sprinting ? 16 : 10.9;   /* 飛行の全開は速すぎると狙えないので控えめに */
    else if (this.inWater) speed = 2.4;
    else if (this.sneaking) speed = 1.3;          /* しゃがみ歩き */
    else speed = this.sprinting ? 5.6 : 4.317;

    var accel = this.flying ? 22 : (this.onGround ? 30 : 9);
    var targetVX = dirX * speed, targetVZ = dirZ * speed;
    this.vx += (targetVX - this.vx) * Math.min(1, accel * dt);
    this.vz += (targetVZ - this.vz) * Math.min(1, accel * dt);

    /* --- 縦の動き --- */
    if (this.flying) {
      var up = (ctrl.jump ? 1 : 0) - (ctrl.sneak ? 1 : 0);
      var vSpeed = this.sprinting ? 14 : 7.5;
      this.vy += (up * vSpeed - this.vy) * Math.min(1, 18 * dt);
    } else if (this.inWater) {
      this.vy -= 8 * dt;
      if (ctrl.jump) this.vy = 3.2;              /* 泳いで浮上 */
      if (this.vy < -3) this.vy = -3;
    } else {
      this.vy -= GRAVITY * dt;
      if (this.vy < -60) this.vy = -60;
      if (ctrl.jump && this.onGround) {
        this.vy = JUMP_V;
        this.onGround = false;
      }
    }

    /* --- 実際に動かす（軸ごとに判定） --- */
    var dx = this.vx * dt, dy = this.vy * dt, dz = this.vz * dt;
    var hitX = false, hitZ = false;

    this.y += dy;
    if (this.collides(this.x, this.y, this.z)) {
      var sign = dy > 0 ? 1 : -1;
      this.y -= dy;
      /* 1 ブロック単位でぶつかる位置まで戻す */
      var step = 0.02 * sign;
      var moved = 0;
      while (Math.abs(moved) < Math.abs(dy) && !this.collides(this.x, this.y + step, this.z)) {
        this.y += step; moved += step;
      }
      if (dy < 0) { this.onGround = true; }
      this.vy = 0;
    } else if (dy !== 0) {
      this.onGround = false;
    }

    this.x += dx;
    if (this.collides(this.x, this.y, this.z)) { this.x -= dx; hitX = true; this.vx = 0; }
    this.z += dz;
    if (this.collides(this.x, this.y, this.z)) { this.z -= dz; hitZ = true; this.vz = 0; }

    if (!this.flying && !this.onGround) this.onGround = this.checkGround();
    if (this.onGround && this.vy <= 0) this.vy = 0;

    /* --- 自動ジャンプ（1 ブロックの段差を勝手に登る。タブレットだと効く） --- */
    if (opts && opts.autoJump && !this.flying && this.onGround && (hitX || hitZ) && mag > 0.2) {
      if (!this.collides(this.x + dx, this.y + 1.05, this.z + dz)) {
        /* 1 ブロックの段差を越えるには 1.0 以上の高さが必要。
           控えめな初速だと 0.64 しか上がらず、跳ぶのに乗れなかった。 */
        this.vy = JUMP_V;
        this.onGround = false;
      }
    }
    if (this.stepOffset > 0) this.stepOffset = Math.max(0, this.stepOffset - dt * 6);

    /* --- 歩きの上下ゆれと足音 --- */
    var hSpeed = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
    if (this.onGround && hSpeed > 0.6) {
      this.bob += dt * hSpeed * 1.7;
      this.walked += hSpeed * dt;
    } else {
      this.bob += dt * 0.6;
    }
    if (this.walked - this.lastStep > 1.9) {
      this.lastStep = this.walked;
      var below = this.world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.2), Math.floor(this.z));
      if (opts && opts.onStep && below) opts.onStep(below);
    }

    /* 世界の外に落ちないように */
    if (this.y < -8) { this.y = G.WH - 10; this.vy = 0; }
    if (this.y > G.WH + 20) { this.y = G.WH + 20; this.vy = Math.min(0, this.vy); }
  };

  /* 置こうとしているマスにプレイヤー自身がいないか（マイクラも自分の中には置けない） */
  Player.prototype.blocksSpace = function (bx, by, bz) {
    var hw = WIDTH / 2;
    return (this.x + hw > bx && this.x - hw < bx + 1 &&
      this.y + HEIGHT > by && this.y < by + 1 &&
      this.z + hw > bz && this.z - hw < bz + 1);
  };

  Player.prototype.lookDir = function () {
    var cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    return [-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp];
  };

  Player.WIDTH = WIDTH;
  Player.HEIGHT = HEIGHT;
  Player.EYE = EYE;
  YC.Player = Player;
})(typeof window !== 'undefined' ? window : globalThis);
