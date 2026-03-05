use quick_xml::events::Event;
use quick_xml::Reader;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use zip::ZipArchive;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledPlugin {
    pub name: String,
    pub version: String,
    pub author: String,
}

/// Scan the plugin directory for .plugin files and parse their metadata.
/// LOTRO .plugin files are XML with <Plugin><Information><Name>, <Version>, <Author>.
pub fn scan_installed(plugin_dir: &str) -> Result<Vec<InstalledPlugin>, String> {
    let dir = Path::new(plugin_dir);
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut installed = Vec::new();
    scan_dir_recursive(dir, &mut installed);
    Ok(installed)
}

fn scan_dir_recursive(dir: &Path, results: &mut Vec<InstalledPlugin>) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            scan_dir_recursive(&path, results);
        } else if path.extension().and_then(|e| e.to_str()) == Some("plugin") {
            if let Some(plugin) = parse_plugin_file(&path) {
                results.push(plugin);
            }
        }
    }
}

/// Parse a single .plugin XML file into an InstalledPlugin.
fn parse_plugin_file(path: &Path) -> Option<InstalledPlugin> {
    let xml = fs::read_to_string(path).ok()?;
    let mut reader = Reader::from_str(&xml);
    reader.config_mut().trim_text(true);

    let mut name = String::new();
    let mut version = String::new();
    let mut author = String::new();
    let mut current_tag = String::new();
    let mut in_information = false;
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if tag == "Information" {
                    in_information = true;
                } else if in_information {
                    current_tag = tag;
                }
            }
            Ok(Event::End(ref e)) => {
                let tag = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if tag == "Information" {
                    in_information = false;
                }
                current_tag.clear();
            }
            Ok(Event::Text(ref e)) => {
                if in_information {
                    let text = e.unescape().unwrap_or_default().to_string();
                    match current_tag.as_str() {
                        "Name" => name = text,
                        "Version" => version = text,
                        "Author" => author = text,
                        _ => {}
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => return None,
            _ => {}
        }
        buf.clear();
    }

    if name.is_empty() {
        return None;
    }

    Some(InstalledPlugin {
        name,
        version,
        author,
    })
}

/// Download a plugin zip from the given URL and extract it to the plugin directory.
pub async fn install_plugin(
    plugin_dir: &str,
    download_url: &str,
) -> Result<(), String> {
    let dir = PathBuf::from(plugin_dir);
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create plugin directory: {}", e))?;
    }

    // Download the zip
    let response = reqwest::get(download_url)
        .await
        .map_err(|e| format!("Failed to download plugin: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed with status: {}",
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read download: {}", e))?;

    // Extract the zip
    let cursor = Cursor::new(bytes);
    let mut archive = ZipArchive::new(cursor)
        .map_err(|e| format!("Failed to open zip archive: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {}", e))?;

        let out_path = match file.enclosed_name() {
            Some(path) => dir.join(path),
            None => continue,
        };

        if file.is_dir() {
            fs::create_dir_all(&out_path)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent directory: {}", e))?;
            }
            let mut outfile = fs::File::create(&out_path)
                .map_err(|e| format!("Failed to create file: {}", e))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to write file: {}", e))?;
        }
    }

    Ok(())
}
