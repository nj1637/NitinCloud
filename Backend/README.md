# 🚀 NitinCloud — Personal BaaS Platform

Your own Firebase alternative. Zero cost. Full control.

---

## Architecture

```
NitinCloud
├── backend/          ← Node.js + SQLite (deploy to Render.com)
│   ├── server.js     ← Full REST API
│   ├── package.json
│   ├── render.yaml
│   └── README.md     ← Full API docs
└── frontend/         ← Dashboard (deploy to Vercel)
    ├── index.html    ← Complete SPA
    └── vercel.json
```

---

## 🟢 Step 1: Deploy Backend to Render.com (FREE)

1. **Create a GitHub repo** named `nitincloud-backend`
2. **Push the `/backend` folder** contents to it
3. Go to **render.com** → New → Web Service
4. Connect your GitHub repo
5. Settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
6. Add **Environment Variables**:
   - `MASTER_KEY` = `your-secret-key-change-this`
   - `DB_PATH` = `/opt/render/project/src/data/nitincloud.db`
7. Add a **Disk** (Render free tier supports it):
   - Name: `nitincloud-db`
   - Mount Path: `/opt/render/project/src/data`
   - Size: 1 GB
8. Click **Deploy!**

Your API will be live at: `https://nitincloud-api.onrender.com`

---

## 🔵 Step 2: Deploy Frontend to Vercel (FREE)

1. **Create a GitHub repo** named `nitincloud-frontend`
2. **Push the `/frontend` folder** contents to it
3. Go to **vercel.com** → New Project → Import repo
4. Click **Deploy** (no config needed)

Your dashboard will be live at: `https://nitincloud.vercel.app`

---

## 🔑 Step 3: Connect Dashboard to API

1. Open your Vercel URL
2. Enter your Render API URL + Master Key
3. Click **Connect**
4. ✅ Done!

---

## 📱 Creating Your First App (Tool)

1. Click **+ New App** on Dashboard
2. Give it a name (e.g. "Dev Ayurveda ERP")
3. Copy the generated **API Key**
4. In your tool's HTML, paste the NC SDK snippet (Dashboard → App → "Use in Tool")

---

## ⚡ Using NitinCloud in Any Tool

```javascript
// Copy this from Dashboard → App → "Use in Tool" button
const NC = {
  base: "https://nitincloud-api.onrender.com",
  key:  "nc_live_your_app_api_key",

  get:    async (col, params={}) => { /* fetch docs */ },
  add:    async (col, data)      => { /* create doc */ },
  update: async (col, id, data)  => { /* update doc */ },
  del:    async (col, id)        => { /* delete doc */ }
};

// Example — Dev Ayurveda ERP
const products = await NC.get('products', { category: 'herbs' });
await NC.add('invoices', { customer: 'Ram Ji', total: 1500, status: 'Paid' });
```

---

## 💰 Cost: ₹0 Forever

| Service | Plan    | Cost |
|---------|---------|------|
| Render  | Free    | ₹0   |
| Vercel  | Hobby   | ₹0   |
| SQLite  | On disk | ₹0   |

**Limits (free tier):**
- Render: 750 hrs/month (enough for 1 service 24/7)
- Storage: 1 GB SQLite (millions of records)
- Vercel: Unlimited static hosting

---

## 🔒 Security Notes

1. **Change MASTER_KEY** in Render env vars before deploying
2. Each app gets its own API key — tools only access their own data
3. Keys can be rotated anytime from Dashboard
4. 
