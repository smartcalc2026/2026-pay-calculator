// 전체 자동 테스트 실행기
// 프로젝트 루트에서 `node tests/run-all-tests.js`를 실행하면 각 테스트를 올바른 작업 폴더에서 순서대로 실행합니다.
// 각 파일의 성공 메시지와 종료 코드를 그대로 출력하고, 테스트 묶음별 통과/실패 수를 집계합니다.
const { spawnSync } = require('child_process');
const path = require('path');

const testDir = __dirname;
const projectRoot = path.resolve(testDir, '..');
const suites = ['test-calculator.js', 'test-operations.js', 'test-full-audit.js'];
let passed = 0;
let failed = 0;

for (const suite of suites) {
  console.log(`\n===== 실행: ${suite} =====`);
  const result = spawnSync(process.execPath, [path.join(testDir, suite)], {
    cwd: testDir,
    encoding: 'utf8'
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.status !== 0) {
    failed += 1;
    console.error(`결과: 실패 (${suite}, 종료 코드 ${result.status ?? '실행 오류'})`);
  } else {
    passed += 1;
    console.log(`결과: 통과 (${suite})`);
  }
}

const notRun = suites.length - passed - failed;
console.log('\n===== 테스트 묶음 집계 =====');
console.log(`통과: ${passed}`);
console.log(`실패: ${failed}`);
console.log(`미실행: ${notRun}`);
console.log(`전체: ${suites.length}`);
console.log(`프로젝트 루트: ${projectRoot}`);
if (failed > 0 || notRun > 0) process.exitCode = 1;
