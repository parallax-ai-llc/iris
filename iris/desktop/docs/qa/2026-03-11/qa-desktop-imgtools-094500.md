# QA Report: Desktop (Focused: 이미지 에디터 핵심 도구 + 필터 수정 검증)
- Date: 2026-03-11 09:45 KST
- Client: desktop (Electron)
- Tool: Playwright CDP (port 9225)
- Branch: dev/2026-03-10

## Summary
- Features tested: 22
- Passed: 21 / Failed: 0
- Issues found: 2 (Critical: 0, Warning: 1, Info: 1)

## Phase 1: 로그인 + 이미지 에디터 진입
| Test | Result |
|------|--------|
| App launch and login (auto-session) | PASS |
| Navigate to Images page | PASS |
| Open test image in editor via API | PASS |
| Editor UI loads (menubar, toolbar, layers, history) | PASS |

## Phase 2: 필터 수정 검증
| Filter | Menu Path | History Changed | History Label | Result |
|--------|-----------|-----------------|---------------|--------|
| Blur | Filter > Blur > Blur | Yes (1->2) | "Blur" | PASS |
| Sharpen | Filter > Sharpen > Sharpen | Yes (2->3) | "Sharpen" | PASS |
| Find Edges | Filter > Stylize > Find Edges | Yes (3->4) | "Find Edges" | PASS |
| Emboss | Filter > Stylize > Emboss | Yes (4->5) | "Emboss" | PASS |
| Add Noise | Filter > Noise > Add Noise | Yes (5->6) | "Add Noise" | PASS |
| Crystallize | Filter > Pixelate > Crystallize | Yes (6->7) | "Crystallize" | PASS |
| Invert | Filter > Adjustments > Invert | Yes (7->8) | "Invert" | PASS |
| Grayscale | Filter > Adjustments > Grayscale | Yes (8->9) | "Grayscale" | PASS |

### Undo/Redo 검증
| Test | Result |
|------|--------|
| Undo (Cmd+Z) reverts history index | PASS (9->8) |
| Redo (Cmd+Shift+Z) advances history index | PASS (8->9) |

**Note:** Filter submenu items could not be clicked via `page.mouse.click()` coordinates due to CDP/DPR coordinate mismatch. Direct DOM `button.click()` via `page.evaluate()` worked correctly. This is a Playwright-CDP test infrastructure issue, not an app bug.

## Phase 3: Select All
| Test | Result |
|------|--------|
| "All" menu item exists in Select menu | PASS |
| Select All creates selection (selection !== null) | PASS |
| Deselect clears selection (selection === null) | PASS |

## Phase 4: 드로잉 도구
| Shortcut | Expected Mode | Actual Mode | Result |
|----------|--------------|-------------|--------|
| V | move | move | PASS |
| B | drawing | drawing | PASS |
| E | drawing | drawing | PASS |
| T | text | text | PASS |
| C | crop | crop | PASS |
| M | select | select | PASS |

### 드로잉 서브도구 전환 (Photoshop-style double press)
| Action | Expected | Actual | Result |
|--------|----------|--------|--------|
| B (from move) | editMode=drawing | editMode=drawing | PASS |
| B (already in drawing) | activeTool=brush | activeTool=brush | PASS |
| E (in drawing) | activeTool=eraser | activeTool=eraser | PASS |

**Note:** First press of B/E switches to drawing mode; second press (when already in drawing mode) switches the sub-tool. This matches Photoshop behavior.

## Phase 5: 레이어 관리
| Test | Result |
|------|--------|
| Layer count = 1 (Background) | PASS |
| Layer name = "Background" | PASS |
| Layer visible = true | PASS |
| Layer opacity = 100% | PASS |

## Phase 6: 콘솔 에러 체크
| Error | Count | Severity |
|-------|-------|----------|
| `updater:getStatus` handler not registered | 4 | Info |

No image-editor-related JavaScript errors detected.

## Issues

### [WARNING] #1: Escape 키가 에디터 탭을 닫음
- **Description:** 이미지 에디터에서 Escape 키를 누르면 에디터 탭이 닫히고 이전 페이지(Images)로 돌아감. 메뉴가 열려 있을 때 Escape를 누르면 메뉴 닫힘 대신 에디터 탭이 닫히는 문제 발생 가능.
- **Expected behavior:** 메뉴가 열려 있으면 메뉴를 닫고, 메뉴가 닫혀 있으면 에디터 탭을 닫거나 확인 다이얼로그를 표시해야 함.
- **Reproduction:** 이미지 에디터 열기 > Filter 메뉴 열기 > Escape 키 누르기 > 에디터 탭이 닫힘
- **Severity:** Warning (사용자가 필터 메뉴를 취소하려다 작업 중인 편집을 잃을 수 있음)

### [INFO] #2: updater:getStatus 핸들러 미등록
- **Description:** 개발 모드에서 auto-updater IPC 핸들러가 등록되지 않아 `Error invoking remote method 'updater:getStatus'` 에러가 4회 발생.
- **Impact:** 기능적 영향 없음 (개발 모드 전용).
- **Severity:** Info
