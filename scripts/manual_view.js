const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium } = require('patchright');
const { newInjectedContext } = require('fingerprint-injector');

// Configuration
const ACCOUNTS_FILE = path.join(__dirname, '../accounts.github.json');
const SESSIONS_DIR = path.join(__dirname, '../sessions');

// Helper to strip JSON comments
function stripJsonComments(json) {
    return json.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => g ? "" : m);
}

// Load Accounts
function loadAccounts() {
    if (!fs.existsSync(ACCOUNTS_FILE)) {
        console.error(`Error: Accounts file not found at ${ACCOUNTS_FILE}`);
        process.exit(1);
    }
    const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf-8');
    const clean = stripJsonComments(raw);
    try {
        const data = JSON.parse(clean);
        return Array.isArray(data) ? data : (data.accounts || []);
    } catch (e) {
        console.error("Error parsing accounts.github.json:", e.message);
        process.exit(1);
    }
}

// Load Session (Cookies & Fingerprint)
function loadSession(email) {
    const baseDir = path.join(SESSIONS_DIR, email);
    const cookiePath = path.join(baseDir, 'desktop_cookies.json');
    const fingerprintPath = path.join(baseDir, 'desktop_fingerprint.json');

    let cookies = [];
    let fingerprint = null;

    if (fs.existsSync(cookiePath)) {
        try {
            cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
        } catch (e) {
            console.warn(`Warning: Could not parse cookies for ${email}`);
        }
    }

    if (fs.existsSync(fingerprintPath)) {
        try {
            fingerprint = JSON.parse(fs.readFileSync(fingerprintPath, 'utf-8'));
        } catch (e) {
            console.warn(`Warning: Could not parse fingerprint for ${email}`);
        }
    }

    return { cookies, fingerprint };
}

async function launchBrowser(account) {
    console.log(`\n🚀 Launching browser for: ${account.email}`);

    // Proxy Config
    let proxy = undefined;
    if (account.proxy && account.proxy.url) {
        try {
            const url = account.proxy.url.includes('://') ? account.proxy.url : `http://${account.proxy.url}`;
            const parsed = new URL(url);
            if (!parsed.port && account.proxy.port) parsed.port = account.proxy.port.toString();
            proxy = {
                server: parsed.toString().replace(/\/$/, ''),
                username: account.proxy.username,
                password: account.proxy.password
            };
            console.log(`🌐 Using Proxy: ${proxy.server}`);
        } catch (e) {
            console.error(`Invalid Proxy URL: ${account.proxy.url}`);
        }
    } else {
        console.warn('⚠️ No Proxy configured - Using Direct Connection');
    }

    const { cookies, fingerprint } = loadSession(account.email);

    if (cookies.length === 0) {
        console.warn('⚠️ No saved cookies found! You may need to login manually.');
    }

    const browser = await chromium.launch({
        headless: false,
        proxy: proxy,
        args: [
            '--no-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--start-maximized'
        ],
        channel: 'chrome' // Try using installed Chrome
    });

    let context;
    if (fingerprint) {
        console.log('🕵️ Injecting saved fingerprint...');
        context = await newInjectedContext(browser, {
            fingerprint: fingerprint,
            newContextOptions: {
                viewport: null // Allow window resize
            }
        });
    } else {
        console.warn('⚠️ No fingerprint found! Creating standard context.');
        context = await browser.newContext({ viewport: null });
    }

    if (cookies.length > 0) {
        console.log(`🍪 Restoring ${cookies.length} cookies...`);
        await context.addCookies(cookies);
    }

    const page = await context.newPage();

    console.log('IGNORE_ME: Navigating to Bing Rewards...');
    try {
        await page.goto('https://rewards.bing.com/', { timeout: 60000 });
    } catch (e) {
        console.log('Navigation error (might be proxy issue):', e.message);
    }

    console.log('\n✅ Browser is ready! You can now interact manually.');
    console.log('❌ Close the browser window to return to menu.');

    // Keep script alive until browser is closed
    return new Promise(resolve => {
        browser.on('disconnected', () => {
            console.log('Browser closed.');
            resolve();
        });
    });
}

// Main Menu
async function main() {
    const accounts = loadAccounts();
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    while (true) {
        console.clear();
        console.log('================================================');
        console.log('   MANUAL LOGIN TOOL - HYBRID REWARDS BOT');
        console.log('================================================');

        accounts.forEach((acc, idx) => {
            console.log(`${idx + 1}. ${acc.email} ${acc.proxy?.url ? '[Proxy]' : ''}`);
        });
        console.log('0. Exit');
        console.log('================================================');

        const answer = await new Promise(resolve => {
            rl.question('Select account to view (0-Exit): ', resolve);
        });

        const choice = parseInt(answer);
        if (isNaN(choice)) continue;
        if (choice === 0) {
            console.log('Bye!');
            process.exit(0);
        }

        if (choice > 0 && choice <= accounts.length) {
            const selected = accounts[choice - 1];
            await launchBrowser(selected);
            // Wait a bit before showing menu again
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

main().catch(console.error);
