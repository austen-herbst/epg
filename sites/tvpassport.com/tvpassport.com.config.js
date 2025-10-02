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
      let subtitle = parseSubTitle($item)
      if (title === 'Movie') {
        title = subtitle
        subtitle = null
      }

      programs.push({
        title,
        subtitle,
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
      })
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
