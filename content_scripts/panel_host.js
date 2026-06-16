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
        var startLeft = Math.max(8, (window.innerWidth || 1200) - DEFAULT_W - 16);
        setImportant(host, {
            position: "fixed", top: "16px", left: startLeft + "px",
            width: DEFAULT_W + "px", height: DEFAULT_H + "px",
            "z-index": "2147483647",
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
            "iframe{flex:1 1 auto;width:100%;border:0;display:block;background:#14110d;}" +
            ".rsz{position:absolute;z-index:6;}" +
            ".rsz-n{top:-3px;left:12px;right:12px;height:8px;cursor:ns-resize;}" +
            ".rsz-s{bottom:-3px;left:12px;right:12px;height:8px;cursor:ns-resize;}" +
            ".rsz-e{top:12px;bottom:12px;right:-3px;width:8px;cursor:ew-resize;}" +
            ".rsz-w{top:12px;bottom:12px;left:-3px;width:8px;cursor:ew-resize;}" +
            ".rsz-ne{top:-4px;right:-4px;width:16px;height:16px;cursor:nesw-resize;}" +
            ".rsz-nw{top:-4px;left:-4px;width:16px;height:16px;cursor:nwse-resize;}" +
            ".rsz-se{bottom:-4px;right:-4px;width:16px;height:16px;cursor:nwse-resize;}" +
            ".rsz-sw{bottom:-4px;left:-4px;width:16px;height:16px;cursor:nesw-resize;}";
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

        var collapsed = false, expandedH = DEFAULT_H;
        minBtn.addEventListener("click", function() {
            if (!collapsed) expandedH = host.getBoundingClientRect().height;
            collapsed = !collapsed;
            iframe.style.display = collapsed ? "none" : "block";
            setImportant(host, {height: collapsed ? "38px" : (expandedH + "px")});
        });

        makeDraggable(host, bar, iframe);
        makeResizable(host, shadow, iframe);

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

    function makeDraggable(el, handle, iframe) {
        var sx, sy, ox, oy, dragging = false;
        handle.addEventListener("mousedown", function(e) {
            if (e.button !== 0) return;
            dragging = true;
            sx = e.clientX; sy = e.clientY;
            var r = el.getBoundingClientRect();
            ox = r.left; oy = r.top;
            setImportant(el, {left: ox + "px", top: oy + "px", right: "auto"});
            // stop the iframe from swallowing mouse events while dragging
            if (iframe) iframe.style.pointerEvents = "none";
            e.preventDefault();
        });
        window.addEventListener("mousemove", function(e) {
            if (!dragging) return;
            var nx = Math.max(0, ox + e.clientX - sx);
            var ny = Math.max(0, oy + e.clientY - sy);
            setImportant(el, {left: nx + "px", top: ny + "px"});
        });
        window.addEventListener("mouseup", function() {
            if (!dragging) return;
            dragging = false;
            if (iframe) iframe.style.pointerEvents = "";
        });
    }

    // Resize from any edge or corner.
    function makeResizable(host, shadow, iframe) {
        var MINW = 260, MINH = 220;
        var dirs = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
        dirs.forEach(function(dir) {
            var h = document.createElement("div");
            h.className = "rsz rsz-" + dir;
            shadow.appendChild(h);   // sibling of .wrap so it isn't clipped
            h.addEventListener("mousedown", function(e) {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                var r = host.getBoundingClientRect();
                var sx = e.clientX, sy = e.clientY;
                var sw = r.width, sh = r.height, sl = r.left, st = r.top;
                if (iframe) iframe.style.pointerEvents = "none";

                function move(ev) {
                    var dx = ev.clientX - sx, dy = ev.clientY - sy;
                    var w = sw, ht = sh, l = sl, t = st;
                    if (dir.indexOf("e") >= 0) w = sw + dx;
                    if (dir.indexOf("s") >= 0) ht = sh + dy;
                    if (dir.indexOf("w") >= 0) w = sw - dx;
                    if (dir.indexOf("n") >= 0) ht = sh - dy;
                    w = Math.max(MINW, w);
                    ht = Math.max(MINH, ht);
                    if (dir.indexOf("w") >= 0) l = sl + (sw - w);   // keep right edge fixed
                    if (dir.indexOf("n") >= 0) t = st + (sh - ht);  // keep bottom edge fixed
                    setImportant(host, {
                        width: w + "px", height: ht + "px",
                        left: Math.max(0, l) + "px", top: Math.max(0, t) + "px",
                        right: "auto"
                    });
                }
                function up() {
                    window.removeEventListener("mousemove", move);
                    window.removeEventListener("mouseup", up);
                    if (iframe) iframe.style.pointerEvents = "";
                }
                window.addEventListener("mousemove", move);
                window.addEventListener("mouseup", up);
            });
        });
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
