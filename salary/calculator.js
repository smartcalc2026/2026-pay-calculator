(() => {
  "use strict";
  const R = window.PAYROLL_RULES_2026;
  const CONFIG = window.APP_CONFIG || { features: { enableAdvancedInsuranceInput: false } };
  const advancedEnabled = !!(CONFIG.features && CONFIG.features.enableAdvancedInsuranceInput === true);
  const $ = (id) => document.getElementById(id);
  let T = window.INCOME_TAX_2026 || null;
  let taxLoadPromise = null;
  async function ensureTaxTable(month) {
    const manifest = window.TAX_TABLE_MANIFEST;
    const entry = manifest && manifest.tables.find(x => month + "-01" >= x.from && month + "-01" <= x.to);
    if (!entry) throw new Error("선택한 적용월에 유효한 근로소득 간이세액표가 등록되어 있지 않습니다.");
    if (T && T.effectiveFrom && T.effectiveFrom.slice(0,4) === String(entry.year)) return T;
    if (!taxLoadPromise) taxLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = entry.src; script.async = true;
      script.onload = () => { T = window[entry.globalName]; T ? resolve(T) : reject(new Error("세액표 데이터를 찾을 수 없습니다.")); };
      script.onerror = () => reject(new Error("근로소득 간이세액표를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도하세요."));
      document.head.appendChild(script);
    });
    try { return await taxLoadPromise; }
    catch (error) { taxLoadPromise = null; throw error; }
  }
  const won = new Intl.NumberFormat(R.display.numberLocale);
  const fmt = (n) => `${won.format(Math.trunc(n))}원`;
  const trunc = (n,u=10) => Math.floor(n/u)*u;
  // 보험료는 원 단위 부동소수점 오차를 피하기 위해 정수 비율로 계산한다.
  const percentTrunc = (amount, numerator, denominator, unit=10) => Math.floor((amount * numerator) / (denominator * unit)) * unit;
  const parseMoney = (v) => Number(String(v).replace(/,/g,""));
  const formatInput = (el) => { const n=parseMoney(el.value); if(Number.isFinite(n)) el.value=won.format(n); };

  function periodFor(month){ return R.pension.periods.find(p=>month>=p.from && month<=p.to) || R.pension.periods.at(-1); }
  function pensionBase(taxable,month){ const p=periodFor(month); const reported=trunc(taxable,R.pension.incomeTruncateUnit); return Math.min(p.max,Math.max(p.min,reported)); }
  function calculatePension(taxable,month,manualBase=null){ const base=manualBase===null?pensionBase(taxable,month):manualBase; return percentTrunc(base,475,10000,10); }
  function calculateHealth(taxable,manualBase=null){ const base=manualBase===null?taxable:manualBase; const rawTotal=Math.floor((base * 719) / 10000); const total=Math.min(R.health.maxTotalPremium,Math.max(R.health.minTotalPremium,rawTotal)); return percentTrunc(total,50,100,10); }
  function calculateLongTerm(health){ return percentTrunc(health,1314,10000,10); }
  function calculateEmployment(taxable){ return percentTrunc(taxable,9,1000,10); }

  function findTableTax(salaryWon,dependents){
    const k=Math.max(1,Math.min(T.familyColumns,dependents))-1;
    const salaryThousand=Math.floor(salaryWon/1000);
    let lo=0,hi=T.rows.length-1;
    while(lo<=hi){ const m=(lo+hi)>>1,r=T.rows[m]; if(salaryThousand<r.min) hi=m-1; else if(salaryThousand>=r.max) lo=m+1; else return r.tax[k] ?? 0; }
    return null;
  }
  function baseIncomeTax(salaryWon,dependents){
    const exact=findTableTax(salaryWon,dependents); if(exact!==null) return exact;
    const k=Math.max(1,Math.min(T.familyColumns,dependents))-1; const salaryThousand=salaryWon/1000;
    if(salaryThousand===10000) return T.tenMillion[k];
    if(salaryThousand<10000) return 0;
    const tier=T.overTenMillion.tiers.find(x=>salaryWon<=x.max);
    const ten=T.tenMillion[k];
    if(!tier) return null;
    return trunc(ten + tier.add + (salaryWon-tier.excessBase)*tier.multiply*tier.rate,10);
  }
  function childDeduction(children){ if(children<=0)return 0; if(children===1)return T.childAdjustment.one; if(children===2)return T.childAdjustment.two; return T.childAdjustment.two+(children-2)*T.childAdjustment.extra; }
  function calculateIncomeTax(taxable,dependents,children,withholding,month){
    const base=baseIncomeTax(taxable,dependents);
    // 간이세액표 조견표는 2026년 1~12월 동일하게 사용한다. 자녀 공제는 2026년 3월부터 별도 적용한다.
    const applyChildAdjustment = month >= R.incomeTax.childAdjustmentEffectiveFrom.slice(0,7);
    const deduction = applyChildAdjustment ? childDeduction(children) : 0;
    const afterChild=Math.max(0,base-deduction);
    return trunc(afterChild*withholding,10);
  }
  function calculateLocalTax(incomeTax){ return percentTrunc(incomeTax,10,100, R.localIncomeTax.truncateUnit); }

  function validate(i){
    const errors=[]; if(!/^\\d{4}-(0[1-9]|1[0-2])$/.test(i.month)) errors.push("적용월을 올바르게 선택하세요.");
    if(!Number.isInteger(i.gross)||i.gross<=0) errors.push("월 총급여액은 0원보다 큰 정수로 입력하세요.");
    if(!Number.isInteger(i.nontax)||i.nontax<0) errors.push("비과세액을 올바르게 입력하세요.");
    if(i.nontax>i.gross) errors.push("비과세액은 총급여액보다 클 수 없습니다.");
    if(!Number.isInteger(i.dependents)||i.dependents<1||i.dependents>11) errors.push("공제대상가족 수는 1~11명으로 입력하세요.");
    if(!Number.isInteger(i.children)||i.children<0||i.children>i.dependents) errors.push("8~20세 자녀 수는 0명 이상이며 공제대상가족 수를 초과할 수 없습니다.");
    return errors;
  }
  function calculate(i){
    const taxable=Math.max(0,i.gross-i.nontax);
    const pensionManual=advancedEnabled && i.pensionMode==="manual" ? i.pensionBaseManual : null;
    const healthManual=advancedEnabled && i.healthMode==="manual" ? i.healthBaseManual : null;
    const pension=calculatePension(taxable,i.month,pensionManual); const health=calculateHealth(taxable,healthManual); const care=calculateLongTerm(health); const employment=calculateEmployment(taxable);
    const incomeTax=calculateIncomeTax(taxable,i.dependents,i.children,i.withholding,i.month); const local=calculateLocalTax(incomeTax);
    const total=pension+health+care+employment+incomeTax+local; return {taxable,pension,health,care,employment,incomeTax,local,total,net:i.gross-total, pensionBase:pensionManual===null?pensionBase(taxable,i.month):pensionManual, healthBase:healthManual===null?taxable:healthManual, taxBase:baseIncomeTax(taxable,i.dependents), childDeduction:(i.month >= R.incomeTax.childAdjustmentEffectiveFrom.slice(0,7) ? childDeduction(i.children) : 0)};
  }
  function render(r){
    $("result").hidden=false; $("net").textContent=fmt(r.net); $("summary").innerHTML=[['총급여',fmt(current.gross)],['공제합계',fmt(r.total)],['과세급여',fmt(r.taxable)]].map(x=>`<div><strong>${x[0]}</strong><span>${x[1]}</span></div>`).join('');
    $("detail").innerHTML=`<table class="detail-table"><thead><tr><th>공제 항목</th><th>금액</th></tr></thead><tbody>${[['국민연금',r.pension],['건강보험',r.health],['장기요양보험',r.care],['고용보험',r.employment],['근로소득세',r.incomeTax],['지방소득세',r.local],['합계',r.total]].map(x=>`<tr><td>${x[0]}</td><td>${fmt(x[1])}</td></tr>`).join('')}</tbody></table><p>국민연금 기준소득월액: ${fmt(r.pensionBase)}<br>건강보험 보수월액: ${fmt(r.healthBase)}<br>간이세액표 기본세액: ${fmt(r.taxBase)}<br>8~20세 자녀 공제: ${fmt(r.childDeduction)}</p>`;
  }
  let current=null;
  [$("gross"),$("nontax")].forEach(el=>el.addEventListener('blur',()=>formatInput(el)));
  if (advancedEnabled) {
    $("advanced-insurance").hidden = false;
    ["pension-mode","health-mode"].forEach(id => $(id).addEventListener("change", () => {
      // 모드를 직접입력으로 바꿔도 이전 값은 자동 적용하지 않으며, 사용자가 입력한 유효값만 사용합니다.
      const field = id === "pension-mode" ? $("pension-base-manual") : $("health-base-manual");
      field.disabled = $(id).value !== "manual";
      if ($(id).value !== "manual") field.value = "";
    }));
    $("pension-base-manual").disabled = true; $("health-base-manual").disabled = true;
  }
  $("salary-form").addEventListener('submit', async (e)=>{
    e.preventDefault();
    current={month:$("month").value,gross:parseMoney($("gross").value),nontax:parseMoney($("nontax").value),dependents:Number($("dependents").value),children:Number($("children").value),withholding:Number(document.querySelector('input[name="withholding"]:checked').value),
      pensionMode:advancedEnabled?$("pension-mode").value:"auto", healthMode:advancedEnabled?$("health-mode").value:"auto",
      pensionBaseManual:advancedEnabled?($("pension-base-manual").value.trim()===""?NaN:Number($("pension-base-manual").value)):null, healthBaseManual:advancedEnabled?($("health-base-manual").value.trim()===""?NaN:Number($("health-base-manual").value)):null};
    const errors=validate(current);
    if(advancedEnabled && current.pensionMode==="manual") {
      const period=periodFor(current.month);
      if(!Number.isFinite(current.pensionBaseManual)||!Number.isInteger(current.pensionBaseManual)||current.pensionBaseManual<period.min||current.pensionBaseManual>period.max)
        errors.push(`국민연금 기준소득월액은 해당 기간의 상·하한 ${fmt(period.min)}~${fmt(period.max)} 사이의 정수로 입력하세요.`);
    }
    if(advancedEnabled && current.healthMode==="manual" && (!Number.isFinite(current.healthBaseManual)||!Number.isInteger(current.healthBaseManual)||current.healthBaseManual<0||current.healthBaseManual>1000000000)) errors.push("건강보험 보수월액은 0~1,000,000,000원 정수로 입력하세요.");
    if(errors.length){$("error").hidden=false;$("error").textContent=errors.join(" ");return;}
    $("error").hidden=true;
    const submit=$("salary-form").querySelector('button[type="submit"]'); submit.disabled=true; submit.textContent="세액표 확인 중...";
    try { await ensureTaxTable(current.month); render(calculate(current)); }
    catch(err) { $("error").hidden=false; $("error").textContent=err.message || "계산 기준 데이터를 불러오지 못했습니다."; }
    finally { submit.disabled=false; submit.textContent="실수령액 계산하기"; }
  });
  $("toggle-detail").addEventListener('click',()=>{const d=$("detail"),b=$("toggle-detail"); d.hidden=!d.hidden; b.setAttribute('aria-expanded',String(!d.hidden)); b.textContent=d.hidden?'계산 상세보기':'계산 상세닫기';});
})();
