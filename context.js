/*
(c) Copyright 2009 iOpus Software GmbH - http://www.iopus.com
Rebuilt for Manifest V3 (2026) by Rahul Simi. Original engine/UI by iOpus.

Window-keyed runtime state. The service worker can be torn down
and restarted, so context.ensure(win_id) lazily (re)builds the MacroPlayer /
Recorder object graph. The old live `panelWindow` DOM reference is replaced by
a message-sending proxy with the same method surface, so engine code that does
  var p = context[id].panelWindow; if (p && !p.closed) p.setStatLine(...)
keeps working unchanged (messages are delivered to the panel page, or dropped
when no panel is open).
*/

var context = {

    // lazily create / recreate the per-window object graph
    ensure: function(win_id) {
        win_id = parseInt(win_id);
        if (isNaN(win_id))
            return null;
        var c = context[win_id];
        if (!c || typeof c !== "object") {
            c = context[win_id] = {};
        }
        if (!c.mplayer) c.mplayer = new MacroPlayer(win_id);
        if (!c.recorder) c.recorder = new Recorder(win_id);
        if (!c.state) c.state = "idle";
        if (!c.panelWindow) c.panelWindow = context.makePanel(win_id);
        return c;
    },

    init: function(win_id) {
        context.ensure(win_id);
    },

    // Message-sending stand-in for the old cross-window panel Window object.
    makePanel: function(win_id) {
        var send = function(cmd) {
            return function() {
                var args = Array.prototype.slice.call(arguments);
                chrome.runtime.sendMessage(
                    {topic: "panel", win_id: win_id, cmd: cmd, args: args},
                    function() { void chrome.runtime.lastError; });
            };
        };
        return {
            // "open" iff the in-page panel overlay is currently injected
            get closed() {
                return !(context[win_id] && context[win_id].panelOpen);
            },
            setStatLine:   send("setStatLine"),
            showLines:     send("showLines"),
            highlightLine: send("highlightLine"),
            setLoopValue:  send("setLoopValue"),
            showMacroTree: send("showMacroTree"),
            addLine:       send("addLine"),
            removeLastLine:send("removeLastLine"),
            updatePanel:   send("updatePanel"),
            showInfo:      send("showInfo"),
            close: function() {
                var c = context[win_id];
                if (c && c.panelTabId) {
                    chrome.tabs.sendMessage(c.panelTabId,
                        {topic: "hide-panel", win_id: win_id},
                        function() { void chrome.runtime.lastError; });
                }
                if (c) c.panelOpen = false;
            }
        };
    },

    panel: function(win_id) {
        var c = context.ensure(win_id);
        return c ? c.panelWindow : null;
    },

    updateState: function(win_id, state) {
        var c = context.ensure(win_id);
        if (!c) return;
        switch (state) {
        case "playing": case "recording":
            badge.setIcon(win_id, "skin/stop.png");
            break;
        case "paused":
            badge.setIcon(win_id, "skin/play.png");
            break;
        case "idle":
            badge.setIcon(win_id, "skin/icon19.png");
            if (Storage.getBool("show-updated-badge")) {
                badge.setText(win_id, "New");
            } else {
                badge.clearText(win_id);
            }
            break;
        }
        c.state = state;
        // notify the panel (no-op if none open)
        c.panelWindow.updatePanel(state);
    },

    onCreated: function (w) {
        if (w.type != "normal")
            return;
        context.ensure(w.id);
        context.updateState(w.id, "idle");
    },

    onRemoved: function (id) {
        if (context[id]) {
            var t;
            if (t = context[id].mplayer) {
                t.terminate();
                context[id].mplayer = null;
            }
            if (t = context[id].recorder) {
                if (t.recording)
                    t.stop();
                context[id].recorder = null;
            }
            delete context[id];
        }
    },

    onTabUpdated: function(tab_id, changeInfo, tab) {
        if (!context[tab.windowId])
            return;
        switch (context[tab.windowId].state) {
        case "playing": case "recording":
            badge.setIcon(tab.windowId, "skin/stop.png");
            break;
        case "paused":
            badge.setIcon(tab.windowId, "skin/play.png");
            break;
        case "idle":
            badge.setIcon(tab.windowId, "skin/icon19.png");
            if (Storage.getBool("show-updated-badge")) {
                badge.setText(tab.windowId, "New");
            } else {
                badge.clearText(tab.windowId);
            }
            break;
        }
    }
};
