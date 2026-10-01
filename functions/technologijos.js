// ============================================================================
// Naudojamų technologijų sąrašas ir mėnesinė jų patikra
// (kviečia index.js → technologijuPatikra; ataskaita rodoma admin skydelyje
// „🔧 Technologijos").
//
// RANKA ATNAUJINTI REIKIA TIK:
//   - NODE_PALAIKYMAS — kai Google paskelbia naujų Node.js versijų datas;
//   - TECHNOLOGIJOS   — kai pridedama ar pašalinama biblioteka.
// Versijų numeriai čia NErašomi — jie nuskaitomi automatiškai: serverio —
// iš package.json / package-lock.json, naršyklės — iš gyvos svetainės failų.
// ============================================================================

const SVETAINE = "https://konfiguratorius.houmy.lt/";
const DIENA = 24 * 60 * 60 * 1000;

// Google Cloud Functions Node.js palaikymas.
// Šaltinis: https://docs.cloud.google.com/functions/docs/runtime-support (tikrinta 2026-09-30)
//   palaikomaIki — nuo šios datos versija pasenusi (Google nebeatnaujina);
//   isjungiama   — nuo šios datos funkcijų nebeleidžiama keisti, vėliau gali būti išjungtos.
const NODE_PALAIKYMAS = {
    "20": { palaikomaIki: "2026-04-30", isjungiama: "2026-10-30" },
    "22": { palaikomaIki: "2027-04-30", isjungiama: "2027-10-31" },
    "24": { palaikomaIki: "2028-04-30", isjungiama: "2028-10-31" }
};
const NODE_SALTINIS = "https://docs.cloud.google.com/functions/docs/runtime-support";

const TECHNOLOGIJOS = [
    { id: "node", pavadinimas: "Node.js (Google serverio aplinka)", kur: "serveris",
      paskirtis: "Visos serverio funkcijos: užklausų laiškai, senų užklausų valymas, ši patikra" },
    { id: "firebase-functions", npm: "firebase-functions", pavadinimas: "Firebase Functions", kur: "serveris",
      paskirtis: "Serverio funkcijų pagrindas" },
    { id: "firebase-admin", npm: "firebase-admin", pavadinimas: "Firebase Admin", kur: "serveris",
      paskirtis: "Senų užklausų trynimas, šios ataskaitos įrašymas" },
    { id: "nodemailer", npm: "nodemailer", pavadinimas: "Nodemailer", kur: "serveris",
      paskirtis: "Laiškų siuntimas per Gmail (užklausos, įspėjimai)" },
    { id: "firebase", npm: "firebase", pavadinimas: "Firebase (naršyklėje)", kur: "naršyklė",
      paskirtis: "Kainos iš debesies, pasiūlymai, administratoriaus prisijungimas" },
    { id: "html2canvas", npm: "html2canvas", pavadinimas: "html2canvas", kur: "naršyklė",
      paskirtis: "Brėžinio nuotrauka PDF ir paveikslėliams",
      pastaba: "Kūrėjas naujų versijų neleidžia nuo 2022 m. Kol spragų nėra — viskas gerai; atsiradus spragai reikės pakaitalo." }
];

const SUNKIOS = ["critical", "high"];

function dienuIki(data, dabar) {
    return Math.floor((Date.parse(data + "T00:00:00Z") - dabar) / DIENA);
}
function pagrindine(v) {
    return parseInt(String(v || "").split(".")[0], 10) || 0;
}
async function gauti(url, parinktys) {
    const atsakas = await fetch(url, { ...parinktys, signal: AbortSignal.timeout(20000) });
    if (!atsakas.ok) throw new Error(url + " grąžino " + atsakas.status);
    return atsakas;
}
function spraguAprasas(spragos) {
    return spragos.map(s => s.severity + ": " + s.title + " (" + s.url + ")");
}
function blogiausia(busenos) {
    if (busenos.includes("raudona")) return "raudona";
    if (busenos.includes("geltona")) return "geltona";
    return "zalia";
}

// Grąžina ataskaitą { tikrinta, eilutes[], reikiaVeiksmu }.
// Kiekviena eilutė: busena (zalia/geltona/raudona), pastabos[], laiskas (ar dėl
// jos siųsti laišką). Laiškas siunčiamas tik kai reikia veikti:
//   - iki Node.js palaikymo pabaigos liko ≤ 90 d. (arba jau baigėsi);
//   - rimta (high/critical) spraga bet kurioje bibliotekoje;
//   - bet kokia spraga TIESIOGIAI naudojamoje bibliotekoje (ją galime atnaujinti patys).
async function patikrinti(bandymui = {}) {
    // bandymui: { dabar, versijos: {id: "x.y.z"} } — tik patikrinimui, ar
    // patikra teisingai pastebi senas versijas (serveryje nenaudojama)
    const dabar = bandymui.dabar || Date.now();
    const pkg = require("./package.json");
    const lock = require("./package-lock.json");

    // --- Naudojamos versijos ---
    const versijos = { node: String(pkg.engines && pkg.engines.node || "") };
    TECHNOLOGIJOS.filter(t => t.kur === "serveris" && t.npm).forEach(t => {
        versijos[t.id] = (lock.packages["node_modules/" + t.npm] || {}).version || null;
    });
    const [fbInit, indexHtml] = await Promise.all([
        gauti(SVETAINE + "firebase-init.js?t=" + dabar).then(a => a.text()),
        gauti(SVETAINE + "index.html?t=" + dabar).then(a => a.text())
    ]);
    versijos.firebase = (fbInit.match(/firebasejs\/(\d+\.\d+\.\d+)\//) || [])[1] || null;
    versijos.html2canvas = (indexHtml.match(/html2canvas\/(\d+\.\d+\.\d+)\//) || [])[1] || null;
    Object.assign(versijos, bandymui.versijos || {});

    // --- Naujausios versijos (npm registras) ---
    const npmTech = TECHNOLOGIJOS.filter(t => t.npm);
    const naujausios = {};
    const rezultatai = await Promise.allSettled(npmTech.map(t =>
        gauti("https://registry.npmjs.org/" + t.npm + "/latest").then(a => a.json())));
    rezultatai.forEach((r, i) => { naujausios[npmTech[i].id] = r.status === "fulfilled" ? r.value.version : null; });

    // --- Žinomos saugumo spragos (tas pats šaltinis kaip „npm audit") ---
    const uzklausa = {};
    const pridetiVersija = (vardas, versija) => {
        if (!vardas || !versija) return;
        uzklausa[vardas] = uzklausa[vardas] || [];
        if (!uzklausa[vardas].includes(versija)) uzklausa[vardas].push(versija);
    };
    Object.entries(lock.packages).forEach(([kelias, info]) => {
        if (!kelias.includes("node_modules/")) return;
        pridetiVersija(kelias.slice(kelias.lastIndexOf("node_modules/") + 13), info.version);
    });
    pridetiVersija("firebase", versijos.firebase);
    pridetiVersija("html2canvas", versijos.html2canvas);
    npmTech.forEach(t => { if ((bandymui.versijos || {})[t.id]) uzklausa[t.npm] = [versijos[t.id]]; });
    const spragos = await gauti("https://registry.npmjs.org/-/npm/v1/security/advisories/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(uzklausa)
    }).then(a => a.json());

    // --- Eilutės ---
    const eilutes = [];
    const tiesioginiai = new Set(npmTech.map(t => t.npm));

    TECHNOLOGIJOS.forEach(t => {
        const e = {
            id: t.id, pavadinimas: t.pavadinimas, paskirtis: t.paskirtis, kur: t.kur,
            versija: versijos[t.id] || null, naujausia: null,
            palaikomaIki: null, isjungiama: null,
            saltinis: t.npm ? "https://www.npmjs.com/package/" + t.npm : NODE_SALTINIS,
            busena: "zalia", pastabos: [], laiskas: false,
            kaDaryti: null, skubumas: null, techninis: []
        };
        const busenos = [];

        if (t.id === "node") {
            const p = NODE_PALAIKYMAS[e.versija];
            e.naujausia = Object.keys(NODE_PALAIKYMAS).sort((a, b) => b - a)[0];
            if (!p) {
                busenos.push("geltona");
                e.pastabos.push("Nežinomos šios versijos palaikymo datos.");
                e.kaDaryti = "Papildyti NODE_PALAIKYMAS sąrašą (functions/technologijos.js).";
            } else {
                e.palaikomaIki = p.palaikomaIki;
                e.isjungiama = p.isjungiama;
                const d = dienuIki(p.palaikomaIki, dabar);
                if (d < 0) {
                    busenos.push("raudona"); e.laiskas = true;
                    e.pastabos.push("Google šios versijos nebepalaiko nuo " + p.palaikomaIki + ". Nuo " + p.isjungiama +
                        " serverio funkcijos gali būti išjungtos — tada nustotų ateiti klientų užklausų laiškai.");
                    e.skubumas = "skubiai";
                } else if (d <= 90) {
                    busenos.push("raudona"); e.laiskas = true;
                    e.pastabos.push("Google palaikymas baigiasi " + p.palaikomaIki + " (liko " + d + " d.). Vėliau serverio funkcijos gali būti išjungtos.");
                    e.skubumas = "iki " + p.palaikomaIki;
                } else if (d <= 180) {
                    busenos.push("geltona");
                    e.pastabos.push("Google palaikymas baigiasi " + p.palaikomaIki + " (liko " + d + " d.) — verta suplanuoti.");
                }
                if (busenos.length) e.kaDaryti = "Perkelti serverio funkcijas į Node.js " + e.naujausia + ".";
            }
            if (Number(e.naujausia) > Number(e.versija) && !busenos.length) {
                e.pastabos.push("Google jau siūlo ir Node.js " + e.naujausia + " — neskubu, dabartinė palaikoma iki " + (e.palaikomaIki || "?") + ".");
            }
        } else {
            e.naujausia = naujausios[t.id];
            const savos = spragos[t.npm] || [];
            if (!e.versija) {
                busenos.push("geltona");
                e.pastabos.push("Nepavyko nustatyti naudojamos versijos.");
            }
            if (!e.naujausia) {
                busenos.push("geltona");
                e.pastabos.push("Nepavyko sužinoti naujausios versijos (npm registras nepasiekiamas).");
            } else if (e.versija && pagrindine(e.naujausia) > pagrindine(e.versija)) {
                busenos.push("geltona");
                if (!savos.length) e.pastabos.push("Išleista nauja versija " + e.naujausia + " — verta atnaujinti per kelis mėnesius (gali reikėti pakeisti kodą).");
                e.kaDaryti = "Atnaujinti iki " + e.naujausia + " ir patikrinti, ar viskas veikia.";
            } else if (e.versija && e.naujausia !== e.versija) {
                e.pastabos.push("Yra smulkus atnaujinimas " + e.naujausia + " — neskubu.");
            }
            if (savos.length) {
                const rimtu = savos.filter(x => SUNKIOS.includes(x.severity)).length;
                busenos.push(rimtu ? "raudona" : "geltona");
                e.laiskas = true;
                e.pastabos.push("Šioje versijoje žinomos saugumo spragos: " + savos.length + " (iš jų rimtų: " + rimtu + ").");
                e.kaDaryti = "Atnaujinti iki " + (e.naujausia || "naujausios versijos") + ".";
                e.skubumas = rimtu ? "per 1–2 savaites" : "per mėnesį";
                e.techninis = spraguAprasas(savos);
            }
            if (t.pastaba) e.pastabos.push(t.pastaba);
        }
        e.busena = blogiausia(busenos);
        eilutes.push(e);
    });

    // Netiesioginės serverio bibliotekos (jas įsideda firebase-admin ir kt.)
    const netiesiogines = Object.entries(spragos).filter(([vardas]) => !tiesioginiai.has(vardas));
    const kitos = {
        id: "kitos", pavadinimas: "Kitos serverio bibliotekos", kur: "serveris",
        paskirtis: "Bibliotekos, kurias įsideda pagrindinės (tiesiogiai jų nenaudojame)",
        versija: null, naujausia: null, palaikomaIki: null, isjungiama: null, saltinis: null,
        busena: "zalia", pastabos: [], laiskas: false,
        kaDaryti: null, skubumas: null, techninis: []
    };
    if (netiesiogines.length) {
        const visos = netiesiogines.flatMap(([vardas, x]) => x.map(y => ({ ...y, vardas })));
        const rimtu = visos.filter(x => SUNKIOS.includes(x.severity)).length;
        kitos.busena = rimtu ? "raudona" : "geltona";
        kitos.laiskas = rimtu > 0;
        if (rimtu) {
            kitos.pastabos.push("Papildomose bibliotekose rastos saugumo spragos: " + visos.length + " (iš jų rimtų: " + rimtu + ").");
            kitos.kaDaryti = "Patikrinti, ar išleistos pataisytos Firebase bibliotekų versijos, ir atnaujinti.";
            kitos.skubumas = "per 1–2 savaites";
        } else {
            kitos.pastabos.push("Papildomose bibliotekose rasta nerimtų spragų: " + visos.length +
                ". Jas pataisys pačių bibliotekų gamintojai — jūsų veiksmų nereikia.");
        }
        kitos.techninis = visos.map(x => x.vardas + " — " + x.severity + ": " + x.title + " (" + x.url + ")");
    }
    eilutes.push(kitos);

    return {
        tikrinta: dabar,
        eilutes,
        reikiaVeiksmu: eilutes.filter(e => e.laiskas).length
    };
}

function saugu(str) {
    return String(str == null ? "" : str)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const ZENKLAS = { zalia: "🟢", geltona: "🟡", raudona: "🔴" };

// Laiškas apie reikalingus veiksmus: trumpai ir paprastai — kas, kodėl, ką
// daryti, iki kada. Techninis spragų sąrašas laiške NErodomas (jis admin
// skydelyje), kad laiškas būtų suprantamas ne programuotojui.
function laiskoTurinys(ataskaita) {
    const reikia = ataskaita.eilutes.filter(e => e.laiskas);
    const tema = "HOUMY konfigūratorius: reikia atnaujinti – " + reikia.map(e => e.pavadinimas).join(", ");
    const versijos = e => e.versija ? " (dabar " + e.versija + (e.naujausia ? ", naujausia " + e.naujausia : "") + ")" : "";
    const kaDaryti = e => e.kaDaryti.replace(/\.$/, "") + versijos(e) + ".";

    const tekstas =
        "Automatinė mėnesio patikra rado, ką reikia atnaujinti konfigūratoriuje.\n" +
        "Konfigūratorius veikia — tai priminimas, kad jis ir toliau veiktų saugiai.\n\n" +
        reikia.map(e =>
            ZENKLAS[e.busena] + " " + e.pavadinimas + " — " + e.paskirtis + "\n" +
            "   Kodėl: " + e.pastabos.join(" ") + "\n" +
            (e.kaDaryti ? "   Ką daryti: " + kaDaryti(e) + "\n" : "") +
            (e.skubumas ? "   Iki kada: " + e.skubumas + "\n" : "")
        ).join("\n") +
        "\nKĄ JUMS DARYTI: persiųskite šį laišką Claude (arba programuotojui) ir parašykite „atnaujink\". Daugiau nieko.\n\n" +
        "Techninės detalės — konfigūratoriaus administravimo skydelyje → „🔧 Technologijos\".\n" +
        "Šis laiškas siunčiamas automatiškai kiekvieno mėnesio 1 d., tik kai reikia ką nors daryti.";

    const eilute = (pavadinimas, reiksme) =>
        `<tr><td style="padding:3px 12px 3px 0; color:#666; vertical-align:top; white-space:nowrap;">${pavadinimas}</td><td style="padding:3px 0;">${reiksme}</td></tr>`;
    const html =
        `<div lang="lt" translate="no" class="notranslate" style="font-family:Arial,sans-serif; font-size:14px; color:#222; line-height:1.5; max-width:640px;">` +
        `<h2 style="margin:0 0 6px 0;">Reikia atnaujinti konfigūratoriaus programas</h2>` +
        `<p style="margin:0 0 14px 0;">Automatinė mėnesio patikra rado, ką reikia atnaujinti. <b>Konfigūratorius veikia</b> — tai priminimas, kad jis ir toliau veiktų saugiai.</p>` +
        reikia.map(e =>
            `<div style="margin:0 0 12px 0; padding:12px 14px; border:1px solid #ddd; border-left:4px solid ${e.busena === "raudona" ? "#dc3545" : "#f0ad4e"}; border-radius:6px;">` +
            `<div style="font-size:15px; margin-bottom:6px;"><b>${ZENKLAS[e.busena]} ${saugu(e.pavadinimas)}</b> <span style="color:#666;">— ${saugu(e.paskirtis)}</span></div>` +
            `<table style="border-collapse:collapse; font-size:14px;">` +
            eilute("Kodėl:", saugu(e.pastabos.join(" "))) +
            (e.kaDaryti ? eilute("Ką daryti:", saugu(kaDaryti(e))) : "") +
            (e.skubumas ? eilute("Iki kada:", "<b>" + saugu(e.skubumas) + "</b>") : "") +
            `</table></div>`
        ).join("") +
        `<div style="margin:16px 0; padding:12px 14px; background:#eef5ff; border:1px solid #b8daff; border-radius:6px;">` +
        `<b>Ką jums daryti:</b> persiųskite šį laišką Claude (arba programuotojui) ir parašykite „atnaujink". Daugiau nieko.</div>` +
        `<p style="font-size:12px; color:#888; margin:0;">Techninės detalės — konfigūratoriaus administravimo skydelyje → „🔧 Technologijos". ` +
        `Šis laiškas siunčiamas automatiškai kiekvieno mėnesio 1 d., tik kai reikia ką nors daryti.</p></div>`;
    return { tema, tekstas, html };
}

module.exports = { patikrinti, laiskoTurinys };
