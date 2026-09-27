/// Check if an existing instance's window is hung (unresponsive UI thread).
pub fn existing_instance_is_hung(identifier: &str) -> bool {
    #[cfg(windows)]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        let class_name = format!("{}-sic", identifier);
        let title_name = format!("{}-siw", identifier);

        let class_wide: Vec<u16> = OsStr::new(&class_name)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let title_wide: Vec<u16> = OsStr::new(&title_name)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let hwnd = unsafe {
            windows_sys::Win32::UI::WindowsAndMessaging::FindWindowW(
                class_wide.as_ptr(),
                title_wide.as_ptr(),
            )
        };

        if hwnd.is_null() {
            return false;
        }

        let mut result = 0usize;
        let ret = unsafe {
            windows_sys::Win32::UI::WindowsAndMessaging::SendMessageTimeoutW(
                hwnd,
                windows_sys::Win32::UI::WindowsAndMessaging::WM_NULL,
                0,
                0,
                windows_sys::Win32::UI::WindowsAndMessaging::SMTO_ABORTIFHUNG
                    | windows_sys::Win32::UI::WindowsAndMessaging::SMTO_BLOCK,
                2000,
                &mut result,
            )
        };

        ret == 0
    }

    #[cfg(not(windows))]
    {
        let _ = identifier;
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_false_on_non_existent_window() {
        // An arbitrary identifier that won't have a running window.
        // This test just confirms the function doesn't panic.
        let result = existing_instance_is_hung("nonexistent.app.identifier");
        assert!(!result);
    }
}
