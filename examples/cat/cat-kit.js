'use strict';
// The cat, its mug and their drawing construction, shared by cat-and-mug.html and cat-journey.html.
// Load after core.js, studio.js, cels.js, sketch.js, and after the film defines INK (ink colour) and P (pressure).
const MUG = svgCel({
  'mug/body': {d:'M -44 -96 C -46 -60 -44 -24 -38 -4 C -20 4 20 4 38 -4 C 44 -24 46 -60 44 -96', width:1.8, fill:'paper'},
  'mug/rim': {d:'M -44 -96 C -30 -106 30 -106 44 -96 C 30 -88 -30 -88 -44 -96 Z', width:1.5, fill:'paper'},
  'mug/tea': {d:'M -34 -95 C -20 -100 20 -100 34 -95', width:.9, opacity:.6},
  'mug/handle': {d:'M 44 -80 C 78 -84 80 -30 42 -28', width:1.7},
  'mug/stripe': {d:'M -45 -58 C -20 -52 20 -52 45 -58', width:1, opacity:.55},
}, {pressure:P});

// ---------- the cat: whole drawings as path data, one per key ----------
// Every stroke starts at the same landmark in every key and is resampled to N points,
// so inbetweenCel matches strokes by arc length. Front and three-quarter heads have
// different strokes: they are replacement drawings, not morphs.
const N = 32;
const f = v => v.toFixed(1);
function head(hx, hy, tilt, face, eyes) {
  const s = {}, c = Math.cos(tilt), n = Math.sin(tilt), pt = (x, y) => `${f(hx + x * c - y * n)} ${f(hy + x * n + y * c)}`;
  if (face === 'side') {
    s['head'] = {d:`M ${pt(-46,30)} C ${pt(-62,-8)} ${pt(-50,-48)} ${pt(-18,-58)} C ${pt(12,-66)} ${pt(46,-50)} ${pt(58,-22)} C ${pt(70,-2)} ${pt(62,22)} ${pt(40,36)} C ${pt(16,50)} ${pt(-24,50)} ${pt(-46,30)}`, width:2, fill:'paper'};
    s['ear/far'] = {d:`M ${pt(4,-60)} L ${pt(22,-98)} L ${pt(36,-52)}`, width:1.6, corner:.9};
    s['ear/near'] = {d:`M ${pt(-38,-44)} L ${pt(-30,-92)} L ${pt(-4,-60)}`, width:1.8, corner:.9};
    s['ear/inner'] = {d:`M ${pt(-30,-52)} L ${pt(-27,-78)} L ${pt(-14,-60)}`, width:.9, opacity:.6, corner:.9};
    s['nose'] = {d:`M ${pt(58,-6)} L ${pt(66,-2)} L ${pt(58,2)}`, width:1.4, corner:.9};
    s['mouth'] = {d:`M ${pt(60,4)} C ${pt(54,14)} ${pt(46,16)} ${pt(40,12)}`, width:1.1};
    s['eye'] = eyes === 'open'
      ? {d:`M ${pt(20,-24)} C ${pt(26,-32)} ${pt(38,-32)} ${pt(42,-22)} C ${pt(36,-16)} ${pt(26,-16)} ${pt(20,-24)}`, width:1.5, fill:INK}
      : {d:`M ${pt(20,-22)} C ${pt(28,-15)} ${pt(36,-15)} ${pt(42,-22)}`, width:1.7};
    s['whisker/1'] = {d:`M ${pt(50,6)} C ${pt(70,2)} ${pt(90,0)} ${pt(110,4)}`, width:.8, opacity:.75};
    s['whisker/2'] = {d:`M ${pt(48,10)} C ${pt(68,12)} ${pt(88,18)} ${pt(104,26)}`, width:.8, opacity:.75};
  } else {
    // front (k=0) and three-quarter (k=1) views share one construction, drawn separately
    const k = face === 'three' ? 1 : 0, sh = k * 16;
    s['head'] = {d:`M ${pt(-58+sh,10)} C ${pt(-62+sh,-34)} ${pt(-30+sh,-58)} ${pt(4+sh,-58)} C ${pt(40+sh,-58)} ${pt(64+sh*.6,-34)} ${pt(60+sh*.6,8)} C ${pt(56,40)} ${pt(28,52)} ${pt(0+sh*.5,52)} C ${pt(-30,52)} ${pt(-56+sh,38)} ${pt(-58+sh,10)}`, width:2, fill:'paper'};
    s['ear/far'] = {d:`M ${pt(22+sh,-56)} L ${pt(46+sh*.6,-96)} L ${pt(56+sh*.6,-40)}`, width:1.6, corner:.9};
    s['ear/near'] = {d:`M ${pt(-52+sh,-36)} L ${pt(-44+sh*1.2,-94)} L ${pt(-16+sh,-56)}`, width:1.8, corner:.9};
    s['ear/inner'] = {d:`M ${pt(-44+sh,-44)} L ${pt(-40+sh*1.2,-78)} L ${pt(-26+sh,-56)}`, width:.9, opacity:.6, corner:.9};
    s['nose'] = {d:`M ${pt(-6+sh,6)} L ${pt(6+sh,6)} L ${pt(0+sh,13)} Z`, width:1.3, corner:.9, fill:INK};
    s['mouth'] = {d:`M ${pt(-12+sh,20)} C ${pt(-6+sh,26)} ${pt(0+sh,22)} ${pt(0+sh,14)} C ${pt(0+sh,22)} ${pt(8+sh,26)} ${pt(14+sh,20)}`, width:1.1};
    const eye = (x, id, sq) => eyes === 'open'
      ? {d:`M ${pt(x-11*sq,-10)} C ${pt(x-6*sq,-19)} ${pt(x+6*sq,-19)} ${pt(x+11*sq,-10)} C ${pt(x+6*sq,-3)} ${pt(x-6*sq,-3)} ${pt(x-11*sq,-10)}`, width:1.5, fill:INK}
      : {d:`M ${pt(x-12*sq,-10)} C ${pt(x-5*sq,-3)} ${pt(x+5*sq,-3)} ${pt(x+12*sq,-10)}`, width:1.8};
    s['eye/l'] = eye(-24 + sh * 1.1, 'l', 1 - k * .25); s['eye/r'] = eye(24 + sh * .8, 'r', 1 - k * .1);
    s['whisker/1'] = {d:`M ${pt(22+sh,14)} C ${pt(42+sh,10)} ${pt(62+sh,8)} ${pt(84+sh,10)}`, width:.8, opacity:.75};
    s['whisker/2'] = {d:`M ${pt(-20+sh,14)} C ${pt(-40,10)} ${pt(-60,8)} ${pt(-82+sh*.6,10)}`, width:.8, opacity:.75};
  }
  return s;
}
// body: nape -> back -> rump; chest: throat -> front paw; the paw state changes the whole front.
const TAIL = {rest:'M -110 -6 C -170 -4 -214 -30 -200 -80 C -192 -106 -162 -106 -158 -86',
  flick:'M -110 -6 C -176 -12 -214 -58 -190 -112 C -174 -136 -144 -128 -146 -106',
  low:'M -110 -6 C -170 2 -236 -2 -252 -34 C -262 -56 -244 -68 -228 -58'};
const FRONT = {
  down: {chest:'M 72 -196 C 86 -170 84 -140 70 -110 C 60 -80 60 -40 64 -6', leg:'M 30 -120 C 30 -80 28 -40 28 -6', paw:'M 22 -4 C 40 2 66 2 78 -6', base:[80,-2]},
  raise:{chest:'M 80 -190 C 98 -166 104 -140 98 -120 C 110 -128 126 -140 132 -156', leg:'M 36 -112 C 60 -104 88 -116 104 -140', paw:'M 104 -140 C 112 -156 128 -164 136 -154', base:[70,-2]},
  reach:{chest:'M 96 -180 C 112 -150 118 -124 116 -104 C 140 -96 170 -88 196 -80', leg:'M 46 -110 C 90 -92 140 -78 184 -68', paw:'M 184 -68 C 196 -64 206 -72 204 -84', base:[70,-2]},
  push: {chest:'M 104 -176 C 124 -146 132 -120 132 -100 C 164 -90 204 -82 240 -76', leg:'M 54 -108 C 110 -88 170 -74 226 -64', paw:'M 226 -64 C 240 -60 250 -68 248 -80', base:[70,-2]},
};
function cat({head:[hx, hy], tilt = 0, face = 'side', front = 'down', tail = 'rest', eyes = 'open', lean = 0}) {
  const F = FRONT[front], s = {}, nape = [hx - 40 + lean * .3, hy + 34];
  s['tail'] = {d:TAIL[tail], width:1.9};
  const back = `M ${f(nape[0])} ${f(nape[1])} C ${f(nape[0] - 60)} ${f(nape[1] + 10)} ${f(-118 + lean * .2)} -150 -128 -88 C -138 -38 -110 -2 -60 0`;
  const throat = F.chest.match(/M (\S+) (\S+)/).slice(1).map(Number);
  s['body/fill'] = {d:`${back} L ${F.base[0]} ${F.base[1]} L ${throat[0]} ${throat[1]} L ${f(hx)} ${f(hy + 20)} Z`, width:.5, opacity:0, fill:'paper'};
  s['back'] = {d:back, width:2.1};
  s['thigh'] = {d:'M -30 -128 C -84 -118 -104 -60 -80 -14 C -70 -2 -40 0 -10 -2', width:1.5, opacity:.8};
  s['hindpaw'] = {d:'M -12 -3 C 4 2 26 2 34 -4', width:1.4, opacity:.8};
  s['chest'] = {d:F.chest, width:1.9, fill:'paper'};
  s['foreleg'] = {d:F.leg, width:1.7};
  s['forepaw'] = {d:F.paw, width:1.8};
  if (front !== 'down') s['farpaw'] = {d:'M 42 -118 C 50 -80 52 -40 56 -6 C 64 0 80 0 88 -6', width:1.5, opacity:.85};
  else s['farpaw'] = {d:'M 60 -100 C 66 -70 70 -40 74 -8 C 80 -2 90 -2 96 -8', width:1.2, opacity:.55};
  Object.assign(s, head(hx, hy, tilt, face, eyes));
  return s;
}
const KEYS = {
  sit:   cat({head:[40,-250]}),
  blink: cat({head:[40,-250], eyes:'shut'}),
  look:  cat({head:[62,-238], tilt:.30, lean:10}),
  raise: cat({head:[70,-232], tilt:.36, front:'raise', lean:20, tail:'flick'}),
  reach: cat({head:[92,-226], tilt:.30, front:'reach', lean:40, tail:'flick'}),
  push:  cat({head:[104,-222], tilt:.26, front:'push', lean:50, tail:'low'}),
  watch: cat({head:[70,-240], tilt:.62, lean:14, tail:'low'}),
  three: cat({head:[56,-248], tilt:.10, face:'three', tail:'rest'}),
  cam:   cat({head:[44,-252], face:'front', tail:'rest'}),
  camshut: cat({head:[44,-252], face:'front', tail:'rest', eyes:'shut'}),
};
const RAW = Object.fromEntries(Object.entries(KEYS).map(([k, v]) => [k, svgCel(v, {pressure:P, points:N})]));
