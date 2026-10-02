const assert = require('node:assert/strict')
const test = require('node:test')
const nodemailer = require('nodemailer')

const sentEmails = []
process.env.SMTP_HOST = 'smtp.example.test'
process.env.SMTP_PORT = '465'
process.env.SMTP_USER = 'sender@example.test'
process.env.SMTP_PASS = 'test-password'
nodemailer.createTransport = () => ({
  sendMail: async (message) => {
    sentEmails.push(message)
    return { messageId: 'test-message' }
  },
})

const { app, buildEmail, normalizeBooking } = require('./server')

const validSubmission = {
  name: 'Amina Example',
  company: 'Example Productions',
  email: 'amina@example.com',
  type: 'Film & television',
  message: 'Please consider Hakeem for the lead role.',
}

test('booking validation requires the form fields and a valid enquiry type', () => {
  assert.match(normalizeBooking({}).error, /name is required/)
  assert.match(
    normalizeBooking({ ...validSubmission, email: 'not-an-email' }).error,
    /valid email address/,
  )
  assert.match(
    normalizeBooking({ ...validSubmission, type: 'Not an enquiry type' }).error,
    /valid enquiry type/,
  )
  assert.deepEqual(normalizeBooking(validSubmission).booking.name, validSubmission.name)
})

test('booking email has a styled HTML version and safe plain-text details', () => {
  const normalized = normalizeBooking({
    ...validSubmission,
    production: 'Project\nTitle',
    description: '<script>alert("x")</script>',
    message: 'First line\nSecond line',
  })
  const email = buildEmail(normalized.booking, { originalname: 'proposal.pdf' })

  assert.equal(email.subject, 'Booking enquiry: Project Title')
  assert.match(email.html, /background:#211f1b/)
  assert.match(email.html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/)
  assert.doesNotMatch(email.html, /<script>/)
  assert.match(email.html, /First line<br>Second line/)
  assert.match(email.html, /proposal\.pdf/)
  assert.match(email.text, /Message: First line\nSecond line/)
})

test('booking endpoint returns a useful validation error for an incomplete request', async (t) => {
  const server = app.listen(0)
  t.after(() => new Promise((resolve) => server.close(resolve)))
  await new Promise((resolve) => server.once('listening', resolve))

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/booking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'name is required.' })
})

test('booking endpoint emails a multipart enquiry and its attachment', async (t) => {
  const server = app.listen(0)
  t.after(() => new Promise((resolve) => server.close(resolve)))
  await new Promise((resolve) => server.once('listening', resolve))

  const form = new FormData()
  for (const [field, value] of Object.entries(validSubmission)) {
    form.append(field, value)
  }
  form.append('attachment', new Blob(['sample script'], { type: 'application/pdf' }), 'script.pdf')

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/booking`, {
    method: 'POST',
    body: form,
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    message: 'Your booking enquiry has been sent successfully.',
  })
  assert.equal(sentEmails.length, 1)
  assert.equal(sentEmails[0].replyTo, validSubmission.email)
  assert.equal(sentEmails[0].attachments[0].filename, 'script.pdf')
  assert.match(sentEmails[0].html, /New booking enquiry/)
})
