# 🤖 MS Rewards Hybrid Bot

> **Automated Microsoft Rewards point collection**

<p align="center">
	<img src="assets/logo.png" alt="Hybrid Bot Logo" width="180" />
</p>

<p align="center">
	<a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-≥20-brightgreen?style=flat-square&logo=nodedotjs" alt="Node.js 20+" /></a>
	<a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript" alt="TypeScript" /></a>
	<img src="https://img.shields.io/badge/patchright-anti--detection-orange?style=flat-square" alt="Patchright" />
</p>

---

## ⚡ Quick Start

```bash
# 1. Clone & install
git clone https://github.com/Rai123qt/MS-RW.git
cd MS-RW
npm install

# 2. Configure
# Edit: src/accounts.jsonc → Add your Microsoft accounts
# Edit: src/config.jsonc → Customize behavior (optional)

# 3. Build & Run
npm run build
npm start
```

---

## ✨ Features

### 🎯 Core Automation
- **Daily Set, Punch Cards, Promotions** - All activities covered
- **Desktop + Mobile Searches** - 30 desktop + 20 mobile points
- **Read to Earn** - Article completion
- **Daily Check-in** - Never miss a streak

### 🔍 Multi-Source Search Queries
- **Google Trends** - Trending topics
- **Wikipedia** - Popular articles  
- **Reddit** - Hot posts from r/popular
- **Bing Suggestions** - Related terms expansion
- **Local Fallback** - queries.json backup

### 🛡️ Anti-Detection
- **patchright** - Undetectable browser automation
- **Natural mouse movements** - Bézier curves
- **Human typing** - Variable speed & delays
- **Fingerprint persistence** - Per-account consistency

### 🤖 GitHub Actions Ready
- **xvfb** - Virtual display (no headless)
- **Random startup delay** - 0-5 minutes
- **Account shuffling** - Random order
- **Delay between accounts** - 1-3 minutes

---

## 📁 Project Structure

```
MS-RW/
├── src/
│   ├── accounts.jsonc    # Your MS accounts (SECRET!)
│   ├── config.jsonc      # Bot configuration
│   ├── functions/
│   │   ├── QueryEngine.ts    # Multi-source query generator
│   │   └── activities/
│   │       └── Search.ts     # Enhanced search logic
│   └── ...
├── .github/workflows/
│   └── farm.yml          # GitHub Actions daily farming
└── sessions/             # Saved browser sessions
```

---

## ⚙️ Configuration

### accounts.jsonc
```json
[
    {
        "email": "your@outlook.com",
        "password": "YourPassword",
        "totpSecret": "",
        "proxy": {
            "url": "http://your-proxy-ip",
            "port": 5338,
            "username": "proxy-user",
            "password": "proxy-pass"
        }
    }
]
```

### config.jsonc (searchSettings)
```json
{
    "searchSettings": {
        "queryEngines": ["google", "wikipedia", "reddit", "local"],
        "searchDelay": { "min": "45s", "max": "2min" },
        "scrollRandomResults": true,
        "clickRandomResults": true
    }
}
```

---

## 🚀 GitHub Actions

Workflow runs **daily at 8:00 AM Vietnam time**.

### Setup:
1. Fork this repo
2. Go to **Settings** → **Secrets** → **Actions**
3. Add secret: `ACCOUNTS_JSON` (paste your accounts.jsonc content)
4. Enable Actions in the repo

### Manual Run:
**Actions** → **Farm Rewards** → **Run workflow**

---

## 🔧 Development

```bash
npm run build      # Compile TypeScript
npm run dev        # Watch mode
npm start          # Run bot
npm run dashboard  # Web monitoring UI
```

---

## ⚠️ Disclaimer

> **Use at your own risk.**  
> This software is for **educational purposes only**.  
> Microsoft may suspend accounts using automation tools.
