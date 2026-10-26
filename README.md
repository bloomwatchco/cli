# 🌱 BloomWatch CLI

A small terminal client for the [BloomWatch API](https://bloomwatch.co/help/api): newly funded companies and their open roles. One file, no dependencies.

```
$ npx github:bloomwatchco/cli status
● BloomWatch API  https://bloomwatch.co/api/v1

  Last ingest   2026-10-26 00:24 UTC  (5 hr ago)
  Companies        354
  Open jobs      2,691
  Sources            7

119/120 calls this min, 5000/5000 rows today
```

## Requirements

- Node.js 20.12 or newer (`node -v`). Nothing to `npm install`.
- A BloomWatch API key. Keys come with the API plan ($99/mo, https://bloomwatch.co/pricing).

## Install

### 1. Get an API key

1. Sign in at https://bloomwatch.co.
2. Go to **Settings**, then **API keys** (https://bloomwatch.co/settings#api-keys).
3. Type a name for the key (for example `laptop`) and click **Create key**.
4. Copy the key, it starts with `bw_live_`. It is shown only once. If you lose it, revoke it and create another.

You can have 2 active keys at a time, one in use and one for rotating.

### 2. Set the key

Export it:

```bash
export BLOOMWATCH_KEY=bw_live_a1b2c3d4...
```

Or put it in a `.env` file in the folder you run the CLI from (or next to `bw.mjs` in a clone):

```bash
cp .env.example .env   # then replace the placeholder with your key
```

An exported key wins over `.env`. `.env` is gitignored, so the key stays on your machine.

### 3. Run it

No install, straight from GitHub:

```bash
npx github:bloomwatchco/cli status
```

Or clone it:

```bash
git clone https://github.com/bloomwatchco/cli bloomwatch-cli
cd bloomwatch-cli
node bw.mjs status
```

Or install the `bloomwatch` command globally:

```bash
npm install -g github:bloomwatchco/cli
bloomwatch status
```

You should see the last ingest time and the counts above. A `401` means the key is missing or wrong (see [Errors](#errors)).

## Usage

```bash
bloomwatch <command> [options]
```

The examples below use `bloomwatch`. Swap in `npx github:bloomwatchco/cli` or `node bw.mjs` to match how you run it.

| Command | What it shows |
|---|---|
| `status` | Last ingest time, company, job, and source counts. The default when no command is given. |
| `companies` | Funded companies, newest round first |
| `jobs` | Open roles, newest first, with each company's round |
| `company <id>` | One company in detail |
| `job <id>` | One role in detail |
| `help` | Commands and options |

| Option | Meaning |
|---|---|
| `--days N` | `companies`: raised in the last N days. `jobs`: posted in the last N days. |
| `--jobs` | `companies`: only companies with open roles |
| `--limit N` | Rows per page, default 20, max 200 |
| `--json` | Print the raw API response instead of a table |
| `key=value` | Any other API parameter, passed through as is (`round=Seed`, `location=Austin`, `offset=20`, `companyId=...`) |

## Examples

This week's raises with open roles:

```bash
bloomwatch companies --days 7 --jobs
```

```
    Raised  Company         Round     Amount  Jobs  HQ                  Industry             Id
2026-10-23  BOB             Seed       $5.5M     3                      AI                   cmvoi8vnf001e84zyj29ynt46
2026-10-23  Mural           Series A    $15M    14  NYC, NY             Fintech              cmvhcpcza009v3kfqwckvrjg5
2026-10-22  Coast                       $35M    18                      Fintech              cmvk8u5sq00964326w4nuk6xy

3 of 18, next page: offset=3
```

Seed rounds only, next page:

```bash
bloomwatch companies round=Seed offset=20
```

Roles posted in the last 3 days:

```bash
bloomwatch jobs --days 3
```

One company, then its open roles (ids come from the `Id` column):

```bash
bloomwatch company cmvk8u5sq00964326w4nuk6xy
bloomwatch jobs companyId=cmvk8u5sq00964326w4nuk6xy
```

Raw JSON, piped to `jq`:

```bash
bloomwatch companies --days 7 --json | jq '.data[] | {name, fundingRound, roundAmount}'
```

The same call without the CLI:

```bash
curl -H "Authorization: Bearer $BLOOMWATCH_KEY" https://bloomwatch.co/api/v1/status
```

## Errors

Errors print the status, a code, and a message, and exit with 1.

| Status | Code | Fix |
|---:|---|---|
| | `No key.` | Printed before any call when no key is set. Run step 2 of [Install](#install). |
| 401 | `missing_key` | The request went out without a key (curl or your own code). |
| 401 | `invalid_key` | Key is wrong. Copy it again, or create a new one. |
| 401 | `revoked_key` | Key was revoked on Settings. Create a new one. |
| 402 | `plan_required` | No API plan on the account. The message links to the upgrade page. |
| 404 | `not_found` | No company or job with this id. |
| 429 | `rate_limited` | Over 120 calls a minute. Wait a minute. |
| 429 | `daily_cap` | Over 5,000 rows a day. The message names the reset time. |

## Limits

- 120 calls a minute, 5,000 rows a day, 200 rows per page.
- Every command prints what is left of both in its last line.
- The code is MIT licensed. The data is not: no resale or redistribution (see https://bloomwatch.co/terms).

## More

- Full API docs: https://bloomwatch.co/help/api
- OpenAPI spec: https://bloomwatch.co/api/v1/openapi.json
- Issues and requests: https://github.com/bloomwatchco/cli/issues
- Support: bloomwatchsupport@zeninfinity.com

## License

MIT, see [LICENSE](LICENSE). Copyright 2026 Zager Consulting LLC.
