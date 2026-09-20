; NSIS hooks merged into Tauri's generated installer (see bundle.windows.nsis.installerHooks).
;
; Tauri registers each file association with the app executable's icon. We ship a dedicated
; document icon (icons\markdown-file.ico, bundled via bundle.resources) and point the file
; class at it instead, then ask Explorer to refresh its icon cache.

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\Markdown.Document\DefaultIcon" "" "$INSTDIR\icons\markdown-file.ico,0"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
