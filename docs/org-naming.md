# Open-Source Org Naming — .ai Domain Candidates

**Checked:** 2026-07-14
**Naming rule (v2):** the name must read as a Russian word ending in **«-ай»** when the domain is spoken aloud: `domain` + `ai` = the word (uspev + ai = «успевай»). Everything that fails this rule was removed (kept for the record at the bottom).
**Method:** RDAP status via `rdap.identitydigital.services` (404 = available, 200 = registered), cross-checked top picks via `rdap.org`; DNS/site probe (`curl https://name.ai` — every available candidate is NXDOMAIN, no live sites); GitHub API `/users/` + `/orgs/` (with known-taken and garbage-name controls); brand-collision web search for finalists.

> **Key GitHub fact:** nearly every bare 3–5-letter name already has a GitHub **user** (users and orgs share one namespace), so the exact-match org is blocked. The practical route: register the **full word** as the org — `uspevai`, `smekai`, `zadelai`, `vrubai` are checked **free**. Exception: **`obych` and `obychai` are BOTH free** — the only candidate with a fully clean GitHub namespace. `lentyai` is taken.

## TL;DR — Top 5

| Domain | Reads as | RDAP | Live site | GitHub org | Collisions | Score |
| --- | --- | --- | --- | --- | --- | --- |
| **uspev.ai** | «успевай» | 404 free (2 sources) | none | **`uspevai` free** | none found | **9/10** |
| **zadel.ai** | «заделай» / «за дела!» | 404 free | none | **`zadelai` free** | none; [Dutch *zadel* = "saddle"](https://en.bab.la/dictionary/dutch-english/zadel) (neutral) | **8.5/10** |
| **smek.ai** | «смекай» | 404 free (2 sources) | none | **`smekai` free** | Smek Digital (blog), Captain Smek (DreamWorks) — weak; [Urban Dictionary mostly positive](https://www.urbandictionary.com/define.php?term=Smek) | **8/10** |
| **obych.ai** | «обычай» (noun) | 404 free | none | **`obych` AND `obychai` both free** | none found | **7/10** |
| **lenty.ai** | «лентяй» (noun) | 404 free | none | `lentyai` **taken** | [Lent.ai](https://apps.apple.com/us/app/lent-ai/id6759534227), [Lety.ai](https://www.producthunt.com/products/lety-ai) — phonetic neighbors | **6.5/10** |

Scoring weights per brief: memorability/pronounceability 30%, tasks/workflow link 25%, domain+GitHub availability 25%, uniqueness 20%.

### Recommendation: `uspev.ai` + GitHub org `uspevai`

- Exactly the target pattern: *uspev* + *.ai* reads «успевай».
- Meaning is the product: "get everything done in time" — tasks, deadlines, ADHD.
- Domain free (two RDAP sources), no site, no brand collisions, full-word org free, clean for English ears ("oo-SPEV-eye").
- Tagline writes itself: *Uspevai — get it all done.*

Runner-up: `zadel.ai` (cleanest English phonetics of the whole list). Best availability overall: `obych.ai` (even the bare GitHub name is free), but it carries an English misreading risk — see below.

## Category A — Verbs, imperative «-ай»

Available (RDAP 404):

| Source word | Domain | Letters | Meaning | Vibe |
| --- | --- | --- | --- | --- |
| успевай | **uspev.ai** | 5 | get it all done in time | deadline-beating, ADHD-core |
| смекай | **smek.ai** | 4 | figure it out, be clever | folksy-smart, «смекалка» |
| заделай | **zadel.ai** | 5 | patch it up, seal it; also reads «за дела!» and «задел» (head start) | layered, contains «дел» (task) |
| врубай | **vrub.ai** | 4 | switch it on; «врубиться» = to get it | energetic slang |
| прыгай | **pryg.ai** | 4 | jump (in) | playful, action |
| накатай | **nakat.ai** | 5 | bang it out (dev slang «накатать код») | dev-community |
| сдвигай | **sdvig.ai** | 5 | push it forward; «сдвинуться с мёртвой точки» | progress; hard `sdv-` cluster for non-Russians |

Checked and **taken** (RDAP 200): dav, derz, resh, sdel, hvat, shag, tolk, men, igr, dvig, stup, val, rabot, pomog, dodel, kop, mot, kat, let, gul, vnik, uskor, pyl.

## Category B — Non-verb «-ай» words (nouns, names)

Available (RDAP 404):

| Source word | Domain | Letters | Meaning | Vibe / caveat |
| --- | --- | --- | --- | --- |
| обычай | **obych.ai** | 5 | custom, habit | routines/habits angle — on-theme; ⚠️ English misreading risk (see below); best GitHub availability of all |
| лентяй | **lenty.ai** | 5 | lazybones | self-ironic ADHD humor («инструмент для лентяев»); echoes "plenty"; GitHub `lentyai` taken |
| Гималай | **gimal.ai** | 5 | Himalaya | big goals / peaks; singular «Гималай» is a slight stretch |
| всезнай | **vsezn.ai** | 5 | know-it-all («всезнайка») | fits an AI assistant; unpronounceable in English |
| незнай | **nezn.ai** | 4 | Neznaika vibe («незнайка») | playful, but "don't-know AI" is a bad frame |
| нагоняй* | **nagon.ai** | 5 | catch up! (нагонять) / a scolding | English "nag on" — arguably on-brand for reminders; *strictly reads «нагонай», the real word needs `nagony` (6) |

Checked and **taken** (RDAP 200): sar (сарай), popug (попугай), karav (каравай), sluch (случай), urozh (урожай), tramv (трамвай), alt (Алтай), kit (Китай), vald (Валдай), bug (бугай), dun (Дунай), mam (Мамай), bab (бабай).

## English-Ear Check (negative connotations / misreadings)

How each available candidate lands for a native English speaker who has never seen Russian.

### Red flags

| Domain | Problem |
| --- | --- |
| **vsezn.ai** | `vsezn` is unpronounceable in English. |
| **sdvig.ai** | The `sdv-` cluster is unpronounceable; will be mangled every time it's said aloud. |

### Yellow flags — usable, but know the echo

| Domain | Echo in English |
| --- | --- |
| **obych.ai** | Real misreading risk: `obych` can come out as **"oh-bitch"** (`y` read as short *i*, `ch` as in *church*). Intended "oh-BEECH-eye" needs coaching. |
| **pryg.ai** | Near-homophone of **"prig"** (a smug, self-righteous person — a real negative English word). |
| **smek.ai** | Echoes **"smack"** (a slap; dated slang for heroin). Counterweight: [Urban Dictionary entries](https://www.urbandictionary.com/define.php?term=Smek) are mostly positive. Net: punchy rather than offensive. |
| **vrub.ai** | `vr-` onset is awkward; will collapse to "rub". Harmless but clumsy. |
| **nezn.ai** | Awkward onset; "don't-know" frame is unhelpful for an AI brand. |
| **nagon.ai** | Reads as **"nag on"** — nagging reminders are almost on-brand, but it's still nagging. |

### Clean

| Domain | How it lands |
| --- | --- |
| **uspev.ai** | "oo-SPEV-eye" / "US-pev" — no English word nearby; only a faint visual near-miss with "spew" (different spelling and sound). Clean. |
| **zadel.ai** | Rhymes with "saddle/paddle"; [Dutch *zadel* = "saddle"](https://en.bab.la/dictionary/dutch-english/zadel) (neutral). The cleanest of the whole list for English ears. |
| **nakat.ai** | "nah-KAT" — easy, no collisions. |
| **lenty.ai** | "LEN-tee-eye" — rhymes with "plenty" (a positive echo). |
| **gimal.ai** | "gim-AL" — easy; faint Himalaya echo (peaks, big goals) is a plus. |

## Removed by the «-ай» filter (for the record)

These were free at check time (2026-07-14) but their source words don't end in «-ай», so they're out per naming rule v2: **ryvok.ai** (рывок; also ≈ "revoke"), **pinok.ai** (пинок; Pinocchio/Pinokio baggage), **poryv.ai**, **napor.ai**, **vihr.ai**, **vzhuh.ai**, **begom.ai**, **smelo.ai** (reads "smell-o" — was dropped anyway), **vraz.ai**, **zamah.ai**, **pogn.ai**.

Short English words: every checked 3–5-letter candidate (doit, spur, kick, knack, steps, brisk, notch, tick, verve, gusto, hop) is taken — that space is exhausted.

## Caveats

- RDAP 404 is a strong but not final signal — confirm at the registrar checkout (porkbun / name.com) before celebrating. `.ai` runs ~US$70–90 for the 2-year minimum.
- GitHub full-word orgs verified free: `uspevai`, `smekai`, `zadelai`, `vrubai`, `obych`, `obychai`. **Not yet checked** (API rate limit): `prygai`, `nakatai`, `sdvigai`, `gimalai`, `vseznai`, `neznai`. `lentyai` is taken.
- Short names get squatted — register the GitHub org promptly after picking.
- Not verified: trademark databases, App Store name collisions, social handles.
