const assert=require('assert');
const fs=require('fs'), vm=require('vm'), path=require('path');
const projectRoot=path.resolve(__dirname,'..');
const readProjectFile=relativePath=>fs.readFileSync(path.join(projectRoot,relativePath),'utf8');
const mockElement=()=>({hidden:true,value:'',textContent:'',innerHTML:'',disabled:false,placeholder:'',style:{},setAttribute(){},addEventListener(){},querySelector(){return mockElement();}});
const els=new Proxy({}, {get(target,id){if(typeof id!=='string') return target[id]; return target[id]||(target[id]=mockElement());}});
const querySelector=selector=>selector&&selector.includes('calculation-mode')?{value:'forward',checked:false}:mockElement();
const ctx={window:{},document:{getElementById:id=>els[id],querySelector,querySelectorAll:()=>[]},Intl,console};
vm.createContext(ctx);
vm.runInContext(readProjectFile('data/payroll-rules-2026.js'),ctx);
vm.runInContext(readProjectFile('data/income-tax-2026.js'),ctx);
let calcSrc=readProjectFile('salary/calculator.js');
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
assert(C.validate({month:'2026-10',gross:0,nontax:0,dependents:1,children:0,withholding:1}).some(x=>x.includes('월 총급여액')));
assert(C.validate({month:'2026-10',gross:1000000,nontax:1000001,dependents:1,children:0,withholding:1}).some(x=>x.includes('비과세액은 총급여액보다')));
assert(C.validate({month:'2026-10',gross:1000000,nontax:0,dependents:1,children:0,withholding:0.9}).some(x=>x.includes('원천징수 비율')));
assert(C.validate({month:'2026-10',gross:1000000,nontax:0,dependents:1,children:2,withholding:1}).some(x=>x.includes('자녀 수')));
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
vm.runInContext(readProjectFile('data/tax-table-manifest.js'),manifestCtx);
assert.strictEqual(manifestCtx.window.TAX_TABLE_MANIFEST.tables.length,1);
assert.strictEqual(manifestCtx.window.TAX_TABLE_MANIFEST.tables[0].year,2026);
assert.strictEqual(manifestCtx.window.TAX_TABLE_MANIFEST.tables[0].src,'../data/income-tax-2026.js');
assert.strictEqual(manifestCtx.window.TAX_TABLE_MANIFEST.rules.length,1);
assert.strictEqual(manifestCtx.window.TAX_TABLE_MANIFEST.rules[0].globalName,'PAYROLL_RULES_2026');
assert.strictEqual(manifestCtx.window.TAX_TABLE_MANIFEST.rules[0].year,2026);
assert.strictEqual(manifestCtx.window.TAX_TABLE_MANIFEST.rules[0].from,'2026-01-01');
assert.strictEqual(manifestCtx.window.TAX_TABLE_MANIFEST.rules[0].to,'2026-12-31');

console.log('All release regression tests passed.');

// A단계 정적 로딩 구조 검증: 세액표와 연도별 보험료 규칙을 HTML에서 고정 로딩하지 않음
const calculatorHtml=readProjectFile('salary/index.html');
assert(!calculatorHtml.includes('<script src="../data/income-tax-2026.js"></script>'));
assert(!calculatorHtml.includes('<script src="../data/payroll-rules-2026.js"></script>'));
assert(calculatorHtml.includes('<script src="../data/tax-table-manifest.js"></script>'));

// 고급 직접입력 ON: 입력한 기준은 해당 보험료 산정에 반영되고 다른 자동 산식은 유지
const onEls=new Proxy({...els}, {get(target,id){if(typeof id!=='string') return target[id]; return target[id]||(target[id]=mockElement());}});
for (const id of ['advanced-insurance','pension-mode','health-mode','pension-base-manual','health-base-manual']) onEls[id]={hidden:true,value:'',textContent:'',innerHTML:'',disabled:false,setAttribute(){},addEventListener(){}};
const onCtx={window:{APP_CONFIG:{features:{enableAdvancedInsuranceInput:true}}},document:{getElementById:id=>onEls[id],querySelector,querySelectorAll:()=>[]},Intl,console};
vm.createContext(onCtx);
vm.runInContext(readProjectFile('data/payroll-rules-2026.js'),onCtx);
vm.runInContext(readProjectFile('data/income-tax-2026.js'),onCtx);
let onSrc=readProjectFile('salary/calculator.js');
onSrc=onSrc.replace(/\n\}\)\(\);\s*$/,'\n  window.__test={calculate,validate,validateAdvancedInputs};\n})();');
vm.runInContext(onSrc,onCtx);
const ON=onCtx.window.__test;
const autoOn=ON.calculate({month:'2026-10',gross:3000000,nontax:0,dependents:1,children:0,withholding:1,pensionMode:'auto',healthMode:'auto'});
const pensionManual=ON.calculate({month:'2026-10',gross:3000000,nontax:0,dependents:1,children:0,withholding:1,pensionMode:'manual',pensionBaseManual:2000000,healthMode:'auto'});
assert.notStrictEqual(pensionManual.pension,autoOn.pension);
assert.strictEqual(pensionManual.health,autoOn.health);
assert.strictEqual(pensionManual.employment,autoOn.employment);
const healthManual=ON.calculate({month:'2026-10',gross:3000000,nontax:0,dependents:1,children:0,withholding:1,pensionMode:'auto',healthMode:'manual',healthBaseManual:2000000});
assert.strictEqual(healthManual.pension,autoOn.pension);
assert.notStrictEqual(healthManual.health,autoOn.health);
console.log('A-stage manifest/loading and advanced-input tests passed.');

// 실제 비동기 데이터 선택 로더: mock script loader로 매니페스트 경로와 재시도 동작을 확인
(async () => {
  const path=require('path');
  const root=projectRoot;
  const dynEls=new Proxy({...els}, {get(target,id){if(typeof id!=='string') return target[id]; return target[id]||(target[id]=mockElement());}});
  for (const id of ['advanced-insurance','pension-mode','health-mode','pension-base-manual','health-base-manual']) dynEls[id]={hidden:true,value:'',textContent:'',innerHTML:'',disabled:false,setAttribute(){},addEventListener(){}};
  const dynCtx={window:{APP_CONFIG:{features:{enableAdvancedInsuranceInput:false}}},Intl,console};
  dynCtx.document={
    getElementById:id=>dynEls[id] || (dynEls[id]={hidden:true,value:'',textContent:'',innerHTML:'',disabled:false,setAttribute(){},addEventListener(){}}),
    querySelector,querySelectorAll:()=>[],
    createElement:()=>({}),
    head:{appendChild(script){
      queueMicrotask(() => {
        try { const file=path.resolve(root,'salary',script.src); const source=fs.readFileSync(file,'utf8'); vm.runInContext(source,dynCtx); script.onload(); }
        catch(e) { if(script.onerror) script.onerror(e); }
      });
    }}
  };
  vm.createContext(dynCtx);
  vm.runInContext(readProjectFile('data/tax-table-manifest.js'),dynCtx);
  let dynSrc=readProjectFile('salary/calculator.js');
  dynSrc=dynSrc.replace(/\n\}\)\(\);\s*$/,'\n  window.__test={ensureRules,ensureTaxTable};\n})();');
  vm.runInContext(dynSrc,dynCtx);
  const D=dynCtx.window.__test;
  const rules=await D.ensureRules('2026-10');
  assert.strictEqual(rules.year,2026);
  const tax=await D.ensureTaxTable('2026-10');
  assert.strictEqual(tax.rows.length,646);
  dynCtx.window.TAX_TABLE_MANIFEST.tables=[];
  await assert.rejects(()=>D.ensureTaxTable('2027-01'),/아직 등록되지 않았습니다/);
  // 잘못된 경로 요청은 실패 상태를 캐시하지 않아, 매니페스트 수정 후 다시 시도할 수 있음
  dynCtx.window.TAX_TABLE_MANIFEST.tables=[{id:'retry-test',year:2026,from:'2026-01-01',to:'2026-12-31',src:'../data/missing-tax-file.js',globalName:'MISSING_TAX'}];
  let loadFailed=false;
  try { await D.ensureTaxTable('2026-10'); } catch(e) { loadFailed=/불러오지 못했습니다/.test(e.message); }
  assert.strictEqual(loadFailed,true);
  dynCtx.window.TAX_TABLE_MANIFEST.tables=[{id:'retry-test',year:2026,from:'2026-01-01',to:'2026-12-31',src:'../data/income-tax-2026.js',globalName:'INCOME_TAX_2026'}];
  const retry=await D.ensureTaxTable('2026-10');
  assert.strictEqual(retry.rows.length,646);
  console.log('Async manifest loading, missing-data and retry tests passed.');
})().catch(err=>{ console.error(err); process.exitCode=1; });

// B단계 반응형 스타일의 핵심 규칙이 유지되는지 확인
const responsiveCss=readProjectFile('assets/css/common.css');
assert(responsiveCss.includes('@media(max-width:420px)'));
assert(responsiveCss.includes('min-height:48px'));
assert(responsiveCss.includes('overflow-x:auto'));
assert(responsiveCss.includes('prefers-reduced-motion:reduce'));
console.log('Responsive UI stylesheet checks passed.');

// B단계 UI 계약: 공통 금액 입력 클래스, 상세보기 접근성, 모바일 결과 이동
const salaryHtml=readProjectFile('salary/index.html');
const calculatorJs=readProjectFile('salary/calculator.js');
for (const id of ['gross','nontax','pension-base-manual','health-base-manual']) {
  const inputTag=salaryHtml.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`));
  assert(inputTag, `Missing amount input: ${id}`);
  assert(inputTag[0].includes('amount-input'), `Missing common amount class: ${id}`);
  assert(inputTag[0].includes('inputmode="numeric"'), `Missing numeric keypad hint: ${id}`);
}
assert(salaryHtml.includes('aria-expanded="false"'));
assert(salaryHtml.includes('class="detail-arrow"'));
assert(calculatorJs.includes('계산 상세 닫기'));
assert(calculatorJs.includes('setAttribute("aria-expanded",String(expanded))'));
assert(calculatorJs.includes('(max-width: 767px)'));
assert(calculatorJs.includes('(prefers-reduced-motion: reduce)'));
assert(calculatorJs.includes('scrollIntoView'));
assert(calculatorJs.includes('if(raw==="") return NaN'));
console.log('B-stage amount alignment, detail toggle, mobile scroll and blank-input checks passed.');
