/* YoursCraft — 描画（WebGL2 直書き。ライブラリなし）
 *
 * ・ブロックのテクスチャは 2D 配列テクスチャ。1 面 = 1 レイヤーなので
 *   ミップマップを使ってもタイルの境目がにじまない（遠くがチラつかない）
 * ・空・雲・太陽・月・星はシェーダで描く
 * ・水は頂点の wave フラグだけを揺らす
 */
(function (global) {
  'use strict';
  var YC = global.YC || (global.YC = {});
  var B = YC.Blocks, G = YC.Gen;

  /* ---------- 4x4 行列（列優先） ---------- */
  var M4 = {
    create: function () {
      return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    },
    identity: function (o) {
      o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0; o[4] = 0; o[5] = 1; o[6] = 0; o[7] = 0;
      o[8] = 0; o[9] = 0; o[10] = 1; o[11] = 0; o[12] = 0; o[13] = 0; o[14] = 0; o[15] = 1;
      return o;
    },
    perspective: function (o, fovy, aspect, near, far) {
      var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      o[0] = f / aspect; o[1] = 0; o[2] = 0; o[3] = 0;
      o[4] = 0; o[5] = f; o[6] = 0; o[7] = 0;
      o[8] = 0; o[9] = 0; o[10] = (far + near) * nf; o[11] = -1;
      o[12] = 0; o[13] = 0; o[14] = 2 * far * near * nf; o[15] = 0;
      return o;
    },
    multiply: function (o, a, b) {
      var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
      for (var i = 0; i < 4; i++) {
        var b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
        o[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        o[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        o[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        o[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      }
      return o;
    },
    invert: function (o, m) {
      var a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7],
        a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
      var b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10,
        b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12,
        b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30,
        b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
      var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
      if (!det) return o;
      det = 1 / det;
      o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
      o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
      o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
      o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
      o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
      o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
      o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
      o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
      o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
      o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
      o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
      o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
      o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
      o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
      o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
      o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
      return o;
    },
    /* カメラ（yaw/pitch + 位置）からビュー行列を作る */
    view: function (o, x, y, z, yaw, pitch) {
      var cy = Math.cos(yaw), sy = Math.sin(yaw);
      var cp = Math.cos(pitch), sp = Math.sin(pitch);
      /* 右, 上, 前 */
      var rx = cy, ry = 0, rz = -sy;
      var ux = sy * sp, uy = cp, uz = cy * sp;
      var fx = -sy * cp, fy = sp, fz = -cy * cp;
      o[0] = rx; o[1] = ux; o[2] = -fx; o[3] = 0;
      o[4] = ry; o[5] = uy; o[6] = -fy; o[7] = 0;
      o[8] = rz; o[9] = uz; o[10] = -fz; o[11] = 0;
      o[12] = -(rx * x + ry * y + rz * z);
      o[13] = -(ux * x + uy * y + uz * z);
      o[14] = (fx * x + fy * y + fz * z);
      o[15] = 1;
      return o;
    },
    translate: function (o, x, y, z) {
      M4.identity(o); o[12] = x; o[13] = y; o[14] = z; return o;
    },
    trs: function (o, tx, ty, tz, rx, ry, s) {
      var cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
      /* Ry * Rx * S */
      o[0] = cy * s; o[1] = 0; o[2] = -sy * s; o[3] = 0;
      o[4] = sy * sx * s; o[5] = cx * s; o[6] = cy * sx * s; o[7] = 0;
      o[8] = sy * cx * s; o[9] = -sx * s; o[10] = cy * cx * s; o[11] = 0;
      o[12] = tx; o[13] = ty; o[14] = tz; o[15] = 1;
      return o;
    }
  };
  YC.M4 = M4;

  /* ---------- シェーダ ---------- */
  var CHUNK_VS = [
    '#version 300 es',
    'precision highp float;',
    'layout(location=0) in vec3 aPos;',
    'layout(location=1) in float aTile;',
    'layout(location=2) in vec2 aUV;',
    'layout(location=3) in vec4 aLight;',
    'uniform mat4 uVP;',
    'uniform vec3 uCam;',
    'uniform float uTime;',
    'out vec2 vUV; out float vTile; out vec3 vLight; out float vDist;',
    'void main(){',
    '  vec3 p = aPos;',
    '  if (aLight.w > 0.5) { p.y += sin(uTime*1.7 + p.x*0.8 + p.z*1.1)*0.04 - 0.045; }',
    '  vUV = aUV; vTile = aTile; vLight = aLight.xyz;',
    '  vDist = length(p - uCam);',
    '  gl_Position = uVP * vec4(p, 1.0);',
    '}'
  ].join('\n');

  var CHUNK_FS = [
    '#version 300 es',
    'precision highp float;',
    'precision highp sampler2DArray;',
    'in vec2 vUV; in float vTile; in vec3 vLight; in float vDist;',
    'uniform sampler2DArray uAtlas;',
    'uniform float uSun;',
    'uniform float uAlphaTest;',
    'uniform vec3 uFogColor;',
    'uniform vec2 uFogRange;',
    'uniform vec3 uTint;',
    'uniform float uAlpha;',
    'out vec4 outColor;',
    'void main(){',
    '  vec4 tex = texture(uAtlas, vec3(vUV, vTile));',
    '  if (tex.a < uAlphaTest) discard;',
    '  float l = max(vLight.x * uSun, vLight.y);',
    '  float bright = 0.07 + 0.93 * pow(l, 1.42);',
    '  vec3 c = tex.rgb * uTint * vLight.z * bright;',
    '  c = mix(c * vec3(0.55,0.62,0.92), c, clamp(uSun*1.4, 0.0, 1.0));',
    '  float fog = clamp((vDist - uFogRange.x) / max(uFogRange.y - uFogRange.x, 0.001), 0.0, 1.0);',
    '  fog = fog * fog;',
    '  c = mix(c, uFogColor, fog);',
    '  outColor = vec4(c, tex.a * uAlpha);',
    '}'
  ].join('\n');

  var SKY_VS = [
    '#version 300 es',
    'precision highp float;',
    'layout(location=0) in vec2 aPos;',
    'out vec2 vNdc;',
    'void main(){ vNdc = aPos; gl_Position = vec4(aPos, 1.0, 1.0); }'
  ].join('\n');

  var SKY_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vNdc;',
    'uniform mat4 uInvVP;',
    'uniform vec3 uCam;',
    'uniform vec3 uSunDir;',
    'uniform vec3 uZenith;',
    'uniform vec3 uHorizon;',
    'uniform float uNight;',
    'uniform float uMoonPhase;',
    'out vec4 outColor;',
    'float h31(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }',
    'void main(){',
    '  vec4 pw = uInvVP * vec4(vNdc, 1.0, 1.0);',
    '  vec3 dir = normalize(pw.xyz / pw.w - uCam);',
    '  float up = dir.y;',
    '  vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.45, up));',
    '  col = mix(col, uHorizon * 0.75, smoothstep(0.0, -0.35, up));',
    /* 夕焼け・朝焼け：太陽の方向の地平線をあたためる */
    '  float sd = max(dot(normalize(vec3(dir.x, 0.0, dir.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0);',
    '  float low = 1.0 - clamp(abs(uSunDir.y) * 3.2, 0.0, 1.0);',
    '  float band = exp(-abs(up) * 7.0);',
    '  col += vec3(1.0, 0.42, 0.12) * pow(sd, 3.0) * band * low * 0.85;',
    /* 星 */
    '  if (uNight > 0.01 && up > -0.05) {',
    '    vec3 q = dir * 110.0;',
    '    vec3 cell = floor(q);',
    '    float hh = h31(cell);',
    '    if (hh > 0.9955) {',
    '      float d = length(q - (cell + 0.5));',
    '      float tw = 0.6 + 0.4 * sin(h31(cell + 3.0) * 30.0);',
    '      col += vec3(1.0, 1.0, 0.95) * smoothstep(0.42, 0.0, d) * uNight * tw;',
    '    }',
    '  }',
    /* 太陽 */
    '  float sunD = dot(dir, uSunDir);',
    '  col += vec3(1.0, 0.93, 0.72) * pow(max(sunD, 0.0), 800.0) * 1.4;',
    '  col += vec3(1.0, 0.85, 0.55) * pow(max(sunD, 0.0), 30.0) * 0.16;',
    /* 月（欠けを表現） */
    '  float moonD = dot(dir, -uSunDir);',
    '  if (moonD > 0.9986) {',
    '    vec3 mUp = normalize(cross(-uSunDir, vec3(0.0, 1.0, 0.0)));',
    '    float off = dot(dir - (-uSunDir), mUp) * 260.0;',
    '    float lit = smoothstep(uMoonPhase - 0.18, uMoonPhase + 0.18, off);',
    '    col = mix(col, vec3(0.93, 0.95, 1.0), 0.92 * lit);',
    '  }',
    '  outColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var CLOUD_VS = [
    '#version 300 es',
    'precision highp float;',
    'layout(location=0) in vec2 aPos;',
    'uniform mat4 uVP;',
    'uniform vec3 uCam;',
    'uniform float uY;',
    'uniform float uSize;',
    'out vec2 vUV; out vec2 vWorld;',
    'void main(){',
    '  vec3 p = vec3(uCam.x + aPos.x * uSize, uY, uCam.z + aPos.y * uSize);',
    '  vUV = p.xz * 0.0125;',
    '  vWorld = p.xz;',
    '  gl_Position = uVP * vec4(p, 1.0);',
    '}'
  ].join('\n');

  var CLOUD_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUV; in vec2 vWorld;',
    'uniform sampler2D uTex;',
    'uniform float uTime;',
    'uniform float uSun;',
    'uniform vec3 uFogColor;',
    'uniform vec2 uCamXZ;',
    'uniform float uFade;',
    'out vec4 outColor;',
    'void main(){',
    '  float a = texture(uTex, vUV + vec2(uTime * 0.0032, 0.0)).a;',
    '  a *= 0.9;',
    '  if (a < 0.04) discard;',
    '  vec3 c = mix(vec3(0.66,0.70,0.80), vec3(1.0), clamp(uSun, 0.0, 1.0));',
    // 距離はフラグメントごとに測る（頂点だけだと四隅が同じ距離になり全面が霧に潰れる）
    '  float d = length(vWorld - uCamXZ);',
    '  float fog = clamp((d - uFade * 0.4) / (uFade * 0.6), 0.0, 1.0);',
    '  fog = fog * fog;',
    '  c = mix(c, uFogColor, fog);',
    '  outColor = vec4(c, a * (1.0 - fog));',
    '}'
  ].join('\n');

  var LINE_VS = [
    '#version 300 es',
    'precision highp float;',
    'layout(location=0) in vec3 aPos;',
    'uniform mat4 uVP; uniform mat4 uModel;',
    'void main(){ gl_Position = uVP * uModel * vec4(aPos, 1.0); }'
  ].join('\n');

  var LINE_FS = [
    '#version 300 es',
    'precision highp float;',
    'uniform vec4 uColor;',
    'out vec4 outColor;',
    'void main(){ outColor = uColor; }'
  ].join('\n');

  /* ---------- 本体 ---------- */
  function Renderer(canvas) {
    var gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: true, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false
    });
    if (!gl) throw new Error('WebGL2 が使えません');
    this.gl = gl;
    this.canvas = canvas;
    this.proj = M4.create();
    this.viewM = M4.create();
    this.vp = M4.create();
    this.invVP = M4.create();
    this.model = M4.create();
    this.planes = new Float32Array(24);
    this.chunkCount = 0;
    this.triCount = 0;

    this.progChunk = this._program(CHUNK_VS, CHUNK_FS);
    this.progSky = this._program(SKY_VS, SKY_FS);
    this.progCloud = this._program(CLOUD_VS, CLOUD_FS);
    this.progLine = this._program(LINE_VS, LINE_FS);
    this.uc = this._uniforms(this.progChunk, ['uVP', 'uCam', 'uTime', 'uAtlas', 'uSun', 'uAlphaTest', 'uFogColor', 'uFogRange', 'uTint', 'uAlpha']);
    this.us = this._uniforms(this.progSky, ['uInvVP', 'uCam', 'uSunDir', 'uZenith', 'uHorizon', 'uNight', 'uMoonPhase']);
    this.ucl = this._uniforms(this.progCloud, ['uVP', 'uCam', 'uY', 'uSize', 'uTex', 'uTime', 'uSun', 'uFogColor', 'uFade', 'uCamXZ']);
    this.ul = this._uniforms(this.progLine, ['uVP', 'uModel', 'uColor']);

    this._initAtlas();
    this._initCloudTex();
    this._initQuad();
    this._initSelection();

    this.dynBuf = new YC.MeshBuf(24000);   /* パーティクル・手に持つブロック用 */
    this.dynGL = this._createDynamic();
    this.handGL = this._createDynamic();

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.clearColor(0.5, 0.7, 1, 1);
  }

  Renderer.prototype._shader = function (type, src) {
    var gl = this.gl;
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('シェーダの コンパイル失敗: ' + gl.getShaderInfoLog(s) + '\n' + src);
    }
    return s;
  };
  Renderer.prototype._program = function (vs, fs) {
    var gl = this.gl;
    var p = gl.createProgram();
    gl.attachShader(p, this._shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, this._shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('プログラムのリンク失敗: ' + gl.getProgramInfoLog(p));
    }
    return p;
  };
  Renderer.prototype._uniforms = function (p, names) {
    var gl = this.gl, o = {};
    for (var i = 0; i < names.length; i++) o[names[i]] = gl.getUniformLocation(p, names[i]);
    return o;
  };

  /* ブロックのテクスチャを 2D 配列テクスチャへ */
  Renderer.prototype._initAtlas = function () {
    var gl = this.gl;
    var data = B.buildTextures();
    var TS = B.TS, n = data.length;
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    var levels = Math.log2(TS) + 1;
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, TS, TS, n);
    for (var i = 0; i < n; i++) {
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, TS, TS, 1, gl.RGBA, gl.UNSIGNED_BYTE, data[i]);
    }
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    /* 縮小は線形（遠くの地面がブロックごとに色がとぶ＝市松模様になるのを防ぐ）、
       拡大は NEAREST（近くはドット絵のまま）。配列テクスチャなので層をまたいでにじまない。 */
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.atlas = tex;
  };

  Renderer.prototype._initCloudTex = function () {
    var gl = this.gl;
    var S = 128;
    var n1 = new YC.Noise(1234), n2 = new YC.Noise(5678);
    var d = new Uint8Array(S * S * 4);
    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        /* 端がつながるように 4 隅を混ぜる */
        var fx = x / S, fy = y / S;
        var v = 0, wsum = 0;
        for (var ox = 0; ox <= 1; ox++) {
          for (var oy = 0; oy <= 1; oy++) {
            var w = (ox ? fx : 1 - fx) * (oy ? fy : 1 - fy);
            var sx = (fx - ox) * S, sy = (fy - oy) * S;
            v += w * n1.fbm2(sx * 0.055, sy * 0.055, 4);
            wsum += w;
          }
        }
        v /= wsum;
        var a = v > 0.03 ? Math.min(1, (v - 0.03) * 6) : 0;
        /* マイクラの雲らしく、階段状のかたまりにする */
        a = a > 0.42 ? 1 : (a > 0.14 ? 0.88 : 0);
        var i = (y * S + x) * 4;
        d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = (a * 255) | 0;
      }
    }
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    /* 拡大は NEAREST。マイクラの雲のように角がきっぱり出る */
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.generateMipmap(gl.TEXTURE_2D);
    this.cloudTex = t;
  };

  Renderer.prototype._initQuad = function () {
    var gl = this.gl;
    this.quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.quadVAO);
    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  };

  /* 選択中のブロックのわく（細い直方体 12 本） */
  Renderer.prototype._initSelection = function () {
    var gl = this.gl;
    var t = 0.018, e = 0.0025;
    var verts = [], idx = [];
    function box(x0, y0, z0, x1, y1, z1) {
      var base = verts.length / 3;
      var p = [
        [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
        [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]
      ];
      for (var i = 0; i < 8; i++) verts.push(p[i][0], p[i][1], p[i][2]);
      var f = [0, 1, 2, 0, 2, 3, 5, 4, 7, 5, 7, 6, 4, 0, 3, 4, 3, 7, 1, 5, 6, 1, 6, 2, 3, 2, 6, 3, 6, 7, 4, 5, 1, 4, 1, 0];
      for (var j = 0; j < f.length; j++) idx.push(base + f[j]);
    }
    var a = -e, b2 = 1 + e;
    var edges = [
      [a, a, a, b2, a + t, a + t], [a, b2 - t, a, b2, b2, a + t],
      [a, a, b2 - t, b2, a + t, b2], [a, b2 - t, b2 - t, b2, b2, b2],
      [a, a, a, a + t, b2, a + t], [b2 - t, a, a, b2, b2, a + t],
      [a, a, b2 - t, a + t, b2, b2], [b2 - t, a, b2 - t, b2, b2, b2],
      [a, a, a, a + t, a + t, b2], [b2 - t, a, a, b2, a + t, b2],
      [a, b2 - t, a, a + t, b2, b2], [b2 - t, b2 - t, a, b2, b2, b2]
    ];
    for (var i = 0; i < edges.length; i++) {
      var ed = edges[i];
      box(ed[0], ed[1], ed[2], ed[3], ed[4], ed[5]);
    }
    this.selVAO = gl.createVertexArray();
    gl.bindVertexArray(this.selVAO);
    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    var ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.selCount = idx.length;
  };

  Renderer.prototype._createDynamic = function () {
    var gl = this.gl;
    var o = { vao: gl.createVertexArray(), vbo: gl.createBuffer(), ibo: gl.createBuffer(), count: 0, cap: 0, icap: 0 };
    gl.bindVertexArray(o.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, o.vbo);
    this._attribs();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, o.ibo);
    gl.bindVertexArray(null);
    return o;
  };

  Renderer.prototype._attribs = function () {
    var gl = this.gl, S = YC.VSTRIDE;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.UNSIGNED_SHORT, false, S, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.UNSIGNED_BYTE, true, S, 14);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, S, 16);
  };

  /* チャンクのメッシュを GPU に送る */
  Renderer.prototype.uploadChunk = function (chunk) {
    var gl = this.gl;
    var md = chunk.meshData;
    if (!md) return;
    if (!chunk.gl) chunk.gl = {};
    var buckets = ['opaque', 'cutout', 'trans'];
    for (var i = 0; i < buckets.length; i++) {
      var name = buckets[i];
      var data = md[name];
      var cur = chunk.gl[name];
      if (!data) {
        if (cur) { this._freeBucket(cur); chunk.gl[name] = null; }
        continue;
      }
      if (!cur) {
        cur = { vao: gl.createVertexArray(), vbo: gl.createBuffer(), ibo: gl.createBuffer(), count: 0 };
        gl.bindVertexArray(cur.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, cur.vbo);
        this._attribs();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cur.ibo);
        gl.bindVertexArray(null);
        chunk.gl[name] = cur;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, cur.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, data.verts, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cur.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.idx, gl.STATIC_DRAW);
      cur.count = data.count;
    }
    chunk.meshData = null;   /* CPU 側は捨ててメモリを節約 */
  };

  Renderer.prototype._freeBucket = function (b) {
    var gl = this.gl;
    gl.deleteBuffer(b.vbo); gl.deleteBuffer(b.ibo); gl.deleteVertexArray(b.vao);
  };
  Renderer.prototype.freeChunk = function (chunk) {
    if (!chunk.gl) return;
    var self = this;
    ['opaque', 'cutout', 'trans'].forEach(function (n) {
      if (chunk.gl[n]) self._freeBucket(chunk.gl[n]);
    });
    chunk.gl = null;
  };

  Renderer.prototype.resize = function (w, h, dpr) {
    var gl = this.gl;
    this.canvas.width = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.aspect = this.canvas.width / this.canvas.height;
  };

  /* 視錐台の 6 平面を取り出す */
  Renderer.prototype._extractPlanes = function (m) {
    var p = this.planes;
    function set(i, a, b, c, d) {
      var len = Math.sqrt(a * a + b * b + c * c) || 1;
      p[i * 4] = a / len; p[i * 4 + 1] = b / len; p[i * 4 + 2] = c / len; p[i * 4 + 3] = d / len;
    }
    set(0, m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]);
    set(1, m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);
    set(2, m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]);
    set(3, m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);
    set(4, m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]);
    set(5, m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]);
  };

  Renderer.prototype._boxVisible = function (x0, y0, z0, x1, y1, z1) {
    var p = this.planes;
    for (var i = 0; i < 6; i++) {
      var a = p[i * 4], b = p[i * 4 + 1], c = p[i * 4 + 2], d = p[i * 4 + 3];
      var vx = a > 0 ? x1 : x0, vy = b > 0 ? y1 : y0, vz = c > 0 ? z1 : z0;
      if (a * vx + b * vy + c * vz + d < 0) return false;
    }
    return true;
  };

  /* ---------- 1 フレーム描く ---------- */
  /* s: { cam:{x,y,z,yaw,pitch}, fov, sun, sunDir, sky:{zenith,horizon,fog}, night,
   *      chunks:[], time, renderDist, underwater, clouds, selection, particles, hand } */
  Renderer.prototype.render = function (s) {
    var gl = this.gl;
    var far = Math.max(64, s.renderDist * 16 + 32);
    M4.perspective(this.proj, s.fov * Math.PI / 180, this.aspect, 0.06, far * 1.7);
    M4.view(this.viewM, s.cam.x, s.cam.y, s.cam.z, s.cam.yaw, s.cam.pitch);
    M4.multiply(this.vp, this.proj, this.viewM);
    M4.invert(this.invVP, this.vp);
    this.lastCam = [s.cam.x, s.cam.y, s.cam.z];   /* 画面上の点から視線を逆算するのに使う */
    this._extractPlanes(this.vp);

    var fog = s.sky.fog;
    gl.clearColor(fog[0], fog[1], fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    /* --- 空 --- */
    if (!s.underwater) {
      gl.useProgram(this.progSky);
      gl.depthMask(false);
      gl.disable(gl.DEPTH_TEST);
      gl.uniformMatrix4fv(this.us.uInvVP, false, this.invVP);
      gl.uniform3f(this.us.uCam, s.cam.x, s.cam.y, s.cam.z);
      gl.uniform3f(this.us.uSunDir, s.sunDir[0], s.sunDir[1], s.sunDir[2]);
      gl.uniform3f(this.us.uZenith, s.sky.zenith[0], s.sky.zenith[1], s.sky.zenith[2]);
      gl.uniform3f(this.us.uHorizon, s.sky.horizon[0], s.sky.horizon[1], s.sky.horizon[2]);
      gl.uniform1f(this.us.uNight, s.night);
      gl.uniform1f(this.us.uMoonPhase, s.moonPhase || 0);
      gl.bindVertexArray(this.quadVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
    }

    /* --- 地形 --- */
    var fogNear = s.underwater ? 0.1 : far * 0.76;
    var fogFar = s.underwater ? 18 : far * 1.02;
    gl.useProgram(this.progChunk);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlas);
    gl.uniform1i(this.uc.uAtlas, 0);
    gl.uniformMatrix4fv(this.uc.uVP, false, this.vp);
    gl.uniform3f(this.uc.uCam, s.cam.x, s.cam.y, s.cam.z);
    gl.uniform1f(this.uc.uTime, s.time);
    gl.uniform1f(this.uc.uSun, s.sun);
    gl.uniform3f(this.uc.uFogColor, fog[0], fog[1], fog[2]);
    gl.uniform2f(this.uc.uFogRange, fogNear, fogFar);
    gl.uniform3f(this.uc.uTint, 1, 1, 1);
    gl.uniform1f(this.uc.uAlpha, 1);

    var visible = [];
    var i, c;
    for (i = 0; i < s.chunks.length; i++) {
      c = s.chunks[i];
      if (!c.gl) continue;
      var x0 = c.cx * 16, z0 = c.cz * 16;
      if (!this._boxVisible(x0, 0, z0, x0 + 16, c.maxY + 2, z0 + 16)) continue;
      visible.push(c);
    }
    this.chunkCount = visible.length;
    this.triCount = 0;

    /* 不透明 */
    gl.disable(gl.BLEND);
    gl.uniform1f(this.uc.uAlphaTest, 0);
    for (i = 0; i < visible.length; i++) this._drawBucket(visible[i].gl.opaque);
    /* 葉・ガラス・草花（アルファ抜き） */
    gl.uniform1f(this.uc.uAlphaTest, 0.5);
    for (i = 0; i < visible.length; i++) this._drawBucket(visible[i].gl.cutout);

    /* --- 雲 --- */
    if (s.clouds && !s.underwater) {
      gl.useProgram(this.progCloud);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.cloudTex);
      gl.uniform1i(this.ucl.uTex, 0);
      gl.uniformMatrix4fv(this.ucl.uVP, false, this.vp);
      gl.uniform3f(this.ucl.uCam, s.cam.x, s.cam.y, s.cam.z);
      gl.uniform2f(this.ucl.uCamXZ, s.cam.x, s.cam.z);
      gl.uniform1f(this.ucl.uY, 92);
      gl.uniform1f(this.ucl.uSize, far);
      gl.uniform1f(this.ucl.uTime, s.time);
      gl.uniform1f(this.ucl.uSun, Math.max(0.25, s.sun));
      gl.uniform3f(this.ucl.uFogColor, fog[0], fog[1], fog[2]);
      gl.uniform1f(this.ucl.uFade, far);
      gl.disable(gl.CULL_FACE);
      gl.bindVertexArray(this.quadVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.enable(gl.CULL_FACE);
      gl.depthMask(true);
      gl.useProgram(this.progChunk);
    }

    /* --- 水（半透明・奥から手前へ） --- */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.uniform1f(this.uc.uAlphaTest, 0);
    var water = [];
    for (i = 0; i < visible.length; i++) if (visible[i].gl.trans) water.push(visible[i]);
    water.sort(function (a, b) {
      var da = (a.cx * 16 + 8 - s.cam.x) * (a.cx * 16 + 8 - s.cam.x) + (a.cz * 16 + 8 - s.cam.z) * (a.cz * 16 + 8 - s.cam.z);
      var db = (b.cx * 16 + 8 - s.cam.x) * (b.cx * 16 + 8 - s.cam.x) + (b.cz * 16 + 8 - s.cam.z) * (b.cz * 16 + 8 - s.cam.z);
      return db - da;
    });
    gl.disable(gl.CULL_FACE);
    for (i = 0; i < water.length; i++) this._drawBucket(water[i].gl.trans);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);

    /* --- 選択中のブロックのわく --- */
    if (s.selection) {
      gl.useProgram(this.progLine);
      M4.translate(this.model, s.selection.x, s.selection.y, s.selection.z);
      gl.uniformMatrix4fv(this.ul.uVP, false, this.vp);
      gl.uniformMatrix4fv(this.ul.uModel, false, this.model);
      gl.uniform4f(this.ul.uColor, 0, 0, 0, 0.62);
      gl.bindVertexArray(this.selVAO);
      gl.enable(gl.BLEND);
      gl.drawElements(gl.TRIANGLES, this.selCount, gl.UNSIGNED_SHORT, 0);
      gl.useProgram(this.progChunk);
    }

    /* --- 破片（パーティクル） --- */
    if (s.particles && s.particles.nv > 0) {
      this._uploadDynamic(this.dynGL, s.particles);
      gl.uniform1f(this.uc.uAlphaTest, 0.5);
      gl.uniform1f(this.uc.uTime, 0);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      this._drawBucket(this.dynGL);
      gl.enable(gl.CULL_FACE);
    }

    /* --- 手に持っているブロック --- */
    if (s.hand && s.hand.mesh && s.hand.mesh.nv > 0) {
      gl.clear(gl.DEPTH_BUFFER_BIT);
      this._uploadDynamic(this.handGL, s.hand.mesh);
      var hvp = M4.create();
      M4.perspective(hvp, s.fov * Math.PI / 180, this.aspect, 0.02, 8);
      var mv = M4.create();
      M4.multiply(mv, hvp, s.hand.matrix);
      gl.uniformMatrix4fv(this.uc.uVP, false, mv);
      gl.uniform3f(this.uc.uCam, 0, 0, 0);
      gl.uniform2f(this.uc.uFogRange, 100, 200);
      gl.uniform1f(this.uc.uAlphaTest, 0.5);
      gl.uniform1f(this.uc.uSun, Math.max(s.sun, 0.35));
      gl.disable(gl.BLEND);
      this._drawBucket(this.handGL);
      gl.uniform2f(this.uc.uFogRange, fogNear, fogFar);
    }
    gl.bindVertexArray(null);
  };

  Renderer.prototype._drawBucket = function (b) {
    if (!b || !b.count) return;
    var gl = this.gl;
    gl.bindVertexArray(b.vao);
    gl.drawElements(gl.TRIANGLES, b.count, gl.UNSIGNED_INT, 0);
    this.triCount += b.count / 3;
  };

  Renderer.prototype._uploadDynamic = function (o, buf) {
    var gl = this.gl;
    gl.bindVertexArray(o.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, o.vbo);
    var vBytes = buf.nv * YC.VSTRIDE;
    gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(buf.ab, 0, vBytes), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, o.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, buf.idx.subarray(0, buf.ni), gl.DYNAMIC_DRAW);
    o.count = buf.ni;
  };

  YC.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
