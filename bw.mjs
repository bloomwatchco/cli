#!/usr/bin/env node
// Terminal client for the BloomWatch API (https://bloomwatch.co/help/api). No dependencies, Node 20.12+.
// Key comes from BLOOMWATCH_KEY, or a .env in the current folder, or a .env next to this file.
//
//   bloomwatch status
//   bloomwatch companies [--days 7] [--jobs] [--limit 20] [round=Seed location=Austin]
//   bloomwatch jobs [--days 3] [--limit 20] [companyId=...]
//   bloomwatch company <id>
//   bloomwatch job <id>
//   add --json to any command for the raw response

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

for (const envFile of [join(process.cwd(), ".env"), join(dirname(fileURLToPath(import.meta.url)), ".env")]) {
  if (!process.env.BLOOMWATCH_KEY && existsSync(envFile)) process.loadEnvFile(envFile);
}

const KEY = process.env.BLOOMWATCH_KEY;
const BASE = (process.env.BLOOMWATCH_URL || "https://bloomwatch.co").replace(/\/$/, "") + "/api/v1";

const tty = process.stdout.isTTY;
const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = paint(1), dim = paint(2), green = paint(32), red = paint(31), cyan = paint(36);

const SYMBOLS = { USD: "$", EUR: "€", GBP: "£", JPY: "¥", INR: "₹" };

function money(amount, currency) {
  if (amount == null) return "";
  const sym = SYMBOLS[currency] ?? `${currency} `;
  if (amount >= 1e9) return `${sym}${+(amount / 1e9).toFixed(1)}B`;
  if (amount >= 1e6) return `${sym}${+(amount / 1e6).toFixed(1)}M`;
  if (amount >= 1e3) return `${sym}${Math.round(amount / 1e3)}K`;
  return `${sym}${amount}`;
}

const day = (iso) => (iso ? iso.slice(0, 10) : "");

function ago(iso) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} hr ago`;
  return `${Math.round(min / 1440)} days ago`;
}

function cut(s, n) {
  s = String(s ?? "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// cols: [{ label, get, right?, max? }]. The last column takes what is left of the terminal width.
function table(rows, cols) {
  const cells = rows.map((r) => cols.map((c) => String(c.get(r) ?? "")));
  const widths = cols.map((c, i) => Math.min(c.max ?? 40, Math.max(c.label.length, ...cells.map((row) => row[i].length))));
  const width = process.stdout.columns || 120;
  const used = widths.slice(0, -1).reduce((a, w) => a + w + 2, 0);
  widths[widths.length - 1] = Math.max(10, Math.min(widths.at(-1), width - used));
  const line = (vals, style = (s) => s) =>
    vals
      .map((v, i) => {
        const s = cut(v, widths[i]);
        return style(cols[i].right ? s.padStart(widths[i]) : s.padEnd(widths[i]));
      })
      .join("  ")
      .trimEnd();
  console.log(line(cols.map((c) => c.label), (s) => bold(dim(s))));
  for (const row of cells) console.log(line(row));
}

async function get(path, params = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(red(`${res.status} ${body.code ?? "error"}`) + `  ${body.error ?? res.statusText}`);
    if (body.upgradeUrl) console.error(dim(body.upgradeUrl));
    process.exit(1);
  }
  const h = (n) => res.headers.get(n);
  return { body, limits: `${h("x-ratelimit-remaining")}/${h("x-ratelimit-limit")} calls this min, ${h("x-ratelimit-rows-remaining")}/${h("x-ratelimit-rows-limit")} rows today` };
}

function footer({ body, limits }) {
  if (body.total != null) console.log(dim(`\n${body.data.length} of ${body.total}` + (body.nextOffset != null ? `, next page: offset=${body.nextOffset}` : "")));
  console.log(dim(limits));
}

const commands = {
  async status() {
    const r = await get("/status");
    const s = r.body;
    if (json) return console.log(JSON.stringify(s, null, 2));
    console.log(`${green("●")} ${bold("BloomWatch API")}  ${dim(BASE)}\n`);
    console.log(`  Last ingest   ${day(s.lastIngestAt)} ${s.lastIngestAt.slice(11, 16)} UTC  ${dim(`(${ago(s.lastIngestAt)})`)}`);
    console.log(`  Companies     ${s.companyCount.toLocaleString().padStart(6)}`);
    console.log(`  Open jobs     ${s.jobCount.toLocaleString().padStart(6)}`);
    console.log(`  Sources       ${String(s.sourceCount).padStart(6)}\n`);
    console.log(dim(r.limits));
  },

  async companies() {
    const r = await get("/companies", { limit: flags.limit ?? 20, fundedWithinDays: flags.days, hasJobs: flags.jobs ? "true" : undefined, ...params });
    if (json) return console.log(JSON.stringify(r.body, null, 2));
    table(r.body.data, [
      { label: "Raised", get: (c) => day(c.roundCloseDate), right: true },
      { label: "Company", get: (c) => c.name, max: 24 },
      { label: "Round", get: (c) => c.fundingRound, max: 12 },
      { label: "Amount", get: (c) => money(c.roundAmount, c.roundCurrency), right: true },
      { label: "Jobs", get: (c) => c.openJobCount, right: true },
      { label: "HQ", get: (c) => c.locationHq, max: 18 },
      { label: "Industry", get: (c) => c.industry, max: 20 },
      { label: "Id", get: (c) => c.id, max: 25 },
    ]);
    footer(r);
  },

  async jobs() {
    const r = await get("/jobs", { limit: flags.limit ?? 20, postedWithinDays: flags.days, ...params });
    if (json) return console.log(JSON.stringify(r.body, null, 2));
    table(r.body.data, [
      { label: "Posted", get: (j) => day(j.postedAt ?? j.firstSeenAt), right: true },
      { label: "Company", get: (j) => j.company.name, max: 20 },
      { label: "Round", get: (j) => j.company.fundingRound, max: 12 },
      { label: "Amount", get: (j) => money(j.company.roundAmount, j.company.roundCurrency), right: true },
      { label: "Title", get: (j) => j.title, max: 60 },
    ]);
    footer(r);
  },

  async company() {
    const c = (await get(`/companies/${need("company")}`)).body.data;
    if (json) return console.log(JSON.stringify(c, null, 2));
    console.log(`${bold(c.name)}  ${dim(c.domain ?? "")}`);
    if (c.oneLineSummary) console.log(c.oneLineSummary);
    console.log();
    const rows = [
      ["Round", [c.fundingRound, money(c.roundAmount, c.roundCurrency)].filter(Boolean).join(", ")],
      ["Raised", day(c.roundCloseDate)],
      ["Investors", c.investorNames.join(", ")],
      ["HQ", c.locationHq],
      ["Industries", c.industries.join(", ")],
      ["Employees", c.employeeCountEstimate],
      ["Remote", c.remotePolicy],
      ["Tech", c.techStack.join(", ")],
      ["Open jobs", c.openJobCount],
      ["Careers", c.careersUrl],
      ["First seen", day(c.firstSeenAt)],
    ];
    for (const [k, v] of rows) if (v !== null && v !== "") console.log(`  ${dim(k.padEnd(11))}${v}`);
    if (c.openJobCount) console.log(dim(`\n  bloomwatch jobs companyId=${c.id}`));
  },

  async job() {
    const j = (await get(`/jobs/${need("job")}`)).body.data;
    if (json) return console.log(JSON.stringify(j, null, 2));
    console.log(`${bold(j.title)}  ${dim("at")} ${j.company.name}`);
    console.log(`  ${dim("Posted".padEnd(11))}${day(j.postedAt ?? j.firstSeenAt)}${j.closedAt ? red(`  closed ${day(j.closedAt)}`) : ""}`);
    console.log(`  ${dim("Round".padEnd(11))}${[j.company.fundingRound, money(j.company.roundAmount, j.company.roundCurrency)].filter(Boolean).join(", ")}`);
    console.log(`  ${dim("Link".padEnd(11))}${cyan(j.url ?? "")}`);
  },
};

function need(what) {
  if (!positional[0]) {
    console.error(`usage: bloomwatch ${what} <id>`);
    process.exit(1);
  }
  return positional[0];
}

// Parse: command, --flags, key=value API params, positional ids.
const [cmd = "status", ...rest] = process.argv.slice(2);
const flags = {}, params = {}, positional = [];
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a === "--json" || a === "--jobs") flags[a.slice(2)] = true;
  else if (a.startsWith("--")) flags[a.slice(2)] = rest[++i];
  else if (a.includes("=")) params[a.slice(0, a.indexOf("="))] = a.slice(a.indexOf("=") + 1);
  else positional.push(a);
}
const json = !!flags.json;

if (cmd === "help" || cmd === "--help" || cmd === "-h") {
  console.log(`bloomwatch <command> [options]

  status              last ingest time and counts (default)
  companies           funded companies, newest round first
  jobs                open roles, newest first
  company <id>        one company in detail
  job <id>            one role in detail

  --days N            companies raised, or jobs posted, in the last N days
  --jobs              companies with open roles only
  --limit N           rows per page, default 20, max 200
  --json              raw API response
  key=value           any other API parameter (round=Seed, offset=20, companyId=...)

Docs: https://github.com/bloomwatchco/cli and https://bloomwatch.co/help/api`);
  process.exit(0);
}
if (!commands[cmd]) {
  console.error(`unknown command "${cmd}". Commands: ${Object.keys(commands).join(", ")}`);
  process.exit(1);
}
if (!KEY || KEY === "bw_live_your_key_here") {
  console.error(red("No key.") + ` Run: export BLOOMWATCH_KEY=bw_live_... (key from https://bloomwatch.co/settings#api-keys, see https://github.com/bloomwatchco/cli)`);
  process.exit(1);
}
await commands[cmd]();
