// CodeMirror custom mode for log files
// Supports Serilog and general log file formats with syntax highlighting

(function (mod) {
    if (typeof exports == "object" && typeof module == "object") // CommonJS
        mod(require("../../lib/codemirror"));
    else if (typeof define == "function" && define.amd) // AMD
        define(["../../lib/codemirror"], mod);
    else // Plain browser env
        mod(CodeMirror);
})(function (CodeMirror) {
    "use strict";

    CodeMirror.defineMode("log", function () {
        return {
            token: function (stream) {
                // Fatal level
                if (stream.match(/\b(FTL|FATAL|Fatal|fatal|CRITICAL|Critical|critical)\b/)) {
                    return "log-fatal";
                }
                // Error level
                if (stream.match(/\b(ERR|ERROR|Error|error)\b/)) {
                    return "log-error";
                }
                // Warning level
                if (stream.match(/\b(WRN|WARN|WARNING|Warning|Warn|warning|warn)\b/)) {
                    return "log-warning";
                }
                // Info level
                if (stream.match(/\b(INF|INFO|Information|Info|info)\b/)) {
                    return "log-info";
                }
                // Debug level
                if (stream.match(/\b(DBG|DEBUG|Debug|debug)\b/)) {
                    return "log-debug";
                }
                // Verbose level
                if (stream.match(/\b(VRB|VERBOSE|Verbose|verbose)\b/)) {
                    return "log-verbose";
                }
                // Success keywords
                if (stream.match(/\b(Success|Successful|Succeeded|OK|Pass|Passed|Complete|Completed|success|successful|succeeded|ok|pass|passed|complete|completed)\b/)) {
                    return "log-success";
                }
                // Error keywords
                if (stream.match(/\b(Error|Fail|Failed|Failure|Exception|Abort|Aborted|error|fail|failed|failure|exception|abort|aborted)\b/)) {
                    return "log-error";
                }
                // Boolean - true
                if (stream.match(/\b(true|True|TRUE)\b/)) {
                    return "log-boolean-true";
                }
                // Boolean - false
                if (stream.match(/\b(false|False|FALSE)\b/)) {
                    return "log-boolean-false";
                }
                // Null values
                if (stream.match(/\b(null|Null|NULL|none|None|NONE|nil|Nil|NIL)\b/)) {
                    return "log-null";
                }
                // Timestamps
                if (stream.match(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/)) {
                    return "log-timestamp";
                }
                if (stream.match(/\[\d{2}:\d{2}:\d{2}(?:\.\d{3,7})?(?:\s+[A-Z]{3})?\]/)) {
                    return "log-timestamp";
                }
                // Serilog properties {PropertyName}
                if (stream.match(/\{[^}]+\}/)) {
                    return "log-property";
                }
                // URLs
                if (stream.match(/https?:\/\/[^\s]+/)) {
                    return "log-url";
                }
                // IP addresses
                if (stream.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)) {
                    return "log-ip";
                }
                // Strings
                if (stream.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/)) {
                    return "string";
                }
                // Numbers
                if (stream.match(/\b\d+(?:\.\d+)?\b/)) {
                    return "number";
                }

                stream.next();
                return null;
            }
        };
    });

    CodeMirror.defineMIME("text/x-log", "log");
});
