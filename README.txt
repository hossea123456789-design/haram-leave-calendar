하람 퇴근 캘린더 v014

구조:
- GitHub Pages: index.html 단일 파일 프론트엔드
- Google Apps Script: API 전용
- Google Sheets: AttendanceDB 시트 DB

GitHub에 올릴 파일:
- index.html

Apps Script에 붙여넣을 파일:
- Code.gs.txt

중요 변경:
- v013의 fetch 방식은 일부 환경에서 CORS/redirect 문제로 Failed to fetch가 발생할 수 있어 제거했습니다.
- v014는 읽기(loadAll)를 JSONP로 처리합니다.
- 저장(saveAttendance)은 긴 JSON URL 제한을 피하기 위해 hidden iframe POST + postMessage 방식으로 처리합니다.
- localStorage 캐시는 v014 우선, v013/v012/v011 캐시도 자동 승계합니다.

배포 후 접속:
https://hossea123456789-design.github.io/haram-leave-calendar/?v=014
