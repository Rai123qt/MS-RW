import axios from 'axios'
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator'

import type { ChromeVersion, EdgeVersion } from '../interface/UserAgentUtil'
import type { MicrosoftRewardsBot } from '../index'

export class UserAgentManager {
    private static readonly NOT_A_BRAND_VERSION = '99'

    constructor(private bot: MicrosoftRewardsBot) { }

    async getUserAgent(isMobile: boolean) {
        const system = this.getSystemComponents(isMobile)
        const app = await this.getAppComponents(isMobile)

        const uaTemplate = isMobile
            ? `Mozilla/5.0 (${system}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${app.chrome_reduced_version} Mobile Safari/537.36 EdgA/${app.edge_version}`
            : `Mozilla/5.0 (${system}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${app.chrome_reduced_version} Safari/537.36 Edg/${app.edge_version}`

        const platformVersion = `${isMobile ? Math.floor(Math.random() * 5) + 9 : Math.floor(Math.random() * 15) + 1}.0.0`

        const uaMetadata = {
            isMobile,
            platform: isMobile ? 'Android' : 'Windows',
            fullVersionList: [
                { brand: 'Not/A)Brand', version: `${UserAgentManager.NOT_A_BRAND_VERSION}.0.0.0` },
                { brand: 'Microsoft Edge', version: app['edge_version'] },
                { brand: 'Chromium', version: app['chrome_version'] }
            ],
            brands: [
                { brand: 'Not/A)Brand', version: UserAgentManager.NOT_A_BRAND_VERSION },
                { brand: 'Microsoft Edge', version: app['edge_major_version'] },
                { brand: 'Chromium', version: app['chrome_major_version'] }
            ],
            platformVersion,
            architecture: isMobile ? '' : 'x86',
            bitness: isMobile ? '' : '64',
            model: ''
        }

        return { userAgent: uaTemplate, userAgentMetadata: uaMetadata }
    }

    async getChromeVersion(isMobile: boolean): Promise<string> {
        try {
            const request = {
                url: 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json',
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }

            const response = await axios(request)
            const data: ChromeVersion = response.data
            return data.channels.Stable.version
        } catch (error) {
            this.bot.log(
                isMobile,
                'USERAGENT-CHROME',
                `An error occurred fetching Chrome version: ${error instanceof Error ? error.message : String(error)}`,
                'error'
            )
            throw error
        }
    }

    async getEdgeVersions(isMobile: boolean) {
        try {
            const request = {
                url: 'https://edgeupdates.microsoft.com/api/products',
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }

            const response = await axios(request)
            const data: EdgeVersion[] = response.data
            const stable = data.find(x => x.Product == 'Stable') as EdgeVersion
            return {
                android: stable.Releases.find(x => x.Platform == 'Android')?.ProductVersion,
                windows: stable.Releases.find(x => x.Platform == 'Windows' && x.Architecture == 'x64')?.ProductVersion
            }
        } catch (error) {
            this.bot.log(
                isMobile,
                'USERAGENT-EDGE',
                `An error occurred fetching Edge version: ${error instanceof Error ? error.message : String(error)}`,
                'error'
            )
            throw error
        }
    }

    // Real-world device profiles with matching Build IDs for authenticity
    private readonly deviceProfiles = [
        // Google Pixel (Clean style)
        { model: 'Pixel 6', android: '12', build: 'SQ3A.220705.004' },
        { model: 'Pixel 7', android: '13', build: 'TQ2A.230505.002' },
        { model: 'Pixel 8 Pro', android: '14', build: 'UD1A.230803.041' },

        // Samsung Galaxy (Build ID style)
        // S21 5G
        { model: 'SM-G991B', android: '12', build: 'SP1A.210812.016' },
        // S21+ 5G
        { model: 'SM-G996B', android: '13', build: 'TP1A.220624.014' },
        // S22 5G
        { model: 'SM-S901B', android: '13', build: 'TP1A.220624.014' },
        // S22 Ultra 5G
        { model: 'SM-S908B', android: '14', build: 'UP1A.231005.007' },
        // S24 Ultra (The one user mentioned)
        // { model: 'SM-S928B', android: '14', build: 'UP1A.231005.007' }
    ]

    getSystemComponents(mobile: boolean): string {
        if (mobile) {
            const profile = this.deviceProfiles[Math.floor(Math.random() * this.deviceProfiles.length)]!

            // Samsung devices typically include the Build ID in the UA
            if (profile.model.startsWith('SM-')) {
                return `Linux; Android ${profile.android}; ${profile.model} Build/${profile.build}`
            }
            // Pixel and others often just show the model
            return `Linux; Android ${profile.android}; ${profile.model}`
        }

        // Randomize Desktop Platform slightly for diversity (though Win10/11 share NT 10.0)
        const desktopPlatforms = [
            'Windows NT 10.0; Win64; x64', // Standard modern 64-bit
            'Windows NT 10.0; WOW64',      // 32-bit app on 64-bit OS (older style)
            'Windows NT 10.0'              // Minimalist (rare but exists)
        ]
        return desktopPlatforms[Math.floor(Math.random() * desktopPlatforms.length)]!
    }

    async getAppComponents(isMobile: boolean) {
        const versions = await this.getEdgeVersions(isMobile)
        const edgeVersion = isMobile ? versions.android : (versions.windows as string)
        const edgeMajorVersion = edgeVersion?.split('.')[0]

        const chromeVersion = await this.getChromeVersion(isMobile)
        const chromeMajorVersion = chromeVersion?.split('.')[0]
        const chromeReducedVersion = `${chromeMajorVersion}.0.0.0`

        return {
            not_a_brand_version: `${UserAgentManager.NOT_A_BRAND_VERSION}.0.0.0`,
            not_a_brand_major_version: UserAgentManager.NOT_A_BRAND_VERSION,
            edge_version: edgeVersion as string,
            edge_major_version: edgeMajorVersion as string,
            chrome_version: chromeVersion as string,
            chrome_major_version: chromeMajorVersion as string,
            chrome_reduced_version: chromeReducedVersion as string
        }
    }

    async updateFingerprintUserAgent(
        fingerprint: BrowserFingerprintWithHeaders,
        isMobile: boolean
    ): Promise<BrowserFingerprintWithHeaders> {
        try {
            const userAgentData = await this.getUserAgent(isMobile)
            const componentData = await this.getAppComponents(isMobile)

            //@ts-expect-error Errors due it not exactly matching
            fingerprint.fingerprint.navigator.userAgentData = userAgentData.userAgentMetadata
            fingerprint.fingerprint.navigator.userAgent = userAgentData.userAgent
            fingerprint.fingerprint.navigator.appVersion = userAgentData.userAgent.replace(
                `${fingerprint.fingerprint.navigator.appCodeName}/`,
                ''
            )

            fingerprint.headers['user-agent'] = userAgentData.userAgent
            fingerprint.headers['sec-ch-ua'] =
                `"Microsoft Edge";v="${componentData.edge_major_version}", "Not=A?Brand";v="${componentData.not_a_brand_major_version}", "Chromium";v="${componentData.chrome_major_version}"`
            fingerprint.headers['sec-ch-ua-full-version-list'] =
                `"Microsoft Edge";v="${componentData.edge_version}", "Not=A?Brand";v="${componentData.not_a_brand_version}", "Chromium";v="${componentData.chrome_version}"`

            return fingerprint
        } catch (error) {
            this.bot.log(
                isMobile,
                'USER-AGENT-UPDATE',
                `An error occurred: ${error instanceof Error ? error.message : String(error)}`,
                'error'
            )
            throw error
        }
    }
}
