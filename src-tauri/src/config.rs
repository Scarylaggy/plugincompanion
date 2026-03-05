use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

const CONFIG_FILE_NAME: &str = "config.json";

/// Returns the default LOTRO plugin directory for the current platform.
/// - Linux: ~/Documents/The Lord of the Rings Online/Plugins
/// - Windows: %USERPROFILE%\Documents\The Lord of the Rings Online\Plugins
fn default_plugin_directory() -> Option<String> {
    dirs::document_dir().map(|docs| {
        docs.join("The Lord of the Rings Online")
            .join("Plugins")
            .to_string_lossy()
            .to_string()
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub plugin_directory: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            plugin_directory: default_plugin_directory(),
        }
    }
}

pub struct ConfigState {
    pub config: Mutex<AppConfig>,
}

impl ConfigState {
    pub fn new() -> Self {
        let config = load_config().unwrap_or_default();
        Self {
            config: Mutex::new(config),
        }
    }
}

/// Returns the path to the config file in the app's data directory.
fn config_path() -> PathBuf {
    let data_dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("lotro-plugin-companion");
    data_dir.join(CONFIG_FILE_NAME)
}

/// Load config from disk, returning Default if it doesn't exist.
fn load_config() -> Result<AppConfig, Box<dyn std::error::Error>> {
    let path = config_path();
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let contents = fs::read_to_string(&path)?;
    let config: AppConfig = serde_json::from_str(&contents)?;
    Ok(config)
}

/// Save config to disk.
pub fn save_config(config: &AppConfig) -> Result<(), Box<dyn std::error::Error>> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(config)?;
    fs::write(&path, json)?;
    Ok(())
}
