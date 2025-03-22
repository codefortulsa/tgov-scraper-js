# Tulsa Transcribe Service Architecture

## Overview

This application scrapes meeting information from the Tulsa Government website, downloads and processes videos and documents, transcribes audio to text, and makes them available through a set of APIs. The system is designed as a set of microservices, each with its own responsibility and data store.

## Service Structure

The application is organized into four main services:

### 1. TGov Service
**Purpose**: Scrape and provide access to Tulsa Government meeting data
- Scrapes the TGov website for meeting information
- Stores committee and meeting data
- Provides APIs for accessing meeting information
- Extracts video download URLs from viewer pages

**Key Endpoints**:
- `GET /scrape/tgov` - Trigger a scrape of the TGov website
- `GET /tgov/meetings` - List meetings with filtering options
- `GET /tgov/committees` - List all committees
- `POST /tgov/extract-video-url` - Extract a video URL from a viewer page

### 2. Media Service
**Purpose**: Handle video downloading, processing, and storage
- Downloads videos from URLs
- Extracts audio tracks from videos
- Processes video batches in the background
- Provides APIs for accessing processed media

**Key Endpoints**:
- `POST /api/videos/download` - Download videos from URLs
- `GET /api/media/:blobId/info` - Get information about a media file
- `GET /api/videos` - List all stored videos
- `GET /api/audio` - List all stored audio files
- `POST /api/videos/batch/queue` - Queue a batch of videos for processing
- `GET /api/videos/batch/:batchId` - Get the status of a batch
- `POST /api/videos/batch/process` - Process the next batch of videos

### 3. Documents Service
**Purpose**: Handle document storage and retrieval
- Downloads and stores documents from URLs
- Manages document metadata
- Links documents to meeting records

**Key Endpoints**:
- `POST /api/documents/download` - Download and store a document
- `GET /api/documents` - List documents with filtering options
- `GET /api/documents/:id` - Get a specific document
- `POST /api/meeting-documents` - Download and link meeting agenda documents

### 4. Transcription Service
**Purpose**: Convert audio to text and manage transcriptions
- Transcribes audio files using the OpenAI Whisper API
- Stores and manages transcription results with time-aligned segments
- Processes transcription jobs asynchronously
- Provides APIs for accessing transcriptions

**Key Endpoints**:
- `POST /transcribe` - Request transcription for an audio file
- `GET /jobs/:jobId` - Get the status of a transcription job
- `GET /transcriptions/:transcriptionId` - Get a transcription by ID
- `GET /meetings/:meetingId/transcriptions` - Get all transcriptions for a meeting

## Cross-Service Communication

Services communicate with each other using type-safe API calls through the Encore client library:

- **TGov → Media**: Media service calls TGov's `extractVideoUrl` endpoint to get download URLs
- **Documents → TGov**: Documents service calls TGov's `listMeetings` endpoint to get meeting data
- **Media → TGov**: Media service uses TGov's meeting data for processing videos
- **Transcription → Media**: Transcription service calls Media's `getMediaFile` endpoint to get audio file information

## Data Flow

1. TGov service scrapes meeting information from the Tulsa Government website
2. Media service extracts download URLs and processes videos, including audio extraction
3. Documents service downloads and links agenda documents to meetings
4. Transcription service converts audio files to text and stores the transcriptions

## Databases

Each service has its own database:

- **TGov Database**: Stores committee and meeting information
- **Media Database**: Stores media file metadata and processing tasks
- **Documents Database**: Stores document metadata
- **Transcription Database**: Stores transcription jobs and results

## Storage Buckets

- **recordings**: Video and audio files (managed by Media service)
- **agendas**: Document files (managed by Documents service)
- **bucket-meta**: Metadata for storage buckets

## Cron Jobs

- **daily-tgov-scrape**: Daily scrape of the TGov website (12:01 AM)
- **process-video-batches**: Process video batches every 5 minutes