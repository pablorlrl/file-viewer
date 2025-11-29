// --- State ---
let currentDirHandle = null;
let currentFileHandle = null;
let currentFileLastModified = 0;
let liveMode = false;
let liveInterval = null;
let allFiles = []; // Array of {name, handle}

// Edit mode state
let editMode = false; // Tracks if edit mode is active
let hasUnsavedChanges = false; // Tracks if content has been modified
let currentFileContent = ''; // Stores original file content for comparison

// --- DOM Elements ---
const els = {
  fileList: document.getElementById('fileList'),
  recentList: document.getElementById('recentList'),
  codeContent: document.getElementById('codeContent'),
  lineNumbers: document.getElementById('lineNumbers'),
  codeWrapper: document.getElementById('codeWrapper'),
  btnOpen: document.getElementById('btnOpen'),
  btnLive: document.getElementById('btnLive'),
  searchBar: document.getElementById('searchBar'),
  fileInfo: document.getElementById('fileInfo'),
  dragOverlay: document.getElementById('dragOverlay'),
  // Edit mode elements
  btnEditMode: document.getElementById('btnEditMode'),
  btnSave: document.getElementById('btnSave'),
  codeEditor: document.getElementById('codeEditor')
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
      // Sort by timestamp desc
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

// --- Core Logic ---

// Recursively scan directory and build tree structure
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

  // Sort: directories first, then files, both alphabetically
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

// Render file tree with folders and files
function renderFileTree(tree, parentElement = null, level = 0) {
  const container = parentElement || els.fileList;

  if (!parentElement) {
    container.innerHTML = '';
  }

  if (tree.length === 0 && level === 0) {
    container.innerHTML = '<li class="empty-msg">No files found</li>';
    return;
  }

  tree.forEach(item => {
    const li = document.createElement('li');
    li.className = item.type === 'directory' ? 'folder-item' : 'file-item';
    li.style.paddingLeft = `${level * 16 + 8}px`;

    if (item.type === 'directory') {
      const icon = document.createElement('span');
      icon.className = 'folder-icon';
      icon.textContent = item.expanded ? '▼' : '▶';

      const folderName = document.createElement('span');
      folderName.className = 'folder-name';
      folderName.textContent = `📁 ${item.name}`;

      li.appendChild(icon);
      li.appendChild(folderName);

      // Toggle folder on click
      li.onclick = (e) => {
        e.stopPropagation();
        item.expanded = !item.expanded;
        icon.textContent = item.expanded ? '▼' : '▶';

        // Remove existing children
        let nextSibling = li.nextSibling;
        while (nextSibling && nextSibling.classList.contains('tree-child')) {
          const toRemove = nextSibling;
          nextSibling = nextSibling.nextSibling;
          toRemove.remove();
        }

        // Add children if expanded
        if (item.expanded && item.children.length > 0) {
          const childrenContainer = document.createElement('ul');
          childrenContainer.className = 'tree-children';
          renderFileTree(item.children, childrenContainer, level + 1);

          // Insert children after this folder
          childrenContainer.querySelectorAll('li').forEach(child => {
            child.classList.add('tree-child');
            li.parentNode.insertBefore(child, li.nextSibling);
          });
        }
      };
    } else {
      const fileName = document.createElement('span');
      fileName.textContent = `📄 ${item.name}`;
      li.appendChild(fileName);

      li.onclick = () => openFile(item.handle, li);
    }

    container.appendChild(li);
  });
}

function renderFileList(files) {
  // Legacy function - now handled by renderFileTree
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
  // Check for unsaved changes before opening a new file
  if (!checkUnsavedChanges()) {
    return; // User cancelled, don't open new file
  }

  // Exit edit mode if active
  if (editMode) {
    editMode = false;
    els.btnEditMode.classList.remove('active');
    els.codeWrapper.style.display = 'block';
    els.codeEditor.style.display = 'none';
    els.btnSave.style.display = 'none';
    hasUnsavedChanges = false;
    els.btnSave.classList.remove('unsaved');
  }

  // UI Update
  document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
  if (liElement) liElement.classList.add('active');

  currentFileHandle = fileHandle;

  // Read File
  const file = await fileHandle.getFile();
  currentFileLastModified = file.lastModified;
  const text = await file.text();

  // Store original content for comparison
  currentFileContent = text;

  // Update Info
  els.fileInfo.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;

  // Detect Language
  const ext = file.name.split('.').pop().toLowerCase();
  const langMap = {
    'js': 'javascript', 'mjs': 'javascript', 'cjs': 'javascript',
    'html': 'html', 'htm': 'html',
    'css': 'css',
    'json': 'json',
    'py': 'python',
    'md': 'markdown',
    'txt': 'none',
    'log': 'log',
    'cs': 'csharp',
    'ts': 'typescript',
    'java': 'java',
    'cpp': 'cpp', 'c': 'c', 'h': 'cpp',
    'go': 'go',
    'rs': 'rust',
    'php': 'php',
    'rb': 'ruby',
    'yml': 'yaml', 'yaml': 'yaml',
    'xml': 'xml', 'xaml': 'xml', 'svg': 'xml',
    'dockerfile': 'docker', 'docker': 'docker'
  };
  // Special case for Dockerfile (no extension or named Dockerfile)
  let lang = langMap[ext] || ext;
  if (file.name.toLowerCase() === 'dockerfile') lang = 'docker';

  console.log(`Opening file: ${file.name}, Detected lang: ${lang}`);

  // Highlight
  if (window.Prism && Prism.languages[lang]) {
    console.log(`Grammar found for ${lang}, highlighting...`);
    els.codeContent.className = `language-${lang}`;
    els.codeContent.innerHTML = Prism.highlight(text, Prism.languages[lang], lang);
  } else {
    console.warn(`No grammar found for ${lang}, using plain text.`);
    els.codeContent.className = `language-none`;
    els.codeContent.textContent = text;
  }

  updateLineNumbers(text);

  // Reset Scroll
  els.codeWrapper.scrollTop = 0;
}

function updateLineNumbers(text) {
  const lines = text.split('\n').length;
  els.lineNumbers.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
}

// --- Edit Mode Functions ---

/**
 * Toggle between read-only and edit modes
 * - In edit mode: shows textarea for editing, hides syntax-highlighted view
 * - In read mode: shows syntax-highlighted view, hides textarea
 * - Disables live mode when entering edit mode (they're incompatible)
 */
function toggleEditMode() {
  if (!currentFileHandle) {
    alert('Please open a file first.');
    return;
  }

  // Check for unsaved changes before switching modes
  if (editMode && hasUnsavedChanges) {
    const confirmDiscard = confirm('You have unsaved changes. Discard them?');
    if (!confirmDiscard) return;
  }

  editMode = !editMode;
  els.btnEditMode.classList.toggle('active', editMode);

  if (editMode) {
    // Entering edit mode
    // Disable live mode if active (can't edit while auto-refreshing)
    if (liveMode) {
      liveMode = false;
      els.btnLive.textContent = 'Live: Off';
      els.btnLive.classList.remove('active');
      if (liveInterval) clearInterval(liveInterval);
    }

    // Copy content from read-only view to editor
    els.codeEditor.value = els.codeContent.textContent;
    currentFileContent = els.codeEditor.value;

    // Show editor, hide read-only view
    els.codeWrapper.style.display = 'none';
    els.codeEditor.style.display = 'block';
    els.btnSave.style.display = 'inline-block';

    // Focus the editor
    els.codeEditor.focus();

    // Reset unsaved changes flag
    hasUnsavedChanges = false;
    els.btnSave.classList.remove('unsaved');
  } else {
    // Exiting edit mode
    // Re-render the content with syntax highlighting
    const text = els.codeEditor.value;
    const file = { name: currentFileHandle.name };
    const ext = file.name.split('.').pop().toLowerCase();
    const langMap = {
      'js': 'javascript', 'mjs': 'javascript', 'cjs': 'javascript',
      'html': 'html', 'htm': 'html',
      'css': 'css',
      'json': 'json',
      'py': 'python',
      'md': 'markdown',
      'txt': 'none',
      'log': 'log',
      'cs': 'csharp',
      'ts': 'typescript',
      'java': 'java',
      'cpp': 'cpp', 'c': 'c', 'h': 'cpp',
      'go': 'go',
      'rs': 'rust',
      'php': 'php',
      'rb': 'ruby',
      'yml': 'yaml', 'yaml': 'yaml',
      'xml': 'xml', 'xaml': 'xml', 'svg': 'xml',
      'dockerfile': 'docker', 'docker': 'docker'
    };
    let lang = langMap[ext] || ext;
    if (file.name.toLowerCase() === 'dockerfile') lang = 'docker';

    // Apply syntax highlighting
    if (window.Prism && Prism.languages[lang]) {
      els.codeContent.className = `language-${lang}`;
      els.codeContent.innerHTML = Prism.highlight(text, Prism.languages[lang], lang);
    } else {
      els.codeContent.className = `language-none`;
      els.codeContent.textContent = text;
    }

    updateLineNumbers(text);

    // Show read-only view, hide editor
    els.codeWrapper.style.display = 'block';
    els.codeEditor.style.display = 'none';
    els.btnSave.style.display = 'none';

    // Reset unsaved changes
    hasUnsavedChanges = false;
    els.btnSave.classList.remove('unsaved');
  }
}

/**
 * Save the current file content back to disk
 * Uses the File System Access API to write changes
 * Requires write permission (will prompt user if not already granted)
 */
async function saveFile() {
  if (!currentFileHandle || !editMode) {
    return;
  }

  try {
    // Request write permission if needed
    const permission = await verifyPermission(currentFileHandle, true);
    if (!permission) {
      alert('Write permission denied. Cannot save file.');
      return;
    }

    // Get the new content from the editor
    const newContent = els.codeEditor.value;

    // Create a writable stream
    const writable = await currentFileHandle.createWritable();

    // Write the content
    await writable.write(newContent);

    // Close the stream
    await writable.close();

    // Update state
    currentFileContent = newContent;
    hasUnsavedChanges = false;
    els.btnSave.classList.remove('unsaved');

    // Update file info to show save success
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

/**
 * Check if there are unsaved changes
 * Called when user tries to open a different file or close the app
 * Returns true if it's safe to proceed, false if user cancelled
 */
function checkUnsavedChanges() {
  if (editMode && hasUnsavedChanges) {
    const confirmDiscard = confirm('You have unsaved changes. Discard them?');
    return confirmDiscard;
  }
  return true;
}

/**
 * Track changes in the editor
 * Marks the save button when content differs from original
 */
function onEditorInput() {
  const currentContent = els.codeEditor.value;
  hasUnsavedChanges = (currentContent !== currentFileContent);

  if (hasUnsavedChanges) {
    els.btnSave.classList.add('unsaved');
  } else {
    els.btnSave.classList.remove('unsaved');
  }

  // Update line numbers to match editor content
  updateLineNumbers(currentContent);
}

// --- Live Mode ---

els.btnLive.addEventListener('click', () => {
  liveMode = !liveMode;
  els.btnLive.textContent = `Live: ${liveMode ? 'On' : 'Off'}`;
  els.btnLive.classList.toggle('active', liveMode);

  if (liveInterval) clearInterval(liveInterval);

  if (liveMode) {
    liveInterval = setInterval(async () => {
      if (!currentFileHandle) return;
      try {
        const file = await currentFileHandle.getFile();
        if (file.lastModified > currentFileLastModified) {
          console.log('File changed, reloading...');
          // Keep scroll position
          const scrollTop = els.codeWrapper.scrollTop;
          await openFile(currentFileHandle, document.querySelector('.file-item.active'));
          els.codeWrapper.scrollTop = scrollTop;
        }
      } catch (e) {
        console.error('Live mode error:', e);
      }
    }, 1000);
  }
});

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
  const handleItem = items.find(item => item.kind === 'file'); // 'file' can be file or directory in API

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

// Sync scroll
els.codeWrapper.addEventListener('scroll', () => {
  els.lineNumbers.scrollTop = els.codeWrapper.scrollTop;
});

// Sync scroll for editor
els.codeEditor.addEventListener('scroll', () => {
  els.lineNumbers.scrollTop = els.codeEditor.scrollTop;
});

// --- Edit Mode Event Listeners ---

// Toggle edit mode
els.btnEditMode.addEventListener('click', toggleEditMode);

// Save file
els.btnSave.addEventListener('click', saveFile);

// Track changes in editor
els.codeEditor.addEventListener('input', onEditorInput);

// Keyboard shortcut: Ctrl+S to save
els.codeEditor.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveFile();
  }
});

// Warn before leaving page with unsaved changes
window.addEventListener('beforeunload', (e) => {
  if (editMode && hasUnsavedChanges) {
    e.preventDefault();
    e.returnValue = ''; // Required for Chrome
  }
});

// Initial Render
renderRecentList();
