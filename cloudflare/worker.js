/**
 * Cloudflare Worker for MS Rewards Bot Control
 * Features: Interactive Menu, Safety Checks, Schedule Viewer
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
        return new Response('Bot Active v2.0');
    }
};

async function handleMessage(msg, env) {
    const chatId = msg.chat.id;
    const text = msg.text || '';
    if (text.startsWith('/schedule')) {
        await handleScheduleCommand(chatId, text, env);
        return;
    }
    await sendMessage(env, chatId, '🤖 **CONTROL CENTER**\nChọn tác vụ mong muốn:', getMainMenuKeyboard());
}

async function handleCallback(cb, env) {
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;
    const data = cb.data;

    await answerCallback(cb.id, env);

    if (data === 'MAIN_MENU') {
        await editMessage(chatId, messageId, env, '🤖 **CONTROL CENTER**\nChọn tác vụ mong muốn:', getMainMenuKeyboard());
    }

    else if (data === 'MENU_RUN_ALL') {
        await editMessage(chatId, messageId, env, '⚠️ **XÁC NHẬN CHẠY ALL**\n\nChạy TẤT CẢ tài khoản?', getConfirmKeyboard('all'));
    }

    else if (data === 'MENU_SELECT_ACC') {
        await editMessage(chatId, messageId, env, '👤 **CHỌN TÀI KHOẢN**:', getAccountListKeyboard());
    }

    else if (data.startsWith('CONFIRM_ACC:')) {
        const email = data.split(':')[1];
        await editMessage(chatId, messageId, env, `⚠️ **XÁC NHẬN CHẠY LẺ**\n\nAcc: \`${email}\`\nChắc chắn chạy?`, getConfirmKeyboard(email));
    }

    else if (data.startsWith('DO_RUN:')) {
        const filter = data.split(':')[1];
        await editMessage(chatId, messageId, env, `🚀 **Sending Request...**\nFilter: \`${filter}\``);
        try {
            const resp = await triggerWorkflow(env, filter);
            if (resp.status === 204) {
                await sendMessage(env, chatId, `✅ **THÀNH CÔNG!**\nĐã kích hoạt GitHub.\nFilter: \`${filter}\``);
                await sendMessage(env, chatId, '👇 Tiếp tục:', getMainMenuKeyboard());
            } else {
                await sendMessage(env, chatId, `❌ **LỖI:** ${await resp.text()}`);
            }
        } catch (e) {
            await sendMessage(env, chatId, `❌ Error: ${e.message}`);
        }
    }

    else if (data === 'CANCEL') {
        await editMessage(chatId, messageId, env, '❌ Đã hủy.');
        await sendMessage(env, chatId, '👇 Menu chính:', getMainMenuKeyboard());
    }

    else if (data === 'GUIDE_SCHEDULE') {
        // Fetch current schedule
        await editMessage(chatId, messageId, env, '⏳ Đang kiểm tra lịch trên GitHub...');
        try {
            const currentSchedule = await getCurrentSchedule(env);
            await editMessage(chatId, messageId, env,
                `🕒 **CÀI ĐẶT LỊCH CHẠY**\n\n` +
                `� **Lịch hiện tại:** ${currentSchedule}\n\n` +
                `📝 **Cú pháp đổi lịch:**\n` +
                `\`/schedule HH:mm\`\n` +
                `Ví dụ: \`/schedule 04:00\` (4h sáng VN)`,
                getMainMenuKeyboard()
            );
        } catch (e) {
            await editMessage(chatId, messageId, env, `❌ Lỗi lấy lịch: ${e.message}`, getMainMenuKeyboard());
        }
    }
}

// Keyboards
function getMainMenuKeyboard() {
    return {
        inline_keyboard: [
            [{ text: '🚀 Chạy TẤT CẢ', callback_data: 'MENU_RUN_ALL' }],
            [{ text: '👤 Chạy Lẻ', callback_data: 'MENU_SELECT_ACC' }],
            [{ text: '� Xem & Đặt Lịch Auto', callback_data: 'GUIDE_SCHEDULE' }]
        ]
    };
}

function getAccountListKeyboard() {
    const buttons = ACCOUNTS.map(email => ([
        { text: email.split('@')[0], callback_data: `CONFIRM_ACC:${email}` }
    ]));
    buttons.push([{ text: '🔙 Quay lại', callback_data: 'MAIN_MENU' }]);
    return { inline_keyboard: buttons };
}

function getConfirmKeyboard(filter) {
    return {
        inline_keyboard: [
            [{ text: '✅ CHẠY NGAY', callback_data: `DO_RUN:${filter}` }, { text: '❌ HỦY', callback_data: 'CANCEL' }],
            [{ text: '🔙 Quay lại', callback_data: 'MAIN_MENU' }]
        ]
    };
}

// Logic
async function handleScheduleCommand(chatId, text, env) {
    const parts = text.split(' ');
    const timeInput = parts[1];
    if (!timeInput || !timeInput.includes(':')) {
        await sendMessage(env, chatId, '⚠️ **Sai cú pháp!** Dùng: `/schedule HH:mm`');
        return;
    }
    const [hour, minute] = timeInput.split(':').map(Number);
    let utcHour = hour - 7;
    if (utcHour < 0) utcHour += 24;
    const cronString = `${minute} ${utcHour} * * *`;

    await sendMessage(env, chatId, `🔄 Đang cập nhật...`);
    try {
        if (await updateWorkflowSchedule(env, cronString)) {
            await sendMessage(env, chatId, `✅ **Thành công!** Lịch mới: **${timeInput}** hàng ngày.`);
        } else {
            await sendMessage(env, chatId, '❌ Lỗi cập nhật file GitHub.');
        }
    } catch (e) {
        await sendMessage(env, chatId, `❌ Error: ${e.message}`);
    }
}

async function triggerWorkflow(env, filter) {
    return await fetch(`https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/actions/workflows/farm.yml/dispatches`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.GH_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Cloudflare-Worker' },
        body: JSON.stringify({ ref: 'master', inputs: { account_filter: filter, skip_delay: 'true' } })
    });
}

// New: Get Schedule
async function getCurrentSchedule(env) {
    const url = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/contents/.github/workflows/farm.yml`;
    const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${env.GH_TOKEN}`, 'User-Agent': 'CF-Worker' } });
    if (!resp.ok) return 'Không tìm thấy file';

    const data = await resp.json();
    const content = atob(data.content);

    // Regex finding "cron: 'mm hh * * *'"
    const match = content.match(/cron: '(\d+) (\d+) \* \* \*'/);
    if (!match) return 'Chưa cài đặt';

    const min = parseInt(match[1]);
    const utcHour = parseInt(match[2]);

    // Convert UTC to VN (UTC+7)
    let vnHour = utcHour + 7;
    if (vnHour >= 24) vnHour -= 24;

    const minStr = min.toString().padStart(2, '0');
    const hourStr = vnHour.toString().padStart(2, '0');

    return `**${hourStr}:${minStr}** (VN Time)`;
}

async function updateWorkflowSchedule(env, newCron) {
    const url = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/contents/.github/workflows/farm.yml`;
    const getResp = await fetch(url, { headers: { 'Authorization': `Bearer ${env.GH_TOKEN}`, 'User-Agent': 'CF-Worker' } });
    const data = await getResp.json();
    const content = atob(data.content);
    const newContent = content.replace(/cron: '.*'/, `cron: '${newCron}'`);
    const putResp = await fetch(url, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${env.GH_TOKEN}`, 'User-Agent': 'CF-Worker' },
        body: JSON.stringify({ message: `Update schedule to ${newCron}`, content: btoa(newContent), sha: data.sha })
    });
    return putResp.ok;
}

// API Helpers
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
