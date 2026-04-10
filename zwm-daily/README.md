# ZWM Daily 10x Brief Generator

Calls the Anthropic API with web search to research the latest industry
developments, identifies one grounded 10x improvement for the Zuup World
Model, and outputs a formatted DOCX brief.

## Prerequisites

- **Node.js** v18+ — https://nodejs.org/
- **Anthropic API key** with web search enabled

## Setup

### 1. Clone the repo and enter the directory

```bash
# Linux / macOS
git clone https://github.com/khaaliswooden-max/zwn.git
cd zwn/zwm-daily
```

```powershell
# Windows (PowerShell)
git clone https://github.com/khaaliswooden-max/zwn.git
Set-Location zwn\zwm-daily
```

### 2. Install dependencies

```
npm install
```

### 3. Configure environment

Copy the example and add your API key:

```bash
# Linux / macOS
cp .env.example .env
```

```powershell
# Windows (PowerShell)
Copy-Item .env.example .env
```

Then edit `.env`:

```
ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
ZWM_MODEL=claude-sonnet-4-6
```

> **Important:** The `.env` file must be inside the `zwm-daily/` directory,
> not in your home folder or anywhere else.

## Running

**Linux / macOS:**

```bash
bash run-daily.sh
```

**Windows (PowerShell):**

```powershell
.\run-daily.ps1
```

Both wrapper scripts change to the correct directory, load `.env`, and log
timestamps. The PowerShell script will also auto-run `npm install` if
`node_modules/` is missing.

You can also run directly (after setting environment variables manually):

```
node zwm-daily.mjs
```

## Scheduling

### Linux / macOS (cron)

```bash
crontab -e
# Add this line (runs daily at 6:00 AM):
0 6 * * * cd /path/to/zwn/zwm-daily && bash run-daily.sh >> output/run.log 2>&1
```

### Windows (Task Scheduler)

```powershell
schtasks /create /tn "ZWM Daily Brief" /tr "powershell -ExecutionPolicy Bypass -File C:\path\to\zwm-daily\run-daily.ps1" /sc daily /st 06:00
```

To remove the scheduled task:

```powershell
schtasks /delete /tn "ZWM Daily Brief" /f
```

You can also use the Task Scheduler GUI: search "Task Scheduler" in the
Start menu and create a new basic task.

## Output

Briefs are saved to `zwm-daily/output/`:

```
ZWM_Daily_Brief_YYYY-MM-DD.docx
```
