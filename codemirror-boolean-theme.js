// CodeMirror boolean and null value highlighting theme
// Adds CSS styling for log file tokens and boolean values
// Only applies to specific file types to avoid affecting other languages

(function () {
    // Wait for CodeMirror to be loaded
    if (typeof CodeMirror === 'undefined') {
        setTimeout(arguments.callee, 100);
        return;
    }

    console.log('🎨 Boolean theme script is running!');

    // Add custom CSS - only applies when editor has special class
    const style = document.createElement('style');
    style.id = 'boolean-highlight-theme';
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
        
        /* Boolean highlighting using data attributes */
        /* TRUE values - Green */
        .CodeMirror.boolean-highlight [data-bool="true"] {
            color: #4caf50 !important;
            font-weight: bold !important;
        }
        
        /* FALSE values - Orange */
        .CodeMirror.boolean-highlight [data-bool="false"] {
            color: #ff9800 !important;
            font-weight: bold !important;
        }
        
        /* NULL values - Gray italic */
        .CodeMirror.boolean-highlight [data-bool="null"] {
            color: #858585 !important;
            font-style: italic !important;
        }
    `;
    document.head.appendChild(style);

    console.log('✅ Boolean theme CSS added to page!');

    // Function to tag boolean spans
    function tagBooleanSpans(wrapper) {
        const spans = wrapper.querySelectorAll('.cm-atom, .cm-keyword, .cm-quote');
        spans.forEach(span => {
            const text = span.textContent.trim().toLowerCase();
            if (text === 'true') {
                span.setAttribute('data-bool', 'true');
            } else if (text === 'false') {
                span.setAttribute('data-bool', 'false');
            } else if (text === 'null' || text === 'nil' || text === 'none') {
                span.setAttribute('data-bool', 'null');
            }
        });
    }

    // Make function globally available to add/remove boolean highlighting
    window.setBooleanHighlight = function (editor, enabled) {
        if (!editor) return;
        const wrapper = editor.getWrapperElement();

        if (enabled) {
            wrapper.classList.add('boolean-highlight');

            // Tag spans initially
            setTimeout(() => tagBooleanSpans(wrapper), 100);

            // Re-tag on changes
            editor.on('change', () => {
                setTimeout(() => tagBooleanSpans(wrapper), 50);
            });
        } else {
            wrapper.classList.remove('boolean-highlight');
        }
    };
})();
