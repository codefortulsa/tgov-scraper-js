# Tulsa Transcribe

A system for scraping, processing, and serving Tulsa Government meeting videos and documents.

## Architecture

This application is structured as a set of microservices, each with its own responsibility:

### 1. TGov Service
- Scrapes Tulsa Government meeting information
- Stores committee and meeting data
- Extracts video URLs from viewer pages

### 2. Media Service
- Downloads and processes videos
- Extracts audio from videos
- Manages batch processing of videos

### 3. Documents Service
- Handles document storage and retrieval
- Links documents to meeting records

### 4. Transcription Service
- Converts audio files to text using the OpenAI Whisper API
- Stores and retrieves transcriptions with time-aligned segments
- Manages transcription jobs

For more details, see the [architecture documentation](./docs/architecture.md).

## Getting Started

### Prerequisites

- Node.js LTS and npm
- [Encore CLI](https://encore.dev/docs/install)
- ffmpeg (for video processing)
- OpenAI API key (for transcription)

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd tulsa-transcribe
```

2. Install dependencies:
```bash
npm install
```

3. Run the setup script to configure your environment:
```bash
npx ts-node setup.ts
```

4. Update the `.env` file with your database credentials and API keys:
```
TGOV_DATABASE_URL="postgresql://username:password@localhost:5432/tgov?sslmode=disable"
MEDIA_DATABASE_URL="postgresql://username:password@localhost:5432/media?sslmode=disable"
DOCUMENTS_DATABASE_URL="postgresql://username:password@localhost:5432/documents?sslmode=disable"
TRANSCRIPTION_DATABASE_URL="postgresql://username:password@localhost:5432/transcription?sslmode=disable"
OPENAI_API_KEY="your-openai-api-key"
```

5. Run the application using Encore CLI:
```bash
encore run
```

## API Endpoints

### TGov Service

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/scrape/tgov` | GET | Trigger a scrape of the TGov website |
| `/tgov/meetings` | GET | List meetings with filtering options |
| `/tgov/committees` | GET | List all committees |
| `/tgov/extract-video-url` | POST | Extract a video URL from a viewer page |

### Media Service

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/videos/download` | POST | Download videos from URLs |
| `/api/media/:blobId/info` | GET | Get information about a media file |
| `/api/videos` | GET | List all stored videos |
| `/api/audio` | GET | List all stored audio files |
| `/api/videos/batch/queue` | POST | Queue a batch of videos for processing |
| `/api/videos/batch/:batchId` | GET | Get the status of a batch |
| `/api/videos/batch/process` | POST | Process the next batch of videos |

### Documents Service

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/documents/download` | POST | Download and store a document |
| `/api/documents` | GET | List documents with filtering options |
| `/api/documents/:id` | GET | Get a specific document |
| `/api/documents/:id` | PATCH | Update document metadata |
| `/api/meeting-documents` | POST | Download and link meeting agenda documents |

### Transcription Service

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/transcribe` | POST | Request transcription for an audio file |
| `/jobs/:jobId` | GET | Get the status of a transcription job |
| `/transcriptions/:transcriptionId` | GET | Get a transcription by ID |
| `/meetings/:meetingId/transcriptions` | GET | Get all transcriptions for a meeting |

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
npm test
```

## Deployment

The application is deployed using Encore. Refer to the [Encore deployment documentation](https://encore.dev/docs/deploy) for details.

## License

[MIT](LICENSE)