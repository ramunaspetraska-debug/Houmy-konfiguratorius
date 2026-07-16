// ============================================================================
// firebase-init.js — Firebase ryšys ir kainų/nustatymų sinchronizacija
// tarp kompiuterių (HOUMY konfigūratorius).
//
// Veikimo principas:
//  1. Užsikrovus puslapiui, iš debesies (Realtime Database, kelias
//     "houmy_settings") parsisiunčiami bendri nustatymai.
//  2. Jei jie skiriasi nuo vietinių (localStorage) — vietiniai atnaujinami
//     ir puslapis vieną kartą perkraunamas, kad visur atsirastų naujos kainos.
//  3. Admin panelėje paspaudus „Išsaugoti" nustatymai įrašomi ir į debesį
//     (kviečiama iš funkcijos.js per window.houmyCloud.issaugotiNustatymus).
//
// Sinchronizuojami TIK bendri verslo duomenys: kainos (customPrices),
// gamybos terminas, pristatymo pastaba ir papildoma informacija.
// Sofos spalva ir kiti asmeniniai nustatymai lieka vietiniai.
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getDatabase, ref, get, set, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

// Firebase projekto konfigūracija (tai NĖRA slaptažodžiai — šie duomenys
// skirti būti viešame kliento kode; prieigą riboja duomenų bazės taisyklės).
const firebaseConfig = {
    apiKey: "AIzaSyCFmDr-zRfiTucB59YB72jYv6hD_fB6xWg",
    authDomain: "houmy-konfiguratorius.firebaseapp.com",
    databaseURL: "https://houmy-konfiguratorius-eu.europe-west1.firebasedatabase.app",
    projectId: "houmy-konfiguratorius",
    storageBucket: "houmy-konfiguratorius.firebasestorage.app",
    messagingSenderId: "358582638929",
    appId: "1:358582638929:web:c669c903f0f96493aa1b70"
};

const fbApp = initializeApp(firebaseConfig);
const db = getDatabase(fbApp);
const SETTINGS_KELIAS = "houmy_settings";

// Paima iš nustatymų tik tuos laukus, kurie sinchronizuojami su debesiu,
// ir suvienodina tuščias reikšmes (kad palyginimas būtų patikimas).
function paimtiSinchronizuojamus(nustatymai) {
    const n = nustatymai || {};
    return {
        prodTerm: typeof n.prodTerm === "string" ? n.prodTerm : "",
        deliveryNote: typeof n.deliveryNote === "string" ? n.deliveryNote : "",
        additionalInfo: typeof n.additionalInfo === "string" ? n.additionalInfo : "",
        customPrices: (n.customPrices && typeof n.customPrices === "object") ? n.customPrices : {}
    };
}

// Stabilus JSON tekstas palyginimui (raktai išrikiuojami abėcėlės tvarka,
// kad raktų eiliškumas neturėtų reikšmės).
function stabilusJson(reiksme) {
    if (reiksme === null || typeof reiksme !== "object") return JSON.stringify(reiksme);
    if (Array.isArray(reiksme)) return "[" + reiksme.map(stabilusJson).join(",") + "]";
    return "{" + Object.keys(reiksme).sort().map(k => JSON.stringify(k) + ":" + stabilusJson(reiksme[k])).join(",") + "}";
}

// Įrašo dabartinius nustatymus (appSettings iš duomenys.js) į debesį.
// Grąžina Promise — funkcijos.js laukia rezultato prieš perkraudama puslapį.
async function issaugotiNustatymusDebesyje() {
    const dalis = paimtiSinchronizuojamus(appSettings);
    await set(ref(db, SETTINGS_KELIAS), {
        ...dalis,
        updatedAt: serverTimestamp(),
        appVersion: (typeof APP_VERSION !== "undefined") ? APP_VERSION : ""
    });
}

// Viešas „tiltas" į paprastus (ne modulinius) skriptus — funkcijos.js
window.houmyCloud = {
    pasiruoses: false,          // ar užsikrovus pavyko pasiekti debesį
    debesyjeYraDuomenu: false,  // ar debesyje jau yra išsaugoti nustatymai
    issaugotiNustatymus: issaugotiNustatymusDebesyje
};

// Užsikrovus puslapiui — parsisiunčiam nustatymus iš debesies ir pritaikom.
(async function sinchronizuotiUzsikrovus() {
    try {
        const snap = await get(ref(db, SETTINGS_KELIAS));
        window.houmyCloud.pasiruoses = true;

        if (!snap.exists()) {
            console.log("HOUMY debesis: nustatymų dar nėra. Jie bus sukurti, kai admin panelėje bus paspausta Išsaugoti.");
            return;
        }
        window.houmyCloud.debesyjeYraDuomenu = true;

        const isDebesies = paimtiSinchronizuojamus(snap.val());
        const vietiniai = paimtiSinchronizuojamus(appSettings);

        if (stabilusJson(isDebesies) === stabilusJson(vietiniai)) {
            sessionStorage.removeItem("houmyCloudReload");
            console.log("HOUMY debesis: kainos ir nustatymai sutampa su vietiniais.");
            return;
        }

        // Debesies duomenys skiriasi — pritaikom juos vietoje (debesis yra „tiesa").
        // Prieš perrašant, ankstesni vietiniai nustatymai išsaugomi kaip atsarginė kopija.
        const buve = localStorage.getItem("houmySettings");
        if (buve) localStorage.setItem("houmySettingsAtsargine", buve);
        const atnaujinti = { ...appSettings, ...isDebesies };
        localStorage.setItem("houmySettings", JSON.stringify(atnaujinti));

        // Apsauga nuo begalinio perkrovimų ciklo: jei ką tik perkrovėm ir
        // duomenys vis tiek „skiriasi" — sustojam ir tik pranešam konsolėje.
        const paskutinis = parseInt(sessionStorage.getItem("houmyCloudReload") || "0", 10);
        if (Date.now() - paskutinis < 15000) {
            console.error("HOUMY debesis: nustatymai pritaikyti, bet perkrovimas ką tik įvyko — kartotinis perkrovimas stabdomas.");
            return;
        }
        sessionStorage.setItem("houmyCloudReload", String(Date.now()));
        console.log("HOUMY debesis: rastos naujesnės kainos/nustatymai — puslapis perkraunamas.");
        location.reload();
    } catch (klaida) {
        console.warn("HOUMY debesis nepasiekiamas — naudojami vietiniai nustatymai.", klaida);
    }
})();
