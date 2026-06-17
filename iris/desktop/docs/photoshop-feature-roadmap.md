# Iris-Desktop — Photoshop 기능 갭 로드맵

> 세션 참조 문서. 구현 완료 시 `- [ ]` → `- [x]` 업데이트.
> 마지막 업데이트: 2026-03-04

---

## 핵심 파일 위치

| 파일 | 역할 |
|-----|------|
| `src/stores/imageEditor.store.ts` | 전체 에디터 상태 (1444줄) |
| `src/lib/canvas/brushEngine.ts` | 브러시/드로잉 엔진 |
| `src/lib/canvas/filters.ts` | 픽셀 단위 필터 함수 (13종) |
| `src/lib/canvas/canvasEngine.ts` | 레이어 합성 + 조정 적용 |
| `src/lib/canvas/selectionEngine.ts` | 선택 영역 생성/변환 |
| `src/components/image-editor/Toolbar/ToolPanel.tsx` | 좌측 툴바 UI |
| `src/components/image-editor/OptionsBar/` | 상단 옵션바 (도구별 옵션) |
| `src/components/image-editor/Properties/` | 우측 속성 패널 |
| `src/components/image-editor/RightPanel/LayersPanel.tsx` | 레이어 패널 |
| `src/components/image-editor/Canvas/DrawingCanvas.tsx` | 드로잉 캔버스 오버레이 |
| `src/lib/psd/importPsd.ts` + `exportPsd.ts` | PSD 임포트/익스포트 |

---

## 현재 구현 완료 상태

### 도구
- [x] 브러시 / 연필 / 지우개
- [x] 클론 스탬프
- [x] 그라디언트 / 버킷 / 스포이드
- [x] 선택: 사각형 / 원형 / 라쏘 / 폴리라쏘 / 매직완드
- [x] 셰이프: 사각형 / 원 / 선 / 화살표 / 폴리곤 / 별
- [x] 텍스트 (포인트 텍스트)
- [x] 이동 (Move)
- [x] 크롭 (Crop)
- [x] 트랜스폼: 회전 / 플립 / 스케일 / 스큐 / 퍼스펙티브

### 레이어
- [x] 레이어 추가 / 삭제 / 이동 / 복제
- [x] 16종 블렌드 모드 (per-layer)
- [x] 레이어 마스크
- [x] 클리핑 마스크
- [x] 레이어 이펙트: 드롭섀도 / 글로우 / 베벨

### 조정 (파괴적)
- [x] Brightness / Contrast
- [x] Saturation / Hue
- [x] Exposure / Gamma
- [x] Temperature / Tint
- [x] Highlights / Shadows
- [x] Clarity / Vibrance
- [x] 필터 프리셋 10종 (Vivid, Warm, Cool, B&W, Sepia, Dramatic, Faded, Vintage, Cinematic)

### 필터 (파괴적)
- [x] Gaussian Blur / Motion Blur
- [x] Sharpen / Unsharp Mask
- [x] Add Noise / Reduce Noise
- [x] Pixelate / Emboss / Edge Detect
- [x] Vignette / Posterize / Invert / Grayscale / Sepia

### AI 도구
- [x] 업스케일 (2x/4x)
- [x] 배경 제거
- [x] 인페인트
- [x] 아웃페인트
- [x] 페이스 리스토어 (GFPGAN / CodeFormer)
- [x] 컬러라이즈

### 기타
- [x] 히스토리 / 언두-리두 (50단계)
- [x] PSD 임포트 / 익스포트
- [x] PNG / JPG / WebP / PDF 익스포트
- [x] 멀티탭 편집

---

## Phase 1 — 핵심 도구 (Priority 1)

### 1-A. Healing Brush / Spot Healing Brush ✅
- [x] `DrawTool` 타입에 `'healing' | 'spot-healing'` 추가 (`imageEditor.store.ts`)
- [x] `brushEngine.ts`: 소스 픽셀 샘플링 + 주변 색/밝기 블렌딩 알고리즘
- [x] Spot Healing: 주변 자동 샘플링 (소스 지정 불필요)
- [x] Healing Brush: Alt+클릭으로 소스 지정, 스트로크 시 블렌딩
- [x] `ToolPanel.tsx`: 도구 아이콘 추가 (브러시 그룹 내)
- [x] `DrawingOptions.tsx`: Size / Opacity / Hardness + Alt+click hint

### 1-B. Dodge / Burn / Sponge ✅
- [x] `DrawTool` 타입에 `'dodge' | 'burn' | 'sponge'` 추가
- [x] `brushEngine.ts`: 픽셀 밝기/채도 조정 연산 추가
  - Dodge: `pixel + (255 - pixel) * exposure`
  - Burn: `pixel * (1 - exposure)`
  - Sponge: 채도 ± amount (HSL 변환)
- [x] `ToolPanel.tsx`: 도구 아이콘 추가
- [x] `DrawingOptions.tsx`: Range(Shadows/Midtones/Highlights) + Exposure 슬라이더

### 1-C. Smudge / Blur / Sharpen 브러시 ✅
- [x] `DrawTool` 타입에 `'smudge' | 'blur-brush' | 'sharpen-brush'` 추가
- [x] `brushEngine.ts`: 브러시 반경 내 국소 필터 적용
  - Blur Brush: 소반경 gaussianBlur
  - Sharpen Brush: 소반경 sharpen
  - Smudge: 이전↔현재 픽셀 interpolation
- [x] `ToolPanel.tsx`: 도구 아이콘 추가
- [x] `DrawingOptions.tsx`: Strength 슬라이더

### 1-D. Curves 조정 ✅
- [x] `AdjustmentValues`에 `curves` 필드 추가 (4채널: RGB, R, G, B)
- [x] `filters.ts`: `applyCurves(imageData, curvePoints[])` — 단조 3차 스플라인 LUT
- [x] `canvasEngine.ts`: `applyAdjustmentsToCanvas`에 Curves 적용 블록 추가
- [x] `AdjustPanel.tsx`: SVG 기반 곡선 편집 UI (드래그 포인트, 채널 탭, 추가/제거)

### 1-E. Levels 조정 ✅
- [x] `AdjustmentValues`에 `levels` 필드 추가 (inputBlack, inputWhite, gamma, outputBlack, outputWhite)
- [x] `filters.ts`: `computeHistogram(imageData)` + `applyLevels(imageData, levels)` — LUT 사전계산
- [x] `canvasEngine.ts`: `applyAdjustmentsToCanvas`에 Levels 적용 블록 추가
- [x] `AdjustPanel.tsx`: 히스토그램 표시 + Input(Black/Gamma/White) + Output(Black/White) 슬라이더

### 1-F. Layer Groups / Folders ✅
- [x] `Layer` 인터페이스 확장: `type: 'raster' | 'group'`, `children?: string[]`, `isExpanded?: boolean`, `parentId?: string`
- [x] `imageEditor.store.ts`: `createLayerGroup`, `moveLayerToGroup`, `toggleGroupExpansion`, `ungroupLayers` 액션
- [x] `LayersPanel.tsx`: 들여쓰기 렌더링, 토글, 그룹 아이콘, 레이어→그룹 이동 select, Ungroup 버튼

### 1-G. Adjustment Layers (비파괴) ✅
- [x] `Layer` 인터페이스 확장: `type: 'adjustment'`, `adjustmentType: AdjustmentLayerType`, `adjustmentValues`
- [x] `EditorCanvas.tsx`: 레이어 렌더링 스택에서 adjustment 레이어 만나면 `applyAdjustmentsToCanvas` 즉시 적용
- [x] `LayersPanel.tsx`: 파란색 SunMedium 아이콘 + adjustmentType 표시 + "Add Adjustment Layer" 드롭다운
- [x] `imageEditor.store.ts`: `addAdjustmentLayer`, `updateAdjustmentLayer` 액션

---

## Phase 2 — 선택/변형/채색 강화 (Priority 2)

### 2-A. Select Subject (AI 자동 선택) ✅
- [x] 배경제거 API 결과 마스크 → 선택 영역 변환 함수
- [x] `selectionEngine.ts`: `loadMaskAsSelection(dataUrl)` + `loadSelectionMask(dataUrl)` 추가
- [x] `imageEditor.store.ts`: `selectSubject()` 액션 (BG 제거 API → 알파 채널 → 선택 영역)
- [x] `SelectionOptions.tsx`: "Select Subject" 버튼 추가

### 2-B. Refine Edge / Select and Mask ✅
- [x] `selectionEngine.ts`: `refineEdge(mask, width, height, options)` 추가
- [x] Edge-aware 경계 정밀화 (expand → smooth → contrast boost → feather)
- [x] `imageEditor.store.ts`: `refineEdge()` 액션
- [x] `SelectionOptions.tsx`: "Refine Edge" 드롭다운 패널 (Radius/Smooth/Feather/Contrast 슬라이더)

### 2-C. Warp Transform (실제 구현) ✅
- [x] `canvasEngine.ts`: `applyWarpToCanvas(source, grid)` — 3×3 그리드 바이리니어 메쉬 워프
- [x] `canvasEngine.ts`: `createDefaultWarpGrid(width, height)` 헬퍼
- [x] `imageEditor.store.ts`: `isWarpMode`, `warpGrid` 상태 + `enterWarpMode`, `exitWarpMode`, `updateWarpPoint`, `resetWarpGrid`, `applyWarp` 액션
- [x] `WarpOverlay.tsx` (신규): SVG 9핸들 드래그 UI + 메쉬 라인 + Apply/Cancel/Reset 버튼
- [x] `EditorCanvas.tsx`: isWarpMode일 때 WarpOverlay 렌더링
- [x] `TransformOptions.tsx`: "Warp" 버튼 추가

### 2-D. Content-Aware Move
- [ ] Move 도구에 "Content-Aware" 옵션 추가
- [ ] 이동 후 원래 영역에 아웃페인트 API 자동 호출
- [ ] `imageEditor.store.ts`: `contentAwareMove` 액션

### 2-E. Color Balance 조정 ✅
- [x] `AdjustmentValues`에 `colorBalance` 필드 추가 (shadows/midtones/highlights × RGB)
- [x] `filters.ts`: `applyColorBalance(imageData, colorBalance)` — 밝기 범위별 색 이동
- [x] `AdjustPanel.tsx`: Shadows/Midtones/Highlights 탭 + Cyan-Red, Magenta-Green, Yellow-Blue 슬라이더

### 2-F. Hue/Saturation 채널별 ✅
- [x] `AdjustmentValues`에 `hueSatChannels` 필드 추가 (7채널: Master + 6색상)
- [x] `filters.ts`: `applySelectiveHSL(imageData, channel, hsl)` — 색상 범위 마스킹 + HSL 변환
- [x] `AdjustPanel.tsx`: 채널 선택 드롭다운 + H/S/L 슬라이더 3개

---

## Phase 3 — 고급 기능 (Priority 3)

- [ ] **3-1. Pen Tool** — SVG 패스 오버레이, 베지어 핸들, 패스→선택 변환
- [ ] **3-2. Paragraph Text** — 텍스트 레이어에 `boundingBox` 추가, 자동 줄바꿈
- [ ] **3-3. Text on Path** — 패스 위 텍스트 배치 (Pen Tool 선행)
- [ ] **3-4. Filter Gallery** — 13종 필터 시각적 미리보기 그리드 UI
- [ ] **3-5. Channels 패널** — R/G/B/Alpha 채널 독립 시각화/편집
- [ ] **3-6. Smart Objects** — `type: 'smart-object'`, 원본 보존 + 비파괴 변형
- [ ] **3-7. Smart Filters** — Smart Object에 필터 스택 (비파괴)
- [ ] **3-8. Selective Color** — 8색상 × CMYK 미세 조정
- [ ] **3-9. Gradient Map** — 그라디언트를 톤 맵으로 적용
- [ ] **3-10. Photo Filter** — 색 온도 필터 레이어 (Warming/Cooling)
- [ ] **3-11. Threshold** — 임계값 기반 이진 흑백 변환
- [ ] **3-12. Histogram 패널** — 실시간 R/G/B/Luminosity 히스토그램
- [ ] **3-13. Info 패널 강화** — 커서 픽셀값 실시간 표시 (RGB/HSL/CMYK)
- [ ] **3-14. Actions / Macro** — 동작 녹화/재생 (store dispatch 로그 기반)
- [ ] **3-15. Artboards** — 멀티 캔버스
- [ ] **3-16. Camera Raw Filter** — RAW 파일 파싱
- [ ] **3-17. Puppet Warp** — 삼각형 메쉬 핀 변형

---

## 구현 의존성

```
1-D (Curves) ──┐
1-E (Levels) ──┤──→ 1-G (Adjustment Layers) ──→ 3-7 (Smart Filters)
1-F (Groups) ──┘──────────────────────────────→ 3-6 (Smart Objects)
1-B (Dodge/Burn) ──→ 1-A (Healing Brush)   [brushEngine 공유]
1-C (Smudge 브러시) ─┘
3-1 (Pen Tool) ──→ 3-3 (Text on Path)
2-A (AI Select) ──→ 2-B (Refine Edge)
```

---

## 검증 체크리스트

각 기능 완료 후:
- [ ] `cd iris-desktop && yarn test:run` 통과
- [ ] `yarn dev` 수동 동작 확인
- [ ] Phase 1-F/1-G: PSD 임포트/익스포트 레이어 구조 유지 확인
- [ ] Phase 1-D/1-E: 조정 전후 히스토그램 비교

---

## 구현 메모

> 구현 중 발견한 이슈나 결정 사항을 여기에 기록

- (2026-03-04) 로드맵 문서 초기 생성. 분석 기준: iris-desktop v현재 커밋
