# 급여계산기 브라우저 테스트

이 폴더에는 급여계산기용 Playwright 테스트와 로컬 전용 테스트 서버가 있습니다. 테스트 서버는 `127.0.0.1:4179`에서만 열리며 외부 서비스로 요청을 보내지 않습니다.

## 준비

1. [Node.js](https://nodejs.org/) 20 이상을 설치합니다.
2. 터미널(PowerShell 또는 명령 프롬프트)에서 프로젝트의 `e2e` 폴더로 이동합니다.
3. 아래 명령으로 테스트 패키지를 설치합니다.

```powershell
cd 경로\salary-calculator-2026-final\e2e
npm ci
```

## Chromium 설치

최초 한 번 Chromium을 설치합니다.

```powershell
npx playwright install chromium
```

## 테스트 실행

```powershell
npm test
```

브라우저 창을 보면서 실행하려면 `npm run test:headed`를 사용합니다. Playwright는 테스트 실패 때에만 스크린샷을 남깁니다. 테스트 결과와 실패 스크린샷은 `e2e/test-results/`에 저장됩니다. HTML 리포터를 별도로 켜면 `e2e/playwright-report/`에도 리포트가 생성됩니다. 결과물을 다시 정리하려면 해당 폴더를 삭제하면 됩니다.

테스트 서버는 Playwright가 실행 중에 시작하고 끝나면 종료합니다. 직접 실행하려면 `node test-server.js`를 사용하고, 서버 종료는 Ctrl+C입니다. 서버는 로컬 프로젝트 파일만 제공합니다.
