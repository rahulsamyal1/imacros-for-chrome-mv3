/*
(c) Copyright 2009 iOpus Software GmbH - http://www.iopus.com
Rebuilt for Manifest V3 (2026) by Rahul Simi. Original engine/UI by iOpus.

MV3 service worker. Hosts the macro engine (per browser window) and brokers all
communication with the UI pages, dialogs and the sandbox/offscreen document.
*/

// classic service worker: importScripts preserves the global-sharing semantics
// the old multi-<script> background page relied on.
try {
    importScripts(
        "version.js",
        "utils.js",
        "rijndael.js",
        "AsyncFileIO.js",
        "badge.js",
        "communicator.js",
        "mplayer.js",
        "mrecorder.js",
        "context.js",
        "nm_connector.js"
    );
} catch (e) {
    console.error("iMacros: importScripts failed", e);
}

// cache the OS so __is_windows()/__psep() work without navigator.platform
chrome.runtime.getPlatformInfo(function(info) {
    self.__imacros_os = info && info.os;   // "win", "mac", "linux", ...
});


/* ----------------------------------------------------------------------------
 *  Bookmarklet helpers (unchanged logic)
 * ------------------------------------------------------------------------- */

// create bookmarklet of new type
function makeBookmarklet(name, code) {
    var pattern = "(function() {"+
        "try{"+
        "var e_m64 = \"{{macro}}\", n64 = \"{{name}}\";"+
        "if(!/^(?:chrome|https?|file)/.test(location)){"+
        "alert('iMacros: Open webpage to run a macro.');"+
        "return;"+
        "}"+
        "var macro = {};"+
        "macro.source = decodeURIComponent(atob(e_m64));"+
        "macro.name = decodeURIComponent(atob(n64));"+
        "var evt = document.createEvent(\"CustomEvent\");"+
        "evt.initCustomEvent(\"iMacrosRunMacro\", true, true, macro);"+
        "window.dispatchEvent(evt);"+
        "}catch(e){alert('iMacros Bookmarklet error: '+e.toString());}"+
        "}) ();";

    var macro_name = name || "Unnamed Macro", source = code;
    macro_name = btoa(encodeURIComponent(name));
    macro_name = imns.escapeLine(macro_name);
    pattern = pattern.replace("{{name}}", macro_name);
    source = btoa(encodeURIComponent(source));
    source = imns.escapeLine(source);
    pattern = pattern.replace("{{macro}}", source);

    return "javascript:" + pattern;
}


function ensureBookmarkFolderCreated(parent_id, name, callback) {
    chrome.bookmarks.getChildren( parent_id, function (result) {
        var found = false, id = null;
        for(var i = 0; i < result.length; i++) {
            if (result[i].title == name) { found = true; id = result[i].id; break; }
        }
        if (!found) {
            chrome.bookmarks.create({parentId: parent_id, title: name},
                function (folder) { if (callback) callback(folder); });
        } else {
            chrome.bookmarks.get(id, function(result) {
                if (callback) callback(result[0]);
            });
        }
    });
}


function ensureDirectoryExists(node, callback) {
    node.exists(function(exists, error) {
        if (error) { console.error(error); return; }
        if (!exists) {
            node.parent.exists(function(parent_exists, err) {
                if (err) { console.error(err); return; }
                if (parent_exists) afio.makeDirectory(node, callback);
                else ensureDirectoryExists(node.parent, callback);
            });
        } else {
            callback();
        }
    });
}


function createBookmark(folder_id, title, url, bookmark_id, overwrite, callback) {
    if (bookmark_id) {
        chrome.bookmarks.update(bookmark_id, {url: url, title: title}, function() {
            if (typeof callback == "function") callback();
        });
    } else {
        if (overwrite) {
            console.error("bg.save() - trying to overwrite "+title+
                          " while bookmark_id is not set");
            return;
        }
        chrome.bookmarks.getChildren(folder_id, function (children) {
            var found = false, count = 0, name = title;
            for(;;) {
                for(var i = 0; i < children.length; i++) {
                    if (children[i].title == name && children[i].url) {
                        found = true; count++; break;
                    }
                }
                if (found) {
                    found = false;
                    if (/\.iim$/.test(title)) {
                        name = title.replace(/\.iim$/, "$'("+count+").iim");
                    } else {
                        name = title+"("+count+")";
                    }
                    continue;
                } else break;
            }
            chrome.bookmarks.create({parentId: folder_id, title: name, url: url},
                function() { if (typeof callback == "function") callback(); });
        });
    }
}


function save_file(save_data, overwrite, callback) {
    var node = afio.openNode(save_data.file_id);
    var update_tree = true;

    if (!/\.iim$/.test(save_data.name))
        save_data.name += ".iim";

    if (node.leafName != save_data.name) {
        node = node.parent;
        try {
            node.append(save_data.name);   // rejects '..' traversal
        } catch (e) {
            console.error(e);
            if (callback) callback(save_data);
            return;
        }
    }

    node.exists(function(exists, err) {
        if (err) { console.error(err); if (callback) callback(save_data); return; }
        // NOTE: a service worker cannot show confirm(); callers must pass
        // overwrite=true to replace an existing file.
        if (exists && !overwrite) {
            console.warn("save_file: "+node.path+" exists, not overwriting");
            if (callback) callback(save_data);   // unblock the caller's response
            return;
        }
        update_tree = !exists;
        afio.writeTextFile(node, save_data.source, function (e) {
            if (e) { console.error(e); return; }
            if (callback) callback(save_data);
            if (!update_tree) return;
            // ask any open panel to refresh its macro tree
            chrome.runtime.sendMessage({topic: "panel", cmd: "refreshTree", args: []},
                function() { void chrome.runtime.lastError; });
        });
    });
}


function save(save_data, overwrite, callback) {
    if (save_data.file_id) {
        save_file(save_data, overwrite, callback);
    } else {
        var url = makeBookmarklet(save_data.name, save_data.source);
        chrome.bookmarks.getTree( function (tree) {
            var panelId = tree[0].children[0].id;
            ensureBookmarkFolderCreated(panelId, "iMacros", function(node) {
                var iMacrosDirId = node.id;
                if (overwrite && !save_data.bookmark_id) {
                    chrome.bookmarks.getChildren(iMacrosDirId, function(ar) {
                        for (var i = 0; i < ar.length; i++) {
                            if (ar[i].title == save_data.name) {
                                save_data.bookmark_id = ar[i].id;
                                createBookmark(iMacrosDirId, save_data.name, url,
                                    save_data.bookmark_id, overwrite,
                                    function() { if (callback) callback(save_data); });
                                return;
                            }
                        }
                        createBookmark(iMacrosDirId, save_data.name, url,
                            save_data.bookmark_id, false,
                            function() { if (callback) callback(save_data); });
                    });
                } else {
                    createBookmark(iMacrosDirId, save_data.name, url,
                        save_data.bookmark_id, overwrite,
                        function() { if (callback) callback(save_data); });
                }
            });
        });
    }
}


/* ----------------------------------------------------------------------------
 *  Dialogs (MV3: popup windows + chrome.storage.session handshake)
 * ------------------------------------------------------------------------- */

var __dialogSeq = 0;
var pendingDialogs = {};   // reqId -> {onResult, authCallback?}

function openDialog(page, payload, winOpts, onResult, extra) {
    var reqId = "d" + (++__dialogSeq) + "_" + Date.now();
    pendingDialogs[reqId] = Object.assign(
        {onResult: onResult || function() {}}, extra || {});
    var store = {};
    store["dialog:" + reqId] = payload || {};
    chrome.storage.session.set(store, function() {
        var createOpts = Object.assign(
            {url: page + "?reqId=" + reqId, type: "popup",
             width: 400, height: 260},
            winOpts || {});
        chrome.windows.create(createOpts, function() {
            void chrome.runtime.lastError;
        });
    });
    return reqId;
}

function resolveDialog(reqId, payload) {
    var p = pendingDialogs[reqId];
    if (!p) return;
    delete pendingDialogs[reqId];
    chrome.storage.session.remove("dialog:" + reqId);
    try { p.onResult(payload || {}, p); } catch (e) { console.error(e); }
}

// master (temp-key) password prompt; onDone(true|false)
function openMasterPasswordDialog(win_id, onDone) {
    openDialog("passwordDialog.html",
        {kind: "master", win_id: win_id},
        {width: 360, height: 210},
        function(payload) {
            if (payload.cancel || !payload.password) { onDone(false); return; }
            Rijndael.tempPassword = payload.password;
            onDone(true);
        });
}

// EXTRACT popup; resumes the player when closed
function openExtractDialog(win_id, str) {
    openDialog("extractDialog.html",
        {kind: "extract", win_id: win_id, data: str},
        {width: 440, height: 400},
        function() {
            var c = context.ensure(win_id);
            if (c && c.mplayer) {
                c.mplayer.waitingForExtract = false;
                c.mplayer.next("extractDialog");
            }
        });
}

// HTTP-auth login dialog used while recording ONLOGIN
function openLoginDialog(win_id, details, enc, authCallback) {
    openDialog("loginDialog.html",
        {kind: "login", win_id: win_id, encrypt: !!enc.encrypt,
         details: {
            challenger: details.challenger,
            realm: details.realm,
            isProxy: details.isProxy
         }},
        {width: 400, height: 260},
        function(payload, pend) {
            var cb = pend.authCallback;
            if (payload.cancel) {
                if (cb) cb({cancel: true});
                return;
            }
            if (cb) cb({authCredentials: {
                username: payload.username, password: payload.password}});

            var rec = function(pwdField) {
                var c = context.ensure(win_id);
                if (!c || !c.recorder) return;
                var acts = c.recorder.actions || [];
                if (acts.length &&
                    acts[acts.length-1].indexOf("ONLOGIN USER=") === 0) {
                    acts.pop();
                    c.panelWindow.removeLastLine();
                }
                c.recorder.recordAction(
                    "ONLOGIN USER="+payload.username+" PASSWORD="+pwdField);
            };
            if (enc.encrypt && enc.key) {
                Rijndael.encryptString(payload.password, enc.key).then(
                    function(ct) { rec(ct); },
                    function(e) { console.error(e); rec(payload.password); });
            } else {
                rec(payload.password);
            }
        },
        {authCallback: authCallback});
}

// open the macro editor
function edit(macro, overwrite) {
    openDialog("editor/editor.html",
        {kind: "editor", macro: macro, overwrite: !!overwrite},
        {width: 680, height: 520},
        function() { /* editor persists via the 'save' command */ });
}


/* ----------------------------------------------------------------------------
 *  EVAL sandbox via offscreen document
 * ------------------------------------------------------------------------- */

var __offscreenReady = null;

function ensureOffscreen() {
    if (__offscreenReady) return __offscreenReady;
    __offscreenReady = (async function() {
        try {
            var has = await chrome.offscreen.hasDocument();
            if (has) return;
        } catch (e) { /* hasDocument may be unavailable; fall through */ }
        try {
            await chrome.offscreen.createDocument({
                url: "offscreen.html",
                reasons: ["IFRAME_SCRIPTING"],
                justification: "Run macro EVAL() expressions in a sandboxed iframe"
            });
        } catch (e) {
            // a concurrent create may have already made it
        }
    })();
    return __offscreenReady;
}

function evalInSandbox(win_id, eval_data) {
    ensureOffscreen().then(function() {
        chrome.runtime.sendMessage({
            topic: "offscreen-eval",
            win_id: win_id,
            id: eval_data.id,
            expression: eval_data.expression
        }, function() { void chrome.runtime.lastError; });
    });
}


/* ----------------------------------------------------------------------------
 *  Macro playback / panel helpers
 * ------------------------------------------------------------------------- */

function playMacro(macro, win_id) {
    context.ensure(win_id).mplayer.play(macro);
}

function addTab(url, win_id) {
    var args = {url: url};
    if (win_id) args.windowId = parseInt(win_id);
    chrome.tabs.create(args, function () {});
}

// Inject the in-page panel host into the tab (idempotent) and toggle the
// floating overlay. Replaces the old separate popup window.
function togglePanel(tab_id, win_id) {
    chrome.scripting.executeScript(
        {target: {tabId: tab_id}, files: ["content_scripts/panel_host.js"]},
        function() {
            if (chrome.runtime.lastError) {
                console.warn("iMacros: cannot open the panel on this page (" +
                             chrome.runtime.lastError.message +
                             "). Open a normal http(s)/file page and try again.");
                return;
            }
            chrome.tabs.sendMessage(tab_id,
                {topic: "toggle-panel", win_id: win_id},
                function() { void chrome.runtime.lastError; });
        });
}

function showInfo(args) {
    var win_id = args.win_id;
    var c = context.ensure(win_id);
    c.info_args = args;
    if (!c.panelWindow.closed) {
        c.panelWindow.showInfo(args);
    } else {
        var opt = {
            type: "basic",
            title: (args.errorCode == 1 ? "iMacros" : "iMacros Error"),
            message: String(args.message || ""),
            iconUrl: "skin/logo48.png"
        };
        chrome.notifications.create(String(win_id), opt, function() {
            void chrome.runtime.lastError;
        });
    }
}

// single notifications click listener (registered once, not per showInfo)
chrome.notifications.onClicked.addListener(function(n_id) {
    var w_id = parseInt(n_id);
    if (isNaN(w_id) || !context[w_id] || !context[w_id].info_args) return;
    var info = context[w_id].info_args;
    if (info.errorCode == 1) return;
    edit(info.macro, true);
});


/* ----------------------------------------------------------------------------
 *  Sample macros / first run (logic preserved; XHR -> fetch)
 * ------------------------------------------------------------------------- */

function readFileFromSamples(name, callback) {
    fetch(chrome.runtime.getURL("samples/" + name))
        .then(function(r) { return r.text(); })
        .then(function(text) { if (callback) callback(text, name); })
        .catch(function(e) { console.error(e); });
}

function addSampleMacro(name, parentId, content, callback) {
    chrome.bookmarks.getChildren(parentId, function(a) {
        if (name == "Loop-Csv-2-Web.iim") return;
        for (var i = 0; i < a.length; i++) {
            if (a[i].title == name) {
                createBookmark(parentId, name, makeBookmarklet(name, content),
                    a[i].id, true, callback);
                return;
            }
        }
        createBookmark(parentId, name, makeBookmarklet(name, content),
            null, false, callback);
    });

    afio.isInstalled( function(installed) {
        if (!installed) return;
        afio.getDefaultDir("savepath", function(node, err) {
            if (err) { console.error(err); return; }
            node.append("Demo-Chrome");
            ensureDirectoryExists(node, function() {
                var macro = node.clone();
                macro.append(name);
                afio.writeTextFile(macro, content, function(e) {
                    if (e) { console.error(e); return; }
                    if (typeof callback == "function") callback();
                });
            });
        });
    });
}

function copyProfilerXsl() {
    readFileFromSamples("Profiler.xsl", function(content) {
        afio.getDefaultDir("downpath", function(node, error) {
            if (error) { console.error(error); return; }
            ensureDirectoryExists(node, function(err) {
                if (err) { console.error(err); return; }
                node.append("Profiler.xsl");
                afio.writeTextFile(node, content, function(e) {
                    if (e) console.error(e);
                });
            });
        });
    });
}

function copyAddressCsv() {
    readFileFromSamples("Address.csv", function(content) {
        afio.getDefaultDir("datapath", function(node, err) {
            ensureDirectoryExists(node, function() {
                node.append("Address.csv");
                afio.writeTextFile(node, content, function(e) {
                    if (e) console.error(e);
                });
            });
        });
    });
}

function copySampleMacros() {
    var names = [
        "ArchivePage.iim", "Eval.iim", "Extract.iim", "ExtractAndFill.iim",
        "ExtractRelative.iim", "ExtractTable.iim", "ExtractURL.iim",
        "FillForm-XPath.iim", "FillForm.iim", "Frame.iim", "Loop-Csv-2-Web.iim",
        "Open6Tabs.iim", "SaveAs.iim", "SlideShow.iim", "Stopwatch.iim",
        "TagPosition.iim"
    ];
    chrome.bookmarks.getTree( function (tree) {
        var panelId = tree[0].children[0].id;
        ensureBookmarkFolderCreated(panelId, "iMacros", function(im) {
            ensureBookmarkFolderCreated(im.id, "Demo-Chrome", function(node) {
                for (var i = 0; i < names.length; i++) {
                    readFileFromSamples(names[i], function(content, nam) {
                        addSampleMacro(nam, node.id, content, function() {});
                    });
                }
            });
        });
    });
}

var bm_strre = "(?:[^\"\\\\]|\\\\[0btnvfr\"\'\\\\])+";
var bm_update_re = new RegExp('^javascript\\:\\(function\\(\\) '+
                              '\\{try\\{var ((?:e_)?m(?:64)?) = "('+bm_strre+')"'+
                              ', (n(?:64)?) = "('+bm_strre+')";'+
                             '.+;evt\.initEvent');

function updateBookmarksTree(tree) {
    if (!tree) return;
    tree.forEach(function(x) {
        if (x.url) {
            var match = bm_update_re.exec(x.url);
            if (match) {
                var source, name;
                switch(match[1]) {
                case "m":
                    source = decodeURIComponent(imns.unwrap(match[2])); break;
                case "m64": case "e_m64":
                    source = decodeURIComponent(atob(match[2])); break;
                }
                if (match[3] == "n") name = decodeURIComponent(match[4]);
                else if (match[3] == "n64") name = decodeURIComponent(atob(match[4]));
                chrome.bookmarks.update(x.id, {url: makeBookmarklet(name, source)});
            }
        } else {
            updateBookmarksTree(x.children);
        }
    });
}

function doAfterUpdateAction() {
    Storage.setBool("show-updated-badge", false);
    chrome.windows.getAll({populate: false}, function(ws) {
        ws.forEach(function(win) { badge.clearText(win.id); });
    });
    link("https://www.imacros.net/");
    chrome.bookmarks.getTree( function (tree) { updateBookmarksTree(tree); });
    copySampleMacros();
    afio.isInstalled(function(installed) {
        if (installed) { copyProfilerXsl(); copyAddressCsv(); }
    });
}

function onUpdate() {
    Storage.setBool("show-updated-badge", true);
    chrome.windows.getAll({populate: false}, function(ws) {
        ws.forEach(function(win) { badge.setText(win.id, "New"); });
    });
}

function firstRunSetup() {
    Storage.setBool("already-installed", true);
    Storage.setBool("before-play-dialog", true);
    Storage.setBool("dock-panel", true);
    Storage.setBool("default-dirs-set", false);
    Storage.setChar("version", chrome.runtime.getManifest().version);
    copySampleMacros();
    afio.isInstalled(function(installed) {
        if (installed) { copyProfilerXsl(); copyAddressCsv(); }
    });
}

function ensureDefaultDirs() {
    if (Storage.getBool("default-dirs-set")) return;
    afio.isInstalled(function(installed) {
        if (!installed) return;
        var dirs = ["datapath", "savepath", "downpath", "logpath"];
        dirs.forEach(function(d) {
            afio.getDefaultDir(d, function(node, err) {
                if (err) { console.error(err); return; }
                if (!Storage.isSet("def"+d)) Storage.setChar("def"+d, node.path);
                ensureDirectoryExists(node, function(e) { if (e) console.error(e); });
            });
        });
        copySampleMacros();
        copyProfilerXsl();
        copyAddressCsv();
        Storage.setBool("default-dirs-set", true);
    });
}


/* ----------------------------------------------------------------------------
 *  Page-originated macro execution (run-macro) - SECURITY GATED
 * ------------------------------------------------------------------------- */

// A macro dispatched from a web page (iMacrosRunMacro / bookmarklet) is
// UNTRUSTED. Always require an explicit user confirmation before running it.
communicator.registerHandler("run-macro", function (data, tab_id) {
    chrome.tabs.get(tab_id, function(t) {
        if (!t) return;
        var w_id = t.windowId;
        context.ensure(w_id);
        // Always confirm page-triggered macros (ignore the convenience setting
        // for this code path - this is the trust boundary fix).
        openDialog("beforePlay.html",
            {kind: "beforePlay", win_id: w_id,
             name: data.name, source: data.source,
             origin: (t.url || "")},
            {width: 420, height: 200},
            function(payload) {
                if (!payload) return;
                data.win_id = w_id;
                if (payload.edit) { edit(data, false); return; }
                if (!payload.proceed) return;
                context.ensure(w_id).mplayer.play(data);
            });
    });
});


/* ----------------------------------------------------------------------------
 *  Top-level event listeners (must be registered synchronously on every wake)
 * ------------------------------------------------------------------------- */

chrome.windows.onCreated.addListener(context.onCreated.bind(context));
chrome.windows.onRemoved.addListener(context.onRemoved.bind(context));
chrome.tabs.onUpdated.addListener(context.onTabUpdated.bind(context));

// (The in-page panel overlay lives in the tab's DOM, so it goes away with the
// tab/window automatically — no separate popup window to clean up.)

// browser action (toolbar button)
chrome.action.onClicked.addListener(function(tab) {
    Storage.ready().then(function() {
        var win_id = tab.windowId;
        if (Storage.getBool("show-updated-badge")) { doAfterUpdateAction(); return; }
        var c = context.ensure(win_id);
        var mplayer = c.mplayer, recorder = c.recorder;

        if (c.state == "idle") {
            // toggle the in-page panel overlay in the clicked (active) tab
            togglePanel(tab.id, win_id);
        } else if (c.state == "paused") {
            if (mplayer.paused) mplayer.unpause();
        } else {
            if (mplayer.playing) {
                mplayer.stop();
            } else if (recorder.recording) {
                recorder.stop();
                var recorded_macro = recorder.actions.join("\n");
                var macro = {source: recorded_macro, win_id: win_id, name: "#Current.iim"};
                if (Storage.getChar("tree-type") == "files") {
                    afio.isInstalled(function(installed) {
                        if (installed) {
                            afio.getDefaultDir("savepath", function(node, e) {
                                if (e) { console.error(e); edit(macro, true); return; }
                                node.append("#Current.iim");
                                macro.file_id = node.path;
                                edit(macro, true);
                            });
                        } else { edit(macro, true); }
                    });
                } else { edit(macro, true); }
            }
        }
    });
});


// install / update
chrome.runtime.onInstalled.addListener(function(details) {
    Storage.ready().then(function() {
        if (details.reason == "install") {
            firstRunSetup();
            ensureDefaultDirs();
            chrome.tabs.create({url: "https://www.imacros.net/"}, function() {});
        } else if (details.reason == "update") {
            var v = chrome.runtime.getManifest().version;
            if (v != Storage.getChar("version")) {
                Storage.setChar("version", v);
                onUpdate();
            }
            ensureDefaultDirs();
        }
        nm_connector.startServer();
    });
});

// also (re)start the native host when the worker wakes on browser startup
chrome.runtime.onStartup.addListener(function() {
    Storage.ready().then(function() { nm_connector.startServer(); });
});


/* ----------------------------------------------------------------------------
 *  Central message router
 * ------------------------------------------------------------------------- */

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (!msg || !msg.topic) return;

    // messages coming from content scripts (sender.tab set) are routed by the
    // Communicator's own onMessage listener; here we handle UI/page/dialog/SW.
    switch (msg.topic) {

    case "restart-server":
        sendResponse({status: "OK"});
        if (nm_connector.currentPipe != msg.pipe) {
            nm_connector.stopServer();
            nm_connector.startServer(msg.pipe);
            nm_connector.currentPipe = msg.pipe;
        }
        return;

    case "dialog-result":
        resolveDialog(msg.reqId, msg.payload);
        return;

    case "eval-result": {
        var c = context[msg.win_id];
        if (c && c.mplayer)
            c.mplayer.onSandboxMessage({id: msg.id, result: msg.result, error: msg.error});
        return;
    }

    case "panel-ready": {
        // the panel iframe announces which browser window it controls
        if (typeof msg.win_id != "undefined") {
            var cc = context.ensure(msg.win_id);
            cc.panelOpen = true;
            sendResponse({state: cc.state});
        }
        return;
    }

    case "panel-opened":
        // from the in-page panel host content script (sender.tab is set)
        if (sender && sender.tab) {
            var wO = (msg.win_id != null) ? parseInt(msg.win_id) : sender.tab.windowId;
            var cO = context.ensure(wO);
            cO.panelOpen = true;
            cO.panelTabId = sender.tab.id;
        }
        return;

    case "panel-closed": {
        var wC = (msg.win_id != null) ? parseInt(msg.win_id)
                 : (sender && sender.tab ? sender.tab.windowId : NaN);
        if (!isNaN(wC) && context[wC]) context[wC].panelOpen = false;
        return;
    }

    case "sw":
        Storage.ready().then(function() { handleSwCommand(msg, sendResponse); });
        return true;   // async sendResponse
    }
});


function handleSwCommand(msg, sendResponse) {
    var win_id = parseInt(msg.win_id);
    var c = isNaN(win_id) ? null : context.ensure(win_id);

    switch (msg.cmd) {
    case "play":
        if (c) c.mplayer.play(msg.macro);
        break;
    case "stop":
        if (c && c.mplayer.playing) c.mplayer.stop();
        break;
    case "pause":
        if (c) c.mplayer.pause();
        break;
    case "unpause":
        if (c && c.mplayer.paused) c.mplayer.unpause();
        break;
    case "record":
        if (c) c.recorder.start();
        break;
    case "stopRecord":
        if (c && c.recorder.recording) {
            c.recorder.stop();
            var macro = {source: c.recorder.actions.join("\n"),
                         win_id: win_id, name: "#Current.iim"};
            edit(macro, true);
        }
        break;
    case "saveAs":
        if (c) c.recorder.saveAs();
        break;
    case "capture":
        if (c) c.recorder.capture();
        break;
    case "edit":
        edit(msg.macro, msg.overwrite);
        break;
    case "save":
        save(msg.save_data, msg.overwrite,
             function(sd) { if (sendResponse) sendResponse({ok: true, save_data: sd}); });
        return;  // async response
    case "addTab":
        addTab(msg.url, win_id);
        break;
    case "openSettings":
        chrome.runtime.openOptionsPage();
        break;
    case "getState":
        if (sendResponse) sendResponse({state: c ? c.state : "idle"});
        return;
    case "link":
        chrome.tabs.create({url: msg.url}, function() {});
        break;
    case "askMasterPassword":
        // options page "Enter Master Password" (tmpkey). Sets Rijndael.tempPassword.
        openMasterPasswordDialog(win_id, function() {});
        break;
    }
    if (sendResponse) sendResponse({ok: true});
}
