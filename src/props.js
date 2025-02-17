const fs = require('fs');
const path = require('path');
const pluginPath = path.join(path.dirname(__dirname));

const urlParams = new URLSearchParams(window.location.search);
const recievedPath = urlParams.get('path');

let copyMode = true;

function createBuiltinBadges(eagle) {
    return [
        createShellBadge(eagle),
        createOpenFolderBadge(eagle),
    ];
}

function createShellBadge(eagle) {

    return `
        <div class="badge builtin-badge" id="open-shell-badge">
            💻 Open Shell
        </div>
    `;
}

function which(command) {
    try {
        const { execSync } = require('child_process');
        const checkCommand = eagle.app.isWindows 
            ? `where ${command}` 
            : `command -v ${command}`;
        
        const path = execSync(checkCommand, { 
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'] 
        }).trim();

        console.log(`Found ${command} at:`, path);
        return path.split('\n')[0]; // Return first match
    } catch (e) {
        console.warn(`${command} not found:`, e.message);
        return null;
    }
}

document.addEventListener('click', (e) => {
    if (e.target.id === 'open-shell-badge') {
        const path = require('path');
        const { spawn } = require('child_process');
        const dirPath = path.dirname(recievedPath);
        
        // Check for pwsh with proper casing
        const shellPath = which('pwsh') || which('Powershell') ||
                        which('powershell') || 
                        (eagle.app.isWindows ? 'cmd.exe' : 'bash');

        console.log('Selected shell:', shellPath);

        let shellArgs = ['-NoExit', '-Command', `Set-Location -Path '${dirPath}'`];
        
        if (shellPath === 'cmd.exe') {
            shellArgs = ['/K', `cd /d "${dirPath}"`];
        } else if (shellPath === 'bash') {
            shellArgs = ['-c', `cd "${dirPath}" && exec bash`];
        }

        spawn(shellPath, shellArgs, {
            shell: true,
            detached: true,
            stdio: 'ignore'
        });
    }
});

function createOpenFolderBadge(eagle) {
    const dirPath = path.join(path.dirname(recievedPath), 'extendedFiles');
    return `
        <div class="badge builtin-badge" 
             onclick="eagle.shell.openPath('${dirPath.replace(/\\/g, '\\\\')}')">
            📁 Open Extended Files
        </div>
    `;
}

async function getPropsBadges(eagle) {
    const dirPath = path.dirname(recievedPath);
    const extendedFilesPath = path.join(dirPath, 'extendedFiles');
    
    // Create directory if missing
    if (!fs.existsSync(extendedFilesPath)) {
        fs.mkdirSync(extendedFilesPath, { recursive: true });
    }

    const files = fs.readdirSync(extendedFilesPath)
        .filter(file => {
            // Ignore hidden files and specific excluded files
            const excluded = [
                'metadata.json',
                path.basename(recievedPath),
                'itemProp.json'
            ];
            return !file.startsWith('.') && !excluded.includes(file);
        });

    const { ItemProp } = require(path.join(pluginPath, 'utils', 'itemProp.js'));
    const itemProp = new ItemProp({ filePath: recievedPath });
    let itemProps = {};
    
    const showConfigKeys = await itemProp.getLocal('config_show_system_keys') || false;

    try {
        for await (const [key, value] of itemProp.iterLocal()) {
            if (!showConfigKeys && key.startsWith('config_')) {
                continue;
            }
            itemProps[key] = value;
        }
    } catch (e) {
        console.error('Error loading item properties:', e);
    }

    // Generate badge HTML
    const badges = [
        ...createBuiltinBadges(eagle),
        ...files.map(file => createBadge(file, null, path.join(dirPath, 'extendedFiles', file))),
        ...Object.entries(itemProps).map(([key, value]) => createBadge(key, value))
    ];

    return `
        <div class="controls">
            <div class="controls-group">
                <button class="control-btn" onclick="toggleConfigKeys()">
                    ${showConfigKeys ? '🔒' : '🔓'}
                </button>
                <button class="control-btn" onclick="location.reload()">
                    🔄
                </button>
                <button class="control-btn" id="copy-move-toggle">
                    ${copyMode ? '📋 Copy Mode' : '✂️ Move Mode'}
                </button>
            </div>
            <input type="range" class="size-slider" 
                   min="12" max="24" value="${itemProps.config_slider_value || 14}" 
                   step="1" aria-label="Badge size">
        </div>
        <div class="badge-container" data-mode="${copyMode ? 'copy' : 'move'}">
            ${badges.join('')}
        </div>
    `;
}

function createBadge(name, value = null, filePath = null, isNew = false) {
    const dirPath = path.dirname(recievedPath);
    const fullPath = filePath ? 
        path.join(dirPath, 'extendedFiles', path.basename(filePath)) : 
        null;
    
    const escapedPath = fullPath ? 
        fullPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'") : 
        '';
    const onClick = filePath ? `onclick="eagle.shell.openPath('${escapedPath}')"` : '';
    const colorClass = `badge-color-${Math.floor(Math.random() * 6) + 1}`;
    
    // Editable badge template
    if (isNew) {
        return `
            <div class="badge editable ${colorClass} key-value-badge">
                <input type="text" 
                       class="badge-key-edit" 
                       placeholder="Key" 
                       value="${name}"
                       style="height: var(--badge-height); padding: 0 12px;">
                <input type="text" 
                       class="badge-value-edit" 
                       placeholder="Value" 
                       value="${value || ''}"
                       style="height: var(--badge-height); padding: 0 12px;">
            </div>
        `;
    }
    
    // Existing badge template
    return `
        <div class="badge ${colorClass} ${value ? 'key-value-badge' : 'file-badge'}" 
             ${onClick}
             ${filePath ? `data-file-path="${escapedPath}"` : ''}>
            <span class="badge-key" data-tooltip="${name}">${name}</span>
            ${value ? `<span class="badge-value" data-tooltip="${value}">${value}</span>` : ''}
        </div>
    `;
}

async function toggleConfigKeys() {
    const { ItemProp } = require(path.join(pluginPath, 'utils', 'itemProp.js'));
    const itemProp = new ItemProp({ filePath: recievedPath });
    const currentValue = await itemProp.getLocal('config_show_system_keys') || false;
    await itemProp.setLocal('config_show_system_keys', !currentValue);
    
    // Refresh badges without full reinit
    document.body.innerHTML = await getPropsBadges(eagle);
    initializeSlider();
    initDragDrop();
}

// Extract slider logic to separate function
function initializeSlider() {
    const { ItemProp } = require(path.join(pluginPath, 'utils', 'itemProp.js'));
    const itemProp = new ItemProp({ filePath: recievedPath });
    
    const slider = document.querySelector('.size-slider');
    if (!slider) return;

    slider.addEventListener('input', async (e) => {
        const size = e.target.value;
        document.documentElement.style.setProperty('--badge-font-size', `${size}px`);
        document.documentElement.style.setProperty('--badge-height', `${size * 2}px`);
        await itemProp.setLocal('config_slider_value', size);
    });
}

function initDragDrop() {
    const container = document.querySelector('.badge-container');
    
    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        container.classList.add('dragover');
    });

    container.addEventListener('dragleave', (e) => {
        container.classList.remove('dragover');
    });

    container.addEventListener('drop', async (e) => {
        e.preventDefault();
        container.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        const dirPath = path.dirname(recievedPath);
        
        for (let file of files) {
            const filePath = file.path;
            const fileName = path.basename(filePath);
            const destPath = path.join(dirPath, 'extendedFiles', fileName);
            
            try {
                if (copyMode) {
                    fs.copyFileSync(filePath, destPath);
                } else {
                    fs.renameSync(filePath, destPath);
                }
            } catch (error) {
                console.error('File operation failed:', error);
                eagle.dialog.showErrorBox('Operation Failed', `Couldn't ${copyMode ? 'copy' : 'move'} ${fileName}`);
            }
        }
        
        // Refresh badges
        document.body.innerHTML = await getPropsBadges(eagle);
        initializeSlider();
        initDragDrop();
    });
}

eagle.onPluginCreate(async () => {
    console.log("eagle.onPluginCreate");
});

eagle.onPluginRun(async () => {
    console.log("eagle.onPluginRun");
    document.body.innerHTML = await getPropsBadges(eagle);
    initializeSlider();
    initDragDrop();
    const { ItemProp } = require(path.join(pluginPath, 'utils', 'itemProp.js'));
    const itemProp = new ItemProp({ filePath: recievedPath });
    
    // Initialize slider with persisted value
    const slider = document.querySelector('.size-slider');
    const savedSize = await itemProp.getLocal('config_slider_value') || 14;
    slider.value = savedSize;
    document.documentElement.style.setProperty('--badge-font-size', `${savedSize}px`);
    document.documentElement.style.setProperty('--badge-height', `${savedSize * 2}px`);

    // Update storage on slider change
    slider.addEventListener('input', async (e) => {
        const size = e.target.value;
        document.documentElement.style.setProperty('--badge-font-size', `${size}px`);
        document.documentElement.style.setProperty('--badge-height', `${size * 2}px`);
        await itemProp.setLocal('config_slider_value', size);
    });

    // Add context menu
    document.addEventListener('contextmenu', (e) => {
        const badge = e.target.closest('.badge');
        const slider = document.querySelector('.size-slider');

        // Calculate distances if elements exist
        let badgeDistance = Infinity;
        let sliderDistance = Infinity;
        
        if (badge) {
            const rect = badge.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            badgeDistance = Math.hypot(e.clientX - centerX, e.clientY - centerY);
            console.log("badgeDistance", badgeDistance);
        }
        
        if (slider) {
            const rect = slider.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            sliderDistance = Math.hypot(e.clientX - centerX, e.clientY - centerY);
            console.log("sliderDistance", sliderDistance);
        }

        if (!(badgeDistance <= 120 || sliderDistance <= 260)) {
            console.log("not triggering", badgeDistance, sliderDistance);
            return;
        }
        
        e.preventDefault();
        const selectedBadge = e.target.closest('.badge');
        const submenu = [];

        if (selectedBadge) {
            const isFileBadge = selectedBadge.classList.contains('file-badge');
            const isKeyValue = selectedBadge.classList.contains('key-value-badge');

            submenu.push({
                id: "delete",
                label: "Delete",
                click: async () => {
                    const filePath = selectedBadge.dataset.filePath;
                    if (isFileBadge && filePath) {
                        const fullPath = path.join(path.dirname(recievedPath), 'extendedFiles', path.basename(filePath));
                        const { response } = await eagle.dialog.showMessageBox({
                            type: 'question',
                            buttons: ['Cancel', 'Delete'],
                            title: 'Confirm Deletion',
                            message: 'Are you sure you want to delete this file?',
                            detail: `Path: ${fullPath}`
                        });

                        if (response === 1) {
                            fs.unlinkSync(fullPath);
                            const itemProp = new ItemProp({ filePath });
                            await itemProp.delete(path.basename(filePath));
                            document.body.innerHTML = await getPropsBadges(eagle);
                        }
                    } else if (isKeyValue) {
                        const key = selectedBadge.querySelector('.badge-key').textContent;
                        const itemProp = new ItemProp({ filePath: recievedPath });
                        await itemProp.deleteLocal(key);
                        document.body.innerHTML = await getPropsBadges(eagle);
                    }
                }
            });

            submenu.push({
                id: "edit",
                label: "Edit",
                click: async () => {
                    const badge = e.target.closest('.key-value-badge');
                    const key = badge.querySelector('.badge-key').textContent;
                    const value = badge.querySelector('.badge-value').textContent;
                    badge.outerHTML = createBadge(key, value, null, true);
                }
            });
        }

        // Always available add option
        submenu.push({
            id: "add",
            label: "Add Property",
            click: () => {
                const container = document.querySelector('.badge-container');
                container.insertAdjacentHTML('beforeend', createBadge('', '', null, true));
            }
        });

        // ... existing config menu item code ...

        eagle.contextMenu.open([{ id: "badge_actions", label: "Badge Actions", submenu }]);
    });

    // Update event listener for Enter key
    document.addEventListener('keypress', async (e) => {
        if (e.target.classList.contains('badge-key-edit') || 
            e.target.classList.contains('badge-value-edit')) {
            
            if (e.key === 'Enter') {
                const badge = e.target.closest('.badge');
                const keyInput = badge.querySelector('.badge-key-edit');
                const valueInput = badge.querySelector('.badge-value-edit');
                
                if (!keyInput.value || !valueInput.value) {
                    alert('Both key and value are required');
                    return;
                }

                const itemProp = new ItemProp({ filePath: recievedPath });
                await itemProp.setLocal(keyInput.value, valueInput.value);
                document.body.innerHTML = await getPropsBadges(eagle);
            }
        }
    });

    // Add double-click handler
    document.addEventListener('dblclick', (e) => {
        const badge = e.target.closest('.key-value-badge');
        if (badge && !badge.classList.contains('editable')) {
            const key = badge.querySelector('.badge-key').textContent;
            const value = badge.querySelector('.badge-value').textContent;
            badge.outerHTML = createBadge(key, value, null, true);
        }
    });

    document.addEventListener('click', (e) => {
        if (e.target.id === 'copy-move-toggle') {
            copyMode = !copyMode;
            e.target.textContent = copyMode ? '📋 Copy Mode' : '✂️ Move Mode';
            const container = document.querySelector('.badge-container');
            container.dataset.mode = copyMode ? 'copy' : 'move';
        }
    });

    return document.body.innerHTML;
});


