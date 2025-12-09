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
    btnRefresh: document.getElementById('btnRefresh'),
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

// --- CodeMirror Editor Functions ---

function getCodeMirrorMode(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const modeMap = {
        'js': 'javascript',
        'mjs': 'javascript',
        'cjs': 'javascript',
        'jsx': 'javascript',
        'ts': 'javascript',  // CodeMirror doesn't have TypeScript
        'tsx': 'javascript',
        'html': 'htmlmixed',
        'htm': 'htmlmixed',
        'css': 'css',
        'json': { name: 'javascript', json: true },
        'py': 'python',
        'md': 'markdown',
        'xml': 'xml',
        'xaml': 'xml',
        'svg': 'xml',
        'yml': 'yaml',
        'yaml': 'yaml',
        'cpp': 'text/x-c++src',
        'c': 'text/x-csrc',
        'h': 'text/x-csrc',
        'hpp': 'text/x-c++src',
        'java': 'text/x-java',
        'cs': 'text/x-csharp',
        'go': 'go',
        'rs': 'rust',
        'php': 'php',
        'rb': 'ruby',
        'sh': 'shell',
        'bash': 'shell',
        'sql': 'sql',
        'txt': 'text/plain',
        'ini': 'properties',
        'log': 'log'  // Use custom log mode
    };

    return modeMap[ext] || 'text/plain';
}

function createEditor(content, filename) {
    // Initialize CodeMirror Editor if not already done
    if (!editor) {
        editor = CodeMirror(els.editorContainer, {
            value: content,
            mode: getCodeMirrorMode(filename),
            theme: 'monokai',
            lineNumbers: true,
            lineWrapping: false,
            tabSize: 2,
            indentWithTabs: false,
            indentUnit: 2,
            styleActiveLine: true,
            matchBrackets: true,
            autoCloseBrackets: true,
            extraKeys: {
                "Tab": function(cm) {
                    if (cm.somethingSelected()) {
                        cm.indentSelection("add");
                    } else {
                        cm.replaceSelection("  ", "end");
                    }
                }
            }
        });

        // Apply font size
        editor.getWrapperElement().style.fontSize = `${currentFontSize}px`;

        // Listen for changes
        editor.on('change', () => {
            checkForChanges();
        });
    } else {
        // Update existing editor
        const mode = getCodeMirrorMode(filename);
        editor.setOption('mode', mode);
        
        suppressChangeEvents = true;
        try {
            editor.setValue(content);
            
            // Store original content
            originalFileContent = editor.getValue();
            hasUnsavedChanges = false;
            els.btnSave.style.display = 'none';
        } finally {
            suppressChangeEvents = false;
        }
    }
    
    // Apply boolean highlighting for specific file types
    const ext = filename.split('.').pop().toLowerCase();
    const needsBooleanHighlight = ['json', 'yaml', 'yml', 'ini'].includes(ext);
    if (typeof window.setBooleanHighlight === 'function') {
        window.setBooleanHighlight(editor, needsBooleanHighlight);
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
    els.btnRefresh.style.display = 'inline-block';

    try {
        const tree = await scanDirectory(dirHandle);
        fileTree = tree; // Store for filter reset
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

            // Store directory handle for context menu
            li._dirHandle = item.handle;
            li.dataset.path = item.path;

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

            // Store file handle for context menu
            li._fileHandle = item.handle;
            li.dataset.path = item.path;

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
                    suppressChangeEvents = true;
                    try {
                        editor.setValue(externalContent);
                        originalFileContent = externalContent;
                        hasUnsavedChanges = false;
                        currentFileLastModified = currentFile.lastModified;
                        els.btnSave.style.display = 'none';
                        els.btnSave.classList.remove('unsaved');
                    } finally {
                        suppressChangeEvents = false;
                    }

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
                            // Check if user was viewing the end of the document before reload
                            const lastLine = editor.lineCount() - 1;
                            const scrollInfo = editor.getScrollInfo();
                            const viewportBottom = scrollInfo.top + scrollInfo.clientHeight;
                            const docHeight = scrollInfo.height;
                            
                            // Consider "at end" if scrolled near the bottom (within 100px)
                            const wasAtEnd = (docHeight - viewportBottom) < 100;
                            
                            // Save current scroll position and cursor if not at end
                            const savedScrollTop = wasAtEnd ? null : scrollInfo.top;
                            const savedCursorPos = wasAtEnd ? null : editor.getCursor();
                            
                            // Update editor
                            editor.setValue(text);
                            
                            // Restore position based on whether user was viewing the end
                            if (wasAtEnd) {
                                // User was viewing the end, so scroll to the new end
                                const newLastLine = editor.lineCount() - 1;
                                editor.scrollIntoView({ line: newLastLine, ch: 0 });
                            } else {
                                // User was viewing another part, restore their position
                                if (savedCursorPos) {
                                    editor.setCursor(savedCursorPos);
                                }
                                if (savedScrollTop !== null) {
                                    editor.scrollTo(null, savedScrollTop);
                                }
                            }

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

let fileTree = []; // Store the original tree structure

els.searchBar.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    if (term === '') {
        // Restore original tree view when filter is cleared
        renderFileTree(fileTree);
    } else {
        // Filter files
        const filtered = allFiles.filter(f => f.name.toLowerCase().includes(term));
        renderFileList(filtered);
    }
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

// Refresh button
els.btnRefresh.addEventListener('click', async () => {
    if (currentDirHandle) {
        await loadFolder(currentDirHandle);
        els.fileInfo.textContent = 'Folder refreshed';
        setTimeout(() => { els.fileInfo.textContent = ''; }, 2000);
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
// Font Size Control

// Load from localStorage
try {
    const savedSettings = localStorage.getItem('file-viewer');
    if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        if (parsed['font-size']) {
            currentFontSize = parseInt(parsed['font-size'], 10);
        }
    }
} catch (e) {
    console.error('Failed to load settings:', e);
}

// Apply initial font size to display
if (els.fontSizeDisplay) {
    els.fontSizeDisplay.textContent = `${currentFontSize}px`;
}

function updateFontSize(change) {
    currentFontSize += change;
    if (currentFontSize < 8) currentFontSize = 8;
    if (currentFontSize > 32) currentFontSize = 32;

    els.fontSizeDisplay.textContent = `${currentFontSize}px`;
    console.log('Updating font size to:', currentFontSize, 'Editor exists:', !!editor);

    // Save to localStorage
    try {
        const settings = { 'font-size': currentFontSize };
        localStorage.setItem('file-viewer', JSON.stringify(settings));
    } catch (e) {
        console.error('Failed to save settings:', e);
    }

    if (editor) {
        // Update font size in CodeMirror
        editor.getWrapperElement().style.fontSize = `${currentFontSize}px`;
        editor.refresh(); // Refresh to apply changes
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

// --- Resizable Sidebar ---
const resizer = document.getElementById('resizer');
const sidebar = document.getElementById('sidebar');

let isResizing = false;

resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    const newWidth = e.clientX;
    if (newWidth > 150 && newWidth < 600) {
        sidebar.style.width = newWidth + 'px';
    }
});

document.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }
});

// --- Context Menu ---
const contextMenu = document.getElementById('contextMenu');
let contextMenuTarget = null;
let contextMenuClickedItem = null;
let contextMenuClickedIsDir = false;
let contextMenuDeletionParent = null;
let contextMenuClickedPath = null;

// Show context menu
function showContextMenu(x, y, targetDirHandle, clickedItem = null, isDir = false, deletionParent = null, clickedPath = null) {
    contextMenuTarget = targetDirHandle;
    contextMenuClickedItem = clickedItem;
    contextMenuClickedIsDir = isDir;
    contextMenuDeletionParent = deletionParent;
    contextMenuClickedPath = clickedPath;
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.style.display = 'block';
}

// Hide context menu
function hideContextMenu() {
    contextMenu.style.display = 'none';
    contextMenuTarget = null;
    contextMenuClickedItem = null;
    contextMenuClickedIsDir = false;
    contextMenuDeletionParent = null;
    contextMenuClickedPath = null;
}

// Create new file
async function createNewFile(parentDirHandle) {
    console.log('[CREATE FILE] Called with parentDirHandle:', parentDirHandle);
    const fileName = prompt('Enter file name:');
    console.log('[CREATE FILE] User entered:', fileName);
    if (!fileName) return;

    if (!/^[^<>:"/\\|?*]+$/.test(fileName)) {
        alert('Invalid file name. Please avoid special characters: < > : " / \\ | ? *');
        return;
    }

    try {
        const fileHandle = await parentDirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write('');
        await writable.close();
        await loadFolder(currentDirHandle);
        els.fileInfo.textContent = `File "${fileName}" created successfully`;
        setTimeout(() => { els.fileInfo.textContent = ''; }, 3000);
    } catch (err) {
        if (err.name === 'InvalidModificationError') {
            alert('File already exists!');
        } else {
            alert(`Error creating file: ${err.message}`);
        }
    }
}

// Create new folder
async function createNewFolder(parentDirHandle) {
    const folderName = prompt('Enter folder name:');
    if (!folderName) return;

    if (!/^[^<>:"/\\|?*]+$/.test(folderName)) {
        alert('Invalid folder name. Please avoid special characters: < > : " / \\ | ? *');
        return;
    }

    try {
        await parentDirHandle.getDirectoryHandle(folderName, { create: true });
        await loadFolder(currentDirHandle);
        els.fileInfo.textContent = `Folder "${folderName}" created successfully`;
        setTimeout(() => { els.fileInfo.textContent = ''; }, 3000);
    } catch (err) {
        if (err.name === 'InvalidModificationError') {
            alert('Folder already exists!');
        } else {
            alert(`Error creating folder: ${err.message}`);
        }
    }
}


// Rename file or folder
async function renameItem(itemHandle) {
    const oldName = itemHandle.name;
    const newName = prompt(`Rename "${oldName}" to:`, oldName);

    if (!newName || newName === oldName) return;

    if (!/^[^<>:"/\\|?*]+$/.test(newName)) {
        alert('Invalid name. Please avoid special characters: < > : " / \\ | ? *');
        return;
    }

    try {
        // Check if move() is supported (File System Access API)
        if (itemHandle.move) {
            await itemHandle.move(newName);
            await loadFolder(currentDirHandle);
            els.fileInfo.textContent = `Renamed to "${newName}"`;
            setTimeout(() => { els.fileInfo.textContent = ''; }, 3000);
        } else {
            alert('Rename is not supported by your browser for this file system handle.');
        }
    } catch (err) {
        alert(`Error renaming: ${err.message}`);
    }
}

// Duplicate file
async function duplicateItem(itemHandle, isDirectory, parentDirHandle) {
    if (isDirectory) {
        alert('Folder duplication is not supported yet.');
        return;
    }

    const oldName = itemHandle.name;
    const parts = oldName.split('.');
    let newName;
    if (parts.length > 1) {
        const ext = parts.pop();
        newName = `${parts.join('.')}_copy.${ext}`;
    } else {
        newName = `${oldName}_copy`;
    }

    const userBuffer = prompt('Enter name for duplicate:', newName);
    if (!userBuffer) return;
    newName = userBuffer;

    try {
        // 1. Read original content
        const file = await itemHandle.getFile();
        const content = await file.text();

        // 2. Create new file
        const newFileHandle = await parentDirHandle.getFileHandle(newName, { create: true });

        // 3. Write content
        const writable = await newFileHandle.createWritable();
        await writable.write(content);
        await writable.close();

        await loadFolder(currentDirHandle);
        els.fileInfo.textContent = `Duplicated as "${newName}"`;
        setTimeout(() => { els.fileInfo.textContent = ''; }, 3000);

    } catch (err) {
        alert(`Error duplicating file: ${err.message}`);
    }
}

// Copy Path
async function copyPath(path) {
    if (!path) {
        alert('Could not determine path.');
        return;
    }
    try {
        await navigator.clipboard.writeText(path);
        els.fileInfo.textContent = 'Path copied to clipboard!';
        setTimeout(() => { els.fileInfo.textContent = ''; }, 2000);
    } catch (err) {
        console.error('Failed to copy path:', err);
        alert('Failed to copy path to clipboard');
    }
}



// Show Properties
async function showProperties(itemHandle, path) {
    const modal = document.getElementById('propertiesModal');
    const content = document.getElementById('propertiesContent');
    const closeBtn = document.querySelector('.close-modal');
    const btnClose = document.getElementById('btnCloseProperties');

    // Reset content
    content.innerHTML = '<p>Loading...</p>';
    modal.style.display = 'block';

    const closeModal = () => {
        modal.style.display = 'none';
    };

    closeBtn.onclick = closeModal;
    btnClose.onclick = closeModal;

    // Close on outside click
    window.onclick = (event) => {
        if (event.target == modal) {
            closeModal();
        }
    };

    try {
        let size = 'N/A';
        let lastModified = 'N/A';
        let type = itemHandle.kind === 'directory' ? 'Folder' : 'File';

        if (itemHandle.kind === 'file') {
            const file = await itemHandle.getFile();
            size = (file.size / 1024).toFixed(2) + ' KB';
            lastModified = new Date(file.lastModified).toLocaleString();
            type = file.type || 'File';
        }

        // Display relative path limitation note
        const pathDisplay = path ? path : 'Root';

        content.innerHTML = `
            <div class="property-row">
                <span class="property-label">Name:</span>
                <span class="property-value">${itemHandle.name}</span>
            </div>
            <div class="property-row">
                <span class="property-label">Type:</span>
                <span class="property-value">${type}</span>
            </div>
            <div class="property-row">
                <span class="property-label">Path:</span>
                <span class="property-value">${pathDisplay} <small style="color: #888; display: block; margin-top: 4px;">(Relative to opened folder)</small></span>
            </div>
            <div class="property-row">
                <span class="property-label">Size:</span>
                <span class="property-value">${size}</span>
            </div>
            <div class="property-row">
                <span class="property-label">Modified:</span>
                <span class="property-value">${lastModified}</span>
            </div>
        `;

    } catch (err) {
        content.innerHTML = `<p style="color: red">Error fetching properties: ${err.message}</p>`;
    }
}

// Delete file or folder
async function deleteItem(itemHandle, isDirectory, parentDirHandle) {
    const itemType = isDirectory ? 'folder' : 'file';
    const itemName = itemHandle.name;

    if (!confirm(`Are you sure you want to delete this ${itemType} "${itemName}"?`)) {
        return;
    }

    try {
        // Use the parent directory handle to remove the item
        await parentDirHandle.removeEntry(itemName, { recursive: isDirectory });
        await loadFolder(currentDirHandle);
        els.fileInfo.textContent = `Deleted "${itemName}" successfully`;
        setTimeout(() => { els.fileInfo.textContent = ''; }, 3000);
    } catch (err) {
        alert(`Error deleting ${itemType}: ${err.message}`);
    }
}

// Right-click event on file list
els.fileList.addEventListener('contextmenu', (e) => {
    e.preventDefault();

    if (!currentDirHandle) {
        alert('Please open a folder first');
        return;
    }

    let target = e.target;
    let folderItem = null;
    let fileItem = null;
    let targetHandle = currentDirHandle;
    let clickedItem = null;
    let clickedItemPath = null;
    let isDir = false;

    // Traverse up to find what was clicked and its parent
    let currentNode = target;
    while (currentNode && currentNode !== els.fileList) {
        // Check if we hit a file item
        if (!clickedItem && currentNode.classList && currentNode.classList.contains('file-item')) {
            fileItem = currentNode;
            clickedItem = currentNode._fileHandle;
            clickedItemPath = currentNode.dataset.path;
            isDir = false;
        }

        // Check if we hit a folder item
        if (currentNode.classList && currentNode.classList.contains('folder-item')) {
            // If we haven't found a clicked item yet, then this folder IS the clicked item
            if (!clickedItem) {
                folderItem = currentNode;
                clickedItem = currentNode._dirHandle;
                clickedItemPath = currentNode.dataset.path;
                isDir = true;
                // For a folder, the "parent" for creation is the folder itself
                targetHandle = currentNode._dirHandle;
            } else {
                // If we already found a clicked item (e.g. a file), then this folder is the PARENT
                // This is where the file lives, so we should delete from here / create here
                targetHandle = currentNode._dirHandle;
            }
            break; // Found the parent context, stop
        }

        currentNode = currentNode.parentElement;
    }

    // If we clicked a folder, we need its PARENT to delete it
    // But we set targetHandle to the folder itself (for creation)
    // So for deletion of a folder, we actually need to look one level higher...
    // This is tricky. Let's handle it by storing a separate "deletionParentHandle"

    let deletionParentHandle = targetHandle;

    // Special case: If we clicked a folder, targetHandle is that folder.
    // But to delete it, we need its parent.
    // We can try to find the parent folder by continuing traversal?
    if (isDir && folderItem) {
        let parentNode = folderItem.parentElement; // ul.tree-children
        if (parentNode && parentNode.parentElement && parentNode.parentElement.classList.contains('folder-item')) {
            deletionParentHandle = parentNode.parentElement._dirHandle;
        } else {
            // Top level folder
            deletionParentHandle = currentDirHandle;
        }
    } else if (!isDir && clickedItem) {
        // If it's a file, targetHandle IS the parent folder (found above), so it's correct for deletion
        deletionParentHandle = targetHandle;
    }

    console.log('[RIGHT CLICK] targetHandle (create):', targetHandle, 'deletionParentHandle:', deletionParentHandle, 'clickedItem:', clickedItem);

    // Pass both handles to showContextMenu
    // We'll store deletionParentHandle in a new variable or property
    showContextMenu(e.pageX, e.pageY, targetHandle, clickedItem, isDir, deletionParentHandle, clickedItemPath);
});

// Context menu item clicks
contextMenu.addEventListener('click', async (e) => {
    let target = e.target;
    while (target && target !== contextMenu) {
        if (target.classList && target.classList.contains('context-menu-item')) {
            break;
        }
        target = target.parentElement;
    }

    const action = target?.dataset?.action;
    const savedTarget = contextMenuTarget;
    const savedClickedItem = contextMenuClickedItem;
    const savedIsDir = contextMenuClickedIsDir;
    const savedDeletionParent = contextMenuDeletionParent;
    const savedPath = contextMenuClickedPath;
    hideContextMenu();

    if (!savedTarget) return;

    if (action === 'newFile') {
        await createNewFile(savedTarget);
    } else if (action === 'newFolder') {
        await createNewFolder(savedTarget);
    } else if (action === 'delete' && savedClickedItem) {
        // Use the specific parent for deletion if available, otherwise fallback to savedTarget (which might be wrong for folders)
        // Actually, savedDeletionParent should always be correct now.
        const parentToUse = savedDeletionParent || savedTarget;
        await deleteItem(savedClickedItem, savedIsDir, parentToUse);
    } else if (action === 'rename' && savedClickedItem) {
        await renameItem(savedClickedItem);
    } else if (action === 'duplicate' && savedClickedItem) {
        const parentToUse = savedDeletionParent || savedTarget;
        await duplicateItem(savedClickedItem, savedIsDir, parentToUse);
    } else if (action === 'copyPath' && savedPath) {
        await copyPath(savedPath);
    } else if (action === 'properties' && savedClickedItem) {
        await showProperties(savedClickedItem, savedPath);
    }
});

// Hide context menu on outside click
document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
        hideContextMenu();
    }
});

// Hide context menu on ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        hideContextMenu();
    }
});
