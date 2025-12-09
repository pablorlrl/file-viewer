// CodeMirror boolean and null value highlighting theme
// Adds CSS styling for log file tokens and targets built-in tokens

(function () {
    // Wait for CodeMirror to be loaded
    if (typeof CodeMirror === 'undefined') {
        setTimeout(arguments.callee, 100);
        return;
    }

    // Add custom CSS for log file highlighting and boolean values
    const style = document.createElement('style');
    style.textContent = `
        /* Log file highlighting */
        .cm-log-fatal { color: #ff6b9d; font-weight: bold; text-decoration: underline; }
        .cm-log-error { color: #f48771; font-weight: bold; }
        .cm-log-warning { color: #dcdcaa; font-weight: bold; }
        .cm-log-info { color: #569cd6; font-weight: bold; }
        .cm-log-debug { color: #4ec9b0; font-weight: bold; }
        .cm-log-verbose { color: #858585; }
        .cm-log-success { color: #4caf50; font-weight: bold; }
        .cm-log-boolean-true { color: #4caf50; font-weight: bold; }
        .cm-log-boolean-false { color: #ff9800; font-weight: bold; }
        .cm-log-null { color: #858585; font-style: italic; }
        .cm-log-timestamp { color: #b5cea8; }
        .cm-log-property { color: #c586c0; }
        .cm-log-url { color: #3794ff; text-decoration: underline; }
        .cm-log-ip { color: #b5cea8; }
        
        /* Boolean highlighting for built-in CodeMirror tokens */
        /* JSON mode uses .cm-atom for true/false/null */
        .cm-atom { color: #4ec9b0 !important; font-weight: bold; }
        
        /* YAML mode uses .cm-atom for booleans */
        /* XML mode uses .cm-atom for attribute values */
        /* Properties mode uses .cm-atom for values */
    `;
    document.head.appendChild(style);

    console.log('CodeMirror boolean/log theme loaded');
})();
