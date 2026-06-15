하람 퇴근 캘린더 v0.3

변경사항
- 월간 달력을 일/월/화/수/목/금/토 순서로 수정했습니다.
- 2026년 6월처럼 1일이 월요일인 달은 일요일 칸을 비우고 월요일 칸부터 1일을 배치합니다.
- 이번 주 요약도 일요일 시작 기준으로 맞췄습니다.
- 크롬 확장 JSON에서 leaveKind가 planned인데 leave가 17:30 기본값으로 잘못 들어오는 경우, start + target + nonWork + 기본 휴게 1시간 기준으로 화면 표시용 퇴근 예정 시간을 보정합니다.
- 휴가/공휴일/주말은 leave를 null로 정리하고, 공휴일/주말에 섞여 들어오는 target/nonWork 00:00 기본값은 표시하지 않습니다.
- 보정 발생 시 진단 영역에 원래값→보정값을 표시합니다.

GitHub에 올릴 파일
- index.html
- styles.css
- app.js
- manifest.webmanifest

Google Apps Script Code.gs는 기존 것을 그대로 사용해도 됩니다.
