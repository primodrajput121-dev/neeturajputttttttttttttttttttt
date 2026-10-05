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

// 'public' फ़ोल्डर की स्टैटिक फ़ाइलों को सर्व करें
app.use(express.static(path.join(__dirname, '../public')));

// Root URL पर HTML फ़ाइल दिखाएं
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

/* ==========================================================================
   API ROUTES
   ========================================================================== */
app.post('/api/send-email', async (req, res) => {
  const { to, subject, htmlContent, textContent } = req.body;

  if (!to || !subject || (!htmlContent && !textContent)) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: to, subject, and body content.',
    });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const mailOptions = {
      from: `"${process.env.SENDER_NAME || 'Support'}" <${process.env.SENDER_EMAIL || process.env.SMTP_USER}>`,
      to: to.trim(),
      subject: subject.trim(),
      text: textContent || undefined,
      html: htmlContent || undefined,
    };

    const info = await transporter.sendMail(mailOptions);
    return res.json({
      success: true,
      message: 'Email dispatched successfully.',
      messageId: info.messageId,
    });
  } catch (error) {
    console.error('Error sending email:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send email.',
      error: error.message,
    });
  }
});

export default app;
