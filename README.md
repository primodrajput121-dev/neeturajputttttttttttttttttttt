# 📧 Secure Mail Console

A high-speed, secure web-based bulk email sending console built with Node.js, Express, and Nodemailer designed for Gmail SMTP and Vercel Serverless deployment.

## 🚀 Features
- **1-by-1 Real-time Streaming (SSE)**: Live Progress Monitor updates per email dispatched.
- **Safe Fast Async Mode**: Optimized asynchronous pool dispatch without worker thread crashes.
- **Pure Clean Emails**: Zero added footers, zero tracking links, direct Primary Inbox delivery.
- **Spintax Support**: Dynamic subjects & bodies using `{Hi|Hello|Hey}` format.
- **Password Gate**: Protected login system using `SITE_PASSWORD` environment variable.
- **Cloudflare Turnstile**: Automated anti-spam protection integrated.

## 🛠 Setup & Deployment
1. Run `npm install`
2. Start local server with `npm start`
3. Set `SITE_PASSWORD` in Vercel Environment Variables.
