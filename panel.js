/*
(c) Copyright 2009 iOpus Software GmbH - http://www.iopus.com
MV3: the panel talks to the service worker over chrome.runtime messaging
(swSend) instead of chrome.extension.getBackgroundPage(). The macro engine
state lives in the worker; the panel reads the selected macro from its tree
iframe (same-origin) and sends play/record/edit/... commands.
*/

var args = {win_id: null};
var panelState = "idle";
var info_args = null;


function __play(runLocalTest, callback) {
    var doc = window.frames["tree-iframe"].contentDocument;
    var container = doc.getElementById("imacros-macro-container");
    var div = doc.getElementById("imacros-bookmark-div");
    var macro = {};

    if (!runLocalTest && panelState == "paused") {
        swSend("unpause", {win_id: args.win_id});
        return;
    }

    if (div.hasAttribute("file_id")) {
        var node = afio.openNode(div.getAttribute("file_id"));
        macro.file_id = node.path;
        afio.readTextFile(node, function(source, err) {
            if (err) { console.error(err); alert("Can not read macro file, error "+err); return; }
            macro.source = source;
            macro.name = div.getAttribute("name");
            macro.runLocalTest = runLocalTest;
            swSend("play", {win_id: args.win_id, macro: macro});
        });
    } else if (div.hasAttribute("bookmark_id")) {
        macro.source = container.value;
        macro.bookmark_id = div.getAttribute("bookmark_id");
        macro.name = div.getAttribute("name");
        macro.runLocalTest = runLocalTest;
        swSend("play", {win_id: args.win_id, macro: macro});
    }
}

function play() {
    if ($("play-button").getAttribute("disabled") == "true") return;
    __play(false);
}

function playLoop() {
    if ($("loop-button").getAttribute("disabled") == "true") return;
    var cur = parseInt($("current-loop").value);
    var max = parseInt($("max-loop").value);
    if (cur > max) {
        alert("Current loop value should be less or equivalent max loop value");
        return;
    }
    var doc = window.frames["tree-iframe"].contentDocument;
    var container = doc.getElementById("imacros-macro-container");
    var div = doc.getElementById("imacros-bookmark-div");
    var macro = {name: div.getAttribute("name"), times: max, startLoop: cur};

    if (div.hasAttribute("file_id")) {
        var node = afio.openNode(div.getAttribute("file_id"));
        macro.file_id = div.getAttribute("file_id");
        afio.readTextFile(node, function(source, err) {
            if (err) { alert("Can not open macro, reason: "+err); console.error(err); return; }
            macro.source = source;
            swSend("play", {win_id: args.win_id, macro: macro});
        });
    } else if (div.hasAttribute("bookmark_id")) {
        macro.source = container.value;
        swSend("play", {win_id: args.win_id, macro: macro});
    }
}

function pause() {
    if ($("pause-button").getAttribute("disabled") == "true") return;
    swSend("pause", {win_id: args.win_id});
}

function edit() {
    if ($("edit-button").getAttribute("disabled") == "true") return;
    var doc = window.frames["tree-iframe"].contentDocument;
    var container = doc.getElementById("imacros-macro-container");
    var div = doc.getElementById("imacros-bookmark-div");
    var name = div.getAttribute("name");
    var macro = {name: name, win_id: args.win_id};

    if (div.hasAttribute("file_id")) {
        var file_id = div.getAttribute("file_id");
        var node = afio.openNode(file_id);
        afio.readTextFile(node, function(source, e) {
            if (e) { alert("Can not open macro, reason: "+e); console.error(e); return; }
            macro.source = source;
            macro.file_id = file_id;
            swSend("edit", {macro: macro, overwrite: true});
        });
    } else if (div.hasAttribute("bookmark_id")) {
        macro.source = container.value;
        macro.bookmark_id = div.getAttribute("bookmark_id");
        swSend("edit", {macro: macro, overwrite: true});
    }
}

function record() {
    if ($("record-button").getAttribute("disabled") == "true") return;
    swSend("record", {win_id: args.win_id});
}

function stop() {
    if (panelState == "recording") {
        swSend("stopRecord", {win_id: args.win_id});
    } else {
        swSend("stop", {win_id: args.win_id});
    }
}


function onSelectionChanged(selected) {
    var setDisabled = function(val, names) {
        for (var i = 1; i < arguments.length; i++)
            $(arguments[i]+"-button").setAttribute("disabled", val);
    };
    if (selected) setDisabled("false", "play", "loop", "edit", "local-test", "online-test", "af-upload");
    else setDisabled("true", "play", "loop", "edit", "local-test", "online-test", "af-upload");
}


function updatePanel(state) {
    panelState = state;
    var show = function () { for (var x=0;x<arguments.length;x++) $(arguments[x]+"-button").setAttribute("collapsed","false"); };
    var hide = function () { for (var x=0;x<arguments.length;x++) $(arguments[x]+"-button").setAttribute("collapsed","true"); };
    var hideInfo = function() { $("info-div").setAttribute("hidden","true"); $("logo-and-links").removeAttribute("hidden"); };
    var disable = function () { for (var x=0;x<arguments.length;x++) $(arguments[x]+"-button").setAttribute("disabled","true"); };
    var enable = function () { for (var x=0;x<arguments.length;x++) $(arguments[x]+"-button").setAttribute("disabled","false"); };
    switch(state) {
    case "playing":
        show("pause"); hide("play"); enable("stop-replaying");
        disable("loop","record","stop-recording","saveas","capture","edit","local-test","online-test","af-upload");
        hideInfo(); break;
    case "paused":
        show("play"); hide("pause"); break;
    case "recording":
        enable("stop-recording","saveas","capture");
        disable("play","loop","record","edit","local-test","online-test","af-upload");
        hideInfo(); break;
    case "idle":
        show("play"); hide("pause");
        enable("play","loop","record","edit","local-test","online-test","af-upload");
        disable("stop-recording","stop-replaying","saveas","capture"); break;
    }
}


function onTreeSelect(type) {
    Storage.setChar("tree-type", type);
    var tree_iframe = $("tree-iframe");
    if (type == "files") {
        $("radio-files-tree").checked = "yes";
        tree_iframe.src = "fileView.html";
    } else if (type == "bookmarks") {
        tree_iframe.src = "treeView.html";
        $("radio-bookmarks-tree").checked = "yes";
    }
}


window.addEventListener("load", function() {
    // win_id is passed by the service worker via the popup URL
    var m = /[?&]win_id=(\d+)/.exec(location.search);
    args.win_id = m ? parseInt(m[1]) : null;

    // tell the worker which browser window this in-page panel controls
    chrome.runtime.sendMessage(
        {topic: "panel-ready", win_id: args.win_id},
        function() { void chrome.runtime.lastError; });

    var tree_type = Storage.isSet("tree-type") ? Storage.getChar("tree-type") : "files";
    afio.isInstalled(function(installed) {
        if (!/^(?:files|bookmarks)$/.test(tree_type))
            tree_type = installed ? "files" : "bookmarks";
        if (tree_type == "files" && installed) onTreeSelect("files");
        else onTreeSelect("bookmarks");
    });

    $("play-button").addEventListener("click", play);
    $("pause-button").addEventListener("click", pause);
    $("record-button").addEventListener("click", record);
    $("stop-replaying-button").addEventListener("click", stop);
    $("stop-recording-button").addEventListener("click", stop);
    $("saveas-button").addEventListener("click", onSaveAs);
    $("capture-button").addEventListener("click", onCapture);
    $("loop-button").addEventListener("click", playLoop);
    $("edit-button").addEventListener("click", edit);
    $("settings-button").addEventListener("click", function() { swSend("openSettings", {}); });
    $("info-edit-button").addEventListener("click", onInfoEdit);
    $("info-help-button").addEventListener("click", onInfoHelp);
    $("info-close-button").addEventListener("click", onInfoClose);

    $("radio-files-tree").addEventListener("change", function() { onTreeSelect('files'); });
    $("radio-bookmarks-tree").addEventListener("change", function() { onTreeSelect('bookmarks'); });

    $("home-link").addEventListener("click", function() { link('https://www.imacros.net/'); });
    $("wiki-link").addEventListener("click", function() { link('http://wiki.imacros.net/iMacros_for_Chrome'); });
    $("forum-link").addEventListener("click", function() { link('https://forum.imacros.net/'); });
    $("idrone-link").addEventListener("click", function() { link('http://wiki.imacros.net/AlertFox_allowed_iMacros_commands'); });

    $("local-test-button").addEventListener("click", onLocalTest);
    var idrone_chk = $("idrone-checkbox");
    idrone_chk.checked = Storage.getBool("af-idrone-test");
    idrone_chk.addEventListener("change", function(evt) { Storage.setBool("af-idrone-test", evt.target.checked); });
    $("online-test-button").addEventListener("click", onOnlineTest);
    $("af-upload-button").addEventListener("click", onAfUpload);
});


/* ---- messages from the service worker (engine -> panel) ---------------- */

function refreshTree() {
    var f = $("tree-iframe");
    if (f && f.contentWindow) f.contentWindow.location.reload();
}

var PANEL_DISPATCH = {
    updatePanel: function(s) { updatePanel(s); },
    showLines: function(code) { showLines(code); },
    showMacroTree: function() { showMacroTree(); },
    addLine: function(t) { addLine(t); },
    highlightLine: function(l) { highlightLine(l); },
    setStatLine: function(t, ty) { setStatLine(t, ty); },
    removeLastLine: function() { removeLastLine(); },
    setLoopValue: function(v) { setLoopValue(v); },
    showInfo: function(a) { showInfo(a); },
    refreshTree: function() { refreshTree(); }
};

chrome.runtime.onMessage.addListener(function(msg) {
    if (!msg || msg.topic !== "panel") return;
    // ignore messages addressed to a different browser window
    if (typeof msg.win_id !== "undefined" && msg.win_id !== args.win_id) return;
    var fn = PANEL_DISPATCH[msg.cmd];
    if (fn) {
        try { fn.apply(null, msg.args || []); } catch (e) { console.error(e); }
    }
});


function setLoopValue(val) { $("current-loop").value = val; }


function convert() {
    var doc = window.frames["tree-iframe"].contentDocument;
    var container = doc.getElementById("imacros-macro-container");
    var div = doc.getElementById("imacros-bookmark-div");
    var macro = {};
    var type;

    if (div.hasAttribute("file_id")) {
        type = "bookmark";
        var node = afio.openNode(div.getAttribute("file_id"));
        afio.readTextFile(node, function(source, e) {
            if (e) { alert("Can not open macro, reason: "+e); console.error(e); return; }
            macro.source = source;
            macro.name = div.getAttribute("name");
            swSend("save", {save_data: macro, overwrite: false}, function() {
                alert("Macro duplicated in "+type+" storage");
            });
        });
    } else if (div.hasAttribute("bookmark_id")) {
        type = "file";
        macro.source = container.value;
        macro.name = div.getAttribute("name");
        if (!/\.iim$/.test(macro.name)) macro.name += ".iim";
        var node = afio.openNode(Storage.getChar("defsavepath"));
        node.append(macro.name);
        macro.file_id = node.path;
        swSend("save", {save_data: macro, overwrite: false}, function() {
            alert("Macro duplicated in "+type+" storage");
        });
    }
}


function showLines(code) {
    $("tree-view").setAttribute("hidden", "true");
    $("macro-view").removeAttribute("hidden");
    if (code && code.length) {
        $("macro-iframe").contentWindow.mv.showLines(code);
    } else {
        $("macro-iframe").contentWindow.mv.clearAllLines();
    }
}

function showMacroTree() {
    $("tree-view").removeAttribute("hidden");
    $("macro-view").setAttribute("hidden", "true");
}

function addLine(txt) { $("macro-iframe").contentWindow.mv.addLine(txt); }
function highlightLine(line) { $("macro-iframe").contentWindow.mv.highlightLine(line); }
function setStatLine(txt, type) { $("macro-iframe").contentWindow.mv.setStatLine(txt, type); }
function removeLastLine() { $("macro-iframe").contentWindow.mv.removeLastLine(); }


function showInfo(a) {
    info_args = a;
    $("info-div").removeAttribute("hidden");
    $("logo-and-links").setAttribute("hidden", "true");
    if (a.errorCode != 1) {
        $("info-area").setAttribute("type", "error");
        $("info-edit-button").removeAttribute("collapsed");
        $("info-help-button").removeAttribute("collapsed");
    } else {
        $("info-area").setAttribute("type", "message");
        $("info-edit-button").setAttribute("collapsed", "true");
        $("info-help-button").setAttribute("collapsed", "true");
    }
    $("info-area").textContent = a.message;
}

function onInfoClose() {
    $("info-div").setAttribute("hidden", "true");
    $("logo-and-links").removeAttribute("hidden");
}

function onInfoHelp() {
    swSend("addTab", {url: "https://www.imacros.net/", win_id: info_args.win_id});
}

function onInfoEdit() {
    swSend("edit", {macro: info_args.macro, overwrite: true});
}

function onSaveAs() {
    if ($("saveas-button").getAttribute("disabled") == "true") return;
    swSend("saveAs", {win_id: args.win_id});
}

function onCapture() {
    if ($("capture-button").getAttribute("disabled") == "true") return;
    swSend("capture", {win_id: args.win_id});
}

function onLocalTest() {
    if ($("local-test-button").getAttribute("disabled") == "true") return;
    // button states are driven by updatePanel(playing/idle) from the worker
    __play(true);
}

function __now_really_do_uploadMacro(usr, pwd, skip, macro_source) {
    var xargs = {accountName: usr, accountPassword: pwd, macro: macro_source,
                 browserType: "CR", skipOnlineTest: skip};
    var btn = $(skip ? "af-upload-button" : "online-test-button");
    var wsdl_url = "https://my.alertfox.com/imu/AlertFoxManagementAPI.asmx";
    SOAPClient.invoke(wsdl_url, "UploadMacro", xargs, function(rv, err) {
        btn.setAttribute("disabled", "false");
        btn.setAttribute("waiting", "false");
        if (!rv) { alert("Unexpected error occured while uploading macro: "+err.message); return; }
        if (rv.errorMessage) { alert(rv.errorMessage); return; }
        if (!/^https:\/\/my\.alertfox\.com/i.test(rv.UploadMacroResult)) {
            alert("Unexpected server response. URL value "+rv.UploadMacroResult+
                  " does not refer to AlertFox service.");
            return;
        }
        link(rv.UploadMacroResult);
    });
}

function __uploadMacro(usr, pwd, skip) {
    var doc = window.frames["tree-iframe"].contentDocument;
    var container = doc.getElementById("imacros-macro-container");
    var div = doc.getElementById("imacros-bookmark-div");

    if (div.hasAttribute("file_id")) {
        var node = afio.openNode(div.getAttribute("file_id"));
        afio.readTextFile(node, function(macro_source, e) {
            if (e) { alert("Can not open macro, reason: "+e.toString()); console.error(e); return; }
            __now_really_do_uploadMacro(usr, pwd, skip, macro_source);
        });
    } else if (div.hasAttribute("bookmark_id")) {
        __now_really_do_uploadMacro(usr, pwd, skip, container.value);
    }
}

function openAfLogin(skipOnlineTest) {
    // AlertFox dialog is opened page-to-page; it calls back via window.opener
    var features = "width=380,height=260";
    var win = window.open("AlertFoxLoginDialog.html", "AlertFox Login Dialog", features);
    if (win) win.args = {proceed: true, win_id: args.win_id, skipOnlineTest: skipOnlineTest};
}

function uploadMacro(skipOnlineTest) {
    if (!Storage.isSet("af-username") || !Storage.isSet("af-password")) {
        openAfLogin(skipOnlineTest);
        return;
    }
    var uname = Storage.getChar("af-username");
    var pwd = Storage.getChar("af-password");
    var xargs = {accountName: uname, accountPassword: pwd};
    var wsdl_url = "https://my.alertfox.com/imu/AlertFoxManagementAPI.asmx";
    var btn = $(skipOnlineTest ? "af-upload-button" : "online-test-button");
    btn.setAttribute("disabled", "true");
    btn.setAttribute("waiting", "true");
    SOAPClient.invoke(wsdl_url, "CheckLogin", xargs, function(rv, err) {
        if (!rv) {
            btn.setAttribute("waiting", "false");
            btn.setAttribute("disabled", "false");
            alert("Error occured while checking credentials: "+err.message);
            return;
        }
        if (rv.CheckLoginResult) {
            __uploadMacro(uname, pwd, skipOnlineTest);
        } else {
            btn.setAttribute("waiting", "false");
            btn.setAttribute("disabled", "false");
            if (confirm("Either user name or password is incorrect. Please enter your credentials in the Settings dialog"))
                openAfLogin(skipOnlineTest);
        }
    });
}

function onAfUpload() {
    if ($("af-upload-button").getAttribute("disabled") == "true") return;
    uploadMacro(true);
}

function onOnlineTest() {
    if ($("online-test-button").getAttribute("disabled") == "true") return;
    uploadMacro(false);
}
