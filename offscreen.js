/*
Rebuilt for Manifest V3 (2026) by Rahul Simi. Original iMacros by iOpus Software GmbH.
MV3 offscreen document.
Bridges chrome.runtime messages between the service worker and the sandboxed
<iframe> that evaluates macro EVAL() expressions (the service worker has no DOM
and cannot host an iframe or call eval()).
*/

var sandboxFrame = document.getElementById("sandbox");

// service worker -> offscreen -> sandbox iframe
chrome.runtime.onMessage.addListener(function(msg) {
    if (!msg || msg.topic !== "offscreen-eval") return;
    // relay to the sandboxed iframe. Its origin is opaque, so targetOrigin
    // must be "*"; the sandbox validates event.source === its parent.
    sandboxFrame.contentWindow.postMessage(
        {id: msg.id, expression: msg.expression, win_id: msg.win_id}, "*");
});

// sandbox iframe -> offscreen -> service worker
window.addEventListener("message", function(event) {
    // only accept messages from our own sandbox iframe
    if (event.source !== sandboxFrame.contentWindow) return;
    var d = event.data || {};
    chrome.runtime.sendMessage({
        topic: "eval-result",
        win_id: d.win_id,
        id: d.id,
        result: d.result,
        error: d.error
    }, function() { void chrome.runtime.lastError; });
});
