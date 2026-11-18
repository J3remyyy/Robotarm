// Offline checks against the supplied axis document; never accesses USB or cameras.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, 'robot-control-3d.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const noop = () => {};
const context = new Proxy({}, { get: () => noop });
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    value: '', checked: true, textContent: '', style: {}, dataset: {},
    classList: { toggle: noop }, append: noop, setAttribute: noop,
    addEventListener: noop, getContext: () => context,
    getBoundingClientRect: () => ({ width: 1000, height: 750, left: 0, top: 0 }),
  });
  return elements.get(id);
}
const sandbox = {
  console, TextEncoder, TextDecoder,
  document: { getElementById: element, createElement: () => element(Symbol()),
    querySelectorAll: () => [], addEventListener: noop },
  window: { addEventListener: noop }, navigator: {}, devicePixelRatio: 1,
  ResizeObserver: class { observe() {} }, requestAnimationFrame: noop,
  setInterval: fn => { sandbox.serialTick = fn; }, performance: { now: () => 0 },
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const read = code => { const value = vm.runInContext(code, sandbox); return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); };
const close = (actual, expected, tolerance = .4) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
assert.deepEqual(read('AXES.map(a=>a.slice(1))'),
  [[800,3450],[900,3200],[1000,3050],[900,3200],[180,3900],[1230,2600]]);
assert.deepEqual(read('NEUTRAL'), [1929,2044,2093,2044,2056,2445]);
for (let i = 0; i < 6; i++) {
  assert.equal(read(`raw(${i},angle(${i},0))`), 0);
  assert.equal(read(`raw(${i},angle(${i},4095))`), 4095);
}
// Coordinates from the documented example poses, using its Z mounting convention.
read("baseAxis='z'");
for (const [pose, expected] of [
  [[1929,2044,2093,2044,2056,2445], [300,0,115]],
  [[1929,2044,48,2044,2056,2445], [0,0,415]],
  [[1929,3867,48,2044,2056,2445], [415,0,0]],
  [[1929,2044,2093,3867,2056,2445], [135,0,-50]],
  [[3511,2044,2093,2044,2056,2445], [0,300,115]],
  [[346,2044,2093,2044,2056,2445], [0,-300,115]],
]) read(`geometry(${JSON.stringify(pose)}).points[3]`).forEach((v,i)=>close(v,expected[i]));
for (let i=1;i<=3;i++) close(read(`V.len(V.sub(geometry(NEUTRAL).points[${i}],geometry(NEUTRAL).points[${i-1}]))`), [115,135,165][i-1], .001);
close(read('90-angle(2,0)'),182.109375,.001);
close(read('90-angle(2,4095)'),1.93359375,.001);
close(read('angle(0,3511)'),90,.06);
close(read('angle(0,346)'),-90,.06);
assert.equal(read("(()=>{const v=NEUTRAL.slice();v[2]=4096;return front(v,false)})()"),false);
// Axis 6 must move only one jaw; L3 already includes the gripper.
const jaws = read(`(()=>{const closed=NEUTRAL.slice(),open=NEUTRAL.slice();closed[5]=0;open[5]=4095;return {closed:jawGeometry(closed),open:jawGeometry(open),wrist:geometry(NEUTRAL).points[2]}})()`);
assert.deepEqual(jaws.closed.fixed, jaws.open.fixed);
assert.ok(Math.hypot(...jaws.closed.moving[2].map((v,i)=>v-jaws.open.moving[2][i])) > 1);
close(Math.hypot(...jaws.closed.fixed[2].map((v,i)=>v-jaws.wrist[i])),Math.hypot(165,12),.001);
close(read('angle(5,2445)'),0,.03);
// Ordinary POS replies must not unlock movement; the explicit read must do so.
read('connected=true;ready=false;positionSynced=false;pending={command:"?",time:Date.now()};handleLine("POS "+NEUTRAL.join(" "));setPose(START);');
assert.equal(read('positionSynced'),false);
assert.equal(read('poseMotion'),null);
read('syncReading=true;pending={command:"?",sync:true,time:Date.now()};handleLine("POS "+NEUTRAL.join(" "))');
assert.equal(read('positionSynced'),true);
assert.deepEqual(read('pose'),read('NEUTRAL'));
read("handleLine('ERR test')");
assert.equal(read('positionSynced'),false);
// Hidden props cannot still be picked, gripped or rendered.
read('connected=false;propsVisible=false;polygons=[];workspace()');
assert.equal(read('polygons.length'),0);
assert.equal(read('graspCandidate(pose)'),null);
read('propsVisible=true;baseAxis="x"');
console.log('Passed: six calibrated ranges, neutral pose, six documented poses, link lengths, elbow limits, USB synchronization gate and hidden props.');
