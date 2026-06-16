/*
(c) Copyright 2012 iOpus Software GmbH - http://www.iopus.com
Rebuilt for Manifest V3 (2026) by Rahul Simi.

MV3: runs inside a sandboxed iframe (script-src 'unsafe-eval') hosted by the
offscreen document. Only messages from the embedding parent are accepted, and
the result is posted back only to that parent (was previously unvalidated).
*/

function EvalException(msg, num) {
    this.message = msg;
    if (typeof num != "undefined")
        this.errnum = num;
    this.name = "MacroError";
}

function MacroError(txt) {
    throw new EvalException(txt, -1340);
}

window.addEventListener("message", function(event) {
    // SECURITY: only accept eval requests from our embedder (offscreen doc)
    if (event.source !== window.parent)
        return;

    var data = event.data || {};
    var response = {id: data.id, win_id: data.win_id};
    try {
        response.result = eval(data.expression);
    } catch (e) {
        console.error(e);
        response.error = {
            name: e.name,
            message: e.message,
            errnum: e.errnum
        };
    }

    // reply to the embedder only. The sandbox has an opaque origin, so the
    // target origin must be "*"; the parent verifies event.source.
    window.parent.postMessage(response, "*");
});
