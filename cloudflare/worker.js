/**
 * Cloudflare Worker for MS Rewards Bot Control (Interactive Menu Version)
 * 
 * 🛠️ SETUP:
 * Variables required: TG_BOT_TOKEN, GH_TOKEN, GH_OWNER, GH_REPO
 */

const ACCOUNTS = [
    'thomas.baker.k49m@outlook.com',
    'kevin.turner.x92a@outlook.com',
    'david.wilson.p55q@outlook.com',
    'ryan.cooper.b10z@outlook.com',
    'emily.davis.h44q@hotmail.com'
];

export default {
    async fetch(request, env, ctx) {
        if (request.method === 'POST') {
            try {
                const payload = await request.json();
                if (payload.callback_query) await handleCallback(payload.callback_query, env);
                else if (payload.message) await handleMessage(payload.message, env);
            } catch (e) {
                console.error(e);
            }
            return new Response('OK');
        }
        return new Response('Bot is Active (Interactive Mode)');
    }
};

// ------------------------------------------------------------------
// HANDLERS
// ------------------------------------------------------------------

async function handleMessage(msg, env) {
    const chatId = msg.chat.id;
    const text = msg.text || '';

    // Security check logic here if needed

    if (text.startsWith('/schedule')) {
        await handleScheduleCommand(chatId, text, env);
        return;
    }

    // Default: Show Main Menu
    await sendMainMenu(chatId, env, '🤖 **CONTROL CENTER**\nChọn tác vụ mong muốn:');
}

async function handleCallback(cb, env) {
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;
    const data = cb.data;

    // Answer callback to stop loading animation
    await answerCallback(cb.id, env);

    if (data === 'MAIN_MENU') {
        await editMessage(chatId, messageId, env, '🤖 **CONTROL CENTER**\nChọn tác vụ mong muốn:', getMainMenuKeyboard());
    }

    else if (data === 'MENU_RUN_ALL') {
        await editMessage(chatId, messageId, env,
            '⚠️ **XÁC NHẬN CHẠY ALL**\n\nBạn có chắc chắn muốn chạy **TẤT CẢ** tài khoản ngay bây giờ?',
            getConfirmKeyboard('all')
        );
    }

    else if (data === 'MENU_SELECT_ACC') {
        await editMessage(chatId, messageId, env,
            '👤 **CHỌN TÀI KHOẢN**\n\nChọn tài khoản bạn muốn chạy lẻ:',
            getAccountListKeyboard()
        );
    }

    else if (data.startsWith('CONFIRM_ACC:')) {
        const email = data.split(':')[1];
        await editMessage(chatId, messageId, env,
            `⚠️ **XÁC NHẬN CHẠY LẺ**\n\nTài khoản: \`${email}\`\n\nBạn có chắc chắn muốn chạy?`,
            getConfirmKeyboard(email)
        );
    }

    else if (data.startsWith('DO_RUN:')) {
        const filter = data.split(':')[1];
        await editMessage(chatId, messageId, env,
            `🚀 **Đang gửi lệnh...**\nFilter: \`${filter}\`\n\nVui lòng đợi...`,
            null
        );

        try {
            const resp = await triggerWorkflow(env, filter);
            if (resp.status === 204) {
                await sendMessage(env, chatId, `✅ **THÀNH CÔNG!**\n\nĐã kích hoạt GitHub Actions.\nAccount: \`${filter}\``);
                // Show menu again
                await sendMessage(env, chatId, '👇 Tiếp tục thao tác:', getMainMenuKeyboard());
            } else {
                await sendMessage(env, chatId, `❌ **LỖI:** ${await resp.text()}`);
            }
        } catch (e) {
            await sendMessage(env, chatId, `❌ **System Error:** ${e.message}`);
        }
    }

    else if (data === 'CANCEL') {
        await editMessage(chatId, messageId, env, '❌ Đã hủy thao tác.', null);
        await sendMessage(env, chatId, '👇 Menu chính:', getMainMenuKeyboard());
    }
}

// ------------------------------------------------------------------
// KEYBOARDS
// ------------------------------------------------------------------

function getMainMenuKeyboard() {
    return {
        inline_keyboard: [
            [{ text: '🚀 Chạy TẤT CẢ (Run All)', callback_data: 'MENU_RUN_ALL' }],
            [{ text: '👤 Chạy Lẻ (Select Account)', callback_data: 'MENU_SELECT_ACC' }],
            [{ text: '🕒 Hướng dẫn đặt lịch', callback_data: 'GUIDE_SCHEDULE' }] // Placeholder logic if needed, or just remove
        ]
    };
}

function getAccountListKeyboard() {
    const buttons = ACCOUNTS.map(email => ([
        { text: email.split('@')[0], callback_data: `CONFIRM_ACC:${email}` } // Show name only for brevity
    ]));
    buttons.push([{ text: '🔙 Quay lại', callback_data: 'MAIN_MENU' }]);
    return { inline_keyboard: buttons };
}

function getConfirmKeyboard(filter) {
    return {
        inline_keyboard: [
            [
                { text: '✅ CHẠY NGAY', callback_data: `DO_RUN:${filter}` },
                { text: '❌ HỦY', callback_data: 'CANCEL' }
            ],
            [{ text: '🔙 Quay lại', callback_data: 'MAIN_MENU' }]
        ]
    };
}

// ------------------------------------------------------------------
// LOGIC SCHEDULE & ACTIONS
// ------------------------------------------------------------------

async function handleScheduleCommand(chatId, text, env) {
    const parts = text.split(' ');
    const timeInput = parts[1];

    if (!timeInput || !timeInput.includes(':')) {
        await sendMessage(env, chatId, '⚠️ **Sai cú pháp!**\n\nHãy dùng: `/schedule HH:mm`\nVí dụ: `/schedule 04:00` (4h sáng VN)');
        return;
    }

    const [hour, minute] = timeInput.split(':').map(Number);
    let utcHour = hour - 7;
    if (utcHour < 0) utcHour += 24;
    const cronString = `${minute} ${utcHour} * * *`;

    await sendMessage(env, chatId, `🔄 Đang cập nhật lịch chạy thành **${timeInput}**...`);

    try {
        if (await updateWorkflowSchedule(env, cronString)) {
            await sendMessage(env, chatId, `✅ **Cập nhật thành công!**\n\nBot sẽ tự chạy lúc **${timeInput}** hàng ngày.`);
        } else {
            await sendMessage(env, chatId, '❌ Lỗi khi cập nhật file GitHub.');
        }
    } catch (e) {
        await sendMessage(env, chatId, `❌ Error: ${e.message}`);
    }
}

async function triggerWorkflow(env, filter) {
    return await fetch(`https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/actions/workflows/farm.yml/dispatches`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.GH_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Cloudflare-Worker'
        },
        body: JSON.stringify({ ref: 'master', inputs: { account_filter: filter, skip_delay: 'true' } })
    });
}

async function updateWorkflowSchedule(env, newCron) {
    const url = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/contents/.github/workflows/farm.yml`;
    const getResp = await fetch(url, { headers: { 'Authorization': `Bearer ${env.GH_TOKEN}`, 'User-Agent': 'CF-Worker' } });
    if (!getResp.ok) throw new Error('Repo not found');
    const data = await getResp.json();
    const content = atob(data.content);

    const newContent = content.replace(/cron: '.*'/, `cron: '${newCron}'`);

    const putResp = await fetch(url, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${env.GH_TOKEN}`, 'User-Agent': 'CF-Worker' },
        body: JSON.stringify({
            message: `Update schedule to ${newCron}`,
            content: btoa(newContent),
            sha: data.sha
        })
    });
    return putResp.ok;
}

// ------------------------------------------------------------------
// TELEGRAM API HELPERS
// ------------------------------------------------------------------

async function sendMessage(env, chatId, text, replyMarkup = null) {
    const body = { chat_id: chatId, text: text, parse_mode: 'Markdown' };
    if (replyMarkup) body.reply_markup = replyMarkup;

    await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

async function editMessage(chatId, messageId, env, text, replyMarkup = null) {
    const body = { chat_id: chatId, message_id: messageId, text: text, parse_mode: 'Markdown' };
    if (replyMarkup) body.reply_markup = replyMarkup;

    await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

async function answerCallback(callbackQueryId, env) {
    await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQueryId })
    });
}
