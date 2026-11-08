const assert=require('assert');
const fs=require('fs'), vm=require('vm');
const ids=['result','net','summary','detail','toggle-detail','salary-form','gross','nontax','month','dependents','children','error'];
const els={};
for(const id of ids) els[id]={hidden:true,value:'',textContent:'',innerHTML:'',setAttribute(){},addEventListener(){}};
const ctx={window:{},document:{getElementById:id=>els[id],querySelector:()=>({value:'1'}),querySelectorAll:()=>[]},Intl,console};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('../data/payroll-rules-2026.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('../data/income-tax-2026.js','utf8'),ctx);
let calcSrc=fs.readFileSync('../salary/calculator.js','utf8');
calcSrc=calcSrc.replace(/\n\}\)\(\);\s*$/,'\n  window.__test={calculate,baseIncomeTax,calculateHealth,calculateEmployment,calculatePension,calculateLongTerm,calculateLocalTax,validate,periodFor};\n})();');
vm.runInContext(calcSrc,ctx);
const C=ctx.window.__test;
const T=ctx.window.INCOME_TAX_2026;

// 적용월 유효성 검사: 정상적인 YYYY-MM은 허용하고 잘못된 월 형식은 거부
assert.deepStrictEqual(Array.from(C.validate({month:'2026-01',gross:2000000,nontax:0,dependents:1,children:0})), []);
assert.deepStrictEqual(Array.from(C.validate({month:'2026-12',gross:2000000,nontax:0,dependents:1,children:0})), []);
assert.strictEqual(C.periodFor('2026-01').max,6370000);
assert.strictEqual(C.periodFor('2026-07').max,6590000);
assert.strictEqual(C.periodFor('2026-13'),null);
assert(C.validate({month:'2026-13',gross:2000000,nontax:0,dependents:1,children:0}).includes('적용월을 올바르게 선택하세요.'));
assert(C.validate({month:'2026-1',gross:2000000,nontax:0,dependents:1,children:0}).includes('적용월을 올바르게 선택하세요.'));
assert(C.validate({month:'2027-01',gross:2000000,nontax:0,dependents:1,children:0}).some(x=>x.includes('현재 등록된 계산 기준은 2026년')));

// 간이세액표 데이터 무결성
assert.strictEqual(T.rows.length,646);
assert.strictEqual(T.rows[0].min,770);
assert.strictEqual(T.rows.at(-1).max,10000);
assert.deepStrictEqual(Array.from(T.tenMillion),[1507400,1431570,1200840,1170840,1140840,1110840,1080840,1050840,1020840,990840,960840]);
assert.strictEqual(T.rows.find(r=>4370>=r.min&&4370<r.max).tax[0],244020);
assert.strictEqual(T.rows.find(r=>3500>=r.min&&3500<r.max).tax[0],127220);
assert.strictEqual(T.effectiveFrom,'2026-01-01');
assert.strictEqual(ctx.window.PAYROLL_RULES_2026.incomeTax.tableEffectiveFrom,'2026-01-01');
assert.strictEqual(ctx.window.PAYROLL_RULES_2026.incomeTax.childAdjustmentEffectiveFrom,'2026-03-01');
assert.strictEqual(T.childAdjustment.one,20830); assert.strictEqual(T.childAdjustment.two,45830); assert.strictEqual(T.childAdjustment.extra,33330);

// STEP 5: 2026-10 / 비과세 0 / 가족 1 / 자녀 0 / 100%
const expected={
  2000000:{pension:95000,health:71900,care:9440,employment:18000,incomeTax:19520,local:1950,total:215810,net:1784190},
  3000000:{pension:142500,health:107850,care:14170,employment:27000,incomeTax:74350,local:7430,total:373300,net:2626700},
  4000000:{pension:190000,health:143800,care:18890,employment:36000,incomeTax:195960,local:19590,total:604240,net:3395760},
  4370000:{pension:207570,health:157100,care:20640,employment:39330,incomeTax:244020,local:24400,total:693060,net:3676940},
  5000000:{pension:237500,health:179750,care:23620,employment:45000,incomeTax:335470,local:33540,total:854880,net:4145120},
  7000000:{pension:313020,health:251650,care:33060,employment:63000,incomeTax:732700,local:73270,total:1466700,net:5533300},
  10000000:{pension:313020,health:359500,care:47240,employment:90000,incomeTax:1507400,local:150740,total:2467900,net:7532100}
};
for(const [gross,exp] of Object.entries(expected)){
  const r=C.calculate({month:'2026-10',gross:+gross,nontax:0,dependents:1,children:0,withholding:1});
  for(const k of Object.keys(exp)) assert.strictEqual(r[k],exp[k],`${gross} ${k}`);
}


// 2026년 1~2월과 3~12월은 동일한 간이세액표를 사용하되, 자녀 공제는 3월부터 적용
const janChild=C.calculate({month:'2026-01',gross:5000000,nontax:0,dependents:1,children:1,withholding:1});
const febChild=C.calculate({month:'2026-02',gross:5000000,nontax:0,dependents:1,children:1,withholding:1});
const marChild=C.calculate({month:'2026-03',gross:5000000,nontax:0,dependents:1,children:1,withholding:1});
assert.strictEqual(janChild.taxBase,335470); assert.strictEqual(febChild.taxBase,335470); assert.strictEqual(marChild.taxBase,335470);
assert.strictEqual(janChild.incomeTax,335470); assert.strictEqual(febChild.incomeTax,335470); assert.strictEqual(marChild.incomeTax,314640);
assert.strictEqual(janChild.childDeduction,0); assert.strictEqual(febChild.childDeduction,0); assert.strictEqual(marChild.childDeduction,20830);

// 1,000만원 초과 간이세액표 공식의 구간 경계 검증 (공식 별표2)
// 3,000만원 초과 구간은 초과 금액에 98%를 곱하지 않는다.
const overTax = [
  [10000000,1507400], [10000001,1532400], [10000999,1532740], [14000000,2904400], [28000000,8118000],
  [30000000,8902000], [30000001,8902000], [45000000,14902000],
  [45000001,14902000], [87000000,32542000], [87000001,32542000]
];
for (const [salary, tax] of overTax) assert.strictEqual(C.baseIncomeTax(salary,1),tax,`over-10m formula ${salary}`);

// 국민연금 적용월 경계: 1월은 상반기, 7월은 하반기 기준을 사용해야 함
const pensionJanCap=C.calculate({month:'2026-01',gross:7000000,nontax:0,dependents:1,children:0,withholding:1});
const pensionJunCap=C.calculate({month:'2026-06',gross:7000000,nontax:0,dependents:1,children:0,withholding:1});
const pensionJulCap=C.calculate({month:'2026-07',gross:7000000,nontax:0,dependents:1,children:0,withholding:1});
const pensionDecCap=C.calculate({month:'2026-12',gross:7000000,nontax:0,dependents:1,children:0,withholding:1});
assert.strictEqual(pensionJanCap.pension,302570);
assert.strictEqual(pensionJunCap.pension,302570);
assert.strictEqual(pensionJulCap.pension,313020);
assert.strictEqual(pensionDecCap.pension,313020);

// 부동소수점 회귀 테스트: 7,000,000 × 0.9% = 정확히 63,000원
assert.strictEqual(C.calculateEmployment(7000000),63000);
assert.strictEqual(C.calculateEmployment(3000000),27000);
assert.strictEqual(C.calculateHealth(63000),10080);
assert.strictEqual(C.calculateLongTerm(71900),9440);
assert.strictEqual(C.calculateLongTerm(359500),47240);
assert.strictEqual(C.calculateLongTerm(4591740),603370); // 건강보험 근로자 부담 상한에서 법정 비율 사용
assert.strictEqual(C.calculateLocalTax(19520),1950);

// 고급 입력 OFF에서는 전달된 직접입력값이 계산 결과에 영향을 주지 않아야 함
const autoOnly=C.calculate({month:'2026-10',gross:3000000,nontax:0,dependents:1,children:0,withholding:1,
  pensionMode:'manual',pensionBaseManual:1000000,healthMode:'manual',healthBaseManual:1000000});
const ordinary=C.calculate({month:'2026-10',gross:3000000,nontax:0,dependents:1,children:0,withholding:1});
assert.strictEqual(autoOnly.pension,ordinary.pension);
assert.strictEqual(autoOnly.health,ordinary.health);
// 적용기간 매니페스트는 검증된 2026년만 포함하며, 미래 데이터를 임의 생성하지 않음
const manifestCtx={window:{}};
vm.createContext(manifestCtx);
vm.runInContext(fs.readFileSync('../data/tax-table-manifest.js','utf8'),manifestCtx);
assert.strictEqual(manifestCtx.window.TAX_TABLE_MANIFEST.tables.length,1);
assert.strictEqual(manifestCtx.window.TAX_TABLE_MANIFEST.tables[0].year,2026);
assert.strictEqual(manifestCtx.window.TAX_TABLE_MANIFEST.tables[0].src,'../data/income-tax-2026.js');

console.log('All release regression tests passed.');
