/**
 * Cloudflare Worker v3.0 (Smart Control)
 * Features: Menu, Schedule Check, Status Check, Proximity Warning
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
        return new Response('Smart Bot Active v3.0');
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

    // Stop loading animation
    await answerCallback(cb.id, env);

    if (data === 'MAIN_MENU') {
        await editMessage(chatId, messageId, env, '🤖 **CONTROL CENTER**\nChọn tác vụ mong muốn:', getMainMenuKeyboard());
    }

    // PRE-CHECK before showing confirmation
    else if (data === 'MENU_RUN_ALL' || data === 'MENU_SELECT_ACC') {
        await performPreRunCheck(chatId, messageId, env, data);
    }

    else if (data === 'CHECK_STATUS') {
        await editMessage(chatId, messageId, env, '🔍 Đang kiểm tra trạng thái...');
        const status = await checkGithubStatus(env);
        await editMessage(chatId, messageId, env, `� **TRẠNG THÁI HỆ THỐNG**\n\n${status}`, getMainMenuKeyboard());
    }

    // Handle Account Selection (Step 2)
    else if (data.startsWith('SELECT_ACC_CONFIRM:')) {
        const email = data.split(':')[1];
        await editMessage(chatId, messageId, env,
            `👤 **XÁC NHẬN CHẠY LẺ**\n\nAcc: \`${email}\`\nChắc chắn chạy?`,
            getConfirmKeyboard(email)
        );
    }

    // Execute Run
    else if (data.startsWith('DO_RUN:')) {
        const filter = data.split(':')[1];
        await editMessage(chatId, messageId, env, `🚀 **Đang gửi lệnh...**\nFilter: \`${filter}\``);
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
        await editMessage(chatId, messageId, env, '⏳ Đang kiểm tra lịch...');
        try {
            const schedInfo = await getScheduleInfo(env);
            await editMessage(chatId, messageId, env,
                `🕒 **CÀI ĐẶT LỊCH CHẠY**\n\n` +
                `📅 **Lịch hiện tại:** ${schedInfo.display}\n\n` +
                `📝 **Cú pháp đổi lịch:**\n\`/schedule HH:mm\`\nVí dụ: \`/schedule 04:00\` (4h sáng VN)`,
                getMainMenuKeyboard()
            );
        } catch (e) {
            await editMessage(chatId, messageId, env, `❌ Lỗi: ${e.message}`, getMainMenuKeyboard());
        }
    }
}

// ------------------------------------------------------------------
// SMART CHECKS
// ------------------------------------------------------------------

async function performPreRunCheck(chatId, messageId, env, nextAction) {
    // 1. Check active runs
    await editMessage(chatId, messageId, env, '🔍 Đang kiểm tra hệ thống...');

    const activeRun = await getActiveWorkflowRun(env);
    let warningMsg = '';

    if (activeRun) {
        warningMsg += `⚠️ **CẢNH BÁO:** Bot ĐANG CHẠY!\n(Started: ${activeRun.run_started_at})\nNếu bạn chạy tiếp, lệnh sẽ bị **Xếp Hàng (Queued)**.\n\n`;
    }

    // 2. Check schedule proximity (only if not running)
    if (!activeRun) {
        const schedInfo = await getScheduleInfo(env);
        if (schedInfo.minutesUntilNext < 60 && schedInfo.minutesUntilNext > 0) {
            warningMsg += `⏳ **LƯU Ý:** Chỉ còn **${schedInfo.minutesUntilNext} phút** nữa là đến giờ Auto (${schedInfo.display}).\nBạn có muốn đợi Auto chạy không?\n\n`;
        }
    }

    // If warnings exist, show them in the confirmation
    if (warningMsg) {
        const confirmBtnText = activeRun ? 'Xếp hàng chạy tiếp' : 'Vẫn chạy ngay';

        // If user wanted run all
        if (nextAction === 'MENU_RUN_ALL') {
            await editMessage(chatId, messageId, env,
                `${warningMsg}❓ **Bạn có chắc chắn muốn chạy TẤT CẢ không?**`,
                getConfirmKeyboard('all', confirmBtnText)
            );
        }
        // If user wanted select acc -> Show list but with warning header (bit complex to UI, lets just show list)
        else {
            // For select acc, just show the list, user will see warning again on confirm? 
            // Or better: Show warning first, then options
            await editMessage(chatId, messageId, env,
                `${warningMsg}👇 **Chọn tài khoản để chạy:**`,
                getAccountListKeyboard()
            );
        }
    } else {
        // No warnings - proceed normally
        if (nextAction === 'MENU_RUN_ALL') {
            await editMessage(chatId, messageId, env, '⚠️ **XÁC NHẬN CHẠY ALL**\n\nChạy TẤT CẢ tài khoản?', getConfirmKeyboard('all'));
        } else {
            await editMessage(chatId, messageId, env, '👤 **CHỌN TÀI KHOẢN**:', getAccountListKeyboard());
        }
    }
}

async function checkGithubStatus(env) {
    const active = await getActiveWorkflowRun(env);
    if (active) {
        return `running **ĐANG CHẠY**\n🕒 Bắt đầu: ${active.run_started_at}\n🔗 [Xem Log](${active.html_url})`;
    } else {
        return `✅ **RẢNH RỖI**\nKhông có tiến trình nào đang chạy.`;
    }
}

async function getActiveWorkflowRun(env) {
    const url = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/actions/runs?status=in_progress`;
    const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${env.GH_TOKEN}`, 'User-Agent': 'CF-Worker' } });
    const data = await resp.json();
    if (data.total_count && data.total_count > 0) {
        return data.workflow_runs[0]; // Return first active run
    }
    return null;
}

async function getScheduleInfo(env) {
    const url = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/contents/.github/workflows/farm.yml`;
    const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${env.GH_TOKEN}`, 'User-Agent': 'CF-Worker' } });
    if (!resp.ok) return { display: 'N/A', minutesUntilNext: 999 };

    const data = await resp.json();
    const content = atob(data.content);
    const match = content.match(/cron: '(\d+) (\d+) \* \* \*'/);

    if (!match) return { display: 'Chưa cài', minutesUntilNext: 999 };

    const min = parseInt(match[1]);
    const utcHour = parseInt(match[2]);
    let vnHour = utcHour + 7;
    if (vnHour >= 24) vnHour -= 24;

    const display = `**${vnHour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}** (VN Time)`;

    // Calc diff
    const now = new Date(); // Cloudflare default is UTC
    const nowUtcHour = now.getUTCHours();
    const nowUtcMin = now.getUTCMinutes();

    let nextRun = new Date();
    nextRun.setUTCHours(utcHour, min, 0, 0);

    // If next run is in past today, move to tomorrow
    if (nextRun <= now) {
        nextRun.setDate(nextRun.getDate() + 1);
    }

    const diffMs = nextRun.getTime() - now.getTime();
    const minutesUntilNext = Math.floor(diffMs / 60000);

    return { display, minutesUntilNext };
}

// ------------------------------------------------------------------
// KEYBOARDS
// ------------------------------------------------------------------

function getMainMenuKeyboard() {
    return {
        inline_keyboard: [
            [{ text: '🚀 Chạy TẤT CẢ', callback_data: 'MENU_RUN_ALL' }],
            [{ text: '👤 Chạy Lẻ', callback_data: 'MENU_SELECT_ACC' }],
            [{ text: '📊 Kiểm tra Trạng thái', callback_data: 'CHECK_STATUS' }],
            [{ text: '📅 Xem & Đặt Lịch Auto', callback_data: 'GUIDE_SCHEDULE' }]
        ]
    };
}

function getAccountListKeyboard() {
    const buttons = ACCOUNTS.map(email => ([
        { text: email.split('@')[0], callback_data: `SELECT_ACC_CONFIRM:${email}` }
    ]));
    buttons.push([{ text: '🔙 Quay lại', callback_data: 'MAIN_MENU' }]);
    return { inline_keyboard: buttons };
}

function getConfirmKeyboard(filter, yesText = '✅ CHẠY NGAY') {
    return {
        inline_keyboard: [
            [{ text: yesText, callback_data: `DO_RUN:${filter}` }, { text: '❌ HỦY', callback_data: 'CANCEL' }],
            [{ text: '🔙 Quay lại', callback_data: 'MAIN_MENU' }]
        ]
    };
}

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------
async function handleScheduleCommand(chatId, text, env) {
    // ... (Same as before)
    const parts = text.split(' ');
    const timeInput = parts[1];
    if (!timeInput || !timeInput.includes(':')) {
        await sendMessage(env, chatId, '⚠️ **Sai cú pháp!** Dùng: `/schedule HH:mm`'); return;
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
            await sendMessage(env, chatId, '❌ Lỗi GitHub.');
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
