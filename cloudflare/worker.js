/**
 * Cloudflare Worker for MS Rewards Bot Control
 * 
 * 🛠️ SETUP INSTRUCTIONS:
 * 1. Create a new Worker in Cloudflare Dashboard
 * 2. Paste this code into `worker.js`
 * 3. Go to Settings -> Variables and add:
 *    - `TG_BOT_TOKEN`: Your Telegram Bot Token
 *    - `GH_TOKEN`: Your GitHub Personal Access Token (Scopes: repo, workflow)
 *    - `GH_OWNER`: Your GitHub Username (e.g., Rai123qt)
 *    - `GH_REPO`: Your Repository Name (e.g., MS-RW)
 *    - `ALLOWED_USER_ID`: (Optional) Your Telegram User ID to prevent strangers from using bot
 * 4. Set Webhook: https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=<YOUR_WORKER_URL>
 */

export default {
    async fetch(request, env, ctx) {
        // Verify POST request
        if (request.method === 'POST') {
            try {
                const payload = await request.json();
                if (payload.message) {
                    await handleMessage(payload.message, env);
                }
            } catch (e) {
                console.error(e);
            }
            return new Response('OK');
        }
        return new Response('🤖 MS Rewards Control Bot is Active');
    }
};

async function handleMessage(msg, env) {
    const chatId = msg.chat.id;
    const text = msg.text || '';
    const userId = msg.from.id;

    // 🔒 Security Check (Optional but recommended)
    if (env.ALLOWED_USER_ID && String(userId) !== String(env.ALLOWED_USER_ID)) {
        return; // Ignore unauthorized users
    }

    // Command: /run [filter] [check_delay]
    // Example: /run or /run thomas or /run all true
    if (text.startsWith('/run')) {
        const parts = text.split(' ');
        const accountFilter = parts[1] || 'all';
        const skipDelay = parts[2] === 'true' || parts[2] === 'yes' ? true : false;

        await sendMessage(env, chatId, `🚀 *Triggering Farm...*\nAccount: \`${accountFilter}\`\nSkip Delay: \`${skipDelay}\``);

        try {
            const resp = await triggerWorkflow(env, accountFilter, skipDelay);
            if (resp.status === 204) {
                await sendMessage(env, chatId, '✅ Command sent to GitHub successfully!');
            } else {
                const err = await resp.text();
                await sendMessage(env, chatId, `❌ Failed to trigger: ${err}`);
            }
        } catch (e) {
            await sendMessage(env, chatId, `❌ Error: ${e.message}`);
        }
    }

    // Command: /schedule HH:mm
    // Example: /schedule 16:00 (Sets run time to 4:00 PM VN Time)
    else if (text.startsWith('/schedule')) {
        const parts = text.split(' ');
        const timeInput = parts[1]; // HH:mm

        if (!timeInput || !timeInput.includes(':')) {
            await sendMessage(env, chatId, '⚠️ Invalid format. Use: `/schedule HH:mm` (24h format, VN Time)\nExample: `/schedule 16:00`');
            return;
        }

        const [hour, minute] = timeInput.split(':').map(Number);
        if (isNaN(hour) || isNaN(minute) || hour > 23 || minute > 59) {
            await sendMessage(env, chatId, '⚠️ Invalid time.');
            return;
        }

        // Convert VN (UTC+7) to UTC
        let utcHour = hour - 7;
        if (utcHour < 0) utcHour += 24;

        const cronString = `${minute} ${utcHour} * * *`; // Run daily at specific time

        await sendMessage(env, chatId, `🔄 Updating schedule to **${timeInput} VN** (Cron: \`${cronString}\`)...`);

        try {
            const result = await updateWorkflowSchedule(env, cronString);
            if (result) {
                await sendMessage(env, chatId, `✅ Schedule updated! Bot will run daily at **${timeInput} VN**.`);
            } else {
                await sendMessage(env, chatId, '❌ Failed to update schedule. Check logs.');
            }
        } catch (e) {
            await sendMessage(env, chatId, `❌ Error: ${e.message}`);
        }
    }

    // Command: /help
    else if (text.startsWith('/help') || text.startsWith('/start')) {
        await sendMessage(env, chatId,
            `🤖 **MS Rewards Control**

Commands:
`/ run[filter]` - Run bot immediately
Example: \`/run\` (all)
Example: \`/run thomas\` (specific)

`/ schedule HH: mm` - Set daily run time (VN Time)
Example: \`/schedule 04:00\` (4 AM)
Example: \`/schedule 16:30\` (4:30 PM)

`/ status` - (Coming soon) Check bot status`);
    }
}

// ---------------------------------------------------------
// GitHub API Helpers
// ---------------------------------------------------------

async function triggerWorkflow(env, filter, skipDelay) {
    const url = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/actions/workflows/farm.yml/dispatches`;

    return await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.GH_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Cloudflare-Worker'
        },
        body: JSON.stringify({
            ref: 'master',
            inputs: {
                account_filter: filter,
                skip_delay: skipDelay ? 'true' : 'false'
            }
        })
    });
}

async function updateWorkflowSchedule(env, newCron) {
    const filePath = '.github/workflows/farm.yml';
    const url = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/contents/${filePath}`;

    // 1. Get current file (need SHA)
    const getResp = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${env.GH_TOKEN}`,
            'User-Agent': 'Cloudflare-Worker'
        }
    });

    if (!getResp.ok) throw new Error('Could not find farm.yml');
    const data = await getResp.json();
    const sha = data.sha;
    const content = atob(data.content); // Decode Base64

    // 2. Replace Cron
    // Use regex to find "cron: '...'"
    const regex = /cron: '.*'/;
    if (!regex.test(content)) throw new Error('Could not find pattern: cron: \'...\' in file');

    const newContent = content.replace(regex, `cron: '${newCron}'`);

    // 3. Push Update
    const putResp = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${env.GH_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Cloudflare-Worker'
        },
        body: JSON.stringify({
            message: `Update schedule to ${newCron} via Telegram Bot`,
            content: btoa(newContent), // Encode Base64
            sha: sha
        })
    });

    return putResp.ok;
}

// ---------------------------------------------------------
// Telegram Helpers
// ---------------------------------------------------------

async function sendMessage(env, chatId, text) {
    const url = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown'
        })
    });
}
