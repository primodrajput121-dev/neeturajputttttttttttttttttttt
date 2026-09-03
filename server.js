import 'dotenv/config';
import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const SITE_PASSWORD = process.env.SITE_PASSWORD || 'Y##';

let globalStopRequested = false;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

/* ==========================================================================
   1. TRANSPORTER CREATOR (Vercel-Safe Non-Pooling Connection)
   ========================================================================== */
function createTransporter(email, appPassword) {
  const cleanEmail = email.toLowerCase().trim();
  const cleanPass = appPassword.replace(/\s+/g, '').trim();

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // STARTTLS
    requireTLS: true,
    auth: {
      user: cleanEmail,
      pass: cleanPass
    },
    pool: false,
    socketTimeout: 25000,
    connectionTimeout: 25000
  });
}

/* ==========================================================================
   2. HUMAN BEHAVIOR & CONTENT ENGINES
   ========================================================================== */
function generateInvisibleFingerprint() {
  const zwChars = ['\u200B', '\u200C', '\u200D', '\uFEFF'];
  let fingerprint = '';
  for (let i = 0; i < 6; i++) {
    fingerprint += zwChars[Math.floor(Math.random() * zwChars.length)];
  }
  return fingerprint;
}

function getOrganicCallToAction() {
  const ctas = [
    "Would love to hear your thoughts on this.",
    "Let me know if this sounds relevant to you right now.",
    "Feel free to reply directly to this mail if you have any questions.",
    "Looking forward to your thoughts whenever you get a moment.",
    "Do you have 2 minutes for a brief response on this?"
  ];
  return ctas[Math.floor(Math.random() * ctas.length)];
}

function parseRecipientData(input) {
  let email = "";
  let rawName = "";

  if (typeof input === 'object' && input !== null) {
    email = (input.email || input.recipient || "").trim();
    rawName = (input.name || input.fullName || input.first_name || "").trim();
  } else if (typeof input === 'string') {
    const str = input.trim();
    const angleMatch = str.match(/^(?:"?([^"]*)"?\s)?<([^>]+)>$/);
    if (angleMatch) {
      rawName = angleMatch[1] ? angleMatch[1].trim() : "";
      email = angleMatch[2].trim();
    } else if (str.includes(',')) {
      const parts = str.split(',');
      if (parts[0].includes('@')) {
        email = parts[0].trim();
        rawName = parts[1].trim();
      } else {
        rawName = parts[0].trim();
        email = parts[1].trim();
      }
    } else {
      email = str;
    }
  }

  if (!rawName && email.includes('@')) {
    const prefix = email.split('@')[0];
    rawName = prefix.replace(/[0-9_.-]/g, ' ').trim();
  }

  const formattedName = rawName
    ? rawName.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    : "";

  const firstName = formattedName ? formattedName.split(' ')[0] : "there";
  const domain = email.includes('@') ? email.split('@')[1] : "";

  return {
    email: email.toLowerCase(),
    name: formattedName,
    firstName: firstName,
    domain: domain
  };
}

function parseSpintax(text) {
  if (!text) return "";
  let spun = String(text);
  const regex = /\{([^{}]+)\}/s;
  let iterations = 0;

  while (regex.test(spun) && iterations < 25) {
    spun = spun.replace(regex, (_, choices) => {
      if (!choices.includes('|')) return choices;
      const options = choices.split('|');
      const pick = options[Math.floor(Math.random() * options.length)];
      return pick ? pick.trim() : '';
    });
    iterations++;
  }
  return spun.replace(/[\{\}]/g, '').trim();
}

function personalizeContent(template, recipient) {
  if (!template) return "";
  let content = parseSpintax(template);
  const fallback = recipient.firstName || recipient.name || 'there';
  const currentDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  content = content.replace(/{Name}/gi, recipient.name || fallback);
  content = content.replace(/{FirstName}/gi, recipient.firstName || fallback);
  content = content.replace(/{First_Name}/gi, recipient.firstName || fallback);
  content = content.replace(/{Email}/gi, recipient.email);
  content = content.replace(/{Domain}/gi, recipient.domain);
  content = content.replace(/{Date}/gi, currentDate);

  return content;
}

function createPlainTextFromHtml(html) {
  if (!html) return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}

/* ==========================================================================
   3. API ROUTES
   ========================================================================== */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/auth', (req, res) => {
  const { password } = req.body;
  if (password === SITE_PASSWORD) {
    return res.json({ success: true, message: "Authorized" });
  }
  return res.status(401).json({ success: false, message: "Unauthorized Password" });
});

app.post("/api/verify", async (req, res) => {
  const { email, appPassword } = req.body;
  if (!email || !appPassword) {
    return res.status(400).json({ success: false, message: "Credentials required" });
  }

  try {
    const transporter = createTransporter(email, appPassword);
    await transporter.verify();
    return res.json({ success: true, message: "SMTP verified successfully" });
  } catch (error) {
    return res.status(401).json({ success: false, message: "SMTP Auth Failed. Check App Password." });
  }
});

/* ==========================================================================
   4. STREAMING ENGINE (6 Emails Batch + 1-2 Sec Random Delay)
   ========================================================================== */
app.post('/api/send-stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const { email, appPassword, senderName, subject, messageBody, recipients } = req.body;

  if (!email || !appPassword || !Array.isArray(recipients) || recipients.length === 0) {
    res.write(`data: ${JSON.stringify({ success: false, error: "Invalid Request Data" })}\n\n`);
    res.end();
    return;
  }

  const cleanEmail = email.toLowerCase().trim();
  const cleanSenderName = (senderName || "").replace(/["\r\n]/g, "").trim();
  globalStopRequested = false;
  let isClientClosed = false;

  req.on('close', () => {
    isClientClosed = true;
  });

  const transporter = createTransporter(email, appPassword);
  const BATCH_SIZE = 6;

  const sendMailItem = async (rawRecipient) => {
    const recipient = parseRecipientData(rawRecipient);
    if (!recipient.email) return;

    const personalizedSubject = personalizeContent(subject, recipient);
    const personalizedBody = personalizeContent(messageBody, recipient);
    const isHtml = /<[a-z][\s\S]*>/i.test(personalizedBody);

    const invisibleHash = generateInvisibleFingerprint();
    const organicCTA = getOrganicCallToAction();
    const preciseUtcDate = new Date().toUTCString();

    const mailOptions = {
      from: cleanSenderName ? `"${cleanSenderName}" <${cleanEmail}>` : cleanEmail,
      to: recipient.name ? `"${recipient.name}" <${recipient.email}>` : recipient.email,
      replyTo: cleanEmail,
      date: preciseUtcDate,
      subject: personalizedSubject || 'Hello'
    };

    if (isHtml) {
      mailOptions.html = `
        <div dir="ltr">
          ${personalizedBody}
          <br><br>
          <p style="font-size: 13px; color: #444444; margin-top: 15px;">${organicCTA}</p>
          <span style="display:none !important; font-size:0px; line-height:0px; opacity:0; color:transparent;">${invisibleHash}</span>
        </div>
      `;
      mailOptions.text = createPlainTextFromHtml(personalizedBody) + `\n\n${organicCTA}`;
    } else {
      mailOptions.text = personalizedBody + `\n\n${organicCTA}` + `\n` + invisibleHash;
    }

    try {
      await transporter.sendMail(mailOptions);
      if (!isClientClosed) {
        res.write(`data: ${JSON.stringify({ success: true, recipient: recipient.email, name: recipient.name })}\n\n`);
      }
    } catch (err) {
      if (!isClientClosed) {
        res.write(`data: ${JSON.stringify({ success: false, recipient: recipient.email, error: err.message })}\n\n`);
      }
    }
  };

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    if (globalStopRequested || isClientClosed) break;

    const currentBatch = recipients.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(currentBatch.map(item => sendMailItem(item)));

    if (i + BATCH_SIZE < recipients.length && !globalStopRequested && !isClientClosed) {
      const delay = Math.floor(1000 + Math.random() * 1000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  if (!isClientClosed) {
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

app.post('/api/stop', (req, res) => {
  globalStopRequested = true;
  res.json({ success: true, message: "Sending process stopped" });
});

app.listen(PORT, () => {
  console.log(`Server running on Port ${PORT}`);
});

export default app;
