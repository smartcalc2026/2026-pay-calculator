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
calcSrc=calcSrc.replace(/\n\}\)\(\);\s*$/,'\n  window.__test={calculate,calculateHealth,calculateEmployment,calculatePension,calculateLongTerm,calculateLocalTax};\n})();');
vm.runInContext(calcSrc,ctx);
const C=ctx.window.__test;
const T=ctx.window.INCOME_TAX_2026;

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
  5000000:{pension:237500,health:179750,care:23610,employment:45000,incomeTax:335470,local:33540,total:854870,net:4145130},
  7000000:{pension:313020,health:251650,care:33060,employment:63000,incomeTax:732700,local:73270,total:1466700,net:5533300},
  10000000:{pension:313020,health:359500,care:47230,employment:90000,incomeTax:1507400,local:150740,total:2467890,net:7532110}
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

// 부동소수점 회귀 테스트: 7,000,000 × 0.9% = 정확히 63,000원
assert.strictEqual(C.calculateEmployment(7000000),63000);
assert.strictEqual(C.calculateEmployment(3000000),27000);
assert.strictEqual(C.calculateHealth(63000),10080);
assert.strictEqual(C.calculateLongTerm(71900),9440);
assert.strictEqual(C.calculateLocalTax(19520),1950);

console.log('All release regression tests passed.');
