import 'dotenv/config';
import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ==========================================================================
   SMTP TRANSPORTER CONFIGURATION
   ========================================================================== */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.example.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/* ==========================================================================
   API ROUTES
   ========================================================================== */
app.get('/', (req, res) => {
  res.send('Server is running on Vercel!');
});

app.post('/api/send-email', async (req, res) => {
  const { to, subject, htmlContent, textContent } = req.body;

  if (!to || !subject || (!htmlContent && !textContent)) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: to, subject, and body content.',
    });
  }

  try {
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

// VERCEL KE LIYE MUST: app.listen() MAT LAGAEN, EXPORT KAREIN
export default app;
