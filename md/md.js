// Markdown Viewer JavaScript

// DOM Elements
const mdInput = document.getElementById('mdInput');
const mdPreview = document.getElementById('mdPreview');
const inputLineNumbers = document.getElementById('inputLineNumbers');
const charCount = document.getElementById('charCount');
const wordCount = document.getElementById('wordCount');
const btnClear = document.getElementById('btnClear');
const btnSample = document.getElementById('btnSample');

// Configure marked.js options
marked.setOptions({
    breaks: true,
    gfm: true,
    highlight: function (code, lang) {
        if (lang && Prism.languages[lang]) {
            return Prism.highlight(code, Prism.languages[lang], lang);
        }
        return code;
    }
});

// Sample markdown content
const sampleMarkdown = `# Welcome to Markdown Viewer

This is a **live markdown editor** with real-time preview!

## Features

- ✨ Real-time preview
- 🎨 Syntax highlighting
- 📝 Line numbers
- 🌙 Beautiful dark theme

## Code Example

Here's some JavaScript code:

\`\`\`javascript
function greet(name) {
    return \`Hello, \${name}!\`;
}

console.log(greet('World'));
\`\`\`

## Lists

### Unordered List
- First item
- Second item
  - Nested item
  - Another nested item
- Third item

### Ordered List
1. First step
2. Second step
3. Third step

## Blockquote

> "The best way to predict the future is to invent it."
> — Alan Kay

## Table

| Feature | Status |
|---------|--------|
| Preview | ✅ |
| Syntax Highlighting | ✅ |
| Line Numbers | ✅ |
| Dark Theme | ✅ |

## Links and Images

Check out [Markdown Guide](https://www.markdownguide.org/) for more information.

---

**Try editing this text to see the live preview in action!**
`;

// Update line numbers for input textarea
function updateLineNumbers() {
    const lines = mdInput.value.split('\n').length;
    const lineNumbersHtml = Array.from({ length: lines }, (_, i) => `<div>${i + 1}</div>`).join('');
    inputLineNumbers.innerHTML = lineNumbersHtml;
}

// Update character and word count
function updateCounts() {
    const text = mdInput.value;
    const chars = text.length;
    const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;

    charCount.textContent = `${chars} character${chars !== 1 ? 's' : ''}`;
    wordCount.textContent = `${words} word${words !== 1 ? 's' : ''}`;
}

// Render markdown to preview
function renderMarkdown() {
    const markdown = mdInput.value;

    if (markdown.trim() === '') {
        mdPreview.innerHTML = '<div class="empty-state">Start typing to see the preview...</div>';
        return;
    }

    try {
        const html = marked.parse(markdown);
        mdPreview.innerHTML = html;

        // Re-highlight code blocks
        mdPreview.querySelectorAll('pre code').forEach((block) => {
            Prism.highlightElement(block);
        });
    } catch (error) {
        mdPreview.innerHTML = `<div class="empty-state" style="color: #ff6b6b;">Error rendering markdown: ${error.message}</div>`;
    }
}

// Sync scroll between textarea and line numbers
function syncScroll() {
    inputLineNumbers.scrollTop = mdInput.scrollTop;
}

// Handle tab key in textarea
function handleTab(e) {
    if (e.key === 'Tab') {
        e.preventDefault();
        const start = mdInput.selectionStart;
        const end = mdInput.selectionEnd;
        const value = mdInput.value;

        // Insert tab (2 spaces)
        mdInput.value = value.substring(0, start) + '  ' + value.substring(end);

        // Move cursor
        mdInput.selectionStart = mdInput.selectionEnd = start + 2;

        // Trigger update
        handleInput();
    }
}

// Handle input changes
function handleInput() {
    updateLineNumbers();
    updateCounts();
    renderMarkdown();
}

// Clear button handler
function handleClear() {
    mdInput.value = '';
    handleInput();
    mdInput.focus();
}

// Load sample markdown
function handleLoadSample() {
    mdInput.value = sampleMarkdown;
    handleInput();
    mdInput.focus();
}

// Event Listeners
mdInput.addEventListener('input', handleInput);
mdInput.addEventListener('scroll', syncScroll);
mdInput.addEventListener('keydown', handleTab);
btnClear.addEventListener('click', handleClear);
btnSample.addEventListener('click', handleLoadSample);

// Initialize
updateLineNumbers();
updateCounts();
renderMarkdown();

// Load sample on first visit
if (mdInput.value.trim() === '') {
    handleLoadSample();
}

// Ensure both areas start at the top
mdInput.scrollTop = 0;
mdPreview.scrollTop = 0;
inputLineNumbers.scrollTop = 0;
