# EPG [![update](https://github.com/iptv-org/epg/actions/workflows/update.yml/badge.svg)](https://github.com/iptv-org/epg/actions/workflows/update.yml)

Tools for downloading the EPG (Electronic Program Guide) for thousands of TV channels from hundreds of sources.

## Table of contents

- ✨ [Installation](#installation)
- 🚀 [Usage](#usage)
- 💫 [Update](#update)
- 🐋 [Docker](#docker)
- 📺 [Playlists](#playlists)
- 🗄 [Database](#database)
- 👨‍💻 [API](#api)
- 📚 [Resources](#resources)
- 💬 [Discussions](#discussions)
- 🛠 [Contribution](#contribution)
- 📄 [License](#license)

## Installation

First, you need to install [Node.js](https://nodejs.org/en) on your computer. You will also need to install [Git](https://git-scm.com/downloads) to follow these instructions.

After that open the [Console](https://en.wikipedia.org/wiki/Windows_Console) (or [Terminal](<https://en.wikipedia.org/wiki/Terminal_(macOS)>) if you have macOS) and type the following command:

```sh
git clone --depth 1 -b master https://github.com/iptv-org/epg.git
```

Then navigate to the downloaded `epg` folder:

```sh
cd epg
```

And install all the dependencies:

```sh
npm install
```

## Usage

To start the download of the guide, select one of the supported sites from [SITES.md](SITES.md) file and paste its name into the command below:

```sh
npm run grab --- --site=example.com
```

Then run it and wait for the guide to finish downloading. When finished, a new `guide.xml` file will appear in the current directory.

You can also customize the behavior of the script using this options:

```sh
Usage: npm run grab --- [options]

Options:
  -s, --site <name>             Name of the site to parse
  -c, --channels <path>         Path to *.channels.xml file (required if the "--site" attribute is
                                not specified)
  -o, --output <path>           Path to output file (default: "guide.xml")
  -l, --lang <codes>            Allows you to restrict downloading to channels in specified languages only (example: "en,id")
  -t, --timeout <milliseconds>  Timeout for each request in milliseconds (default: 0)
  -d, --delay <milliseconds>    Delay between request in milliseconds (default: 0)
  -x, --proxy <url>             Use the specified proxy (example: "socks5://username:password@127.0.0.1:1234")
  --days <days>                 Number of days for which the program will be loaded (defaults to the value from the site config)
  --maxConnections <number>     Number of concurrent requests (default: 1)
  --retries <number>            Number of retry attempts on transient errors (default: 3)
  --retryBaseDelay <milliseconds> Base delay for exponential backoff between retries in ms (default: 2000)
  --gzip                        Specifies whether or not to create a compressed version of the guide (default: false)
  --curl                        Display each request as CURL (default: false)
```

### Parallel downloading

By default, the guide for each channel is downloaded one by one, but you can change this behavior by increasing the number of simultaneous requests using the `--maxConnections` attribute:

```sh
npm run grab --- --site=example.com --maxConnections=10
```

But be aware that under heavy load, some sites may start return an error or completely block your access.

### Use custom channel list

Create an XML file and copy the descriptions of all the channels you need from the [/sites](sites) into it:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<channels>
  <channel site="arirang.com" lang="en" xmltv_id="ArirangTV.kr" site_id="CH_K">Arirang TV</channel>
  ...
</channels>
```

And then specify the path to that file via the `--channels` attribute:

```sh
npm run grab --- --channels=path/to/custom.channels.xml
```

### Run on schedule

If you want to download guides on a schedule, you can use [cron](https://en.wikipedia.org/wiki/Cron) or any other task scheduler. Currently, we use a tool called `chronos` for this purpose.

To start it, you only need to specify the necessary `grab` command and [cron expression](https://crontab.guru/):

```sh
npx chronos --execute="npm run grab --- --site=example.com" --pattern="0 0,12 * * *" --log
```

For more info go to [chronos](https://github.com/freearhey/chronos) documentation.

### Access the guide by URL

You can make the guide available via URL by running your own server. The easiest way to do this is to run this command:

```sh
npx serve
```

After that, the guide will be available at the link:

```
http://localhost:3000/guide.xml
```

In addition it will be available to other devices on the same local network at the address:

```
http://<your_local_ip_address>:3000/guide.xml
```

For more info go to [serve](https://github.com/vercel/serve) documentation.

## Update

If you have downloaded the repository code according to the instructions above, then to update it will be enough to run the command:

```sh
git pull
```

And then update all the dependencies:

```sh
npm install
```

## Docker

### Build an image

```sh
docker build -t iptv-org/epg --no-cache .
```

### Create and run container

```sh
docker run -p 3000:3000 -v /path/to/channels.xml:/epg/channels.xml iptv-org/epg
```

By default, the guide will be downloaded every day at 00:00 UTC and saved to the `/epg/public/guide.xml` file inside the container.

From the outside, it will be available at this link:

```
http://localhost:3000/guide.xml
```

or

```
http://<your_local_ip_address>:3000/guide.xml
```

### Docker Compose (local build)

This repo includes a Dockerfile optimized for local builds (`Dockerfile.local`). It installs dependencies without running `postinstall`, copies the full source, and then downloads the static datasets needed at runtime. This avoids stale layers and ensures the image contains all required files.

Quick start using Compose:

```sh
docker compose -f deploy/synology/docker-compose.yml build --no-cache --pull
docker compose -f deploy/synology/docker-compose.yml up -d --force-recreate
```

The service exposes port `3000` and serves the generated guide from `/public/guide.xml`. `RUN_AT_STARTUP=true` triggers a run immediately in addition to the scheduled cron.


### Environment Variables

To fine-tune the execution, you can pass environment variables to the container as follows:

```sh
docker run \
-p 5000:3000 \
-v /path/to/channels.xml:/epg/channels.xml \
-e CRON_SCHEDULE="0 0,12 * * *" \
-e MAX_CONNECTIONS=10 \
-e GZIP=true \
-e CURL=true \
-e PROXY="socks5://127.0.0.1:1234" \
-e DAYS=14 \
-e TIMEOUT=5 \
-e DELAY=2 \
-e RETRIES=3 \
-e RETRY_BASE_DELAY_MS=2000 \
iptv-org/epg
```

| Variable        | Description                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| CRON_SCHEDULE   | A [cron expression](https://crontab.guru/) describing the schedule of the guide loadings (default: "0 0 \* \* \*") |
| MAX_CONNECTIONS | Limit on the number of concurrent requests (default: 1)                                                            |
| GZIP            | Boolean value indicating whether to create a compressed version of the guide (default: false)                      |
| CURL            | Display each request as CURL (default: false)                                                                      |
| PROXY           | Use the specified proxy                                                                                            |
| DAYS            | Number of days for which the guide will be loaded (defaults to the value from the site config)                     |
| TIMEOUT         | Timeout for each request in milliseconds (default: 0)                                                              |
| DELAY           | Delay between request in milliseconds (default: 0)                                                                 |
| RETRIES         | Number of retry attempts on transient errors (default: 3)                                                          |
| RETRY_BASE_DELAY_MS | Base delay for exponential backoff between retries in ms (default: 2000)                                       |
| RUN_AT_STARTUP  | Run grab on container startup (default: true)                                                                 |


Boolean parsing note: boolean envs accept `true/false`, `1/0`, `yes/no`, or `on/off`. For example, setting `CURL=false` will correctly suppress curl output in logs.

### Synology NAS

For Synology (Docker/Container Manager), a sample Compose file is provided at `deploy/synology/docker-compose.yml`. It builds from local sources using `Dockerfile.local` and sets common environment variables.

- Update the volume paths to match your NAS:
  - `/volume1/docker/epg/public:/public` to persist generated `guide.xml`.
  - `/volume1/docker/epg/config/channels.xml:/epg/channels.xml:ro` to provide your channels.
- Adjust the schedule and options via the `environment:` block (e.g., `DAYS=14`, `RETRIES`, `RETRY_BASE_DELAY_MS`).
- Build and run:

```sh
docker compose -f deploy/synology/docker-compose.yml build --no-cache --pull
docker compose -f deploy/synology/docker-compose.yml up -d --force-recreate
```

Notes:
- The image runs a small HTTP server on port `3000` to serve `/public/guide.xml`.
- On first build, static data is fetched as part of the image build so the container can generate guides without extra initialization steps.

## Database

All channel data is taken from the [iptv-org/database](https://github.com/iptv-org/database) repository. If you find any errors please open a new [issue](https://github.com/iptv-org/database/issues) there.

## API

The API documentation can be found in the [iptv-org/api](https://github.com/iptv-org/api) repository.

## Resources

Links to other useful IPTV-related resources can be found in the [iptv-org/awesome-iptv](https://github.com/iptv-org/awesome-iptv) repository.

## Discussions

If you have a question or an idea, you can post it in the [Discussions](https://github.com/orgs/iptv-org/discussions) tab.

## Contribution

Please make sure to read the [Contributing Guide](https://github.com/iptv-org/epg/blob/master/CONTRIBUTING.md) before sending [issue](https://github.com/iptv-org/epg/issues) or a [pull request](https://github.com/iptv-org/epg/pulls).

And thank you to everyone who has already contributed!

### Backers

<a href="https://opencollective.com/iptv-org"><img src="https://opencollective.com/iptv-org/backers.svg?width=890" /></a>

### Contributors

<a href="https://github.com/iptv-org/epg/graphs/contributors"><img src="https://opencollective.com/iptv-org/contributors.svg?width=890" /></a>

## License

[![CC0](http://mirrors.creativecommons.org/presskit/buttons/88x31/svg/cc-zero.svg)](LICENSE)
