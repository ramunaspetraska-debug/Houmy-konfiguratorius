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
import { getDatabase, ref, get, set, push, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

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
const auth = getAuth(fbApp);
const SETTINGS_KELIAS = "houmy_settings";
const PASIULYMU_KELIAS = "houmy_proposals";

// Administratorių sąrašas: tik šios Google paskyros gali atidaryti admin
// panelę ir įrašyti kainas į debesį (tą patį sąrašą saugo ir duomenų bazės
// taisyklės — apsauga veikia serverio pusėje, ne tik naršyklėje).
const ADMIN_PASTAI = ["ramunaspetraska@gmail.com", "info@houmy.lt", "info@praktiskibaldai.lt", "ciupaite.ingrida@gmail.com"];

// Prisijungimas per Google iškylantį langą. Grąžina true, jei prisijungė
// administratorius; kitaip — false (su paaiškinimu vartotojui).
async function prisijungtiAdmin() {
    const esamas = auth.currentUser;
    if (esamas && ADMIN_PASTAI.includes((esamas.email || "").toLowerCase())) return true;
    try {
        const rezultatas = await signInWithPopup(auth, new GoogleAuthProvider());
        const pastas = (rezultatas.user.email || "").toLowerCase();
        if (!ADMIN_PASTAI.includes(pastas)) {
            await signOut(auth);
            alert("Paskyra " + pastas + " neturi administratoriaus teisių.");
            return false;
        }
        return true;
    } catch (klaida) {
        console.error("Prisijungimo klaida:", klaida);
        const kodas = klaida && klaida.code;
        if (kodas === "auth/popup-closed-by-user" || kodas === "auth/cancelled-popup-request") {
            // vartotojas tiesiog uždarė langą — nieko nerodome
        } else if (kodas === "auth/popup-blocked") {
            alert("Naršyklė užblokavo prisijungimo langą. Leiskite iškylančius langus šiai svetainei ir bandykite dar kartą.");
        } else if (kodas === "auth/operation-not-allowed" || kodas === "auth/configuration-not-found") {
            alert("Google prisijungimas dar neįjungtas Firebase konsolėje (Authentication -> Sign-in method -> Google).");
        } else if (kodas === "auth/unauthorized-domain") {
            alert("Šis svetainės adresas dar neįtrauktas į leidžiamus domenus Firebase konsolėje (Authentication -> Settings -> Authorized domains).");
        } else {
            alert("Nepavyko prisijungti — bandykite dar kartą.");
        }
        return false;
    }
}

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

// Įrašo naują kliento pasiūlymą į debesį (houmy_proposals/<autoID>).
// Grąžina sugeneruotą <autoID>, kurį naudosim nuorodai ?proposal=<autoID>.
async function issaugotiPasiulymaDebesyje(pasiulymas) {
    const nauja = push(ref(db, PASIULYMU_KELIAS));
    await set(nauja, {
        ...pasiulymas,
        createdAt: serverTimestamp(),
        version: (typeof APP_VERSION !== "undefined") ? APP_VERSION : ""
    });
    return nauja.key;
}

// Nuskaito pasiūlymą pagal ID. Grąžina objektą arba null, jei nerastas.
async function gautiPasiulymaDebesyje(id) {
    const snap = await get(ref(db, PASIULYMU_KELIAS + "/" + id));
    return snap.exists() ? snap.val() : null;
}

// Įrašo kliento užklausą iš viešo konfigūratoriaus (houmy_uzklausos/<autoID>).
// Užklausų skaityti per internetą negalima — jas mato tik Ramūnas Firebase konsolėje.
async function issaugotiUzklausaDebesyje(uzklausa) {
    const nauja = push(ref(db, "houmy_uzklausos"));
    await set(nauja, {
        ...uzklausa,
        createdAt: serverTimestamp(),
        version: (typeof APP_VERSION !== "undefined") ? APP_VERSION : ""
    });
    return nauja.key;
}

// Viešas „tiltas" į paprastus (ne modulinius) skriptus — funkcijos.js
window.houmyCloud = {
    pasiruoses: false,          // ar užsikrovus pavyko pasiekti debesį
    debesyjeYraDuomenu: false,  // ar debesyje jau yra išsaugoti nustatymai
    vartotojas: null,           // prisijungusio administratoriaus el. paštas
    issaugotiNustatymus: issaugotiNustatymusDebesyje,
    issaugotiPasiulyma: issaugotiPasiulymaDebesyje,
    gautiPasiulyma: gautiPasiulymaDebesyje,
    issaugotiUzklausa: issaugotiUzklausaDebesyje,
    prisijungtiAdmin: prisijungtiAdmin
};

// Sekame prisijungimo būseną (išlieka tarp apsilankymų toje pačioje naršyklėje)
onAuthStateChanged(auth, (u) => {
    window.houmyCloud.vartotojas = u ? (u.email || "") : null;
});

// Ar dabar atidaromas kliento pasiūlymas (?proposal=<id>)? Tokiu atveju
// kainų sinchronizacijos NEvykdom (klientui rodom įrašytus pasiūlymo duomenis,
// o ne admin kainas, ir neliečiam kliento naršyklės atminties).
const yraPasiulymoParametras = new URLSearchParams(window.location.search).has("proposal");

// Užsikrovus puslapiui — parsisiunčiam nustatymus iš debesies ir pritaikom.
(async function sinchronizuotiUzsikrovus() {
    if (yraPasiulymoParametras) { window.houmyCloud.pasiruoses = true; return; }
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

// ============================================================================
// KLIENTO PASIŪLYMO PERŽIŪRA (?proposal=<id>) — tik skaitymui.
// Klientas mato baldą, matmenis, audinį ir galutinę kainą; negali redaguoti,
// matyti admin funkcijų ar kainų nustatymų.
// ============================================================================

function saugusTekstas(str) {
    return String(str == null ? "" : str)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function paslePtiKrovima() {
    document.documentElement.classList.add("houmy-proposal-ready");
    const ov = document.getElementById("houmy-proposal-loading");
    if (ov) ov.remove();
}

function rodytiPasiulymoPranesima(tekstas) {
    const ov = document.getElementById("houmy-proposal-loading");
    if (ov) {
        ov.innerHTML = '<div style="max-width:420px; text-align:center; padding:24px;">' +
            '<div style="font-family:\'Montserrat\',sans-serif; font-weight:900; font-size:34px; color:#111; letter-spacing:1px;">HOUMY</div>' +
            '<p style="margin-top:16px; font-size:16px; color:#444;">' + saugusTekstas(tekstas) + '</p>' +
            '<p style="margin-top:8px; font-size:13px; color:#999;">Susisiekite su mumis: +370 675 04607 · info@houmy.lt</p>' +
            '</div>';
    }
}

// Sudeda kainos „be PVM / PVM / su PVM" bloką (PVM 21%).
function kainosPVM(finalTotal) {
    const bePVM = (finalTotal / 1.21).toFixed(2);
    const pvmSuma = (finalTotal - bePVM).toFixed(2);
    return '<div style="font-size:11px; color:#555;">Suma be PVM: <b>' + bePVM.replace(".", ",") + ' €</b></div>' +
        '<div style="font-size:11px; color:#555; margin-bottom:4px;">PVM (21%): <b>' + pvmSuma.replace(".", ",") + ' €</b></div>' +
        '<div style="font-size:22px; font-weight:bold; color:#111; border-top:2px solid #333; padding-top:6px;">Viso su PVM: ' + finalTotal + ' €</div>';
}

function atvaizduotiKlientoPasiulyma(p) {
    // 1. Audinio grupė ir spalva — nustatom PRIEŠ piešiant, kad kainos/spalva sutaptų.
    const grSelect = document.getElementById("fabric-group-select");
    if (grSelect && p.fabricGroup) grSelect.value = String(p.fabricGroup);
    if (p.fabricColor) document.documentElement.style.setProperty("--sofa-color", p.fabricColor);

    // 2. Kambarys (jei klientas jį buvo nusibraižęs) — nustatom PRIEŠ piešiant,
    //    kad matmenų juostoje atsirastų atstumai iki sienų.
    if (typeof nustatytiKambariIsDuomenu === "function") {
        nustatytiKambariIsDuomenu(p.kambarys, false);
    }

    // 3. Piešiam baldą per esamą variklį (restoreState centruoja ir suskaičiuoja matmenis).
    if (typeof restoreState === "function" && Array.isArray(p.modules)) {
        restoreState(p.modules, true);
    }

    // 3. Sudarom švarų kliento skydelį dešinėje (perrašom visą turinį — dingsta
    //    spalvų paletė, mygtukai ir admin elementai).
    const dims = (document.getElementById("dimension-display") || {}).innerHTML || "";
    const grupesTekstas = grSelect ? grSelect.options[grSelect.selectedIndex].text : "";

    let eilutes = "";
    (p.breakdown || []).forEach(it => {
        eilutes += '<tr><td style="padding:6px 4px; border-bottom:1px solid #eee;">' + saugusTekstas(it.name) + '</td>' +
            '<td style="padding:6px 4px; border-bottom:1px solid #eee; text-align:center;">' + saugusTekstas(it.qty) + ' vnt.</td>' +
            '<td style="padding:6px 4px; border-bottom:1px solid #eee; text-align:right;"><b>' + saugusTekstas(it.unit * it.qty) + ' €</b></td></tr>';
    });

    let nuolaidaHtml = "";
    if (p.manualPriceVal > 0 && p.manualPriceVal < p.total) {
        nuolaidaHtml = '<div style="font-size:12px; color:#d9534f; margin-bottom:6px;">Pradinė kaina: <s>' + p.total + ' €</s> — pritaikyta speciali kaina</div>';
    } else if (p.discountVal > 0) {
        nuolaidaHtml = '<div style="font-size:12px; color:#d9534f; margin-bottom:6px;">Pradinė kaina: <s>' + p.total + ' €</s> — pritaikyta ' + p.discountVal + '% nuolaida</div>';
    }

    let klientoInfo = "";
    if (p.client) {
        if (p.client.name) klientoInfo += '<div><b>Klientas:</b> ' + saugusTekstas(p.client.name) + '</div>';
        if (p.client.project) klientoInfo += '<div><b>Projektas:</b> ' + saugusTekstas(p.client.project) + '</div>';
        if (p.client.designer) klientoInfo += '<div><b>Dizaineris:</b> ' + saugusTekstas(p.client.designer) + '</div>';
    }
    let audinys = "";
    if (p.fabricName) audinys += '<div><b>Audinys:</b> ' + saugusTekstas(p.fabricName) + '</div>';
    if (grupesTekstas) audinys += '<div><b>Audinio grupė:</b> ' + saugusTekstas(grupesTekstas) + '</div>';

    let terminai = "";
    if (p.term) terminai += '<div style="margin-top:4px;">• Gamybos terminas: <b>' + saugusTekstas(p.term) + '</b></div>';
    if (p.delivery) terminai += '<div>• ' + saugusTekstas(p.delivery) + '</div>';
    if (p.additionalInfo) terminai += '<div style="margin-top:4px; color:#555;">' + saugusTekstas(p.additionalInfo) + '</div>';

    const sidebar = document.getElementById("sidebar-right");
    if (sidebar) {
        sidebar.innerHTML =
            '<div style="font-family:\'Montserrat\',sans-serif; font-weight:900; font-size:26px; color:#111; letter-spacing:1px;">HOUMY</div>' +
            '<div style="font-size:13px; color:#007bff; font-weight:bold; margin:2px 0 12px 0;">KOMERCINIS PASIŪLYMAS</div>' +
            (klientoInfo ? '<div style="font-size:13px; color:#333; line-height:1.5; margin-bottom:10px;">' + klientoInfo + '</div>' : "") +
            (audinys ? '<div style="font-size:13px; color:#333; line-height:1.5; margin-bottom:10px; border-top:1px solid #eee; padding-top:8px;">' + audinys + '</div>' : "") +
            '<div style="font-size:13px; font-weight:bold; color:#333; margin-bottom:4px;">Sudėtis:</div>' +
            '<table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:10px;"><tbody>' + eilutes + '</tbody></table>' +
            (dims ? '<div style="font-size:12px; color:#555; margin-bottom:10px;">' + dims + '</div>' : "") +
            '<div style="border-top:2px solid #333; padding-top:8px;">' + nuolaidaHtml + kainosPVM(p.finalTotal) + '</div>' +
            (terminai ? '<div style="font-size:12px; color:#333; line-height:1.5; margin-top:12px; border-top:1px solid #eee; padding-top:8px;">' + terminai + '</div>' : "") +
            '<div style="font-size:11px; color:#999; margin-top:16px; border-top:1px solid #eee; padding-top:8px;">MB Praktiški baldai · Savanorių pr. 290, Kaunas<br>+370 675 04607 · info@houmy.lt</div>';
    }
}

(async function rodytiPasiulymaJeiReikia() {
    if (!yraPasiulymoParametras) return;
    const id = new URLSearchParams(window.location.search).get("proposal");
    try {
        const p = await gautiPasiulymaDebesyje(id);
        if (!p) {
            rodytiPasiulymoPranesima("Pasiūlymas nerastas arba nebegalioja.");
            return;
        }
        atvaizduotiKlientoPasiulyma(p);
        // Palaukiam, kol restoreState (setTimeout 50ms) atnaujins matmenis, ir atskleidžiam.
        setTimeout(paslePtiKrovima, 250);

        // Pasukus telefoną ar pakeitus lango dydį baldas piešiamas iš naujo,
        // kad visada liktų ekrano centre (kitaip liktų už matomos zonos).
        let persipiesimoLaikmatis = null;
        window.addEventListener("resize", () => {
            clearTimeout(persipiesimoLaikmatis);
            persipiesimoLaikmatis = setTimeout(() => {
                if (typeof restoreState === "function" && Array.isArray(p.modules)) {
                    restoreState(p.modules, true);
                }
            }, 300);
        });
    } catch (klaida) {
        console.error("HOUMY pasiūlymo įkėlimo klaida:", klaida);
        rodytiPasiulymoPranesima("Nepavyko įkelti pasiūlymo. Patikrinkite interneto ryšį arba bandykite vėliau.");
    }
})();
