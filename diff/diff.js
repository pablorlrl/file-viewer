// View mode state
let viewMode = 'split'; // 'unified' or 'split'

// DOM Elements
const btnCompare = document.getElementById('btnCompare');
const btnViewMode = document.getElementById('btnViewMode');
const inputOriginal = document.getElementById('inputOriginal');
const inputModified = document.getElementById('inputModified');
const unifiedView = document.getElementById('unified-view');
const splitView = document.getElementById('split-view');

// View mode toggle
btnViewMode.addEventListener('click', () => {
    viewMode = viewMode === 'split' ? 'unified' : 'split';
    btnViewMode.textContent = viewMode === 'split' ? 'Split View' : 'Unified View';
    updateViewDisplay();
});

function updateViewDisplay() {
    if (viewMode === 'split') {
        unifiedView.style.display = 'none';
        splitView.style.display = 'flex';
    } else {
        unifiedView.style.display = 'flex';
        splitView.style.display = 'none';
    }
}

// Update line numbers for textareas
function updateTextareaLineNumbers(textarea, lineNumbersEl) {
    const lines = textarea.value.split('\n').length;
    const lineNumbers = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
    lineNumbersEl.textContent = lineNumbers;
}

// Add event listeners for textarea line numbers
inputOriginal.addEventListener('input', () => {
    updateTextareaLineNumbers(inputOriginal, document.getElementById('originalInputLineNumbers'));
    compareFiles();
});

inputModified.addEventListener('input', () => {
    updateTextareaLineNumbers(inputModified, document.getElementById('modifiedInputLineNumbers'));
    compareFiles();
});

// Sync scrolling for textareas
inputOriginal.addEventListener('scroll', () => {
    document.getElementById('originalInputLineNumbers').scrollTop = inputOriginal.scrollTop;
});

inputModified.addEventListener('scroll', () => {
    document.getElementById('modifiedInputLineNumbers').scrollTop = inputModified.scrollTop;
});

// Compare function
function compareFiles() {
    const original = inputOriginal.value;
    const modified = inputModified.value;

    if (!original && !modified) {
        showEmptyState();
        return;
    }

    // Compute diff
    const diff = Diff.diffLines(original, modified);

    if (viewMode === 'unified') {
        renderUnifiedView(diff);
    } else {
        renderSplitView(original, modified, diff);
    }
}

// Compare button handler
btnCompare.addEventListener('click', compareFiles);

function showEmptyState() {
    unifiedView.innerHTML = '<div class="empty-state">Please enter text to compare.</div>';
    splitView.querySelector('.split-pane:first-child .pane-content').innerHTML =
        '<div class="empty-state">Please enter text to compare.</div>';
    splitView.querySelector('.split-pane:last-child .pane-content').innerHTML = '';
}

function renderUnifiedView(diff) {
    const container = document.createElement('div');
    container.className = 'unified-diff-container';

    const lineNumbersDiv = document.createElement('div');
    lineNumbersDiv.className = 'unified-line-numbers';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'unified-content';

    let lineNumber = 1;
    const lineNumbers = [];
    const contentLines = [];

    // Group consecutive added/removed lines for inline comparison
    let i = 0;
    while (i < diff.length) {
        const part = diff[i];

        if (part.removed && i + 1 < diff.length && diff[i + 1].added) {
            // We have a removed part followed by an added part - do inline diff
            const removedLines = part.value.split('\n').filter(l => l !== '');
            const addedLines = diff[i + 1].value.split('\n').filter(l => l !== '');

            // Process removed lines with inline highlighting
            removedLines.forEach((line) => {
                const span = document.createElement('span');
                span.className = 'diff-line diff-removed';

                // Find corresponding added line for inline comparison
                if (addedLines.length > 0) {
                    const addedLine = addedLines[0];
                    const inlineDiff = Diff.diffWordsWithSpace(line, addedLine);

                    inlineDiff.forEach(part => {
                        if (part.removed) {
                            const highlight = document.createElement('span');
                            highlight.className = 'inline-removed';
                            highlight.textContent = part.value;
                            span.appendChild(highlight);
                        } else if (!part.added) {
                            span.appendChild(document.createTextNode(part.value));
                        }
                    });
                } else {
                    span.textContent = line;
                }

                contentLines.push(span);
                lineNumbers.push(lineNumber);
                lineNumber++;
            });

            // Process added lines with inline highlighting
            addedLines.forEach((line) => {
                const span = document.createElement('span');
                span.className = 'diff-line diff-added';

                // Find corresponding removed line for inline comparison
                if (removedLines.length > 0) {
                    const removedLine = removedLines[0];
                    const inlineDiff = Diff.diffWordsWithSpace(removedLine, line);

                    inlineDiff.forEach(part => {
                        if (part.added) {
                            const highlight = document.createElement('span');
                            highlight.className = 'inline-added';
                            highlight.textContent = part.value;
                            span.appendChild(highlight);
                        } else if (!part.removed) {
                            span.appendChild(document.createTextNode(part.value));
                        }
                    });
                } else {
                    span.textContent = line;
                }

                contentLines.push(span);
                lineNumbers.push(lineNumber);
                lineNumber++;
            });

            i += 2; // Skip both removed and added parts
        } else {
            // Regular processing for unchanged or standalone added/removed
            const lines = part.value.split('\n');
            if (lines[lines.length - 1] === '') {
                lines.pop();
            }

            lines.forEach((line) => {
                const span = document.createElement('span');
                span.className = 'diff-line';
                span.textContent = line;

                if (part.added) {
                    span.classList.add('diff-added');
                } else if (part.removed) {
                    span.classList.add('diff-removed');
                } else {
                    span.classList.add('diff-unchanged');
                }

                contentLines.push(span);
                lineNumbers.push(lineNumber);
                lineNumber++;
            });

            i++;
        }
    }

    lineNumbersDiv.textContent = lineNumbers.join('\n');
    contentLines.forEach(line => contentDiv.appendChild(line));

    container.appendChild(lineNumbersDiv);
    container.appendChild(contentDiv);

    unifiedView.innerHTML = '';
    unifiedView.appendChild(container);
}

function renderSplitView(original, modified, diff) {
    const originalLines = [];
    const modifiedLines = [];
    const originalLineNums = [];
    const modifiedLineNums = [];

    let origLineNum = 1;
    let modLineNum = 1;

    // Group consecutive added/removed lines for inline comparison
    let i = 0;
    while (i < diff.length) {
        const part = diff[i];

        if (part.removed && i + 1 < diff.length && diff[i + 1].added) {
            // We have a removed part followed by an added part - do inline diff
            const removedLines = part.value.split('\n').filter(l => l !== '');
            const addedLines = diff[i + 1].value.split('\n').filter(l => l !== '');

            const maxLines = Math.max(removedLines.length, addedLines.length);

            for (let j = 0; j < maxLines; j++) {
                const removedLine = removedLines[j] || '';
                const addedLine = addedLines[j] || '';

                if (removedLine && addedLine) {
                    // Both lines exist - do inline diff
                    originalLines.push({
                        text: removedLine,
                        type: 'removed',
                        inlineDiff: Diff.diffWordsWithSpace(removedLine, addedLine),
                        isRemoved: true
                    });
                    originalLineNums.push(origLineNum++);

                    modifiedLines.push({
                        text: addedLine,
                        type: 'added',
                        inlineDiff: Diff.diffWordsWithSpace(removedLine, addedLine),
                        isAdded: true
                    });
                    modifiedLineNums.push(modLineNum++);
                } else if (removedLine) {
                    // Only removed line
                    originalLines.push({ text: removedLine, type: 'removed' });
                    originalLineNums.push(origLineNum++);

                    modifiedLines.push({ text: '', type: 'empty' });
                    modifiedLineNums.push('');
                } else {
                    // Only added line
                    originalLines.push({ text: '', type: 'empty' });
                    originalLineNums.push('');

                    modifiedLines.push({ text: addedLine, type: 'added' });
                    modifiedLineNums.push(modLineNum++);
                }
            }

            i += 2;
        } else {
            const lines = part.value.split('\n');
            if (lines[lines.length - 1] === '') {
                lines.pop();
            }

            if (part.added) {
                lines.forEach(line => {
                    originalLines.push({ text: '', type: 'empty' });
                    originalLineNums.push('');

                    modifiedLines.push({ text: line, type: 'added' });
                    modifiedLineNums.push(modLineNum++);
                });
            } else if (part.removed) {
                lines.forEach(line => {
                    originalLines.push({ text: line, type: 'removed' });
                    originalLineNums.push(origLineNum++);

                    modifiedLines.push({ text: '', type: 'empty' });
                    modifiedLineNums.push('');
                });
            } else {
                lines.forEach(line => {
                    originalLines.push({ text: line, type: 'unchanged' });
                    originalLineNums.push(origLineNum++);

                    modifiedLines.push({ text: line, type: 'unchanged' });
                    modifiedLineNums.push(modLineNum++);
                });
            }

            i++;
        }
    }

    // Render original pane with inline highlighting
    const originalLineNumbersEl = document.getElementById('originalLineNumbers');
    const originalContentEl = document.getElementById('originalContent');

    originalLineNumbersEl.textContent = originalLineNums.join('\n');
    originalContentEl.innerHTML = '';
    originalLines.forEach(line => {
        const span = document.createElement('span');
        span.className = `split-line split-${line.type}`;

        if (line.inlineDiff && line.isRemoved) {
            // Render with inline highlighting
            line.inlineDiff.forEach(part => {
                if (part.removed) {
                    const highlight = document.createElement('span');
                    highlight.className = 'inline-removed';
                    highlight.textContent = part.value;
                    span.appendChild(highlight);
                } else if (!part.added) {
                    span.appendChild(document.createTextNode(part.value));
                }
            });
        } else {
            span.textContent = line.text || ' ';
        }

        originalContentEl.appendChild(span);
    });

    // Render modified pane with inline highlighting
    const modifiedLineNumbersEl = document.getElementById('modifiedLineNumbers');
    const modifiedContentEl = document.getElementById('modifiedContent');

    modifiedLineNumbersEl.textContent = modifiedLineNums.join('\n');
    modifiedContentEl.innerHTML = '';
    modifiedLines.forEach(line => {
        const span = document.createElement('span');
        span.className = `split-line split-${line.type}`;

        if (line.inlineDiff && line.isAdded) {
            // Render with inline highlighting
            line.inlineDiff.forEach(part => {
                if (part.added) {
                    const highlight = document.createElement('span');
                    highlight.className = 'inline-added';
                    highlight.textContent = part.value;
                    span.appendChild(highlight);
                } else if (!part.removed) {
                    span.appendChild(document.createTextNode(part.value));
                }
            });
        } else {
            span.textContent = line.text || ' ';
        }

        modifiedContentEl.appendChild(span);
    });

    // Sync scrolling between panes
    setupScrollSync();
}

function setupScrollSync() {
    const panes = document.querySelectorAll('.pane-content');

    // Remove existing listeners to avoid duplicates
    panes.forEach(pane => {
        const newPane = pane.cloneNode(true);
        pane.parentNode.replaceChild(newPane, pane);
    });

    // Get fresh references
    const freshPanes = document.querySelectorAll('.pane-content');

    freshPanes.forEach((pane, index) => {
        pane.addEventListener('scroll', function () {
            const otherPane = freshPanes[index === 0 ? 1 : 0];
            otherPane.scrollTop = this.scrollTop;
            otherPane.scrollLeft = this.scrollLeft;
        });
    });
}

// Initialize view
updateViewDisplay();
