//! WSL integration (add-wsl-managed-sidecar / add-native-runtime-mode).
//!
//! Host/distro **detection** — does the assistant run on Windows, and which WSL
//! distros are installed? The runtime-mode selector gates the WSL option on this.
//! The sidecar lifecycle lives in the [`crate::runtime`] module (the WSL back-end
//! there builds on this detection).

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WslDetect {
    /// Whether the assistant's own host process runs on Windows. Only a Windows
    /// host can bridge into a distro via `wsl.exe`; inside WSL/Linux the sidecar
    /// is already local, so managed mode is moot (matches the `wsl-remote` gate).
    pub host_is_windows: bool,
    /// True when the host is Windows AND at least one distro is installed.
    pub available: bool,
    /// WSL distro registration names (`wsl -l -q`), in listed order.
    pub distros: Vec<String>,
}

/// Detect WSL availability. On a Windows host this runs `wsl -l -q`; off Windows
/// it short-circuits without ever invoking `wsl.exe`.
#[cfg(windows)]
pub fn detect() -> WslDetect {
    match std::process::Command::new("wsl").args(["-l", "-q"]).output() {
        Ok(out) => {
            let distros = parse_distro_list(&out.stdout);
            WslDetect { host_is_windows: true, available: !distros.is_empty(), distros }
        }
        Err(_) => WslDetect { host_is_windows: true, available: false, distros: Vec::new() },
    }
}

#[cfg(not(windows))]
pub fn detect() -> WslDetect {
    WslDetect { host_is_windows: false, available: false, distros: Vec::new() }
}

/// Decode `wsl.exe` output, which is UTF-16LE (with NUL high bytes for ASCII and
/// occasionally a BOM) rather than UTF-8. Falls back to lossy UTF-8 for any
/// non-UTF-16 stream. Only reached on a Windows host (via [`detect`]); the tests
/// exercise it everywhere.
#[cfg_attr(not(windows), allow(dead_code))]
fn decode_wsl_output(bytes: &[u8]) -> String {
    let has_bom = bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE;
    let nul_count = bytes.iter().filter(|&&b| b == 0).count();
    // ASCII text encoded as UTF-16LE has ~half its bytes as 0x00 (the high byte
    // of each code unit). That ratio is the reliable signal that it is UTF-16.
    let looks_utf16 =
        has_bom || (!bytes.is_empty() && nul_count.saturating_mul(2) >= bytes.len().saturating_sub(1));
    if looks_utf16 {
        let start = if has_bom { 2 } else { 0 };
        let units: Vec<u16> = bytes[start..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16_lossy(&units)
    } else {
        String::from_utf8_lossy(bytes).into_owned()
    }
}

/// Parse the distro registration names from `wsl -l -q` output. Handles UTF-16LE,
/// stray NULs, and CR/LF line endings; drops blank lines. Only reached on a
/// Windows host (via [`detect`]); the tests exercise it everywhere.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn parse_distro_list(bytes: &[u8]) -> Vec<String> {
    decode_wsl_output(bytes)
        .split(['\n', '\r'])
        .map(|line| line.trim_matches(|c: char| c.is_whitespace() || c == '\0'))
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Encode a UTF-8 string as UTF-16LE bytes (how `wsl.exe` emits names).
    fn utf16le(s: &str) -> Vec<u8> {
        s.encode_utf16().flat_map(|u| u.to_le_bytes()).collect()
    }

    #[test]
    fn parses_utf16le_multi_distro() {
        let bytes = utf16le("Ubuntu\r\nDebian\r\n");
        assert_eq!(parse_distro_list(&bytes), vec!["Ubuntu", "Debian"]);
    }

    #[test]
    fn parses_utf16le_single_distro() {
        let bytes = utf16le("Ubuntu-22.04\r\n");
        assert_eq!(parse_distro_list(&bytes), vec!["Ubuntu-22.04"]);
    }

    #[test]
    fn parses_utf16le_with_bom() {
        let mut bytes = vec![0xFF, 0xFE];
        bytes.extend(utf16le("Ubuntu\r\n"));
        assert_eq!(parse_distro_list(&bytes), vec!["Ubuntu"]);
    }

    #[test]
    fn empty_output_yields_no_distros() {
        assert!(parse_distro_list(&[]).is_empty());
        assert!(parse_distro_list(&utf16le("\r\n")).is_empty());
    }

    #[test]
    fn tolerates_utf8_fallback() {
        assert_eq!(parse_distro_list(b"Ubuntu\nDebian\n"), vec!["Ubuntu", "Debian"]);
    }

    #[test]
    fn off_windows_detect_reports_unavailable() {
        // On the Linux/macOS CI host this exercises the `#[cfg(not(windows))]` arm.
        if !cfg!(windows) {
            let d = detect();
            assert!(!d.host_is_windows);
            assert!(!d.available);
            assert!(d.distros.is_empty());
        }
    }
}
