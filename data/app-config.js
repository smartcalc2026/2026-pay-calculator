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
    showInsuranceModeLabels: true, // true/false. 보험료 산정 방식 안내 표시 여부
    fixedWithholdingNotice: "회사 적용 원천징수 비율(80%·100%·120%)에 따라 실제 급여명세서와 차이가 날 수 있습니다. 이 계산기는 100% 기준으로 계산합니다.",
    // 공개 안내 문구 수정 방법: text를 고치고, 숨길 줄은 visible을 false로 설정합니다.
    // 섹션 전체를 숨기려면 해당 sections 항목의 visible을 false로 설정합니다.
    publicGuidance: {
      visible: true,
      title: "계산 기준 및 안내",
      sections: [
        {
          visible: true,
          title: "계산 기준",
          items: [
            { visible: true, text: "2026년 기준으로 예상 실수령액을 계산합니다." },
            { visible: true, text: "근로소득세는 근로소득 간이세액표를 기준으로 계산합니다." },
            { visible: true, text: "국민연금 기준소득월액 상·하한은 2026년 7월부터 변경됩니다." },
            { visible: true, text: "8~20세 자녀 공제는 2026년 3월부터 반영합니다." }
          ]
        },
        {
          visible: true,
          title: "이용 시 참고사항",
          items: [
            { visible: true, text: "비과세액은 항목별로 나누지 않고 합계로 입력합니다. 비과세 항목마다 보험료 산정 기준이 다를 수 있어 실제 급여명세서와 계산 결과에 차이가 날 수 있습니다." },
            { visible: true, text: "입력한 급여 정보는 이 페이지의 브라우저에서만 계산하며 서버로 전송하거나 저장하지 않습니다." },
            { visible: true, text: "계산 결과는 참고용이며 실제 급여·세무 신고 결과를 보장하지 않습니다." }
          ]
        },
        {
          visible: true,
          title: "공식 출처",
          items: [
            { visible: true, text: "국민연금공단", url: "https://www.nps.or.kr/" },
            { visible: true, text: "국민건강보험공단", url: "https://www.nhis.or.kr/" },
            { visible: true, text: "보건복지부", url: "https://www.mohw.go.kr/" },
            { visible: true, text: "국세청", url: "https://www.nts.go.kr/" },
            { visible: true, text: "국가법령정보센터", url: "https://www.law.go.kr/" }
          ]
        }
      ]
    }
  }
};
