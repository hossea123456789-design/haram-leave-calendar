하람 퇴근 캘린더 웹앱 v0.6

GitHub Pages에 올릴 파일:
- index.html
- styles.css
- app.js
- manifest.webmanifest

변경 사항:
- 페이지 진입 시 전체 화면 로딩 팝업을 띄우지 않음
- 기존 방문자는 브라우저 로컬 캐시 데이터를 먼저 즉시 표시
- Google Sheets 최신 데이터는 상단 제목 영역의 작은 진행 표시로 백그라운드 로드
- 진행률은 0~100% 퍼센트로 표시
- 불러오기 완료 후 최신 데이터로 자동 갱신
- JSON 입력창은 새 JSON 붙여넣기 시 기존 내용을 자동 교체
- app.js에 기본 Apps Script /exec URL 반영

GitHub 반영:
1. ZIP 압축 해제
2. 위 4개 파일을 저장소 루트에 업로드/교체
3. Commit changes
4. GitHub Actions에서 Pages 배포 완료 확인
5. 모바일은 ?v=6 형태로 캐시 우회 접속


v0.7: 로딩 진행 표시를 화면 우측 상단 고정 토스트로 변경하고, 100% 완료/오류 상태를 최소 시간 유지하도록 수정했습니다.


v0.9: 기본 Apps Script URL을 localStorage보다 우선 사용하도록 수정. 삼성 브라우저 등 이전 URL 캐시 문제 완화.


v010 변경점:
- index.html에서 app.js/styles.css/manifest에 ?v=010 캐시 버스터 적용
- 삼성 브라우저 등에 남은 과거 Apps Script URL localStorage 캐시 자동 정리
- 기본 Apps Script /exec URL을 localStorage보다 우선 사용
- 근태 데이터 로컬 캐시는 유지하고 DB 연결 캐시만 초기화
