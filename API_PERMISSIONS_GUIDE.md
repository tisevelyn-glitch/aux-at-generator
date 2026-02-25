# Adobe Target API Permissions Guide

If you get **403 Forbidden** when calling the API (e.g. when searching offers by ID or listing offers), your Adobe I/O integration likely needs **explicit workspace permissions**. This guide explains how to grant them.

---

## Why 403 Happens

- **Target Premium** uses **Enterprise Permissions**: workspaces (Product Profiles) and role-based access.
- Your integration (Client ID) only has access to workspaces you **explicitly assign** in the **Adobe Admin Console**.
- If the integration is not added to a workspace, or has the wrong role, API calls for that workspace return **403 Forbidden**.

---

## Prerequisites

- **Target Premium** license (Enterprise Permissions are not available in Target Standard).
- **Product Admin** and **Developer** access to Adobe Target.
- An existing **Adobe I/O integration** (project with credentials: Client ID, Client Secret, etc.) used by this app.

---

## Step 1: Grant Your Integration Access to Workspaces

You must add your Adobe I/O integration to each **Target workspace (Product Profile)** where you want to use the API.

### 1.1 Open Adobe Admin Console

- **Link:** [https://adminconsole.adobe.com](https://adminconsole.adobe.com)
- Sign in with an account that has **Product Admin** rights for Adobe Target.

### 1.2 Go to Products → Adobe Target

1. Click the **Products** tab.
2. Select **Adobe Target** (or your product name that includes Target).

### 1.3 Select the Workspace (Product Profile)

1. You will see a list of **Product Profiles** (these are your Target **workspaces**, e.g. Default, SEBN, SEF, SEG, SEIB-ES, SEIB-PT).
2. Click the **name of the workspace** you want the API to access (e.g. the one where your offers/activities live).

### 1.4 Add the Integration and Set the Role

1. Click the **Integrations** tab for that Product Profile.
2. Click **Add Integration**.
3. Select your **Adobe I/O integration** (the one whose Client ID you use in this app).
4. From the **Product Role** drop-down, choose the role:

   | Role      | Description |
   |-----------|-------------|
   | **Approver** | Create, edit, activate/stop activities. Full CRUD on activities, audiences, offers. |
   | **Editor**   | Create and edit activities before they go live. Cannot approve/launch. |
   | **Observer** | View only. No create/edit. Good for reporting. |
   | **Publisher**| View + permission to activate activities. |

   For this app (create offers, create activities, change state), use **Approver** or **Editor**.
5. Click **Save**.

### 1.5 Repeat for Other Workspaces

- Repeat **1.3–1.4** for every workspace you need (e.g. All, Default, SEBN, SEF, SEG, SEIB-ES, SEIB-PT).
- If your offer/activity is in a specific workspace, that workspace **must** have your integration added with at least **Editor** or **Approver**.

---

## Official Documentation Links

| Topic | Link |
|-------|-----|
| **Grant Adobe I/O access to workspaces and assign roles** | [Configure Adobe I/O Integration (Experience League)](https://experienceleague.adobe.com/en/docs/target/using/administer/manage-users/enterprise/configure-adobe-io-integration) |
| **Adobe Admin Console** | [https://adminconsole.adobe.com](https://adminconsole.adobe.com) |
| **Configure authentication for Adobe Target APIs** | [Configure authentication (Experience League)](https://experienceleague.adobe.com/en/docs/target-dev/developer/api/configure-authentication) |
| **Target Admin API overview** | [Admin API Overview (Experience League)](https://experienceleague.adobe.com/en/docs/target-dev/developer/api/admin-api/admin-api-overview) |

---

## Summary Checklist

- [ ] Open [Adobe Admin Console](https://adminconsole.adobe.com) → **Products** → **Adobe Target**.
- [ ] For each workspace you use (e.g. Default, SEBN, SEF, …): open it → **Integrations** → **Add Integration** → select your integration → set role **Editor** or **Approver** → **Save**.
- [ ] Wait a few minutes if needed, then retry **Get Access Token** and **Search by Offer ID** in this app.

If 403 persists after adding the integration to the correct workspace(s), confirm with your Target admin that the integration’s Client ID matches the one in `.env` and that the Product Profile (workspace) you added is the one that contains your offers.
