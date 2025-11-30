// Custom Ace Editor mode for log files with syntax highlighting
// Supports Serilog and general log file formats

ace.define('ace/mode/log_highlight_rules', ['require', 'exports', 'module', 'ace/lib/oop', 'ace/mode/text_highlight_rules'], function (require, exports, module) {
    var oop = require("../lib/oop");
    var TextHighlightRules = require("./text_highlight_rules").TextHighlightRules;

    var LogHighlightRules = function () {
        this.$rules = {
            "start": [
                // Fatal level - bright red/magenta (matches FTL, FATAL, etc. anywhere)
                {
                    token: "constant.language.fatal",
                    regex: "\\b(?:FTL|FATAL|Fatal|CRITICAL|Critical)\\b"
                },
                // Error level - red
                {
                    token: "constant.language.error",
                    regex: "\\b(?:ERR|ERROR|Error)\\b"
                },
                // Warning level - yellow/orange
                {
                    token: "constant.language.warning",
                    regex: "\\b(?:WRN|WARN|WARNING|Warning|Warn)\\b"
                },
                // Info level - bright blue
                {
                    token: "constant.language.info",
                    regex: "\\b(?:INF|INFO|Information|Info)\\b"
                },
                // Debug level - cyan
                {
                    token: "constant.language.debug",
                    regex: "\\b(?:DBG|DEBUG|Debug)\\b"
                },
                // Verbose level - gray/muted
                {
                    token: "constant.language.verbose",
                    regex: "\\b(?:VRB|VERBOSE|Verbose)\\b"
                },
                // Timestamp with log level inside brackets [HH:MM:SS.fff LVL]
                {
                    token: ["constant.numeric.timestamp", "text", "constant.language.info", "text"],
                    regex: "(\\[\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3,7})?)(\\s+)(INF|INFO)(\\])"
                },
                {
                    token: ["constant.numeric.timestamp", "text", "constant.language.debug", "text"],
                    regex: "(\\[\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3,7})?)(\\s+)(DBG|DEBUG)(\\])"
                },
                {
                    token: ["constant.numeric.timestamp", "text", "constant.language.verbose", "text"],
                    regex: "(\\[\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3,7})?)(\\s+)(VRB|VERBOSE)(\\])"
                },
                {
                    token: ["constant.numeric.timestamp", "text", "constant.language.warning", "text"],
                    regex: "(\\[\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3,7})?)(\\s+)(WRN|WARN|WARNING)(\\])"
                },
                {
                    token: ["constant.numeric.timestamp", "text", "constant.language.error", "text"],
                    regex: "(\\[\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3,7})?)(\\s+)(ERR|ERROR)(\\])"
                },
                {
                    token: ["constant.numeric.timestamp", "text", "constant.language.fatal", "text"],
                    regex: "(\\[\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3,7})?)(\\s+)(FTL|FATAL|CRITICAL)(\\])"
                },
                // Keywords - Error related (red)
                {
                    token: "constant.language.error",
                    regex: "\\b(?:[Ee]rror|[Ff]ail|[Ff]ailed|[Ff]ailure|[Ee]xception|[Aa]bort|[Aa]borted)\\b"
                },
                // Keywords - Success related (green)
                {
                    token: "constant.language.success",
                    regex: "\\b(?:[Ss]uccess|[Ss]uccessful|[Ss]ucceeded|[Oo][Kk]|[Pp]ass|[Pp]assed|[Cc]omplete|[Cc]ompleted)\\b"
                },
                // Regular timestamp (without log level or different format)
                {
                    token: "constant.numeric.timestamp",
                    regex: "\\[\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3,7})?(?:\\s+[A-Z]{3})?\\]|\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})?"
                },
                // Serilog properties {PropertyName}
                {
                    token: "variable.parameter",
                    regex: "\\{[^}]+\\}"
                },
                // Exception stack traces
                {
                    token: "comment.line.exception",
                    regex: "(?:Exception|Error):\\s*.+|^\\s+at\\s+.+"
                },
                // URLs
                {
                    token: "string.url",
                    regex: "https?:\\/\\/[^\\s]+"
                },
                // Strings
                {
                    token: "string.quoted",
                    regex: "\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'"
                },
                // IP addresses
                {
                    token: "constant.numeric.ip",
                    regex: "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b"
                },
                // Numbers
                {
                    token: "constant.numeric",
                    regex: "\\b\\d+(?:\\.\\d+)?\\b"
                }
            ]
        };
    };

    oop.inherits(LogHighlightRules, TextHighlightRules);
    exports.LogHighlightRules = LogHighlightRules;
});

ace.define('ace/mode/log', ['require', 'exports', 'module', 'ace/lib/oop', 'ace/mode/text', 'ace/mode/log_highlight_rules'], function (require, exports, module) {
    var oop = require("../lib/oop");
    var TextMode = require("./text").Mode;
    var LogHighlightRules = require("./log_highlight_rules").LogHighlightRules;

    var Mode = function () {
        this.HighlightRules = LogHighlightRules;
    };
    oop.inherits(Mode, TextMode);

    (function () {
        this.$id = "ace/mode/log";
    }).call(Mode.prototype);

    exports.Mode = Mode;
});
