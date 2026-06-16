/*
Rebuilt for Manifest V3 (2026) by Rahul Simi. Original iMacros by iOpus Software GmbH.

In-page panel host: injects the iMacros panel as a floating, draggable overlay
(Shadow DOM + an <iframe> of panel.html) into the current web page, instead of
opening a separate popup window. Injected on demand by the service worker via
chrome.scripting; this guard makes repeated injection a no-op.
*/

(function() {
    if (window.__imacrosPanelHost) return;   // already injected in this frame
    window.__imacrosPanelHost = true;

    var HOST_ID = "imacros-panel-host";
    var DEFAULT_W = 340, DEFAULT_H = 600;
    var winId = null;

    function isOpen() { return !!document.getElementById(HOST_ID); }

    function setImportant(el, props) {
        for (var k in props) el.style.setProperty(k, props[k], "important");
    }

    function openPanel(win_id) {
        if (isOpen()) return;
        winId = win_id;

        var host = document.createElement("div");
        host.id = HOST_ID;
        setImportant(host, {
            position: "fixed", top: "16px", right: "16px",
            width: DEFAULT_W + "px", height: DEFAULT_H + "px",
            "max-height": "92vh", "z-index": "2147483647",
            margin: "0", padding: "0", border: "0",
            "color-scheme": "light"
        });

        var shadow = host.attachShadow({mode: "open"});

        // amber-on-espresso theme (hardcoded; the host page has no design tokens)
        var style = document.createElement("style");
        style.textContent =
            ".wrap{position:relative;width:100%;height:100%;display:flex;" +
            "flex-direction:column;background:#14110d;border:1px solid #3a3025;" +
            "border-radius:14px;overflow:hidden;box-shadow:0 12px 34px rgba(0,0,0,.5);" +
            "font-family:ui-sans-serif,-apple-system,Segoe UI,Roboto,system-ui,sans-serif;}" +
            ".bar{flex:0 0 38px;display:flex;align-items:center;gap:9px;padding:0 10px;" +
            "color:#f3ead9;cursor:move;user-select:none;" +
            "background:linear-gradient(180deg,#241e17,#1d1813);" +
            "border-bottom:1px solid #3a3025;}" +
            ".bar img{width:18px;height:18px;display:block;border-radius:5px;}" +
            ".bar .t{flex:1;font-size:13px;font-weight:800;letter-spacing:.3px;color:#f3ead9;}" +
            ".bar button{all:unset;cursor:pointer;color:#b8aa92;font-size:16px;line-height:1;" +
            "padding:4px 8px;border-radius:7px;transition:background .15s,color .15s;}" +
            ".bar button:hover{background:rgba(255,255,255,.08);color:#ffc25c;}" +
            "iframe{flex:1 1 auto;width:100%;border:0;display:block;background:#14110d;}";
        shadow.appendChild(style);

        var wrap = document.createElement("div");
        wrap.className = "wrap";

        var bar = document.createElement("div");
        bar.className = "bar";

        var logo = document.createElement("img");
        logo.src = chrome.runtime.getURL("skin/logo24.png");
        logo.alt = "";
        var title = document.createElement("span");
        title.className = "t";
        title.textContent = "iMacros";
        var minBtn = document.createElement("button");
        minBtn.title = "Minimize";
        minBtn.textContent = "–";          // en dash
        var closeBtn = document.createElement("button");
        closeBtn.title = "Close";
        closeBtn.textContent = "×";         // ×

        bar.appendChild(logo);
        bar.appendChild(title);
        bar.appendChild(minBtn);
        bar.appendChild(closeBtn);

        var iframe = document.createElement("iframe");
        iframe.src = chrome.runtime.getURL("panel.html?win_id=" + encodeURIComponent(win_id));

        wrap.appendChild(bar);
        wrap.appendChild(iframe);
        shadow.appendChild(wrap);

        // append to <html> so it survives unusual <body> handling
        document.documentElement.appendChild(host);

        closeBtn.addEventListener("click", closePanel);

        var collapsed = false;
        minBtn.addEventListener("click", function() {
            collapsed = !collapsed;
            iframe.style.display = collapsed ? "none" : "block";
            setImportant(host, {height: collapsed ? "38px" : (DEFAULT_H + "px")});
        });

        makeDraggable(host, bar);

        notify("panel-opened");
    }

    function closePanel() {
        var el = document.getElementById(HOST_ID);
        if (el) {
            el.remove();
            notify("panel-closed");
        }
    }

    function notify(topic) {
        try {
            chrome.runtime.sendMessage({topic: topic, win_id: winId},
                function() { void chrome.runtime.lastError; });
        } catch (e) { /* extension context may be gone */ }
    }

    function makeDraggable(el, handle) {
        var sx, sy, ox, oy, dragging = false;
        handle.addEventListener("mousedown", function(e) {
            if (e.button !== 0) return;
            dragging = true;
            sx = e.clientX; sy = e.clientY;
            var r = el.getBoundingClientRect();
            ox = r.left; oy = r.top;
            // switch from right-anchored to left-anchored while dragging
            setImportant(el, {left: ox + "px", top: oy + "px", right: "auto"});
            e.preventDefault();
        });
        window.addEventListener("mousemove", function(e) {
            if (!dragging) return;
            var nx = Math.max(0, ox + e.clientX - sx);
            var ny = Math.max(0, oy + e.clientY - sy);
            setImportant(el, {left: nx + "px", top: ny + "px"});
        });
        window.addEventListener("mouseup", function() { dragging = false; });
    }

    chrome.runtime.onMessage.addListener(function(msg) {
        if (!msg || !msg.topic) return;
        if (msg.topic === "toggle-panel") {
            if (isOpen()) closePanel(); else openPanel(msg.win_id);
        } else if (msg.topic === "show-panel") {
            if (!isOpen()) openPanel(msg.win_id);
        } else if (msg.topic === "hide-panel") {
            closePanel();
        }
    });

    // best-effort: tell the worker the panel is gone when the page unloads
    window.addEventListener("pagehide", function() {
        if (isOpen()) notify("panel-closed");
    });
})();
