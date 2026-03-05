const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.shell;

let allPlugins = [];
let installedPlugins = [];
let appConfig = {};

// ── Helpers ──────────────────────────────────────────────────

function formatSize(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + " " + units[i];
}

function formatDate(timestamp) {
  if (!timestamp) return "Unknown";
  const d = new Date(timestamp * 1000);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDownloads(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function truncateText(text, maxLen) {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > maxLen ? clean.substring(0, maxLen) + "..." : clean;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ── Installed status helpers ─────────────────────────────────
// Match by plugin name since .plugin files don't contain LotroInterface IDs.

function getInstalledInfo(plugin) {
  return installedPlugins.find(
    (p) => p.name.toLowerCase() === plugin.name.toLowerCase()
  ) || null;
}

function isInstalled(plugin) {
  return installedPlugins.some(
    (p) => p.name.toLowerCase() === plugin.name.toLowerCase()
  );
}

function hasUpdate(plugin) {
  const installed = getInstalledInfo(plugin);
  if (!installed) return false;
  return installed.version !== plugin.version;
}

// ── Config & installed state ─────────────────────────────────

async function loadConfig() {
  try {
    appConfig = await invoke("get_config");
  } catch {
    appConfig = {};
  }
}

async function loadInstalledPlugins() {
  try {
    installedPlugins = await invoke("get_installed_plugins");
  } catch {
    installedPlugins = [];
  }
}

// ── Plugin card rendering ────────────────────────────────────

function renderPluginCard(plugin) {
  const card = document.createElement("div");
  card.className = "plugin-card";
  card.setAttribute("data-id", plugin.id);

  const installed = isInstalled(plugin);
  const updatable = hasUpdate(plugin);

  let statusBadge = "";
  if (updatable) {
    const info = getInstalledInfo(plugin);
    statusBadge = `<span class="plugin-status-badge status-update">Update: v${escapeHtml(info.version)} → v${escapeHtml(plugin.version)}</span>`;
  } else if (installed) {
    statusBadge = '<span class="plugin-status-badge status-installed">Installed</span>';
  }

  card.innerHTML = `
    <div class="plugin-card-header">
      <span class="plugin-name">${escapeHtml(plugin.name)}</span>
      <div class="plugin-card-badges">
        ${statusBadge}
        <span class="plugin-version">v${escapeHtml(plugin.version)}</span>
      </div>
    </div>
    <div class="plugin-meta">
      <span>by <strong>${escapeHtml(plugin.author)}</strong></span>
      <span>${formatDownloads(plugin.downloads)} downloads</span>
      <span>Updated ${formatDate(plugin.updated)}</span>
      <span>${formatSize(plugin.size)}</span>
    </div>
    <span class="plugin-category">${escapeHtml(plugin.category)}</span>
    <div class="plugin-desc-preview">${escapeHtml(truncateText(plugin.description, 200))}</div>
  `;

  card.addEventListener("click", () => showDetail(plugin));
  return card;
}

// ── Plugin detail modal ──────────────────────────────────────

function showDetail(plugin) {
  const modal = document.getElementById("detail-modal");
  const body = document.getElementById("modal-body");

  const installed = getInstalledInfo(plugin);
  const updatable = hasUpdate(plugin);
  const hasDir = appConfig.plugin_directory;

  let actionButton = "";
  if (!hasDir) {
    actionButton = `
      <button class="btn-download btn-disabled" id="install-btn" disabled title="Set a plugin directory in Settings first">
        Install (Set directory first)
      </button>
    `;
  } else if (updatable) {
    actionButton = `
      <button class="btn-download btn-update" id="install-btn">
        Update to v${escapeHtml(plugin.version)}
      </button>
      <span class="installed-version-note">Installed: v${escapeHtml(installed.version)}</span>
    `;
  } else if (installed) {
    actionButton = `
      <button class="btn-download btn-installed-state" id="install-btn">
        Reinstall
      </button>
      <span class="installed-version-note">Installed: v${escapeHtml(installed.version)}</span>
    `;
  } else {
    actionButton = `<button class="btn-download" id="install-btn">Install</button>`;
  }

  body.innerHTML = `
    <div class="detail-title">${escapeHtml(plugin.name)}</div>
    <div class="detail-meta">
      <div><span class="label">Author:</span> <span class="value">${escapeHtml(plugin.author)}</span></div>
      <div><span class="label">Version:</span> <span class="value">${escapeHtml(plugin.version)}</span></div>
      <div><span class="label">Category:</span> <span class="value"><span class="plugin-category">${escapeHtml(plugin.category)}</span></span></div>
      <div><span class="label">Downloads:</span> <span class="value">${plugin.downloads.toLocaleString()}</span></div>
      <div><span class="label">Updated:</span> <span class="value">${formatDate(plugin.updated)}</span></div>
      <div><span class="label">Size:</span> <span class="value">${formatSize(plugin.size)}</span></div>
      <div><span class="label">ID:</span> <span class="value">${escapeHtml(plugin.id)}</span></div>
    </div>
    <div class="detail-description">${escapeHtml(plugin.description)}</div>
    <div class="detail-actions">
      ${actionButton}
      <button class="btn-open-page" id="download-btn">Open Download Page</button>
    </div>
    <div id="install-status" class="install-status" style="display:none;"></div>
  `;

  // Install / update button
  const installBtn = document.getElementById("install-btn");
  if (installBtn && !installBtn.disabled) {
    installBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await handleInstall(plugin);
    });
  }

  // Open download page button
  document.getElementById("download-btn").addEventListener("click", async (e) => {
    e.stopPropagation();
    if (plugin.file_url) {
      try {
        await open(plugin.file_url);
      } catch {
        window.open(plugin.file_url, "_blank");
      }
    }
  });

  modal.style.display = "flex";
}

// ── Install / update handler ─────────────────────────────────

async function handleInstall(plugin) {
  const statusEl = document.getElementById("install-status");
  const installBtn = document.getElementById("install-btn");

  statusEl.style.display = "block";
  statusEl.className = "install-status install-progress";
  statusEl.textContent = "Downloading and installing...";
  installBtn.disabled = true;
  installBtn.textContent = "Installing...";

  try {
    await invoke("install_plugin", {
      downloadUrl: plugin.file_url,
    });

    statusEl.className = "install-status install-success";
    statusEl.textContent = "Successfully installed " + plugin.name + " v" + plugin.version;
    installBtn.textContent = "Installed";

    // Re-scan the plugin directory and re-render
    await loadInstalledPlugins();
    applyFilters();
  } catch (err) {
    statusEl.className = "install-status install-error";
    statusEl.textContent = "Install failed: " + err;
    installBtn.disabled = false;
    installBtn.textContent = "Retry Install";
  }
}

// ── Categories & filtering ───────────────────────────────────

function populateCategories(plugins) {
  const select = document.getElementById("category-filter");
  const categories = [...new Set(plugins.map((p) => p.category))].sort();
  categories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
}

function applyFilters() {
  const query = document.getElementById("search").value.toLowerCase().trim();
  const category = document.getElementById("category-filter").value;
  const sortBy = document.getElementById("sort-by").value;

  let filtered = allPlugins.filter((p) => {
    const matchesCategory = !category || p.category === category;
    const matchesSearch =
      !query ||
      p.name.toLowerCase().includes(query) ||
      p.author.toLowerCase().includes(query) ||
      p.description.toLowerCase().includes(query) ||
      p.category.toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });

  filtered.sort((a, b) => {
    switch (sortBy) {
      case "installed": {
        // Updates first, then installed, then the rest — secondary sort by updated
        const aUpdate = hasUpdate(a) ? 2 : isInstalled(a) ? 1 : 0;
        const bUpdate = hasUpdate(b) ? 2 : isInstalled(b) ? 1 : 0;
        if (bUpdate !== aUpdate) return bUpdate - aUpdate;
        return b.updated - a.updated;
      }
      case "downloads":
        return b.downloads - a.downloads;
      case "name":
        return a.name.localeCompare(b.name);
      case "author":
        return a.author.localeCompare(b.author);
      case "updated":
      default:
        return b.updated - a.updated;
    }
  });

  renderPluginList(filtered);

  // Summary counts
  const totalInstalled = allPlugins.filter((p) => isInstalled(p)).length;
  const totalUpdatable = allPlugins.filter((p) => hasUpdate(p)).length;
  let countText = `${filtered.length} of ${allPlugins.length} plugins`;
  if (totalInstalled > 0) {
    countText += ` | ${totalInstalled} installed`;
  }
  if (totalUpdatable > 0) {
    countText += ` | ${totalUpdatable} update${totalUpdatable !== 1 ? "s" : ""} available`;
  }
  document.getElementById("plugin-count").textContent = countText;
}

function renderPluginList(plugins) {
  const container = document.getElementById("plugin-list");
  container.innerHTML = "";
  if (plugins.length === 0) {
    container.innerHTML = '<div class="error">No plugins found matching your search.</div>';
    return;
  }
  plugins.forEach((p) => container.appendChild(renderPluginCard(p)));
}

// ── Load plugins ─────────────────────────────────────────────

async function loadPlugins() {
  const loading = document.getElementById("loading");
  const errorEl = document.getElementById("error");
  const listEl = document.getElementById("plugin-list");

  loading.style.display = "flex";
  errorEl.style.display = "none";
  listEl.innerHTML = "";

  try {
    allPlugins = await invoke("fetch_plugins");
    loading.style.display = "none";
    populateCategories(allPlugins);
    applyFilters();
  } catch (err) {
    loading.style.display = "none";
    errorEl.style.display = "block";
    errorEl.textContent = "Error: " + err;
  }
}

// ── Settings modal ───────────────────────────────────────────

function openSettings() {
  const modal = document.getElementById("settings-modal");
  const dirInput = document.getElementById("plugin-dir-display");
  const statusEl = document.getElementById("settings-status");

  dirInput.value = appConfig.plugin_directory || "";
  statusEl.style.display = "none";
  modal.style.display = "flex";
}

function closeSettings() {
  document.getElementById("settings-modal").style.display = "none";
}

async function browseDirectory() {
  const statusEl = document.getElementById("settings-status");
  try {
    const selected = await window.__TAURI__.dialog.open({
      directory: true,
      multiple: false,
      title: "Select Plugin Download Directory",
    });

    if (selected) {
      const dirInput = document.getElementById("plugin-dir-display");
      dirInput.value = selected;

      appConfig = await invoke("set_plugin_directory", { path: selected });
      statusEl.style.display = "block";
      statusEl.className = "settings-status settings-success";
      statusEl.textContent = "Plugin directory saved.";

      // Re-scan for the new directory
      await loadInstalledPlugins();
      applyFilters();
    }
  } catch (err) {
    statusEl.style.display = "block";
    statusEl.className = "settings-status settings-error";
    statusEl.textContent = "Failed to set directory: " + err;
  }
}

// ── Event listeners ──────────────────────────────────────────

document.getElementById("search").addEventListener("input", applyFilters);
document.getElementById("category-filter").addEventListener("change", applyFilters);
document.getElementById("sort-by").addEventListener("change", applyFilters);
document.getElementById("refresh-btn").addEventListener("click", () => {
  const select = document.getElementById("category-filter");
  select.innerHTML = '<option value="">All Categories</option>';
  loadPlugins();
});

// Settings
document.getElementById("settings-btn").addEventListener("click", openSettings);
document.getElementById("settings-close").addEventListener("click", closeSettings);
document.getElementById("settings-modal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeSettings();
});
document.getElementById("browse-dir-btn").addEventListener("click", browseDirectory);

// Detail modal close
document.getElementById("modal-close").addEventListener("click", () => {
  document.getElementById("detail-modal").style.display = "none";
});
document.getElementById("detail-modal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) {
    document.getElementById("detail-modal").style.display = "none";
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.getElementById("detail-modal").style.display = "none";
    closeSettings();
  }
});

// ── Init ─────────────────────────────────────────────────────

async function init() {
  await loadConfig();
  await loadInstalledPlugins();

  // Default to "Installed First" if there are installed plugins, otherwise "Recently Updated"
  const sortSelect = document.getElementById("sort-by");
  sortSelect.value = installedPlugins.length > 0 ? "installed" : "updated";

  await loadPlugins();
}

init();
