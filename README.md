# `tgov-scraper-js`

Scrape and ingest recordings and documents from meetings of the City of Tulsa's municipal Agencies, Boards, and Commissions (ABCs).

## Architecture

This application is structured as a set of microservices, each with its own responsibility (For more details, see the [architecture documentation](./docs/architecture.md)):

### 1. TGov Service

### 2. Media Service

### 3. Documents Service

### 4. Transcription Service

## Getting Started

### Setup

1. Clone the repository:

```bash
git clone https://github.com/codefortulsa/tgov-scraper-js.git
cd tgov-scraper-js
```

2. Install `node` v22 and `npm` v11 using your favorite version manager. If you don't have one, we recommend [nvm](https://github.com/nvm-sh/nvm#installing-and-updating):

```bash
nvm install 22
nvm use 22
nvm install-latest-npm
```

3. [Install Docker Desktop](https://docs.docker.com/get-docker/)

4. [Install `ffmpeg`](https://ffmpeg.org/download.html)

5. [Install the Encore CLI](https://encore.dev/docs/ts/install#install-the-encore-cli)

6. Install NPM dependencies:

```bash
npm install
```

7. Copy the example [local secret overrides file](https://encore.dev/docs/ts/primitives/secrets#overriding-local-secrets):

```bash
cp .secrets.local.cue.EXAMPLE .secrets.local.cue
```

. Set your local secrets:

```sh
# path: ./.secrets.local.cue
OPENAI_API_KEY: "<your-openai-api-key>"
```

9. Run the application using Encore CLI:

```bash
encore run
```

## API Endpoints

### TGov Service

| Endpoint                  | Method | Description                            |
| ------------------------- | ------ | -------------------------------------- |
| `/scrape/tgov`            | GET    | Trigger a scrape of the TGov website   |
| `/tgov/meetings`          | GET    | List meetings with filtering options   |
| `/tgov/committees`        | GET    | List all committees                    |
| `/tgov/extract-video-url` | POST   | Extract a video URL from a viewer page |

### Media Service

| Endpoint                     | Method | Description                            |
| ---------------------------- | ------ | -------------------------------------- |
| `/api/videos/download`       | POST   | Download videos from URLs              |
| `/api/media/:blobId/info`    | GET    | Get information about a media file     |
| `/api/videos`                | GET    | List all stored videos                 |
| `/api/audio`                 | GET    | List all stored audio files            |
| `/api/videos/batch/queue`    | POST   | Queue a batch of videos for processing |
| `/api/videos/batch/:batchId` | GET    | Get the status of a batch              |
| `/api/videos/batch/process`  | POST   | Process the next batch of videos       |

### Documents Service

| Endpoint                  | Method | Description                                |
| ------------------------- | ------ | ------------------------------------------ |
| `/api/documents/download` | POST   | Download and store a document              |
| `/api/documents`          | GET    | List documents with filtering options      |
| `/api/documents/:id`      | GET    | Get a specific document                    |
| `/api/documents/:id`      | PATCH  | Update document metadata                   |
| `/api/meeting-documents`  | POST   | Download and link meeting agenda documents |

### Transcription Service

| Endpoint                              | Method | Description                             |
| ------------------------------------- | ------ | --------------------------------------- |
| `/transcribe`                         | POST   | Request transcription for an audio file |
| `/jobs/:jobId`                        | GET    | Get the status of a transcription job   |
| `/transcriptions/:transcriptionId`    | GET    | Get a transcription by ID               |
| `/meetings/:meetingId/transcriptions` | GET    | Get all transcriptions for a meeting    |

## Cron Jobs

- **daily-tgov-scrape**: Daily scrape of the TGov website (12:01 AM)
- **process-video-batches**: Process video batches every 5 minutes

## Development

### Database Migrations

Each service has its own database migration files in its `data/migrations` directory. These are applied automatically when running the application.

### Adding a New Feature

1. Determine which service the feature belongs to
2. Add the necessary endpoint(s) to the appropriate service
3. Update any cross-service dependencies as needed
4. Test the feature locally

### Running Tests

```bash
encore test
```

## Deployment

The application is deployed using Encore. Refer to the [Encore deployment documentation](https://encore.dev/docs/deploy) for details.

## License

[MIT](LICENSE)
