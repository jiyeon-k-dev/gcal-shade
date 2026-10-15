# GCal Shade

구글 캘린더 주/일 보기에서 요일·시간대 규칙에 따라 배경색을 칠하는 크롬 확장 프로그램.

## 설치
1. `chrome://extensions` → 우측 상단 **개발자 모드** 켜기
2. **압축해제된 확장 프로그램을 로드합니다** → 이 폴더 선택
3. 툴바의 확장 아이콘을 눌러 규칙 편집

## 동작 방식
- `[role="gridcell"][data-datekey]` 컬럼을 찾아 맨 아래 레이어로 색 밴드를 넣는다 (일정 칩보다 아래, 클릭 통과).
- `data-datekey` = `((year-1970)<<9) | (month<<5) | day`
- 구글 캘린더 DOM이 바뀌면 `content.js`의 `findDayColumns()`만 고치면 된다.

## 여러 컴퓨터에서 쓰기
- `manifest.json`의 `key` 덕분에 어느 컴퓨터에서 로드해도 확장 ID가 `kehmmdlnelgepaehiifdcnlnhoglfibo`로 같다.
- 설정은 `chrome.storage.sync`에 저장되므로, 같은 크롬 계정이면 규칙/예외가 자동 동기화된다.
- `key`는 공개키라 커밋해도 된다. (개인키는 로컬 로드에 필요 없어 보관하지 않음)
