// Comment Formatter JavaScript

// DOM Elements
const commentInput = document.getElementById('commentInput');
const commentOutput = document.getElementById('commentOutput');
const inputLineNumbers = document.getElementById('inputLineNumbers');
const outputLineNumbers = document.getElementById('outputLineNumbers');
const lineCount = document.getElementById('lineCount');
const outputInfo = document.getElementById('outputInfo');

const styleSelect = document.getElementById('styleSelect');
const decoratorChar = document.getElementById('decoratorChar');
const decoratorCount = document.getElementById('decoratorCount');
const spacingSelect = document.getElementById('spacingSelect');
const customPrefix = document.getElementById('customPrefix');
const customSuffix = document.getElementById('customSuffix');
const upperCase = document.getElementById('upperCase');

const btnFormat = document.getElementById('btnFormat');
const btnCopy = document.getElementById('btnCopy');

// Comment style presets
const commentStyles = {
    slashes: { prefix: '//', suffix: '' },
    hash: { prefix: '#', suffix: '' },
    block: { prefix: '/*', suffix: '*/' },
    html: { prefix: '<!--', suffix: '-->' },
    xml: { prefix: '<!--', suffix: '-->' },
    sql: { prefix: '--', suffix: '' },
    custom: { prefix: '', suffix: '' }
};

// Update line numbers for textarea
function updateLineNumbers(textarea, lineNumbersDiv) {
    const lines = textarea.value.split('\n').length;
    const lineNumbersHtml = Array.from({ length: lines }, (_, i) => `<div>${i + 1}</div>`).join('');
    lineNumbersDiv.innerHTML = lineNumbersHtml;
}

// Update line count display
function updateLineCount() {
    const lines = commentInput.value.split('\n').filter(line => line.trim() !== '').length;
    lineCount.textContent = `${lines} line${lines !== 1 ? 's' : ''}`;
}

// Format a single line of text into a comment
function formatLine(text, prefix, suffix, decorator, count, spacing) {
    if (text.trim() === '') {
        return '';
    }

    // Apply uppercase if enabled
    if (upperCase.checked) {
        text = text.toUpperCase();
    }

    // Build decorator strings
    const leftDecorator = decorator.repeat(count);
    const rightDecorator = decorator.repeat(count);

    // Build spacing
    let leftSpace = '';
    let rightSpace = '';

    if (spacing === 'both' || spacing === 'left') {
        leftSpace = ' ';
    }
    if (spacing === 'both' || spacing === 'right') {
        rightSpace = ' ';
    }

    // Build the formatted comment
    let formatted = prefix;

    if (leftDecorator) {
        formatted += leftSpace + leftDecorator;
    }

    formatted += leftSpace + text + rightSpace;

    if (rightDecorator) {
        formatted += rightDecorator + rightSpace;
    }

    if (suffix) {
        formatted += suffix;
    }

    return formatted;
}

// Format all lines
function formatComments() {
    const lines = commentInput.value.split('\n');
    const style = styleSelect.value;

    // Get prefix and suffix
    let prefix, suffix;
    if (style === 'custom') {
        prefix = customPrefix.value || '//';
        suffix = customSuffix.value || '';
    } else {
        prefix = commentStyles[style].prefix;
        suffix = commentStyles[style].suffix;
    }

    // Get decorator settings
    const decorator = decoratorChar.value || '';
    const count = parseInt(decoratorCount.value) || 0;
    const spacing = spacingSelect.value;

    // Format each line
    const formattedLines = lines.map(line =>
        formatLine(line, prefix, suffix, decorator, count, spacing)
    );

    // Update output
    commentOutput.value = formattedLines.join('\n');
    updateLineNumbers(commentOutput, outputLineNumbers);

    // Update output info
    const nonEmptyLines = formattedLines.filter(line => line.trim() !== '').length;
    outputInfo.textContent = `${nonEmptyLines} formatted`;
    outputInfo.style.color = '#4caf50';
}

// Copy output to clipboard
async function copyOutput() {
    try {
        await navigator.clipboard.writeText(commentOutput.value);
        outputInfo.textContent = 'Copied!';
        outputInfo.style.color = '#4caf50';

        setTimeout(() => {
            const nonEmptyLines = commentOutput.value.split('\n').filter(line => line.trim() !== '').length;
            outputInfo.textContent = `${nonEmptyLines} formatted`;
        }, 2000);
    } catch (err) {
        outputInfo.textContent = 'Copy failed';
        outputInfo.style.color = '#f44336';
    }
}

// Handle style selection change
function handleStyleChange() {
    const customControls = document.querySelectorAll('.custom-controls');
    if (styleSelect.value === 'custom') {
        customControls.forEach(control => control.style.display = 'flex');
    } else {
        customControls.forEach(control => control.style.display = 'none');
    }
}

// Sync scroll between textarea and line numbers
function syncScroll(textarea, lineNumbersDiv) {
    lineNumbersDiv.scrollTop = textarea.scrollTop;
}

// Handle tab key in textarea
function handleTab(e) {
    if (e.key === 'Tab') {
        e.preventDefault();
        const start = commentInput.selectionStart;
        const end = commentInput.selectionEnd;
        const value = commentInput.value;

        // Insert tab (2 spaces)
        commentInput.value = value.substring(0, start) + '  ' + value.substring(end);

        // Move cursor
        commentInput.selectionStart = commentInput.selectionEnd = start + 2;

        // Trigger update
        handleInput();
    }
}

// Handle input changes
function handleInput() {
    updateLineNumbers(commentInput, inputLineNumbers);
    updateLineCount();
    formatComments();
}

// Event Listeners
commentInput.addEventListener('input', handleInput);
commentInput.addEventListener('scroll', () => syncScroll(commentInput, inputLineNumbers));
commentInput.addEventListener('keydown', handleTab);
commentOutput.addEventListener('scroll', () => syncScroll(commentOutput, outputLineNumbers));

styleSelect.addEventListener('change', handleStyleChange);
btnFormat.addEventListener('click', formatComments);
btnCopy.addEventListener('click', copyOutput);

// Auto-format on control changes
decoratorChar.addEventListener('input', () => {
    if (commentInput.value.trim()) formatComments();
});
decoratorCount.addEventListener('input', () => {
    if (commentInput.value.trim()) formatComments();
});
spacingSelect.addEventListener('change', () => {
    if (commentInput.value.trim()) formatComments();
});
upperCase.addEventListener('change', () => {
    if (commentInput.value.trim()) formatComments();
});
customPrefix.addEventListener('input', () => {
    if (styleSelect.value === 'custom' && commentInput.value.trim()) formatComments();
});
customSuffix.addEventListener('input', () => {
    if (styleSelect.value === 'custom' && commentInput.value.trim()) formatComments();
});

// Initialize
updateLineNumbers(commentInput, inputLineNumbers);
updateLineNumbers(commentOutput, outputLineNumbers);
updateLineCount();
handleStyleChange();

// Load sample on first visit
const sampleText = `Section Header
Important Note
Configuration Settings
End of Block`;

commentInput.value = sampleText;
handleInput();
formatComments();

// Ensure both areas start at the top
commentInput.scrollTop = 0;
commentOutput.scrollTop = 0;
inputLineNumbers.scrollTop = 0;
outputLineNumbers.scrollTop = 0;
