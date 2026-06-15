하람 퇴근 캘린더 - Google Sheets DB 연동판 v0.2

[GitHub Pages에 올릴 파일]
- index.html
- styles.css
- app.js
- manifest.webmanifest

[GitHub에 올리지 말 것]
- google-apps-script/Code.gs 안에 실제 WRITE_TOKEN을 넣은 파일

[Google Sheets 설정]
1. 새 Google Sheets 생성
2. 확장 프로그램 > Apps Script
3. google-apps-script/Code.gs 내용을 붙여넣기
4. WRITE_TOKEN을 임의 문자열로 변경
5. 배포 > 새 배포 > 웹 앱
6. 실행 권한: 나
7. 액세스 권한: 모든 사용자
8. /exec로 끝나는 URL 복사

[프론트 설정]
방법 A: GitHub 배포 전 app.js 상단 CONFIG.SHEETS_API_URL에 /exec URL 입력
방법 B: 웹앱 접속 후 관리자 > Apps Script URL 입력 > 연동 설정 저장

와이프 휴대폰에서 별도 설정 없이 보이게 하려면 방법 A가 더 좋습니다.
관리자 저장 작업에는 WRITE_TOKEN이 필요합니다.

[사용 흐름]
1. 크롬 확장에서 근태 JSON 복사
2. 웹앱 관리자 화면에 붙여넣기
3. '시트에 저장' 클릭
4. 와이프는 GitHub Pages 주소에서 최신 캘린더 확인
