/* 2026년 급여 실수령액 계산 규칙
 * 운영 기능 설정(data/app-config.js)과 법정 계산 기준을 분리합니다.
 * 요율은 소수와 백분율을 함께 확인하세요: 0.0475 = 4.75%.
 * 적용기간별 값만 사용하며, 미등록 기간에 다른 연도 값을 대체 적용하지 않습니다.
 * 공식 기준·끝수 처리 변경 시 근거와 회귀 테스트를 함께 갱신하세요.
 */
window.PAYROLL_RULES_2026 = {
  year: 2026,
  pension: {
    employeeRate: 0.0475, // 근로자 부담률 4.75% (소수 0.0475)
    periods: [
      { from: "2026-01-01", to: "2026-06-30", min: 400000, max: 6370000 },
      { from: "2026-07-01", to: "2026-12-31", min: 410000, max: 6590000 }
    ],
    incomeTruncateUnit: 1000
  },
  health: {
    totalRate: 0.0719, // 건강보험 전체 요율 7.19% (소수 0.0719)
    employeeRate: 0.03595, // 근로자 부담분 3.595% (소수 0.03595)
    minTotalPremium: 20160,
    maxTotalPremium: 9183480
  },
  longTermCare: {
    // 법정 산식: 건강보험료 × 장기요양보험료율 ÷ 건강보험료율
    // 0.9448% ÷ 7.19% = 9448 ÷ 71900 (반올림한 13.14%를 직접 곱하지 않음)
    ratioNumerator: 9448,
    ratioDenominator: 71900,
    incomeRate: 0.009448
  },
  employment: { employeeRate: 0.009 }, // 근로자 부담률 0.9% (소수 0.009)
  incomeTax: {
    tableEffectiveFrom: "2026-01-01",
    childAdjustmentEffectiveFrom: "2026-03-01",
    withholdingOptions: [0.8, 1, 1.2],
    defaultWithholding: 1,
    taxTruncateUnit: 10,
    childAdjustmentTruncateUnit: 1
  },
  localIncomeTax: {
    rate: 0.10,
    truncateUnit: 10
  },
  display: { numberLocale: "ko-KR", currency: "원" }
};
