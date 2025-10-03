const axios = require('axios')
const dayjs = require('dayjs')
const cheerio = require('cheerio')
const utc = require('dayjs/plugin/utc')
const timezone = require('dayjs/plugin/timezone')
const customParseFormat = require('dayjs/plugin/customParseFormat')
const doFetch = require('@ntlab/sfetch')

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)

module.exports = {
  site: 'tvpassport.com',
  days: 3,
  url({ channel, date }) {
    return `https://www.tvpassport.com/tv-listings/stations/${channel.site_id}/${date.format(
      'YYYY-MM-DD'
    )}`
  },
  request: {
    timeout: 30000,
  },
  parser: function ({ content }) {
    let programs = []
    const { items, timezone } = parseContent(content)
    for (let item of items) {
      const $item = cheerio.load(item)
      const start = parseStart($item, timezone)
      const duration = parseDuration($item)
      const stop = start.add(duration, 'm')
      let title = parseTitle($item)
      let subTitle = parseSubTitle($item)
      if (title === 'Movie') {
        title = subTitle
        subTitle = null
      }

      const { season, episode } = parseEpisodeInfo($item)
      const isNew = parseIsNew($item)

      const program = {
        title,
        description: parseDescription($item),
        image: parseImage($item),
        category: parseCategory($item),
        rating: parseRating($item),
        actors: parseActors($item),
        guest: parseGuest($item),
        director: parseDirector($item),
        year: parseYear($item),
        start,
        stop
      }

      if (subTitle) program.subTitle = subTitle
      if (season !== null) program.season = season
      if (episode !== null) program.episode = episode
      if (isNew) program.new = true

      programs.push(program)
    }

    return programs
  },
  async channels() {
    function wait(ms) {
      return new Promise(resolve => {
        setTimeout(resolve, ms)
      })
    }

    const xml = await axios
      .get('https://www.tvpassport.com/sitemap.stations.xml')
      .then(r => r.data)
      .catch(console.error)

    const $ = cheerio.load(xml)

    const elements = $('loc').toArray()
    const queue = elements.map(el => $(el).text())
    const total = queue.length

    let i = 1
    const channels = []

    await doFetch(queue, async (url, res) => {
      if (!res) return

      const [, site_id] = url.match(/\/tv-listings\/stations\/(.*)$/)

      console.log(`[${i}/${total}]`, url)

      await wait(1000)

      const $channelPage = cheerio.load(res)
      const title = $channelPage('meta[property="og:title"]').attr('content')
      const name = title.replace('TV Schedule for ', '')

      channels.push({
        lang: 'en',
        site_id,
        name
      })

      i++
    })

    return channels
  }
}

function parseDescription($item) {
  return $item('*').data('description')
}

function parseImage($item) {
  const showpicture = $item('*').data('showpicture')
  const url = new URL(showpicture, 'https://cdn.tvpassport.com/image/show/960x540/')

  return url.href
}

function parseTitle($item) {
  return $item('*').data('showname').toString()
}

function parseSubTitle($item) {
  return $item('*').data('episodetitle').toString() || null
}

function parseYear($item) {
  return $item('*').data('year').toString() || null
}

function parseCategory($item) {
  const showtype = $item('*').data('showtype')

  return showtype ? showtype.split(', ') : []
}

function parseActors($item) {
  const cast = $item('*').data('cast')

  return cast ? cast.split(', ') : []
}

function parseDirector($item) {
  const director = $item('*').data('director')

  return director ? director.split(', ') : []
}

function parseGuest($item) {
  const guest = $item('*').data('guest')

  return guest ? guest.split(', ') : []
}

function parseRating($item) {
  const rating = $item('*').data('rating')

  return rating
    ? {
        system: 'MPA',
        value: rating.replace(/^TV/, 'TV-')
      }
    : null
}

function parseStart($item, timezone) {
  const time = $item('*').data('st')
  const tz = timezone || 'America/New_York'

  return dayjs.tz(time, 'YYYY-MM-DD HH:mm:ss', tz)
}

function parseDuration($item) {
  const duration = $item('*').data('duration')

  return parseInt(duration)
}

function parseContent(content) {
  if (!content) return { items: [], timezone: null }
  const $ = cheerio.load(content)
  const timezone = parseTimezone($)

  return {
    items: $('.station-listings .list-group-item').toArray(),
    timezone
  }
}

function parseTimezone($) {
  if (!$) return null

  const selectedOption = $('#timezone_selector option[selected]').attr('value')
  if (selectedOption) return selectedOption.trim()

  const control = $('#timezone_selector')
  if (control.length) {
    const value = control.val()
    if (value) return String(value).trim()
  }

  return null
}

function parseEpisodeInfo($item) {
  const element = $item('*')
  const rawValue = element.data('episodenumber')
  const subtitle = element.data('episodetitle')

  let season = null
  let episode = null

  const digits = typeof rawValue === 'number' || typeof rawValue === 'string'
    ? String(rawValue).replace(/[^0-9]/g, '')
    : ''

  if (digits.length >= 3) {
    const candidates = []
    for (let i = 1; i < digits.length; i++) {
      const seasonPart = digits.slice(0, i)
      const episodePart = digits.slice(i)
      const seasonValue = parseInt(seasonPart, 10)
      const episodeValue = parseInt(episodePart, 10)
      if (isNaN(seasonValue) || isNaN(episodeValue)) continue
      if (seasonValue < 1 || seasonValue > 100) continue
      if (episodeValue < 0 || episodeValue > 200) continue
      candidates.push({ season: seasonValue, episode: episodeValue })
    }

    if (candidates.length) {
      candidates.sort((a, b) => {
        if (a.season === b.season) return a.episode - b.episode
        return a.season - b.season
      })
      season = candidates[0].season
      episode = candidates[0].episode
    }
  }

  if ((season === null || episode === null) && subtitle) {
    const match = String(subtitle).match(/S(?:eason)?\s*(\d+)\s*[^\dA-Za-z]+\s*E(?:p(?:isode)?)?\.?\s*(\d+)/i)
    if (match) {
      season = parseInt(match[1], 10)
      episode = parseInt(match[2], 10)
    }
  }

  return { season, episode }
}

function parseIsNew($item) {
  const value = $item('*').data('new_show')
  if (value === undefined || value === null) return false
  const str = String(value).trim().toLowerCase()
  if (!str) return false
  if (['0', 'false', 'no', 'n'].includes(str)) return false
  return true
}
