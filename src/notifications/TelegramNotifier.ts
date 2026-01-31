import axios from 'axios'
import type { SummaryData } from '../flows/SummaryReporter'

export interface TelegramConfig {
    enabled: boolean
    botToken: string
    chatId: string
}

export class TelegramNotifier {
    private apiUrl: string
    private chatId: string
    private enabled: boolean

    constructor(config: TelegramConfig) {
        this.enabled = config.enabled
        this.apiUrl = `https://api.telegram.org/bot${config.botToken}/sendMessage`
        this.chatId = config.chatId
    }

    private formatStatus(earned: number, max: number): string {
        if (max === 0) return '—'
        if (earned >= max) return `${earned}/${max} ✅`
        return `${earned}/${max} ⚠️`
    }

    async sendSummary(summary: SummaryData): Promise<void> {
        if (!this.enabled) return

        const date = new Date().toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            timeZone: 'Asia/Ho_Chi_Minh'
        })

        const durationMs = summary.endTime.getTime() - summary.startTime.getTime()
        const durationMin = Math.round(durationMs / 60000)

        let message = `📊 <b>MS Rewards - ${date}</b>\n`
        message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`

        let totalAllPoints = 0
        const issues: string[] = []

        for (const account of summary.accounts) {
            const hasFailure = Boolean(account.errors?.length) || account.banned === true

            if (!hasFailure) {
                const desktopMax = 90 // Typical desktop max
                const mobileMax = 60  // Typical mobile max

                message += `👤 <b>${account.email}</b>\n`
                message += `🖥️ ${this.formatStatus(account.desktopPoints, desktopMax)} | `
                message += `📱 ${this.formatStatus(account.mobilePoints, mobileMax)}\n`
                message += `💰 <b>Total: ${account.pointsEarned} pts</b> | Balance: ${account.finalPoints}\n\n`

                totalAllPoints += account.pointsEarned

                // Track issues
                if (account.desktopPoints < desktopMax) {
                    issues.push(`${account.email}: 🖥️ thiếu ${desktopMax - account.desktopPoints}`)
                }
                if (account.mobilePoints < mobileMax) {
                    issues.push(`${account.email}: 📱 thiếu ${mobileMax - account.mobilePoints}`)
                }
            } else {
                message += `👤 <b>${account.email}</b>\n`
                const status = account.banned ? '🚫 BANNED' : '❌ FAILED'
                message += `${status}: ${account.errors?.[0] || 'Unknown error'}\n\n`
                issues.push(`${account.email}: ${status}`)
            }
        }

        message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
        message += `📈 <b>TỔNG: ${summary.totalPoints} pts</b>\n`
        message += `✅ ${summary.successCount}/${summary.accounts.length} | ⏱️ ${durationMin} min\n`

        if (issues.length > 0) {
            message += `\n⚠️ <b>Issues:</b>\n`
            issues.slice(0, 10).forEach(issue => {
                message += `• ${issue}\n`
            })
        }

        try {
            await axios.post(this.apiUrl, {
                chat_id: this.chatId,
                text: message,
                parse_mode: 'HTML'
            })
        } catch (error) {
            console.error('[TELEGRAM] Failed to send message:', error instanceof Error ? error.message : error)
        }
    }

    async sendTestMessage(): Promise<boolean> {
        if (!this.enabled) return false

        try {
            await axios.post(this.apiUrl, {
                chat_id: this.chatId,
                text: '✅ <b>MS Rewards Bot</b> - Telegram notification configured successfully!',
                parse_mode: 'HTML'
            })
            return true
        } catch (error) {
            console.error('[TELEGRAM] Test message failed:', error instanceof Error ? error.message : error)
            return false
        }
    }
}
