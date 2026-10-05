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

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

/* ==========================================================================
   1. STANDARD SMTP TRANSPORTER CONFIGURATION
   ========================================================================== */
// Dedicated Transactional Email Service Credentials (from .env)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.example.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  pool: true, // Reuse connections
  maxConnections: 5,
  maxMessages: 100,
});

// Verify SMTP connection health on startup
transporter.verify((error) => {
  if (error) {
    console.error('❌ SMTP Connection Error:', error);
  } else {
    console.log('✅ SMTP Server Ready for Delivery');
  }
});

/* ==========================================================================
   2. API ROUTES FOR LEGITIMATE TRANSACTIONAL EMAILS
   ========================================================================== */

// Route: Send Single Transactional Email
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
