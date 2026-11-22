// engine_cmp.cjs — before a newer Remotion replaces the shared drawing engine (04b_remotion.sh engine-upgrade), the same
// frames of this work folder's own video are drawn with the engine in use and with the new one, then compared (PSNR).
//   node engine_cmp.cjs <work>/remotion <old node_modules> <new node_modules> <out folder> [<scripts folder>]
// Each engine gets its own copy of the project (src and its config; public/ is shared through --public-dir), because the
// bundler resolves `remotion` from the project's own node_modules. A frame past the end of the video is skipped.
// Prints one line per frame and a last line «ENGINE_CMP same|different|failed …». Exit 0 same, 3 different, 1 failed.
// The pictures stay in <out folder> so the difference can be looked at.
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');

const [R, OLD, NEW, OUT, SK] = process.argv.slice(2);
if (!R || !OLD || !NEW || !OUT) { console.log('engine_cmp.cjs <remotion folder> <old node_modules> <new node_modules> <out> [scripts]'); process.exit(2); }
const MIN_DB = Number(process.env.ENGINE_CMP_MIN_DB || 45);   // the approved videos measured 60–113 dB between 4.0.527 and 4.0.545
const FRAMES = (process.env.ENGINE_CMP_FRAMES || '15,60,150,300,600,1200').split(',').map(Number);
const win = process.platform === 'win32';

function project(name, nm) {
  const d = path.join(OUT, name);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  fs.cpSync(path.join(R, 'src'), path.join(d, 'src'), { recursive: true });
  for (const f of ['package.json', 'tsconfig.json', 'remotion.config.ts']) if (fs.existsSync(path.join(R, f))) fs.copyFileSync(path.join(R, f), path.join(d, f));
  fs.symlinkSync(nm, path.join(d, 'node_modules'), 'junction');
  const cliDir = path.join(nm, '@remotion', 'cli');
  const bin = require(path.join(cliDir, 'package.json')).bin;
  const cli = path.join(cliDir, typeof bin === 'string' ? bin : bin.remotion);
  // Windows: node runs the CLI itself (no cmd.exe), with the loopback guard like 04b
  const pre = win && SK && fs.existsSync(path.join(SK, '_loopback.cjs')) ? ['--require', path.join(SK, '_loopback.cjs')] : [];
  return { d, run: (args) => spawnSync(process.execPath, [...pre, cli, ...args], { cwd: d, encoding: 'utf8', timeout: 600000, windowsHide: true }) };
}

function psnr(a, b) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', a, '-i', b, '-lavfi', 'psnr', '-f', 'null', '-'], { encoding: 'utf8', windowsHide: true });
  const m = /average:(inf|[\d.]+)/.exec(r.stderr || '');
  return m ? (m[1] === 'inf' ? Infinity : Number(m[1])) : null;
}

try {
  fs.mkdirSync(OUT, { recursive: true });
  const engines = { old: project('old', OLD), new: project('new', NEW) };
  const list = engines.old.run(['compositions', '--quiet']);
  const ids = (list.stdout || '').split(/\s+/).filter((x) => /^[\w-]+$/.test(x));
  const comp = ids.includes('Ad') ? 'Ad' : ids[0];
  if (!comp) { console.log('ENGINE_CMP failed: the old engine lists no video here'); console.log((list.stderr || '').split('\n').slice(-5).join('\n')); process.exit(1); }
  const pub = path.join(R, 'public');
  let compared = 0, worst = Infinity;
  for (const f of FRAMES) {
    const pics = {};
    for (const [k, e] of Object.entries(engines)) {
      const png = path.join(OUT, `${k}-${f}.png`);
      const r = e.run(['still', comp, png, `--frame=${f}`, '--log=error', ...(fs.existsSync(pub) ? [`--public-dir=${pub}`] : [])]);
      pics[k] = r.status === 0 && fs.existsSync(png) ? png : null;
      if (!pics[k]) pics[k + 'Err'] = ((r.stderr || '') + (r.stdout || '')).trim().split('\n').slice(-3).join(' | ');
    }
    if (!pics.old && !pics.new) { console.log(`frame ${f}: past the end (skipped)`); continue; }
    if (!pics.old || !pics.new) {
      console.log(`frame ${f}: ${pics.old ? 'the new engine' : 'the old engine'} did not draw it: ${pics.oldErr || pics.newErr}`);
      worst = -1; compared++; continue;
    }
    const db = psnr(pics.old, pics.new);
    if (db === null) { console.log(`ENGINE_CMP failed: ffmpeg could not compare frame ${f}`); process.exit(1); }
    console.log(`frame ${f}: ${db === Infinity ? 'identical' : db.toFixed(1) + ' dB'}`);
    worst = Math.min(worst, db); compared++;
  }
  if (!compared) { console.log('ENGINE_CMP failed: no frame was drawn'); process.exit(1); }
  if (worst >= MIN_DB) { console.log(`ENGINE_CMP same: ${compared} frames, the lowest ${worst === Infinity ? 'identical' : worst.toFixed(1) + ' dB'} (from ${MIN_DB})`); process.exit(0); }
  console.log(`ENGINE_CMP different: ${compared} frames, the lowest ${worst < 0 ? 'not drawn' : worst.toFixed(1) + ' dB'} (under ${MIN_DB}); the pictures: ${OUT}`);
  process.exit(3);
} catch (e) {
  console.log(`ENGINE_CMP failed: ${e.message}`);
  process.exit(1);
}
