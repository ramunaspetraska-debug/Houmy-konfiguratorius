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

const SVETAINE = "https://ramunaspetraska-debug.github.io/Houmy-konfiguratorius/";
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
            busena: "zalia", pastabos: [], laiskas: false
        };
        const busenos = [];

        if (t.id === "node") {
            const p = NODE_PALAIKYMAS[e.versija];
            e.naujausia = Object.keys(NODE_PALAIKYMAS).sort((a, b) => b - a)[0];
            if (!p) {
                busenos.push("geltona");
                e.pastabos.push("Nežinomos šios versijos palaikymo datos — atnaujinti NODE_PALAIKYMAS sąrašą.");
            } else {
                e.palaikomaIki = p.palaikomaIki;
                e.isjungiama = p.isjungiama;
                const d = dienuIki(p.palaikomaIki, dabar);
                if (d < 0) {
                    busenos.push("raudona"); e.laiskas = true;
                    e.pastabos.push("Google palaikymas baigėsi " + p.palaikomaIki + ". Nuo " + p.isjungiama +
                        " funkcijų nebeleis keisti, vėliau gali išjungti — užklausų laiškai nustotų veikti. Perkelti į naujesnę Node.js versiją.");
                } else if (d <= 90) {
                    busenos.push("raudona"); e.laiskas = true;
                    e.pastabos.push("Iki palaikymo pabaigos liko " + d + " d. — perkelti į naujesnę Node.js versiją.");
                } else if (d <= 180) {
                    busenos.push("geltona");
                    e.pastabos.push("Iki palaikymo pabaigos liko " + d + " d. — suplanuoti perkėlimą.");
                }
            }
            if (Number(e.naujausia) > Number(e.versija) && !e.laiskas) {
                e.pastabos.push("Google jau siūlo ir Node.js " + e.naujausia + " (neskubu — dabartinė palaikoma iki " + (e.palaikomaIki || "?") + ").");
            }
        } else {
            e.naujausia = naujausios[t.id];
            if (!e.versija) {
                busenos.push("geltona");
                e.pastabos.push("Nepavyko nustatyti naudojamos versijos.");
            }
            if (!e.naujausia) {
                busenos.push("geltona");
                e.pastabos.push("Nepavyko sužinoti naujausios versijos (npm registras nepasiekiamas).");
            } else if (e.versija && pagrindine(e.naujausia) > pagrindine(e.versija)) {
                busenos.push("geltona");
                e.pastabos.push("Išleista nauja pagrindinė versija " + e.naujausia +
                    " — verta atnaujinti per artimiausius mėnesius (gali reikėti kodo pakeitimų ir patikrinimo).");
            } else if (e.versija && e.naujausia !== e.versija) {
                e.pastabos.push("Yra smulkus atnaujinimas " + e.naujausia + " (neskubu).");
            }
            const savos = spragos[t.npm] || [];
            if (savos.length) {
                busenos.push(savos.some(s => SUNKIOS.includes(s.severity)) ? "raudona" : "geltona");
                e.laiskas = true;
                e.pastabos.push("Žinomos saugumo spragos šioje versijoje:");
                e.pastabos.push(...spraguAprasas(savos));
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
        busena: "zalia", pastabos: [], laiskas: false
    };
    if (netiesiogines.length) {
        const visos = netiesiogines.flatMap(([vardas, s]) => s.map(x => ({ ...x, vardas })));
        const rimtos = visos.some(s => SUNKIOS.includes(s.severity));
        kitos.busena = rimtos ? "raudona" : "geltona";
        kitos.laiskas = rimtos;
        kitos.pastabos.push(rimtos
            ? "Rimta spraga — patikrinti, ar yra pataisytos pagrindinių bibliotekų versijos."
            : "Nerimtos spragos. Pataiso bibliotekų gamintojai — dažniausiai užtenka laukti ir kartu su kitais atnaujinimais paleisti „npm update\".");
        kitos.pastabos.push(...visos.map(s => s.vardas + " — " + s.severity + ": " + s.title + " (" + s.url + ")"));
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

// Laiško apie reikalingus veiksmus turinys
function laiskoTurinys(ataskaita) {
    const reikia = ataskaita.eilutes.filter(e => e.laiskas);
    const tema = "HOUMY konfigūratorius: reikia atnaujinti technologijas (" + reikia.length + ")";
    const tekstas =
        "Mėnesinė HOUMY konfigūratoriaus technologijų patikra rado dalykų, kuriuos reikia sutvarkyti:\n\n" +
        reikia.map(e => ZENKLAS[e.busena] + " " + e.pavadinimas + " (naudojama " + (e.versija || "?") + ")\n   " +
            e.pastabos.join("\n   ")).join("\n\n") +
        "\n\nPerduokite šį laišką programuotojui (ar Claude) — jis žinos, ką daryti.\n" +
        "Visą sąrašą matysite konfigūratoriaus administravimo skydelyje → „🔧 Technologijos\".";
    const html =
        `<div lang="lt" translate="no" class="notranslate" style="font-family:Arial,sans-serif; font-size:14px; color:#222; line-height:1.5;">` +
        `<h2 style="margin:0 0 8px 0;">Reikia atnaujinti technologijas</h2>` +
        `<p>Mėnesinė HOUMY konfigūratoriaus patikra rado dalykų, kuriuos reikia sutvarkyti:</p>` +
        reikia.map(e =>
            `<div style="margin:12px 0; padding:10px 12px; border:1px solid #ddd; border-radius:6px;">` +
            `<b>${ZENKLAS[e.busena]} ${saugu(e.pavadinimas)}</b> <span style="color:#666;">(naudojama ${saugu(e.versija || "?")}` +
            (e.naujausia ? `, naujausia ${saugu(e.naujausia)}` : "") + `)</span>` +
            `<ul style="margin:6px 0 0 0; padding-left:18px;">` + e.pastabos.map(p => `<li>${saugu(p)}</li>`).join("") + `</ul></div>`
        ).join("") +
        `<p>Perduokite šį laišką programuotojui (ar Claude) — jis žinos, ką daryti.</p>` +
        `<p style="font-size:12px; color:#888;">Visą sąrašą matysite konfigūratoriaus administravimo skydelyje → „🔧 Technologijos". ` +
        `Šį laišką siunčia automatinė patikra kiekvieno mėnesio 1 d., tik kai reikia ką nors daryti.</p></div>`;
    return { tema, tekstas, html };
}

module.exports = { patikrinti, laiskoTurinys };
