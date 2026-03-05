use quick_xml::events::Event;
use quick_xml::Reader;
use serde::Serialize;

const PLUGIN_XML_URL: &str = "https://api.lotrointerface.com/fav/plugincompendium.xml";

#[derive(Debug, Clone, Serialize, Default)]
pub struct Plugin {
    pub id: String,
    pub name: String,
    pub author: String,
    pub version: String,
    pub updated: i64,
    pub downloads: u64,
    pub category: String,
    pub description: String,
    pub file: String,
    pub file_url: String,
    pub size: u64,
}

pub async fn fetch_plugin_list() -> Result<Vec<Plugin>, Box<dyn std::error::Error + Send + Sync>> {
    let response = reqwest::get(PLUGIN_XML_URL).await?;
    let xml_text = response.text().await?;
    parse_plugins(&xml_text)
}

fn parse_plugins(xml: &str) -> Result<Vec<Plugin>, Box<dyn std::error::Error + Send + Sync>> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut plugins: Vec<Plugin> = Vec::new();
    let mut current_plugin: Option<Plugin> = None;
    let mut current_tag = String::new();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let tag_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match tag_name.as_str() {
                    "Ui" => {
                        current_plugin = Some(Plugin::default());
                    }
                    _ => {
                        current_tag = tag_name;
                    }
                }
            }
            Ok(Event::End(ref e)) => {
                let tag_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if tag_name == "Ui" {
                    if let Some(plugin) = current_plugin.take() {
                        plugins.push(plugin);
                    }
                }
                current_tag.clear();
            }
            Ok(Event::Text(ref e)) => {
                if let Some(ref mut plugin) = current_plugin {
                    let text = e.unescape().unwrap_or_default().to_string();
                    match current_tag.as_str() {
                        "UID" => plugin.id = text,
                        "UIName" => plugin.name = text,
                        "UIAuthorName" => plugin.author = text,
                        "UIVersion" => plugin.version = text,
                        "UIUpdated" => plugin.updated = text.parse().unwrap_or(0),
                        "UIDownloads" => plugin.downloads = text.parse().unwrap_or(0),
                        "UICategory" => plugin.category = text,
                        "UIFile" => plugin.file = text,
                        "UISize" => plugin.size = text.parse().unwrap_or(0),
                        "UIFileURL" => plugin.file_url = text,
                        _ => {}
                    }
                }
            }
            Ok(Event::CData(ref e)) => {
                if let Some(ref mut plugin) = current_plugin {
                    if current_tag == "UIDescription" {
                        let text = String::from_utf8_lossy(e.as_ref()).to_string();
                        plugin.description = text.trim().to_string();
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(Box::new(e)),
            _ => {}
        }
        buf.clear();
    }

    // Sort by most recently updated
    plugins.sort_by(|a, b| b.updated.cmp(&a.updated));

    Ok(plugins)
}
