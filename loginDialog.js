/*
(c) Copyright 2012 iOpus Software GmbH - http://www.iopus.com
MV3: thin HTTP-auth dialog used while recording ONLOGIN. The service worker
supplies credentials to the webRequest auth callback and records the (optionally
encrypted) ONLOGIN command - this page only collects user name and password.
*/

var __reqId = null;

function ok() {
    sendDialogResult(__reqId, {
        username: $("username").value,
        password: $("password").value
    });
    window.close();
}

function cancel() {
    sendDialogResult(__reqId, {cancel: true});
    window.close();
}

window.addEventListener("load", function(evt) {
    getDialogArgs(function(args, reqId) {
        __reqId = reqId;
        var d = (args && args.details) || {};
        var ch = d.challenger || {};
        var message = (ch.host || "") +
            (ch.port ? (":" + ch.port) : "") + " requires authentication.";
        if (d.realm)
            message += " Server message: " + d.realm;
        // SECURITY: realm is server-controlled -> textContent, not innerHTML
        var el = $("message");
        if (el) el.textContent = message;
    });

    $("username").addEventListener("keypress", function(e) { if (e.which == 13) ok(); });
    $("password").addEventListener("keypress", function(e) { if (e.which == 13) ok(); });
    $("ok-button").addEventListener("click", ok);
    $("cancel-button").addEventListener("click", cancel);
    resizeToContent(window, $("container"));
}, true);
