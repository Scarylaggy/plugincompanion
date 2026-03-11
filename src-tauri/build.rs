fn main() {
    // Work around white/blank window when an AppImage built on one distro
    // (e.g. Ubuntu) runs on another (e.g. Arch) with different Mesa/GPU
    // driver versions.  The DMA-BUF renderer in WebKitGTK can fail silently
    // in that situation; disabling it forces a compatible fallback.
    #[cfg(target_os = "linux")]
    {
        if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }
    tauri_build::build()
}
