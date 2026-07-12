# Deployment Plan: Railway Cron Job

This document outlines the steps required to deploy the Weekly App Review Pulse pipeline to **Railway** as a scheduled Cron Job.

> **Note:** Railway's native Cron Job feature requires a Hobby plan or higher. If you are on the strictly Free tier, Railway spins down inactive projects and does not natively support Cron scheduling.

---

## 1. Prerequisites

Ensure your latest code is pushed to your GitHub repository. The pipeline is fully configured and ready to be run in a Node.js environment.

## 2. Deploying on Railway

### Step 2.1: Create the Project

1. Log in to your [Railway Dashboard](https://railway.app/).
2. Click **New Project** (or **New** in an existing project).
3. Select **Deploy from GitHub repo**.
4. Choose your repository: `ai-agent-milestone`.
5. Railway will automatically detect it as a Node.js app and begin building.

### Step 2.2: Configure as a Cron Job

By default, Railway tries to deploy repositories as continuous Web Services. Because our pipeline is a script that runs and exits, it will crash if run as a standard Web Service. We must tell Railway it's a Cron Job.

1. Click on your newly created service in the Railway dashboard.
2. Go to the **Settings** tab.
3. Under the **General** section, look for **Service Type**.
4. Change the Service Type from *Web Service* to **Cron Job**.
5. You will now see a **Cron Schedule** input field.
6. Enter your desired cron schedule. For example, to run every day at 10:30 AM IST (5:00 AM UTC), enter:
   `0 5 * * *`
7. For the **Start Command**, ensure it is set to `npm start`.

### Step 2.3: Set Environment Variables

The pipeline needs credentials to authenticate with Groq and your Google Workspace MCP Server.

1. In your Railway service, go to the **Variables** tab.
2. Click **New Variable** and add the following keys (do not use quotes):

**Required Variables to add:**
- `GROQ_API_KEY` = (Your Groq API Key, starting with `gsk_...`)
- `MCP_SERVER_URL` = (Your hosted Railway MCP server URL, e.g., `https://mcp-server-production-1ca2.up.railway.app/sse`)
- `MCP_AUTH_TOKEN` = (The auth token you chose for your MCP server)
- `GOOGLE_DOC_ID` = (The ID of the Google Doc where pulses will be appended)
- `PULSE_RECIPIENT` = (The email address to send the pulse to)

## 3. Verification & Testing

Once your variables are saved and the Service Type is set to Cron Job, Railway will automatically redeploy the service.

1. **Manual Trigger:** In Railway, you can usually trigger a Cron Job manually by clicking a "Run Now" or "Trigger" button in the deployments list.
2. **Logs:** Click on the active deployment to view the **View Logs** tab. You should see the pipeline successfully extract reviews, cluster them using Groq, and publish to Google Docs.
3. **Verify Outputs:** Check your Gmail Drafts and Google Doc to confirm the Weekly Pulse arrived successfully.

---

## 4. (Optional) Cleaning Up GitHub Actions

Since you are now deploying via Railway, the GitHub Actions cron scheduler is redundant. 

If you want to prevent GitHub Actions from running at the same time as Railway:
1. Delete the `.github/workflows/pulse.yml` file from your repository.
2. Commit and push the deletion.
