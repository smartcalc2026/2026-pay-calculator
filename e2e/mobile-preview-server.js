// 휴대전화에서 실제 화면을 확인하기 위한 임시 로컬 네트워크 서버입니다.
// 기존 Playwright 서버(test-server.js)는 계속 127.0.0.1에만 바인딩합니다.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const projectRoot = path.resolve(__dirname, '..');
const port = Number(process.env.MOBILE_PREVIEW_PORT || 4180);
const isPrivateIPv4 = address =>
  /^10\./.test(address) ||
  /^192\.168\./.test(address) ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(address);

const addresses = Object.values(os.networkInterfaces()).flat().filter(Boolean);
const bindHost = process.env.MOBILE_PREVIEW_HOST ||
  addresses.find(item => item.family === 'IPv4' && !item.internal && isPrivateIPv4(item.address))?.address;

if (!bindHost || !isPrivateIPv4(bindHost)) {
  console.error('사설 IPv4 주소를 찾지 못했습니다. PC와 휴대전화가 같은 Wi-Fi에 연결되어 있는지 확인하세요.');
  process.exit(1);
}

const allowedRoots = ['salary', 'assets', 'data'].map(name => path.join(projectRoot, name));
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }

  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, `http://${bindHost}`).pathname); }
  catch { res.writeHead(400); res.end('Bad request'); return; }

  if (pathname === '/') pathname = '/salary/';
  if (pathname === '/salary') pathname = '/salary/';

  let target = path.resolve(projectRoot, `.${pathname}`);
  const isAllowed = filePath => allowedRoots.some(root =>
    filePath === root || filePath.startsWith(root + path.sep));
  if (!isAllowed(target)) { res.writeHead(403); res.end('Forbidden'); return; }
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');

  fs.realpath(target, (realPathError, realTarget) => {
    if (realPathError || !isAllowed(realTarget)) { res.writeHead(404); res.end('Not found'); return; }
    fs.stat(realTarget, (statError, stat) => {
      if (statError || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, {
        'Content-Type': mimeTypes[path.extname(realTarget).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(realTarget).pipe(res);
    });
  });
});

server.listen(port, bindHost, () => {
  console.log(`로컬 미리보기 서버 실행 중: http://${bindHost}:${port}/salary/`);
  console.log('중지하려면 이 창에서 Ctrl+C를 누르세요.');
});
