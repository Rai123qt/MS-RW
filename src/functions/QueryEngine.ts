import type { AxiosRequestConfig } from 'axios'
import * as fs from 'fs'
import path from 'path'
import type { GoogleSearch, GoogleTrendsResponse, RedditListing, WikipediaTopResponse, QueryEngine } from '../interface/Search'
import type { MicrosoftRewardsBot } from '../index'
import { log } from '../util/notifications/Logger'

export class QueryCore {
    constructor(private bot: MicrosoftRewardsBot) { }

    async queryManager(
        options: {
            shuffle?: boolean
            sourceOrder?: QueryEngine[]
            related?: boolean
            langCode?: string
            geoLocale?: string
        } = {}
    ): Promise<string[]> {
        const {
            shuffle = false,
            sourceOrder = ['google', 'wikipedia', 'reddit', 'local'],
            related = true,
            langCode = 'en',
            geoLocale = 'US'
        } = options

        try {
            log(
                this.bot.isMobile,
                'QUERY-MANAGER',
                `start | shuffle=${shuffle}, related=${related}, lang=${langCode}, geo=${geoLocale}, sources=${sourceOrder.join(',')}`
            )

            const topicLists: string[][] = []

            const sourceHandlers: Record<
                'google' | 'wikipedia' | 'reddit' | 'local',
                (() => Promise<string[]>) | (() => string[])
            > = {
                google: async () => {
                    const topics = await this.getGoogleTrends(geoLocale.toUpperCase()).catch(() => [])
                    log(this.bot.isMobile, 'QUERY-MANAGER', `google: ${topics.length}`)
                    return topics
                },
                wikipedia: async () => {
                    const topics = await this.getWikipediaTrending(langCode).catch(() => [])
                    log(this.bot.isMobile, 'QUERY-MANAGER', `wikipedia: ${topics.length}`)
                    return topics
                },
                reddit: async () => {
                    const topics = await this.getRedditTopics().catch(() => [])
                    log(this.bot.isMobile, 'QUERY-MANAGER', `reddit: ${topics.length}`)
                    return topics
                },
                local: () => {
                    const topics = this.getLocalQueryList()
                    log(this.bot.isMobile, 'QUERY-MANAGER', `local: ${topics.length}`)
                    return topics
                }
            }

            for (const source of sourceOrder) {
                const handler = sourceHandlers[source]
                if (!handler) continue

                const topics = await Promise.resolve(handler())
                if (topics.length) topicLists.push(topics)
            }

            log(
                this.bot.isMobile,
                'QUERY-MANAGER',
                `sources combined | rawTotal=${topicLists.flat().length}`
            )

            const baseTopics = this.normalizeAndDedupe(topicLists.flat())

            if (!baseTopics.length) {
                log(this.bot.isMobile, 'QUERY-MANAGER', 'No base topics found (all sources empty)')
                return []
            }

            log(
                this.bot.isMobile,
                'QUERY-MANAGER',
                `baseTopics dedupe | before=${topicLists.flat().length} | after=${baseTopics.length}`
            )

            const clusters = related ? await this.buildRelatedClusters(baseTopics, langCode) : baseTopics.map(t => [t])

            this.bot.utils.shuffleArray(clusters)
            log(this.bot.isMobile, 'QUERY-MANAGER', 'clusters shuffled')

            let finalQueries = clusters.flat()
            log(
                this.bot.isMobile,
                'QUERY-MANAGER',
                `clusters flattened | total=${finalQueries.length}`
            )

            if (shuffle) {
                this.bot.utils.shuffleArray(finalQueries)
                log(this.bot.isMobile, 'QUERY-MANAGER', 'finalQueries shuffled')
            }

            finalQueries = this.normalizeAndDedupe(finalQueries)
            log(
                this.bot.isMobile,
                'QUERY-MANAGER',
                `finalQueries dedupe | after=${finalQueries.length}`
            )

            if (!finalQueries.length) {
                log(this.bot.isMobile, 'QUERY-MANAGER', 'finalQueries deduped to 0')
                return []
            }

            log(this.bot.isMobile, 'QUERY-MANAGER', `final queries: ${finalQueries.length}`)

            return finalQueries
        } catch (error) {
            log(
                this.bot.isMobile,
                'QUERY-MANAGER',
                `error: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
                'error'
            )
            return []
        }
    }

    private async buildRelatedClusters(baseTopics: string[], langCode: string): Promise<string[][]> {
        const clusters: string[][] = []

        const LIMIT = 50
        const head = baseTopics.slice(0, LIMIT)
        const tail = baseTopics.slice(LIMIT)

        log(
            this.bot.isMobile,
            'QUERY-MANAGER',
            `related enabled | baseTopics=${baseTopics.length} | expand=${head.length} | passthrough=${tail.length}`
        )

        for (const topic of head) {
            const suggestions = await this.getBingSuggestions(topic, langCode).catch(() => [])
            const relatedTerms = await this.getBingRelatedTerms(topic).catch(() => [])

            const usedSuggestions = suggestions.slice(0, 6)
            const usedRelated = relatedTerms.slice(0, 3)

            const cluster = this.normalizeAndDedupe([topic, ...usedSuggestions, ...usedRelated])

            log(
                this.bot.isMobile,
                'QUERY-MANAGER',
                `cluster expanded | topic="${topic}" | suggestions=${usedSuggestions.length} | related=${usedRelated.length}`
            )

            clusters.push(cluster)
        }

        if (tail.length) {
            log(this.bot.isMobile, 'QUERY-MANAGER', `cluster passthrough | topics=${tail.length}`)
            for (const topic of tail) {
                clusters.push([topic])
            }
        }

        return clusters
    }

    private normalizeAndDedupe(queries: string[]): string[] {
        const seen = new Set<string>()
        const out: string[] = []

        for (const q of queries) {
            if (!q) continue
            const trimmed = q.trim()
            if (!trimmed) continue

            const norm = trimmed.replace(/\s+/g, ' ').toLowerCase()
            if (seen.has(norm)) continue

            seen.add(norm)
            out.push(trimmed)
        }

        return out
    }

    async getGoogleTrends(geoLocale: string): Promise<string[]> {
        const queryTerms: GoogleSearch[] = []

        try {
            const request: AxiosRequestConfig = {
                url: 'https://trends.google.com/_/TrendsUi/data/batchexecute',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                },
                data: `f.req=[[[i0OFE,"[null, null, \\"${geoLocale.toUpperCase()}\\", 0, null, 48]"]]]`
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy?.proxyGoogleTrends ?? false)
            const trendsData = this.extractJsonFromResponse(response.data)
            if (!trendsData) {
                log(this.bot.isMobile, 'SEARCH-GOOGLE-TRENDS', 'No trendsData parsed from response')
                return []
            }

            const mapped = trendsData.map(q => [q[0], q[9]!.slice(1)])

            if (mapped.length < 90 && geoLocale !== 'US') {
                return this.getGoogleTrends('US')
            }

            for (const [topic, related] of mapped) {
                queryTerms.push({
                    topic: topic as string,
                    related: related as string[]
                })
            }
        } catch (error) {
            log(
                this.bot.isMobile,
                'SEARCH-GOOGLE-TRENDS',
                `request failed: ${error instanceof Error ? error.message : String(error)}`,
                'error'
            )
            return []
        }

        return queryTerms.flatMap(x => [x.topic, ...x.related])
    }

    private extractJsonFromResponse(text: string): GoogleTrendsResponse[1] | null {
        for (const line of text.split('\n')) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('[')) continue
            try {
                return JSON.parse(JSON.parse(trimmed)[0][2])[1]
            } catch { }
        }
        return null
    }

    async getBingSuggestions(query = '', langCode = 'en'): Promise<string[]> {
        try {
            const request: AxiosRequestConfig = {
                url: `https://www.bingapis.com/api/v7/suggestions?q=${encodeURIComponent(
                    query
                )}&appid=6D0A9B8C5100E9ECC7E11A104ADD76C10219804B&cc=xl&setlang=${langCode}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                }
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy?.proxyBingTerms ?? false)
            const suggestions =
                response.data.suggestionGroups?.[0]?.searchSuggestions?.map((x: { query: string }) => x.query) ?? []

            return suggestions
        } catch (error) {
            log(
                this.bot.isMobile,
                'SEARCH-BING-SUGGESTIONS',
                `request failed | query="${query}" | error=${error instanceof Error ? error.message : String(error)}`,
                'warn'
            )
            return []
        }
    }

    async getBingRelatedTerms(query: string): Promise<string[]> {
        try {
            const request: AxiosRequestConfig = {
                url: `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(query)}`,
                method: 'GET'
            }

            const response = await this.bot.axios.request(request, this.bot.config.proxy?.proxyBingTerms ?? false)
            const related = response.data?.[1]
            return Array.isArray(related) ? related : []
        } catch (error) {
            log(
                this.bot.isMobile,
                'SEARCH-BING-RELATED',
                `request failed | query="${query}" | error=${error instanceof Error ? error.message : String(error)}`,
                'warn'
            )
            return []
        }
    }

    async getWikipediaTrending(langCode = 'en'): Promise<string[]> {
        try {
            const date = new Date(Date.now() - 24 * 60 * 60 * 1000)
            const yyyy = date.getUTCFullYear()
            const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
            const dd = String(date.getUTCDate()).padStart(2, '0')

            const request: AxiosRequestConfig = {
                url: `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${langCode}.wikipedia/all-access/${yyyy}/${mm}/${dd}`,
                method: 'GET'
            }

            const response = await this.bot.axios.request(request, false)
            const articles = (response.data as WikipediaTopResponse).items?.[0]?.articles ?? []

            return articles.slice(0, 50).map(a => a.article.replace(/_/g, ' '))
        } catch (error) {
            log(
                this.bot.isMobile,
                'SEARCH-WIKIPEDIA-TRENDING',
                `request failed | lang=${langCode} | error=${error instanceof Error ? error.message : String(error)}`,
                'warn'
            )
            return []
        }
    }

    async getRedditTopics(subreddit = 'popular'): Promise<string[]> {
        try {
            const safe = subreddit.replace(/[^a-zA-Z0-9_+]/g, '')
            const request: AxiosRequestConfig = {
                url: `https://www.reddit.com/r/${safe}.json?limit=50`,
                method: 'GET'
            }

            const response = await this.bot.axios.request(request, false)
            const posts = (response.data as RedditListing).data?.children ?? []

            return posts.filter(p => !p.data.over_18).map(p => p.data.title)
        } catch (error) {
            log(
                this.bot.isMobile,
                'SEARCH-REDDIT',
                `request failed | subreddit=${subreddit} | error=${error instanceof Error ? error.message : String(error)}`,
                'warn'
            )
            return []
        }
    }

    getLocalQueryList(): string[] {
        try {
            const file = path.join(__dirname, './search-queries.json')
            const queries = JSON.parse(fs.readFileSync(file, 'utf8')) as string[]
            return Array.isArray(queries) ? queries : []
        } catch (error) {
            log(
                this.bot.isMobile,
                'SEARCH-LOCAL-QUERY-LIST',
                `read/parse failed | error=${error instanceof Error ? error.message : String(error)}`,
                'warn'
            )
            return []
        }
    }
}
