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
const { defineSecret } = require("firebase-functions/params");
const nodemailer = require("nodemailer");

const smtpPastas = defineSecret("SMTP_PASTAS");
const smtpSlaptazodis = defineSecret("SMTP_SLAPTAZODIS");

// Kam siunčiami pranešimai apie naujas užklausas
const GAVEJAS = "info@houmy.lt";
// Kliento dėlionės peržiūros adresas
const PERZIUROS_BAZE = "https://ramunaspetraska-debug.github.io/Houmy-konfiguratorius/";
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

        const transporteris = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: smtpPastas.value(),
                pass: smtpSlaptazodis.value()
            }
        });

        await transporteris.sendMail({
            from: `"HOUMY konfigūratorius" <${smtpPastas.value()}>`,
            to: GAVEJAS,
            replyTo: u.email || undefined,
            subject: tema,
            text: tekstas,
            html: html
        });

        console.log("Užklausos pranešimas išsiųstas:", event.params.uzklausosId);
    }
);
