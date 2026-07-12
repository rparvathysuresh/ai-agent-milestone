# Deployment Plan: Deploying the AI Agent on Railway

This document outlines the steps required to deploy the Weekly App Review Pulse pipeline to [Railway](https://railway.app/). Since this agent is a batch-processing pipeline rather than a long-running HTTP server, the optimal deployment strategy is to run it as a **Railway Cron Job**.

---

## 1. Preparation

Before deploying, ensure your repository is ready for a production environment.

### 1.1 `package.json` Updates
Ensure you have a standard `start` script defined in your `package.json` that executes the pipeline.
```json
"scripts": {
  "start": "node src/index.js"
}
```

### 1.2 Git Repository
Push your code to a GitHub repository. Ensure that:
- `.env` is included in your `.gitignore` and **not** committed to the repository.
- `data/reviews/playstore_reviews.csv` and `data/reviews/appstore_reviews.json` *are* committed if you want the pipeline to process this static historical data. (If you plan to dynamically fetch reviews in the future, you won't need to commit these).

---

## 2. Railway Deployment Steps

### 2.1 Connect GitHub to Railway
1. Log in to your Railway dashboard.
2. Click **New Project** -> **Deploy from GitHub repo**.
3. Select the repository containing your AI agent pipeline.
4. Railway will automatically detect it as a Node.js project using Nixpacks.

### 2.2 Configure Environment Variables
Navigate to the **Variables** tab of your new Railway service and add all the environment variables from your local `.env` file.

**Required Variables:**
- `GROQ_API_KEY` = `gsk_...`
- `GROQ_MODEL` = `llama-3.3-70b-versatile`
- `MCP_SERVER_URL` = `https://mcp-server-production-1ca2.up.railway.app/sse`
- `MCP_AUTH_TOKEN` = `your_auth_token`
- `GOOGLE_DOC_ID` = `master-pulse-document-id`
- `PULSE_RECIPIENT` = `stakeholder@example.com`
- `REVIEW_WINDOW_WEEKS` = `10`

*(Note: You do not need to add Gemini variables since we transitioned to Groq).*

---

## 3. Configure as a Cron Job

By default, Railway attempts to run services as long-running HTTP servers and expects them to bind to a `PORT`. Since our agent runs, completes its tasks, and exits, Railway will think the service crashed if configured as a standard web service.

To fix this, we configure it as a **Cron Job**.

1. Go to the **Settings** tab of your Railway service.
2. Scroll down to the **Service Mode** section.
3. Change the mode from *Service* to **Cron Job**.
4. Set your Cron Schedule. For example, to run the pipeline every Monday at 9:00 AM UTC, use:
   ```text
   0 9 * * 1
   ```
5. Click **Deploy**.

---

## 4. (Optional) Data Persistence

Currently, the pipeline writes output files to `data/analysis/` (e.g., `themes.json`, `pulse.md`, `final_report.md`).
In Railway, the file system is ephemeral. Every time the cron job runs, it starts with a fresh clone of your repository. 

Because we push the final results to a Google Doc and send an email via the MCP server, the ephemeral filesystem is perfectly fine! The analysis is safely delivered to stakeholders. 

*If* you ever need to store the raw analysis files persistently between runs:
1. Go to the **Volumes** tab in Railway and click **Create Volume**.
2. Mount the volume to the `/app/data` directory so that generated files are saved permanently.

---

## 5. Verification

1. Go to the **Deployments** tab.
2. You can manually trigger the cron job by clicking **Run Now**.
3. Click on the active deployment to view the **View Logs**. 
4. Verify that you see the standard 6-phase console output:
   - Phase 1 & 2: Ingestion & PII Stripping
   - Phase 3 & 4: Groq Clustering & Pulse Gen
   - Phase 5: Groq Finalisation
   - Phase 6: MCP Integration
5. Check your Gmail Inbox/Sent folder and your Google Doc to confirm delivery!
