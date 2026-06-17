; Iris Desktop — Custom NSIS Installer Pages (Black & Silver Theme)
; Adds: (1) media assets folder selection, (2) desktop shortcut checkbox

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; All custom variables are only needed during installer (not uninstaller) build
!ifndef BUILD_UNINSTALLER
Var AssetsDir
Var ShortcutState
!ifndef ONE_CLICK
Var AssetsDirText
Var AssetsDirBrowse
Var ShortcutCheck
!endif
!endif

; ── Visual theme overrides (installer build only) ───────────────────────────
!macro customHeader
  !ifndef BUILD_UNINSTALLER
    ; Override default NSIS wizard bitmap with dark sidebar
    !ifdef MUI_WELCOMEFINISHPAGE_BITMAP
      !undef MUI_WELCOMEFINISHPAGE_BITMAP
    !endif
    !define MUI_WELCOMEFINISHPAGE_BITMAP "${__FILEDIR__}\sidebar.bmp"
    !define MUI_WELCOMEFINISHPAGE_BITMAP_NOSTRETCH

    !ifdef MUI_UNWELCOMEFINISHPAGE_BITMAP
      !undef MUI_UNWELCOMEFINISHPAGE_BITMAP
    !endif
    !define MUI_UNWELCOMEFINISHPAGE_BITMAP "${__FILEDIR__}\sidebar.bmp"

    ; Header image (right side of each page header)
    !define MUI_HEADERIMAGE
    !define MUI_HEADERIMAGE_BITMAP "${__FILEDIR__}\header.bmp"
    !define MUI_HEADERIMAGE_BITMAP_NOSTRETCH
  !endif
!macroend

; ── Initialize variables with defaults ─────────────────────────────────────
!macro customInit
  !ifndef BUILD_UNINSTALLER
    StrCpy $AssetsDir "$DOCUMENTS\Iris"
    StrCpy $ShortcutState 1
  !endif
!macroend

; ── Insert custom options page after install-directory page ─────────────────
; Only used in assisted (non-oneClick) installer mode. In oneClick mode there
; is no wizard, so this hook is not called by electron-builder and the page
; functions below must not be compiled (otherwise NSIS warning 6010 fails the build).
!macro customPageAfterChangeDir
  !ifndef BUILD_UNINSTALLER
  !ifndef ONE_CLICK
    Page custom OptionsPage OptionsPageLeave
  !endif
  !endif
!macroend

; ── Page functions (assisted installer build only) ────────────────────────
!ifndef BUILD_UNINSTALLER
!ifndef ONE_CLICK

Function OptionsPage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  SetCtlColors $0 "C0C0C0" "0A0A0B"

  ; --- Assets folder section ---
  ${NSD_CreateGroupBox} 0 0 100% 54u "미디어 파일 저장 위치"
  Pop $0
  SetCtlColors $0 "9CA3AF" "0A0A0B"

  ${NSD_CreateLabel} 8u 16u 100% 12u "생성된 이미지와 비디오를 저장할 폴더를 선택하세요."
  Pop $0
  SetCtlColors $0 "9CA3AF" "0A0A0B"

  ${NSD_CreateDirRequest} 8u 32u 72% 14u "$AssetsDir"
  Pop $AssetsDirText
  SetCtlColors $AssetsDirText "E4E4E7" "18181B"

  ${NSD_CreateBrowseButton} 82% 31u 16% 16u "..."
  Pop $AssetsDirBrowse
  GetFunctionAddress $0 OnBrowseBtn
  nsDialogs::OnClick $AssetsDirBrowse $0

  ; --- Desktop shortcut section ---
  ${NSD_CreateGroupBox} 0 62u 100% 32u "바탕화면 바로가기"
  Pop $0
  SetCtlColors $0 "9CA3AF" "0A0A0B"

  ${NSD_CreateCheckbox} 8u 78u 100% 14u "바탕화면에 바로가기 만들기"
  Pop $ShortcutCheck
  SetCtlColors $ShortcutCheck "D4D4D8" "0A0A0B"
  ${NSD_SetState} $ShortcutCheck ${BST_CHECKED}

  nsDialogs::Show
FunctionEnd

Function OnBrowseBtn
  ${NSD_GetText} $AssetsDirText $0
  nsDialogs::SelectFolderDialog "미디어 저장 폴더 선택" "$0"
  Pop $0
  ${If} $0 != error
    StrCpy $AssetsDir $0
    ${NSD_SetText} $AssetsDirText $0
  ${EndIf}
FunctionEnd

Function OptionsPageLeave
  ${NSD_GetText} $AssetsDirText $AssetsDir
  ${NSD_GetState} $ShortcutCheck $ShortcutState
FunctionEnd

!endif ; !ONE_CLICK
!endif ; !BUILD_UNINSTALLER

; ── Post-install actions ────────────────────────────────────────────────────
!macro customInstall
  CreateDirectory "$AssetsDir"
  CreateDirectory "$APPDATA\Iris"
  FileOpen $0 "$APPDATA\Iris\.installer-config" w
  FileWrite $0 "$AssetsDir"
  FileClose $0
  ${If} $ShortcutState == 1
    CreateShortcut "$DESKTOP\Iris.lnk" "$INSTDIR\Iris.exe"
  ${EndIf}
!macroend

; ── Uninstall cleanup ───────────────────────────────────────────────────────
!macro customUnInstall
  Delete "$DESKTOP\Iris.lnk"
!macroend
