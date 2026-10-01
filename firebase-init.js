// ============================================================================
// firebase-init.js — Firebase ryšys ir kainų/nustatymų sinchronizacija
// tarp kompiuterių (HOUMY konfigūratorius).
//
// Veikimo principas:
//  1. Užsikrovus puslapiui, iš debesies (Realtime Database, kelias
//     "houmy_settings") parsisiunčiami bendri nustatymai.
//  2. Jei jie skiriasi nuo vietinių (localStorage) — pritaikomi iškart
//     (be puslapio perkrovimo) ir įsimenami naršyklėje.
//  3. Admin panelėje paspaudus „Išsaugoti" nustatymai įrašomi ir į debesį
//     (kviečiama iš funkcijos.js per window.houmyCloud.issaugotiNustatymus).
//
// Sinchronizuojami TIK bendri verslo duomenys: kainos (customPrices),
// gamybos terminas, pristatymo pastaba ir papildoma informacija.
// Sofos spalva ir kiti asmeniniai nustatymai lieka vietiniai.
// ============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getDatabase, ref, get, set, update, push, serverTimestamp, query, orderByChild, limitToLast } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
// Prisijungimo (Auth) biblioteka kraunama TIK kai jos reikia (administratoriui) —
// klientų puslapis jos nesisiunčia: greičiau ir be nereikalingų Google užklausų.
const AUTH_URL = "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

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
const PASIULYMU_KELIAS = "houmy_proposals";

// Kliento puslapis (klientams.html) prisijungimo nenaudoja visai.
const KLIENTO_REZIMAS = window.HOUMY_KLIENTO_REZIMAS === true;

let authModulis = null, auth = null;
async function gautiAuth() {
    if (!auth) {
        authModulis = await import(AUTH_URL);
        auth = authModulis.getAuth(fbApp);
        if (auth.authStateReady) await auth.authStateReady();
    }
    return auth;
}

// Administratorių sąrašas laikomas duomenų bazėje (houmy_admins), NE kode —
// el. paštai nematomi viešai. Raktas: el. paštas mažosiomis, taškai -> kableliai.
// Perskaityti galima tik SAVO įrašą, todėl pašalinis nieko nesužino.
function adminRaktas(pastas) {
    return String(pastas || "").toLowerCase().split(".").join(",");
}
async function arAdministratorius(vartotojas) {
    if (!vartotojas || !vartotojas.email || !vartotojas.emailVerified) return false;
    try {
        const snap = await get(ref(db, "houmy_admins/" + adminRaktas(vartotojas.email)));
        return snap.val() === true;
    } catch (e) {
        return false; // ne administratorius — taisyklės neleidžia net perskaityti
    }
}

// Prisijungimas per Google iškylantį langą. Grąžina true, jei prisijungė
// administratorius; kitaip — false (su paaiškinimu vartotojui).
async function prisijungtiAdmin() {
    let a;
    try { a = await gautiAuth(); } catch (e) {
        alert("Nepavyko įkelti prisijungimo — patikrinkite interneto ryšį ir bandykite dar kartą.");
        return false;
    }
    if (a.currentUser && await arAdministratorius(a.currentUser)) return true;
    try {
        const rezultatas = await authModulis.signInWithPopup(a, new authModulis.GoogleAuthProvider());
        const pastas = (rezultatas.user.email || "").toLowerCase();
        if (!await arAdministratorius(rezultatas.user)) {
            await authModulis.signOut(a);
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

// Įrašo TIK pakeistas kainas (admin panelė).
//   pakeitimai    — { raktas: nauja kaina arba null (grąžinti numatytąją) }
//   ankstesnes    — kainos, kurias šis langas matė atidarytas (appSettings.customPrices)
// Apsauga nuo seno lango: prieš įrašant patikrinama, ar debesyje keičiamų
// kainų niekas kitas nepakeitė nuo šio lango atidarymo. Jei pakeitė —
// neįrašoma nieko ir išmetama klaida su kodu "KONFLIKTAS" bei raktų sąrašu.
// Kitų (nekeistų) kainų šis įrašymas visai neliečia.
async function issaugotiKainuPakeitimusDebesyje(pakeitimai, ankstesnes) {
    const raktai = Object.keys(pakeitimai);
    if (!raktai.length) return;
    const snap = await get(ref(db, SETTINGS_KELIAS + "/customPrices"));
    const debesyje = snap.exists() ? snap.val() : {};
    const konfliktai = raktai.filter(k => {
        const buvo = (ankstesnes && ankstesnes[k] !== undefined) ? ankstesnes[k] : null;
        const dabar = debesyje[k] !== undefined ? debesyje[k] : null;
        return buvo !== dabar;
    });
    if (konfliktai.length) {
        const klaida = new Error("Kainas kol kas pakeitė kitas kompiuteris");
        klaida.kodas = "KONFLIKTAS";
        klaida.raktai = konfliktai;
        throw klaida;
    }
    const irasas = {
        updatedAt: serverTimestamp(),
        appVersion: (typeof APP_VERSION !== "undefined") ? APP_VERSION : ""
    };
    raktai.forEach(k => { irasas["customPrices/" + k] = pakeitimai[k]; });
    await update(ref(db, SETTINGS_KELIAS), irasas);
}

// Kainų keitimo istorija debesyje (houmy_kainu_istorija): matoma visiems
// administratoriams, su žyma, kas keitė. Įrašus galima tik pridėti.
const ISTORIJOS_KELIAS = "houmy_kainu_istorija";

async function irasytiKainuIstorijaDebesyje(pakeitimai) {
    if (!pakeitimai || !pakeitimai.length) return;
    const kas = (auth && auth.currentUser && auth.currentUser.email) || "";
    const irasas = {};
    pakeitimai.forEach(c => {
        const raktas = push(ref(db, ISTORIJOS_KELIAS)).key;
        irasas[raktas] = {
            laikas: serverTimestamp(),
            data: String(c.date || ""),
            raktas: String(c.item || ""),
            buvo: (typeof c.old === "number") ? c.old : String(c.old),
            tapo: (typeof c.new === "number") ? c.new : String(c.new),
            kas: kas
        };
    });
    await update(ref(db, ISTORIJOS_KELIAS), irasas);
}

// Grąžina naujausius istorijos įrašus (naujausi pirmi) programos formatu.
async function gautiKainuIstorijaDebesyje(kiek) {
    const snap = await get(query(ref(db, ISTORIJOS_KELIAS), orderByChild("laikas"), limitToLast(kiek || 300)));
    const sarasas = [];
    snap.forEach(v => {
        const x = v.val() || {};
        sarasas.push({ date: x.data, item: x.raktas, old: x.buvo, new: x.tapo, kas: x.kas, laikas: x.laikas });
    });
    return sarasas.sort((a, b) => (b.laikas || 0) - (a.laikas || 0));
}

// Mėnesinės technologijų patikros ataskaita (rašo serverio funkcija
// technologijuPatikra; skaityti gali tik administratoriai). null — dar nebuvo patikros.
async function gautiTechnologijuAtaskaitaDebesyje() {
    const snap = await get(ref(db, "houmy_technologijos"));
    return snap.exists() ? snap.val() : null;
}

// Įrašo TIK pasiūlymo tekstus (terminas, pristatymas, papildoma informacija).
// Kainų neliečia — todėl net iš seno lango sugeneruotas PDF kainų nepakeis.
async function issaugotiTekstusDebesyje() {
    const dalis = paimtiSinchronizuojamus(appSettings);
    await update(ref(db, SETTINGS_KELIAS), {
        prodTerm: dalis.prodTerm,
        deliveryNote: dalis.deliveryNote,
        additionalInfo: dalis.additionalInfo
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

// Įrašo kliento užklausą KARTU su jo sudėliotu variantu — vienu veiksmu
// (arba įrašomi abu, arba nė vienas: nebelieka „pamestų" variantų be užklausos).
// Grąžina pasiūlymo ID (nuorodai ?proposal=<ID>).
async function issaugotiUzklausaSuPasiulymuDebesyje(pasiulymas, uzklausa) {
    const versija = (typeof APP_VERSION !== "undefined") ? APP_VERSION : "";
    const pasiulymoId = push(ref(db, PASIULYMU_KELIAS)).key;
    const uzklausosId = push(ref(db, "houmy_uzklausos")).key;
    await update(ref(db), {
        [PASIULYMU_KELIAS + "/" + pasiulymoId]: { ...pasiulymas, createdAt: serverTimestamp(), version: versija },
        ["houmy_uzklausos/" + uzklausosId]: { ...uzklausa, proposalId: pasiulymoId, createdAt: serverTimestamp(), version: versija }
    });
    return pasiulymoId;
}

// Naujausios klientų užklausos (admin skydelis „📨 Užklausos"; skaityti gali
// tik administratoriai). Naujausios pirmos.
async function gautiUzklausasDebesyje(kiek) {
    const snap = await get(query(ref(db, "houmy_uzklausos"), orderByChild("createdAt"), limitToLast(kiek || 100)));
    const sarasas = [];
    snap.forEach(v => { sarasas.push({ id: v.key, ...(v.val() || {}) }); });
    return sarasas.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

// Viešas „tiltas" į paprastus (ne modulinius) skriptus — funkcijos.js
window.houmyCloud = {
    pasiruoses: false,          // ar užsikrovus pavyko pasiekti debesį
    debesyjeYraDuomenu: false,  // ar debesyje jau yra išsaugoti nustatymai
    vartotojas: null,           // prisijungusio vartotojo el. paštas (tik vidinėje programoje)
    issaugotiNustatymus: issaugotiNustatymusDebesyje,   // VISKAS iš karto — tik kainų importui
    issaugotiKainuPakeitimus: issaugotiKainuPakeitimusDebesyje,
    issaugotiTekstus: issaugotiTekstusDebesyje,
    irasytiKainuIstorija: irasytiKainuIstorijaDebesyje,
    gautiKainuIstorija: gautiKainuIstorijaDebesyje,
    gautiTechnologijuAtaskaita: gautiTechnologijuAtaskaitaDebesyje,
    issaugotiPasiulyma: issaugotiPasiulymaDebesyje,
    gautiPasiulyma: gautiPasiulymaDebesyje,
    issaugotiUzklausaSuPasiulymu: issaugotiUzklausaSuPasiulymuDebesyje,
    gautiUzklausas: gautiUzklausasDebesyje,
    prisijungtiAdmin: prisijungtiAdmin
};

// Vidinėje programoje sekame prisijungimo būseną (išlieka tarp apsilankymų).
if (!KLIENTO_REZIMAS) {
    gautiAuth().then(a => authModulis.onAuthStateChanged(a, (u) => {
        window.houmyCloud.vartotojas = u ? (u.email || "") : null;
    })).catch(e => console.warn("Prisijungimo biblioteka neįkelta:", e));
}

// Pritaiko debesies kainas/tekstus ŠIAME lange iškart — be puslapio perkrovimo
// (anksčiau kiekvienas naujas lankytojas po 2–3 s gaudavo perkrovimą).
//   irIsiminti — ar įrašyti ir į naršyklės atmintį (pasiūlymo peržiūroje — ne).
function pritaikytiNustatymusVietoje(isDebesies, irIsiminti) {
    appSettings = { ...appSettings, ...isDebesies };
    if (irIsiminti) {
        try {
            const buve = localStorage.getItem("houmySettings");
            if (buve) localStorage.setItem("houmySettingsAtsargine", buve);
            localStorage.setItem("houmySettings", JSON.stringify(appSettings));
        } catch (e) { /* naršyklė neleidžia atminties (pvz. įterptame lange) — kainos vis tiek pritaikytos */ }
    }
    if (typeof atnaujintiKainuRodyma === "function") atnaujintiKainuRodyma();
}

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
            console.log("HOUMY debesis: kainos ir nustatymai sutampa su vietiniais.");
            return;
        }
        // Debesies duomenys skiriasi — pritaikom iškart (debesis yra „tiesa").
        pritaikytiNustatymusVietoje(isDebesies, true);
        console.log("HOUMY debesis: pritaikytos naujausios kainos ir nustatymai.");
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

// Ar tai tikras komercinis pasiūlymas? Tik jei jį sukūrė prisijungęs
// administratorius (laukas admin, kurį duomenų bazė priima tik iš
// administratoriaus). Iki šios tvarkos sukurti pasiūlymai laikomi
// komerciniais kaip anksčiau — jau išsiųstos nuorodos nepasikeičia, o
// suklastoti senesnės datos nebeįmanoma (createdAt tikrina duomenų bazė).
const KOMERCINIU_PASIULYMU_RIBA = 1790746310186; // 2026-09-30 05:31 UTC
function yraKomercinis(p) {
    return p.admin === true || (typeof p.createdAt === "number" && p.createdAt < KOMERCINIU_PASIULYMU_RIBA);
}

function atvaizduotiKlientoPasiulyma(p) {
    const komercinis = yraKomercinis(p);
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
    // Matmenys perskaičiuojami ČIA pat: restoreState juos atnaujina tik po
    // 50 ms, todėl anksčiau būdavo paimami seni — „0 x 0 cm" arba kito,
    // anksčiau toje naršyklėje dėlioto baldo matmenys.
    if (typeof updateDimensions === "function") updateDimensions();
    const dims = (document.getElementById("dimension-display") || {}).innerHTML || "";
    const grupesTekstas = grSelect ? grSelect.options[grSelect.selectedIndex].text : "";

    // Kliento paties sudėliotame variante kaina perskaičiuojama pagal DABAR
    // galiojančias kainas — įrašyta suma ir sąrašas nenaudojami, todėl niekas
    // negali sukurti „HOUMY" puslapio su savo kaina ar tekstu.
    let breakdown = p.breakdown || [];
    let galutine = p.finalTotal;
    if (!komercinis && typeof surinktiPasiulymoDuomenis === "function") {
        const perskaiciuota = surinktiPasiulymoDuomenis();
        breakdown = perskaiciuota.breakdown;
        galutine = perskaiciuota.total;
    }

    let eilutes = "";
    breakdown.forEach(it => {
        eilutes += '<tr><td style="padding:6px 4px; border-bottom:1px solid #eee;">' + saugusTekstas(it.name) + '</td>' +
            '<td style="padding:6px 4px; border-bottom:1px solid #eee; text-align:center;">' + saugusTekstas(it.qty) + ' vnt.</td>' +
            '<td style="padding:6px 4px; border-bottom:1px solid #eee; text-align:right;"><b>' + saugusTekstas(it.unit * it.qty) + ' €</b></td></tr>';
    });

    let nuolaidaHtml = "";
    if (!komercinis) {
        // Kliento paties sudėliotas variantas: kaina orientacinė, nuolaidų nerodom
        nuolaidaHtml = '<div style="font-size:12px; color:#555; margin-bottom:6px;">Kaina orientacinė (pagal bazinę audinio grupę). Tikslią kainą nurodysime komerciniame pasiūlyme.</div>';
    } else if (p.manualPriceVal > 0 && p.manualPriceVal < p.total) {
        nuolaidaHtml = '<div style="font-size:12px; color:#d9534f; margin-bottom:6px;">Pradinė kaina: <s>' + p.total + ' €</s> — pritaikyta speciali kaina</div>';
    } else if (p.discountVal > 0) {
        nuolaidaHtml = '<div style="font-size:12px; color:#d9534f; margin-bottom:6px;">Pradinė kaina: <s>' + p.total + ' €</s> — pritaikyta ' + p.discountVal + '% nuolaida</div>';
    }

    let klientoInfo = "";
    if (komercinis && p.client) {
        if (p.client.name) klientoInfo += '<div><b>Klientas:</b> ' + saugusTekstas(p.client.name) + '</div>';
        if (p.client.project) klientoInfo += '<div><b>Projektas:</b> ' + saugusTekstas(p.client.project) + '</div>';
        if (p.client.designer) klientoInfo += '<div><b>Dizaineris:</b> ' + saugusTekstas(p.client.designer) + '</div>';
    }
    let audinys = "";
    if (komercinis && p.fabricName) audinys += '<div><b>Audinys:</b> ' + saugusTekstas(p.fabricName) + '</div>';
    if (grupesTekstas) audinys += '<div><b>Audinio grupė:</b> ' + saugusTekstas(grupesTekstas) + '</div>';

    let terminai = "";
    if (komercinis && p.term) terminai += '<div style="margin-top:4px;">• Gamybos terminas: <b>' + saugusTekstas(p.term) + '</b></div>';
    if (komercinis && p.delivery) terminai += '<div>• ' + saugusTekstas(p.delivery) + '</div>';
    if (komercinis && p.additionalInfo) terminai += '<div style="margin-top:4px; color:#555;">' + saugusTekstas(p.additionalInfo) + '</div>';

    const sidebar = document.getElementById("sidebar-right");
    if (sidebar) {
        sidebar.innerHTML =
            '<div style="font-family:\'Montserrat\',sans-serif; font-weight:900; font-size:26px; color:#111; letter-spacing:1px;">HOUMY</div>' +
            '<div style="font-size:13px; color:#007bff; font-weight:bold; margin:2px 0 12px 0;">' + (komercinis ? 'KOMERCINIS PASIŪLYMAS' : 'SUDĖLIOTAS VARIANTAS') + '</div>' +
            (klientoInfo ? '<div style="font-size:13px; color:#333; line-height:1.5; margin-bottom:10px;">' + klientoInfo + '</div>' : "") +
            (audinys ? '<div style="font-size:13px; color:#333; line-height:1.5; margin-bottom:10px; border-top:1px solid #eee; padding-top:8px;">' + audinys + '</div>' : "") +
            '<div style="font-size:13px; font-weight:bold; color:#333; margin-bottom:4px;">Sudėtis:</div>' +
            '<table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:10px;"><tbody>' + eilutes + '</tbody></table>' +
            (dims ? '<div style="font-size:12px; color:#555; margin-bottom:10px;">' + dims + '</div>' : "") +
            '<div style="border-top:2px solid #333; padding-top:8px;">' + nuolaidaHtml + kainosPVM(galutine) + '</div>' +
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
        // Kliento sudėliotam variantui kaina skaičiuojama pagal dabartines kainas —
        // parsisiunčiam jas (tik šiam langui, naršyklės atminties neliečiam).
        if (!yraKomercinis(p)) {
            try {
                const nust = await get(ref(db, SETTINGS_KELIAS));
                if (nust.exists()) pritaikytiNustatymusVietoje(paimtiSinchronizuojamus(nust.val()), false);
            } catch (e) { console.warn("Kainų gauti nepavyko — rodomos numatytosios.", e); }
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
