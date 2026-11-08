(() => {
  "use strict";
  let R = window.PAYROLL_RULES_2026 || null;
  const CONFIG = window.APP_CONFIG || { features: { enableAdvancedInsuranceInput: false } };
  const advancedEnabled = !!(CONFIG.features && CONFIG.features.enableAdvancedInsuranceInput === true);
  const $ = (id) => document.getElementById(id);
  function currentKoreaMonth(){
    const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit"}).formatToParts(new Date());
    const year=parts.find(part=>part.type==="year").value, month=parts.find(part=>part.type==="month").value;
    return `${year}-${month}`;
  }
  function updateCurrentPeriod(){
    const month=currentKoreaMonth();
    $("month").value=month;
    const periodLabel=$("current-period");
    if(periodLabel) periodLabel.textContent=`계산 기준: ${Number(month.slice(0,4))}년 ${Number(month.slice(5,7))}월 (한국 시간 기준)`;
    return month;
  }
  function renderPublicGuidance(){
    const notice=$("withholding-notice");
    if(notice) notice.textContent=(CONFIG.display && CONFIG.display.fixedWithholdingNotice) || "원천징수 비율 100% 기준으로 산출합니다.";
    const section=$("public-guidance"), content=$("public-guidance-content");
    const guidance=CONFIG.display && CONFIG.display.publicGuidance;
    if(!section || !content || !guidance || guidance.visible !== true) return;
    const visibleSections=(guidance.sections || []).filter(item=>item && item.visible === true);
    if(!visibleSections.length) return;
    content.replaceChildren();
    const title=document.createElement("h2"); title.textContent=guidance.title || "계산 기준 및 안내"; content.appendChild(title);
    for(const item of visibleSections){
      const visibleItems=(item.items || []).filter(row=>row && row.visible === true && row.text);
      if(!visibleItems.length) continue;
      const subsection=document.createElement("section"); subsection.className="guidance-section";
      const heading=document.createElement("h3"); heading.textContent=item.title || "안내"; subsection.appendChild(heading);
      const list=document.createElement("ul");
      for(const row of visibleItems){
        const line=document.createElement("li");
        if(typeof row.url === "string" && /^https:\/\//i.test(row.url)){
          const link=document.createElement("a"); link.href=row.url; link.rel="noopener"; link.textContent=row.text; line.appendChild(link);
        } else line.textContent=row.text;
        list.appendChild(line);
      }
      subsection.appendChild(list); content.appendChild(subsection);
    }
    if(content.childElementCount > 1) section.hidden=false;
  }
  renderPublicGuidance();
  let T = window.INCOME_TAX_2026 || null;
  const loadedData = new Map();
  const pendingData = new Map();
  let latestRequestId = 0;
  let activeRuleKey = null;
  let activeTaxKey = null;
  function manifestEntry(kind, month) {
    const manifest = window.TAX_TABLE_MANIFEST;
    const entries = manifest && (kind === "tax" ? manifest.tables : manifest.rules);
    return entries && entries.find(x => `${month}-01` >= x.from && `${month}-01` <= x.to);
  }
  function loadData(entry, kind) {
    const key = `${kind}:${entry.id || entry.src}:${entry.from}:${entry.to}`;
    if (loadedData.has(key)) return Promise.resolve(loadedData.get(key));
    if (pendingData.has(key)) return pendingData.get(key);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = entry.src; script.async = true;
      script.onload = () => {
        const value = window[entry.globalName];
        if (!value) { pendingData.delete(key); reject(new Error(kind === "tax" ? "세액표 데이터를 찾을 수 없습니다." : "보험료 규칙 데이터를 찾을 수 없습니다.")); return; }
        loadedData.set(key, value); pendingData.delete(key); resolve(value);
      };
      script.onerror = () => { pendingData.delete(key); reject(new Error(kind === "tax" ? "근로소득 간이세액표를 불러오지 못했습니다. 다시 계산 버튼을 눌러 재시도하세요." : "보험료 계산 기준을 불러오지 못했습니다. 다시 계산 버튼을 눌러 재시도하세요.")); };
      document.head.appendChild(script);
    });
    pendingData.set(key, promise); return promise;
  }
  async function ensureRules(month) {
    const entry = manifestEntry("rules", month);
    if (!entry) throw new Error("현재 월에 적용할 보험료 계산 기준이 아직 등록되지 않았습니다. 기준 자료가 갱신된 뒤 이용해 주세요.");
    const key = `rules:${entry.id || entry.src}:${entry.from}:${entry.to}`;
    if (activeRuleKey === key && R) return R;
    R = await loadData(entry, "rules");
    if (!R || R.year !== entry.year) throw new Error("현재 월과 일치하는 보험료 기준 자료를 불러오지 못했습니다.");
    activeRuleKey = key;
    return R;
  }
  async function ensureTaxTable(month) {
    const entry = manifestEntry("tax", month);
    if (!entry) throw new Error("현재 월에 적용할 근로소득 간이세액표가 아직 등록되지 않았습니다. 기준 자료가 갱신된 뒤 이용해 주세요.");
    const key = `tax:${entry.id || entry.src}:${entry.from}:${entry.to}`;
    if (activeTaxKey === key && T) return T;
    T = await loadData(entry, "tax");
    if (!T || !T.effectiveFrom || T.effectiveFrom < entry.from || T.effectiveFrom > entry.to) throw new Error("현재 월과 일치하는 세액표 자료를 불러오지 못했습니다.");
    activeTaxKey = key;
    return T;
  }
  const won = new Intl.NumberFormat((R && R.display && R.display.numberLocale) || "ko-KR");
  const fmt = (n) => `${won.format(Math.trunc(n))}원`;
  const trunc = (n,u=10) => Math.floor(n/u)*u;
  // 보험료는 원 단위 부동소수점 오차를 피하기 위해 정수 비율로 계산한다.
  const percentTrunc = (amount, numerator, denominator, unit=10) => Math.floor((amount * numerator) / (denominator * unit)) * unit;
  const parseMoney = (v) => { const raw=String(v ?? "").trim(); if(raw==="") return NaN; if(!/^[0-9,]+$/.test(raw)) return NaN; return Number(raw.replace(/,/g,"")); };
  const formatInput = (el) => { const n=parseMoney(el.value); if(Number.isFinite(n)) el.value=won.format(n); };
  const formatReadableWon = (value) => {
    if(!Number.isSafeInteger(value)||value<0) return "";
    if(value===0) return "0원";
    const units=[];
    const eok=Math.floor(value/100000000);
    const man=Math.floor((value%100000000)/10000);
    const remainder=value%10000;
    if(eok) units.push(`${won.format(eok)}억`);
    if(man) units.push(`${won.format(man)}만`);
    if(remainder) units.push(`${won.format(remainder)}원`);
    else units[units.length-1]+=" 원";
    return units.join(" ");
  };
  const updateReadableAmount = (el) => {
    const readout=el.parentElement.querySelector(".amount-readable");
    const value=parseMoney(el.value);
    readout.textContent=Number.isSafeInteger(value)?formatReadableWon(value):"";
    readout.hidden=!Number.isSafeInteger(value);
  };
  function grossMode(){ return $("gross-mode").value; }
  function severanceIncluded(){ return $("severance-mode").value==="included"; }
  function calculationMode(){ return document.querySelector('input[name="calculation-mode"]:checked').value; }
  function updateSalaryModeNotice(){
    const notice=$("salary-mode-notice");
    if(!notice) return;
    if(calculationMode()==="reverse"){
      notice.textContent="연봉 역산은 12개월 균등 지급을 가정하며, 1원 미만은 버립니다. 상여금·성과급 및 회사별 신고 보수월액·정산 조건은 반영하지 않아 실제 급여명세서와 다를 수 있습니다.";
    } else if(grossMode()==="monthly"){
      notice.textContent="월급여 입력 기준으로 계산합니다. 별도 지급되는 상여금·성과급은 계산에 포함되지 않아 실제 급여명세서와 다를 수 있습니다.";
    } else if(severanceIncluded()){
      notice.textContent="퇴직금 포함 연봉을 월급여×13으로 단순 환산해 월급여를 추정합니다. 실제 퇴직금과 급여명세서는 회사의 지급 조건에 따라 다를 수 있습니다.";
    } else {
      notice.textContent="연봉은 퇴직금 별도 기준으로 12개월 균등 지급한다고 가정하며, 1원 미만은 버립니다. 실제 급여는 회사의 신고 보수월액·정산·상여금·성과급 등 지급 조건에 따라 계산 결과와 다를 수 있습니다.";
    }
  }
  function updateGrossMode(){
    const annual=grossMode()==="annual";
    const included=severanceIncluded();
    const hideSeverance=!annual || calculationMode()==="reverse";
    $("severance-fieldset").hidden=hideSeverance;
    $("severance-fieldset").style.display=hideSeverance?"none":"";
    $("gross-label").textContent=annual?"세전 연봉(원)":"월급여(원)";
    $("gross").setAttribute("aria-label",annual?"세전 연봉":"월급여");
    $("gross").placeholder=annual?"예: 30,000,000":"예: 2,000,000";
    updateSalaryModeNotice();
  }
  function updateCalculationMode(){
    const reverse=calculationMode()==="reverse";
    $("gross-mode-fieldset").hidden=reverse; $("gross-mode-fieldset").style.display=reverse?"none":"";
    $("gross-input-group").hidden=reverse; $("gross-input-group").style.display=reverse?"none":""; $("gross").disabled=reverse;
    $("target-input-group").hidden=!reverse; $("target-input-group").style.display=reverse?"":"none"; $("target-net").disabled=!reverse;
    if(!reverse) updateGrossMode(); else { $("severance-fieldset").hidden=true; $("severance-fieldset").style.display="none"; }
    updateSalaryModeNotice();
    $("salary-form").querySelector('button[type="submit"]').textContent=reverse?"필요 연봉 계산하기":"실수령액 계산하기";
  }
  function setDetailExpanded(expanded){
    const detail=$("detail"), button=$("toggle-detail");
    detail.hidden=!expanded;
    button.setAttribute("aria-expanded",String(expanded));
    button.querySelector(".detail-button-label").textContent=expanded?"계산 상세 닫기":"계산 상세보기";
    button.querySelector(".detail-arrow").textContent=expanded?"▴":"▾";
  }
  function scrollToResultOnMobile(){
    if(!window.matchMedia || !window.matchMedia("(max-width: 767px)").matches) return;
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches){ $("result").scrollIntoView({block:"start",behavior:"auto"}); return; }
    if(document.activeElement && typeof document.activeElement.blur==="function") document.activeElement.blur();
    $("result").scrollIntoView({block:"start",behavior:"smooth"});
  }

  function periodFor(month){ if(!R || !R.pension) return null; const monthStart = `${month}-01`; return R.pension.periods.find(p=>monthStart>=p.from && monthStart<=p.to) || null; }
  function pensionBase(taxable,month){ const p=periodFor(month); const reported=trunc(taxable,R.pension.incomeTruncateUnit); return Math.min(p.max,Math.max(p.min,reported)); }
  function calculatePension(taxable,month,manualBase=null){ const base=manualBase===null?pensionBase(taxable,month):manualBase; const scale=1000000; return percentTrunc(base,Math.round(R.pension.employeeRate*scale),scale,10); }
  function calculateHealth(taxable,manualBase=null){ const base=manualBase===null?taxable:manualBase; const rawTotal=Math.floor((base * Math.round(R.health.totalRate*10000)) / 10000); const total=Math.min(R.health.maxTotalPremium,Math.max(R.health.minTotalPremium,rawTotal)); const scale=1000000; const employeeShare=Math.round((R.health.employeeRate/R.health.totalRate)*scale); return percentTrunc(total,employeeShare,scale,10); }
  function calculateLongTerm(health){ return percentTrunc(health,R.longTermCare.ratioNumerator,R.longTermCare.ratioDenominator,10); }
  function calculateEmployment(taxable){ const scale=1000000; return percentTrunc(taxable,Math.round(R.employment.employeeRate*scale),scale,10); }

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
    if(salaryWon===10000000) return T.tenMillion[k];
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
  function calculateLocalTax(incomeTax){ const scale=1000000; return percentTrunc(incomeTax,Math.round(R.localIncomeTax.rate*scale),scale,R.localIncomeTax.truncateUnit); }

  function validate(i){
    const errors=[];
    const enteredGross=i.inputGross===undefined?i.gross:i.inputGross;
    const validMonthFormat = /^\d{4}-(0[1-9]|1[0-2])$/.test(i.month);
    if(!validMonthFormat) errors.push("적용월을 올바르게 선택하세요.");
    else if (window.TAX_TABLE_MANIFEST && !manifestEntry("rules", i.month)) errors.push("선택한 적용월의 보험료 계산 기준이 등록되어 있지 않습니다.");
    else if (!window.TAX_TABLE_MANIFEST && R && R.year && Number(i.month.slice(0,4)) !== R.year) errors.push(`현재 등록된 계산 기준은 ${R.year}년입니다. 적용월을 다시 선택하세요.`);

    if(!Number.isSafeInteger(enteredGross)||enteredGross<=0) errors.push(i.grossMode==="annual"?"세전 연봉은 0원보다 큰 정수로 입력하세요.":"월 총급여액은 0원보다 큰 정수로 입력하세요.");
    else if(!Number.isSafeInteger(i.gross)||i.gross<=0) errors.push(i.grossMode==="annual"?"연봉을 12개월로 나눈 월 총급여액은 0원보다 커야 합니다.":"월 총급여액은 0원보다 큰 정수로 입력하세요.");
    if(!Number.isInteger(i.nontax)||i.nontax<0) errors.push("비과세액을 올바르게 입력하세요.");
    if(i.nontax>i.gross) errors.push("비과세액은 총급여액보다 클 수 없습니다.");
    if(!Number.isInteger(i.dependents)||i.dependents<1||i.dependents>11) errors.push("공제대상가족 수는 1~11명으로 입력하세요.");
    if(!Number.isInteger(i.children)||i.children<0||i.children>i.dependents) errors.push("8~20세 자녀 수는 공제대상가족 수를 초과할 수 없습니다.");
    if(i.withholding !== undefined && ![0.8,1,1.2].includes(i.withholding)) errors.push("원천징수 비율은 80%, 100%, 120% 중에서 선택하세요.");
    return errors;
  }
  function validateAdvancedInputs(i){
    const errors=[];
    if(!advancedEnabled) return errors;
    if(!["auto","manual"].includes(i.pensionMode)) errors.push("국민연금 산정 방식을 올바르게 선택하세요.");
    if(!["auto","manual"].includes(i.healthMode)) errors.push("건강보험 산정 방식을 올바르게 선택하세요.");
    if(i.pensionMode==="manual"){
      const period=periodFor(i.month);
      if(!period || !Number.isFinite(i.pensionBaseManual) || !Number.isInteger(i.pensionBaseManual) || i.pensionBaseManual<period.min || i.pensionBaseManual>period.max)
        errors.push(period ? `국민연금 기준소득월액은 ${fmt(period.min)}~${fmt(period.max)} 사이의 정수로 입력하세요.` : "해당 적용월의 국민연금 기준이 없습니다.");
    }
    if(i.healthMode==="manual" && (!Number.isFinite(i.healthBaseManual)||!Number.isInteger(i.healthBaseManual)||i.healthBaseManual<0||i.healthBaseManual>1000000000)) errors.push("건강보험 보수월액은 0~1,000,000,000원 정수로 입력하세요.");
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
  const MAX_REVERSE_MONTHLY_GROSS=1000000000;
  function findRequiredGross(targetNet,base){
    let lo=Math.max(1,base.nontax), hi=MAX_REVERSE_MONTHLY_GROSS;
    const netAt=(gross)=>calculate({...base,gross}).net;
    if(netAt(hi)<targetNet) throw new Error("입력한 목표 실수령액이 현재 계산 가능 범위를 초과합니다. 목표액을 낮춰 입력하세요.");
    while(lo<hi){ const mid=Math.floor((lo+hi)/2); if(netAt(mid)>=targetNet) hi=mid; else lo=mid+1; }
    return {gross:lo,result:calculate({...base,gross:lo})};
  }
  function render(r){
    $("result").hidden=false; $("net").textContent=fmt(r.net);
    const reverse=current.calculationMode==="reverse";
    const summary=reverse
      ? [['필요 연봉(퇴직금 별도)',fmt(current.annualGross)],['월 환산 급여',fmt(current.gross)],['목표 월 실수령액',fmt(current.targetNet)],['공제합계',fmt(r.total)]]
      : current.grossMode==="annual"
      ? [[current.severanceIncluded?"입력 연봉(퇴직금 포함)":"입력 연봉(퇴직금 별도)",fmt(current.annualGross)],['월 환산 급여',fmt(current.gross)],['공제합계',fmt(r.total)],['과세급여',fmt(r.taxable)]]
      : [['월급여',fmt(current.gross)],['공제합계',fmt(r.total)],['과세급여',fmt(r.taxable)]];
    $("summary").innerHTML=summary.map(x=>`<div><strong>${x[0]}</strong><span>${x[1]}</span></div>`).join('');
    const reverseNote=$("reverse-result-note"); reverseNote.hidden=!reverse;
    if(reverse) reverseNote.textContent="입력 조건에서 목표 월 실수령액 이상을 받을 수 있는 최소 연봉입니다. 실제 급여는 회사 적용 기준과 지급 조건에 따라 달라질 수 있습니다.";
    $("detail").innerHTML=`<table class="detail-table"><thead><tr><th>공제 항목</th><th>금액</th></tr></thead><tbody>${[['국민연금',r.pension],['건강보험',r.health],['장기요양보험',r.care],['고용보험',r.employment],['근로소득세',r.incomeTax],['지방소득세',r.local],['합계',r.total]].map(x=>`<tr><td>${x[0]}</td><td>${fmt(x[1])}</td></tr>`).join('')}</tbody></table><table class="detail-table detail-assumptions"><tbody>${[['국민연금 기준소득월액',r.pensionBase],['건강보험 보수월액',r.healthBase],['간이세액표 기본세액',r.taxBase],['8~20세 자녀 공제',r.childDeduction]].map(x=>`<tr><td>${x[0]}</td><td>${fmt(x[1])}</td></tr>`).join('')}</tbody></table>`;
  }
  let current=null;
  let previousGrossMode="annual";
  const defaultCalculationMode=document.querySelector('input[name="calculation-mode"][value="forward"]');
  if(defaultCalculationMode) defaultCalculationMode.checked=true;
  $("gross-mode").value="annual";
  $("severance-mode").value="separate";
  document.querySelectorAll('input[name="calculation-mode"]').forEach(el=>el.addEventListener("change",updateCalculationMode));
  $("gross-mode").addEventListener("change",()=>{
    const nextMode=grossMode(), value=parseMoney($("gross").value);
    const conversionNotice=$("salary-conversion-notice");
    conversionNotice.hidden=true;
    conversionNotice.textContent="";
    if(Number.isSafeInteger(value)&&value>0&&nextMode!==previousGrossMode){
      const factor=severanceIncluded()?13:12;
      const converted=nextMode==="monthly"?Math.floor(value/factor):value*factor;
      $("gross").value=won.format(converted);
      const readout=$("gross").parentElement.querySelector(".amount-readable");
      readout.textContent="";
      readout.hidden=true;
      conversionNotice.textContent=nextMode==="monthly"?"연봉을 월 급여로 환산했습니다.":"월급여를 연봉으로 환산했습니다.";
      conversionNotice.hidden=false;
    }
    previousGrossMode=nextMode;
    updateGrossMode();
  });
  $("severance-mode").addEventListener("change",updateGrossMode);
  updateCalculationMode();
  updateCurrentPeriod();
  document.querySelectorAll(".amount-input").forEach(el=>{
    el.addEventListener("input",()=>{
      if(el.id==="gross"){
        const notice=$("salary-conversion-notice");
        notice.hidden=true;
        notice.textContent="";
      }
      updateReadableAmount(el);
    });
    if(parseMoney(el.value)>0) updateReadableAmount(el);
  });
  $("salary-form").addEventListener("input", () => { latestRequestId++; $("result").hidden=true; });
  $("salary-form").addEventListener("change", () => { latestRequestId++; $("result").hidden=true; });
  [$("gross"),$("target-net"),$("nontax"),$("pension-base-manual"),$("health-base-manual")].filter(Boolean).forEach(el=>el.addEventListener('blur',()=>{formatInput(el);updateReadableAmount(el);}));
  if (advancedEnabled) {
    $("advanced-insurance").hidden = false;
    ["pension-mode","health-mode"].forEach(id => $(id).addEventListener("change", () => {
      // 모드를 직접입력으로 바꿔도 이전 값은 자동 적용하지 않으며, 사용자가 입력한 유효값만 사용합니다.
      const field = id === "pension-mode" ? $("pension-base-manual") : $("health-base-manual");
      field.disabled = $(id).value !== "manual";
      if ($(id).value !== "manual") { field.value = ""; updateReadableAmount(field); }
    }));
    $("pension-base-manual").disabled = true; $("health-base-manual").disabled = true;
  }
  $("salary-form").addEventListener('submit', async (e)=>{
    e.preventDefault();
    const calcMode=calculationMode(), inputGross=parseMoney($("gross").value), mode=calcMode==="reverse"?"annual":grossMode();
    const targetNet=parseMoney($("target-net").value), nontax=parseMoney($("nontax").value);
    const annualFactor=severanceIncluded()?13:12;
    const monthlyGross=calcMode==="reverse"?Math.max(1,Number.isFinite(nontax)?nontax:1):(mode==="annual"&&Number.isFinite(inputGross)?Math.floor(inputGross/annualFactor):inputGross);
    current={calculationMode:calcMode,targetNet,month:updateCurrentPeriod(),gross:monthlyGross,inputGross:calcMode==="reverse"?monthlyGross:inputGross,grossMode:mode,annualGross:calcMode==="reverse"?null:(mode==="annual"?inputGross:null),severanceIncluded:calcMode==="reverse"?false:severanceIncluded(),nontax,dependents:Number($("dependents").value),children:Number($("children").value),withholding:Number(document.querySelector('input[name="withholding"]').value),
      pensionMode:advancedEnabled?$("pension-mode").value:"auto", healthMode:advancedEnabled?$("health-mode").value:"auto",
      pensionBaseManual:advancedEnabled?parseMoney($("pension-base-manual").value):null, healthBaseManual:advancedEnabled?parseMoney($("health-base-manual").value):null};
    const requestId = ++latestRequestId;
    const errors=validate(current);
    if(calcMode==="reverse"&&(!Number.isSafeInteger(targetNet)||targetNet<=0)) errors.push("목표 월 실수령액은 0원보다 큰 정수로 입력하세요.");
    if(errors.length){ $("result").hidden=true; $("error").hidden=false; $("error").textContent=errors.join(" "); return; }
    $("result").hidden=true; $("error").hidden=true;
    const submit=$("salary-form").querySelector('button[type="submit"]'); submit.disabled=true; submit.textContent="계산 기준 확인 중...";
    try {
      await ensureRules(current.month);
      await ensureTaxTable(current.month);
      if (requestId !== latestRequestId) return;
      const extraErrors=validateAdvancedInputs(current);
      if(extraErrors.length) throw new Error(extraErrors.join(" "));
      if(current.calculationMode==="reverse"){
        const found=findRequiredGross(current.targetNet,current);
        current.gross=found.gross; current.inputGross=found.gross; current.annualGross=found.gross*12;
        render(found.result);
      } else render(calculate(current));
      scrollToResultOnMobile();
    } catch(err) {
      if (requestId === latestRequestId) { $("result").hidden=true; $("error").hidden=false; $("error").textContent=err.message || "계산 기준 데이터를 불러오지 못했습니다."; }
    } finally { submit.disabled=false; submit.textContent=calculationMode()==="reverse"?"필요 연봉 계산하기":"실수령액 계산하기"; }
  });
  $("toggle-detail").addEventListener("click",()=>setDetailExpanded($("detail").hidden));
})();
