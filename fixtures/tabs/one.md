# Tabs fixture: one

## What to check

- Opens as a tab (or new window, depending on settings)
- The link below opens `two.md` as a second tab in tab mode, or replaces this document in window mode
- Press Ctrl+Tab to switch to the next tab
- The undo history is kept per tab

[Go to two](two.md)

## Numbered paragraphs for scroll testing

1. This is the first paragraph. It's here to provide content for testing scroll position and tab switching. When you scroll down and then switch tabs, the scroll position should be preserved when you come back to this tab.

2. This is the second paragraph. In a real markdown document, you might have many sections and paragraphs. For testing tab functionality, we want to ensure that each tab remembers its scroll position independently.

3. Third paragraph here. When you switch between tabs, the scroll position of each tab should be maintained. This is important for maintaining context when working with multiple documents.

4. Fourth paragraph. The scroll sync feature in Split view should also work correctly with tabs. Make sure that when switching between tabs in Split view, the scroll positions are preserved.

5. Fifth paragraph. Try clicking the link above to open two.md, then use Ctrl+Tab to switch back and forth. Each tab should maintain its own scroll position.

6. Sixth paragraph. If you have the Outline sidebar open, it should update when you switch tabs. The outline should show the headings from the current tab's document.

7. Seventh paragraph. The Find function should search within the current tab only. Try opening Find with Ctrl+F and searching for text that only appears in this tab.

8. Eighth paragraph. Try editing this tab's content and then switching to another tab. Come back and your edits should still be there, and the undo history should work correctly.

9. Ninth paragraph. Tab labels show the filename and a folder suffix if needed to distinguish them. If you open two files with the same name from different folders, you'll see the path differentiation in the tab labels.

10. Tenth paragraph. The tab strip appears in the title bar. In window mode, the title bar shows just the filename. In tab mode, it shows all open tabs.

11. Eleventh paragraph. You can close tabs with Ctrl+W. If you close the active tab, the focus will move to an adjacent tab.

12. Twelfth paragraph. Try opening multiple files and switching between them with Ctrl+1, Ctrl+2, Ctrl+3, etc. These shortcuts let you jump directly to a specific tab.

13. Thirteenth paragraph. The view mode (Formatted / Source / Split) is remembered per tab. Switch modes with Ctrl+E, change to another tab, and come back. Your view mode choice is preserved.

14. Fourteenth paragraph. The external file change detection works per tab. If you modify a file externally, only the corresponding tab will show the reload notification.

15. Fifteenth paragraph. Try dragging files onto the window. Depending on the "Open files in" setting, they'll open as tabs or new windows.

16. Sixteenth paragraph. When you close a window with multiple unsaved tabs, it should ask about each one. You can cancel the close by cancelling any of the save prompts.

17. Seventeenth paragraph. The "Open files in" setting is in Settings > General. It controls whether files opened from Explorer or via Ctrl+O appear as tabs or new windows.

18. Eighteenth paragraph. In tab mode, opening a file that's already open in another tab just focuses that tab instead of opening it twice.

19. Nineteenth paragraph. Recent files and the links in the preview also respect the "Open files in" setting when opening files.

20. Twentieth paragraph. The app starts with a blank tab in tab mode, showing the start screen. You can immediately open files or create a new tab.

21. Twenty-first paragraph. Try using Shift+Ctrl+Tab or Ctrl+PageUp to switch to the previous tab. This is useful for quickly navigating between your open documents.

22. Twenty-second paragraph. Closing the last tab shows the start screen (with New, Open, Recent buttons) rather than closing the window.

23. Twenty-third paragraph. The title bar shows the active tab's filename when in tab mode. If you're working with an unsaved file, a dot appears next to the filename to indicate unsaved changes.

24. Twenty-fourth paragraph. Each tab has its own search history in the Find bar. When you switch tabs, the Find bar clears, but your search terms are remembered when you return.

25. Twenty-fifth paragraph. Try exporting a document from one tab. The export window remembers its previous location and settings across the session.

26. Twenty-sixth paragraph. The keyboard shortcut Ctrl+T opens a new blank tab. It's a quick way to start working on a new document without using the menu.

27. Twenty-seventh paragraph. When switching between tabs, the viewport doesn't flash or jump. The transition should feel smooth, with the content appearing immediately.

28. Twenty-eighth paragraph. Try zooming in and out with the browser dev tools (F12). The zoom level is stored per tab, so each tab can have its own zoom factor.

29. Twenty-ninth paragraph. The print function works on the current tab's content. It will print the rendered view, not the source.

30. Thirtieth paragraph. Custom CSS from the settings applies to all tabs equally. If you change a preset or custom CSS, all tabs update immediately.

31. Thirty-first paragraph. Block remote images setting applies globally. If you enable it, all tabs will block remote images.

32. Thirty-second paragraph. The line ending (CRLF/LF) and encoding (UTF-8/UTF-16) are preserved per file. If you have tabs with different line endings, they're each saved with their original format.

33. Thirty-third paragraph. Try opening the same file in multiple windows (using "Open files in: New window"). Each window has its own independent state and watcher.

34. Thirty-fourth paragraph. The Outline sidebar shows the current tab's structure. When you click a heading in the outline, it scrolls to that location in the current tab.

35. Thirty-fifth paragraph. The app remembers all settings and presets between launches. The only thing NOT remembered is which tabs were open when you closed the app.

36. Thirty-sixth paragraph. Try right-clicking links in the preview. External links give you options to copy or open; relative markdown links open in the current app.

37. Thirty-seventh paragraph. The "Go to two" link at the top will open two.md in the same window (as a new tab if in tab mode, or replacing this document if in window mode).

38. Thirty-eighth paragraph. Tables, task lists, footnotes and code blocks all render correctly in tabs, just like in a single-window app.

39. Thirty-ninth paragraph. Math in KaTeX format ($...$ and $$...$$) and Mermaid diagrams work in tabs just as they do in regular documents.

40. Fortieth paragraph. Try pressing Ctrl+, to open Settings. The settings apply globally to all tabs and all windows.

41. Forty-first paragraph. The "Open with..." feature from Windows Explorer uses the settings to decide whether to open in a tab or a new window.

42. Forty-second paragraph. When the app is minimised and you open a file from Explorer, the app window will come to the front and show the new tab.

43. Forty-third paragraph. Try opening large files (there's a fixtures/huge.md for testing). Each tab's scroll position and render state are independent.

44. Forty-fourth paragraph. The editor line numbers are visible in Source view. They help with navigation and are per-tab, just like everything else.

45. Forty-fifth paragraph. Try editing in Split view (left side is Source, right is preview). Both panes scroll together, and the sync works per-tab.

46. Forty-sixth paragraph. Keyboard navigation in the Find bar (Enter to find next, Shift+Enter for previous) works the same in all tabs.

47. Forty-seventh paragraph. The app's window chrome (buttons, menu, colors) updates based on the active preset. Change presets and all tabs use the new colours.

48. Forty-eighth paragraph. Try pressing Escape to close the Find bar, Settings panel, or any other overlay. It's the standard close shortcut throughout the app.

49. Forty-ninth paragraph. The Ctrl+O (Open file) shortcut respects the "Open files in" setting. You can select one file or many at once.

50. Fiftieth paragraph. Document saved state is tracked per tab. If you have multiple unsaved files and then close the window, you'll be asked about each one.

51. Fifty-first paragraph. The "New document" action (Ctrl+N or via menu) creates a new blank tab if in tab mode, or replaces the current document if in window mode.

52. Fifty-second paragraph. Try testing mixed content: markdown, math, code blocks, and diagrams all in one document. Each tab renders independently.

53. Fifty-third paragraph. The viewport scaling works per-tab. If you zoom one tab, the others keep their zoom level.

54. Fifty-fourth paragraph. Relative image paths work correctly in tabs. The image folder is always relative to the currently active tab's file location.

55. Fifty-fifth paragraph. Try clicking an anchor link like #what-to-check above. It scrolls to that heading in the current tab.

56. Fifty-sixth paragraph. The app title changes to show the active tab's filename and dirty state. When you switch tabs, the title updates accordingly.

57. Fifty-seventh paragraph. Comments (if added to markdown) are not rendered, maintaining consistency with standard markdown rendering across all tabs.

58. Fifty-eighth paragraph. The copy-to-clipboard export option works on the current tab's rendered HTML. Try exporting in different view modes.

59. Fifty-ninth paragraph. Each tab's content is independent. Undo in one tab doesn't affect others. Making changes requires explicitly switching to a different tab.

60. Sixtieth paragraph. This is the end of the scroll test content. Scroll back to the top and switch to the other tab to verify that your scroll position is remembered when you return.
