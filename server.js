import 'dotenv/config';
import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Helper Spintax Parser
function parseSpintax(text) {
  const matches = text.match(/{[^{}]*}/g);
  if (!matches) return text;
  for (const match of matches) {
    const choices = match.slice(1, -1).split('|');
    const randomChoice = choices[Math.floor(Math.random() * choices.length)];
    text = text.replace(match, randomChoice);
  }
  return parseSpintax(text);
}

// 1. Password Verification Route
app.post('/api/auth', (req, res) => {
  const { password } = req.body;
  const sitePassword = process.env.SITE_PASSWORD || 'admin';

  if (password === sitePassword) {
    return res.json({ success: true });
  }
  return res.status(401).json({ success: false, message: 'Invalid Password' });
});

// 2. SMTP Verification Route
app.post('/api/verify', async (req, res) => {
  const { email, appPassword } = req.body;

  if (!email || !appPassword) {
    return res.status(400).json({ success: false, message: 'Missing credentials' });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: email, pass: appPassword }
    });

    await transporter.verify();
    return res.json({ success: true, message: 'SMTP Authenticated' });
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid Gmail or App Password' });
  }
});

// 3. Real-time Email Stream (Server-Sent Events)
app.post('/api/send-stream', async (req, res) => {
  const { email, appPassword, senderName, subject, messageBody, recipients } = req.body;

  if (!email || !appPassword || !recipients || !Array.isArray(recipients)) {
    return res.status(400).json({ success: false, message: 'Invalid payload' });
  }

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: email, pass: appPassword }
  });

  const cleanSender = (senderName || "").replace(/"/g, "").trim();

  for (const recipient of recipients) {
    try {
      const parsedSubject = parseSpintax(subject);
      const parsedBody = parseSpintax(messageBody);

      const mailOptions = {
        from: cleanSender ? `"${cleanSender}" <${email}>` : email,
        to: recipient,
        subject: parsedSubject,
        html: parsedBody.includes('<') && parsedBody.includes('>') ? parsedBody : undefined,
        text: parsedBody.includes('<') && parsedBody.includes('>') ? undefined : parsedBody
      };

      const info = await transporter.sendMail(mailOptions);
      res.write(`data: ${JSON.stringify({ success: true, recipient, messageId: info.messageId })}\n\n`);
    } catch (err) {
      res.write(`data: ${JSON.stringify({ success: false, recipient, error: err.message })}\n\n`);
    }

    // Small delay to prevent Gmail rate-limit block
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  res.write('data: [DONE]\n\n');
  res.end();
});

app.post('/api/stop', (req, res) => {
  return res.json({ success: true, message: 'Stopped' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
