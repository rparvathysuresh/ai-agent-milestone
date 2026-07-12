# Deployment Plan: GitHub Actions & Railway

This document outlines the end-to-end deployment strategy for the Weekly App Review Pulse pipeline. The deployment is divided into two phases: first, validating the pipeline using a **GitHub Actions Scheduler** (which is completely free), and then officially deploying the project as a scheduled Cron Job on **Railway**.

---

## Phase 1: GitHub Actions Scheduler (Free Tier)

Before moving to a dedicated hosting provider, we first set up a GitHub Actions workflow to ensure the pipeline runs correctly in the cloud on a schedule.

### 1.1 The Workflow File
Your repository includes a workflow file located at `.github/workflows/pulse.yml`. This file tells GitHub to automatically spin up a secure environment, install dependencies, inject your secrets, and run `npm start` every day at 10:30 AM IST (5:00 AM UTC).

It also supports a `workflow_dispatch` trigger, meaning you can manually click a "Run workflow" button in the GitHub UI at any time.

### 1.2 Set Up GitHub Secrets
To authenticate the pipeline, you must provide your environment variables securely to GitHub.

1. Navigate to your repository on GitHub.
2. Click on **Settings** -> **Secrets and variables** -> **Actions**.
3. Click **New repository secret**.
4. Add the following secrets one by one:

**Required Secrets:**
- `GROQ_API_KEY` = (Your Groq API Key, starting with `gsk_...`)
- `MCP_SERVER_URL` = (Your hosted Railway MCP server URL, e.g., `https://mcp-server-production-1ca2.up.railway.app/sse`)
- `MCP_AUTH_TOKEN` = (The auth token you chose for your MCP server)
- `GOOGLE_DOC_ID` = (The ID of the Google Doc where pulses will be appended)
- `PULSE_RECIPIENT` = (The email address to send the pulse to)

### 1.3 Verification
1. Go to the **Actions** tab in your GitHub repository.
2. Select **Weekly Pulse Pipeline** on the left.
3. Click **Run workflow** -> **Run workflow**.
4. Monitor the logs to ensure it completes successfully (`Exit Code 0`).
5. Check your Gmail Drafts and Google Doc to confirm the Weekly Pulse arrived successfully.

---

## Phase 2: Deploying to Railway

Once the GitHub Actions workflow runs successfully, you can graduate the project to **Railway**. 

> **Note:** Railway's native Cron Job feature requires a Hobby plan or higher. 

### 2.1 Create the Project on Railway
1. Log in to your [Railway Dashboard](https://railway.app/).
2. Click **New Project** (or **New** in an existing project).
3. Select **Deploy from GitHub repo** and choose your `ai-agent-milestone` repository.
4. Railway will automatically detect it as a Node.js app and begin building.

### 2.2 Configure as a Cron Job
By default, Railway tries to deploy repositories as continuous Web Services. Because our pipeline is a script that runs and exits, we must tell Railway it's a Cron Job.

1. Click on your newly created service in the Railway dashboard.
2. Go to the **Settings** tab.
3. Under the **General** section, look for **Service Type**.
4. Change the Service Type from *Web Service* to **Cron Job**.
5. Set the **Cron Schedule** to `0 5 * * *` (which is 10:30 AM IST).
6. Ensure the **Start Command** is set to `npm start`.

### 2.3 Set Environment Variables
1. In your Railway service, go to the **Variables** tab.
2. Click **New Variable** and add the exact same 5 variables you added to GitHub Secrets:
   - `GROQ_API_KEY`
   - `MCP_SERVER_URL`
   - `MCP_AUTH_TOKEN`
   - `GOOGLE_DOC_ID`
   - `PULSE_RECIPIENT`

Once the variables are saved and the Service Type is set to Cron Job, Railway will automatically redeploy the service.

### 2.4 Final Clean Up
Since you are now deploying via Railway, the GitHub Actions cron scheduler is redundant and will cause the pipeline to run twice. 

To prevent this:
1. Delete or disable the `.github/workflows/pulse.yml` file from your repository.
2. Rely entirely on Railway for your scheduled executions moving forward!
