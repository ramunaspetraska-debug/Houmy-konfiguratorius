// ============================================================================
// HOUMY konfigūratoriaus debesies funkcijos.
//
// uzklausoslaiskas — "robotas", kuris stebi duomenų bazės kelią
// houmy_uzklausos ir, atsiradus naujai kliento užklausai iš svetainės
// konfigūratoriaus, išsiunčia pranešimą el. paštu į info@houmy.lt.
//
// Prisijungimo prie Gmail duomenys laikomi Firebase slaptažodžių saugykloje
// (Secret Manager) — NE kode:
//   SMTP_PASTAS      — Gmail adresas, iš kurio siunčiama
//   SMTP_SLAPTAZODIS — to adreso "programos slaptažodis" (app password)
// ============================================================================

const { onValueCreated } = require("firebase-functions/v2/database");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const nodemailer = require("nodemailer");

const smtpPastas = defineSecret("SMTP_PASTAS");
const smtpSlaptazodis = defineSecret("SMTP_SLAPTAZODIS");

// Kam siunčiami pranešimai apie naujas užklausas
const GAVEJAS = "info@houmy.lt";
// Kliento dėlionės peržiūros adresas
const PERZIUROS_BAZE = "https://konfiguratorius.houmy.lt/";
// Duomenų bazės adresas (pasiūlymo moduliams nuskaityti)
const DB_BAZE = "https://houmy-konfiguratorius-eu.europe-west1.firebasedatabase.app";

// Paruošia REDAGAVIMO nuorodą: parsisiunčia kliento pasiūlymo modulius
// (viešas skaitymas pagal ID) ir užkoduoja juos tuo pačiu ?s= formatu,
// kurį supranta pilna programa — atsidaro redaguojama dėlionė.
async function redagavimoNuoroda(proposalId) {
    if (!proposalId) return null;
    try {
        const atsakas = await fetch(DB_BAZE + "/houmy_proposals/" + encodeURIComponent(proposalId) + ".json");
        if (!atsakas.ok) return null;
        const p = await atsakas.json();
        if (!p || !Array.isArray(p.modules) || !p.modules.length) return null;

        const cols = {};
        p.modules.forEach(m => {
            const c = m.c || "";
            if (!cols[c]) cols[c] = [];
            const x = Math.round(parseFloat(m.l) || 0);
            const y = Math.round(parseFloat(m.t) || 0);
            const a = parseInt(m.a) || 0;
            const e = (m.exp === true || m.exp === "true" || m.exp === 1) ? 1 : 0;
            cols[c].push(`${m.id},${x},${y},${a},${e}`);
        });
        const suspausta = Object.keys(cols).map(c => `${c}:${cols[c].join("!")}`).join("~");
        return PERZIUROS_BAZE + "?s=" + encodeURIComponent(Buffer.from(suspausta, "utf8").toString("base64"));
    } catch (klaida) {
        console.warn("Nepavyko paruošti redagavimo nuorodos:", klaida.message);
        return null;
    }
}

// Apsauga nuo HTML įterpimo į laišką (kliento įvestas tekstas rodomas kaip tekstas)
function saugu(str) {
    return String(str == null ? "" : str)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

exports.uzklausoslaiskas = onValueCreated(
    {
        ref: "/houmy_uzklausos/{uzklausosId}",
        instance: "houmy-konfiguratorius-eu",
        region: "europe-west1",
        secrets: [smtpPastas, smtpSlaptazodis],
        memory: "256MiB",
        maxInstances: 5
    },
    async (event) => {
        const u = event.data.val() || {};

        // --- Apsauga nuo šlamšto: ribojamas laiškų skaičius ---
        // Užklausa duomenų bazėje lieka VISADA (matoma Firebase konsolėje);
        // ribojamas tik laiškų siuntimas, kad robotas negalėtų užversti
        // info@houmy.lt ir išnaudoti Gmail dienos limito (~500 laiškų).
        // Kiekvienai užklausai pažymima laiško būsena (laiskas): issiustas /
        // sulaikytas / klaida. Neišsiųstas kas valandą surenka uzklausuPatikra ir
        // atsiunčia suvestine — todėl nei šlamštas, nei Gmail klaida nebepaslepia
        // tikrų klientų. Būsenas mato ir admin skydelis „📨 Užklausos".
        const pazymeti = (laukai) => event.data.ref.update(laukai)
            .catch(k => console.warn("Nepavyko pažymėti užklausos būsenos:", k.message));

        const VALANDA = 60 * 60 * 1000;
        const RIBA_VISO = 20;      // laiškų per valandą iš viso
        const RIBA_ADRESUI = 3;    // laiškų per valandą iš to paties el. pašto
        let skaiciusViso = 0, skaiciusAdresui = 0;
        try {
            const nuo = Date.now() - VALANDA;
            const pastas = String(u.email || "").trim().toLowerCase();
            // Parsisiunčiama ne daugiau kaip RIBA_VISO+2 įrašų — kad didelis šlamšto
            // kiekis nedidintų duomenų bazės išlaidų (anksčiau imta visa valanda).
            const naujausios = await event.data.ref.parent
                .orderByChild("createdAt").startAt(nuo).limitToFirst(RIBA_VISO + 2).once("value");
            naujausios.forEach(v => {
                skaiciusViso++;
                if (String((v.val() || {}).email || "").trim().toLowerCase() === pastas) skaiciusAdresui++;
            });
        } catch (klaida) {
            console.warn("Nepavyko suskaičiuoti naujausių užklausų — laiškas siunčiamas:", klaida.message);
        }

        const transporteris = gautiTransporteri();

        if (skaiciusViso > RIBA_VISO) {
            await pazymeti({ laiskas: "sulaikytas" });
            // Vienas įspėjimas, kai riba viršijama pirmą kartą per valandą
            if (skaiciusViso === RIBA_VISO + 1) {
                await transporteris.sendMail({
                    from: `"HOUMY konfigūratorius" <${smtpPastas.value()}>`,
                    to: GAVEJAS,
                    subject: "DĖMESIO: per valandą gauta daugiau nei " + RIBA_VISO + " užklausų",
                    text: "Per paskutinę valandą konfigūratorius gavo daugiau nei " + RIBA_VISO +
                        " užklausų. Tai gali būti automatinis šlamštas.\n\n" +
                        "Atskiri laiškai šią valandą sulaikomi, bet visos užklausos išsaugotos: " +
                        "jų suvestinę atsiųsime atskiru laišku, jas matysite ir admin skydelyje („📨 Užklausos“)."
                }).catch(k => console.error("Įspėjimo laiško klaida:", k.message));
            }
            console.warn("Laiškų riba viršyta (" + skaiciusViso + "/val.) — laiškas sulaikytas:", event.params.uzklausosId);
            return;
        }
        if (skaiciusAdresui > RIBA_ADRESUI) {
            await pazymeti({ laiskas: "sulaikytas" });
            console.warn("To paties adreso riba viršyta (" + skaiciusAdresui + "/val.) — laiškas sulaikytas:", event.params.uzklausosId);
            return;
        }

        const kolekcija = (u.collection || "").toUpperCase();
        const suma = (typeof u.total === "number") ? u.total + " €" : "—";
        const vardas = u.name || "nenurodytas";
        const perziura = u.proposalId ? PERZIUROS_BAZE + "?proposal=" + encodeURIComponent(u.proposalId) : null;
        const redagavimas = await redagavimoNuoroda(u.proposalId);

        const tema = `Nauja užklausa iš konfigūratoriaus: ${kolekcija || "?"} — ${suma} (${vardas})`;

        const eilutes = [
            ["Vardas", u.name],
            ["El. paštas", u.email],
            ["Telefonas", u.phone],
            ["Kolekcija", kolekcija],
            ["Suma", suma],
            ["Komentaras", u.comment]
        ].filter(e => e[1]);

        // lang="lt" + translate="no" + notranslate klasė: apsauga nuo Gmail
        // automatinio vertėjo, kuris CORE paversdavo „ŠERDIS", Suma — „Papildymas".
        const html =
            `<div lang="lt" translate="no" class="notranslate" style="font-family:Arial,sans-serif; font-size:14px; color:#222; line-height:1.6;">` +
            `<h2 style="margin:0 0 4px 0;">Nauja užklausa iš houmy.lt konfigūratoriaus</h2>` +
            `<table style="border-collapse:collapse; margin:12px 0;">` +
            eilutes.map(e =>
                `<tr><td style="padding:4px 14px 4px 0; color:#666;">${saugu(e[0])}:</td>` +
                `<td style="padding:4px 0;"><b>${saugu(e[1])}</b></td></tr>`).join("") +
            `</table>` +
            (perziura
                ? `<p style="margin:16px 0 6px 0;">` +
                  `<a href="${saugu(perziura)}" style="display:inline-block; padding:10px 18px; background:#111; color:#fff; text-decoration:none; border-radius:6px; margin:0 8px 8px 0;">Peržiūrėti kliento sudėliotą variantą</a>` +
                  (redagavimas
                      ? `<a href="${saugu(redagavimas)}" style="display:inline-block; padding:10px 18px; background:#007bff; color:#fff; text-decoration:none; border-radius:6px; margin:0 0 8px 0;">✏️ Redaguoti programoje</a>`
                      : "") +
                  `</p>` +
                  `<p style="font-size:12px; color:#888;">Peržiūra: ${saugu(perziura)}</p>` +
                  (redagavimas ? `<p style="font-size:12px; color:#888;">Redagavimas (atsidaro pilnoje programoje — galite koreguoti ir iškart paruošti pasiūlymą): ${saugu(redagavimas)}</p>` : "")
                : "") +
            `<p style="font-size:12px; color:#888;">Atsakyti klientui galite tiesiog paspaudę „Atsakyti / Reply" — laiškas nukeliaus adresu ${saugu(u.email || "?")}.</p>` +
            `</div>`;

        const tekstas =
            "Nauja užklausa iš houmy.lt konfigūratoriaus\n\n" +
            eilutes.map(e => e[0] + ": " + e[1]).join("\n") +
            (perziura ? "\n\nKliento variantas (peržiūra): " + perziura : "") +
            (redagavimas ? "\nRedagavimas pilnoje programoje: " + redagavimas : "");

        try {
            await transporteris.sendMail({
                from: `"HOUMY konfigūratorius" <${smtpPastas.value()}>`,
                to: GAVEJAS,
                replyTo: u.email || undefined,
                subject: tema,
                text: tekstas,
                html: html
            });
        } catch (klaida) {
            // Užklausa neprarandama: ją po valandos atsiųs suvestinė (uzklausuPatikra)
            console.error("Užklausos laiško klaida:", event.params.uzklausosId, klaida.message);
            await pazymeti({ laiskas: "klaida" });
            return;
        }
        await pazymeti({ laiskas: "issiustas" });
        console.log("Užklausos pranešimas išsiųstas:", event.params.uzklausosId);

        // Klientas pats pažymėjo „Atsiųsti man šio varianto nuorodą el. paštu".
        // Laiško tekstas FIKSUOTAS (be kliento įvesto teksto), siunčiamas tik
        // pirmą kartą per valandą tam adresui — kad niekas negalėtų mūsų pašto
        // naudoti šlamštui siųsti.
        if (u.kopija === true && perziura && skaiciusAdresui <= 1) {
            try {
                await transporteris.sendMail({
                    from: `"HOUMY" <${smtpPastas.value()}>`,
                    to: u.email,
                    subject: "Jūsų HOUMY sofos variantas",
                    text: "Sveiki,\n\nDėkojame už užklausą. Jūsų sudėliotą HOUMY sofos variantą galite peržiūrėti čia:\n" +
                        perziura + "\n\nNetrukus susisieksime dėl pasiūlymo.\n\n" +
                        "HOUMY komanda · MB „Praktiški baldai\"\n+370 675 04607 · info@houmy.lt\n\n" +
                        "Šį laišką gavote, nes HOUMY konfigūratoriuje paprašėte atsiųsti savo varianto nuorodą.",
                    html: `<div lang="lt" style="font-family:Arial,sans-serif; font-size:15px; color:#222; line-height:1.6; max-width:560px;">` +
                        `<p>Sveiki,</p><p>Dėkojame už užklausą. Jūsų sudėliotą HOUMY sofos variantą galite peržiūrėti čia:</p>` +
                        `<p><a href="${saugu(perziura)}" style="display:inline-block; padding:12px 20px; background:#111; color:#fff; text-decoration:none; border-radius:6px;">Peržiūrėti mano variantą</a></p>` +
                        `<p>Netrukus susisieksime dėl pasiūlymo.</p>` +
                        `<p style="color:#555;">HOUMY komanda · MB „Praktiški baldai"<br>+370 675 04607 · info@houmy.lt</p>` +
                        `<p style="font-size:12px; color:#888;">Šį laišką gavote, nes HOUMY konfigūratoriuje paprašėte atsiųsti savo varianto nuorodą.</p></div>`
                });
                await pazymeti({ kopijosLaiskas: "issiustas" });
            } catch (klaida) {
                console.warn("Kliento kopijos laiško klaida:", klaida.message);
                await pazymeti({ kopijosLaiskas: "klaida" });
            }
        }
    }
);

// Gmail siuntėjas (prisijungimas iš slaptažodžių saugyklos)
function gautiTransporteri() {
    return nodemailer.createTransport({
        service: "gmail",
        auth: { user: smtpPastas.value(), pass: smtpSlaptazodis.value() }
    });
}

// Administratoriaus duomenų bazė (įkeliama tik kai reikia — nelėtina paleidimo)
function gautiDb() {
    const { initializeApp, getApps } = require("firebase-admin/app");
    const { getDatabaseWithUrl } = require("firebase-admin/database");
    if (!getApps().length) initializeApp();
    return getDatabaseWithUrl(DB_BAZE);
}

// ============================================================================
// uzklausuPatikra — kas valandą surenka užklausas, apie kurias laiškas NEišėjo
// (viršyta šlamšto riba, Gmail klaida ar funkcijos gedimas), ir atsiunčia jų
// suvestinę į info@houmy.lt. Taip tikras klientas neprarandamas.
// ============================================================================
// Užklausos iki šios datos būsenų neturėjo — jų nelaikom „neišsiųstomis".
const BUSENU_PRADZIA = Date.parse("2026-10-01T10:40:00Z");

exports.uzklausuPatikra = onSchedule(
    {
        schedule: "15 * * * *",
        timeZone: "Europe/Vilnius",
        region: "europe-west1",
        secrets: [smtpPastas, smtpSlaptazodis],
        memory: "256MiB",
        maxInstances: 1
    },
    async () => {
        const db = gautiDb();
        const dabar = Date.now();
        const snap = await db.ref("houmy_uzklausos").orderByChild("createdAt")
            .startAt(dabar - 7 * 24 * 60 * 60 * 1000).limitToLast(500).once("value");
        const neissiustos = [];
        snap.forEach(v => {
            const u = v.val() || {};
            const sulaikyta = u.laiskas === "sulaikytas" || u.laiskas === "klaida";
            const dingusi = !u.laiskas && typeof u.createdAt === "number" &&
                u.createdAt > BUSENU_PRADZIA && u.createdAt < dabar - 15 * 60 * 1000;
            if (sulaikyta || dingusi) neissiustos.push({ id: v.key, ...u });
        });
        if (!neissiustos.length) return;

        const rodomos = neissiustos.slice(0, 50);
        const nuoroda = u => u.proposalId ? PERZIUROS_BAZE + "?proposal=" + encodeURIComponent(u.proposalId) : "";
        const laikas = t => new Date(t).toLocaleString("lt-LT", { timeZone: "Europe/Vilnius" });
        const tekstas = "Šių užklausų laiškai anksčiau NEišėjo (šlamšto riba arba pašto klaida). Peržiūrėkite — tarp jų gali būti tikrų klientų:\n\n" +
            rodomos.map(u => `• ${laikas(u.createdAt)} — ${u.name || "be vardo"}, ${u.email || ""}${u.phone ? ", " + u.phone : ""}, ` +
                `${(u.collection || "").toUpperCase()} ${typeof u.total === "number" ? u.total + " €" : ""}` +
                (u.comment ? `\n  Komentaras: ${String(u.comment).slice(0, 300)}` : "") +
                (nuoroda(u) ? `\n  Variantas: ${nuoroda(u)}` : "")).join("\n\n") +
            (neissiustos.length > rodomos.length ? `\n\n…ir dar ${neissiustos.length - rodomos.length}. Visas matysite admin skydelyje („📨 Užklausos").` : "");

        await gautiTransporteri().sendMail({
            from: `"HOUMY konfigūratorius" <${smtpPastas.value()}>`,
            to: GAVEJAS,
            subject: `Neišsiųstos konfigūratoriaus užklausos: ${neissiustos.length}`,
            text: tekstas
        });
        const zymos = {};
        neissiustos.forEach(u => { zymos["houmy_uzklausos/" + u.id + "/laiskas"] = "suvestineje"; });
        await db.ref().update(zymos);
        console.log("Neišsiųstų užklausų suvestinė išsiųsta:", neissiustos.length);
    }
);

// ============================================================================
// senuUzklausuValymas — kasdien 03:30 (Vilniaus laiku):
//   1. ištrina klientų užklausas IR visus pasiūlymus (kliento variantus bei
//      komercinius), senesnius nei 12 mėnesių (BDAR; Ramūno sprendimas 2026-10-01);
//   2. pašalina Google prisijungimo paskyras, kurios nėra administratorių
//      sąraše (atsiranda, kai kas nors pabando prisijungti prie admin skydelio);
//   3. jei kainos ar tekstai pasikeitė — padaro jų atsarginę kopiją
//      (houmy_kopijos/<data>, saugomos 90 naujausių).
// Kiekviena dalis vykdoma atskirai: vienai nepavykus, kitos vis tiek atliekamos.
// ============================================================================

const SAUGOJIMO_TERMINAS_MS = 365 * 24 * 60 * 60 * 1000; // 12 mėnesių
const KOPIJU_KIEKIS = 90;

async function istrintiSenus(db, kelias, riba) {
    const senos = await db.ref(kelias).orderByChild("createdAt").endAt(riba).once("value");
    const trynimas = {};
    senos.forEach(v => {
        const x = v.val() || {};
        if (typeof x.createdAt === "number" && x.createdAt <= riba) trynimas[kelias + "/" + v.key] = null;
    });
    const kiek = Object.keys(trynimas).length;
    if (kiek) await db.ref().update(trynimas);
    return kiek;
}

async function pasalintiPasaliniusPrisijungimus(db) {
    const { getAuth } = require("firebase-admin/auth");
    const adminai = (await db.ref("houmy_admins").once("value")).val() || {};
    const yraAdminas = pastas => adminai[String(pastas || "").toLowerCase().split(".").join(",")] === true;
    const parasDienos = Date.now() - 24 * 60 * 60 * 1000;
    const salinti = [];
    let puslapis;
    do {
        const r = await getAuth().listUsers(1000, puslapis);
        r.users.forEach(u => {
            if (!yraAdminas(u.email) && Date.parse(u.metadata.creationTime) < parasDienos) salinti.push(u.uid);
        });
        puslapis = r.pageToken;
    } while (puslapis);
    if (salinti.length) await getAuth().deleteUsers(salinti);
    return salinti.length;
}

async function kainuKopija(db) {
    const crypto = require("crypto");
    const nustatymai = (await db.ref("houmy_settings").once("value")).val();
    if (!nustatymai) return "nėra ką kopijuoti";
    const { updatedAt, appVersion, ...turinys } = nustatymai; // laiko žymos kopijos nekeičia
    const stabilus = x => (x && typeof x === "object")
        ? "{" + Object.keys(x).sort().map(k => JSON.stringify(k) + ":" + stabilus(x[k])).join(",") + "}"
        : JSON.stringify(x);
    const santrauka = crypto.createHash("sha256").update(stabilus(turinys)).digest("hex");
    const paskutine = await db.ref("houmy_kopijos").orderByKey().limitToLast(1).once("value");
    let paskutinesSantrauka = null;
    paskutine.forEach(v => { paskutinesSantrauka = (v.val() || {}).santrauka || null; });
    if (paskutinesSantrauka === santrauka) return "nepasikeitė";

    const data = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Vilnius" }); // YYYY-MM-DD
    await db.ref("houmy_kopijos/" + data).set({ laikas: Date.now(), santrauka, nustatymai });
    // paliekam tik KOPIJU_KIEKIS naujausių
    const visos = await db.ref("houmy_kopijos").orderByKey().once("value");
    const raktai = [];
    visos.forEach(v => { raktai.push(v.key); });
    if (raktai.length > KOPIJU_KIEKIS) {
        const trynimas = {};
        raktai.slice(0, raktai.length - KOPIJU_KIEKIS).forEach(k => { trynimas["houmy_kopijos/" + k] = null; });
        await db.ref().update(trynimas);
    }
    return "išsaugota " + data;
}

exports.senuUzklausuValymas = onSchedule(
    {
        schedule: "30 3 * * *",
        timeZone: "Europe/Vilnius",
        region: "europe-west1",
        memory: "256MiB",
        maxInstances: 1
    },
    async () => {
        const db = gautiDb();
        const riba = Date.now() - SAUGOJIMO_TERMINAS_MS;
        const klaidos = [];
        const atlikti = async (pavadinimas, darbas) => {
            try { console.log(pavadinimas + ":", await darbas()); }
            catch (k) { klaidos.push(pavadinimas); console.error(pavadinimas + " nepavyko:", k); }
        };
        await atlikti("Ištrinta senų užklausų", () => istrintiSenus(db, "houmy_uzklausos", riba));
        await atlikti("Ištrinta senų pasiūlymų", () => istrintiSenus(db, "houmy_proposals", riba));
        await atlikti("Pašalinta pašalinių prisijungimų", () => pasalintiPasaliniusPrisijungimus(db));
        await atlikti("Kainų kopija", () => kainuKopija(db));
        if (klaidos.length) throw new Error("Nepavyko: " + klaidos.join(", "));
    }
);

// ============================================================================
// technologijuPatikra — kiekvieno mėnesio 1 d. 09:00 (Vilniaus laiku) patikrina
// naudojamų technologijų versijas, palaikymo datas ir žinomas saugumo spragas
// (sąrašas ir taisyklės — technologijos.js). Ataskaita įrašoma į
// houmy_technologijos (rodoma admin skydelyje „🔧 Technologijos"), o laiškas
// į info@houmy.lt siunčiamas TIK kai reikia ką nors daryti arba kai pati
// patikra nepavyko.
// ============================================================================
exports.technologijuPatikra = onSchedule(
    {
        schedule: "0 9 1 * *",
        timeZone: "Europe/Vilnius",
        region: "europe-west1",
        secrets: [smtpPastas, smtpSlaptazodis],
        memory: "256MiB",
        maxInstances: 1
    },
    async () => {
        // Įkeliama tik čia, kad nelėtintų laiškų funkcijos paleidimo
        const { patikrinti, laiskoTurinys } = require("./technologijos");
        const { initializeApp, getApps } = require("firebase-admin/app");
        const { getDatabaseWithUrl } = require("firebase-admin/database");
        if (!getApps().length) initializeApp();
        const db = getDatabaseWithUrl(DB_BAZE);
        const transporteris = nodemailer.createTransport({
            service: "gmail",
            auth: { user: smtpPastas.value(), pass: smtpSlaptazodis.value() }
        });

        let ataskaita;
        try {
            ataskaita = await patikrinti();
        } catch (klaida) {
            console.error("Technologijų patikra nepavyko:", klaida);
            await db.ref("houmy_technologijos").set({ tikrinta: Date.now(), klaida: String(klaida && klaida.message || klaida).slice(0, 500) });
            await transporteris.sendMail({
                from: `"HOUMY konfigūratorius" <${smtpPastas.value()}>`,
                to: GAVEJAS,
                subject: "HOUMY konfigūratorius: mėnesinė technologijų patikra nepavyko",
                text: "Automatinė technologijų patikra šį mėnesį nepavyko:\n\n" + (klaida && klaida.message || klaida) +
                    "\n\nTai nereiškia, kad konfigūratorius neveikia — tik kad šį kartą nepavyko patikrinti versijų. " +
                    "Jei laiškas kartojasi kelis mėnesius — perduokite jį programuotojui (ar Claude)."
            });
            return;
        }

        ataskaita.laiskasIssiustas = false;
        await db.ref("houmy_technologijos").set(ataskaita);

        if (ataskaita.reikiaVeiksmu > 0) {
            const l = laiskoTurinys(ataskaita);
            await transporteris.sendMail({
                from: `"HOUMY konfigūratorius" <${smtpPastas.value()}>`,
                to: GAVEJAS,
                subject: l.tema,
                text: l.tekstas,
                html: l.html
            });
            await db.ref("houmy_technologijos/laiskasIssiustas").set(true);
            console.log("Technologijų patikra: reikia veiksmų (" + ataskaita.reikiaVeiksmu + ") — laiškas išsiųstas.");
        } else {
            console.log("Technologijų patikra: viskas tvarkoje, laiškas nesiųstas.");
        }
    }
);
