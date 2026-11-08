/* 연도별 계산 데이터 매니페스트
 * from/to는 해당 파일이 법적으로 유효한 기간입니다. 기간은 겹치지 않도록 관리하세요.
 * src는 salary/index.html 기준 상대 경로이며, globalName은 파일이 생성하는 전역 데이터 이름입니다.
 * 새 연도는 공식 자료를 검증한 뒤 세액표와 보험료 규칙을 모두 등록해야 합니다.
 * defaultHistoryYears=10은 조회 기본 범위이며 과거 파일 삭제를 뜻하지 않습니다.
 */
window.TAX_TABLE_MANIFEST = {
  defaultHistoryYears: 10,
  tables: [
    { id: "income-tax-2026", year: 2026, from: "2026-01-01", to: "2026-12-31", src: "../data/income-tax-2026.js", globalName: "INCOME_TAX_2026" }
  ],
  rules: [
    { id: "payroll-rules-2026", year: 2026, from: "2026-01-01", to: "2026-12-31", src: "../data/payroll-rules-2026.js", globalName: "PAYROLL_RULES_2026" }
  ]
};
