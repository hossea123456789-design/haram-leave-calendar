# 하람 퇴근 캘린더 v013

메이플 장부 구조를 기준으로 재정리한 GitHub Pages + Google Sheets DB 버전입니다.

## GitHub에 올릴 파일
- index.html

이번 버전은 캐시 꼬임을 줄이기 위해 CSS/JS를 모두 index.html 안에 넣은 단일 HTML 구조입니다.

## Apps Script에 붙여넣을 파일
- Code.gs.txt 전체 복사 → Apps Script의 Code.gs에 붙여넣기

## 기본 API URL
https://script.google.com/macros/s/AKfycbwgpvNOTMZQppKmLdYBj_238uGSN4fHlRGu1__5yth-oxl4rhc7zF5bS-magPk-weSM1w/exec

## 핵심 구조
GitHub Pages(index.html) → Apps Script Web App API → Google Sheets(AttendanceDB)

## Apps Script 배포 설정
- 실행 사용자: 나
- 액세스 권한: 모든 사용자
- URL 끝: /exec

## 확인 주소
https://hossea123456789-design.github.io/haram-leave-calendar/?v=013
