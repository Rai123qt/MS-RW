import { Page } from 'patchright'
import { Workers } from '../Workers'

export class BonusClaim extends Workers {

    async doBonusClaim(page: Page) {
        this.bot.log(this.bot.isMobile, 'BONUS-CLAIM', 'Trying to claim bonus points')

        try {
            await this.bot.utils.wait(2000)

            // Look for "Claim" button and click it
            const claimSelector = 'button:has-text("Claim"), a:has-text("Claim"), div[role="button"]:has-text("Claim")'
            const claimBtn = await page.$(claimSelector)

            if (claimBtn) {
                this.bot.log(this.bot.isMobile, 'BONUS-CLAIM', 'Found Claim button, clicking...')
                await claimBtn.click()
                await this.bot.utils.wait(3000) // Wait for claim to process
            } else {
                this.bot.log(this.bot.isMobile, 'BONUS-CLAIM', 'Claim button not found, maybe auto-claimed?', 'warn')
            }

            await page.close()
            this.bot.log(this.bot.isMobile, 'BONUS-CLAIM', 'Completed Bonus Claim')
        } catch (error) {
            await page.close()
            this.bot.log(this.bot.isMobile, 'BONUS-CLAIM', 'An error occurred:' + error, 'error')
        }
    }
}
