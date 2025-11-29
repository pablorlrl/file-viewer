// Custom Prism language definition for Serilog and general log files
// Based on Prism's standard language definition patterns
if (typeof Prism !== 'undefined') {
    Prism.languages.log = {
        'level-fatal': /\b(?:FTL|FATAL|Fatal|CRITICAL|Critical)\b/,
        'level-error': /\b(?:ERR|ERROR|Error)\b/,
        'level-warning': /\b(?:WRN|WARN|WARNING|Warning|Warn)\b/,
        'level-info': /\b(?:INF|INFO|Information|Info)\b/,
        'level-debug': /\b(?:DBG|DEBUG|Debug)\b/,
        'level-verbose': /\b(?:VRB|VERBOSE|Verbose)\b/,

        'timestamp': /\[\d{2}:\d{2}:\d{2}(?:\.\d{3,7})?\s+[A-Z]{3}\]|\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/,

        'property': /\{[^}]+\}/,

        'exception': /(?:Exception|Error):\s*.+|^\s+at\s+.+/m,

        'url': /https?:\/\/[^\s]+/,

        'string': /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/,

        'number': /\b\d+(?:\.\d+)?\b/,

        'ip': /\b(?:\d{1,3}\.){3}\d{1,3}\b/
    };
}
