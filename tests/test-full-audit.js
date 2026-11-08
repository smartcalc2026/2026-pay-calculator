// 체계적 전수검사: 세액표 구간 전체, 이산 입력 조합, 연봉 역산 최소 조건.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const makeElement = () => ({ value: '', hidden: true, textContent: '', innerHTML: '', style: {}, disabled: false, setAttribute() {}, addEventListener() {}, querySelector: () => makeElement() });
const elements = new Proxy({}, { get: (target, key) => target[key] || (target[key] = makeElement()) });
const context = {
  window: {},
  document: { getElementById: id => elements[id], querySelector: () => ({ value: 'forward' }), querySelectorAll: () => [] },
  Intl,
  console
};
vm.createContext(context);
for (const file of ['data/payroll-rules-2026.js', 'data/income-tax-2026.js', 'data/tax-table-manifest.js']) vm.runInContext(read(file), context);
let calculatorSource = read('salary/calculator.js');
calculatorSource = calculatorSource.replace(/\n\}\)\(\);\s*$/, '\n  window.__audit={baseIncomeTax,calculate,validate,findRequiredGross,childDeduction,calculatePension,calculateHealth,calculateLongTerm,calculateEmployment};\n})();');
vm.runInContext(calculatorSource, context);
const C = context.window.__audit;
const T = context.window.INCOME_TAX_2026;

// 적용월은 화면 선택이 아닌 숨김 값이며, 원천징수율은 숨김 필드 100% 고정이다.
const html = read('salary/index.html');
assert.match(html, /<input id="month" type="hidden">/);
assert.match(html, /<input type="hidden" name="withholding" value="1">/);
assert.doesNotMatch(html, /<select[^>]*name="withholding"|<input(?![^>]*type="hidden")(?=[^>]*name="withholding")/i);

// 646개 세액 구간의 양 끝값과 11개 가족 수 열을 실제 계산 함수로 전부 통과한다.
let taxChecks = 0;
for (const row of T.rows) {
  const points = [row.min * 1000, row.max * 1000 - 1].filter(value => value < 10_000_000);
  for (const salary of points) {
    for (let dependents = 1; dependents <= 11; dependents += 1) {
      assert.equal(C.baseIncomeTax(salary, dependents), row.tax[dependents - 1] ?? 0, `표 구간 ${row.min}~${row.max}, 급여 ${salary}, 가족 ${dependents}`);
      taxChecks += 1;
    }
  }
}
assert.equal(taxChecks, T.rows.reduce((sum, row) => sum + (row.min * 1000 < 10_000_000 ? 2 : 0) * 11, 0));

// 1천만원 초과 계산의 누진 구간 전환 전후를 11개 가족 수 모두 확인한다.
const highIncomeBoundaries = [10_000_000, ...T.overTenMillion.tiers.map(tier => tier.max).filter(Number.isFinite)];
for (const boundary of highIncomeBoundaries) {
  for (const salary of [boundary - 1, boundary, boundary + 1]) {
    if (salary < 10_000_000) continue;
    for (let dependents = 1; dependents <= 11; dependents += 1) {
      let expected;
      if (salary === 10_000_000) expected = T.tenMillion[dependents - 1];
      else {
        const tier = T.overTenMillion.tiers.find(item => salary <= item.max);
        assert(tier, `누진세율 구간 누락: ${salary}`);
        const raw = T.tenMillion[dependents - 1] + tier.add + (salary - tier.excessBase) * tier.multiply * tier.rate;
        expected = Math.floor(raw / 10) * 10;
      }
      assert.equal(C.baseIncomeTax(salary, dependents), expected, `1천만원 초과 급여 ${salary}, 가족 ${dependents}`);
    }
  }
}

// 국민연금 기준소득월액의 1천원 절사, 하한·상한 및 2026년 7월 변경 경계.
for (const [month, min, max] of [
  ['2026-01', 400_000, 6_370_000],
  ['2026-06', 400_000, 6_370_000],
  ['2026-07', 410_000, 6_590_000],
  ['2026-12', 410_000, 6_590_000]
]) {
  for (const salary of [min - 1, min, min + 1, max - 1, max, max + 1]) {
    const pensionBase = Math.min(max, Math.max(min, Math.floor(salary / 1000) * 1000));
    const expected = Math.floor((pensionBase * 475 / 10_000) / 10) * 10;
    assert.equal(C.calculatePension(salary, month), expected, `국민연금 경계 ${month}, 급여 ${salary}`);
  }
}

// 건강보험 하한·상한, 가입자 절반 부담, 장기요양·고용보험 공식을 경계 전후에서 확인한다.
const healthMinTotal = 20_160;
const healthMaxTotal = 9_183_480;
const firstHealthMinBase = Math.ceil(healthMinTotal * 10_000 / 719);
const firstHealthMaxBase = Math.ceil(healthMaxTotal * 10_000 / 719);
for (const salary of [0, firstHealthMinBase - 1, firstHealthMinBase, firstHealthMinBase + 1, firstHealthMaxBase - 1, firstHealthMaxBase, firstHealthMaxBase + 1]) {
  const totalPremium = Math.min(healthMaxTotal, Math.max(healthMinTotal, Math.floor(salary * 719 / 10_000)));
  const expectedHealth = Math.floor((totalPremium / 2) / 10) * 10;
  const health = C.calculateHealth(salary);
  assert.equal(health, expectedHealth, `건강보험 경계 급여 ${salary}`);
  assert.equal(C.calculateLongTerm(health), Math.floor((health * 9448 / 71900) / 10) * 10, `장기요양보험 급여 ${salary}`);
  assert.equal(C.calculateEmployment(salary), Math.floor((salary * 9 / 1000) / 10) * 10, `고용보험 급여 ${salary}`);
}

// 가족 1~11명과 각 가족 수에 허용되는 자녀 수 전체를 2026년 12개월 기준으로 검증한다.
let discreteInputChecks = 0;
for (let dependents = 1; dependents <= 11; dependents += 1) {
  for (let children = 0; children <= dependents; children += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const monthText = `2026-${String(month).padStart(2, '0')}`;
      const input = { month: monthText, gross: 3_000_000, nontax: 0, dependents, children, withholding: 1 };
      assert.deepEqual(Array.from(C.validate(input)), [], `유효 입력 거부: ${monthText}, 가족 ${dependents}, 자녀 ${children}`);
      const result = C.calculate(input);
      const expectedChildDeduction = month >= 3 ? C.childDeduction(children) : 0;
      assert.equal(result.childDeduction, expectedChildDeduction, `자녀 공제 시점: ${monthText}, 가족 ${dependents}, 자녀 ${children}`);
      assert.equal(result.net, input.gross - result.total, `실수령액 합계 일치: ${monthText}, 가족 ${dependents}, 자녀 ${children}`);
      discreteInputChecks += 1;
    }
  }
}
assert.equal(discreteInputChecks, 924);

// 입력 검증의 모든 작은 정수 범위와 숫자 형식 오류를 확인한다.
const validInput = { month: '2026-10', gross: 2_000_000, nontax: 0, dependents: 1, children: 0, withholding: 1 };
for (const [input, expectedPart] of [
  [{ ...validInput, gross: 0 }, '월 총급여액'],
  [{ ...validInput, gross: -1 }, '월 총급여액'],
  [{ ...validInput, gross: 1.5 }, '월 총급여액'],
  [{ ...validInput, gross: Number.NaN }, '월 총급여액'],
  [{ ...validInput, nontax: -1 }, '비과세액'],
  [{ ...validInput, nontax: 2_000_001 }, '비과세액은 총급여액보다'],
  [{ ...validInput, dependents: 0 }, '공제대상가족 수'],
  [{ ...validInput, dependents: 12 }, '공제대상가족 수'],
  [{ ...validInput, dependents: 1.5 }, '공제대상가족 수'],
  [{ ...validInput, children: -1 }, '8~20세 자녀 수'],
  [{ ...validInput, children: 2 }, '8~20세 자녀 수'],
  [{ ...validInput, children: 0.5 }, '8~20세 자녀 수'],
  [{ ...validInput, month: '2026-00' }, '적용월'],
  [{ ...validInput, month: '2027-01' }, '등록되어 있지 않습니다']
]) {
  assert(Array.from(C.validate(input)).some(message => message.includes(expectedPart)), `입력 오류를 거부하지 않음: ${JSON.stringify(input)}`);
}
assert.deepEqual(Array.from(C.validate({ ...validInput, nontax: validInput.gross })), [], '비과세액이 총급여와 같은 입력은 허용되어야 함');

// 역산은 목표를 만족하는 가장 낮은 월 급여를 찾아야 한다. 바로 1원 낮추면 목표 미달이어야 한다.
const reverseBase = { month: '2026-10', gross: 1, nontax: 0, dependents: 1, children: 0, withholding: 1 };
for (const targetNet of [3_000_000, 60_000_000, 400_000_000]) {
  const reverse = C.findRequiredGross(targetNet, reverseBase);
  assert(reverse.result.net >= targetNet, `역산 결과가 목표 미달: ${targetNet}`);
  assert(C.calculate({ ...reverseBase, gross: reverse.gross - 1 }).net < targetNet, `역산 결과가 최소 급여가 아님: ${targetNet}`);
}
assert.throws(() => C.findRequiredGross(999_999_999, reverseBase), /현재 계산 가능 범위를 초과합니다/);

console.log(`Full audit checks passed: ${taxChecks} tax-table boundaries, ${highIncomeBoundaries.length} high-income transition points, ${discreteInputChecks} family/child/month combinations, insurance boundaries, invalid-input cases, and reverse minimum boundaries.`);
