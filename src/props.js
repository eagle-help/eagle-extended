const fs = require('fs');
const path = require('path');
const pluginPath = path.join(path.dirname(__dirname));

const urlParams = new URLSearchParams(window.location.search);
const recievedPath = urlParams.get('path');

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

document.addEventListener('click', (e) => {
    if (e.target.id === 'open-shell-badge') {
        const dirPath = path.dirname(recievedPath);
        const { spawn } = require('child_process');
        
        if (eagle.app.isWindows) {
            spawn('cmd.exe', ['/K', `cd /d "${dirPath}"`], { 
                shell: true,
                detached: true,
                stdio: 'ignore'
            });
        } else {
            spawn('bash', ['-c', `cd "${dirPath}" && exec bash`], {
                detached: true,
                stdio: 'ignore'
            });
        }
    }
});

function createOpenFolderBadge(eagle) {
    const dirPath = path.dirname(recievedPath);
    return `
        <div class="badge builtin-badge" 
             onclick="eagle.shell.openPath('${dirPath.replace(/\\/g, '\\\\')}')">
            📁 Open Folder
        </div>
    `;
}

async function getPropsBadges(eagle) {
    const dirPath = path.dirname(recievedPath);
    const files = fs.readdirSync(dirPath)
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
    try {
        for await (const [key, value] of itemProp.iterLocal()) {
            // if not key start with config_
            if (key.startsWith('config_')) {
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
        ...files.map(file => createBadge(file, null, path.join(dirPath, file))),
        ...Object.entries(itemProps).map(([key, value]) => createBadge(key, value))
    ];

    return `
        <div class="controls">
            <input type="range" class="size-slider" 
                   min="12" max="24" value="${itemProp.getLocal('config_slider_value') || 14}" 
                   step="1" aria-label="Badge size">
        </div>
        <div class="badge-container">${badges.join('')}</div>
    `;
}

function createBadge(name, value = null, filePath = null, isNew = false) {
    const escapedPath = filePath ? filePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'") : '';
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
                       style="...">
                <input type="text" 
                       class="badge-value-edit" 
                       placeholder="Value" 
                       value="${value || ''}"
                       style="...">
            </div>
        `;
    }
    
    // Existing badge template
    return `
        <div class="badge ${colorClass} ${value ? 'key-value-badge' : 'file-badge'}" 
             ${onClick}
             ${filePath ? `data-file-path="${escapedPath}"` : ''}>
            <span class="badge-key">${name}</span>
            ${value ? `<span class="badge-value">${value}</span>` : ''}
        </div>
    `;
}


eagle.onPluginCreate(async () => {
    console.log("eagle.onPluginCreate");
});

eagle.onPluginRun(async () => {
    console.log("eagle.onPluginRun");
    document.body.innerHTML = await getPropsBadges(eagle);
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

        if (!(badgeDistance <= 10 || sliderDistance <= 260)) {
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
                        const { response } = await eagle.dialog.showMessageBox({
                            type: 'question',
                            buttons: ['Cancel', 'Delete'],
                            title: 'Confirm Deletion',
                            message: 'Are you sure you want to delete this file?',
                            detail: `Path: ${filePath}`
                        });

                        if (response === 1) {
                            fs.unlinkSync(filePath);
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
});


