// C단계 운영 준비 테스트: SEO, 배포 구조, 경계값 및 UI 계약을 정적으로 검증합니다.
// 실제 브라우저/스마트폰/Vercel 네트워크 테스트를 대신하지 않습니다.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const rootHtml = read('index.html');
const html = read('salary/index.html');
const css = read('assets/css/common.css');
const js = read('salary/calculator.js');
const configSrc = read('data/app-config.js');
const manifestSrc = read('data/tax-table-manifest.js');

// SEO: title/description/viewport 단일성, canonical은 확인된 현재 배포 URL 사용, 제목 계층.
for (const [source, label] of [[rootHtml, '루트 페이지'], [html, '계산기 페이지']]) {
  assert.strictEqual((source.match(/<title\b/gi) || []).length, 1, `${label}: title 중복`);
  assert.strictEqual((source.match(/<meta\s+name="description"/gi) || []).length, 1, `${label}: description 중복`);
  assert.strictEqual((source.match(/<meta\s+name="viewport"/gi) || []).length, 1, `${label}: viewport 중복`);
  assert(/<h1\b/i.test(source), `${label}: h1 누락`);
}
assert(html.includes('https://2026-pay-calculator.vercel.app/salary/'));
assert(rootHtml.includes('<meta http-equiv="refresh" content="0; url=./salary/">'));
assert(!/<link\s+rel="canonical"/i.test(rootHtml), '루트 리디렉션 페이지에는 canonical이 없어야 함');
assert(html.includes('href="../assets/css/common.css"'));
assert(html.includes('<script src="../data/tax-table-manifest.js"></script>'));
assert(!html.includes('<script src="../data/income-tax-2026.js"></script>'));
assert(!html.includes('<script src="../data/payroll-rules-2026.js"></script>'));
assert(!html.toLowerCase().includes('<iframe'));
assert(!/adsbygoogle|pagead2\.googlesyndication|adsense/i.test(html + rootHtml));
assert(rootHtml.includes('href="./salary/"'));
console.log('C-stage SEO metadata, canonical, URL and no-ad/no-iframe checks passed.');

// Config: default must be boolean false; runtime setting must only accept boolean true.
const configCtx = { window: {} };
vm.createContext(configCtx);
vm.runInContext(configSrc, configCtx);
assert.strictEqual(configCtx.window.APP_CONFIG.features.enableAdvancedInsuranceInput, false);
assert.strictEqual(typeof configCtx.window.APP_CONFIG.features.enableAdvancedInsuranceInput, 'boolean');
function makeContext(configValue) {
  const elements = {};
  const doc = {
    getElementById(id) { return elements[id] || (elements[id] = { hidden: true, value: '', textContent: '', innerHTML: '', disabled: false, placeholder: '', style: {}, setAttribute() {}, addEventListener() {}, querySelector() { return { textContent: '' }; } }); },
    querySelector() { return { value: '1' }; }, querySelectorAll() { return []; },
    createElement() { return {}; }, head: { appendChild() {} }
  };
  const ctx = { window: { APP_CONFIG: { features: { enableAdvancedInsuranceInput: configValue } } }, document: doc, Intl, console };
  vm.createContext(ctx);
  vm.runInContext(read('data/payroll-rules-2026.js'), ctx);
  vm.runInContext(read('data/income-tax-2026.js'), ctx);
  let src = js.replace(/\n\}\)\(\);\s*$/, '\n  window.__test={calculate,validate,validateAdvancedInputs,advancedEnabled};\n})();');
  vm.runInContext(src, ctx);
  return ctx.window.__test;
}
const disabled = makeContext(false);
const stringTrue = makeContext('true');
const enabled = makeContext(true);
assert.strictEqual(disabled.advancedEnabled, false);
assert.strictEqual(stringTrue.advancedEnabled, false, '문자열 true는 기능을 켜면 안 됨');
assert.strictEqual(enabled.advancedEnabled, true);
const input = { month:'2026-10', gross:3000000, nontax:0, dependents:1, children:0, withholding:1 };
const auto = disabled.calculate(input);
const offManualValues = disabled.calculate({ ...input, pensionMode:'manual', pensionBaseManual:1000000, healthMode:'manual', healthBaseManual:1000000 });
assert.strictEqual(offManualValues.pension, auto.pension);
assert.strictEqual(offManualValues.health, auto.health);
assert.strictEqual(enabled.validateAdvancedInputs({ ...input, pensionMode:'manual', pensionBaseManual:1000000, healthMode:'manual', healthBaseManual:1000000 }).length, 0);
assert(enabled.validateAdvancedInputs({ ...input, pensionMode:'manual', pensionBaseManual:-1, healthMode:'manual', healthBaseManual:-1 }).length >= 2);
console.log('C-stage boolean Config, OFF-value isolation and advanced-input validation checks passed.');

// 원천징수·자녀 수·1,000만원 초과·국민연금 상하한 대표 경계값.
const calc = enabled;
const result80 = calc.calculate({ ...input, withholding:0.8 });
const result100 = calc.calculate({ ...input, withholding:1 });
const result120 = calc.calculate({ ...input, withholding:1.2 });
assert(result80.incomeTax <= result100.incomeTax);
assert(result100.incomeTax <= result120.incomeTax);
const noChild = calc.calculate({ ...input, month:'2026-03', children:0 });
const oneChild = calc.calculate({ ...input, month:'2026-03', children:1 });
assert(oneChild.incomeTax <= noChild.incomeTax);
const beforeChildRule = calc.calculate({ ...input, month:'2026-02', children:1 });
const beforeChildRuleZero = calc.calculate({ ...input, month:'2026-02', children:0 });
assert.strictEqual(beforeChildRule.incomeTax, beforeChildRuleZero.incomeTax);
const tenMillion = calc.calculate({ ...input, gross:10000000, nontax:0 });
const overTenMillion = calc.calculate({ ...input, gross:10000001, nontax:0 });
assert(Number.isFinite(tenMillion.incomeTax));
assert(Number.isFinite(overTenMillion.incomeTax));
const pensionRulesCtx = { window: {} }; vm.createContext(pensionRulesCtx); vm.runInContext(read('data/payroll-rules-2026.js'), pensionRulesCtx);
const periods = pensionRulesCtx.window.PAYROLL_RULES_2026.pension.periods;
assert.strictEqual(periods.find(p => p.from === '2026-01-01').max, 6370000);
assert.strictEqual(periods.find(p => p.from === '2026-07-01').max, 6590000);
assert.strictEqual(calc.calculate({ ...input, gross:100000000, nontax:0 }).pension, calc.calculate({ ...input, gross:6590000, nontax:0 }).pension);
console.log('C-stage withholding, child adjustment, >10M salary and pension-cap boundary checks passed.');

// 오류 발생 시 기존 결과를 숨기는 코드 경로, 상세보기 접근성 및 모바일 CSS 계약.
assert(js.includes('$("result").hidden=true; $("error").hidden=false'));
assert(js.includes('setAttribute("aria-expanded",String(expanded))'));
assert(js.includes('if (requestId !== latestRequestId) return;'));
assert(css.includes('@media(max-width:420px)'));
assert(css.includes('min-height:48px'));
assert(css.includes('prefers-reduced-motion:reduce'));
assert(css.includes('overflow-x:auto'));
assert(html.includes('aria-expanded="false"'));
console.log('C-stage error-state, detail accessibility and responsive-layout contract checks passed.');
