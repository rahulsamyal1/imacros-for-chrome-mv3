/*
(c) 2009 iOpus Software GmbH - http://www.iopus.com
Rebuilt for Manifest V3 (2026) by Rahul Simi.

The legacy custom Rijndael-256/CBC implementation (unsalted
SHA-256 key, Math.random IV, no MAC) has been REPLACED with WebCrypto:
PBKDF2(SHA-256, 200k) key derivation + AES-256-GCM (authenticated, random IV).

Public surface kept compatible (global name "Rijndael"), but encryptString /
decryptString are now ASYNC (return Promises). Ciphertext format is:
  base64( "IMG1"(4) | salt(16) | iv(12) | AES-GCM ciphertext+tag )

NOTE: ciphertext produced by the old Rijndael cipher is NOT readable here
(different algorithm). decryptString throws a clear error for legacy blobs.
*/

var Rijndael = (function() {
    var enc = new TextEncoder();
    var dec = new TextDecoder();
    var MAGIC = "IMG1";          // iMacros GCM format, version 1
    var ITERATIONS = 200000;
    var SALT_LEN = 16, IV_LEN = 12, TAG_LEN = 16;

    function bytesToBase64(bytes) {
        var bin = "";
        var CHUNK = 0x8000;
        for (var i = 0; i < bytes.length; i += CHUNK) {
            bin += String.fromCharCode.apply(
                null, bytes.subarray(i, i + CHUNK));
        }
        return btoa(bin);
    }

    function base64ToBytes(b64) {
        var bin = atob(b64);
        var out = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++)
            out[i] = bin.charCodeAt(i);
        return out;
    }

    function deriveKey(password, salt) {
        return crypto.subtle.importKey(
            "raw", enc.encode(String(password)),
            {name: "PBKDF2"}, false, ["deriveKey"]
        ).then(function(base) {
            return crypto.subtle.deriveKey(
                {name: "PBKDF2", salt: salt,
                 iterations: ITERATIONS, hash: "SHA-256"},
                base,
                {name: "AES-GCM", length: 256},
                false, ["encrypt", "decrypt"]
            );
        });
    }

    function makeError(msg) {
        // RuntimeError is defined in utils.js (loaded first in the worker)
        if (typeof RuntimeError === "function")
            return new RuntimeError(msg, 942);
        var e = new Error(msg); e.errnum = 942; e.name = "RuntimeError";
        return e;
    }

    return {
        // session-cached master password (set by the password dialog flow)
        tempPassword: null,
        FORMAT: MAGIC,

        // returns Promise<base64 string>
        encryptString: function(message, password) {
            var salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
            var iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
            return deriveKey(password, salt).then(function(key) {
                return crypto.subtle.encrypt(
                    {name: "AES-GCM", iv: iv}, key,
                    enc.encode(String(message)));
            }).then(function(ctBuf) {
                var ct = new Uint8Array(ctBuf);
                var magic = enc.encode(MAGIC);
                var out = new Uint8Array(
                    magic.length + salt.length + iv.length + ct.length);
                var off = 0;
                out.set(magic, off); off += magic.length;
                out.set(salt, off); off += salt.length;
                out.set(iv, off); off += iv.length;
                out.set(ct, off);
                return bytesToBase64(out);
            });
        },

        // returns Promise<plaintext>, rejects with RuntimeError on failure
        decryptString: function(cipherB64, password) {
            var raw;
            try {
                raw = base64ToBytes(cipherB64);
            } catch (e) {
                return Promise.reject(makeError("Decryption failed: bad ciphertext"));
            }
            if (raw.length < MAGIC.length + SALT_LEN + IV_LEN + TAG_LEN ||
                dec.decode(raw.slice(0, MAGIC.length)) !== MAGIC) {
                return Promise.reject(makeError(
                    "Decryption failed: unsupported cipher format. Passwords " +
                    "encrypted with old iMacros (Rijndael) must be re-created " +
                    "with this version."));
            }
            var salt = raw.slice(MAGIC.length, MAGIC.length + SALT_LEN);
            var iv = raw.slice(MAGIC.length + SALT_LEN,
                               MAGIC.length + SALT_LEN + IV_LEN);
            var ct = raw.slice(MAGIC.length + SALT_LEN + IV_LEN);
            return deriveKey(password, salt).then(function(key) {
                return crypto.subtle.decrypt(
                    {name: "AES-GCM", iv: iv}, key, ct);
            }).then(function(ptBuf) {
                return dec.decode(ptBuf);
            }, function() {
                throw makeError("Decryption failed, bad password");
            });
        },

        // true if the base64 blob is in our AES-GCM format
        isOurFormat: function(cipherB64) {
            try {
                var raw = base64ToBytes(cipherB64);
                return raw.length >= MAGIC.length &&
                    dec.decode(raw.slice(0, MAGIC.length)) === MAGIC;
            } catch (e) { return false; }
        }
    };
})();
