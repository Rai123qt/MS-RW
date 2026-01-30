import { FingerprintGenerator } from 'fingerprint-generator'
import { newInjectedContext } from 'fingerprint-injector'
import patchright, { BrowserContext } from 'patchright'

import { MicrosoftRewardsBot } from '../index'
import { AccountProxy } from '../interface/Account'
import { loadSessionData, saveFingerprintData } from '../util/state/Load'
import { BrowserFunc } from './BrowserFunc'
import { BrowserUtil } from './BrowserUtil'
import { UserAgentManager } from './UserAgentManager'

export class Browser {
  private bot: MicrosoftRewardsBot
  private browserFunc: BrowserFunc
  private browserUtil: BrowserUtil

  constructor(bot: MicrosoftRewardsBot) {
    this.bot = bot
    this.browserFunc = new BrowserFunc(bot)
    this.browserUtil = new BrowserUtil(bot)
  }

  public get func(): BrowserFunc {
    return this.browserFunc
  }

  public get utils(): BrowserUtil {
    return this.browserUtil
  }

  async createBrowser(proxy: AccountProxy, email: string): Promise<BrowserContext> {
    // Auto-install check (simplified from LightZirconite)
    if (process.env.AUTO_INSTALL_BROWSERS === '1') {
      try {
        const { execSync } = await import('child_process')
        this.bot.log(this.bot.isMobile, 'BROWSER', 'Auto-installing Chromium (patchright)...', 'log')
        execSync('npx patchright install chromium', { stdio: 'ignore', timeout: 120000 })
        this.bot.log(this.bot.isMobile, 'BROWSER', 'Chromium installed successfully', 'log')
      } catch (e) {
        this.bot.log(this.bot.isMobile, 'BROWSER', `Auto-install warning: ${e}`, 'warn')
      }
    }

    let browser: import('patchright').Browser
    try {
      const headless = process.env.FORCE_HEADLESS === '1' ? true : (this.bot.config.browser?.headless ?? false)
      const proxyConfig = this.buildProxyConfig(proxy)

      // CRITICAL: Never fall back to direct connection if proxy was intended
      if (proxy.url && !proxyConfig) {
        throw new Error(`Proxy configuration failed for ${proxy.url}. Aborting to prevent IP leak.`)
      }

      if (proxyConfig) {
        this.bot.log(this.bot.isMobile, 'BROWSER', `Using Proxy: ${proxyConfig.server}`, 'log')
      } else {
        this.bot.log(this.bot.isMobile, 'BROWSER', '⚠️ No Proxy configured - Using Direct Connection!', 'warn')
      }

      // Netsky's Minimal Args (Let patchright handle the stealth)
      const args = [
        '--no-sandbox',
        '--mute-audio',
        '--disable-setuid-sandbox',
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-spki-list',
        '--ignore-ssl-errors',
        '--no-first-run',
        '--disable-blink-features=AutomationControlled', // Critical
        '--disable-infobars',
        '--disable-save-password-bubble'
      ]

      // Launch with patchright
      browser = await patchright.chromium.launch({
        headless,
        proxy: proxyConfig,
        args,
        channel: 'chrome' // Try to use installed Chrome if available, otherwise Chromium
      })

      // Load Session & Fingerprint
      // -------------------------------------------------------------------------
      const saveFingerprint = this.bot.config.fingerprinting?.saveFingerprint ??
        (this.bot.config as any).saveFingerprint ?? // Legacy config support
        { mobile: false, desktop: false }

      const sessionData = await loadSessionData(
        this.bot.config.sessionPath,
        email,
        this.bot.isMobile,
        saveFingerprint
      )

      // Hybrid Logic: Use Netsky's generator which combines FingerprintGenerator + Real UA
      const fingerprint = sessionData.fingerprint
        ? sessionData.fingerprint
        : await this.generateHybridFingerprint()

      // Inject Context
      // -------------------------------------------------------------------------
      const context = await newInjectedContext(browser, {
        fingerprint: fingerprint,
        newContextOptions: {
          // CRITICAL: Force US Locale/Timezone at Context level (LightZirconite feature)
          timezoneId: 'America/New_York',
          locale: 'en-US'
        }
      })

      // Set Timeout
      const globalTimeout = this.bot.config.browser?.globalTimeout ?? 30000
      context.setDefaultTimeout(
        typeof globalTimeout === 'number' ? globalTimeout : this.bot.utils.stringToMs(globalTimeout)
      )

      // Setup Page (Resource Blocking & Anti-Popups)
      // -------------------------------------------------------------------------
      context.on('page', async (page: import('patchright').Page) => {
        // 1. Block WebAuthn (Passkeys) - LightZirconite Feature
        await page.addInitScript(() => {
          if (window.navigator.credentials) {
            window.navigator.credentials.create = () => Promise.reject(new DOMException('Blocked', 'NotAllowedError'))
            window.navigator.credentials.get = () => Promise.reject(new DOMException('Blocked', 'NotAllowedError'))
          }
        })

        // 2. Resource Blocking (Bandwidth Saver) - LightZirconite Feature
        if (!headless && !this.bot.isMobile) { // Only block on desktop visible mode, mobile needs more assets
          await page.route('**/*', (route: import('patchright').Route) => {
            const type = route.request().resourceType()
            if (['image', 'media', 'font'].includes(type)) {
              return route.abort()
            }
            return route.continue()
          })
        }
      })

      // Save Fingerprint if new
      if ((this.bot.isMobile && saveFingerprint.mobile) || (!this.bot.isMobile && saveFingerprint.desktop)) {
        await saveFingerprintData(this.bot.config.sessionPath, email, this.bot.isMobile, fingerprint)
      }

      // Restore Cookies
      await context.addCookies(sessionData.cookies)

      this.bot.log(this.bot.isMobile, 'BROWSER', `Hybrid Browser Ready | UA: "${fingerprint.fingerprint.navigator.userAgent.substring(0, 50)}..."`, 'log')

      return context as BrowserContext

    } catch (e) {
      throw new Error(`Failed to launch browser: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  private buildProxyConfig(proxy: AccountProxy) {
    if (!proxy.url) return undefined
    try {
      const url = proxy.url.includes('://') ? proxy.url : `http://${proxy.url}`
      const parsed = new URL(url)
      if (!parsed.port && proxy.port) parsed.port = proxy.port.toString()
      return {
        server: parsed.toString().replace(/\/$/, ''),
        username: proxy.username,
        password: proxy.password
      }
    } catch (e) {
      this.bot.log(this.bot.isMobile, 'BROWSER', `Invalid Proxy: ${proxy.url}`, 'error')
      return undefined
    }
  }

  // The "Hybrid" secret sauce: FingerprintGenerator + UserAgentManager
  async generateHybridFingerprint() {
    // 1. Generate Base Fingerprint (Canvas, Audio, hardware match)
    const generator = new FingerprintGenerator()
    const baseFingerprint = generator.getFingerprint({
      devices: this.bot.isMobile ? ['mobile'] : ['desktop'],
      operatingSystems: this.bot.isMobile ? ['android', 'ios'] : ['windows', 'linux'],
      browsers: [{ name: 'edge' }]
    })

    // 2. Overlay Real-World User Agent (Netsky Component)
    const uaManager = new UserAgentManager(this.bot)
    const hybridFingerprint = await uaManager.updateFingerprintUserAgent(baseFingerprint, this.bot.isMobile)

    return hybridFingerprint
  }
}
