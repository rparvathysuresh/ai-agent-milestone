# Deployment Plan: GitHub Actions (Free Tier)

This document outlines the steps required to deploy the Weekly App Review Pulse pipeline. Since this agent is a batch-processing pipeline that runs on a schedule (rather than a 24/7 web server), the optimal, completely **free** deployment strategy is to run it as a **GitHub Action Cron Job**. 

Railway Cron Jobs require a paid tier, but GitHub Actions provides generous free compute minutes that are perfect for this exact use case!

---

## 1. Preparation

Ensure your repository is pushed to GitHub. The code now includes a workflow file located at `.github/workflows/pulse.yml`.

### 1.1 The Workflow File
This file tells GitHub to automatically spin up a secure environment, install dependencies, inject your secrets, and run `npm start` every day at 10:30 AM IST (5:00 AM UTC).

It also supports a `workflow_dispatch` trigger, meaning you can manually click a "Run workflow" button in the GitHub UI at any time to run the pipeline instantly.

---

## 2. GitHub Actions Deployment Steps

### 2.1 Set Up GitHub Secrets
For the pipeline to authenticate with Groq and your MCP server, you must provide your environment variables securely to GitHub.

1. Navigate to your repository on GitHub.
2. Click on **Settings** (the gear icon tab).
3. In the left sidebar, expand **Secrets and variables** and click **Actions**.
4. Click the green **New repository secret** button.
5. Add the following secrets one by one, copying the values from your local `.env` file:

**Required Secrets to add:**
- `GROQ_API_KEY` = (Your Groq API Key, starting with `gsk_...`)
- `MCP_SERVER_URL` = (Your hosted Railway MCP server URL, e.g., `https://mcp-server-production-1ca2.up.railway.app/sse`)
- `MCP_AUTH_TOKEN` = (The auth token you chose for your MCP server)
- `GOOGLE_DOC_ID` = (The ID of the Google Doc where pulses will be appended)
- `PULSE_RECIPIENT` = (The email address to send the pulse to)

*(Note: Constants like models and `REVIEW_WINDOW_WEEKS` are already hardcoded in the workflow file for convenience, so you don't need to add them as secrets).*

---

## 3. Verification & Manual Trigger

Once your secrets are saved, the cron job is active and will run automatically on schedule. To test it immediately:

1. Go to the **Actions** tab in your GitHub repository.
2. On the left sidebar, click on **Weekly Pulse Pipeline**.
3. On the right side, click the **Run workflow** dropdown button, then click the green **Run workflow** button.
4. Wait a few seconds, and a new workflow run will appear in the list.
5. Click on it to watch the logs in real-time as the agent clusters themes, formats the pulse, and sends it to the MCP server.
6. Check your Gmail and Google Doc to confirm delivery!

---

## 4. (Optional) Data Persistence

Currently, the pipeline processes the static reviews stored in `data/reviews/`. Because the GitHub Actions runner is ephemeral (it gets destroyed after every run), it will always start fresh with whatever files are currently committed to the repository.

Since the final generated reports are pushed securely to Google Docs and Gmail via your MCP server, this ephemeral setup works perfectly and securely!
