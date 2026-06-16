/*
MV3 rebuild (2026) by Rahul Simi. Original iMacros by iOpus Software GmbH.
The bundled EditArea editor used document.write + inline event handlers, which
the MV3 page CSP blocks. This is a clean, dark-themed <textarea> editor that
honours the same #bypass + custom-event contract editor.js expects.
*/

window.addEventListener("load", function() {
    var bypass = document.getElementById("bypass");
    var ta = document.getElementById("textarea");

    bypass.addEventListener("iMacrosEditorInitEvent", function() {
        if (ta) ta.focus();
    }, true);

    bypass.addEventListener("iMacrosEditorLoadCompleteEvent", function() {
        ta.value = bypass.getAttribute("content") || "";
        ta.focus();
        ta.setSelectionRange(0, 0);
    }, true);

    bypass.addEventListener("iMacrosEditorGetContentEvent", function() {
        bypass.setAttribute("content", ta.value);
    }, true);

    bypass.addEventListener("iMacrosEditorGetSelection", function() {
        bypass.setAttribute("selection",
            ta.value.substring(ta.selectionStart, ta.selectionEnd));
    }, true);

    bypass.addEventListener("iMacrosEditorSetSelection", function() {
        var sel = bypass.getAttribute("selection") || "";
        var s = ta.selectionStart, e = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + sel + ta.value.slice(e);
        ta.selectionStart = s;
        ta.selectionEnd = s + sel.length;
    }, true);

    // insert a real tab instead of moving focus
    ta.addEventListener("keydown", function(e) {
        if (e.key === "Tab") {
            e.preventDefault();
            var s = ta.selectionStart, en = ta.selectionEnd;
            ta.value = ta.value.slice(0, s) + "\t" + ta.value.slice(en);
            ta.selectionStart = ta.selectionEnd = s + 1;
        } else if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
            // Ctrl/Cmd+S -> ask the editor shell to save
            e.preventDefault();
            bypass.setAttribute("content", ta.value);
            var evt = document.createEvent("Events");
            evt.initEvent("iMacrosEditorSaveEvent", true, false);
            bypass.dispatchEvent(evt);
        }
    });

    bypass.setAttribute("inited", "true");
});
