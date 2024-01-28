import { TurnstileObject } from "turnstile-types";

var mainInputWrapper = document.getElementById("mainInputWrapper") as HTMLDivElement;
var mainInput = document.getElementById("mainInput") as HTMLInputElement;
var submitButton = document.getElementById("submitButton") as HTMLButtonElement;
var loadingIcon = document.getElementById("loadingIcon") as HTMLDivElement;

var appDetailsBox = document.getElementById("appDetailsBox") as HTMLDivElement;
var appIcon = document.getElementById("appIcon") as HTMLImageElement;
var appName = document.getElementById("appName") as HTMLDivElement;
var appCompany = document.getElementById("appCompany") as HTMLDivElement;
var appVersion = document.getElementById("appVersion") as HTMLSpanElement;
var appUpdatedAt = document.getElementById("appUpdatedAt") as HTMLSpanElement;
var downloadBox = document.getElementById("downloadBox") as HTMLDivElement;
var downloadButton = document.getElementById("downloadButton") as HTMLAnchorElement;
var downloadSize = document.getElementById("downloadSize") as HTMLSpanElement;

var modalShadow = document.getElementById("modalShadow") as HTMLDivElement;
var challengeModal = document.getElementById("challengeModal") as HTMLDivElement;
var errorDialog = document.getElementById("errorDialog") as HTMLDivElement;
var errorDialogBody = document.getElementById("errorDialogBody") as HTMLDivElement;
var errorDialogOk = document.getElementById("errorDialogOk") as HTMLButtonElement;

interface ApiResponse<T> {
    code: number,
    message: string,
    data?: T
}

interface App {
    id: number,
    package_id: string,
    app_name: string,
    display_name: string,
    icon_url: string,
    company: AppCompany,
    is_apk_ready: boolean,
    apk?: AppApk,
    download?: string
}

interface AppCompany {
    id: number,
    name: string
}

interface AppApk {
    updated_at: string,
    version_name: string,
    version_code: number,
    file_size: string
}

function show(element: HTMLElement) {
    element.classList.add("show");
}

function hide(element: HTMLElement) {
    element.classList.remove("show");
}

function isShown(element: HTMLElement) {
    return element.classList.contains("show");
}

var appDetailsHeight: number;
function showAppDetails(app: App) {
    appIcon.src = app.icon_url + "?w=96";
    appName.innerText = app.display_name;
    appCompany.innerText = app.company.name;
    if (app.is_apk_ready && app.apk && app.download) {
        appVersion.innerText = app.apk.version_name;
        appUpdatedAt.innerText = app.apk.updated_at;
        downloadBox.classList.remove("na");
        downloadButton.href = app.download;
        downloadSize.innerText = app.apk.file_size;
    }
    else {
        appVersion.innerText = "N/A";
        appUpdatedAt.innerText = "N/A";
        downloadBox.classList.add("na");
    }

    show(appDetailsBox);
    appDetailsHeight = appDetailsBox.scrollHeight;
    appDetailsBox.style.height = appDetailsHeight + "px";
    appDetailsBox.addEventListener("transitionend", () => {
        appDetailsBox.style.height = "unset";
    }, { once: true });
}

function hideAppDetails(): Promise<void> {
    return new Promise(resolve => {
        appDetailsBox.style.height = appDetailsHeight + "px";
        hide(appDetailsBox);
        requestAnimationFrame(() => {
            appDetailsBox.style.removeProperty("height");
        });
        appDetailsBox.addEventListener("transitionend", () => {
            requestAnimationFrame(() => resolve());
        }, { once: true });
    });
}

function showSubmitButton() {
    submitButton.classList.remove("hide");
    submitButton.addEventListener("transitionend", () => {
        loadingIcon.classList.remove("spin");
    }, { once: true });
}

function hideSubmitButton() {
    submitButton.classList.add("hide");
    loadingIcon.classList.add("spin");
}

function showModal(modal: HTMLElement) {
    show(modalShadow);
    show(modal);
}

function hideModal(modal: HTMLElement) {
    hide(modalShadow);
    hide(modal);
}

function showErrorDialog(message: string) {
    errorDialogBody.innerText = message;
    showModal(errorDialog);
}

declare const turnstile: TurnstileObject;
async function fetchWithTurnstile(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let response = await fetch(input, init);

    if (response.headers.has('cf-mitigated') && response.headers.get('cf-mitigated') === 'challenge') {
        await new Promise<void>((resolve, reject) => {
            turnstile.render(challengeModal, {
                'sitekey': "0x4AAAAAAAQb6Ny2xbzumyl2",
                'error-callback': function (code) {
                    hideModal(challengeModal);
                    reject(new Error("Turnstile challenge failed with error code " + code));
                },
                'callback': function () {
                    hideModal(challengeModal);
                    resolve();
                },
            });
            showModal(challengeModal);
        });

        // Repeat request with pre-clearance cookies
        response = await fetch(input, init);
    }
    return response;
};

mainInput.addEventListener("focus", () => {
    mainInputWrapper.classList.add("focus");
});

mainInput.addEventListener("blur", () => {
    mainInputWrapper.classList.remove("focus");
});

errorDialogOk.addEventListener("click", () => {
    hideModal(errorDialog);
});

async function fetchApp(linkOrId: string): Promise<App> {
    var id = +linkOrId;
    if (isNaN(id)) {
        var url: URL;
        try {
            url = new URL(linkOrId);
        }
        catch {
            throw new Error("Invalid URL.");
        }

        if (url.host != "m-apps.qoo-app.com" && url.host != "apps.qoo-app.com") {
            throw new Error("Invalid app link.");
        }
        
        var split = url.pathname.split("/").reverse();
        var idString: string | null = null;
        for (var str of split) {
            if (str) {
                idString = str;
                break;
            }
        }
        if (idString == null || isNaN(id = +idString) || !Number.isInteger(id)) {
            throw new Error("Invalid app link.");
        }
    }
    else if (!Number.isInteger(id)) {
        throw new Error("Invalid app ID.");
    }

    var res = await fetchWithTurnstile("/api/v1/app", {
        method: "POST",
        body: JSON.stringify({ id: id.toString() }),
        headers: {
            'Content-Type': "application/json"
        }
    });
    var apiRes = await res.json() as ApiResponse<App>;
    if (!apiRes.data) {
        throw new Error(apiRes.message + " (error code " + apiRes.code + ")");
    }
    return apiRes.data;
}

declare global {
    interface Window {
        init: () => void
    }
}

window.init = function() {
    var working = false;
    submitButton.addEventListener("click", async () => {
        if (working) return;
        working = true;

        var value = mainInput.value;
        if (!value) {
            showErrorDialog("Input cannot be empty.");
            working = false;
            return;
        }
        hideSubmitButton();
        var hideFinished = isShown(appDetailsBox) ? hideAppDetails() : Promise.resolve();

        var app: App;
        try {
            app = await fetchApp(value);
        }
        catch (e) {
            var error = e as Error;
            showErrorDialog(error.message);
            showSubmitButton();
            working = false;
            return;
        }

        await hideFinished;
        showAppDetails(app);
        showSubmitButton();
        working = false;
    });

    mainInput.addEventListener("keydown", (e) => {
        if (e.key == "Enter") {
            e.preventDefault();
            submitButton.click();
        }
    })
}