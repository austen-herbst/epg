import { EPGGrabber, GrabCallbackData, EPGGrabberMock, SiteConfig, Channel } from 'epg-grabber'
import { Logger, Collection } from '@freearhey/core'
import { Queue, ProxyParser } from './'
import { GrabOptions } from '../commands/epg/grab'
import { TaskQueue, PromisyClass } from 'cwait'
import { SocksProxyAgent } from 'socks-proxy-agent'

interface GrabberProps {
  logger: Logger
  queue: Queue
  options: GrabOptions
}

export class Grabber {
  logger: Logger
  queue: Queue
  options: GrabOptions
  grabber: EPGGrabber | EPGGrabberMock

  constructor({ logger, queue, options }: GrabberProps) {
    this.logger = logger
    this.queue = queue
    this.options = options
    this.grabber = process.env.NODE_ENV === 'test' ? new EPGGrabberMock() : new EPGGrabber()
  }

  async grab(): Promise<{ channels: Collection; programs: Collection }> {
    const proxyParser = new ProxyParser()
    const taskQueue = new TaskQueue(Promise as PromisyClass, this.options.maxConnections)

    const total = this.queue.size()

    const channels = new Collection()
    let programs = new Collection()
    let i = 1

    await Promise.all(
      this.queue.items().map(
        taskQueue.wrap(
          async (queueItem: { channel: Channel; config: SiteConfig; date: string }) => {
            const { channel } = queueItem

            channels.add(channel)

            const _programs = await this.grabWithRetry({
              item: queueItem,
              proxyParser,
              logIndex: i,
              total
            })

            if (i < total) i++

            programs = programs.concat(new Collection(_programs))
          }
        )
      )
    )

    return { channels, programs }
  }

  private async grabWithRetry({
    item,
    proxyParser,
    logIndex,
    total
  }: {
    item: { channel: Channel; config: SiteConfig; date: string }
    proxyParser: ProxyParser
    logIndex: number
    total: number
  }): Promise<any[]> {
    const { channel } = item
    let { config, date } = item

    // Apply per-invocation config overrides based on options on every attempt
    const prepareConfig = (): SiteConfig => {
      const cfg: SiteConfig = { ...(config as any) }

      if (this.options.timeout !== undefined) {
        const timeout = parseInt(this.options.timeout)
        cfg.request = { ...cfg.request, ...{ timeout } }
      }

      if (this.options.delay !== undefined) {
        const delay = parseInt(this.options.delay)
        cfg.delay = delay
      }

      if (this.options.proxy !== undefined) {
        const proxy = proxyParser.parse(this.options.proxy)

        if (
          proxy.protocol &&
          ['socks', 'socks5', 'socks5h', 'socks4', 'socks4a'].includes(String(proxy.protocol))
        ) {
          const socksProxyAgent = new SocksProxyAgent(this.options.proxy)

          cfg.request = {
            ...cfg.request,
            ...{ httpAgent: socksProxyAgent, httpsAgent: socksProxyAgent }
          }
        } else {
          cfg.request = { ...cfg.request, ...{ proxy } }
        }
      }

      if (this.options.curl === true) {
        cfg.curl = true
      }

      return cfg
    }

    const attempts = Math.max(0, Number(this.options.retries ?? 0))
    const baseDelayMs = Math.max(0, Number(this.options.retryBaseDelay ?? 0))
    let attempt = 0
    let lastError: any = null

    while (attempt <= attempts) {
      const cfg = prepareConfig()
      let callbackError: Error | null = null
      try {
        const result = await this.grabber.grab(channel, date, cfg, (data: GrabCallbackData, error: Error | null) => {
          const { programs, date } = data
          this.logger.info(
            `  [${logIndex}/${total}] ${channel.site} (${channel.lang}) - ${channel.xmltv_id} - ${date.format('MMM D, YYYY')} (${programs.length} programs)`
          )
          if (error) {
            callbackError = error
            this.logger.info(`    ERR: ${error.message}`)
          }
        })

        // If the callback reported an error, treat it as failure eligible for retry
        if (callbackError && this.shouldRetry(callbackError) && attempt < attempts) {
          throw callbackError
        }

        return result
      } catch (err: any) {
        lastError = err
        if (!this.shouldRetry(err) || attempt >= attempts) {
          // Give up: return empty result on final failure
          this.logger.info(`    WARN: giving up after ${attempt + 1} attempt(s): ${err?.message ?? err}`)
          return []
        }

        const delay = this.backoffDelay(baseDelayMs, attempt)
        this.logger.info(
          `    RETRY ${attempt + 1}/${attempts} in ${Math.round(delay)}ms due to: ${err?.message ?? err}`
        )
        await new Promise(res => setTimeout(res, delay))
        attempt += 1
      }
    }

    // Should not reach here
    return []
  }

  private shouldRetry(err: any): boolean {
    const code = err?.code || err?.cause?.code
    const status = err?.response?.status
    const message: string = (err?.message || '').toLowerCase()

    const netCodes = new Set([
      'ETIMEDOUT',
      'ECONNABORTED',
      'ECONNRESET',
      'EAI_AGAIN',
      'ENOTFOUND',
      'EHOSTUNREACH',
      'EPIPE',
      'ESOCKETTIMEDOUT'
    ])

    if (typeof status === 'number' && (status >= 500 || status === 429)) return true
    if (code && netCodes.has(String(code))) return true
    if (message.includes('timeout') || message.includes('network error')) return true

    return false
  }

  private backoffDelay(base: number, attempt: number): number {
    // Exponential backoff with jitter
    const expo = base * Math.pow(2, attempt)
    const jitter = Math.random() * base
    return expo + jitter
  }
}
