let turnstileScriptPromise;

export function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (turnstileScriptPromise) return turnstileScriptPromise;

    turnstileScriptPromise = new Promise((resolve, reject) => {
        let script = document.querySelector(
            'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]',
        );
        const handleLoad = () => {
            if (!window.turnstile) {
                reject(new Error("Không tải được CAPTCHA. Hãy thử tải lại trang."));
                return;
            }
            resolve(window.turnstile);
        };
        const handleError = () => {
            turnstileScriptPromise = undefined;
            reject(new Error("Không tải được CAPTCHA. Hãy kiểm tra kết nối mạng."));
        };

        if (!script) {
            script = document.createElement("script");
            script.src =
                "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
            script.async = true;
            script.defer = true;
        }
        script.addEventListener("load", handleLoad, { once: true });
        script.addEventListener("error", handleError, { once: true });
        if (!script.isConnected) document.head.append(script);
    }).catch((error) => {
        turnstileScriptPromise = undefined;
        throw error;
    });

    return turnstileScriptPromise;
}
