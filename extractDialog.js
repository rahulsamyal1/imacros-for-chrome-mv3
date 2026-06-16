/*
(c) Copyright 2010 iOpus Software GmbH - http://www.iopus.com
MV3: shows extracted data; closing resumes the player. The service worker owns
the player state and continues replay when it receives the dialog result.
*/

var __reqId = null, __done = false;

function finish() {
    if (__done) return;
    __done = true;
    sendDialogResult(__reqId, {ok: true});
}

window.addEventListener("load", function(evt) {
    var field = $("data-field");
    field.focus();
    getDialogArgs(function(args, reqId) {
        __reqId = reqId;
        field.value = (args && args.data) || "";
        field.select();
    });
    $("ok-button").addEventListener("click", function() {
        finish();
        window.close();
    });
});

// resume the player even if the popup is closed with the window control
window.addEventListener("unload", function() { finish(); });
