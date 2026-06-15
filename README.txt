하람 퇴근 캘린더 v0.4

GitHub Pages 업로드 파일:
- index.html
- styles.css
- app.js
- manifest.webmanifest

Google Apps Script에는 google-apps-script/Code.gs 또는 별도 제공된 wife-leave-calendar-Code-v004-token-set.txt 전체를 붙여넣으세요.

중요 변경:
- 저장은 긴 URL 문제를 피하기 위해 form POST로 전송합니다.
- Code.gs에 doPost가 추가되어 있어야 저장됩니다.
- Apps Script URL은 /exec로 끝나야 하며, 앱에서 자동 보정합니다.
- 달력은 일월화수목금토 기준입니다.
