# Tabs fixture: two

## What to check

- Opens as a second tab (in tab mode) or replaces the previous document (in window mode)
- The link below opens `one.md`, switching back to the first tab
- Press Ctrl+Shift+Tab or Ctrl+PageUp to switch to the previous tab
- The undo history is kept per tab

[Go to one](one.md)

## Numbered paragraphs for scroll testing

1. This is the first paragraph of the second fixture. When you opened this file, it should have appeared as a new tab if you're in tab mode, or replaced one.md if you're in window mode.

2. The key thing to verify is that when you switch back to one.md using the link, the scroll position of that document is preserved. Try scrolling down in one.md before clicking the link here.

3. Third paragraph. Each tab maintains its own independent state: scroll position, undo history, and view mode (Formatted/Source/Split).

4. Fourth paragraph. If you're in tab mode, notice that both tabs appear in the title bar. The active tab is highlighted or otherwise distinguished.

5. Fifth paragraph. The find function only searches within the currently active tab. If you search here and then switch to one.md, the search results change based on one.md's content.

6. Sixth paragraph. Try pressing Ctrl+W to close this tab (two.md). You should be left with just one.md, and it should show the scroll position you left it at.

7. Seventh paragraph. If you close a tab with unsaved changes, the app will ask for confirmation before closing.

8. Eighth paragraph. The "Open files in" setting determines whether new files open as tabs or in separate windows. This is a global setting, not per-document.

9. Ninth paragraph. When you use the link above to go back to one.md, you're using a relative markdown link. This works across tabs just as it does in the single-window version.

10. Tenth paragraph. The outline (Ctrl+\) shows the structure of the current tab's document. When you switch tabs, the outline updates to show the active document's headings.

11. Eleventh paragraph. The title of the window shows the active tab's filename. A dot or indicator shows if the document has unsaved changes.

12. Twelfth paragraph. Try opening this fixture alongside one.md and three other files. Use Ctrl+1, Ctrl+2, Ctrl+3, Ctrl+4 to jump between tabs by number.

13. Thirteenth paragraph. Keyboard shortcuts like Ctrl+E (toggle view mode) only affect the active tab. You can have different view modes in different tabs simultaneously.

14. Fourteenth paragraph. The app supports multiple windows in "Open files in: New window" mode. Each window has its own process and independent state.

15. Fifteenth paragraph. In a single window with multiple tabs, all tabs share the same settings (colors, fonts, etc.). Changes to settings apply immediately to all tabs.

16. Sixteenth paragraph. Right-clicking a link in the preview shows you options. For external links (http/https/mailto), the menu offers to open them externally.

17. Seventeenth paragraph. Try dragging and dropping files onto this window. If you're in tab mode, they'll open as new tabs. In window mode, they'll open in new windows.

18. Eighteenth paragraph. The app remembers recent files. When you access them from the Recent menu, they open according to the "Open files in" setting.

19. Nineteenth paragraph. Unsaved changes are tracked independently per tab. You can have some tabs saved and others with pending changes.

20. Twentieth paragraph. Press Ctrl+S to save the current tab. Other tabs are unaffected; their save state remains independent.

21. Twenty-first paragraph. The tab with unsaved changes shows a visual indicator (usually a dot or mark) next to the filename in the tab label.

22. Twenty-second paragraph. When you close the last tab, instead of closing the window, the app shows the start screen with New, Open, and Recent buttons.

23. Twenty-third paragraph. External file changes (when a file is modified by another program) are detected per-tab. Only the affected tab shows a reload prompt.

24. Twenty-fourth paragraph. The cached editor state (for undo/redo history) is unique per tab. Undo operations only affect the current tab's editing history.

25. Twenty-fifth paragraph. Try using Ctrl+Shift+T if it's implemented to reopen the last closed tab. This is a common feature in modern tab-based applications.

26. Twenty-sixth paragraph. The "New document" action creates a new blank tab in tab mode. In window mode, it replaces the current document after a confirm prompt.

27. Twenty-seventh paragraph. Try switching between this tab and one.md multiple times. The content loads immediately, confirming that switching is instant.

28. Twenty-eighth paragraph. The scroll position in the Outline sidebar (when open) is independent of the document scroll. You can scroll the outline without affecting the document view.

29. Twenty-ninth paragraph. When exporting a document as HTML or PDF, only the current tab is exported. Other tabs are unaffected.

30. Thirtieth paragraph. The light/dark theme setting applies globally, but each tab can have its own view mode. You might have Formatted view in one tab and Source in another.

31. Thirty-first paragraph. Performance with many tabs depends on the document sizes. The app debounces rendering to prevent lag when typing.

32. Thirty-second paragraph. If you have the Find bar open and switch tabs, the Find bar closes automatically. When you switch back, you can open Find again.

33. Thirty-third paragraph. The file watcher (for external changes) covers all open tabs simultaneously. The app checks all of them for modifications.

34. Thirty-fourth paragraph. Keyboard shortcuts are global and affect the active tab. For example, Ctrl+F opens Find in the current tab.

35. Thirty-fifth paragraph. The app's encoding preservation (UTF-8, UTF-16) works per-file. Each tab remembers its file's encoding and line endings.

36. Thirty-sixth paragraph. Try opening a file twice (in two tabs). The app detects this and focuses the existing tab instead of opening a duplicate.

37. Thirty-seventh paragraph. The path comparison is case-insensitive on Windows, treating forward slashes and backslashes as equivalent paths.

38. Thirty-eighth paragraph. Tab labels are generated intelligently. If two files have the same name, the app adds folder information to distinguish them.

39. Thirty-ninth paragraph. If you modify a file's path (e.g., rename it in File Explorer), the app will show a reload notification when the change is detected.

40. Fortieth paragraph. The "Save As" dialog opens the current tab's location by default, helping you save related files in the same directory.

41. Forty-first paragraph. When you use Ctrl+O to open a file, the "Open files in" setting determines whether it becomes a tab or a separate window.

42. Forty-second paragraph. If you have unsaved changes and try to close the app, you'll be prompted about each dirty tab in order.

43. Forty-third paragraph. The app's window controls (minimize, maximize, close) work on the entire window, not individual tabs. Closing the window closes all tabs.

44. Forty-fourth paragraph. Try right-clicking in the preview on a relative link to another markdown file. It should offer options to open or copy the link.

45. Forty-fifth paragraph. The source editor shows line numbers in Source view. They help with navigation and are independent per tab.

46. Forty-sixth paragraph. In Split view, the source editor and preview are synchronized for scroll position. This works per-tab when you have multiple tabs.

47. Forty-seventh paragraph. Try holding Ctrl while clicking a link in the preview. Depending on the link type, it might open in a new tab or window.

48. Forty-eighth paragraph. The Custom CSS setting applies to all tabs equally. Changes to custom CSS are immediately visible in all tabs.

49. Forty-ninth paragraph. Tab switching is fast, regardless of the document size. The app uses efficient rendering techniques to minimize latency.

50. Fiftieth paragraph. The status indicator (showing file info, word count, etc., if implemented) updates when you switch tabs to show the active document's info.

51. Fifty-first paragraph. Try pressing Escape to close any open dialogs or panels. This works the same across all tabs.

52. Fifty-second paragraph. The app's context menu (right-click on the preview) offers different options depending on what you're clicking: links, images, text, etc.

53. Fifty-third paragraph. Each tab has its own search history. When you return to a tab you worked on before, your previous search terms are available.

54. Fifty-fourth paragraph. The "Block remote images" setting applies globally, protecting all tabs when enabled.

55. Fifty-fifth paragraph. If you open a very large file (like fixtures/huge.md), the tab might take a moment to render initially. Once loaded, switching is fast.

56. Fifty-sixth paragraph. Try opening files from different directories as tabs. The tab labels show enough folder context to distinguish them clearly.

57. Fifty-seventh paragraph. The title bar updates when you switch tabs, showing the active file's name and dirty state (unsaved changes indicator).

58. Fifty-eighth paragraph. When you have multiple tabs open and minimize the window, it minimizes the entire window with all tabs. Opening files from Explorer brings it back to the front.

59. Fifty-ninth paragraph. Relative links in the preview open files relative to the current tab's directory. This ensures correct behavior even with tabs in different folders.

60. Sixtieth paragraph. This completes the second fixture. Try clicking the "Go to one" link to return to the first fixture and verify that your scroll position was maintained.
