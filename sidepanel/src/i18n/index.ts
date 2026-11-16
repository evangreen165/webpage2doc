import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ru from "./locales/ru.json";
import en from "./locales/en.json";

const stored = localStorage.getItem("w2d.lang");
const initial = stored === "en" || stored === "ru" ? stored : "ru";

void i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
  },
  lng: initial,
  fallbackLng: "ru",
  interpolation: { escapeValue: false },
});

export default i18n;
