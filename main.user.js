// ==UserScript==
// @name          AUTO-BRK-LVL
// @namespace     http://tampermonkey.net/
// @match         https://*.geo-fs.com/*
// @updateURL     https://github.com/Ahmd-Tint/GeoFS-AUTO-BRK-LVL/raw/refs/heads/main/main.user.js
// @downloadURL   https://github.com/Ahmd-Tint/GeoFS-AUTO-BRK-LVL/raw/refs/heads/main/main.user.js
// @grant         none
// @version       8.7
// @author        Ahmd-Tint
// @description   Auto Brake with full mode cycling (RTO, DISARM, 1, 2, 3, 4, MAX).
// ==/UserScript==

(function () {
    'use strict';

    const DEBUG = false;
    const CHECK_INTERVAL_MS = 50;

    const autoBrakeModes = ["RTO", "DISARM", "1", "2", "3", "4", "MAX"];
    let autoBrakeIndex = 0;
    let isAutoBrakeArmed = true;

    let rtoActive = false;

    let deployedThisLanding = false;

    let abrkOverlay = null;


    function log(...args) {
        if (DEBUG) console.log('[ABRK]', ...args);
    }
    function info(...args) {
        console.log('[ABRK]', ...args);
    }
    function warn(...args) {
        console.warn('[ABRK]', ...args);
    }


    function showNotification(msg, type = "info", timeout = 3000) {
        try {
            if (window.geofs?.utils?.notification) {
                window.geofs.utils.notification.show(msg, { timeout, type });
            } else if (window.ui?.notification) {
                window.ui.notification.show(msg, { timeout, type });
            }
        } catch (e) { return;; }
    }


    async function waitForGeoFS() {
        return new Promise(resolve => {
            const interval = setInterval(() => {
                if (window.geofs?.aircraft?.instance && window.controls) {
                    clearInterval(interval);
                    resolve();
                }
            }, 200);
        });
    }


    function areInstrumentsVisible() {
        try {
            if (window.instruments && typeof window.instruments.visible !== 'undefined') {
                return window.instruments.visible;
            }
            return true;
        } catch (e) {
            log("Error checking instruments visibility:", e);
            return true;
        }
    }

    const toggleAutoBrake = () => {
        autoBrakeIndex = (autoBrakeIndex + 1) % autoBrakeModes.length;
        const mode = autoBrakeModes[autoBrakeIndex];

        isAutoBrakeArmed = mode !== "DISARM";


        if (!isAutoBrakeArmed) rtoActive = false;


        updateAbrkOverlay();

        info(`Mode = ${mode}`);
    };


    function isOnGround(inst) {
        try {
            if (!inst) return false;
            const gc = inst.groundContact;
            if (Array.isArray(gc)) {
                return gc.some(x => x === true);
            } else {
                return gc === true;
            }
        } catch (e) {
            return !!(inst && inst.groundContact);
        }
    }


    const checkTouchdownLogic = () => {
        try {
            const inst = geofs.aircraft.instance;
            if (!inst) return;

            const onGround = isOnGround(inst);
            // const armed = inst.animationValue && inst.animationValue.spoilerArming === 1;

/*
            if (!onGround && deployedThisLanding) {
                deployedThisLanding = false;
                log('Airborne again — reset deployedThisLanding flag');
            }
*/

            if (!isAutoBrakeArmed) {

                return;
            }


            const mode = autoBrakeModes[autoBrakeIndex] || "DISARM";
            let brakeAmount = 0;

            if (mode === "RTO") {

                if (!rtoActive && inst.groundSpeed > 44 && controls.throttle === 0 && onGround) {
                    rtoActive = true;
                    info('RTO ACTIVATED');
                }
                if (rtoActive) {
                    brakeAmount = 1;
                }
            }

            if (!rtoActive) {
                switch (mode) {
                    case "1": brakeAmount = 0.2; break;
                    case "2": brakeAmount = 0.4; break;
                    case "3": brakeAmount = 0.6; break;
                    case "4": brakeAmount = 0.8; break;
                    case "MAX": brakeAmount = 1; break;
                    default: brakeAmount = 0; break;
                }
            }


            try {
                controls.brakes = brakeAmount;
            } catch (e) {
                log('Unable to set controls.brakes', e);
            }

        } catch (e) {
            console.error('[ABRK] checkTouchdownLogic fatal error', e);
        }
    };


    function createCustomOverlays() {
        try {
            
            abrkOverlay = document.createElement('div');
            abrkOverlay.style.cssText = `
                position: fixed;
                bottom: 147.5px;
                right: 11.5px;
                width: 47.5px;
                height: 47.5px;
                background: rgba(0, 255, 0, 0.8);
                color: white;
                font-family: monospace;
                font-size: 12px;
                font-weight: bold;
                text-align: center;
                line-height: 25px;
                border-radius: 5px;
                z-index: 10000;
                display: block;
                pointer-events: none;
            `;
            abrkOverlay.innerHTML = 'ABRK<br/>RTO';
            document.body.appendChild(abrkOverlay);

            console.log("[ABRK] Custom overlays created.");
        } catch (e) {
            console.error('[ABRK] Error creating overlays:', e);
        }
    }

    function updateAbrkOverlay() {
        if (!abrkOverlay) return;
        try {
            const mode = autoBrakeModes[autoBrakeIndex];
            abrkOverlay.innerHTML = `ABRK<br/>${mode}`;
            const instrumentsVisible = areInstrumentsVisible();

            if (mode === "DISARM" || !instrumentsVisible) {
                abrkOverlay.style.display = 'none';
            } else {
                abrkOverlay.style.display = 'block';
            }
        } catch (e) {
            return;
        }
    }


    function startVisibilityMonitor() {
        setInterval(() => {
            updateAbrkOverlay();
        }, 500);
    }


    function autoDisarm() {
        try {
            const brkMode = autoBrakeModes[autoBrakeIndex];
            if (!brkMode || brkMode === "DISARM") return;
            const b = controls.brakes || 0;
            const thresholds = { "1": 0.21, "2": 0.41, "3": 0.61, "4": 0.81 };
            if (thresholds[brkMode] && b > thresholds[brkMode]) {
                autoBrakeIndex = autoBrakeModes.indexOf("DISARM");
                isAutoBrakeArmed = false;
                rtoActive = false;
                updateAbrkOverlay();
                info('AutoBrake auto-disarmed due to pilot braking');
            }
        } catch (e) {
            log('autoDisarm error', e);
        }
    }


    async function init() {
        await waitForGeoFS();

        createCustomOverlays();
        updateAbrkOverlay();
        startVisibilityMonitor();


        setInterval(checkTouchdownLogic, CHECK_INTERVAL_MS);
        setInterval(autoDisarm, 50);


        document.addEventListener("keydown", e => {

            if (e.ctrlKey && e.key === "F11") {
                e.preventDefault();
                toggleAutoBrake();
            }
        });

        showNotification("AUTO BRK Loaded! (v8.7)", "info", 4000);
        info('Full realistic system online. V8.7');
    }

    init();

})();
