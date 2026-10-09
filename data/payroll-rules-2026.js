/* 2026년 급여 실수령액 계산 규칙
 * 공식자료 기준. 모든 변경값은 여기서 관리한다.
 */
window.PAYROLL_RULES_2026 = {
  year: 2026,
  pension: {
    employeeRate: 0.0475,
    periods: [
      { from: "2026-01-01", to: "2026-06-30", min: 400000, max: 6370000 },
      { from: "2026-07-01", to: "2026-12-31", min: 410000, max: 6590000 }
    ],
    incomeTruncateUnit: 1000
  },
  health: {
    totalRate: 0.0719,
    employeeRate: 0.03595,
    minTotalPremium: 20160,
    maxTotalPremium: 9183480
  },
  longTermCare: {
    rateOnHealth: 0.1314,
    incomeRate: 0.009448
  },
  employment: { employeeRate: 0.009 },
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
