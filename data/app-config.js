/* 운영 기능 설정
 * features.enableAdvancedInsuranceInput: boolean false(기본값)=고급 직접입력 OFF, true=ON.
 * 허용값은 불리언만 사용합니다. 문자열 "true"/"false"는 사용하지 마세요.
 * true로 바꾸면 보험료 기준금액 직접입력 UI가 나타납니다. 일반 사용자는 이 파일을 바꿀 수 없습니다.
 * SEO/표시 설정은 법정 요율과 분리하며, 설정 변경은 화면 기능에만 영향을 줍니다.
 */
window.APP_CONFIG = {
  features: {
    enableAdvancedInsuranceInput: false // 기본값 false. true일 때만 직접입력 기능 활성화
  },
  display: {
    showInsuranceModeLabels: true // true/false. 보험료 산정 방식 안내 표시 여부
  }
};
