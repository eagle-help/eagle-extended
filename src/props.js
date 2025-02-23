const fs = require("fs");
const path = require("path");
const pluginPath = path.join(path.dirname(__dirname));
const { v4: uuidv4 } = require("uuid");

const urlParams = new URLSearchParams(window.location.search);
const recievedPath = urlParams.get("path");

let copyMode = true;

// SECTION builtin badge
function createBuiltinBadges(eagle) {
    return [createShellBadge(eagle), createOpenFolderBadge(eagle)];
}

function createShellBadge(eagle) {
    return `
        <div class="badge builtin-badge" id="open-shell-badge">
            💻 Open Shell
        </div>
    `;
}

function createOpenFolderBadge(eagle) {
    const dirPath = path.join(path.dirname(recievedPath), "extendedFiles");
    return `
        <div class="badge builtin-badge" 
             onclick="eagle.shell.openPath('${dirPath.replace(
                 /\\/g,
                 "\\\\"
             )}')">
            📁 Open Extended Files
        </div>
    `;
}

function which(command) {
    try {
        const { execSync } = require("child_process");
        const checkCommand = eagle.app.isWindows
            ? `where ${command}`
            : `command -v ${command}`;

        const path = execSync(checkCommand, {
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();

        console.log(`Found ${command} at:`, path);
        return path.split("\n")[0]; // Return first match
    } catch (e) {
        console.warn(`${command} not found:`, e.message);
        return null;
    }
}

document.addEventListener("click", (e) => {
    const customBadge = e.target.closest("[data-custom-badge]");
    if (customBadge) {
        const badgeId = customBadge.dataset.customBadge;
        const handler = customBadgeManager.customHandlers.get(badgeId);
        if (handler) {
            return handler({
                eagle,
                path: recievedPath,
                element: customBadge,
                dirPath: path.dirname(recievedPath),
            });
        }
    }

    if (e.target.id === "open-shell-badge") {
        const path = require("path");
        const { spawn } = require("child_process");
        const dirPath = path.dirname(recievedPath);

        // Check for pwsh with proper casing
        const shellPath =
            which("pwsh") ||
            which("Powershell") ||
            which("powershell") ||
            (eagle.app.isWindows ? "cmd.exe" : "bash");

        console.log("Selected shell:", shellPath);

        let shellArgs = [
            "-NoExit",
            "-Command",
            `Set-Location -Path '${dirPath}'`,
        ];

        if (shellPath === "cmd.exe") {
            shellArgs = ["/K", `cd /d "${dirPath}"`];
        } else if (shellPath === "bash") {
            shellArgs = ["-c", `cd "${dirPath}" && exec bash`];
        }

        spawn(shellPath, shellArgs, {
            shell: true,
            detached: true,
            stdio: "ignore",
        });
    }
});
// !SECTION

// SECTION base badge
class BaseBadge {
    constructor(text) {
        this.colorClass = `badge-color-${Math.floor(Math.random() * 6) + 1}`;
        this.text = text;
    }

    escapePath(path) {
        return path ? path.replace(/\\/g, "\\\\").replace(/'/g, "\\'") : "";
    }

    render() {
        const badge = document.createElement("div");
        badge.className = `badge ${this.colorClass} base-badge`;
        badge.textContent = this.text;
        return badge;
    }
}

class KeyValueBadge extends BaseBadge {
    constructor(name, value, isEditable = false) {
        super();
        this.name = name;
        this.value = value;
        this.isEditable = isEditable;
    }

    render() {
        const badge = document.createElement("div");
        badge.className = `badge ${this.colorClass} key-value-badge`;

        if (this.isEditable) {
            badge.classList.add("editable");
            const keyInput = document.createElement("input");
            keyInput.type = "text";
            keyInput.className = "badge-key-edit";
            keyInput.placeholder = "Key";
            keyInput.value = this.name;

            const valueInput = document.createElement("input");
            valueInput.type = "text";
            valueInput.className = "badge-value-edit";
            valueInput.placeholder = "Value";
            valueInput.value = this.value || "";

            badge.append(keyInput, valueInput);
        } else {
            const keySpan = document.createElement("span");
            keySpan.className = "badge-key";
            keySpan.textContent = this.name;
            keySpan.dataset.tooltip = this.name;

            if (this.value) {
                const valueSpan = document.createElement("span");
                valueSpan.className = "badge-value";
                valueSpan.textContent = this.value;
                valueSpan.dataset.tooltip = this.value;
                badge.append(keySpan, valueSpan);
            } else {
                badge.appendChild(keySpan);
            }
        }

        return badge;
    }
}

class FileBadge extends BaseBadge {
    constructor(fileName, filePath) {
        super();
        this.fileName = fileName;
        this.filePath = filePath;
        this.escapedPath = this.escapePath(filePath);
    }

    render() {
        const badge = document.createElement("div");
        badge.className = `badge ${this.colorClass} file-badge`;
        badge.dataset.filePath = this.escapedPath;

        const keySpan = document.createElement("span");
        keySpan.className = "badge-key";
        keySpan.textContent = this.fileName;
        keySpan.dataset.tooltip = this.fileName;

        badge.appendChild(keySpan);

        badge.addEventListener("click", () => {
            eagle.shell.openPath(this.escapedPath);
        });

        return badge;
    }
}
// !SECTION

// SECTION controls
async function getPropsBadges(eagle) {
    const dirPath = path.dirname(recievedPath);
    const extendedFilesPath = path.join(dirPath, "extendedFiles");

    // Create directory if missing
    if (!fs.existsSync(extendedFilesPath)) {
        fs.mkdirSync(extendedFilesPath, { recursive: true });
    }

    const files = fs.readdirSync(extendedFilesPath).filter((file) => {
        // Ignore hidden files and specific excluded files
        const excluded = [
            "metadata.json",
            path.basename(recievedPath),
            "itemProp.json",
        ];
        return !file.startsWith(".") && !excluded.includes(file);
    });

    const { ItemProp } = require(path.join(pluginPath, "utils", "itemProp.js"));
    const itemProp = new ItemProp({ filePath: recievedPath });
    let itemProps = {};

    const showConfigKeys =
        (await itemProp.getLocal("config_show_system_keys")) || false;

    try {
        for await (const [key, value] of itemProp.iterLocal()) {
            if (!showConfigKeys && key.startsWith("config_")) {
                continue;
            }
            itemProps[key] = value;
        }
    } catch (e) {
        console.error("Error loading item properties:", e);
    }

    // Generate badge HTML
    const customBadgeManager = new CustomBadgeManager(eagle);
    customBadgeManager.loadCustomBadges();
    const badges = [
        ...createBuiltinBadges(eagle),
        ...files.map(
            (file) =>
                new FileBadge(
                    file,
                    path.join(dirPath, "extendedFiles", file)
                ).render().outerHTML
        ),
        ...Object.entries(itemProps).map(
            ([key, value]) => new KeyValueBadge(key, value).render().outerHTML
        ),
        ...customBadgeManager.getBadgeHTMLs().map((badge) => badge.outerHTML),
    ];

    return `
        <div class="controls">
            <div class="controls-group">
                <button class="control-btn" onclick="toggleConfigKeys()">
                    ${showConfigKeys ? "🔒" : "🔓"}
                </button>
                <button class="control-btn" onclick="location.reload()">
                    🔄
                </button>
                <button class="control-btn" id="copy-move-toggle">
                    ${copyMode ? "📋 Copy Mode" : "✂️ Move Mode"}
                </button>
                <button class="control-btn" 
                        onclick="eagle.shell.openPath('${customBadgeManager.customBadgesPath.replace(/\\/g, "\\\\")}')">
                    📂 Custom
                </button>
            </div>
            <input type="range" class="size-slider" 
                   min="12" max="24" value="${
                       itemProps.config_slider_value || 14
                   }" 
                   step="1" aria-label="Badge size">
        </div>
        <div class="badge-container" data-mode="${copyMode ? "copy" : "move"}">
            ${badges.join("")}
        </div>
    `;
}
// !SECTION

// SECTION context menus
function initDragDrop() {
    const container = document.querySelector(".badge-container");

    container.addEventListener("dragover", (e) => {
        e.preventDefault();
        container.classList.add("dragover");
    });

    container.addEventListener("dragleave", (e) => {
        container.classList.remove("dragover");
    });

    container.addEventListener("drop", async (e) => {
        e.preventDefault();
        container.classList.remove("dragover");

        const files = e.dataTransfer.files;
        const dirPath = path.dirname(recievedPath);

        for (let file of files) {
            const filePath = file.path;
            const fileName = path.basename(filePath);
            const destPath = path.join(dirPath, "extendedFiles", fileName);

            try {
                if (copyMode) {
                    fs.copyFileSync(filePath, destPath);
                } else {
                    fs.renameSync(filePath, destPath);
                }
            } catch (error) {
                console.error("File operation failed:", error);
                eagle.dialog.showErrorBox(
                    "Operation Failed",
                    `Couldn't ${copyMode ? "copy" : "move"} ${fileName}`
                );
            }
        }

        // Refresh badges
        document.body.innerHTML = await getPropsBadges(eagle);
        sliderManager.initialize();
        initDragDrop();
    });
}
// !SECTION

// SECTION core implementation (continued)
function createSliderManager() {
    let currentSlider = null;
    let changeHandler = null;

    return {
        initialize() {
            const { ItemProp } = require(path.join(
                pluginPath,
                "utils",
                "itemProp.js"
            ));
            const itemProp = new ItemProp({ filePath: recievedPath });

            // Cleanup previous slider
            if (currentSlider) {
                currentSlider.removeEventListener("input", changeHandler);
            }

            currentSlider = document.querySelector(".size-slider");
            if (!currentSlider) return;

            changeHandler = async (e) => {
                const size = e.target.value;
                document.documentElement.style.setProperty(
                    "--badge-font-size",
                    `${size}px`
                );
                document.documentElement.style.setProperty(
                    "--badge-height",
                    `${size * 2}px`
                );
                await itemProp.setLocal("config_slider_value", size);
            };

            currentSlider.addEventListener("input", changeHandler);
        },

        async refresh() {
            const { ItemProp } = require(path.join(
                pluginPath,
                "utils",
                "itemProp.js"
            ));
            const itemProp = new ItemProp({ filePath: recievedPath });
            const savedSize =
                (await itemProp.getLocal("config_slider_value")) || 14;

            if (currentSlider) {
                currentSlider.value = savedSize;
                document.documentElement.style.setProperty(
                    "--badge-font-size",
                    `${savedSize}px`
                );
                document.documentElement.style.setProperty(
                    "--badge-height",
                    `${savedSize * 2}px`
                );
            }
        },
    };
}

const sliderManager = createSliderManager();

async function toggleConfigKeys() {
    const { ItemProp } = require(path.join(pluginPath, "utils", "itemProp.js"));
    const itemProp = new ItemProp({ filePath: recievedPath });
    const currentValue =
        (await itemProp.getLocal("config_show_system_keys")) || false;
    await itemProp.setLocal("config_show_system_keys", !currentValue);

    // Refresh badges without full reinit
    document.body.innerHTML = await getPropsBadges(eagle);
    sliderManager.initialize();
    initDragDrop();
}

eagle.onPluginCreate(async () => {
    console.log("eagle.onPluginCreate");
});

eagle.onPluginRun(async () => {
    console.log("eagle.onPluginRun");
    document.body.innerHTML = await getPropsBadges(eagle);
    sliderManager.initialize();
    initDragDrop();
    const { ItemProp } = require(path.join(pluginPath, "utils", "itemProp.js"));
    const itemProp = new ItemProp({ filePath: recievedPath });

    // Initialize slider with persisted value
    const slider = document.querySelector(".size-slider");
    const savedSize = (await itemProp.getLocal("config_slider_value")) || 14;
    slider.value = savedSize;
    document.documentElement.style.setProperty(
        "--badge-font-size",
        `${savedSize}px`
    );
    document.documentElement.style.setProperty(
        "--badge-height",
        `${savedSize * 2}px`
    );

    // Update storage on slider change
    slider.addEventListener("input", async (e) => {
        const size = e.target.value;
        document.documentElement.style.setProperty(
            "--badge-font-size",
            `${size}px`
        );
        document.documentElement.style.setProperty(
            "--badge-height",
            `${size * 2}px`
        );
        await itemProp.setLocal("config_slider_value", size);
    });

    // Add context menu
    document.addEventListener("contextmenu", (e) => {
        const badge = e.target.closest(".badge");
        const slider = document.querySelector(".size-slider");

        // Calculate distances if elements exist
        let badgeDistance = Infinity;
        let sliderDistance = Infinity;

        if (badge) {
            const rect = badge.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            badgeDistance = Math.hypot(
                e.clientX - centerX,
                e.clientY - centerY
            );
            console.log("badgeDistance", badgeDistance);
        }

        if (slider) {
            const rect = slider.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            sliderDistance = Math.hypot(
                e.clientX - centerX,
                e.clientY - centerY
            );
            console.log("sliderDistance", sliderDistance);
        }

        if (!(badgeDistance <= 120 || sliderDistance <= 260)) {
            console.log("not triggering", badgeDistance, sliderDistance);
            return;
        }

        e.preventDefault();
        const selectedBadge = e.target.closest(".badge");
        const submenu = [];

        if (selectedBadge) {
            const isFileBadge = selectedBadge.classList.contains("file-badge");
            const isKeyValue =
                selectedBadge.classList.contains("key-value-badge");

            submenu.push({
                id: "delete",
                label: "Delete",
                click: async () => {
                    const filePath = selectedBadge.dataset.filePath;
                    if (isFileBadge && filePath) {
                        const fullPath = path.join(
                            path.dirname(recievedPath),
                            "extendedFiles",
                            path.basename(filePath)
                        );
                        const { response } = await eagle.dialog.showMessageBox({
                            type: "question",
                            buttons: ["Cancel", "Delete"],
                            title: "Confirm Deletion",
                            message:
                                "Are you sure you want to delete this file?",
                            detail: `Path: ${fullPath}`,
                        });

                        if (response === 1) {
                            fs.unlinkSync(fullPath);
                            const itemProp = new ItemProp({ filePath });
                            await itemProp.delete(path.basename(filePath));
                            document.body.innerHTML = await getPropsBadges(
                                eagle
                            );
                        }
                    } else if (isKeyValue) {
                        const key =
                            selectedBadge.querySelector(
                                ".badge-key"
                            ).textContent;
                        const itemProp = new ItemProp({
                            filePath: recievedPath,
                        });
                        await itemProp.deleteLocal(key);
                        document.body.innerHTML = await getPropsBadges(eagle);
                    }
                },
            });

            submenu.push({
                id: "edit",
                label: "Edit",
                click: async () => {
                    const badge = e.target.closest(".key-value-badge");
                    const key = badge.querySelector(".badge-key").textContent;
                    const value =
                        badge.querySelector(".badge-value").textContent;
                    badge.outerHTML = new KeyValueBadge(
                        key,
                        value,
                        true
                    ).render().outerHTML;
                },
            });
        }

        // Always available add option
        submenu.push({
            id: "add",
            label: "Add Property",
            click: () => {
                const container = document.querySelector(".badge-container");
                container.insertAdjacentHTML(
                    "beforeend",
                    new KeyValueBadge("", "", true).render().outerHTML
                );
            },
        });

        eagle.contextMenu.open([
            { id: "badge_actions", label: "Badge Actions", submenu },
        ]);
    });

    // Update event listener for Enter key
    document.addEventListener("keypress", async (e) => {
        if (
            e.target.classList.contains("badge-key-edit") ||
            e.target.classList.contains("badge-value-edit")
        ) {
            if (e.key === "Enter") {
                const badge = e.target.closest(".badge");
                const keyInput = badge.querySelector(".badge-key-edit");
                const valueInput = badge.querySelector(".badge-value-edit");

                if (!keyInput.value || !valueInput.value) {
                    alert("Both key and value are required");
                    return;
                }

                const itemProp = new ItemProp({ filePath: recievedPath });
                await itemProp.setLocal(keyInput.value, valueInput.value);
                document.body.innerHTML = await getPropsBadges(eagle);
            }
        }
    });

    // Add double-click handler
    document.addEventListener("dblclick", (e) => {
        const badge = e.target.closest(".key-value-badge");
        if (badge && !badge.classList.contains("editable")) {
            const key = badge.querySelector(".badge-key").textContent;
            const value = badge.querySelector(".badge-value").textContent;
            badge.outerHTML = new KeyValueBadge(
                key,
                value,
                true
            ).render().outerHTML;
        }
    });

    document.addEventListener("click", (e) => {
        if (e.target.id === "copy-move-toggle") {
            copyMode = !copyMode;
            e.target.textContent = copyMode ? "📋 Copy Mode" : "✂️ Move Mode";
            const container = document.querySelector(".badge-container");
            container.dataset.mode = copyMode ? "copy" : "move";
        }
    });
});

class CustomBadgeManager {
    constructor(eagle) {
        this.eagle = eagle;
        this.badges = new Map();
        this.customBadgesPath = path.join(__dirname, "custom");
    }

    loadCustomBadges() {
        try {
            console.log("loading custom badges", this.customBadgesPath);
            if (!fs.existsSync(this.customBadgesPath)) {
                fs.mkdirSync(this.customBadgesPath, { recursive: true });
                return;
            }

            const badgeFiles = fs
                .readdirSync(this.customBadgesPath)
                .filter((file) => file.endsWith(".js"));

            badgeFiles.forEach((file) => {
                try {
                    const badgePath = path.join(this.customBadgesPath, file);
                    console.log("parsing badge", badgePath);
                    const badgeModule = require(badgePath);

                    // Validate onclick type
                    if (
                        badgeModule.badge_onclick_type &&
                        !["js", "shell"].includes(
                            badgeModule.badge_onclick_type
                        )
                    ) {
                        console.warn(
                            `Skipping ${file} - invalid badge_onclick_type: ${badgeModule.badge_onclick_type}`
                        );
                        return;
                    }

                    const badgeId = path.basename(file, ".js");
                    if (this.badges.has(badgeId)) {
                        throw new Error("duplicate badge");
                    }
                    this.badges.set(badgeId, {
                        module: badgeModule,
                        path: badgePath,
                    });
                } catch (e) {
                    console.error(`Error loading badge ${file}:`, e);
                }
            });
        } catch (e) {
            console.error("Error loading custom badges:", e);
        }
    }

    getBadgeHTMLs() {
        return Array.from(this.badges.entries()).map(([badgeId, badgeData]) => {
            const { module: badgeModule, path: badgePath } = badgeData;
            const badgeType = this.getBadgeType(badgeModule.badge_type);

            const badge = new badgeType(badgeModule.badge_text);
            const element = badge.render();

            // Generate unique ID and store source path
            const badgeUUID = `customBadge-${uuidv4()}`;
            element.id = badgeUUID;
            element.dataset.sourcePath = badgePath;

            // Create edit button container
            const buttonContainer = document.createElement("div");
            buttonContainer.className = "badge-actions";

            // Create edit button
            const editButton = document.createElement("button");
            editButton.className = "badge-edit";
            editButton.innerHTML = "✎";
            editButton.title = "Edit badge source";
            editButton.onclick = (e) => {
                e.stopPropagation();
                eagle.shell.openPath(badgePath);
            };

            // Add buttons to container
            buttonContainer.appendChild(editButton);

            // Insert button container at start of badge
            element.insertBefore(buttonContainer, element.firstChild);

            return element;
        });
    }

    getBadgeType(badgeType) {
        switch (badgeType) {
            case "file":
                return FileBadge;
            case "key_value":
                return KeyValueBadge;
            default:
                return BaseBadge;
        }
    }
}

// Initialize the manager (add this where you create other managers)
const customBadgeManager = new CustomBadgeManager(eagle);
customBadgeManager.loadCustomBadges();

// Unified click handler for all custom badges
document.addEventListener("click", async (e) => {
    // Handle edit button clicks first
    const editButton = e.target.closest(".badge-edit");
    if (editButton) {
        e.stopPropagation();
        const badgeElement = editButton.closest('[id^="customBadge-"]');
        const sourcePath = badgeElement.dataset.sourcePath;
        console.log("editButton", sourcePath);
        await eagle.shell.openPath(sourcePath);
        return;
    }

    // Then handle badge clicks
    const badgeElement = e.target.closest('[id^="customBadge-"]');
    if (!badgeElement) return;

    // Only proceed if click wasn't on any interactive elements
    if (e.target.tagName === "BUTTON" || e.target.tagName === "A") return;

    const sourcePath = badgeElement.dataset.sourcePath;
    try {
        const badgeModule = require(sourcePath);

        if (!badgeModule.onclick) return;

        switch (badgeModule.badge_onclick_type) {
            case "js":
                await badgeModule.onclick({
                    eagle,
                    path: recievedPath,
                    element: badgeElement,
                    dirPath: path.dirname(recievedPath),
                    sourcePath,
                });
                break;

            case "shell":
                const command =
                    typeof badgeModule.onclick === "string"
                        ? badgeModule.onclick
                        : await badgeModule.onclick({
                              dirPath: path.dirname(recievedPath),
                              sourcePath,
                          });

                // Replace with child_process execution
                const { spawn } = require("child_process");
                const parsedCommand = eval(`\`${command}\``); // Replace template variables

                console.log("Executing shell command:", parsedCommand);

                const shellProcess = spawn(parsedCommand, {
                    shell: true,
                    cwd: path.join(path.dirname(recievedPath), "extendedFiles"),
                    detached: true,
                    stdio: "ignore",
                });
                shellProcess.on("error", (error) => {
                    console.error("Command execution failed:", error);
                    eagle.dialog.showMessageBox({
                        type: "error",
                        message: "Command execution failed",
                        detail: error.message,
                    });
                });

                shellProcess.on("exit", (code) => {
                    if (code !== 0) {
                        console.error(`Command exited with code ${code}`);
                    }
                });
                break;
            default:
                console.warn(
                    "Unhandled onclick type:",
                    badgeModule.badge_onclick_type
                );
        }
    } catch (error) {
        console.error("Error handling custom badge click:", error);
    }

    // refresh badges
    window.location.reload();
});
