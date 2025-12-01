// --- State ---
let currentDirHandle = null;
let currentFileHandle = null;
let currentFileLastModified = 0;
let liveMode = false;
let liveInterval = null;
let suppressChangeEvents = false; // Flag to suppress change events during programmatic updates
let isLoadingFile = false; // Flag to prevent live updates while loading a file
let allFiles = []; // Array of {name, handle}

// Editor state
let editor = null;
let originalFileContent = '';
let hasUnsavedChanges = false;
let currentFontSize = 14;

// --- DOM Elements ---
const els = {
    fileList: document.getElementById('fileList'),
    recentList: document.getElementById('recentList'),
    btnOpen: document.getElementById('btnOpen'),
    btnLive: document.getElementById('btnLive'),
    searchBar: document.getElementById('searchBar'),
    fileInfo: document.getElementById('fileInfo'),
    dragOverlay: document.getElementById('dragOverlay'),
    btnSave: document.getElementById('btnSave'),
    editorContainer: document.getElementById('editor'),
    btnTools: document.getElementById('btnTools'),
    dropdownTools: document.getElementById('dropdownTools'),
    btnSettings: document.getElementById('btnSettings'),
    dropdownSettings: document.getElementById('dropdownSettings'),
    btnFontInc: document.getElementById('btnFontInc'),
    btnFontDec: document.getElementById('btnFontDec'),
    fontSizeDisplay: document.getElementById('fontSizeDisplay')
};

// --- IndexedDB Helper ---
const DB_NAME = 'FileViewerDB';
const DB_VERSION = 1;
const STORE_NAME = 'handles';

const dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'name' });
        }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
});

async function saveHandle(handle) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put({ name: handle.name, handle: handle, timestamp: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function getRecentHandles() {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
            const res = request.result.sort((a, b) => b.timestamp - a.timestamp);
            resolve(res);
        };
        request.onerror = () => reject(request.error);
    });
}

async function verifyPermission(fileHandle, readWrite) {
    const options = {};
    if (readWrite) options.mode = 'readwrite';
    if ((await fileHandle.queryPermission(options)) === 'granted') return true;
    if ((await fileHandle.requestPermission(options)) === 'granted') return true;
    return false;
}

// --- Ace Editor Functions ---

function getAceMode(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const modeMap = {
        'js': 'javascript',
        'mjs': 'javascript',
        'cjs': 'javascript',
        'jsx': 'javascript',
        'ts': 'typescript',
        'tsx': 'typescript',
        'html': 'html',
        'htm': 'html',
        'css': 'css',
        'json': 'json',
        'py': 'python',
        'md': 'markdown',
        'xml': 'xml',
        'xaml': 'xml',
        'svg': 'xml',
        'yml': 'yaml',
        'yaml': 'yaml',
        'cpp': 'c_cpp',
        'c': 'c_cpp',
        'h': 'c_cpp',
        'hpp': 'c_cpp',
        'java': 'java',
        'cs': 'csharp',
        'go': 'golang',
        'rs': 'rust',
        'php': 'php',
        'rb': 'ruby',
        'sh': 'sh',
        'bash': 'sh',
        'sql': 'sql',
        'txt': 'text',
        'log': 'log'  // Use custom log mode
    };

    return modeMap[ext] || 'text';
}

function createEditor(content, filename) {
    // Initialize Ace Editor if not already done
    if (!editor) {
        editor = ace.edit("editor");
        editor.setTheme("ace/theme/monokai"); // Dark theme similar to Okaidia
        editor.setOptions({
            fontSize: `${currentFontSize}px`,
            fontFamily: "'JetBrains Mono', monospace",
            showPrintMargin: false,
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: false,
            enableSnippets: false,
            tabSize: 2,
            useSoftTabs: true
        });

        // Listen for changes
        editor.session.on('change', () => {
            checkForChanges();
        });
    }

    // Set language mode
    const mode = getAceMode(filename);
    editor.session.setMode(`ace/mode/${mode}`);

    // Set content and normalize originalFileContent
    suppressChangeEvents = true;
    try {
        editor.setValue(content, -1); // -1 moves cursor to start

        // Force editor to resize and recalculate positions
        editor.resize();
        editor.renderer.updateFull();

        // Store original content AFTER setting value to ensure normalization (e.g. line endings) matches
        originalFileContent = editor.getValue();
        hasUnsavedChanges = false;
        els.btnSave.style.display = 'none';
    } finally {
        suppressChangeEvents = false;
    }
}

function checkForChanges() {
    if (!editor) return;
    if (suppressChangeEvents) return; // Ignore changes triggered by programmatic updates

    const currentContent = editor.getValue();
    hasUnsavedChanges = currentContent !== originalFileContent;

    if (hasUnsavedChanges) {
        els.btnSave.style.display = 'inline-block';
        els.btnSave.classList.add('unsaved');

        // Auto-disable Live mode when editing to prevent losing changes
        if (liveMode) {
            liveMode = false;
            els.btnLive.textContent = 'Live: Off';
            els.btnLive.classList.remove('active');
            if (liveInterval) clearInterval(liveInterval);

            // Show notification
            const originalInfo = els.fileInfo.textContent;
            const originalColor = els.fileInfo.style.color;
            els.fileInfo.textContent = 'Live mode disabled - unsaved changes';
            els.fileInfo.style.color = '#dcdcaa';

            setTimeout(() => {
                if (els.fileInfo.textContent === 'Live mode disabled - unsaved changes') {
                    els.fileInfo.textContent = originalInfo;
                    els.fileInfo.style.color = originalColor;
                }
            }, 3000);
        }
    } else {
        els.btnSave.style.display = 'none';
        els.btnSave.classList.remove('unsaved');
    }
}

// --- Core Logic ---

async function scanDirectory(dirHandle, path = '') {
    const items = [];

    try {
        for await (const entry of dirHandle.values()) {
            const fullPath = path ? `${path}/${entry.name}` : entry.name;

            if (entry.kind === 'directory') {
                const children = await scanDirectory(entry, fullPath);
                items.push({
                    name: entry.name,
                    type: 'directory',
                    handle: entry,
                    path: fullPath,
                    children: children,
                    expanded: false
                });
            } else {
                items.push({
                    name: entry.name,
                    type: 'file',
                    handle: entry,
                    path: fullPath
                });
                allFiles.push({ name: entry.name, handle: entry, path: fullPath });
            }
        }
    } catch (err) {
        console.error('Error scanning directory:', err);
    }

    items.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'directory' ? -1 : 1;
    });

    return items;
}

async function loadFolder(dirHandle) {
    currentDirHandle = dirHandle;
    allFiles = [];
    els.fileList.innerHTML = '<li class="empty-msg">Loading...</li>';
    els.searchBar.style.display = 'block';
    els.searchBar.value = '';

    try {
        const tree = await scanDirectory(dirHandle);
        renderFileTree(tree);
        await saveHandle(dirHandle);
        renderRecentList();
    } catch (err) {
        console.error(err);
        els.fileList.innerHTML = '<li class="empty-msg">Error loading folder</li>';
    }
}

function renderFileTree(tree, parentElement = null) {
    const container = parentElement || els.fileList;

    if (!parentElement) {
        container.innerHTML = '';
    }

    if (tree.length === 0 && !parentElement) {
        container.innerHTML = '<li class="empty-msg">No files found</li>';
        return;
    }

    tree.forEach(item => {
        const li = document.createElement('li');
        li.className = item.type === 'directory' ? 'folder-item' : 'file-item';
        // Remove manual padding, rely on CSS nesting
        // li.style.paddingLeft = `${level * 16 + 8}px`; 

        if (item.type === 'directory') {
            // Create container for folder content to handle click
            const folderContent = document.createElement('div');
            folderContent.className = 'folder-content';
            folderContent.style.display = 'flex';
            folderContent.style.alignItems = 'center';
            folderContent.style.width = '100%';

            const icon = document.createElement('span');
            icon.className = 'folder-icon';
            icon.textContent = item.expanded ? '▼' : '▶';

            const folderName = document.createElement('span');
            folderName.className = 'folder-name';
            folderName.textContent = `📁 ${item.name}`;

            folderContent.appendChild(icon);
            folderContent.appendChild(folderName);
            li.appendChild(folderContent);

            // Container for children
            const childrenContainer = document.createElement('ul');
            childrenContainer.className = 'tree-children';
            if (item.expanded) {
                childrenContainer.classList.add('expanded');
            }
            li.appendChild(childrenContainer);

            // Render children if they exist
            if (item.children && item.children.length > 0) {
                renderFileTree(item.children, childrenContainer);
            }

            // Click handler on the folder content div, not the whole LI (to avoid bubbling issues with children)
            folderContent.onclick = (e) => {
                e.stopPropagation();
                item.expanded = !item.expanded;
                icon.textContent = item.expanded ? '▼' : '▶';

                if (item.expanded) {
                    childrenContainer.classList.add('expanded');
                } else {
                    childrenContainer.classList.remove('expanded');
                }
            };

            // Override the default li styles since we are nesting
            li.style.display = 'block';
            li.style.padding = '0'; // Reset padding for the LI container
            folderContent.style.padding = '6px 12px'; // Apply padding to content
            folderContent.style.cursor = 'pointer';
            folderContent.onmouseover = () => folderContent.style.backgroundColor = 'var(--hover-bg)';
            folderContent.onmouseout = () => folderContent.style.backgroundColor = '';

        } else {
            const fileName = document.createElement('span');
            fileName.textContent = `📄 ${item.name}`;
            li.appendChild(fileName);

            li.onclick = (e) => {
                e.stopPropagation();
                openFile(item.handle, li);
            };
        }

        container.appendChild(li);
    });
}

function renderFileList(files) {
    els.fileList.innerHTML = '';
    if (files.length === 0) {
        els.fileList.innerHTML = '<li class="empty-msg">No files found</li>';
        return;
    }
    files.forEach(file => {
        const li = document.createElement('li');
        li.className = 'file-item';
        li.textContent = file.name;
        li.onclick = () => openFile(file.handle, li);
        els.fileList.appendChild(li);
    });
}

async function openFile(fileHandle, liElement) {
    // Check for unsaved changes
    if (hasUnsavedChanges) {
        const confirmDiscard = confirm('You have unsaved changes. Discard them?');
        if (!confirmDiscard) return;
    }

    isLoadingFile = true;

    try {
        // UI Update
        document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
        if (liElement) liElement.classList.add('active');

        currentFileHandle = fileHandle;

        // Read File
        const file = await fileHandle.getFile();
        currentFileLastModified = file.lastModified;
        const text = await file.text();

        // Update Info
        els.fileInfo.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;

        // Create editor with syntax highlighting
        createEditor(text, file.name);
    } finally {
        isLoadingFile = false;
    }
}

// --- Save File ---

async function saveFile() {
    if (!currentFileHandle || !editor) {
        return;
    }

    try {
        const permission = await verifyPermission(currentFileHandle, true);
        if (!permission) {
            alert('Write permission denied. Cannot save file.');
            return;
        }

        // Check if file was modified externally before saving
        const currentFile = await currentFileHandle.getFile();
        if (currentFile.lastModified > currentFileLastModified) {
            // File was modified externally!
            const externalContent = await currentFile.text();

            // Check if external content is different from what we're about to save
            const ourContent = editor.getValue();
            if (externalContent !== ourContent) {
                const confirmOverwrite = confirm(
                    '⚠️ WARNING: This file was modified externally!\n\n' +
                    'Another program has changed this file since you opened it.\n\n' +
                    'If you save now, you will OVERWRITE those external changes.\n\n' +
                    'Options:\n' +
                    '• Click OK to OVERWRITE external changes with your version\n' +
                    '• Click Cancel to keep the external version (you will lose your edits)\n\n' +
                    'Do you want to OVERWRITE the external changes?'
                );

                if (!confirmOverwrite) {
                    // User chose to keep external version - reload it
                    editor.setValue(externalContent, -1);
                    editor.resize();
                    editor.renderer.updateFull();
                    originalFileContent = externalContent;
                    hasUnsavedChanges = false;
                    currentFileLastModified = currentFile.lastModified;
                    els.btnSave.style.display = 'none';
                    els.btnSave.classList.remove('unsaved');

                    // Show notification
                    const originalInfo = els.fileInfo.textContent;
                    els.fileInfo.textContent = 'Reloaded external changes - your edits were discarded';
                    els.fileInfo.style.color = '#dcdcaa';

                    setTimeout(() => {
                        els.fileInfo.textContent = originalInfo;
                        els.fileInfo.style.color = '';
                    }, 3000);

                    return;
                }
                // User chose to overwrite - continue with save
            }
        }

        const newContent = editor.getValue();
        const writable = await currentFileHandle.createWritable();
        await writable.write(newContent);
        await writable.close();

        // Update state
        originalFileContent = newContent;
        hasUnsavedChanges = false;

        // Update last modified time to the new file's timestamp
        const savedFile = await currentFileHandle.getFile();
        currentFileLastModified = savedFile.lastModified;

        els.btnSave.style.display = 'none';
        els.btnSave.classList.remove('unsaved');

        // Show success message
        const originalInfo = els.fileInfo.textContent;
        els.fileInfo.textContent = 'Saved!';
        els.fileInfo.style.color = '#4caf50';

        setTimeout(() => {
            els.fileInfo.textContent = originalInfo;
            els.fileInfo.style.color = '';
        }, 2000);

        console.log('File saved successfully');
    } catch (err) {
        console.error('Error saving file:', err);
        alert(`Failed to save file: ${err.message}`);
    }
}

// --- Live Mode ---

els.btnLive.addEventListener('click', () => {
    setLiveMode(!liveMode);
});

function setLiveMode(enabled) {
    liveMode = enabled;
    els.btnLive.textContent = `Live: ${liveMode ? 'On' : 'Off'}`;
    els.btnLive.classList.toggle('active', liveMode);

    if (liveInterval) clearInterval(liveInterval);

    if (liveMode) {
        liveInterval = setInterval(async () => {
            if (!currentFileHandle || isLoadingFile) return;
            try {
                const file = await currentFileHandle.getFile();
                if (file.lastModified > currentFileLastModified) {
                    console.log('File changed, reloading...');
                    const text = await file.text();

                    // Update editor content
                    if (editor) {
                        suppressChangeEvents = true;
                        try {
                            // Update editor
                            editor.setValue(text, -1);

                            // Update source of truth from editor to ensure normalization
                            originalFileContent = editor.getValue();
                            currentFileLastModified = file.lastModified;
                        } finally {
                            suppressChangeEvents = false;
                        }
                    }
                }
            } catch (e) {
                console.error('Live mode error:', e);
            }
        }, 1000);
    }
}

// --- Search / Filter ---

els.searchBar.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allFiles.filter(f => f.name.toLowerCase().includes(term));
    renderFileList(filtered);
});

// --- Recent Folders ---

async function renderRecentList() {
    const recents = await getRecentHandles();
    els.recentList.innerHTML = '';
    recents.forEach(item => {
        const li = document.createElement('li');
        li.className = 'file-item';
        li.textContent = item.name;
        li.onclick = async () => {
            if (await verifyPermission(item.handle, false)) {
                await loadFolder(item.handle);
            } else {
                alert('Permission denied to open folder.');
            }
        };
        els.recentList.appendChild(li);
    });
}

// --- Drag & Drop ---

document.addEventListener('dragover', (e) => {
    e.preventDefault();
    document.body.classList.add('dragging');
});

document.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null) {
        document.body.classList.remove('dragging');
    }
});

document.addEventListener('drop', async (e) => {
    e.preventDefault();
    document.body.classList.remove('dragging');

    const items = [...e.dataTransfer.items];
    const handleItem = items.find(item => item.kind === 'file');

    if (handleItem) {
        try {
            const handle = await handleItem.getAsFileSystemHandle();
            if (handle.kind === 'directory') {
                await loadFolder(handle);
            } else {
                alert('Please drop a folder to open it.');
            }
        } catch (err) {
            console.error('Drop error:', err);
        }
    }
});

// --- Init ---

els.btnOpen.addEventListener('click', async () => {
    try {
        const handle = await window.showDirectoryPicker();
        await loadFolder(handle);
    } catch (e) {
        // User cancelled
    }
});

// Save button
els.btnSave.addEventListener('click', saveFile);

// Keyboard shortcut: Ctrl+S to save
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
    }
});

// Warn before leaving page with unsaved changes
window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// Initial Render
renderRecentList();
setLiveMode(true); // Enable Live Mode by default

// --- Tools & Settings Dropdowns ---

function toggleDropdown(dropdown) {
    // Close all other dropdowns
    document.querySelectorAll('.dropdown-content').forEach(el => {
        if (el !== dropdown) el.classList.remove('show');
    });
    dropdown.classList.toggle('show');
}

els.btnTools.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown(els.dropdownTools);
});

els.btnSettings.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown(els.dropdownSettings);
});

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) {
        document.querySelectorAll('.dropdown-content').forEach(el => el.classList.remove('show'));
    }
});

// Font Size Control
function updateFontSize(change) {
    currentFontSize += change;
    if (currentFontSize < 8) currentFontSize = 8;
    if (currentFontSize > 32) currentFontSize = 32;

    els.fontSizeDisplay.textContent = `${currentFontSize}px`;
    if (editor) {
        editor.setOptions({ fontSize: `${currentFontSize}px` });
    }
}

els.btnFontInc.addEventListener('click', (e) => {
    e.stopPropagation();
    updateFontSize(1);
});

els.btnFontDec.addEventListener('click', (e) => {
    e.stopPropagation();
    updateFontSize(-1);
});
