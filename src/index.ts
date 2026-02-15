import { TurnstileObject } from "turnstile-types";
import { Zip, AsyncZipDeflate } from "fflate";
import streamSaver from "streamsaver";
import { md5 } from "hash-wasm";
import { t, setCurrentLang } from "./i18n";

function updateLanguage(lang: string) {
    setCurrentLang(lang);
    localStorage.setItem("lang", lang); 
    
    document.querySelectorAll("[data-i18n]").forEach(el => {
        const key = el.getAttribute("data-i18n");
        if (key) {
            (el as HTMLElement).innerText = t(key);
        }
    });

    if (mainInput) mainInput.placeholder = t("input_placeholder");

    if (app) showAppDetails();
}

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
var downloadBtnLabel = document.getElementById("downloadBtnLabel") as HTMLSpanElement;

var modalShadow = document.getElementById("modalShadow") as HTMLDivElement;
var challengeModal = document.getElementById("challengeModal") as HTMLDivElement;

var errorDialog = document.getElementById("errorDialog") as HTMLDivElement;
var errorDialogBody = document.getElementById("errorDialogBody") as HTMLDivElement;
var errorDialogOk = document.getElementById("errorDialogOk") as HTMLButtonElement;

var splitsButton = document.getElementById("splitsButton") as HTMLAnchorElement;
var splitsDialog = document.getElementById("splitsDialog") as HTMLDivElement;
var splitsDialogBody = document.getElementById("splitsDialogBody") as HTMLDivElement;
var splitsDialogDone = document.getElementById("splitsDialogDone") as HTMLButtonElement;

var xapkButton = document.getElementById("xapkButton") as HTMLAnchorElement;
var xapkDialog = document.getElementById("xapkDialog") as HTMLDivElement;
var xapkDialogBaseDl = document.getElementById("xapkDialogBaseDl") as HTMLAnchorElement;
var xapkDialogSplits = document.getElementById("xapkDialogSplits") as HTMLDivElement;
var xapkDialogCreate = document.getElementById("xapkDialogCreate") as HTMLButtonElement;
var xapkDialogClose = document.getElementById("xapkDialogClose") as HTMLButtonElement;
var baseApkInput = document.getElementById("baseApkInput") as HTMLInputElement;
var splitApksInput = document.getElementById("splitApksInput") as HTMLInputElement;

interface ApiResponse<T> {
    code: number,
    message: string,
    data?: T
}

interface App {
    id: number,
    package_id?: string,
    app_name: string,
    display_name: string,
    icon_url: string,
    company: AppCompany,
    is_apk_ready: boolean,
    apk: AppApk,
    split_apks?: AppSplitApk[],
    download?: string
}

interface AppCompany {
    id: number,
    name: string
}

interface AppApk {
    updated_at?: string,
    version_name?: string,
    version_code?: number,
    file_size?: string,
    base_apk_md5?: string
}

interface AppSplitApk {
    url: string,
    md5: string,
    size: number
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
function showAppDetails() {
    if (!app) return;
    appIcon.src = app.icon_url + "?w=96";
    appName.innerText = app.display_name;
    appCompany.innerText = app.company.name;
    if (app.is_apk_ready && app.apk.updated_at != null && app.apk.file_size != null &&
        app.apk.version_name != null && app.download)
    {
        appVersion.innerText = app.apk.version_name;
        appUpdatedAt.innerText = app.apk.updated_at;
        downloadBox.classList.remove("na");
        downloadButton.href = app.download;

        if (app.split_apks) {
            splitsButton.style.removeProperty("display");
            xapkButton.style.removeProperty("display");
            downloadButton.classList.add("secondary");
            downloadBtnLabel.innerText = t("base_apk_label");
        }
        else {
            splitsButton.style.display = "none";
            xapkButton.style.display = "none";
            downloadButton.classList.remove("secondary");
            downloadBtnLabel.innerText = t("download_size", { size: app.apk.file_size || "" });
        }
    }
    else {
        appVersion.innerText = t("na");
        appUpdatedAt.innerText = t("na");
        downloadBox.classList.add("na");
        splitsButton.style.display = "none";
        xapkButton.style.display = "none";
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

var errorModal: HTMLElement | undefined;
function showErrorDialog(message: string, modal?: HTMLDivElement) {
    errorDialogBody.innerText = message;
    if (modal) {
        errorModal = modal;
        hideModal(modal);
    }
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
                    reject(new Error(t("turnstile_error", { code: code })));
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
    if (errorModal) {
        showModal(errorModal);
        errorModal = undefined;
    }
});

splitsDialogDone.addEventListener("click", () => {
    hideModal(splitsDialog);
});

xapkDialogClose.addEventListener("click", () => {
    hideModal(xapkDialog);
});

function formatSize(size: number): string {
    var mib = size / 1048576;
    return Math.floor(mib * 100) / 100 + "MB";
}

function createDownloadButton(label: string, href: string, isSecondary = false): HTMLAnchorElement {
    var a = document.createElement("a");
    a.className = "button";
    if (isSecondary) a.classList.add("secondary");
    a.href = href;
    a.target = "_blank";

    var icon = document.createElement("span");
    icon.className = "material-symbols-outlined";
    icon.innerText = "\uf090";

    a.appendChild(icon);
    a.appendChild(document.createTextNode(label));
    return a;
}

function getSplitApkName(split: AppSplitApk) {
    var url = split.url;
    return url.slice(url.lastIndexOf("/")).split("-")[2];
}

function initSplitEntries(container: HTMLElement, splits: AppSplitApk[]) {
    container.innerHTML = "";
    for (var split of splits) {
        var label = getSplitApkName(split); // config.XXX
        label += " (";
        label += formatSize(split.size);
        label += ")";
        var button = createDownloadButton(label, split.url, true);
        container.appendChild(button);
    }
}

splitsButton.addEventListener("click", () => {
    if (!app || !app.split_apks) return;
    initSplitEntries(splitsDialogBody, app.split_apks);
    showModal(splitsDialog);
});

xapkButton.addEventListener("click", () => {
    if (!app || !app.download || !app.split_apks) return;
    xapkDialogBaseDl.href = app.download;
    initSplitEntries(xapkDialogSplits, app.split_apks);
    showModal(xapkDialog);
});

function readAsArrayBuffer(blob: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
        var reader = new FileReader;
        reader.onload = function() {
            resolve(reader.result as ArrayBuffer);
        }
        reader.onerror = function(e) {
            reject(e);
        }
        reader.readAsArrayBuffer(blob);
    });
}

async function readAsUint8Array(blob: Blob) {
    return new Uint8Array(await readAsArrayBuffer(blob));
}

function createXapk() {
    return new Promise<void>(async (resolve, reject) => {
        if (!app || !app.package_id || !app.apk.version_code || !app.split_apks || !app.apk.base_apk_md5) {
            return reject(new Error(t("xapk_error")));
        }

        var baseApkFile = baseApkInput.files?.item(0);
        if (!baseApkFile) return reject(new Error(t("base_apk_missing")));

        var splitApkFiles = splitApksInput.files;
        if (!splitApkFiles || !splitApkFiles.length) {
            return reject(new Error(t("split_apk_missing")));
        }

        var xapkFilename = app.package_id + "-" + app.apk.version_code + ".xapk";
        var xapkFile = streamSaver.createWriteStream(xapkFilename);
        var xapkWriter = xapkFile.getWriter();

        var zip = new Zip;
        zip.ondata = function(err, chunk, final) {
            if (err) {
                xapkWriter.abort();
                return reject(err);
            }
            xapkWriter.write(chunk);
            if (final) {
                xapkWriter.close();
                resolve();
            }
        }

        var files = new Set<string>();
        function addFile(filename: string, data: Uint8Array) {
            var deflateStream = new AsyncZipDeflate(filename, { level: 0 });
            zip.add(deflateStream);
            files.add(deflateStream.filename);
            deflateStream.push(data, true);
        }

        {
            var data = await readAsUint8Array(baseApkFile);
            if (await md5(data) != app.apk.base_apk_md5) {
                xapkWriter.abort();
                return reject(new Error(t("checksum_mismatch")));
            }
            addFile(app.package_id + ".apk", data);
        }

        for (var file of splitApkFiles) {
            var data = await readAsUint8Array(file);
            var hash = await md5(data);
            var foundSplit: AppSplitApk | undefined;
            for (var split of app.split_apks) {
                if (split.md5 == hash) {
                    foundSplit = split;
                    break;
                }
            }

            if (!foundSplit) {
                xapkWriter.abort();
                return reject(new Error(t("split_identify_fail", { name: file.name })));
            }

            var name = getSplitApkName(foundSplit) + ".apk";
            if (files.has(name)) {
                xapkWriter.abort();
                return reject(new Error(t("duplicate_split")));
            }

            addFile(name, data);
        }

        zip.end();
    });
}

xapkDialogCreate.addEventListener("click", async () => {
    xapkDialogCreate.disabled = true;
    xapkDialogClose.style.display = "none";
    xapkDialogCreate.innerText = t("please_wait");

    try {
        await createXapk();
    }
    catch (e) {
        showErrorDialog((e as Error).message, xapkDialog);
    }

    xapkDialogCreate.disabled = false;
    xapkDialogClose.style.removeProperty("display");
    xapkDialogCreate.innerText = t("create");
});

async function fetchApp(linkOrId: string): Promise<App> {
    var id = +linkOrId;
    if (isNaN(id)) {
        var url: URL;
        try {
            url = new URL(linkOrId);
        }
        catch {
            throw new Error(t("invalid_url"));
        }

        if (url.host != "m-apps.qoo-app.com" && url.host != "apps.qoo-app.com") {
            throw new Error(t("invalid_app_link"));
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
            throw new Error(t("invalid_app_link"));
        }
    }
    else if (!Number.isInteger(id)) {
        throw new Error(t("invalid_app_id"));
    }

    var res = await fetchWithTurnstile("/api/v2/app", {
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

var app: App | undefined;
window.init = function() {
    const savedLang = localStorage.getItem("lang");
    if (savedLang) {
        updateLanguage(savedLang);
    } else {
        const browserLang = navigator.language.startsWith("zh") ? "zh" : "en";
        updateLanguage(browserLang);
    }
    
    document.getElementById("langEn")?.addEventListener("click", () => updateLanguage("en"));
    document.getElementById("langZh")?.addEventListener("click", () => updateLanguage("zh"));
    document.getElementById("langFil")?.addEventListener("click", () => updateLanguage("fil"));

    var working = false;
    submitButton.addEventListener("click", async () => {
        if (working) return;
        working = true;

        var value = mainInput.value;
        if (!value) {
            showErrorDialog(t("input_empty"));
            working = false;
            return;
        }
        hideSubmitButton();
        var hideFinished = isShown(appDetailsBox) ? hideAppDetails() : Promise.resolve();

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
        showAppDetails();
        showSubmitButton();
        working = false;
    });

    mainInput.addEventListener("keydown", (e) => {
        if (e.key == "Enter") {
            e.preventDefault();
            submitButton.click();
        }
    });
}
