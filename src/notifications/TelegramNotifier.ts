import axios from 'axios'

export interface AccountResult {
    email: string
    desktopPoints: { earned: number; max: number }
    mobilePoints: { earned: number; max: number }
    dailySetPoints: { earned: number; max: number }
    morePromosPoints: { earned: number; max: number }
    totalPoints: number
    success: boolean
    error?: string
}

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

    private maskEmail(email: string): string {
        const parts = email.split('@')
        const user = parts[0] || ''
        const domain = parts[1] || ''
        if (user.length <= 4) return email
        return `${user.substring(0, 3)}***@${domain}`
    }

    async sendSummary(results: AccountResult[], durationMs: number): Promise<void> {
        if (!this.enabled) return

        const date = new Date().toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            timeZone: 'Asia/Ho_Chi_Minh'
        })

        let message = `📊 <b>MS Rewards - ${date}</b>\n`
        message += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`

        let totalAllPoints = 0
        let successCount = 0
        const issues: string[] = []

        for (const result of results) {
            const email = this.maskEmail(result.email)

            if (result.success) {
                successCount++
                message += `👤 <b>${email}</b>\n`
                message += `   🖥️ Desktop: ${this.formatStatus(result.desktopPoints.earned, result.desktopPoints.max)}\n`
                message += `   📱 Mobile: ${this.formatStatus(result.mobilePoints.earned, result.mobilePoints.max)}\n`
                message += `   📋 Daily Set: ${this.formatStatus(result.dailySetPoints.earned, result.dailySetPoints.max)}\n`
                message += `   🎯 Promos: ${this.formatStatus(result.morePromosPoints.earned, result.morePromosPoints.max)}\n`
                message += `   💰 <b>Total: ${result.totalPoints} pts</b>\n\n`

                totalAllPoints += result.totalPoints

                // Track issues
                if (result.desktopPoints.earned < result.desktopPoints.max) {
                    issues.push(`${email}: Desktop thiếu ${result.desktopPoints.max - result.desktopPoints.earned}`)
                }
                if (result.mobilePoints.earned < result.mobilePoints.max) {
                    issues.push(`${email}: Mobile thiếu ${result.mobilePoints.max - result.mobilePoints.earned}`)
                }
            } else {
                message += `👤 <b>${email}</b>\n`
                message += `   ❌ <i>Failed: ${result.error || 'Unknown error'}</i>\n\n`
                issues.push(`${email}: Failed`)
            }
        }

        const durationMin = Math.round(durationMs / 60000)
        message += `━━━━━━━━━━━━━━━━━━━━━━━\n`
        message += `📈 <b>TỔNG: ${totalAllPoints} pts</b>\n`
        message += `✅ Success: ${successCount}/${results.length}\n`
        message += `⏱️ Duration: ${durationMin} min\n`

        if (issues.length > 0) {
            message += `\n⚠️ <b>Issues:</b>\n`
            issues.forEach(issue => {
                message += `   • ${issue}\n`
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
