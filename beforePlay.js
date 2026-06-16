/*
(c) Copyright 2009 iOpus Software GmbH - http://www.iopus.com
MV3: confirmation dialog shown before a PAGE-TRIGGERED macro runs (security
trust boundary). The service worker plays/edits the macro based on the result.
*/

var __reqId = null, __args = {};

function play() {
    sendDialogResult(__reqId, {proceed: true});
    window.close();
}

function edit() {
    sendDialogResult(__reqId, {proceed: false, edit: true});
    window.close();
}

function cancel() {
    sendDialogResult(__reqId, {proceed: false});
    window.close();
}

window.addEventListener("load", function(evt) {
    getDialogArgs(function(args, reqId) {
        __reqId = reqId;
        __args = args || {};
        // SECURITY: macro name / origin are untrusted -> textContent, not innerHTML
        var msg = $("message");
        if (msg) {
            msg.textContent =
                'You are about to play macro "' + (__args.name || "") +
                '". You can view or edit its code before playing.';
        }
    });

    $("play-button").focus();
    $("play-button").addEventListener("click", play);
    $("edit-button").addEventListener("click", edit);
    $("cancel-button").addEventListener("click", cancel);

    resizeToContent(window, $("container"));
    document.body.oncontextmenu = function(e) { e.preventDefault(); return false; };
}, true);
