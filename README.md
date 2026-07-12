# Weekly App Review Pulse Pipeline

An automated AI pipeline that ingests app reviews from the Play Store and App Store, clusters them into actionable themes using Groq (LLM), generates a weekly "Pulse" report, and publishes the results to Google Workspace (Docs & Gmail) via a Model Context Protocol (MCP) server.

## Features

1. **Ingestion & Normalization**: Automatically loads, deduplicates, and normalizes app reviews. Filters out low-quality reviews (e.g., short reviews, emojis-only, certain languages).
2. **PII Stripping**: Employs a zero-trust privacy model to strip Personally Identifiable Information (PII) before it ever touches an external LLM.
3. **Theme Clustering (Groq)**: Uses the Groq LLM API (`llama-3.3-70b-versatile`) to cluster hundreds of reviews into actionable themes with sentiment analysis and competitor mentions.
4. **Pulse Generation**: Automatically summarizes the top themes into a concise markdown report (the "Pulse").
5. **Report Finalization**: Polishes the raw pulse into two final outputs: a formal report (≤250 words) and an email body (≤150 words), ensuring verbatim user quotes are preserved.
6. **MCP Integration**: Uses the official `@modelcontextprotocol/sdk` to securely communicate with a Google Workspace MCP server via SSE. It appends the weekly report to a Master Google Doc and dispatches a summary email to stakeholders.

## Prerequisites

- **Node.js** (v18 or higher)
- **Groq API Key**: For fast LLM inference during clustering and generation.
- **Google Workspace MCP Server**: A running instance of an MCP server that supports `append_google_doc` and `send_email`.

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   Copy `.env.example` to `.env` and fill in your credentials:
   ```env
   # LLM Configuration
   GROQ_API_KEY=your_groq_api_key
   GROQ_MODEL=llama-3.3-70b-versatile

   # MCP Server Integration
   MCP_SERVER_URL=http://localhost:3000/sse  # Or your hosted Railway URL
   MCP_AUTH_TOKEN=your_auth_token_here       # If required by the server

   # Google Workspace Details
   PULSE_RECIPIENT=stakeholder@example.com
   GOOGLE_DOC_ID=your_master_google_doc_id
   
   # Pipeline Config
   REVIEW_WINDOW_WEEKS=10
   ```

3. **Data Placement**
   Ensure your raw review data is placed in the `data/reviews` directory:
   - `playstore_reviews.csv`
   - `appstore_reviews.json`

## Usage

Run the complete pipeline end-to-end:

```bash
node src/index.js
```

### Pipeline Flow

When executed, the script will output its progress to the console across 6 distinct phases:

1. **Phase 1**: Setup (implicit).
2. **Phase 2**: Loads raw reviews, filters spam/noise, and strips PII.
3. **Phase 3**: Sends sanitized reviews to Groq to generate a `themes.json` map.
4. **Phase 4**: Generates a raw `pulse.md` summary.
5. **Phase 5**: Polishes the outputs into `final_report.md` and `email_body.txt`.
6. **Phase 6**: Connects to the MCP Server, appends the report to Google Docs, and sends the summary email.

## Project Structure

```
├── data/
│   ├── reviews/           # Input raw reviews
│   └── analysis/          # Output generated files (themes, pulse, reports)
├── docs/                  # Architecture and planning documentation
├── src/
│   ├── analysis/          # LLM Theme clustering logic
│   ├── generation/        # Pulse and Report generation
│   ├── ingestion/         # Data loaders and normalizers
│   ├── integrations/      # MCP Client, Docs Publisher, Gmail Sender
│   ├── privacy/           # PII Stripper
│   ├── utils/             # Helpers (word counts, dates)
│   └── index.js           # Main pipeline orchestrator
├── package.json
└── README.md
```
