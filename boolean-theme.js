// Custom Ace Editor theme extension for semantic boolean coloring
// This script dynamically applies green/orange colors to true/false in all file formats

(function () {
    // Wait for Ace to be loaded
    const initBooleanTheme = () => {
        if (!window.ace) {
            setTimeout(initBooleanTheme, 100);
            return;
        }

        try {
            const Tokenizer = ace.require("ace/tokenizer").Tokenizer;
            const originalGetLineTokens = Tokenizer.prototype.getLineTokens;

            // Monkey-patch the getLineTokens method
            Tokenizer.prototype.getLineTokens = function (line, startState) {
                // Call the original method to get tokens
                const result = originalGetLineTokens.call(this, line, startState);

                // Post-process tokens to add value-based classes
                if (result.tokens) {
                    // Try to detect the mode from the editor instance if available
                    let modeId = 'unknown';
                    if (window.editor && window.editor.session) {
                        const mode = window.editor.session.getMode();
                        if (mode && mode.$id) {
                            modeId = mode.$id;
                        }
                    }

                    for (let i = 0; i < result.tokens.length; i++) {
                        const token = result.tokens[i];
                        const type = token.type;
                        const value = token.value.trim().toLowerCase();

                        // Skip empty values
                        if (!value) continue;

                        // GLOBAL EXCLUSIONS: Never highlight strings or comments
                        if (type.indexOf('string') !== -1 || type.indexOf('comment') !== -1) {
                            continue;
                        }

                        // Check for boolean/null values
                        if (value === 'true' || value === 'false' || value === 'null' || value === 'none' || value === 'nil') {

                            let shouldHighlight = false;

                            // MODE-SPECIFIC LOGIC
                            if (modeId.indexOf('json') !== -1) {
                                // JSON: STRICT - only highlight if it's already a constant.language
                                if (type.indexOf('constant.language') !== -1) {
                                    shouldHighlight = true;
                                }
                            }
                            else if (modeId.indexOf('xml') !== -1 || modeId.indexOf('html') !== -1) {
                                // XML/HTML: LOOSE - highlight text content
                                if (type.indexOf('text') !== -1 || type.indexOf('constant') !== -1) {
                                    shouldHighlight = true;
                                }
                            }
                            else if (modeId.indexOf('ini') !== -1 || modeId.indexOf('yaml') !== -1) {
                                // INI/YAML: MEDIUM - highlight text, constants, and identifiers
                                shouldHighlight = true;
                            }
                            else {
                                // DEFAULT / FALLBACK (Log files, etc.)
                                const isKeyword = type.indexOf('keyword') !== -1;
                                const isVariable = type.indexOf('variable') !== -1;

                                if (!isKeyword && !isVariable) {
                                    shouldHighlight = true;
                                }
                            }

                            // Apply highlighting if conditions met
                            if (shouldHighlight) {
                                if (value === 'true') {
                                    token.type += '.boolean.true';
                                } else if (value === 'false') {
                                    token.type += '.boolean.false';
                                } else {
                                    token.type += '.null';
                                }
                            }
                        }
                    }
                }

                return result;
            };

            console.log('Boolean semantic coloring enabled');
        } catch (e) {
            console.error('Failed to initialize boolean theme:', e);
        }
    };

    // Start the initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBooleanTheme);
    } else {
        initBooleanTheme();
    }
})();
