/*
(c) Copyright 2009 iOpus Software GmbH - http://www.iopus.com
MV3: thin master-password prompt. The service worker performs all decryption /
encryption and resumes the player/recorder; this dialog only collects the key.
*/

var __reqId = null;

function ok() {
    sendDialogResult(__reqId, {password: $("password").value});
    window.close();
}

function cancel() {
    sendDialogResult(__reqId, {cancel: true});
    window.close();
}

window.addEventListener("load", function(evt) {
    getDialogArgs(function(args, reqId) { __reqId = reqId; });

    $("password").focus();

    $("more-info-encryption").addEventListener("click", function() {
        link("http://wiki.imacros.net/!ENCRYPTION");
    });
    $("password").addEventListener("keypress", function(e) {
        if (e.which == 13) ok();
    });
    $("ok-button").addEventListener("click", ok);
    $("cancel-button").addEventListener("click", cancel);
    resizeToContent(window, $("container"));
    // prevent right-click
    document.body.oncontextmenu = function(e) { e.preventDefault(); return false; };
}, true);
