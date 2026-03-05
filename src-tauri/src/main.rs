// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod install;
mod plugins;

use config::{save_config, AppConfig, ConfigState};
use plugins::Plugin;
use tauri::State;

#[tauri::command]
async fn fetch_plugins() -> Result<Vec<Plugin>, String> {
    plugins::fetch_plugin_list()
        .await
        .map_err(|e| format!("Failed to fetch plugins: {}", e))
}

#[tauri::command]
fn get_config(state: State<'_, ConfigState>) -> Result<AppConfig, String> {
    let config = state
        .config
        .lock()
        .map_err(|e| format!("Failed to lock config: {}", e))?;
    Ok(config.clone())
}

#[tauri::command]
fn set_plugin_directory(path: String, state: State<'_, ConfigState>) -> Result<AppConfig, String> {
    let mut config = state
        .config
        .lock()
        .map_err(|e| format!("Failed to lock config: {}", e))?;
    config.plugin_directory = Some(path);
    save_config(&config).map_err(|e| format!("Failed to save config: {}", e))?;
    Ok(config.clone())
}

#[tauri::command]
fn get_installed_plugins(
    state: State<'_, ConfigState>,
) -> Result<Vec<install::InstalledPlugin>, String> {
    let config = state
        .config
        .lock()
        .map_err(|e| format!("Failed to lock config: {}", e))?;
    match &config.plugin_directory {
        Some(dir) => install::scan_installed(dir),
        None => Ok(Vec::new()),
    }
}

#[tauri::command]
async fn install_plugin(
    download_url: String,
    state: State<'_, ConfigState>,
) -> Result<(), String> {
    let dir = {
        let config = state
            .config
            .lock()
            .map_err(|e| format!("Failed to lock config: {}", e))?;
        config
            .plugin_directory
            .clone()
            .ok_or_else(|| "Plugin directory not configured".to_string())?
    };

    install::install_plugin(&dir, &download_url).await
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ConfigState::new())
        .invoke_handler(tauri::generate_handler![
            fetch_plugins,
            get_config,
            set_plugin_directory,
            get_installed_plugins,
            install_plugin,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
