/*
(c) Copyright 2010 iOpus Software GmbH - http://www.iopus.com
MV3: chrome.extension.sendRequest -> chrome.runtime.sendMessage, with a bounded
retry (the service worker may be asleep; sending wakes it, but we must not spin
forever if it never answers).
*/


var SIListener = {
    maxRetries: 25,   // ~5s at 200ms

    restartSIServer: function(pipe) {
        if (this.retries === undefined) this.retries = 0;
        if (this.retries++ > this.maxRetries) {
            console.warn("iMacros: giving up on restart-server request");
            return;
        }
        console.info("sending restart-server request, pipe=" + pipe);

        this.restartTimeout =
            setTimeout(function() { SIListener.restartSIServer(pipe); }, 200);

        chrome.runtime.sendMessage(
            {topic: "restart-server", pipe: pipe},
            function(response) {
                void chrome.runtime.lastError;
                // ensure that the background has received the request
                if (response && response.status == "OK") {
                    clearTimeout(SIListener.restartTimeout);
                    SIListener.retries = 0;
                }
            }
        );
    }
};


window.addEventListener("load", function () {
    if (window.top != self)
        return;

    if (window.location.protocol == "file:") {
        if (/^\?pipe=(.+)$/.test(window.location.search)) {
	    SIListener.restartSIServer(RegExp.$1);
        }
    }

}, true);
