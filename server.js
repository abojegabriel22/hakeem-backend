require('dotenv').config()

const cors = require('cors')
const express = require('express')
const multer = require('multer')
const nodemailer = require('nodemailer')
const { rateLimit } = require('express-rate-limit')
const path = require('node:path')

const app = express()
const port = Number(process.env.PORT) || 3000
const managementEmail = process.env.MANAGEMENT_EMAIL || 'martinluthermod@gmail.com'
const enquiryTypes = [
  'Film & television',
  'Streaming production',
  'Voiceover',
  'Speaking & appearances',
  'Brand ambassadorship',
  'Commercial endorsement',
  'Nigerian production',
  'International production',
  'Other',
]

const fieldLimits = {
  name: 120,
  company: 160,
  email: 254,
  phone: 80,
  country: 100,
  type: 80,
  production: 160,
  role: 160,
  dates: 120,
  budget: 120,
  description: 3000,
  message: 5000,
}

const requiredFields = ['name', 'company', 'email', 'type', 'message']
const allowedExtensions = new Set(['.pdf', '.doc', '.docx', '.txt'])
const allowedMimeTypes = new Set([
  'application/msword',
  'application/octet-stream',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
])

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN
    ? process.env.FRONTEND_ORIGIN.split(',').map((origin) => origin.trim())
    : true,
}))
app.use(express.json({ limit: '32kb' }))
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many enquiries. Please try again later.' },
}))

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    fieldSize: 6000,
    files: 1,
    fields: Object.keys(fieldLimits).length,
    parts: Object.keys(fieldLimits).length + 1,
  },
  fileFilter(_req, file, callback) {
    if (!file.originalname) {
      callback(null, false)
      return
    }

    const extension = path.extname(file.originalname).toLowerCase()
    if (!allowedExtensions.has(extension) || !allowedMimeTypes.has(file.mimetype)) {
      callback(new Error('Attachment must be a PDF, DOC, DOCX, or TXT file.'))
      return
    }
    callback(null, true)
  },
})

let transporter

function getTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error('Email service is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.')
  }

  if (!transporter) {
    const smtpPort = Number(SMTP_PORT)
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
      throw new Error('SMTP_PORT must be a valid port number.')
    }

    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: smtpPort,
      secure: process.env.SMTP_SECURE
        ? process.env.SMTP_SECURE.toLowerCase() === 'true'
        : smtpPort === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  }

  return transporter
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character])
}

function normalizeBooking(body) {
  const booking = {}

  for (const [field, maxLength] of Object.entries(fieldLimits)) {
    const value = body[field] ?? ''
    if (typeof value !== 'string') {
      return { error: `${field} must be a text value.` }
    }

    booking[field] = value.trim()
    if (booking[field].length > maxLength) {
      return { error: `${field} must be ${maxLength} characters or fewer.` }
    }
  }

  const missingField = requiredFields.find((field) => !booking[field])
  if (missingField) {
    return { error: `${missingField} is required.` }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(booking.email)) {
    return { error: 'Enter a valid email address.' }
  }
  if (!enquiryTypes.includes(booking.type)) {
    return { error: 'Select a valid enquiry type.' }
  }

  return { booking }
}

function detailRow(label, value) {
  if (!value) return ''
  return `<tr>
    <td style="padding:12px 16px;color:#8a8175;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #eee9e1;vertical-align:top;width:34%;">${escapeHtml(label)}</td>
    <td style="padding:12px 16px;color:#29251f;font-size:14px;line-height:1.6;border-bottom:1px solid #eee9e1;">${escapeHtml(value).replace(/\n/g, '<br>')}</td>
  </tr>`
}

function buildEmail(booking, attachment) {
  const projectLabel = booking.production || booking.type
  const subjectLabel = projectLabel.replace(/[\r\n]+/g, ' ').slice(0, 160)
  const rows = [
    ['Name', booking.name],
    ['Company / organisation', booking.company],
    ['Email', booking.email],
    ['Phone', booking.phone],
    ['Country', booking.country],
    ['Enquiry type', booking.type],
    ['Production / brand', booking.production],
    ['Proposed role', booking.role],
    ['Proposed dates', booking.dates],
    ['Budget / rate', booking.budget],
    ['Project description', booking.description],
    ['Message', booking.message],
    ['Attachment', attachment ? attachment.originalname : ''],
  ]
  const text = [
    'NEW BOOKING ENQUIRY',
    '',
    ...rows.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`),
  ].join('\n')
  const tableRows = rows.map(([label, value]) => detailRow(label, value)).join('')
  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
  <body style="margin:0;padding:32px 12px;background:#f4f1eb;font-family:Arial,Helvetica,sans-serif;color:#29251f;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">New ${escapeHtml(booking.type)} enquiry from ${escapeHtml(booking.name)}.</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:680px;margin:0 auto;background:#fff;border-collapse:collapse;">
      <tr>
        <td style="padding:32px 36px;background:#211f1b;color:#fff;">
          <p style="margin:0 0 12px;color:#c8a66a;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Hakeem · Management</p>
          <h1 style="margin:0;font-size:27px;line-height:1.25;font-weight:600;">New booking enquiry</h1>
          <p style="margin:10px 0 0;color:#d6d1c8;font-size:14px;line-height:1.5;">${escapeHtml(booking.type)}${booking.production ? ` · ${escapeHtml(booking.production)}` : ''}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:26px 36px 8px;">
          <p style="margin:0;color:#625b51;font-size:14px;line-height:1.7;">A new professional engagement enquiry has been submitted through the booking form. Reply directly to this email to contact ${escapeHtml(booking.name)}.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #eee9e1;border-collapse:collapse;">${tableRows}</table>
        </td>
      </tr>
      <tr>
        <td style="padding:18px 36px;background:#f8f6f2;color:#8a8175;font-size:11px;line-height:1.6;">
          Sent from the Hakeem bookings form. ${attachment ? 'The submitted document is attached to this email.' : 'No attachment was submitted.'}
        </td>
      </tr>
    </table>
  </body>
</html>`

  return {
    subject: `Booking enquiry: ${subjectLabel}`,
    text,
    html,
  }
}

app.post('/api/booking', (req, res, next) => {
  if (req.is('multipart/form-data')) {
    upload.single('attachment')(req, res, (error) => {
      if (error) return next(error)
      next()
    })
    return
  }
  next()
}, async (req, res) => {
  const { booking, error } = normalizeBooking(req.body || {})
  if (error) {
    res.status(400).json({ error })
    return
  }

  try {
    const message = buildEmail(booking, req.file)
    await getTransporter().sendMail({
      from: `"Hakeem Bookings" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: managementEmail,
      replyTo: booking.email,
      ...message,
      attachments: req.file ? [{
        filename: req.file.originalname.split(/[\\/]/).pop().replace(/[\r\n]/g, ''),
        content: req.file.buffer,
        contentType: req.file.mimetype,
      }] : [],
    })

    res.status(200).json({ message: 'Your booking enquiry has been sent successfully.' })
  } catch (error) {
    console.error('Unable to send booking enquiry:', error.message)
    const status = error.message.startsWith('Email service is not configured')
      || error.message.startsWith('SMTP_PORT')
      ? 503
      : 502
    res.status(status).json({
      error: status === 503
        ? 'Booking email is temporarily unavailable. Please try again later.'
        : 'We could not send your enquiry. Please try again later.',
    })
  }
})

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400
    res.status(status).json({
      error: error.code === 'LIMIT_FILE_SIZE'
        ? 'Attachment must be 8 MB or smaller.'
        : 'The form contains an invalid attachment or too many fields.',
    })
    return
  }

  if (error.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Request body must contain valid JSON.' })
    return
  }

  if (error.message === 'Attachment must be a PDF, DOC, DOCX, or TXT file.') {
    res.status(400).json({ error: error.message })
    return
  }

  console.error('Unexpected request error:', error)
  res.status(500).json({ error: 'An unexpected error occurred.' })
})

app.listen(port, () => {
  console.log(`Booking email API listening on port ${port}`)
})

module.exports = { app, buildEmail, normalizeBooking }