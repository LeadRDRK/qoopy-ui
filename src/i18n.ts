import en from './locales/en.json';
import zh from './locales/zh.json';
import fil from './locales/fil.json';

export const translations: Record<string, any> = {
    en,
    zh,
    fil,
};

export type Language = keyof typeof translations;

let currentLang: Language = "en";

export function getCurrentLang(): Language {
    return currentLang;
}

export function setCurrentLang(lang: string) {
    if (translations[lang]) {
        currentLang = lang as Language;
    }
}

export function t(key: string, params?: { [key: string]: string | number }): string {
    const text = translations[currentLang]?.[key] || translations["en"]?.[key] || key;
    if (params) {
        return Object.keys(params).reduce((str, k) => {
            return str.replace(`{${k}}`, String(params[k]));
        }, text);
    }
    return text;
}
