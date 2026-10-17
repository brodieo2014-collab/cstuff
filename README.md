# cstuff

A black-themed site with a working web proxy (Ultraviolet + Epoxy/Wisp), a games page, a live chat and a credits page. The site opens on the proxy. Falling leaves run on every page.

## Run locally

    npm install
    npm start        # http://localhost:8080

## Deploy to Render

1. Push this folder to a GitHub repo.
2. In Render: New > Blueprint (it reads `render.yaml`), or New > Web Service with
   - Build command: `npm ci`
   - Start command: `node server.js`
   - Health check path: `/healthz`
3. Deploy. Render sets `PORT` automatically and serves HTTPS, which the proxy's service worker needs.

Notes: the free plan sleeps after inactivity (first load after a nap is slow) and chat history is kept in memory, so it resets on restart.
